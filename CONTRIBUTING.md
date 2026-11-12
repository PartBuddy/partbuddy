# Contributing

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 26.13.1 (LTS) | JavaScript runtime; `.node-version` and `devEngines` pin it |
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
4. Open a pull request with a Conventional Commits title. `main` accepts changes only through pull
   requests with passing checks; they are squash-merged, so the title becomes the commit message.
5. Releases and `CHANGELOG.md` are produced by release-please from the commit history.

## Desktop app

```sh
pnpm --filter @partbuddy/desktop dev        # Electron with hot reload
pnpm --filter @partbuddy/desktop build      # bundle into apps/desktop/out
pnpm --filter @partbuddy/desktop test:e2e   # Electron flows against a fake SolidCraft
pnpm --filter @partbuddy/desktop dist       # Windows installer in apps/desktop/dist (B10)
pnpm --filter @partbuddy/desktop dist:mac   # macOS dmg (universal, signed ad hoc); runs on a Mac only, see installer.yml
```

The app finds a running SolidCraft through its control folder, or starts `solidcraft --control 7878`
and closes that instance again on quit. CI has no SolidCraft; the flows use the fake control server
in `apps/desktop/test/fakeSolidCraft.ts`. With SolidCraft installed and a design open, set
`PARTBUDDY_E2E_SOLIDCRAFT=1` to run the contract tests against the real app as well; this includes the
live-view latency test, which builds the synthetic cable clip step by step in an own SolidCraft window.

| Variable | Effect |
| --- | --- |
| `PARTBUDDY_SOLIDCRAFT_PORT` | Control port used when PartBuddy starts SolidCraft (default 7878) |
| `PARTBUDDY_SOLIDCRAFT_EXE` | Path of the SolidCraft executable, if it is not in Program Files or on `PATH` |
| `PARTBUDDY_START_PAGE` | `0` starts in the work area with the last project instead of on the start page; the E2E launcher sets it, the start page tests turn it back on |
| `PARTBUDDY_SOLIDCRAFT_AUTOSTART=0` | Never start SolidCraft automatically |
| `PARTBUDDY_CACHE_DIR` | Folder for mirrored exports (default `%LOCALAPPDATA%\PartBuddy\cache\mirror`) |
| `PARTBUDDY_CLAUDE_COMMAND` | JSON array that replaces the Claude Code program, for tests (`["node", "test/fakeClaude.mjs"]`) |
| `PARTBUDDY_E2E_CLAUDE=1` | Also run the contract test in which your Claude Code builds a part; it spends subscription usage |
| `PARTBUDDY_E2E_CHATGPT=1` | Run the live ChatGPT tests: the first run opens the browser to sign in; they spend ChatGPT plan usage |
| `PARTBUDDY_KEYRING_SERVICE` | Credential-store service name (default `PartBuddy`); the Electron tests use their own |
| `SOLIDCRAFT_CONTROL_DIR` | SolidCraft's own setting for its control folder; PartBuddy reads the same folder |
| `PARTBUDDY_FIRST_START` | `0` never shows the first-start setup; the E2E launcher sets it |
| `PARTBUDDY_PROJECTS_DIR` | The project folder, instead of the setting or `Documents\PartBuddy` |
| `PARTBUDDY_UPDATES=0` | The installed app does not look for updates |
| `PARTBUDDY_E2E_PACKAGED=1` | Run the smoke test of the packaged app after `dist:dir` or `dist` |

### Installer and releases

`dist` builds the NSIS installer `PartBuddy-Setup-<version>.exe` with `latest.yml` (electron-builder,
`apps/desktop/electron-builder.yml`): per user, with Start menu and desktop shortcuts, unsigned for
now, so SmartScreen warns until code signing comes before the public release. The installed app
looks for updates in the GitHub releases (electron-updater) and installs them only on the user's
word. The CI runners are Linux, so a release is built on Windows: after release-please's release
exists, run `dist` and upload the installer, its `.blockmap` and `latest.yml` to that release
(`gh release upload v<version> apps/desktop/dist/PartBuddy-Setup-<version>.exe
apps/desktop/dist/PartBuddy-Setup-<version>.exe.blockmap apps/desktop/dist/latest.yml`).

## Licence of contributions

PartBuddy is free software under GPL-3.0-or-later ([ADR 0007](docs/adr/0007-licensing-model.md)).
Contributions are accepted under the same licence. External contributors sign off each commit
(`git commit -s`) to confirm the [Developer Certificate of Origin](https://developercertificate.org/).

## Rules for content

- Code, identifiers, commits and documentation are written in English. The user interface is
  localised (German and English) from the start.
- Never commit personal data, absolute local paths, secrets, `.env` files, build output or
  generated print and render files. Test geometry is synthetic (`tools/fixtures/`).
- Content taken over from other sources is recorded in `docs/provenance.md`.
- New dependencies: exact version, licence compatible with GPL-3.0-or-later (licence gate), entry in
  `docs/building-blocks.md`. Own implementations of components need an ADR in `docs/adr/`.
- UI code uses design tokens only (`packages/design-tokens`), no literal colours or spacings.
