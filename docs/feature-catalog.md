# Feature catalogue

Features ordered by MoSCoW. **MVP** marks the first release; the product owner confirmed the cut on
2026-11-04. Existing workflows of the earlier CAD workspace come first: the product makes them
usable without a terminal. Sources of the patterns: [research § Role models](research.md#6-role-models-competitors-and-names).

## Direction and roadmap

Reset by the product owner on 2026-11-05 after a walk through everything PartBuddy has and plans.
The work had drifted into slicer territory (support detection, bridges, print orientation) while
basics such as opening, importing and versions were missing. This plan replaces the milestones
M1–M7 of 2026-11-04; what M1, M2 and the first part of M7 built stays unless it is listed for
removal below. The MoSCoW tables further down describe each feature's benefit; where they disagree
with this plan, the plan wins.

**Core:** design printable parts together with the assistant, and research with the user to find
solutions for special objects. **Not PartBuddy's job:** whatever the slicer does itself and better
(supports, bridges, orientation in detail, calibration of flow, temperature and the like; the design values of a material are measured on purpose, F14). Before a new feature, ask whether it is
design (geometry that is only decided while designing) or slicer work.

**Guiding idea of the workspace:** PartBuddy is a real CAD workspace for makers, with SolidCraft as
the engine behind it ([ADR 0016](adr/0016-headless-solidcraft.md)). The user points at geometry and
changes it; the assistant does what needs intent. **Direct where it is unambiguous, the assistant
where intent is needed:** a dimension driven by a parameter or sketch dimension changes at once,
without tokens and with a preview; anything else becomes a short, structured request to the
assistant, which asks with a clarification card when there are several sensible ways. Where
SolidCraft already has a command for a task, PartBuddy offers that command instead of building its
own geometry logic.

Work runs in three phases, one pull request per step, in this order.

### Phase 0: engine and clean-up

| Step | Content |
| --- | --- |
| R0 SolidCraft 0.40 (done) | Develop against SolidCraft 0.40.0-rc.2 with the new kernel solidcore instead of 0.30.1. PartBuddy's interface runs on it unchanged (contract tests pass on both), the command set only grew. Checked on 2026-11-05 with 29 existing designs: 10 rebuild unchanged, 19 lose fillets, chamfers and threads on cylinder faces because solidcore names those faces differently ("reselect it"); designs made in 0.40 do not have that problem. Parts with knurls or modelled threads rebuild up to seven times slower, other booleans much faster. 0.40 saves file format 50, which 0.30.1 cannot open. The step ([ADR 0024](adr/0024-solidcraft-040-solidcore.md)): the SolidCraft program becomes a setting with a version check, the local contract tests and the test version run 0.40 (the CI only ever runs the fake SolidCraft), test designs are backed up first. Move to 0.40.0 final when it is released; keep 0.30.1 selectable until then. Since 2026-11-08 PartBuddy recommends 0.40.0-rc.3 (contract tests pass on rc.2 and rc.3; rc.3 saves format 51, which rc.2 and 0.30.1 cannot open), and the first start links straight to that release, since the release list marks 0.30.1 "Latest". |
| R1 Remove slicer work (done) | Support walls in the model (#83), fix buttons at the indicator (#81), stepped bridges (#82), the cause detection and the slicer-style support reach behind them, and the print orientation with its proposal, marked loads, "print on this face" and the turned 3MF/STL export (#75). The "ready to print" indicator keeps build volume, thin walls, feature errors and bed contact, plus overhang by angle as a yellow hint that points at the spot (never red). The parked branch of the overhang view rework is deleted. The rules for designing without support stay in the assistant's instructions, with their switch. |
| R2 Remove further (done) | Fit assistant (#76), measuring after printing with its calibration suggestions (#77), the overhang view, drawing on the view and the before/after slider. The print profile becomes lean: printer with build volume, nozzle and layer height; material with clearance, hole allowance and overhang angle (the outer growth from measuring goes; saved profiles keep loading). ADRs and this catalogue are updated in the same step. |

### Phase 1: basics in every area

| Step | Content |
| --- | --- |
| B1 Model and effort (done) | The provider chip in the chat input shows provider, model and effort (for example "Claude · Opus · high"); a click chooses model and effort among what the subscription offers. It applies per chat and can change mid-conversation; the default for new chats is a setting. Claude Code gets `--model` and `--effort`, ChatGPT the model and `reasoning.effort`. Today neither is chosen: Claude Code runs with the account default and ChatGPT with a model PartBuddy picks. |
| B2 Projects (done) | One visible folder per project, by default `Documents\PartBuddy\<project>`, the root a setting. It holds the design (one `.sc` file, several bodies allowed, e.g. housing and lid), the chat, the versions and the exports. Saving stays automatic; the title bar shows "saved". Project actions: new, open, rename, duplicate, show in Explorer, delete (to the recycle bin). The single design under AppData moves into a project on first start. |
| B3 Start page (done) | Project tiles with preview image, name, last change and indicator state, a search, and new, open and import. PartBuddy always starts on it and opens no project on its own (product owner, 2026-11-05); the logo in the title bar opens and closes it. The preview (`preview.png`) and the light it was taken with (`preview.json`) are written into the project after every save, drawn by the renderer from the mirrored meshes from the isometric corner; import takes SolidCraft designs for now and grows with B4. |
| B4 Import (done) | STEP and IGES as editable bodies (`file.insert_step`), STL, 3MF and OBJ as mesh bodies (`file.insert_mesh`), either as a new project (start page, project menu, dropped on the start page) or into the open one (project menu, dropped on the work area; a circuit board to build a housing around). At a mesh body in the structure tree: "convert to faces" (`mesh.convert`). SolidCraft no longer has `body.repair`, so parts from STEP or IGES get no repair. SolidCraft 0.40 has no repair for meshes: an open mesh cannot be converted, PartBuddy says so, and it still exports (the slicer closes small holes). |
| B5 Versions (done) | PartBuddy saves a version at every export and before each request to the assistant (both only when the design changed since the newest version; the newest 30 automatic ones are kept); the user can save one with a name at any time and keeps it. Each version is a copy of the design with its preview picture in the project's `versions` folder. The list (clock button in the title bar) shows picture, name and reason; restoring keeps the state before as a version first. "Compare with now" tells per body what was added, removed or moved (`inspect.compare` on the version inserted on trial). |
| B6 Settings (done) | A settings window behind the gear with sections: General (language: like Windows, German or English, applied at once; theme; project folder, applied after a restart), SolidCraft (the program and its version), Assistant (route, sign-in, model and effort, design without support), Printer and material (the profiles, also from the material menu), About (version, licence notice, Ko-fi and source links). Replaces the gear menu and the separate profile and SolidCraft dialogs. |
| B7 Research (done) | The assistant may search the web and read pages (Claude Code's WebSearch and WebFetch, ChatGPT's web search). Sources appear as cards in the chat with their link; dimensions taken from a data sheet name their source. Page content is data, never instructions (prompt injection is considered). Standard parts from SolidCraft (`parts.insert`: screws, nuts, washers, bearings, pins) can be inserted as counterparts. |
| B8 To the slicer (done) | "Open in Bambu Studio / OrcaSlicer" next to export, through SolidCraft's slicer detection (`file.slicers`, `file.send_to_slicer`). "Print on this face" at a selected flat face sets SolidCraft's own print face (`body.print_face`), which the slicer export uses; PartBuddy adds no orientation logic of its own. |
| B9 First start (done) | A short setup that can be skipped at every step: find SolidCraft (with the download link to its GitHub releases), choose and sign in to an assistant, enter printer and material, confirm the project folder. Shown once, and not for installations that have projects already. |
| B10 Installer (done) | An NSIS installer per user with Start menu and desktop entries and an update check through GitHub releases (electron-updater, download and install on the user's word), unsigned (SmartScreen warns once): a hobby project without the money for a code-signing certificate, so it stays unsigned (decided 2026-11-06). The main process bundles every dependency but the native credential store, so the app is 9 MB plus Electron. Replaces the hand-copied test version. |
| B11 Project management (done) | Plan [projektverwaltung-2027](plans/projektverwaltung-2027.md), compared with Onshape, Fusion, Shapr3D, Plasticity, FreeCAD, Bambu Studio, OrcaSlicer and Printables. The start page sorts by last change, name or creation, and every tile has its menu (open, rename, duplicate, show, tags, export, delete) without opening the project. Deleting moves the folder into PartBuddy's own recycle bin (`.trash` in the project folder) with restore on the start page; after 30 days, or when emptied, it goes on to the Windows recycle bin. A project travels as one `.partbuddy` file (a checked zip without exports). Any version can be named and kept as a milestone, filtered and opened as a project of its own (the local stand-in for a branch; no merge, a SolidCraft design cannot be merged). Favourites stay on top, tags filter and are found by the search (`project.json`; tags instead of folders, product owner 2026-11-07). The structure tree keeps a parts list per body: copies, printed copies, filament and a note (`parts.json`), counted in the tree and on the tile and listed in the sharing package. Every new file is optional and additive: projects from before open unchanged (`test/compatibility.test.ts`). |

### Phase 2: features

| Step | Content |
| --- | --- |
| F1 Function blocks (done) | Inserted at a picked face, built on SolidCraft's commands: modelled threads and tapped holes (`solid.thread`, `solid.hole`), countersunk holes, snap fits, screw bosses and lids with lip or groove (`plastic.snap_fit`, `plastic.boss`, `plastic.lip`), text and logos embossed or engraved (`sketch.text`, `sketch.insert_svg`, `solid.emboss`), plus heat-set insert seats, nut traps and slots where SolidCraft has no command. |
| F2 Clearance between parts (done) | For prints of several parts, the indicator checks clearance and overlap between bodies with SolidCraft's exact measure (`inspect.clearance`): bodies that share volume, and gaps narrower than the material's push fit that are no contact, both as warnings that point at the place. Standard parts and mesh bodies are not measured; touching bodies stay the mesh check's "separate" finding. |
| F3 Templates (done) | A gallery of parametric starting points on the start page, renewed on 2026-11-11 to show what the app does now: a hinged box (print-in-place hinge of the mechanism tool; a lip inside the lid with a bead that snaps into a rille of the box's front wall, nothing standing out; joined so it closes under "Moving parts"), an adjustable stop on a dovetail guide (a slider joint, a clamp screw in a heat-set insert), a housing for heat-set inserts with its lid assembled and four M3 screws as standard parts (`parts.insert`; assembly playback and plate view apply), a sign whose words are a text parameter, and a wall holder with countersunk holes. Every template is a part one would print and use: two wheels coupled by `joint.gear` were taken out again, since without teeth (SolidCraft 0.40.0-rc.4 makes none) nothing drives the second wheel. Each is a SolidCraft script whose sizes are user parameters with a comment (`parameters.add`), built into a new project with `solidcraft-cli run` and changed in the parameter panel without the assistant; joints are part of the script and follow the parameters. The pictures are rendered by SolidCraft (`tools/templates/render-previews.mjs`). |
| F4 Rough sketch (done) | "Sketch" beside the chat input opens squared paper to draw on with the mouse or a pen (undo, clear). The picture goes with the next message as a PNG (Claude Code and ChatGPT), with a note that it is not to scale: the assistant says what it takes it to be and asks for the two or three sizes that decide the part before it builds. A sketch alone is a message ("make a part from my sketch"); the chat marks messages with a sketch. |
| F5 Sharing package (done) | "Sharing package …" in the export menu writes a new folder in the project's exports (never over an earlier one): the printable bodies as 3MF and STEP, four pictures rendered by SolidCraft (iso, front, top, right; 1600 × 1200) and a description in Markdown with material, layer, nozzle, supports from the ready-to-print check, parts with their sizes and the editable parameters; what the part is for is left for the user to write. Explorer opens on the folder. |
| F6 Photo import (done) | "Photo" beside the chat input attaches a PNG or JPEG of a real object; it goes with the next message as a PNG scaled to 1568 px, and with a project open it is kept in the project's `photos` folder. The note tells the model the photo has no scale: say what it sees and the part it takes the user to want (a holder, a part that fits), ask for the two or three critical dimensions, never read sizes off the pixels. For a straight-on photo it may lay it out with `canvas.insert` (PartBuddy allows exactly that file), scale it with `canvas.calibrate` and check the outline with `compare_picture`. A photo alone is a message; the chat marks it. |
| F7 Exploded view (done) | For prints of several parts (two or more bodies): a tool beside the section opens a slider from assembled to apart. Since the viewport CAD round (2026-11-07) each part backs out along the direction it is joined in, read from the assembly order (F12): parts later on the same way go further, a sub-assembly moves with its parts; dashed explosion lines lead back to where each sits, and opening, moving and closing glide. For looking only: picks, notes and dimensions return when it closes; a section, the plate and the playback exclude it. |
| F8 Local models (done) | Provider manager for local models ([ADR 0011](adr/0011-provider-manager.md), #26): the route "Local model" in the chip finds Ollama (11434), Strata (8080, by its `/health`), LM Studio (1234), llama.cpp (9931, 8080) and vLLM (8000) on this computer. Only models that call tools and have at least 16K context are offered (PartBuddy's instructions and SolidCraft's tools alone are about 9,400 tokens); llama.cpp and LM Studio say whether a model calls tools, otherwise one test call with a dummy tool decides before first use and a model that fails is dropped with the reason. Ollama runs through its own API with 16K `num_ctx`, LM Studio models not loaded yet are loaded by PartBuddy with 16K, Strata takes the chosen reasoning effort. The menu shows per model: in memory or loads on first use, busy with another request, context, picture input. Errors carry the server's own reason. Checked for real with Ollama 0.34, llama.cpp b12144, LM Studio 0.4.28 and vLLM 0.33 on the home server; Strata only against its recorded answers. |
| F9 Sketch tools (done) | Decided with the product owner on 2026-11-06: the sketch says sizes instead of leaving them to guesswork, without becoming a second CAD sketcher. Beside the freehand pen: line, rectangle, circle and arc (end to end, then a click for the bulge); points snap to half squares and to the corners drawn, Alt places freely, Shift keeps lines at 45° steps and rectangles square. Dimensions between two points with their value as typed ("40", "Ø 8", "R 3", mm) and labels ("M3 hole"). Pick and move, Delete, an eraser per element, undo and redo for every change, tool keys (V, P, L, R, C, A, M, T, E). Next to the picture the assistant gets the elements as a list in squares from the top left, the labels as quoted data; it builds from the dimensions and asks only for decisive sizes no dimension gives. |
| F10 Sketch sheets (done) | Views front, top and side as sheets of one sketch beside the free one, each named for the assistant and captioned in the one picture that goes along (two to a row); a scale per square ("1 square = 5 mm") so shapes on the grid have sizes in the list, typed dimensions winning. Every sent sketch is kept in the project (`sketches/<name>.json` with its picture), checked against the sketch schema when read, and opens again from "Earlier sketches". A photo (PNG or JPEG, picked, pasted or dropped) can lie under a sheet, fitted whole, with the squares faint above it; the list tells the assistant the marks are on a photo of the real object without scale. |
| F11 CAD viewport (done) | Viewport CAD round, 2026-11-07, after Onshape and Fusion: a view cube after Bentley's iTwin.js (MIT) with clickable faces, edges and corners, changed faces glowing briefly instead of staying tinted, line widths that shrink when zoomed out, a flat neutral background, a neutral part with dark silhouette and model edges, a faint contact shadow under the part, a grid that follows the part's size; navigation with zoom to the cursor, turning around the point under the cursor, fit all (F) and fit selection (Shift+F), all six views (1, 3, 7 and with Ctrl the opposite side, 0 iso), orthographic or perspective (5); display modes shaded with edges, shaded, hidden edges (dashed), X-ray and wireframe (Shift+1 to 5); radius and diameter of round edges, distance and angle between two picks at once from the view and then exact from SolidCraft; a section along an axis or aligned to a picked flat face, with the plane shown. The shadow map renders only on change and the resolution may drop while orbiting a heavy part. |
| F12 Plate view and assembly playback (done) | For prints of several parts. A switch "Assembled / Plate" lays every part on its print face (as PartBuddy set it; otherwise as designed) and nests the footprints on the bed of the chosen printer in a worker: convex hulls, turned in 15° steps, 5 mm between parts, 6 mm to the edge, more plates when needed, the layout centred; the bed with its size, parts larger or taller than the build volume marked, a switch between the plates. The one slicer-like task PartBuddy does on purpose; supports, paths and layers stay with the slicer. The assembly order ([ADR 0026](adr/0026-assembly-order.md)) comes from the assistant (`partbuddy_assembly`) or is proposed from the geometry (contact and containment, bottom up, fasteners last); "Assembly" plays it with play and pause, step back and forward, a timeline and the named steps, sub-assemblies first; the camera follows the step and its part stands out. |
| F13 Refined designs by default (done) | Decided 2026-11-07: the assistant designs nice, well-made parts without being asked. The rules go with the print profile note (`printNote`) in four groups: rounded and chamfered edges (outer radius 1/2/3 mm by part size, 45° chamfers on the bed, inner corners under load rounded), print-in-place joints first (gap one nozzle, at least 0.3 mm; another joint only with a reason), details (even walls, chamfered hole entries and lead-ins, sunk screw heads, soft transitions, text size) and sizes snapped to the printer (walls to whole lines of nozzle × 1.125, floors, lids, steps and chamfer heights to whole layers). Always on: sizes the user names are built exactly, with one sentence and a better value when they print poorly; fits by purpose with the material clearance scaled to the nozzle; printing before looks; one line per step naming what was added. Snapped parameters carry `[auto 3×line]` in their comment; a printer or nozzle change fits only those again, as user steps; a size the user sets in the table loses the mark; parameters of earlier projects have none and stay as they are. Off per group in Settings › Assistant, or for one project in the chat (`partbuddy_design_rules`, kept in the design's print file); the project goes before the setting. |
| F14 Material catalog and tolerance assistant (done) | Decided 2026-11-08, after R2 had removed measuring after printing (#77): measured are only the design values of a material profile, which the assistant needs while designing and no slicer knows; flow, temperature, shrinkage factor and calibration stay with the slicer. "Add material" in Settings › Printer and material copies one of 17 material types (#184) with starting values from design guides and data sheets, each with its source and a note where a value is derived. "Measure tolerances …" there: SolidCraft builds three test pieces for the nozzle and layer of the printer in use (`solidcraft-cli run`): a fit comb with a 6 mm pin and 13 holes from −0.1 to 0.5 mm clearance per side, a hole plate of 3, 5, 8 and 10 mm and an overhang staircase from 20° to 70°, every step engraved; together about 38 minutes and 13 g of PLA (Bambu Studio, X1C, 0.20 mm). Saved as 3MF or opened in a slicer SolidCraft found, with a picture SolidCraft renders and a short print guide. The user enters per fit the smallest step that clamps, pushes, slides or turns, the measured holes and the steepest clean overhang; `applyReadings` takes the steps, averages nominal minus measured on 0.05 mm and keeps every value in the profile's limits, a preview shows before and after, Apply writes into the settings draft and Save keeps it. |
| F15 Dimension field round (done) | Decided 2026-11-08: the dimension field of the selection dock ([ADR 0017](adr/0017-dimension-field.md)) grows where the assistant was still needed. ↑ and ↓ step the value by 1 mm, Shift by 10, Alt by 0.1, in the dock and in the dimension labels on the part. Two parallel flat faces of one body show their distance (wall, offset, step) and change it like an edge, found by the same trying in SolidCraft (`model.faces`: point and normal). When several parameters move the selection, the dock lists them with a preview of the picked one instead of asking the assistant. A drag arrow at the dimension (end of the edge, side of the cylinder, second face) sets the value by pulling it, in whole mm or tenths with Alt, and applies it when let go once SolidCraft has tried it; the arrow is a Tabler icon turned to the dimension on screen. |

### Phase 3: motion (release 0.3.0)

Decided with the product owner on 2026-11-10: parts that move are seen moving before they are
printed. SolidCraft's joints carry it ([ADR 0027](adr/0027-joints-for-motion.md)).

| Step | Content |
| --- | --- |
| G1 Joints that move (done) | The assistant makes moving bodies into components and joins them with SolidCraft's joints (`component.from_bodies`, `joint.as_built`, `joint.limits`), told so in its instructions. The mirror reads `joint.list`; a tool "Moving parts" in the view toolbar, there once the design has a joint, shows one slider per joint value between its limits. Letting go drives the joint (`joint.drive`), a step in the work log, and the view shows where the parts stand; "As designed" drives every joint back to 0. |
| G2 Collisions along the way (done) | The ready-to-print check runs every joint value from where it stands to its limits on a copy of the design (`joint.sweep`, a few milliseconds per joint). Parts that touch before a limit are a warning that names the joint, the two bodies, the value they meet at and the limit, and points at the place; a sweep that ends within 0.5° or 0.1 mm of the limit reached it (a flap folding flat onto its base). A snap fit is no stop either: parts that meet within 6° or 4 mm of the limit and are free of each other at the limit press past one another there (a lid's bead over the rim of its box); the limit's pose is tried and the joint put back where it stood. A joint left away from "as designed" is a warning too, since the design is exported as it stands. Both go to the assistant with the check, with what to do about them. |
| G3 Mechanisms the assistant applies (done: hinge, guide, closure) | Decided with the product owner on 2026-11-10: no gallery and no block at a face; the assistant uses them by itself when a design calls for one. `partbuddy_mechanism {kind: hinge, fixed, moving, from, to}` builds a print-in-place hinge between two bodies from SolidCraft's solids: knuckles in turn on both (3 to 9 by the length), a pin of half the barrel through them on the fixed body, the same gap everywhere (the nozzle in use, at least 0.3 mm), each knuckle clearing its room in the other body first. PartBuddy then makes the bodies components, joins them (`joint.as_built`), sweeps both ways and sets the limits a whole degree clear of where the bodies meet; bodies that still overlap are said in the answer. A piece that does not touch its body (SolidCraft's warning on the join) means the line is out of reach: everything is undone and the answer says where the line goes (practice run 2026-11-10: the real assistant took the tool by itself for a box with a hinged lid, but kept a gap between the hinge line and the walls and mended the loose knuckles with webs, whose warnings stayed in the timeline). A second run showed that what is built from the design level onto a body that is a component stays behind when the joint moves it (the lips of the lid hung in the air once it closed): the tool builds each step with its body's component active and asks for the joints at 0, the instructions tell the assistant to do the same for its own changes, and the check's note says that SolidCraft's "separate pieces" warning is real and how to mend it. One step in the work log. `kind: slide` builds a dovetail guide the same way: a rail on the fixed body that widens upwards at 45° (6 mm at its foot and 3 mm high unless said), its groove in the moving body a gap wider all round, joined as a slider whose limits keep the moving body on its rail (from its box, `inspect.measure`) and clear of contact. `kind: closure` (2026-11-11, after the product owner asked for standards the assistant cannot get wrong) builds the snap closure of a lid: a lip ring inside the lid, 1.2 mm thick and 4 mm high and 0.25 mm clear, on a foot with a 45° slope, a bead 0.5 mm proud with 45° flanks in the middle of one wall that snaps into a rille of the box's wall, and a notch for a fingernail; nothing stands out of the box and no wall is cut through. The lid is given by the corners of its inner room at the rim, the way the lip stands out (the lid lying open or sitting on the box) and, when it closes on a hinge, the hinge line, so the rille lands where the bead closes. It makes no joint. The hinged box template takes its closure from the same function (`lipSteps`). The sizes are those of printed snap lids in design guides, not yet confirmed by a print of ours. A pair of gears waits until SolidCraft makes teeth (`joint.gear` only couples two joints). |
| G4 Moving while dragging (slider done) | While a joint's slider is dragged, its bodies follow in the view at once: the mirror gives each joint a point on its axis, the axis and the bodies it moves (its own and those joined on beyond it, from `joint.list` and `component.list`), and the view turns them about the axis, right-handed as SolidCraft drives the joint, or shifts them along it by the difference to the mirrored value. Letting go drives SolidCraft once; when the mirror shows the bodies there the move is none, taken at once so nothing swings back. A closed loop follows only when the slider is let go. Open: dragging at the part itself (`joint.reach`). |

When convenient, between steps: Renovate, once its hosted GitHub app is installed for this
repository (`renovate.json` is ready). Done along the way: the loop guard (#117), the floor shadow
(#118), the parity test between interface and assistant (#119), the signing key on GitHub.

**Dropped on 2026-11-06:** the open view follow-ups "the HUD moves out of the way" and
"silhouettes"; they come back with a concrete picture from the test version.

**Dropped on 2026-11-05:** the command palette (Ctrl+K), and everything listed under R1 and R2.
Earlier: variants (ADR 0021), animation, renders and videos, Gemini CLI (#17) and OpenCode (#27).
Not for now: a personal library of own parts.

Verification levels used throughout the product (from the earlier workspace, rewritten):

| Level | Meaning | Proof |
| --- | --- | --- |
| R | Researched: statement from sources, not checked by the app | source reference |
| L | Created: file, script or model exists | path, commit |
| TG | Technically checked: automatic checks passed (sketches fully constrained, timeline without errors, volume against expectation, mesh closed) | check report |
| SC | Executed in SolidCraft: built live, saved, screenshot | design file, image, report |
| SL | Checked in the slicer: loads without repair, slice check passed | slice report |
| PD | Confirmed by print: printed, measured, function tested | measurement record (n entries) |

A level is shown only when its proof exists; higher levels never replace lower ones.

## Must

| Feature | Benefit | MVP |
| --- | --- | --- |
| Project overview with status, next step and verification levels per part | Resume work without reading files; replaces the status script | MVP |
| Live 3D view mirrored after every SolidCraft step, with "rebuilding" state | The user sees what the assistant does; the core idea of the product | MVP |
| Face and edge picking with hover highlight and the SolidCraft face name | Precise references for notes and requests | MVP |
| Notes on faces, edges, features and free points (anchored by name, see ADR 0006) | Context for AI requests ("this edge R2 instead of R1") | MVP |
| Chat with streaming answers, tool-call display and clarification cards (options, recommendation, reason) | The bundled question round of the earlier workflow, as UI | MVP |
| Provider manager: Anthropic, OpenAI, Gemini, GLM, DeepSeek, Mistral, OpenRouter, any OpenAI-compatible endpoint, Strata, Ollama, LM Studio, llama.cpp, vLLM; connection test; model per chat | Free model choice; local models for privacy | MVP |
| Existing subscriptions: Claude Pro/Max through the user's own Claude Code, ChatGPT Plus/Pro through Sign in with ChatGPT, Gemini through the Gemini CLI ([ADR 0015](adr/0015-subscription-access.md)) | No extra API costs for people who already pay for a plan | MVP |
| Status display for local servers (reachable, model loaded, context size, tool calling yes/no) | Explains slow or failing local runs | MVP |
| Timeline panel with feature names, errors and rollback position | Same mental model as Onshape and Fusion | MVP |
| Parameter panel with nominal value and print compensation as separate fields, ranges and sliders; range check before applying | Keeps the separation of nominal size and compensation; avoids failed rebuilds | MVP |
| Check panel: timeline check (TC rules), mesh check, overhang findings as a list | Honest status before printing | MVP |
| One-click print package through OrcaSlicer with the print gate (findings need a solution with proof) | The existing gate workflow without a terminal | MVP |
| Checkpoints and undo per assistant step | Trust: every step can be reverted | MVP |
| Connection states: SolidCraft not running, local server unreachable, model without tool calling, offline | No silent failures | MVP |
| API keys only in the Windows credential store (DPAPI) | Security requirement | MVP |
| German and English UI | Target market | MVP |
| Auto-update | Updates through GitHub releases; the installer stays unsigned (decided 2026-11-06), so SmartScreen warns on the first start | MVP |
| About dialog with licence notice and a "Support the project" link (Ko-fi, [ADR 0025](adr/0025-donations-through-ko-fi.md)) | Required by GPL-3.0 section 0; donations fund the project | MVP |

## Should

| Feature | Benefit |
| --- | --- |
| Overhang and wall-thickness overlay in the viewer (from the overhang and mesh tools) | Problems are visible where they are, not only as a list |
| Measure tool (point to point, face to face, radius) and section view (done in F11) | Standard CAD inspection |
| Print feedback form following the `pd.csv` structure (feature, result, measured value, nominal, tool) | Feeds the PD level and calibration without spreadsheets |
| Calibration overview with validity key (printer, nozzle, material, profile …) and proposals, never automatic changes | Keeps calibration honest |
| Command palette (Ctrl+K) with commands, settings and assistant actions | Fast keyboard work, as in Zoo and Plasticity |
| Editable plan before the assistant builds (approve, change, reject) (done in M2a: the plan card with Go, Change and Cancel; changes go through the chat) | Control over larger changes, as in Cursor |
| Per-tool permissions (always, ask, never) | Safety with weaker local models |
| Chat history with search across projects | Find earlier decisions |
| Cost and token display per chat and provider | Transparency with own API keys |
| Version comparison as geometric diff (added, removed, moved faces) | Review changes between part versions |
| Photo overlay with SolidCraft `compare_picture` | Check outlines against a photo of the real object |
| First-run setup that detects SolidCraft, OrcaSlicer and Blender and guides installation | External tools stay customer-installed (ADR 0007) |

## Could

| Feature | Benefit |
| --- | --- |
| Render gallery with Blender studio renders | Presentation images without leaving the app |
| Exploded view and joint animation for assemblies (exploded view and assembly playback done in F7 and F12; joint motion open) | Understand moving and multi-part designs |
| Parameter cards in the 3D view (as Shapr3D) (done: dimension labels on the part, M2b-3, and the dimension field with drag arrow, F15) | Edit a value where it acts |
| Photo markup for measuring instructions (where to measure, with which tool) | Better input for unknown functional dimensions |
| Knowledge panel: rules with IDs behind each recommendation | Explains why the assistant suggests something |
| Export snapshot as glTF with face IDs | Share a view state |
| Local-only mode switch that disables every cloud provider | Strong privacy promise |

## Won't (for now)

| Feature | Reason |
| --- | --- |
| Own CAD kernel | SolidCraft is the kernel (ADR 0004) |
| Bundling SolidCraft, OrcaSlicer or Blender | Keeps the installer small and their updates independent (ADR 0007) |
| Sign-in with Claude consumer plans | Not allowed by Anthropic for third-party apps |
| Cloud sync and team features | Not needed for the first market; privacy first |
| macOS and Linux builds | Windows first; the stack keeps them possible (ADR 0002) |

## Own ideas and why

* **Verification badges everywhere a part appears** (list, viewer header, print package): the
  earlier workflow's strongest quality rule becomes visible instead of hidden in reports.
* **Anchor health in the notes list** (attached, moved, ambiguous, orphaned): users see when a
  rebuild changed what a note refers to.
* **Model capability hints in the provider menu** (tool calling, images, context size, local): the
  user picks a model that can do the job before a run fails.
* **"Follow the assistant" camera** that frames each changed feature after a step: makes live
  building understandable without manual navigation.
