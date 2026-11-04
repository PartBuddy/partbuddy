# GitHub setup

Settings that cannot live as files in the repository. They are applied once by
[`tools/github/setup.sh`](../tools/github/setup.sh) after the product owner approves the repository
name and the first push. Nothing here has been applied yet.

## Plan and gaps

The repository is private and owned by a personal account. Availability checked on
docs.github.com on 2026-11-04 ([research § 7](research.md#7-github-features-on-a-private-personal-repository)):

| Feature | Free | Pro | Used here |
| --- | --- | --- | --- |
| Rulesets / branch protection (required checks, linear history, signed commits) | no | yes | yes, needs Pro |
| Environment secrets and deployment branch policies | no | yes | `release` environment, needs Pro |
| Required reviewers on environments | no | no | not available; signing runs only from tags |
| CODEOWNERS enforcement | no | yes | file present; enforcement with Pro |
| Dependency graph, Dependabot alerts | yes | yes | alerts on (version updates by Renovate) |
| Code scanning (CodeQL) | no | no | replaced by typescript-eslint strict rules, zizmor, actionlint |
| Secret scanning and push protection | no | no | replaced by gitleaks (hook and CI) |
| Dependency review action | no | no | replaced by `pnpm audit` and the licence gate |
| Private vulnerability reporting | no | no | issues with label `type: security` until a public channel exists |
| GitHub Projects | yes | yes | one board |
| Actions minutes per month | about 2,000 Linux | about 3,000 Linux | Windows builds count double |

The repository becomes public once the MVP runs ([ADR 0007](adr/0007-licensing-model.md)). Public
repositories get rulesets, CodeQL, secret scanning with push protection, dependency review and
private vulnerability reporting free of charge; the setup script is then re-run for the ruleset and a
CodeQL workflow is added.

## Before running the script

1. Decide the product and repository name.
2. Plan: Free for now (decided 2026-11-04; the script's default `free` skips the environment and the
   ruleset, the rules stay a documented convention). Re-run steps 6 and 9 with `public` once the
   repository is public, or with `pro` after upgrading.
3. Optional: `gh auth refresh -s project,admin:ssh_signing_key` for the project board and the signing
   key (one browser confirmation); without it these steps are skipped with a hint.
4. Make sure the personal denylist exists locally (`.git/info/gitleaks-personal.toml`).
5. If the repository name differs from `cad-studio`, update the package names and the issue-form
   link in one commit before pushing.

## What the script does

| Step | Setting |
| --- | --- |
| 1 | Create the private repository `ManuelStaggl/<name>` with description; wiki off |
| 2 | Merge settings: rebase merge only, delete branches after merge, no auto-merge |
| 3 | Secret `PRIVACY_DENYLIST` from the local denylist (used by `privacy.yml`) |
| 4 | Labels for type, status and area (issue forms use `type: bug`, `type: feature`, `status: triage`) |
| 5 | Milestones "Phase 2: MVP foundation" and "MVP 0.1.0" |
| 6 | Environment `release`, deployable only from tags `v*`; signing secrets go here later |
| 7 | Dependabot alerts on; SSH signing key registered so signed commits show as verified |
| 8 | Push `main` and Git LFS objects |
| 9 | Ruleset for `main`: no deletion, no force push, linear history, signed commits, pull request with resolved threads and rebase merge, required checks |

Required status checks (names of the CI jobs): "Lint, typecheck, test, build",
"Click dummy flows (Playwright)", "Scan full history", "Workflow security (zizmor)",
"Vulnerabilities and licences". `actionlint` runs only when workflows change and
`commitlint` only on pull requests, so they are not required checks; both still block by failing.

## Manual steps after the script

* **Renovate:** install the Renovate GitHub App for this repository only, or run Renovate
  self-hosted in a scheduled workflow with a fine-grained token. The hosted app reads the private
  code; the self-hosted variant keeps it on GitHub's runners.
* **Project board:** `gh project create --owner ManuelStaggl --title "<name>"`, then link the
  repository in the project settings and add views "Board" (by status) and "Roadmap" (by milestone).
* **Security policy:** set up a public reporting channel before the first public release.
* **Signing certificate:** when the first installer is built, store the code-signing credentials as
  secrets of the `release` environment only.

## Verification after setup

```bash
gh api repos/ManuelStaggl/<name> --jq '{private, allow_rebase_merge, allow_squash_merge, delete_branch_on_merge}'
gh api repos/ManuelStaggl/<name>/rulesets --jq '.[].name'
gh secret list --repo ManuelStaggl/<name>
gh label list --repo ManuelStaggl/<name>
```
