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

### Versions (0.40, checked 2026-11-05)

- Saving an unchanged design writes the same bytes, so a hash tells whether a version is new.
- `component.insert_design` refuses a copy of the open design ("can't be linked into itself": same
  document id). A version is compared by writing it as STEP (`solidcraft-cli run --in v.sc --out
  v.step`), inserting that on trial and running `inspect.compare {a, b}` per body pair; the failing
  last step takes everything back.
- `file.insert_step` replaces placeholder solid names such as `Body1` with the product's name (the
  file name) unless `names: 'solid'` is given; an inserted body whose name exists gets ` (2)`.

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
  different `renderPriority`. `Outlines` is unusable for silhouettes. `ContactShadows` does not work
  with Z up: its blur plane is fixed in Y-up world space and the turned shadow camera sees it
  edge-on, so the texture stays empty; the floor shadow is a `ShadowMaterial` plane. A key light from the camera
  direction throws every shadow behind the part. three r186 turns `PCFSoftShadowMap` into PCF.
- A hidden browser pane has no `requestAnimationFrame`: WebGL stays empty, use Playwright headless
  with SwiftShader. The test window is placed beside all displays (`launch.ts`), never in front.

- The interface language is Chromium's `--lang`, appended before the app is ready from PartBuddy's
  `general.json`; a `--lang` on the command line (tests) wins. A change applies at once through
  `i18next.changeLanguage`. A new project folder applies after a restart: SolidCraft gets its
  allowed folders when it starts.

## Assistants

- Ollama (checked 2026-11-06, 0.34.0): its OpenAI endpoint (`/v1/chat/completions`) ignores any
  context size and runs with 4096 tokens on GPUs under 24 GiB; too small for SolidCraft's tools. The
  local route therefore uses Ollama's own API through `ollama-ai-provider-v2` with
  `providerOptions.ollama.options.num_ctx`. `/api/show` gives `capabilities` (tools, vision, thinking)
  and `<family>.context_length`.
- Local servers (checked 2026-11-06): PartBuddy's prompt with SolidCraft's tools is about 9,400 tokens,
  so 16K context is the floor. LM Studio 0.4.28 loads on demand with 8,192 tokens; PartBuddy loads
  with `POST /api/v1/models/load {model, context_length}`. llama.cpp b12144 gives `supports_tools` in
  `/props` and `meta.n_ctx` in `/v1/models`. vLLM needs `--enable-auto-tool-choice --tool-call-parser`;
  Qwen3-1.7B called command names as tools and looped, Qwen3-4B works. Loop guard: every route stops
  a turn after three rounds of the same tool calls (`repeatsItself` in `agents/loop.ts`; the gate proxy
  refuses the third identical call in a row for Claude Code).
- Test servers on the home server: llama.cpp in `%USERPROFILE%\.partbuddy\servers\llama.cpp` (`llama-server -hf
  unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M -c 16384 --jinja`), LM Studio installed (`lms server start`), vLLM
  in the WSL distro `vllm` (`/opt/vllm-run/start.sh`); `localhostForwarding` is off for the CI runners,
  so a forwarder to the WSL address is needed. Run one at a time: the GPU has 8 GB. Local E2E:
  `PARTBUDDY_E2E_OLLAMA=1` with `PARTBUDDY_E2E_LOCAL_PICK=llama.cpp|LM Studio|vLLM|Ollama`.
- Claude Code `stream-json` reports `system/init` for every message of the same session; the
  context stays. Images go in as content blocks `{type: image, source: {type: base64, …}}`.
  `--bare` reads only API keys; `--setting-sources ""` turns hooks and plugins off;
  `auth status --json` includes the e-mail address (discard it).
- ChatGPT plan access needs tools in the namespace format and `store: false`. A Windows credential
  holds at most 2560 bytes, so tokens are stored in pieces. `.gitignore` ignores every `secrets/`
  folder, hence the code folder `credentials/`.
- In tests, fake assistant triggers must not use words from the print-profile rules (a trigger word
  inside the rules made eleven E2E tests fail).

## Research (checked 2026-11-05 with Claude Code 2.1.302)

