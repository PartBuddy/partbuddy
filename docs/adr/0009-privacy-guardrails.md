---
status: accepted
date: 2026-11-04
---

# Keep personal data out of the repository with an allow-list and three scan layers

## Context and Problem Statement

CAD-Studio grows out of a private CAD workspace that contains personal projects, calibration data,
memory files, local paths and AI tool configuration. None of it may enter the product repository,
and the history must stay clean once it is pushed. How is this guaranteed?

## Considered Options

* Allow-list approach plus gitleaks in three layers (ignore rules, pre-commit hook, CI)
* Copy the workspace and clean it up
* Manual review before each push

## Decision Outcome

Chosen option: "Allow-list plus gitleaks in three layers", because it blocks mistakes before they
become history and uses a proven scanner instead of own code.

1. **Allow-list instead of clean-up.** The repository starts empty. Only files written for the
   product are added. Any content taken over from the earlier workspace is rewritten and recorded
   in [provenance](../provenance.md).
2. **Ignore rules** (`.gitignore`) for dependencies, build output, secrets, local AI tool files and
   personal CAD data, in the first commit. Local tool files of the developers are additionally
   excluded in `.git/info/exclude`.
3. **Pre-commit hook** (lefthook) runs gitleaks 8.30.1 on staged changes with
   * the repository rules (`.gitleaks.toml`): default credential rules, user-profile paths on
     Windows, macOS and Linux, absolute Windows paths outside standard install locations, e-mail
     addresses except noreply and documentation examples;
   * a personal denylist outside the repository (`.git/info/gitleaks-personal.toml`) for names,
     account names and host names. Personal terms never appear in the repository itself.
   The hook fails closed: a missing scanner or missing denylist blocks the commit.
4. **CI** (`privacy.yml`) scans the full history with both rule sets on every pull request, on
   `main` and weekly. The denylist comes from the repository secret `PRIVACY_DENYLIST`.

Commits use the GitHub noreply address and are signed. Test geometry is synthetic
(`tools/fixtures`).

### Consequences

* Good, because personal data is caught at the first commit, not in review.
* Bad, because every developer maintains a local denylist; the hook refuses to run without it.
* Neutral: legitimate absolute paths in product code (for example the default SolidCraft install
  location) are limited to standard install folders, which the rule allows.

### Confirmation

Phase 1 verification (2026-11-04): a test file with a Windows user-profile path and an e-mail
address was staged; the pre-commit hook reported three findings (user-profile path, absolute path,
e-mail address) and blocked the commit. The file was removed afterwards. The full-history scans with
both rule sets run before the first push and in CI on every pull request.
