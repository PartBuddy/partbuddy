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
(supports, bridges, orientation in detail, calibration). Before a new feature, ask whether it is
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
| R0 SolidCraft 0.40 (done) | Develop against SolidCraft 0.40.0-rc.2 with the new kernel solidcore instead of 0.30.1. PartBuddy's interface runs on it unchanged (contract tests pass on both), the command set only grew. Checked on 2026-11-05 with 29 existing designs: 10 rebuild unchanged, 19 lose fillets, chamfers and threads on cylinder faces because solidcore names those faces differently ("reselect it"); designs made in 0.40 do not have that problem. Parts with knurls or modelled threads rebuild up to seven times slower, other booleans much faster. 0.40 saves file format 50, which 0.30.1 cannot open. The step ([ADR 0024](adr/0024-solidcraft-040-solidcore.md)): the SolidCraft program becomes a setting with a version check, the local contract tests and the test version run 0.40 (the CI only ever runs the fake SolidCraft), test designs are backed up first. Move to 0.40.0 final when it is released; keep 0.30.1 selectable until then. |
| R1 Remove slicer work (done) | Support walls in the model (#83), fix buttons at the indicator (#81), stepped bridges (#82), the cause detection and the slicer-style support reach behind them, and the print orientation with its proposal, marked loads, "print on this face" and the turned 3MF/STL export (#75). The "ready to print" indicator keeps build volume, thin walls, feature errors and bed contact, plus overhang by angle as a yellow hint that points at the spot (never red). The parked branch of the overhang view rework is deleted. The rules for designing without support stay in the assistant's instructions, with their switch. |
| R2 Remove further (done) | Fit assistant (#76), measuring after printing with its calibration suggestions (#77), the overhang view, drawing on the view and the before/after slider. The print profile becomes lean: printer with build volume, nozzle and layer height; material with clearance, hole allowance and overhang angle (the outer growth from measuring goes; saved profiles keep loading). ADRs and this catalogue are updated in the same step. |

### Phase 1: basics in every area

| Step | Content |
| --- | --- |
| B1 Model and effort (done) | The provider chip in the chat input shows provider, model and effort (for example "Claude · Opus · high"); a click chooses model and effort among what the subscription offers. It applies per chat and can change mid-conversation; the default for new chats is a setting. Claude Code gets `--model` and `--effort`, ChatGPT the model and `reasoning.effort`. Today neither is chosen: Claude Code runs with the account default and ChatGPT with a model PartBuddy picks. |
| B2 Projects (done) | One visible folder per project, by default `Documents\PartBuddy\<project>`, the root a setting. It holds the design (one `.sc` file, several bodies allowed, e.g. housing and lid), the chat, the versions and the exports. Saving stays automatic; the title bar shows "saved". Project actions: new, open, rename, duplicate, show in Explorer, delete (to the recycle bin). The single design under AppData moves into a project on first start. |
| B3 Start page (done) | Project tiles with preview image, name, last change and indicator state, a search, and new, open and import. PartBuddy always starts on it and opens no project on its own (product owner, 2026-11-05); the logo in the title bar opens and closes it. The preview (`preview.png`) and the light it was taken with (`preview.json`) are written into the project after every save, drawn by the renderer from the mirrored meshes from the isometric corner; import takes SolidCraft designs for now and grows with B4. |
| B4 Import (done) | STEP and IGES as editable bodies (`file.insert_step`), STL, 3MF and OBJ as mesh bodies (`file.insert_mesh`), either as a new project (start page, project menu, dropped on the start page) or into the open one (project menu, dropped on the work area; a circuit board to build a housing around). At an imported body in the structure tree: "repair" for parts from STEP or IGES (`body.repair`, gaps sewn and holes patched) and "convert to faces" for mesh bodies (`mesh.convert`). SolidCraft 0.40 has no repair for meshes: an open mesh cannot be converted, PartBuddy says so, and it still exports (the slicer closes small holes). |
| B5 Versions (done) | PartBuddy saves a version at every export and before each request to the assistant (both only when the design changed since the newest version; the newest 30 automatic ones are kept); the user can save one with a name at any time and keeps it. Each version is a copy of the design with its preview picture in the project's `versions` folder. The list (clock button in the title bar) shows picture, name and reason; restoring keeps the state before as a version first. "Compare with now" tells per body what was added, removed or moved (`inspect.compare` on the version inserted on trial). |
| B6 Settings (done) | A settings window behind the gear with sections: General (language: like Windows, German or English, applied at once; theme; project folder, applied after a restart), SolidCraft (the program and its version), Assistant (route, sign-in, model and effort, design without support), Printer and material (the profiles, also from the material menu), About (version, licence notice, GitHub Sponsors and source links). Replaces the gear menu and the separate profile and SolidCraft dialogs. |
| B7 Research (done) | The assistant may search the web and read pages (Claude Code's WebSearch and WebFetch, ChatGPT's web search). Sources appear as cards in the chat with their link; dimensions taken from a data sheet name their source. Page content is data, never instructions (prompt injection is considered). Standard parts from SolidCraft (`parts.insert`: screws, nuts, washers, bearings, pins) can be inserted as counterparts. |
| B8 To the slicer (done) | "Open in Bambu Studio / OrcaSlicer" next to export, through SolidCraft's slicer detection (`file.slicers`, `file.send_to_slicer`). "Print on this face" at a selected flat face sets SolidCraft's own print face (`body.print_face`), which the slicer export uses; PartBuddy adds no orientation logic of its own. |
| B9 First start (done) | A short setup that can be skipped at every step: find SolidCraft (with the download link to its GitHub releases), choose and sign in to an assistant, enter printer and material, confirm the project folder. Shown once, and not for installations that have projects already. |
| B10 Installer (done) | An NSIS installer per user with Start menu and desktop entries and an update check through GitHub releases (electron-updater, download and install on the user's word), unsigned for now (SmartScreen warns); signing comes before the public release. The main process bundles every dependency but the native credential store, so the app is 9 MB plus Electron. Replaces the hand-copied test version. |

### Phase 2: features

| Step | Content |
| --- | --- |
| F1 Function blocks (holes and seats done; snap fits, lips, text, nut traps and slots next) | Inserted at a picked face, built on SolidCraft's commands: modelled threads and tapped holes (`solid.thread`, `solid.hole`), countersunk holes, snap fits, screw bosses and lids with lip or groove (`plastic.snap_fit`, `plastic.boss`, `plastic.lip`), text and logos embossed or engraved (`sketch.text`, `sketch.insert_svg`, `solid.emboss`), plus heat-set insert seats, nut traps and slots where SolidCraft has no command. |
| F2 Clearance between parts | For prints of several parts, the indicator checks clearance and overlap between bodies (`inspect.clearance`, `inspect.interference`). |
| F3 Templates | A gallery of parametric starting points: box with lid, wall holder, cable clip, housing, adapter. |
| F4 Rough sketch | Draw a 2D sketch with the mouse; the assistant makes a part from it. |
| F5 Sharing package | 3MF, STEP, preview images and a description for Printables and MakerWorld. |
| F6 Photo import | Limited to one or two cases when planned: a holder for the object in a photo, an outline compared with the photo (`canvas.insert`, `compare_picture`). The assistant asks for the two or three critical dimensions. |
| F7 Exploded view | For prints of several parts: a slider from assembled to apart, explosion lines. |
| F8 Local models | Provider manager for local models ([ADR 0011](adr/0011-provider-manager.md), #26). |

When convenient, between steps: small follow-ups of the view (hide dimension labels behind the
model, the HUD moves out of the way, ground shadow, silhouettes), a parity test (every action in the
interface is an assistant tool or has a written reason), a loop guard in the gate proxy, the
signing key on GitHub, Renovate.

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
| Signed installer and auto-update | Trusted distribution without SmartScreen warnings | MVP |
| About dialog with licence notice and a "Support the project" link (GitHub Sponsors) | Required by GPL-3.0 section 0; donations fund the project | MVP |

## Should

| Feature | Benefit |
| --- | --- |
| Overhang and wall-thickness overlay in the viewer (from the overhang and mesh tools) | Problems are visible where they are, not only as a list |
| Measure tool (point to point, face to face, radius) and section view | Standard CAD inspection |
| Print feedback form following the `pd.csv` structure (feature, result, measured value, nominal, tool) | Feeds the PD level and calibration without spreadsheets |
| Calibration overview with validity key (printer, nozzle, material, profile …) and proposals, never automatic changes | Keeps calibration honest |
| Command palette (Ctrl+K) with commands, settings and assistant actions | Fast keyboard work, as in Zoo and Plasticity |
| Editable plan before the assistant builds (approve, change, reject) | Control over larger changes, as in Cursor |
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
| Exploded view and joint animation for assemblies | Understand moving and multi-part designs |
| Parameter cards in the 3D view (as Shapr3D) | Edit a value where it acts |
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