- `--tools WebSearch,WebFetch` with the same names in `--allowedTools` turns on only these two built-in
  tools. In stream-json a search is an assistant `tool_use` block `{name: "WebSearch", input: {query}}`;
  its `tool_result` text starts with `Web search results for query: "…"` and holds
  `Links: [{"title", "url"}, …]`. WebFetch's result is the model's summary of the page; PartBuddy
  shows neither result text, only cards with the links.
- ChatGPT's web search goes through the AI SDK's `openai.tools.webSearch` and reports `source`
  stream parts; it is not yet checked against the ChatGPT plan backend. If the backend refuses the
  tool, PartBuddy logs it and goes on without web search for the rest of the session.

## Standard parts (0.40, checked 2026-11-05)

- `parts.library {}` lists every family with sizes (`d`, for bearings `bore`, `outer`, `width`),
  `lengths` and `default_length`. `parts.insert {family, size, length?, at: [x, y, z]}` with a point
  on a hole's wall seats the part with a rigid joint in a new component (`SHCS M3x12`); the body is
  called `Body<n>` until `body.rename`. PartBuddy notes standard part bodies under
  `io.github.manuelstaggl.partbuddy.standard-parts`; export and the light leave them out.

## SolidCraft 0.40.1 (checked 2026-11-12)

- Taking a tool's change back: undo it step by step (`document.inspect` gives the undo depth before and
  after, then that many `edit.undo`), as the work log does. The two other ways fail on 0.40.1:
  after a batch with `rollback: true` that built a modelled thread, the same `solid.hole` for real takes
  50 s and fails ("SMLib boolean … Face has Coincident Edges"); and `edit.restore_checkpoint` answers
  "no checkpoint n" for a checkpoint taken in an earlier batch, while `forget: true` on it works.
