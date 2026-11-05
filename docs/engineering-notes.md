# Engineering notes

Facts found while building PartBuddy that the code and the ADRs do not say on their own. Most
SolidCraft notes were checked on 0.30.1; recheck them on 0.40 (solidcore) when a step touches them.

## SolidCraft

### Control channel and headless engine

- The control channel writes `<port>.token`, `<port>.pid` and `current.port` to
  `%LOCALAPPDATA%\SolidCraft\control`. SolidCraft inherits `SOLIDCRAFT_CONTROL_DIR`, so test
  instances get their own folder and port. `control.subscribe` delivers `design.changed`;
  `engine.batch` runs engine commands; `app.quit {force?}` is a control method.
- `solidcraft-cli mcp --headless` starts in about 9 ms and runs every engine command through
  `batch`, but sends no `design.changed`. SolidCraft has no switch for a hidden window, and
  `spawn({ windowsHide })` is ignored. Windows of SolidCraft cannot be placed off screen in tests.
- `--allow-path` with a folder that does not exist yet is ignored silently: create the folder first.
  Headless, only `--allow-path` folders count, so PartBuddy exports into its cache and copies.
- A headless design takes the file's name only when it is saved, without telling: request
  `engine.revision()` right after naming. Saving raises the revision.
- `engine.batch` and `describe_command` do not exist in `solidcraft-cli run`.
- SolidCraft names a design after its file only when `save` writes to another path than the one
  the design was opened from; there is no command to rename a design (checked 2026-11-05, 0.40.0-rc.2).
- After the headless engine closes, Windows can keep its design folder locked for a moment
  (renaming it fails with EPERM); file operations on a project retry for a few seconds.

### Probes, undo and metadata

- A probe without traces: end the batch with a step that fails (`sketch.inspect {sketch:
  2147483647}`); SolidCraft then takes back the whole batch including the undo history and returns
  the results before it (about 4 ms). `rollback: true` takes nothing back when no step fails.
- `parameters.change` and `set_parameter` with an unknown name create a parameter silently.
- `edit.restore_checkpoint` consumes that checkpoint and every later one, clears redo and keeps only
  the last 16, so "go back to this state" uses undo depth instead (ADR 0018). `document.inspect`
  reports `undo` and `redo` as stack depths; `edit.undo`/`edit.redo` work through `engine.batch`.
- `document.metadata.set` takes an object under a reverse-DNS key, at most 64 KiB per key; `values`
  is one undo step and survives save and open. `inspect_design`, `document.inspect`,
  `component.metadata` and `timeline.export_script` include metadata, so the proxy filters it.

### Policy

- `batch` accepts tools as steps (save, export, open, new_design, crash_reports, nested execute).
  `path` is sometimes a file and sometimes geometry (curve lists, occurrence paths, `"l1"`), so only
  text other than a curve id counts as a file. Also dangerous: `file.open_in_easyprint` (uploads to
  Printables), `file.send_to_slicer` (starts a program), `settings.*`.

### Geometry and references

- `3mf-tagged` export carries the B-rep face of every triangle; `model.faces` names faces stably
  while indices change on every rebuild, so anchors use names (ADR 0004, ADR 0006).
- `model.edges {body}` names an edge after its two faces (`F1:+x|F1:-y`, the feature id in the face
  name) with start, mid, end and length. A fillet stores its edges as points on the old sharp edge.
- `timeline.inspect {feature}` gives the definition and inputs `{label, param, expression, unit}`;
  `parameters.change` sets them, `timeline.edit` changes definitions. `parameters.list` has
  `used_by`, `uses`, `source`. Box corners and hole positions can stay expressions
  (`[0, "wall + hook_width", 0]`): evaluate them with `expr.evaluate {expression, kind: length}`.
- `document.inspect` lists the timeline (`id, name, type, error, warning, suppressed, rolled_back,
  ms`) and `marker`; `timeline.roll_to`, `timeline.suppress`, `browser.visibility` work on it.
