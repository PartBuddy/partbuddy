---
status: accepted
date: 2026-11-04
---

# Pull requests to a protected main, squash merges, Conventional Commits and release-please

## Context and Problem Statement

The repository must look and work like a maintained product from the first commit: small focused
commits, reviewable changes, automated releases with a changelog, pinned dependencies and a supply
chain that can be audited for the EU Cyber Resilience Act. The repository is private and owned by a
personal GitHub account. Which process and which tools achieve this?

Evidence: [research § GitHub features](../research.md#7-github-features-on-a-private-personal-repository).

## Considered Options

* Protected `main`, rebase merges, Conventional Commits checked by commitlint, release-please
* Changesets for versioning
* semantic-release
* Direct pushes to `main` with tags

## Decision Outcome

Chosen option: "Protected `main` with release-please", because release-please derives versions and
the changelog from Conventional Commits that are already enforced, and its release pull request
keeps every release reviewable.

* **Branching:** short-lived branches, pull requests into `main`, squash merge only (linear
  history, one signed commit per pull request, its message is the Conventional Commits title of the
  pull request), signed commits on branches, branch deletion after merge. Rebase merges were used
  first and dropped on 2026-11-04: GitHub rewrites rebased commits without a signature, which
  breaks the signed-history rule. Rulesets need GitHub Pro (or a paid
  organisation plan) for private repositories; see [GitHub setup](../github-setup.md).
* **Commits:** Conventional Commits, checked locally (lefthook commit-msg hook) and in CI
  (`commitlint.yml`). Author e-mail is the GitHub noreply address.
* **Releases:** release-please (`release-please.yml`) opens a release pull request with version and
  `CHANGELOG.md`; merging it tags the release. SemVer, with `0.x` minors for breaking changes until
  1.0.0. Installer builds and signing join the release workflow with the application code; signing
  secrets live only in the protected `release` environment.
* **Dependencies:** exact versions, lockfiles with integrity hashes, releases at least seven days
  old (pnpm `minimumReleaseAge`, Renovate `minimumReleaseAge`), Actions pinned to commit SHAs,
  downloaded tools verified by SHA-256.
* **Checks on every pull request:** lint, typecheck, unit tests, build, Playwright flows, privacy
  scan of the full history, actionlint, zizmor, commitlint, `pnpm audit`, licence gate.
  CodeQL, dependency review and GitHub secret scanning are not available for private repositories of
  personal accounts; the open-source checks above cover these risks until the repository becomes
  public at the MVP (ADR 0007), when these GitHub features are free.
* **Updates:** Renovate (configured in `renovate.json`). Dependabot version updates were rejected
  because they do not read the two-document lockfile that pnpm 12 writes when it pins its own version.
* **SBOM:** `pnpm sbom` (CycloneDX) per release, attached to the GitHub release (with the
  application code).

### Consequences

* Good, because every change is traceable from commit to release note.
* Bad, because branch protection on a private repository needs a paid plan; until then the rules
  are a documented convention.
* Neutral: release-please is used by few of the compared desktop projects (most use custom release
  workflows); it was chosen for its fit with Conventional Commits, not for popularity.

## Pros and Cons of the Options

### Changesets

* Bad, because it adds a second commit-time artefact (changeset files) on top of Conventional
  Commits; it pays off for many independently published packages, which this product does not have.

### semantic-release

* Bad, because it releases on every qualifying push without a reviewable release pull request.

### Direct pushes

* Bad, because nothing enforces the checks before a change lands.
