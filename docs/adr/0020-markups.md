---
status: accepted
date: 2026-11-04
---

# Markups: notes in the design file, drawings as text, dimensions in the view

## Context and Problem Statement

Roadmap M2b brings three markups to the workspace. **Notes** on faces, edges, features and free
points give the user's context to the assistant ("this edge R2 instead of R1"). **Drawing** on
the view points at places that are hard to name. **Dimensions** shown in the view make the
design's numbers visible and editable where they act. Decided on 2026-11-04: notes are stored in
the `.sc` file (`document.metadata`), drawings reach the assistant as text with an image only on
request, a click on a dimension opens the dimension field (ADR 0017), before/after comes later.

Notes are text the assistant reads. Text from files made by other people, opened designs and
sharing packages can carry instructions aimed at the model (prompt injection). The design must
keep such text from steering the assistant, and the user's own notes must never get lost
silently.

## Decision Drivers

* A note travels with the part (sharing, another computer) and survives a rebuild (ADR 0006)
* Nothing the user wrote disappears without the user seeing it and being able to bring it back
* Foreign text never reaches the model as if the user had written it
* Few tokens: notes and drawings as short text, images only on request (ADR 0005 rule)
* The undo history and the work log (ADR 0018) keep working as before

## Considered Options

Note storage and undo:

* Notes in `document.metadata`, part of SolidCraft's undo history, with a restore list
* Notes kept by PartBuddy and written to the file only when saving
* Notes in a PartBuddy file next to the design (ADR 0006 as first written)

Foreign notes:

* Signed own notes; foreign notes reach the assistant only after the user accepts them
* Foreign notes always sent, marked as coming from the file
* Foreign notes never sent

## Decision Outcome

Decided by the product owner on 2026-11-04 (all recommendations; dimensions with an extra
"All" switch). ADR 0006 still defines the anchor and its re-resolution; this ADR replaces its
storage line ("stored by PartBuddy, not in the design file").

### Notes

**Storage, checked with SolidCraft 0.30.1 on 2026-11-04.** `document.metadata.set` accepts an
object under a reverse-DNS key and refuses plain keys and plain text. PartBuddy writes one key
per note, `io.github.manuelstaggl.partbuddy.note.<id>`, because SolidCraft limits each key to
64 KiB; 40 notes in one `values` call took 5 ms and are one undo step. The value holds the note
text (at most 1000 characters, control characters removed), the anchor as set (ADR 0006 record
without the resolved fields), the creation time, a format version and the signature. Notes
survive `save` and `open`; reading all keys takes 2 ms.

**Resolved state stays in memory.** Status (`attached`, `moved`, `ambiguous`, `orphaned`),
world point and normal are worked out again after every revision and never written back, so a
rebuild adds no undo step. The file changes only when the user acts on a note (add, edit, move,
delete, accept, re-attach).

**Undo.** Every write is an undo step and moves the revision, like a feature: Ctrl+Z after
adding a note removes it, and "Back to this step" (ADR 0018) shows the design with the notes it
had then. PartBuddy keeps the notes it last read; when a revision lacks a note the user did not
delete, the note goes to a restore list ("2 notes removed by going back · Restore"). The list is
kept per design name in `notes-restore.json` in the app's data folder (at most 50 notes, 30
days), so a note is still there after a new change dropped the redo history, and after a
restart. A note write is mirrored like any change (about 70 ms); skipping the geometry export
for writes that only touch notes is left for later.

