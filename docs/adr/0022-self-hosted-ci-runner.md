---
status: accepted
date: 2026-11-05
---

# CI on a self-hosted runner in WSL2

## Context and Problem Statement

The repository is private on GitHub Free, which includes about 2,000 Linux minutes of Actions per
month. In the first four days of November 2026 PartBuddy used about 900 of them: every push to a
pull request starts seven jobs, each billed as at least one full minute, and every merge ran CI,
privacy and security checks again on `main`. That is about 7,000 minutes a month. The product owner
does not want to pay for minutes. A `$0` budget stops the charges, but then CI stops too, and
pull requests are merged only after green checks.

## Considered Options

* A self-hosted runner on the development PC, inside a WSL2 distribution of its own
* Checks only on the PC, reported to GitHub as commit statuses by a local script
* Slimming the hosted workflows and staying within 2,000 minutes

## Decision Outcome

Chosen option: **a self-hosted runner in WSL2**. Self-hosted runners do not draw from the included
compute usage (docs.github.com, Actions billing, checked 2026-11-05; the per-minute platform fee
for self-hosted runners announced for March 2026 was postponed in January 2026 and is not in the
billing docs). The workflows stay almost unchanged because they already run on Ubuntu with `xvfb`.
Slimming alone cannot cut 7,000 minutes to 2,000, and a local status script would test on Windows
instead of a clean Linux environment.

* `tools/runner/setup-runner.ps1` imports Ubuntu 24.04 (checksum verified) as the distribution
  `partbuddy-runner`, runs `provision.sh` as root and registers four runner instances
  (`partbuddy-wsl-1` to `-4`, label `partbuddy`), so the seven jobs of a push run in parallel.
  Each instance has its own workspace and its own port for the click dummy (`CLICKDUMMY_PORT`
  5180 to 5183 in the instance's `.env`). The registration token goes through stdin into
  `ACTIONS_RUNNER_INPUT_TOKEN`, never onto a command line.
* Isolation: jobs run as the user `runner` without sudo. `/etc/wsl.conf` turns off the Windows
  drive mounts, starting Windows programs and the Windows `PATH`, and systemd. `.wslconfig` caps the
  VM at 20 GB and 16 of the 28 logical processors, keeps ports inside WSL and turns off WSLg, so
  Electron under test never opens a window on the desktop.
* Load: while idle, only the listener waits for jobs (no CPU, a few hundred MB for the VM). A
  desktop shortcut "PartBuddy-Runner" starts or stops it; stopped, the distribution is terminated
  and uses nothing. A shortcut in the Startup folder starts it at sign-in. GitHub holds jobs while
  the runner is off and cancels them after 24 hours in the queue.
* Notification: a job-completed hook (`ACTIONS_RUNNER_HOOK_JOB_COMPLETED`) writes one line per
  finished job to `job-events.log`. `tools/runner/watch-pr-checks.sh` follows that file from
  Windows and, right after a pull request's job finished, asks GitHub whether all checks are done;
  it prints one line per head commit, green or red. Claude Code runs it with its Monitor tool, so a
  green pull request is merged without anyone having to look.
* Workflows: `runs-on: [self-hosted, partbuddy]`. Every checkout fetches Git LFS files. System
  libraries, `xvfb` and Git LFS come with the runner, so the `sudo` steps are gone; the pnpm store, Node.js, Playwright's Chromium and Electron
  stay cached on the runner. CI, privacy and security checks no longer run again on `main` after a
  squash merge, because the pull request already checked the merge result. The weekly privacy and
  security scans stay on GitHub-hosted runners so they run while the PC is off.

### Consequences

* Good: no Actions minutes for pull requests; runs are faster on a 20-core machine.
* Good: jobs cannot reach Windows files or programs from inside the distribution.
* Bad: the PC must be on for checks to run.
* Bad: dependency updates (Renovate) execute on the PC. Install scripts run only for allowed
  packages (`allowBuilds`) and versions must be seven days old (`minimumReleaseAge`); the
  distribution has no access to Windows.
* Bad: Ubuntu packages and the runner need updates. `provision.sh` runs `full-upgrade` and may be run
  again at any time; the runner updates itself.
* **When the repository becomes public (ADR 0007), switch back to GitHub-hosted runners**: there
  they are free, and a self-hosted runner would run code from pull requests of strangers on the PC.
  `tools/runner/uninstall-runner.ps1` removes everything.
