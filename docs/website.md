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

**The "New in" card** on the homepage comes from a `## What's new` section in the newest release's
notes. It is written by hand in `site/whats-new.md`, whose first line names the version (`<!-- v0.3.9 -->`).
Before the release pull request is merged, update that file in a pull request of its own: bold titles, a
sentence each, only what the release really brings, optionally `<!-- shot: name -->` for a picture from
`src/assets/shots`. The job *Publish the release* puts the section into the draft's notes and refuses to
publish while the file names another version; the release then stays a draft (installed apps see nothing)
until the file is fixed on main and the job is re-run.

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
  The pictures need the SolidCraft the app is tested on (0.40.1 or newer): the one installed in
  `C:\Program Files\SolidCraft`, which `SOLIDCRAFT_EXE` in `site-sync.yml` names and `pnpm site:shots` takes locally.