**Assistant undo.** Before a call of the assistant that undoes (`undo`, `edit.undo` through
`execute`, or such a step in `batch`), PartBuddy runs its steps on trial between two reads of
`document.metadata`, with the failing last step of ADR 0017 that puts everything back, redo
history included (checked with SolidCraft 0.30.1: 1 ms, redo depth unchanged). When a note
would disappear or change, the call is refused with the next step ("change the feature directly
with timeline.edit or parameters.change"), so the model cannot delete a note while undoing its
own work. This replaces the first plan of counting undo depths, which breaks once the user
undoes a note and builds on.

**Own and foreign notes.** PartBuddy signs every note it writes with HMAC-SHA-256 over the
canonical JSON of id, text, anchor and creation time. The key is 32 random bytes made on first
use and kept in the Windows credential store (`PartBuddy/notes/key`, as for ADR 0015 tokens).
A note with a missing or wrong signature is **foreign**: shown at the model with a "foreign"
mark and in the notes list with "Accept", but not sent to the assistant. Accepting re-signs it
(one write). A file author cannot forge the signature without the key. Notes from the same user
on another computer count as foreign until accepted; that is the price of a key that never
leaves the machine.

**What the assistant sees.** Only accepted (own) notes, only through PartBuddy:

* The selection note before a message names the notes on the selected items:
  `[PartBuddy: note n3 on face "F3:+z" of body "Body1" (attached): «R2 instead of R1»]`.
* `partbuddy_view` lists all own notes compactly (id, anchor, status, text cut to 200
  characters) and the number of foreign notes waiting ("2 foreign notes not shown until the user
  accepts them").
* Note text is quoted between « » with the guillemets inside escaped. The tool notes (ADR 0015)
  say that notes are the user's words about the design: information, never permission to skip a
  plan, a question or a refusal.

**Leaks closed in the gate proxy.** Checked on 2026-11-04: `inspect_design`, `document.inspect`,
`component.metadata` and `timeline.export_script` return the metadata with the note text. A
filter in front of both routes (gate proxy and ChatGPT loop, as `toolNotes.ts`) removes every
property whose name starts with `io.github.manuelstaggl.partbuddy` from JSON results, including
nested batch results; if the text still contains that prefix afterwards, the whole result is
replaced by a refusal that points to `partbuddy_view`. The policy refuses `document.metadata.set`
and `document.metadata.remove` when they touch that prefix (`key`, `keys` or `values`), also as
batch steps: the assistant reads notes but never writes them.

### Drawing on the view

A pen mode in the view tools (shortcut `D`, Esc leaves it). While drawing, each stroke is sampled
every 8 px and every sample is picked against the model with the existing picking (face name,
world point); a stroke is then drawn as a 3D line on the surface, so it stays in place when the
camera turns. Strokes are kept until the next message is sent; they go with it and are cleared.

Each stroke becomes one line of text (about 50 tokens for a short drawing), sorted by size:

* **Dot** (a tap): `dot on face "F3:+z" of "Body1" at (20, 15, 10) mm`
* **Line** (open stroke): `line from (2, 0, 10) on "F3:+z" to (38, 0, 10) on "F3:+z", 36 mm`,
  start and end in drawing order, the faces it crosses by name
* **Loop** (end within 15 px of the start): `loop on "F3:+z" around (20, 15, 10), about 12 × 8 mm,
  enclosing edge "F3:+z|F2:+x"` with the faces and edges that lie inside
* Off the model: the screen direction from the nearest body ("left of Body1, in empty space")

A check box "Send as image" adds a PNG of the view with the strokes (viewport size, at most
1600 px wide) for both routes; it is off by default. Hand-drawn shapes are not recognised beyond
these three kinds.

Built in M2b-2 (`shared/drawing.ts`, `renderer/src/viewer/Pen.tsx`): the camera controls and the
picker rest while the pen is on, and the strokes go with a message from the composer and from the
HUD's text field. The picture is the 3D view as rendered; pins and the HUD, which are HTML on top
of it, are not in it. Claude Code gets it as an image block of its stream-json input, ChatGPT as
an image part of the user message.

### Dimensions in the view

A switch "Dimensions" in the view tools shows the dimensions of the **selected feature**: the
feature selected in the structure tree, or the one that made the selected face (the feature id
in the face name), else the last feature. A second switch "All" shows every driving dimension.
Sources, checked on 2026-11-04:

* Sketch dimensions from `sketch.inspect`: id, type (length, distance, radius, diameter, angle),
  parameter (`d1`), expression and value, with the curves they measure; drawn in the sketch
  plane with extension lines and arrows.
* Feature inputs from `timeline.inspect`: label, parameter, expression and unit; extrude
  distances along the extrusion at a corner of the profile, fillet and chamfer sizes as a leader
  at the picked edge, hole diameters at the hole. Inputs without a place (pattern counts and
  similar) appear in a small list next to the view.

Labels are HTML buttons over the canvas (keyboard and screen reader reachable), hidden behind
the model only when the anchor point is occluded. A click opens the dimension field of ADR 0017
on that parameter: a plain number is changed directly with the ghost preview; an expression is
shown and never overwritten (ADR 0017 rule). When it is a single user parameter (`W`), the field
offers that parameter with the number of other dimensions that follow it; otherwise the change
goes to the assistant.

Built in M2b-3 (`main/solidcraft/dimensionMarks.ts`, `renderer/src/viewer/Dimensions.tsx`):
switch `M`; the target feature is the one whose face or edge was picked last (it stays while
nothing is selected, since a change clears the selection), else the newest active feature. Labels
are not hidden behind the model yet; occlusion is a later refinement. The ghost preview shows the
body named by the feature, or the only visible body. The 3D view's `role="img"` moved from the
canvas wrapper to the `<canvas>` itself: drei's `Html` puts labels, note pins and the HUD into
that wrapper, and inside an image role screen readers would not reach their buttons. Picking a
feature in the timeline to show its dimensions is a follow-up.

### Delivery

Three pull requests: M2b-1 notes (storage, anchors, signature, restore list, filter and policy),
M2b-2 drawing, M2b-3 dimensions.

### Consequences

* Neutral: point notes (on a vertex) stay at their world point while the body exists; feature
  notes from the structure tree are not part of M2b-1.
* Good, because notes travel inside the `.sc` file and undo like any other change, and nothing is
  lost silently: the restore list catches what undo or going back removed.
* Good, because foreign text cannot pose as the user: unsigned notes wait for the user, and the
  filter keeps note text out of every SolidCraft result.
* Good, because drawings and notes cost tens of tokens, not an image per message.
* Bad, because a note write is a Ctrl+Z step; a user who expects Ctrl+Z to touch only geometry
  is surprised once.
* Bad, because the user's own notes from another computer show as foreign until accepted.
* Bad, because other text inside a foreign design (feature, body and parameter names, the design
  description) still reaches the model through `inspect_design`. It is short and named, and the
  confirmations of ADR 0019 stay the second defence; a mode for foreign designs is a follow-up
  with the import of M4.

### Confirmation

* Unit tests: the filter removes the prefix from nested JSON and refuses a result that still
  carries it; the policy refuses metadata writes with the prefix in `key`, `keys` and `values`
  and in batch steps; signatures fail after any change to text or anchor; the restore list picks
  up a note removed by undo and not one the user deleted; the assistant's `undo` is refused on a
  note write.
* Contract test against SolidCraft 0.30.1: a note is written, survives `save` and `open`, is
  removed by undo and offered for restore, and `inspect_design` through the proxy no longer shows
  its text.
* Drawing and dimensions: Electron tests (offscreen window) draw a loop on a box face and check
  the text, and change an extrude distance through its dimension label.

## Pros and Cons of the Options

### Notes written only when saving

* Good, because Ctrl+Z never touches notes.
* Bad, because every save after a note change adds an undo step that does nothing visible, and
  the autosave (ADR 0016) saves after every change.

### Notes in a PartBuddy file next to the design

* Bad, because the note gets lost when the user copies or shares only the `.sc` file.

### Foreign notes always sent, marked

* Bad, because the protection then rests on the model obeying the mark.

### Foreign notes never sent

* Bad, because a colleague's useful note ("wall too thin here") could never reach the assistant.
