# Security policy

## Reporting a vulnerability

Report a vulnerability in private through
[GitHub's private vulnerability reporting](https://github.com/PartBuddy/partbuddy/security/advisories/new),
not as a public issue.

Include the affected version, the steps to reproduce and the impact you expect. Remove personal
data, API keys and model files from logs before attaching them.

We acknowledge reports within five working days and agree on a disclosure date with you once a
fix is available.

## Supported versions

The project is in pre-release development. Until version 1.0.0 only the latest release receives
security fixes.

## Security principles

- API keys of users are stored only in the operating system's credential store (Windows Credential
  Manager / DPAPI for the current user), never in plain text, never in logs or crash reports.
- AI providers, local model servers and the CAD kernel are reached only through endpoints the user
  configured. Tool calls of the assistant are validated against schemas and pass the same check
  gates as manual actions.
- Dependencies are pinned to exact versions with lockfile integrity hashes; GitHub Actions are
  pinned to commit SHAs. Dependency updates wait seven days after release.
- Every commit is scanned for secrets and personal data locally (pre-commit hook) and in CI.
