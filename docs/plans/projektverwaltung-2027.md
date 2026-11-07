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

Researched 2026-11-07 in the vendors' help pages (sources below). ✓ yes · ◐ partly · ✗ no ·
n/f not found in the sources (not the same as "no") · – not applicable. On = Onshape, Fu = Autodesk
Fusion, Sh = Shapr3D, Pl = Plasticity, FC = FreeCAD 1.x, BS = Bambu Studio, Or = OrcaSlicer,
Pr = Printables, **PB** = PartBuddy today.

| Function | On | Fu | Sh | Pl | FC | BS | Or | Pr | PB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Document list with pictures | ✓ [1] | n/f | ✓ [8] | n/f | ✓ [13] | n/f | n/f | n/f | ✓ |
| Search | ✓ [1] | n/f | ✓ [9] | n/f | n/f | n/f | n/f | n/f | ◐ names |
| Sort | ✓ [1] | n/f | ✓ [8] | n/f | n/f | n/f | n/f | n/f | ✗ |
| Filter | ✓ [2] | n/f | ◐ [10] | n/f | n/f | n/f | n/f | n/f | ✗ |
| Folders | ✓ [1] | ✓ [5] | ✓ [8] | ✗ | ✗ | ✗ | ✗ | n/f | – |
| Tags / labels | ✓ [2] | n/f | n/f | ✗ | ✗ | ✗ | ✗ | n/f | ✗ |
| Favourites | n/f | n/f | n/f | n/f | n/f | n/f | n/f | ◐ collections [19] | ✗ |
| Recycle bin with restore | ✓ 30 days [1] | ✓ [5] | ✗ [11] | ✗ | ✗ | ✗ | ✗ | n/f | ◐ Windows bin |
| Duplicate | n/f | n/f | ✓ [8] | n/f | n/f | n/f | n/f | n/f | ◐ open project |
| Project as one file | n/f | ✓ .f3d/.f3z [6] | ✓ .shapr [8] | ✓ [14] | ✓ .FCStd [13] | ✓ .3mf [16] | ✓ .3mf [18] | – | ✗ |
| History / timeline | ✓ [3] | ✓ [4] | ✓ [10] | n/f | ✗ | ✗ | ✗ | n/f | ✓ |
| Named versions | ✓ [3] | ✓ [7] | n/f | ◐ [15] | ✗ | ✗ | ✗ | n/f | ✓ |
| Name an earlier automatic state | ✓ [3] | n/f | n/f | ✗ | ✗ | ✗ | ✗ | – | ✗ |
| Branches and merge | ✓ [3] | n/f | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Visual comparison | ✓ [12] | n/f | ◐ [9] | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ per body, text |
| Restore without losing the present | ✓ [11a] | n/f | ✓ "Restore as Latest" [9] | ✗ | ◐ backup files [13] | ✗ | ✗ | ✗ | ✓ |
| Retention rule | ✓ bin 30/90 days [1] | n/f | n/f | ✗ | ✓ backup count [13] | ✗ | ✗ | ✗ | ✓ 30 automatic |
| Automatic versions | ✓ [3] | ◐ changes [4] | ✓ [9] | n/f | ✓ recovery [13] | n/f | n/f | ✗ | ✓ |
| Several parts per project | n/f | ✓ [7] | n/f | ✓ [14] | ✓ [13] | ✓ [16] | ✓ [18] | n/f | ✓ bodies |
| Bill of materials | ✓ [20] | ◐ Manage only | n/f | ✗ | ✓ [21] | ◐ attached file [16] | ✗ | ✗ | ✗ |
| Assembly | ✓ [20] | ✓ [7] | n/f | ✗ | ✓ [21] | ✓ [16] | ✓ [18] | ✗ | ✓ F12 |
| Several plates | – | – | – | – | – | ✓ up to 36 [16] | ✓ [18] | – | ✓ F12 |
| Print state per part | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ per job [17] | ◐ statistics [18] | ◐ makes [19] | ✗ |
| Filament / note per part | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ filament [16] | ◐ filament [18] | ✗ | ✗ |

