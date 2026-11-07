# Project management 2027

Plan for bringing PartBuddy's project, version and multi-part handling to the level users know from
current CAD tools, without leaving the local, account-free model ([ADR 0007](../adr/0007-licensing-model.md),
B2–B5 in the [feature catalog](../feature-catalog.md)). Written 2026-11-07. Product decisions from the
product owner on the same day: tags and favourites instead of folders, an own recycle bin inside
PartBuddy, the parts list in the structure tree.

## 1 Today

**Data model.** One folder per project directly in the project folder (`Documents\PartBuddy` by
default): `<name>.sc` (SolidCraft design, several bodies allowed), `<name>.chat.json`,
`<name>.print.json`, `preview.png` + `preview.json` (start page picture and ready-to-print light),
`assembly.json` (ADR 0026), `print-faces.json`, `sketches/`, `photos/`, `exports/`, `versions/<id>/`
(`design.sc`, `preview.png`, `version.json` with `created`, `reason`, `label`, `hash`). A folder is a
project when it holds a design named like the folder. `last.json` in the state folder names the last
project. Designs from before B2 are copied into projects once (`migrateDesigns`, marker
`migrated.json`).

**Store** (`main/projects/projectStore.ts`): list (newest first, at most 500, with preview and
light), new, open (a design from elsewhere is copied in), rename (folder and companions, `whenFree`),
duplicate (`<name> Kopie`), import of a design with its companions, preview writing (`replaceFile`).
Delete moves the folder straight to the Windows recycle bin (`shell.trashItem`).

**Versions** (`versionStore.ts`): automatic at every export and before every request to the
assistant (only when the design changed, the newest 30 kept), named ones by the user (kept forever),
`restore` keeps the state before as a version first. Compare runs SolidCraft's `inspect.compare`
per body and lists added, removed and moved material (`versionCompare.ts`).

**IPC** (`shared/channels.ts`, `contract.ts`, `api.ts`): `project:info|new|open|rename|duplicate|
reveal|trash|list|open-folder|import|from-template|save-preview|versions|save-version|
restore-version|compare-version`. Every action except `list` and `open-folder` works on the
**open** project only.

**UI.** Start page (`home/HomePage.tsx`): templates, project tiles with picture, name, relative time
and light, a search over names. Project menu in the title bar (new, open, import, rename, duplicate,
show in Explorer, delete). Versions dialog (clock button): name and save, list with picture, reason
and time, compare, restore with confirmation. Structure tree: bodies and sketches with visibility,
repair for imported bodies; standard parts (B7) are marked. Plate view and assembly playback (F12)
work on the bodies of the one design.

## 2 Comparison

RESEARCH_TABLE

## 3 Gaps, ordered

Basics first: what every tool in the table has. Then comfort, then specials. Slicer tasks are out.

| # | Gap | Class | Why |
| --- | --- | --- | --- |
| G1 | Sort the start page (last change, name, created) | Basic | Every document list sorts; with 50+ projects "newest first" alone stops working |
| G2 | Actions on any tile (open, rename, duplicate, show, delete) without opening it first | Basic | Today a project must be opened to be renamed or deleted |
| G3 | Recycle bin with restore inside the app, kept 30 days | Basic | Onshape and Fusion restore deleted documents in the app; Windows' bin is invisible from PartBuddy |
| G4 | Favourites (pin to the top) | Basic | Pinned or starred documents everywhere |
| G5 | Tags with a filter | Comfort | Labels/tags in Onshape and Printables; decided instead of folders |
| G6 | Search also over tags and the parts' names | Comfort | Comes free with G5 and the parts list |
| G7 | Promote an automatic version to a milestone, rename a version | Basic | Fusion milestones, Onshape named versions are made from any point in the history |
| G8 | A version as a new project (the local stand-in for a branch) | Comfort | Onshape branches, Fusion "save as" from a version; see section 5 |
| G9 | Version list: only milestones, grouped by day, both pictures side by side when comparing | Comfort | Timeline readability |
| G10 | Parts list: quantity, printed or open, filament, note per body | Basic for printing | Bambu/Orca list objects per plate; Printables "makes"; no CAD tool tracks print state, which is the point for a print-first app |
| G11 | Progress on the tile ("2 of 5 printed") and a parts list in the sharing package | Comfort | Uses G10 |
| G12 | Export and import a project as one file (`.partbuddy`, a zip of the folder) | Comfort | Fusion `.f3d/.f3z`, Shapr3D `.shapr`, FreeCAD `.FCStd`, Bambu `.3mf` project |