- `sketch.inspect {sketch}` returns curves in sketch coordinates plus the plane, constraints with
  curve and point indices, dimensions with parameter names; arcs are always counter-clockwise (a
  clockwise arc swaps start and end with their point ids). Used sketches become invisible.
- Actions by point: `solid.fillet {edges, radius}`, `solid.chamfer {edges, distance}`,
  `solid.press_pull {face, distance}`, `solid.hole {position, diameter, depth?}`,
  `solid.shell {faces, thickness}`; `inspect.measure` with two items gives distance and angle.
- Countersunk hole inputs: Diameter, Countersink diameter, Countersink angle.

### Import (0.40, checked 2026-11-05)

- `file.insert_step {path}` (STEP, IGES, also FreeCAD and Rhino files) adds a `BaseFeature` in a new
  component named after the file; the body keeps the solid's own name, which in a STEP written by
  SolidCraft is the export file's name. `file.insert_mesh {path}` (STL, 3MF, OBJ, PLY, glTF) adds a
  `MeshFeature`; the body is named after the file. Both embed the geometry: the source file may go
  afterwards. `solidcraft-cli run script.json --save new.sc` builds a design from a file without the
  open engine (the target folder must exist).
- A mesh body mirrors like any body (one face entry). `body.repair` refuses mesh bodies ("convert it
  first") and reports "nothing to repair" for a sound part; `mesh.convert` takes only closed,
  consistently oriented meshes ("two triangles per edge"). There is no command to repair a mesh.
- After `mesh.convert` the body's `feature` in `document.inspect` points at the conversion, so the
  feature type tells mesh (`MeshFeature`), imported (`BaseFeature`) and modelled bodies apart.

### Kernel change to solidcore (0.40, checked 2026-11-05)

- 29 designs of 0.30.1 rebuilt with 0.40.0-rc.2: 10 unchanged, 19 lose fillets, chamfers and
  threads on cylinder faces with "the reference … no longer exists as it was picked; reselect it"
  (`F1:side#2` and similar names differ). Volumes match where nothing fails.
- Rebuild times: knurled and threaded geometry up to seven times slower (an extrusion 6 s → 85 s),
  some long booleans much faster (232 s → 24 s). A box exports as 124 triangles instead of 12.
- File format 50 cannot be opened by 0.30.1. Commands only grew (570 → 595), nothing was removed.

## Electron, React and the 3D view

- Electron 45 has no install script: the binary comes on first start; in CI run
  `node …/electron/install.js`. axe in Electron needs `setLegacyMode(true)`.
- axe flags `label-content-name-mismatch` when an `aria-label` does not contain the visible text
  (logo button, tiles): start the label with the visible name or leave it to the content.
- The start page's preview pictures come from a second, small `WebGLRenderer` that draws the
  view's own `BufferGeometry` (three.js uploads it once per context); `toDataURL` right after
  `render` needs no animation frame.
- Playwright's `electron.launch` emulates `prefers-color-scheme: light` and hides
  `nativeTheme.themeSource`: tests of the app's own theme pass `colorScheme: null`. The strict CSP
  blocks string `waitForFunction`; use the function form. E2E clicks on faces need about 1 s after
  the build and 300 ms between clicks.
- A zustand selector with `?? []` returns a new array each time → React error #185 (endless loop).
  i18n keys must never be merged with `Object.assign` (an existing key became an object → React
  error #31). Both give a white renderer.
- Unit tests compiled with `tsconfig.node` must not import renderer modules that import
  `platform.ts`; pure functions go into modules of their own. Run `eslint .` in full after the last
  change (E2E files are compiled for Node as well).
- Design tokens replace Tailwind's spacing (`--spacing-*: initial`): no classes like `w-52` or
  `*-0.5`. React Aria Components 1.22: `Checkbox` is deprecated (use `CheckboxField` +
  `CheckboxButton`); `NumberField` reports only on blur or Enter; Tailwind variants are `hover:`
  and `focus:`; lists need `dependencies` with outside state.
- R3F: the canvas starts with its own camera and `makeDefault` swaps it later, so framing has to run
  again for a new camera; `CameraControls` exist only after the canvas mounts. An empty `Box3` gives
  a bounding sphere of radius −1: always check `radius <= 0`.
- drei `Html` does not attach on the very first scene render (mount pins a frame later) and puts
  buttons into the canvas wrapper, so the wrapper must not carry `role=img`. Two `GizmoHelper`s need
  different `renderPriority`. `Outlines` is unusable for silhouettes. `ContactShadows` works with Z
  up inside a group rotated `[π/2, 0, 0]`; blur counts in texels. A key light from the camera
  direction throws every shadow behind the part. three r186 turns `PCFSoftShadowMap` into PCF.
- A hidden browser pane has no `requestAnimationFrame`: WebGL stays empty, use Playwright headless
  with SwiftShader. The test window is placed beside all displays (`launch.ts`), never in front.

## Assistants

- Claude Code `stream-json` reports `system/init` for every message of the same session; the
  context stays. Images go in as content blocks `{type: image, source: {type: base64, …}}`.
  `--bare` reads only API keys; `--setting-sources ""` turns hooks and plugins off;
  `auth status --json` includes the e-mail address (discard it).
- ChatGPT plan access needs tools in the namespace format and `store: false`. A Windows credential
  holds at most 2560 bytes, so tokens are stored in pieces. `.gitignore` ignores every `secrets/`
  folder, hence the code folder `credentials/`.
- In tests, fake assistant triggers must not use words from the print-profile rules (a trigger word
  inside the rules made eleven E2E tests fail).

## Repository and machine

- The self-hosted CI runner (ADR 0022) dies with the Claude session that started it; restart with
  `runner-control.ps1 -Action Start -Quiet`. PowerShell appends CRLF when piping into `wsl.exe`.
- pnpm 12 writes a two-part lockfile that Dependabot cannot read, hence Renovate. Private
  repositories of a personal account have no CodeQL, secret scanning or dependency review; gitleaks,
  zizmor, `pnpm audit` and the licence gate stand in. gitleaks' Windows-path rule also hits test
  inputs that are absolute Windows paths.
- Squash-merging with `--delete-branch` closes a stacked follow-up PR: retarget it to main first.
- The local global `pnpm.cmd` is broken on the development machine; nested pnpm calls from scripts
  fail there only. Start Vite through node directly.
- The Claude desktop app is an MSIX package and redirects AppData writes of its child processes into
  its package folder: files meant for the user go under `%USERPROFILE%\.partbuddy`. The brand icon
  `assets/brand/icon/partbuddy.ico` holds only PNG entries, so Explorer shows no icon on a shortcut;
  rebuild it with bitmap entries up to 96 px when packaging.
- Bambu Studio slices without a window: `bambu-studio.exe --slice 0 --load-settings
  "machine.json;process.json" --load-filaments f.json --outputdir D file.3mf`; `result.json` has the
  bounding box per object. The product owner's printer is a Bambu Lab H2S with a 0.4 mm nozzle
  (340 × 320 × 340 mm).

## Claude Code control protocol (checked 2026-11-05 with 2.1.302)

- In stream-json input mode Claude Code takes control requests on stdin:
  `{"type":"control_request","request_id":…,"request":{"subtype":…}}`, answered with
  `{"type":"control_response","response":{"subtype":"success","request_id":…,"response":{…}}}`.
- `initialize` sends no prompt (no usage) and answers with the plan's `models`
  (`value`, `displayName`, `description`, `supportedEffortLevels`, plus pinned older versions) and
  `account` (with the e-mail address: never keep it). PartBuddy lists the aliases only.
- `set_model {model}` and `apply_flag_settings {settings: {effortLevel}}` change a running session
  from the next turn; `effortLevel: null` returns to the model's default. An unknown effort name is
  accepted silently, so PartBuddy checks it against `supportedEffortLevels` itself.
- The ChatGPT model list (`/models`) carries `display_name`, `supported_reasoning_levels[].effort`
  and `default_reasoning_level`, as the Codex model info does. The AI SDK sends
  `reasoningEffort` only for models it treats as reasoning models (`gpt-5…`, o-series).