Findings. Every tool keeps a project as **one file** that can be moved and archived; that is the one
basic PartBuddy lacks entirely. The cloud tools (Onshape, Fusion, Shapr3D) all have a document list
with pictures, search, sorting and a recycle bin with restore; local tools leave that to the file
system, which PartBuddy cannot (its project is a folder). Restoring never loses the present state
(Shapr3D "Restore as Latest", Onshape's restore with preview) – PartBuddy already does this.
Branches with merge and a graphical comparison are Onshape's alone. Labels exist in Onshape;
favourites are not documented anywhere, so they count as comfort. **No tool tracks the print
state of a part**: Bambu Handy keeps a history per print job [17], Printables has photos of makes
[19]. For a print-first app that is the one place to go beyond the models.

Sources: [1] cad.onshape.com/help/Content/Document/documents_page.htm ·
[2] cad.onshape.com/help/Content/Document/filters.htm ·
[3] cad.onshape.com/help/Content/Document/versions_and_history.htm ·
[4] help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/GUID-16B4A3A9-9188-4193-95CD-00371D595EC0.htm ·
[5] help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/ASM-DELETE-DESIGN.htm ·
[6] autodesk.com/support/technical/article/How-to-make-a-local-archive-back-up-file-in-Fusion-360 ·
[7] help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/TPD-DESIGN-MILESTONES.htm ·
[8] support.shapr3d.com/hc/en-us/articles/7873939944476 ·
[9] support.shapr3d.com/hc/en-us/articles/16074344685468 ·
[10] support.shapr3d.com/hc/en-us/articles/11567903089180 ·
[11] discourse.shapr3d.com/t/recover-deleted-models/27284 (forum) ·
[11a] cad.onshape.com/help/Content/Document/restoring.htm ·
[12] cad.onshape.com/help/Content/Document/compare.htm ·
[13] wiki.freecad.org/Preferences_Editor, wiki.freecad.org/Start_Workbench ·
[14] doc.plasticity.xyz/plasticity-essentials/import-export ·
[15] doc.plasticity.xyz/plasticity-essentials/file-menu (now 404, seen in a search excerpt) ·
[16] wiki.bambulab.com/en/software/bambu-studio/plates_management, …/project-based-workflow ·
[17] wiki.bambulab.com/en/makerworld/tutorials/printing-tutorial-on-bambu-handy; forum.bambulab.com/t/how-to-see-all-of-my-print-history/149856 (forum) ·
[18] orcaslicer.com/wiki/print_prepare/prepare_basic.html, orcaslicer.com/wiki/general_settings/import_export.html ·
[19] blog.prusa3d.com/prusaprinters-org-is-now-printables-com-ultimate-database-of-3d-models-for-everyone_66880/ ·
[20] cad.onshape.com/help/Content/Assembly/bill_of_material.htm ·
[21] wiki.freecad.org/Assembly_CreateBom

## 3 Gaps, ordered

Basics first: what every tool in the table has. Then comfort, then specials. Slicer tasks are out.

| # | Gap | Class | Why |
| --- | --- | --- | --- |
| G1 | Sort the start page (last change, name, created) | Basic | Onshape [1], Shapr3D [8]; with 50+ projects "newest first" alone stops working |
| G2 | Actions on any tile (rename, duplicate, show, delete) without opening it | Basic | Today a project must be opened to be renamed or deleted |
| G3 | Recycle bin with restore inside the app, kept 30 days | Basic | Onshape (30 days) [1], Fusion [5]; Windows' bin is invisible from PartBuddy |
| G4 | Export and import a project as one file | Basic | Every tool in the table [6, 8, 13, 14, 16, 18] |
| G5 | Name an automatic version afterwards (milestone), rename a version | Comfort | Onshape versions from any history point [3] |
| G6 | A version as a new project (the local stand-in for a branch) | Comfort | Onshape branches [3]; see section 5 |
| G7 | Version list: milestones only, by day, both pictures side by side when comparing | Comfort | Onshape compare [12] |
| G8 | Tags with a filter, search over tags | Comfort | Onshape labels [2]; decided instead of folders |
| G9 | Favourites pinned to the top | Comfort | Not documented in any model; cheap with G8's file |
| G10 | Parts list: quantity, printed copies, filament, note per body; progress on the tile | Special | No model has it [17, 19]; the print-first point of PartBuddy |

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

### P3 Project package (G4)

- **Goal.** "Export project …" in the project and tile menus writes `<name>.partbuddy` (a zip of
  the folder without `exports/`; versions always travel with it, they are the project's history); import takes it through the open
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

### P4 Versions: milestones and variants (G5, G6, G7)

- **Goal.** On every version: "Keep as milestone" (an automatic one becomes a named one, no longer
  pruned), rename, "Open as new project" (that version's design with the print settings and
  the parts list, without chat and versions, in a new project `<name> <label>`). The list gets a filter "Milestones only" and day headings. (Done without the two
  pictures side by side: the open design is in the viewport behind the dialog.)
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

### P5 Favourites and tags (G8, G9)

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

### P6 Parts list in the structure tree (G10)

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
