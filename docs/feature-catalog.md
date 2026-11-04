# Feature catalogue

Features ordered by MoSCoW. **MVP** marks the first release; the product owner confirmed the cut on
2026-11-04. Existing workflows of the earlier CAD workspace come first: the product makes them
usable without a terminal. Sources of the patterns: [research § Role models](research.md#6-role-models-competitors-and-names).

## Direction and roadmap

Decided by the product owner in the idea round of 2026-11-04. It sets the order of work; the
MoSCoW tables below stay the reference for each feature's benefit.

**Guiding idea:** PartBuddy is a real CAD workspace for makers, with SolidCraft as the engine behind
it ([ADR 0016](adr/0016-headless-solidcraft.md)). The user points at geometry and changes it; the
assistant does what needs intent. **Direct where it is unambiguous, the assistant where intent is
needed:** a dimension driven by a parameter or sketch dimension changes at once, without tokens and
with a preview; anything else becomes a short, structured request to the assistant, which asks
with a clarification card when there are several sensible ways.

| Milestone | Content |
| --- | --- |
| M1 Workspace | Layout with a structure tree (bodies, sketches, features) on the left, the timeline at the bottom and the chat on the right. CAD look: model edges and silhouettes, studio lighting, pre-highlight on hover and outline selection for faces, edges and vertices, orthographic and perspective views with standard views. Selection HUD: a dimension field at the selection (direct or through the assistant, see above), actions that fit the selection (fillet, chamfer, extrude by, hole, shell), free text to the assistant with the selection attached, multiple selection shown as chips in the chat, and measurements of the selection. |
| M2 Assistant work log and variants | The chat as a work log: plan, steps and result; every step a card with a preview and plain text that highlights its faces on hover and can be gone back to ([ADR 0018](adr/0018-work-log.md)); tool details only on demand. Markups: notes on the model (ADR 0006), drawing on the view (sent to the assistant as text, an image only on request), dimensions of the selected feature shown in the view, clearer before/after of the last step later ([ADR 0020](adr/0020-markups.md)). Variants: "show me three", built one after another in the same design, each recorded and the design reset, browsed as kept shapes and replayed when the user takes one ([ADR 0021](adr/0021-variants.md)). |
| M3 Providers | Provider manager for local models ([ADR 0011](adr/0011-provider-manager.md), #26), Gemini CLI over ACP (#17), OpenCode over ACP (#27). |
| M4 Building blocks and templates | Function blocks inserted parametrically on a picked face: heat-set insert seat, countersunk screw hole, snap hook, hinge, nut trap, slot. Template gallery as starting points (box with lid, wall holder, cable clip, housing, adapter). New parts also from an opened STEP, STL or 3MF, and from a rough 2D sketch drawn with the mouse. |
| M5 Photo import | Holder for the object in a photo, rebuilding a part from photos, a photographed hand sketch with dimensions, and a photo as background for comparing outlines (`compare_picture`). The scale comes from the user: the assistant asks for the two or three critical dimensions with a hint where and how to measure. |
| M6 Show and move | Own versions, inspired by SOMA but not copied. Exploded view: PartBuddy works out the direction each part comes off (contact faces and SolidCraft's joints), a slider from assembled to apart, parts adjustable by dragging, explosion lines, also for the bodies of a single part; assembly steps that bring the parts together in order and give an illustrated assembly guide for the sharing package. Animation from SolidCraft's real joints (slider or playback: hinge, slide, gear) and from a sequence the assistant writes as data (keyframes per joint or part, editable in a timeline; no generated code runs), with collision display during motion and a turntable. Renders inside the app by GPU path tracing: studio light, soft shadows, PLA/PETG-like materials, transparent background, plus videos of animations and the turntable; no extra install. |
| M7 Ready to print | Printer and material profile per project, the "ready to print" indicator with reasons that point at the spot on the model (ADR 0010), fit assistant (two faces: push, clamp, slide, turn), print orientation proposal that knows where the load acts, measured values after printing feeding corrections. |

Also wanted, not yet placed in a milestone: project overview with preview tiles, named versions per
part with compare and restore, and a sharing package (3MF, STEP, preview images, description) for
Printables and MakerWorld. Not for now: a dark theme and a personal library of own parts.

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
