---
status: accepted
date: 2026-11-04
---

# SolidCraft without a window: the headless engine as PartBuddy's default

## Context and Problem Statement

Until now PartBuddy started the SolidCraft app with its control channel (`solidcraft.exe --control`)
when none was running, and mirrored the design from it ([ADR 0004](0004-geometry-pipeline.md)). The
user then had two windows showing the same part. The product owner decided on 2026-11-04 that
SolidCraft should not be visible at all and that PartBuddy's own view is the live viewport. How does
PartBuddy run SolidCraft without its window?

## Decision Drivers

* No second window; PartBuddy's view is the only one
* The mirror (face-tagged 3MF, `model.faces`, `sketch.inspect`) and the assistant's tools keep
  working unchanged
* No work is lost although the design lives in a process without a window
* A SolidCraft window the user opened on purpose is still used as it is

## Considered Options

* Start `solidcraft.exe` hidden (`windowsHide`, or hiding its window afterwards with Win32 calls)
* `solidcraft-cli mcp --headless`: SolidCraft's engine as an MCP server on stdio, without a window
* Keep the window and show SolidCraft's own render (`ui.render`) inside PartBuddy

## Decision Outcome

Chosen option: "`solidcraft-cli mcp --headless`", because it is SolidCraft's documented mode without a
window and runs every engine command, while a hidden app window is not supported (SolidCraft 0.30.1
has no option for it; `windowsHide` is ignored, **checked 2026-11-04**) and Win32 tricks would be
fragile and Windows-only.

**Measured** with SolidCraft 0.30.1 on 2026-11-04: the engine answers the MCP handshake in about
9 ms (the app window takes seconds). One `batch` call runs `document.inspect`, `model.faces`,
`file.export` (3mf-tagged) and `sketch.inspect` in 8 ms. A failed batch reports `failed` with the
command and the reason, as the control channel does.

* **Start:** when no SolidCraft window is found, PartBuddy starts
  `solidcraft-cli mcp --headless --allow-path …` with the mirror cache, the designs folder and the
  user's project folder (`Documents\PartBuddy`). SolidCraft drops allowed folders that do not exist
  yet, so PartBuddy creates them first. A window the user opened is still found by discovery and
  used over the control channel; `PARTBUDDY_SOLIDCRAFT_WINDOW=1` starts the window instead (tests
  that drive SolidCraft over its control channel).
* **One client, so no events needed:** the headless engine sends no `design.changed`. PartBuddy is
  its only client: every assistant call passes `HeadlessEngine.tools`, and after each call PartBuddy
  reads `document.revision` (one batch, about 1 ms of engine time) and mirrors when it moved.
* **Mirror:** the same `mirrorActiveDesign` as before, through a small adapter that answers
  `document.inspect` and `engine.batch` with the MCP `batch` tool. Calls use a 10-minute timeout,
  because rebuilds of large parts take minutes and the SDK's default is one minute.
* **Tools for the assistant:** the engine's own MCP tools, through the same gate proxy and policy
  ([ADR 0015](0015-subscription-access.md)) and with `partbuddy_view`.
* **Autosave:** 1.5 s after a mirrored change PartBuddy saves the design to
  `%APPDATA%\PartBuddy\designs\<design name>.sc` and notes it in `last.json`; on quit it saves at once.
  The next start opens that file (`--in`). The engine names a design after its file, so the file is
  named after the design; names are reduced to letters, digits, spaces, `_` and `-` (no path
  separators). If the file does not open, PartBuddy starts with a new design and keeps the file.
  Saving moves the revision; PartBuddy records it without mirroring again.

### The user's own actions (added 2026-11-04)

Without the window the user had no way to export, undo or edit by hand. PartBuddy now offers these
in its title bar; they work with both engines and wait while the assistant changes the design:

* **Undo / Redo** (buttons, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z outside text fields): `edit.undo` and
  `edit.redo` in one `engine.batch`. `document.inspect` reports `undo` and `redo` depths; the
  mirror passes them on, so the buttons know when there is nothing to undo.
* **Export** as 3MF, STL or STEP: the user picks the file in the system's save dialog; SolidCraft
  writes into the cache folder only and PartBuddy copies the file to the chosen place, so the
  engine's allowed folders do not grow. This is the user's own export; the assistant's tools stay
  refused until the check and export gates of [ADR 0010](0010-rule-engine-and-check-gates.md).
* **Open in SolidCraft:** PartBuddy saves the design to the project folder (`Documents\PartBuddy`),
  ends the engine and opens the file in the SolidCraft window (`solidcraft --control PORT FILE`),
  which it then follows over the control channel. The user owns that window: PartBuddy does not
  quit it on exit. When the user closes it, PartBuddy starts the engine again with that file
  (`resume` in the supervisor machine). A design from the project folder is autosaved back to its
  own file from then on; the note of the last design accepts paths in the designs and project
  folders only.

**Measured** with SolidCraft 0.30.1 on 2026-11-04: undo and redo move the revision and the depths;
the export of a 20 × 20 × 10 mm box gives a binary STL with 12 triangles; the full round trip
(open in the window, follow it, close it, run headless again with the same design) passes in the
contract test.

### Consequences

* Good, because there is one window and PartBuddy starts SolidCraft in milliseconds.
* Good, because mirror, tools, policy and view context are the same code for both engines.
* Bad, because the user can no longer edit in SolidCraft's own interface while PartBuddy runs it.
  PartBuddy therefore offers the basics itself (added 2026-11-04, see "The user's own actions").
* Bad, because the design lives in the engine process; a crash loses the changes since the last
  autosave (at most 1.5 s plus the save). After a crash PartBuddy shows "SolidCraft is not running"
  and starts the engine again on request, with the saved design.
* Neutral: SolidCraft's own render (`ui.render`) is not available headless; the `screenshot` tool
  renders on the CPU instead, and PartBuddy prefers `partbuddy_view` ([ADR 0005](0005-ai-layer.md)).

### Confirmation

* `apps/desktop/e2e/solidcraft.contract.spec.ts` (opt-in `PARTBUDDY_E2E_SOLIDCRAFT=1`): PartBuddy
  starts the engine without opening a SolidCraft window and the engine ends on quit; a step of the
  test double of Claude Code builds a box in the headless design, it is mirrored, and after a
  restart the saved design is open again under its name.
* Unit tests cover the file names of the designs folder (no traversal, fallback name) and the note
  of the last design.
* The same contract test undoes and redoes a step, exports an STL outside SolidCraft's allowed
  folders and runs "Open in SolidCraft" there and back. Unit tests cover the handoff states of the
  supervisor machine, undo, redo and export over the control channel, and project-folder notes.

## Pros and Cons of the Options

### Hidden app window

* Good, because the control channel and its events stay as they are.
* Bad, because SolidCraft offers no hidden mode and ignores `windowsHide`; hiding the window after
  it appears flickers, needs native calls and works on Windows only.

### SolidCraft's render inside PartBuddy

* Good, because it shows exactly what SolidCraft draws.
* Bad, because the window stays open, and pictures neither follow PartBuddy's camera nor support
  picking faces and anchoring notes.
