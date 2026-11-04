# Contributing

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 26.13.0 (LTS) | JavaScript runtime; `.node-version` and `devEngines` pin it |
| pnpm | 12.16.1 | Package manager; `packageManager` in `package.json` pins it |
| uv | 0.10.3 or newer | Python environments for `tools/` |
| gitleaks | 8.30.1 | Secret and privacy scan in the pre-commit hook |
| Git LFS | current | CAD fixtures (`*.step`, `*.glb`) |

On Windows: `winget install --id Gitleaks.Gitleaks --version 8.30.1 --exact`.

## Setup

```sh
pnpm install          # also installs the Git hooks (lefthook)
```

The pre-commit hook needs a personal denylist outside the repository. Create
`.git/info/gitleaks-personal.toml` with rules for your own name, account name, host name and
e-mail address (format: [gitleaks configuration](https://github.com/gitleaks/gitleaks#configuration),
`[[rules]]` with `id`, `description`, `regex`). The hook blocks every commit until the file exists.
The same rules are stored in the repository secret `PRIVACY_DENYLIST` for CI.

Use your GitHub noreply address as commit e-mail and sign commits:

```sh
git config user.email "<id>+<login>@users.noreply.github.com"
git config gpg.format ssh
git config user.signingkey <path-to-your-public-key>
git config commit.gpgsign true
```

## Workflow

1. Create a branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`.
2. Commit in small, focused steps using [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `build:`, `ci:`, `test:`, `refactor:`, `chore:`). The commit-msg hook
   checks this.
3. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before pushing.
4. Open a pull request. `main` accepts changes only through pull requests with passing checks and a
   linear history (rebase merge).
5. Releases and `CHANGELOG.md` are produced by release-please from the commit history.

## Rules for content

- Code, identifiers, commits and documentation are written in English. The user interface is
  localised (German and English) from the start.
- Never commit personal data, absolute local paths, secrets, `.env` files, build output or
  generated print and render files. Test geometry is synthetic (`tools/fixtures/`).
- Content taken over from other sources is recorded in `docs/provenance.md`.
- New dependencies: exact version, licence checked for commercial distribution, entry in
  `docs/building-blocks.md`. Own implementations of components need an ADR in `docs/adr/`.
- UI code uses design tokens only (`packages/design-tokens`), no literal colours or spacings.
