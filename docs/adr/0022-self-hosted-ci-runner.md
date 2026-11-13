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
  and uses nothing. A shortcut in the Startup folder starts it at sign-in. The control script lives
  in `%USERPROFILE%\.partbuddy\runner`, not in AppData: run from an MSIX-packaged app such as the
  Claude desktop app, the setup's writes to AppData land in the app's private package folder, where
  Explorer and the shortcuts never see them. GitHub holds jobs while
  the runner is off and cancels them after 24 hours in the queue.
* Lifetime: the four listeners live only as long as the hidden `wsl.exe` that runs
  `start-listener.sh`. The control script first started it with `Start-Process`, which made it a
  child of the caller and a member of the caller's job object. On 2026-11-05 a Claude Code session
  ran `-Action Start -Quiet`; when that session's process tree was torn down, `wsl.exe` went with
  it, all four `Runner.Listener` processes ended without a log line, GitHub showed the runners
  offline and pull request checks stayed pending. The autostart was not affected, because Explorer
  outlives the sign-in. The control script now creates `wsl.exe` through WMI
  (`Win32_Process.Create` with `Win32_ProcessStartup.ShowWindow = 0`): its parent is `WmiPrvSE`,
  it belongs to no job of the caller, and no window appears. This needs no scheduled task or other
  system configuration. Verified by starting the runners from a shell inside a kill-on-close job
  object, ending that job and its tree with `taskkill /T`: all four runners stayed online.
* Notification: a job-completed hook (`ACTIONS_RUNNER_HOOK_JOB_COMPLETED`) writes one line per
  finished job to `job-events.log`. `tools/runner/watch-pr-checks.sh` follows that file from
  Windows and, right after a pull request's job finished, asks GitHub whether all checks are done;
  it prints one line per head commit, green or red. Claude Code runs it with its Monitor tool, so a
  green pull request is merged without anyone having to look.
* Workflows: `runs-on: [self-hosted, partbuddy]`. Every checkout fetches Git LFS files, and pnpm
  is installed into each instance's tool cache (the default `~/setup-pnpm` is shared). System
  libraries, `xvfb` and Git LFS come with the runner, so the `sudo` steps are gone; the pnpm store, Node.js, Playwright's Chromium and Electron
  stay cached on the runner. CI, privacy and security checks no longer run again on `main` after a
  squash merge, because the pull request already checked the merge result. The weekly privacy and
  security scans stay on GitHub-hosted runners so they run while the PC is off.

### Update 2026-11-06: the runner moved to the home server

Development, the runner and the Claude Code sessions moved from the gaming PC to the home server
(Windows Server 2025, i7-14700T with 28 logical processors, 32 GB, also hosting other services), so
the PC stays free and work can go on at night.

* `setup-runner.ps1 -RunnerName partbuddy-srv -NoAutostart` registered `partbuddy-srv-1` to `-4`;
  the PC's `partbuddy-wsl-*` were removed with `uninstall-runner.ps1`.
* `.wslconfig` on the server is written by hand (the script then leaves it alone) and caps the VM at
  12 GB and 14 processors, leaving room for the server's other services.
* Start at boot without sign-in instead of the Startup folder: a scheduled task `PartBuddy-Runner`
  (trigger at startup with one minute delay, the developer's account with logon type S4U, no stored
  password) runs `runner-control.ps1 -Action Start -Quiet`. Checked by stopping the runners and
  starting the task: `wsl.exe` runs in session 0 and all four runners came back online.
* The test version for the product owner is built on the server and copied to the PC by
  `tools/test-app/deliver-test-app.ps1` (electron-builder `--dir`, no link into a repository); it
  skips the delivery while the PC is off or the test version runs.

### Update 2026-11-13: more room for the VM, a lighter pull request CI, contract tests on demand

* `.wslconfig` on the server caps the VM at 16 GB and 20 of the 28 logical processors since
  the evening of 2026-11-13 (before: 12 GB and 14; the earlier file is kept as `.wslconfig.bak-2026-11-13`).
  Ports stay inside WSL, WSLg stays off. The four runners `partbuddy-srv-1` to `-4` share that VM.
* Pull requests run only the jobs their change can affect (#376): a job "What the change touches"
  diffs the merge commit against the base branch and `tools/ci/changes.sh` decides; the other jobs
  show as skipped. A documentation-only pull request runs four jobs of about 20 s. The desktop app
  flows run as two Playwright shards, shard 1 with two workers and shard 2 with one, so three apps
  run at once; six apps ran little faster and tipped over when anything else loaded the server.
  Lint runs beside typecheck and the unit tests. The whole pull request CI took 5.4 minutes instead
  of 14.9 when every job ran (measured on #376, still with the VM at 14 processors and 12 GB).
* The SolidCraft contract tests (`contract.yml`) run on demand, one run at a time, on a second
  self-hosted runner: `partbuddy-srv-shots`, a Windows service on the server with the labels
  `self-hosted`, `windows`, `partbuddy-shots` and the installed SolidCraft ([website](../website.md),
  setup). They are their own Playwright project with `retries: 1`, so a wobble shows as flaky, and
  stay on one worker (two workers failed tests while the server ran at 90–100 % CPU). The input
  `only` passes a title pattern to `--grep` (`gh workflow run contract.yml -f only='…'`).
* The repository is public (checked 2026-11-13) and the pull request CI still runs on these
  runners. GitHub asks for approval before workflow runs of first-time contributors only
  (`fork-pr-contributor-approval`: `first_time_contributors`). The switch named under Consequences
  is open.

### Consequences

* Good: no Actions minutes for pull requests; runs are faster on a 20-core machine.
* Good: jobs cannot reach Windows files or programs from inside the distribution.
* Bad: the home server must be on for checks to run (it runs around the clock).
* Bad: dependency updates (Renovate) execute on the server. Install scripts run only for allowed
  packages (`allowBuilds`) and versions must be seven days old (`minimumReleaseAge`); the
  distribution has no access to Windows.
* Bad: Ubuntu packages and the runner need updates. `provision.sh` runs `full-upgrade` and may be run
  again at any time; the runner updates itself.
* **When the repository becomes public (ADR 0007), switch back to GitHub-hosted runners**: there
  they are free, and a self-hosted runner would run code from pull requests of strangers on the PC.
  `tools/runner/uninstall-runner.ps1` removes everything.
