# Website

The website <https://partbuddy.github.io> lives in `PartBuddy/partbuddy.github.io` (Astro). Its product
facts, releases and pictures come from this repository; nothing is kept twice.

| What | Source here | Arrives there |
|---|---|---|
| Works-with list, homepage chapters, workspace tiles, standards, models, roadmap | `site/site-content.json` (schema: `site/site-content.schema.json`) | `src/data/site-content.json`, via pull request |
| Version, date, changelog, download link | GitHub releases (release-please) | read at build time; snapshot `src/data/releases.json` via pull request |
| Screenshots | `pnpm site:shots` (`apps/desktop/e2e/site-shots.spec.ts`) | `src/assets/shots/`, via pull request after a release |
| Hero film | produced by hand; `pnpm site:film` is called once it exists | `src/assets/shots/hero.mp4` |

`.github/workflows/site-sync.yml` (script: `tools/site-sync.mjs`):

- **On a change of `site/` on main:** copies the content and the release snapshot and opens or updates
  the pull request `site-sync/content` in the website repository. Its build check runs `astro check`,
  which fails if a field is missing.
- **After a release** (called from `release-please.yml`, since releases made with `GITHUB_TOKEN` start
  no other workflows): the same, plus a `repository_dispatch` (`partbuddy-release`) that redeploys the
  website at once, plus the job `media`, which renders the screenshots and opens `site-sync/media`.

Only what the app does today goes into `site/site-content.json`. Check a change before merging with
`node tools/site-sync.mjs content ../partbuddy-web`, then `npm run build` there.

## Setup (once)

- **`SITE_REPO_TOKEN`** (secret here): fine-grained token, resource owner PartBuddy, repository
  `PartBuddy/partbuddy.github.io` only, permissions *Contents: read and write*, *Pull requests: read and
  write*. Used to push the sync branches, open the pull requests and send the dispatch.
- **`PARTBUDDY_RELEASES_TOKEN`** (secret in the website repository): fine-grained token, repository
  `PartBuddy/partbuddy` only, *Contents: read*. Needed only while this repository is private; without
  it the website build uses the snapshot.
- **Windows runner for `media`:** a self-hosted runner on Windows with SolidCraft installed, labels
  `self-hosted`, `windows`, `partbuddy-shots`. Without it the `media` job waits in the queue; the
  content sync and the redeploy work regardless.
  On this server it is `partbuddy-srv-shots` (folder `Runner\partbuddy-shots` on the system drive), a Windows service running as
  NetworkService (an exception to ADR 0022, since SolidCraft runs only on Windows). On a German Windows,
  `config.cmd --runasservice` writes the account as `NT-AUTORITÄT\Netzwerkdienst` and the service then fails
  with error 1068; fix: `sc.exe config <service> obj= "NT AUTHORITY\NetworkService" password= ""`.
  Remove it with `config.cmd remove --token <removal token>`.