## 4 Steps

Each step is one branch and one pull request. Every step is additive: projects without the new
files open as before, nothing existing is rewritten, new files are written through `replaceFile`
(temporary file, then rename) and file moves wait for SolidCraft through `whenFree`.

### P1 Start page: sort and actions on every tile (G1, G2)

- **Goal.** A sort switch (last change, name, created) remembered in the renderer's local
  settings; a "…" menu and the context menu on each tile: open, rename, duplicate, show in Explorer,
  delete. Rename and delete of the open project still go through the switch, which saves first.
- **Files.** `projectStore.ts` (`created` from the folder's birth time), `contract.ts`
  (`projectEntrySchema.created`, folder requests for rename/duplicate/reveal/trash),
  `channels.ts`, `api.ts`, `preload/index.ts`, `main/index.ts`, `home/HomePage.tsx`,
  `home/projectTiles.ts`, i18n.
- **Data model.** None on disk. `ProjectEntry` gets `created`.
- **Migration.** None.
- **Tests.** Unit: sorting (`projectTiles.test.ts`), rename/duplicate of a project that is not open
  (`projectStore.test.ts`). E2E: start page flow renames and duplicates a tile.
- **Done when.** A tile can be renamed and duplicated without opening it, sorting by name works in
  DE and EN (locale collation).

### P2 Recycle bin (G3)

- **Goal.** Delete moves the project folder to `<projects>\.trash\<id>\<name>` with a note
  `trashed.json` (name, when, original folder). The start page shows "Recycle bin (n)" with restore
  (to the old name, or the next free one) and "Empty", which hands the entries to the Windows
  recycle bin, so even emptying can be undone. Entries older than 30 days go there at start.
- **Files.** New `main/projects/trash.ts`, `main/index.ts` (`project:trash` now with a folder,
  new `project:trash-list|restore|empty`), contract, api, preload, `HomePage.tsx`, `ProjectMenu.tsx`,
  i18n.
- **Data model.** `.trash/` in the project folder. `safeDesignFileName` drops dots, so no project
  can be named `.trash`; `list()` skips it already (no `.trash.sc`).
- **Migration.** None; projects deleted before are in the Windows recycle bin as before.
- **Tests.** Unit: trash and restore round trip with companions and `versions/`, name clash on
  restore, purge by age, ids that try to leave the folder. E2E: delete a tile, restore it.
- **Done when.** A deleted project comes back with chat, versions and sketches, in DE and EN.

### P3 Favourites and tags (G4, G5, G6)

- **Goal.** A star on each tile pins it to the top; tags are edited in the tile menu, the start page
  shows the used tags as filter chips; the search finds names and tags.
- **Files.** New `main/projects/projectMeta.ts`, `projectStore.ts` (`list` reads it, `duplicate`
  copies it with the folder anyway), contract (`project:set-meta`), api, preload, `HomePage.tsx`,
  `projectTiles.ts`, i18n.
- **Data model.** Optional `project.json` in the project folder:
  `{ "schema": 1, "favorite": true, "tags": ["Garage", "Druckerzubehör"] }`, checked with zod;
  a missing or broken file means "no favourite, no tags", nothing is repaired on read.
- **Migration.** None: written on the first change only.
- **Tests.** Unit: read without file, with broken file, with unknown fields (kept on write), tag
  normalising (trim, at most 20 of 40 characters, case-insensitive unique), search over tags.
  E2E: star a tile, add a tag, filter by it.
- **Done when.** Favourites stay on top across sorts; an old project without `project.json` shows
  and filters correctly.

### P4 Versions: milestones and variants (G7, G8, G9)

- **Goal.** On every version: "Keep as milestone" (an automatic one becomes a named one, no longer
  pruned), rename, "Open as new project" (copies that state with the project's chat-free companions
  into `<name> – <label>`). The list gets a filter "Milestones only", day headings, and the compare
  shows the version's picture beside the current one.
- **Files.** `versionStore.ts` (`relabel`, `promote`), `projectStore.ts` (`fromVersion`), contract,
  channels, api, preload, `main/index.ts`, `VersionsDialog.tsx`, i18n.
- **Data model.** `version.json` is rewritten in place (atomic) with reason `manual` and the new
  label; an optional `promoted: <old reason>` keeps where it came from. Readers of the old format
  ignore the field.
- **Migration.** None.
- **Tests.** Unit: promote survives pruning, relabel keeps `hash` and `created`, an old
  `version.json` without `promoted` reads, open-as-project leaves the source untouched. E2E: the
  versions flow promotes and opens a version as a new project.
- **Done when.** A milestone made from an automatic version is still there after 31 more automatic
  versions.

### P5 Parts list in the structure tree (G10, G11)

- **Goal.** Each printed body in the structure tree gets a "printed" check and, unfolded, quantity,
  filament (free text, e.g. "PETG schwarz") and a note; standard parts get the quantity only. The
  section heading shows "2 of 5 printed"; the start page tile shows the same; the sharing package's
  description lists the parts with quantity and filament.
- **Files.** New `main/projects/parts.ts`, contract (`project:parts`, `project:set-part`), api,
  preload, `main/index.ts`, `StructurePanel.tsx`, `projectStore.ts` (summary for the tile),
  `main/share/*` (description), i18n.
- **Data model.** Optional `parts.json`: `{ "schema": 1, "parts": { "<body>": { "quantity": 2,
  "printed": 1, "filament": "PETG", "note": "" } } }`. `printed` counts copies, so 2 of 4 feet
  can be done. Entries of bodies that no longer exist are kept (a body can come back with undo or
  a restore) but not shown.
- **Migration.** None.
- **Tests.** Unit: read without file, quantity bounds, a renamed body (old entry kept, new one
  empty), summary over standard parts. E2E: mark a body printed, see it on the tile.
- **Done when.** The state survives a restart, a version restore and a duplicate.

### P6 Project package (G12)

- **Goal.** "Export project …" in the project and tile menus writes `<name>.partbuddy` (a zip of
  the folder without `exports/`, optionally without `versions/`); import takes it through the open
  dialog, drop and the start page, into a new project folder.
- **Files.** New `main/projects/projectPackage.ts` with `fflate` (MIT, already in the dependency
  tree through three; added at an exact version with a `docs/building-blocks.md` entry), contract,
  api, preload, `main/index.ts`, `importFile.ts` (kind `package`), `ProjectMenu.tsx`,
  `HomePage.tsx`, `FileDrop.tsx`, i18n.
- **Data model.** None in the project; the package holds the folder as it is plus
  `partbuddy-package.json` (`schema`, app version).
- **Migration.** None.
- **Tests.** Unit: round trip; entries with `..`, absolute paths, drive letters or too many bytes
  are refused (zip slip, zip bomb: at most 2 GiB unpacked, 20 000 entries); a package without a
  design is refused. E2E: none beyond the unit tests (the dialogs are native).
- **Done when.** A package exported and imported opens with chat, versions and parts list.

### P7 Compatibility proof and website

- An E2E flow opens a fixture project folder written by the B2–B5 code (design, chat, print,
  preview, `versions/` with a version) without any of the new files: start page, versions and
  structure tree work, nothing in the folder changed (hashes before and after).
- `site/site-content.json` and `pnpm site:shots` for the start page, versions and parts list.

The website and catalogue lines are updated in each step that changes the UI; P7 only checks the
whole.

## 5 What this plan leaves out, and why

- **Branches and merging.** Onshape merges because its document is a feature list on a server.
  A SolidCraft design is one file that PartBuddy cannot merge; a branch without merge is a copy.
  "Open as new project" (P4) is that copy, honestly named.
- **Folders.** Decided against (tags instead): a project folder must stay directly in the project
  folder, every path in chats, last-project notes and Explorer habits depend on it.
- **Configurable retention.** 30 automatic versions plus every milestone is a few megabytes per
  project. A setting comes when someone runs out of space, with the measured size.
- **Visual 3D diff in the viewport.** The per-body comparison plus the two pictures (P4) answers
  "what changed"; an overlay needs both designs loaded at once in SolidCraft and is a project of its
  own.
- **Print time, filament weight, copies on the plate, print history from the printer.** Slicer
  and printer tasks; the parts list records what the user printed, not what the printer did.
- **Sharing, comments, permissions, release workflows, cloud libraries.** No accounts and no server
  by principle.
