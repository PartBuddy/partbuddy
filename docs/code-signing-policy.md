# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

This applies to the Windows installer of PartBuddy (`PartBuddy-Setup-<version>.exe`) and the
program files in it, from the first release signed this way. Earlier releases are unsigned.

## What is signed

Only what is built from this repository: the installer and PartBuddy's own executable. Each signed
file is built by a GitHub Actions workflow of this repository on a GitHub-hosted runner, from a
release tag on `main`; SignPath verifies that origin for every build. Libraries of other projects
that the installer contains (Electron and the npm packages listed in `THIRD-PARTY-NOTICES.txt`)
keep the signatures their own projects gave them, or none.

SolidCraft, the assistants (Claude Code, ChatGPT, local model servers) and the slicers are not part
of PartBuddy and not in its installer; you install them yourself.

## Team roles

- Committers and reviewers: [ManuelStaggl](https://github.com/ManuelStaggl), the maintainer. Every
  change reaches `main` through a pull request with the required checks; changes proposed by others,
  including the dependency updates Renovate opens, are reviewed by the maintainer before they are
  merged.
- Approvers: [the owners of the PartBuddy organization](https://github.com/orgs/PartBuddy/people?query=role%3Aowner).
  Every signing request is approved by hand, once per release.

All of them use multi-factor authentication on GitHub and on SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically
requested by the user or the person installing or operating it.

What it does on request:

- **The assistant you choose.** What you write in the chat, and what the assistant reads of your
  design to answer, goes to the assistant you set up: your own Claude or ChatGPT subscription, under
  that provider's privacy policy, or a model server on your own computer. PartBuddy has no server of
  its own in between.
- **Research.** When you allow the assistant to search the web for a part, its searches go through
  that same provider.
- **Updates.** PartBuddy asks GitHub for the newest release of this repository and downloads it from
  there. You can turn the check off in the settings.

PartBuddy has no account, no telemetry and no crash reporting. Projects are folders on your
computer, and sign-ins are kept in the Windows credential store.

## Uninstalling

Windows Settings → Apps → PartBuddy → Uninstall, or the uninstaller in the installation folder. Your
projects and settings stay unless you delete them.

## Reporting a problem

If you think a signed file of PartBuddy violates this policy, see [SECURITY.md](../SECURITY.md), or
report it to SignPath Foundation as its [terms](https://signpath.org/terms) describe.