- `solid.hole`, `solid.extrude` (cut) and `solid.emboss` take `targets`, `plastic.boss`, `plastic.lip` and
  `plastic.snap_fit` take `body`. Without them the point alone decides which body is cut: on an edge two
  bodies share, both. With them a point that is not on the body cuts nothing ("the hole removes no
  material", a warning, not an error) or is refused.
- Checked 2026-11-13: `solid.hole` without `depth` and `solid.extrude` cut far go through every wall of the
  named body on their line (a box 60 × 40 × 30 with walls of 2 mm lost 2 × 18.158 mm³ to an M3 hole).
  A cut as deep as the wall, or a millimetre more, takes that wall alone; a depth exactly as thick
  leaves no skin. What a cut takes, as bodies: a box of 20 m `intersect` the body (`keep_tools`) is a
  copy under a name of one's own; after the cut, the copy `cut` by the body leaves one body per piece
  ("Name", "Name (1)"), each with `bbox` and `center_of_mass` in `inspect.measure`.
- While such a copy lies on the body, every `solid.hole` at a point of it fails ("Hole1: the reference
  `F1:+z` no longer exists as it was picked; reselect it"), whichever body `targets` names; a sketched
  extrude does not. Moved aside first (`solid.move` by 30 m) and back after the hole, it works: a box with
  2 mm walls gave two pieces of 18.158 mm³ for an M3 hole (review of PR #365).
- `solid.hole` refuses a counterbore as deep as the hole or deeper ("the counterbore must be wider than
  the hole and shallower than it"); a countersink deeper than the hole is built.
- `model.faces` names the wall of a `solid.hole` `F<n>:bore:side:0`; a hole that breaks out of a side
  leaves `…#1`, `…#2`. A `solid.cylinder` cut is `F<n>:side`.
- Checked 2026-11-13 (audit G1): `component.metadata.set {component, values: {"<reverse-DNS key>": {…}}}`
  keeps the object on the component, one undo step (undo and redo take it away and back), and it is in the
  saved `.sc` when the design is opened again. `component.list` does not show it; `component.metadata` does.
- `file.export` 3MF with `objects: component` makes one object of the bodies of one component only. Two
  components joined by a joint stay two objects, side by side under the root or both under a parent
  component; a joint needs two occurrences, so a print-in-place hinge always leaves as two objects.
- Bambu Studio (`bambu-studio.exe --outputdir <dir> --export-3mf out.3mf <file>`, no window when started hidden,
  `result.json` beside it) loads such a 3MF as two objects, each dropped onto the bed and placed apart: the lid of the
  audit's hinge came down 22 mm into the box's knuckles. One object whose `components` point at the two mesh objects
  (identity transforms) it loads as one object with two parts, their offsets equal to the design to 1e-7 mm, the lowest
  point of the two on the bed; an item `transform` on it (a print face laid down) is kept. An STL of both bodies is
  one object with one part, as designed.

## SolidCraft 0.40.0-rc.4 (checked 2026-11-11)

- PartBuddy's recommended version since 2026-11-11. The contract suite ran against it and against the
  nightly 20261110.117.1 it contains; the nightly's own `solidcraft-cli --version` says `0.40.0-rc.3`,
  so PartBuddy cannot tell that nightly from rc.3.
- New since rc.3 and of use here: `joint.find_limits` (both ways in one call, also for a joint without
  limits), `joint.sweep` with `budget_s` and `exclude_pairs` and a `stopped_by` of `"budget"` (read as
  run through by `sweepStopOf`), `motion.export_animation`, countersunk screws (ISO 10642) in
  `parts.insert`, a counterbore sized to the screw's head in `solid.hole`, a thumbnail in 3MF, flat
  faces meshed as their boundary (a box has 12 triangles, not 124).
- `joint.gear {a, b, ra, rb}` links two revolute joints (`joint.list` → `links: [{a, b, ratio, offset}]`);
  driving the follower is held. There is still no command that makes gear teeth.

## Joints and motion (0.40.0-rc.3, checked 2026-11-10)

- `component.from_bodies {bodies}` makes one component per body; the first is grounded, the
  occurrences are called `<body>:1`. The bodies keep their names: `document.inspect`,
  `model.faces` and `file.export {bodies}` go on naming them and answer in world placement, so the
  mirror shows a driven part where it stands without knowing about components.
- `joint.as_built {type, a, b, at: {occurrence, point, z}, name}` joins two occurrences where
  they are (0 is the position as designed); `joint.limits {joint, min, max}`;
  `joint.drive {joint, index, value}` moves it, clamps to the limits (`held` says why) and is one
  undo step and one revision. `joint.list` gives `values: [{name, unit: deg|mm, value, limits}]`.
- `joint.sweep {joint, from, to}` runs the range without changing the design and answers
  `stopped_at` (the last value clear of contact, refined to 0.01 mm) and
  `stopped_by {a, b, at}`; about 5 ms for two plates. Also there, not used yet: `joint.gear`,
  `joint.reach` (a drag frame with `continuous`), `motion.study`, `motion.interference`.
- Geometry built from the design level onto a body that is a component (`targets: [body]` with the
  root active) is not part of the component: when a joint moves the body it stays where it is, and
  the feature then warns "the joined piece doesn't touch `<body>`, so `<body>` is now in 2 separate
  pieces". Built with `component.activate {component}` first (world coordinates still apply, the
  joint at 0) it moves along; `component.activate {component: 0}` goes back. A join that does not
  touch never makes a body of its own, it stays in the body as a separate piece (practice runs
  2026-11-10).
- Which commands find the component themselves (0.40.0-rc.3, checked 2026-11-10): those that pick
  by a point on the body (`solid.fillet`, `solid.hole`, `solid.press_pull`) follow a moved joint from
  the design level, also when built at a pose. A sketch with `solid.extrude` does not: cut from the
  design level, a slot is gone from the body once the joint moves it and back at 0. PartBuddy's
  sketched blocks therefore run inside `component.activate` (`ActionService.inComponentOf`).
- The `solidcraft-cli` on the PATH of the home server is the installed version (0.40.1 since 2026-11-12);
  `solidcraft-cli commands` lists every command with its parameters.

## Slicer (0.40, checked 2026-11-05)

- `file.slicers` lists `{id, name, program}` (here `bambu`, `orca`). `file.send_to_slicer {slicer,
  bodies, wait: "return"}` also works without a window: it writes the 3MF to
  `%LOCALAPPDATA%\SolidCraft\slicer` (outside `--allow-path`), lays bodies on their print face and
  answers in about 50 ms without waiting for the slicer.
- The started slicer inherits the pipes of `solidcraft-cli`, so closing the MCP client waits until
  the slicer ends; PartBuddy waits at most 3 s when it closes the engine.
- `body.print_face {body, point}` takes a point on a flat face of a solid body and refuses others;
  without `point` it clears the print face.

## Installer (checked 2026-11-05, electron-builder 26.18.0, electron-updater 6.8.11)

- electron-builder copies every `dependencies` entry into the asar, also libraries Vite already
  bundled into the renderer (235 MB). The main process therefore bundles all dependencies except
  `@napi-rs/keyring` (native), and `files` keeps only that one in `node_modules` (9 MB asar).
- The production CSS minifier shortens `#ffffff` to `#fff`; colours read from computed styles go
  through `hexColor` before the strict bridge schema (the window buttons stayed uncoloured before).
- `pnpm dist:dir` packs without an installer; `app-update.yml` is written only by a real target.
  While the repository is private the update check ends in an error (404), shown as such.
- Installing from a Claude Code session would land in the MSIX package folder (AppData is
  redirected), so the installer is handed to the user instead of being run here.

## Function blocks (0.40, checked 2026-11-05)

- `solid.hole {position, thread: "M4", modeled: true, depth?}` cuts a printable thread with the tap
  drill; `clearance: "M3", fit` gives ISO 273 holes, but `type: countersink|counterbore` needs
  `cs_diameter` and `cs_angle` (`"90 deg"`) or `cb_diameter` and `cb_depth` given explicitly.
- `plastic.boss {position, diameter, height, hole_diameter, hole_depth}` builds out of the face.
- A modelled thread costs about 2 s per rebuild of a small part.
- `sketch.create {plane: {face: point}}` projects the face's edges into the sketch (they can become
  profiles); `project_edges: false` avoids that. An explicit plane `{origin, x_dir, y_dir}` puts the
  sketch origin at the picked point; following commands use the new sketch without its id.
- `solid.extrude` with a negative `distance` and `operation: cut` cuts into the face's material;
  `through_all` cut outward and changed nothing (checked with a slot on a top face).
- `solid.emboss {depth, mode: emboss|deboss, face}` works on `sketch.text` profiles.
- `sketch.text` uses the built-in Liberation Sans, which has no bold face: `bold: true` alone is
  refused; with `font: 'Arial'` (any installed family) it works. `at` is the baseline start, with
  `align: center` its middle. `solid.emboss` takes the new sketch without its id (0.40.0-rc.2).
- `sketch.polygon.circumscribed {center, radius, sides}`: the radius goes to the edge midpoints, so
  it is half the width across flats. `plastic.lip {face, type, width, height, gap?, side?}` needs a
  point on the rim face of a shelled body.
- `plane_normal` in `model.faces` points out of the material, also on the inner walls and the floor
  of a shell; a sketch plane with that normal and a negative extrusion therefore always cuts in.
- Face names from history can run to hundreds of characters after cuts and embossing
  (`F1:-y#[F1:+x,…,F4:face:55]`); every place that shows one must cut it short.
- `plastic.snap_fit {position, hook, length, thickness, width, catch_depth, catch_length}` stands
  the arm out of the face; `length` includes the catch (a 10 mm arm on a 10 mm box reaches 20 mm).
  `hook` must lie in the face ("must point across the arm" otherwise). The strain shown in the form
  uses the lever to the catch's middle.
- `sketch.insert_svg {text, at, width, align: center}` takes the SVG as text (no file access needed)
  and keeps it upright (SVG's y runs down, the sketch's up). `solid.emboss` without `profiles`
  takes every region, so a ring's hole is filled; `solid.extrude` keeps a loop inside a hole as
  material again, which is what a logo means (ring with a star: 78.76 mm³ at 0.6 mm, by hand
  111.7 + 19.6 mm² × 0.6). An SVG of strokes only has no profile and is refused.
- SVG files are read by PartBuddy itself (`shared/svgDrawing.ts`, no DOM, also in the main process)
  and only the clean form goes on: `<path>`s of lines and cubics in mm, transforms applied, a
  nonzero loop that is no edge of the fill left out (SolidCraft's nesting is even-odd). Arcs as
  cubics stay within 2.7e-4 of the radius, and `insert_svg` turns such a full circle back into a
  cylinder face: a 40 mm "O" (r 20/12) extruded 2 mm measured 1608.79 mm³ for π·256·2 = 1608.50.
- A logo in colours: `insert_svg {align: origin, at: [−w/2, h/2]}` puts every layer in the
  drawing's frame whatever its own extent. SolidCraft splits disjoint pieces of one extrusion into
  bodies "<name> (2)" without the body's colour, and a later cut does the same, so each piece is
  its own extrusion and split leftovers are coloured after the batch. `solid.combine` cut fails
  with "no result" for bodies that do not meet, and a cut of the part by tools already cut against
  each other failed too: the pocket goes first. `appearance.list {}` lists every body's colour
  (`bodies: {name: {color}}`); the mirror reads it for the view.
- The assistant gets a drawing as `drawing:svg-N` (`:#rrggbb` for one fill) in `insert_svg`'s
  `text`; `withDrawings` puts the clean SVG in after the policy, so path data never passes the model.
- `inspect.clearance {bodies, clearance}` returns `overlaps` (volume, bbox, centre) and `near` pairs
  closer than `clearance` with `distance_mm`, `from` and `to`; touching pairs come with distance 0.
  Four 10 mm boxes take 8 ms; results are reused while neither body changes (`pairs_reused`). The
  light runs it on trial after the mesh check whenever two or more bodies are printed (F2).
- Templates (F3, 0.40.0-rc.2): `solid.box` and `solid.cylinder` follow expressions in their sizes and
  corners, `sketch.line` and `sketch.point` in their points, and a revolve of such a profile too.
  `solid.hole` keeps a `position` given as expressions in its definition (`at`) but does not move:
  after a change it warns "no longer on face … it stays where it was placed". Plain holes are
  therefore cut cylinders; countersunk ones are drilled at sketch points (`solid.hole {sketch}`).
  A sketch plane's `origin` takes numbers only; a sketch on `{face: point}` follows the face (on a
  face with normal +Y its x runs along −X). Fillets by edge points followed a size change.
- `solidcraft-cli snapshot script.json --out x.png --view iso --no-grid --no-axes` renders a script
  without a window; `--section x=35` cuts it, handy to check a hole.
- `solidcraft-cli snapshot --in design.sc` renders a saved design while the headless engine has it
  open (about 2 s at 1600 × 1200); `--body NAME:opacity=0` still draws the body's outline, so it
  does not hide a body. `inspect.measure {bodies}` gives `bodies[].bbox` per body.
- `solidcraft-cli commands` prints every command with its parameters as JSON, the quickest way to
  check a parameter before a contract test.

## Repository and machine

- Since 2026-11-06 development runs on the home server; the gaming PC only runs the test version,
  which `tools/test-app/deliver-test-app.ps1` builds and copies there over SSH (target `user@host`
  in `%USERPROFILE%\.partbuddy\test-pc.txt`). The server reaches the PC, not the other way round.
  The same run unpacks it on the server too: shortcut »PartBuddy (Test)« on the server desktop,
  own profile via `--user-data-dir=…\.partbuddy\test-app\profile`, SolidCraft 0.40.0-rc.2 set once
  in that profile's `solidcraft-settings.json`.
- On the server the Claude app hands out TEMP as the 8.3 short path (`ADMINI~1` in place of the user
  folder); the SolidCraft contract E2E tests that build a template then open no project. Run them with
  TEMP and TMP set to the long path (`%USERPROFILE%\AppData\Local\Temp` spelled out). The same holds
  for `look.spec`.
- The self-hosted CI runner (ADR 0022) dies with the Claude session that started it; restart with
  `runner-control.ps1 -Action Start -Quiet`. At boot the scheduled task `PartBuddy-Runner` starts it.
  PowerShell appends CRLF when piping into `wsl.exe`.
- pnpm 12 writes a two-part lockfile that Dependabot cannot read, hence Renovate. Private
  repositories of a personal account have no CodeQL, secret scanning or dependency review; gitleaks,
  zizmor, `pnpm audit` and the licence gate stand in. gitleaks' Windows-path rule also hits test
  inputs that are absolute Windows paths.
- Squash-merging with `--delete-branch` closes a stacked follow-up PR: retarget it to main first.
- The repository moved from the owner's account to the organization `PartBuddy` on 2026-11-06. The
  repository runners, secrets, issues and PRs moved along and old URLs redirect. The organization's
  Actions settings win over the repository's: "Allow GitHub Actions to create and approve pull
  requests" has to be on at both levels for release-please.
- Node 26 ships without corepack: pnpm comes from `npm install -g pnpm@<packageManager version>`.
  On the old development PC the global `pnpm.cmd` was broken, which is why Vite is started through
  node directly.
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
