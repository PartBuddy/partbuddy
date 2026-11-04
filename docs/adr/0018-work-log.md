---
status: accepted
date: 2026-11-04
---

# The work log: steps found again by their undo depth

## Context and Problem Statement

The assistant's chat should read as a work log (roadmap M2a): every change of the design is a
card with a picture, a line of plain text, the changed faces lighting up on hover, the tool
details on demand, and "Go back to this state". How does PartBuddy return to the state after any
step, and come forward again, without losing work?

## Decision Drivers

* Going back must not destroy the later steps: the user may want them back
* Works for the assistant's steps and the user's own changes (dimension field, actions, timeline)
* No extra tokens: the plain text comes from the commands, not from the model
* The model must know when the user went back or changed something, or it plans on a state that
  no longer exists

## Considered Options

* SolidCraft checkpoints (`edit.checkpoint` after each step, `edit.restore_checkpoint` to go back)
* SolidCraft's undo history: remember the undo depth after each step, Undo or Redo to it
* Rebuild from a saved command script per step

## Decision Outcome

Chosen option: **the undo depth**. Checked with SolidCraft 0.30.1: restoring a checkpoint also
drops every later checkpoint and the whole redo history, and only the last 16 checkpoints are
kept, so a jump back could never be followed by a jump forward. `document.inspect` reports
`undo` and `redo` as stack depths, and Undo and Redo run in one `engine.batch`.

* The work log (`main/agents/workLog.ts`) wraps SolidCraft's tools and the user's own changes.
  Calls that may change the design (`execute`, `batch`, `set_parameter`, `undo`, `redo`) run one
  at a time; the revision and undo history are read before and after. A call that grew the
  history, or replaced the redo history, becomes a step with its depth and tool call id.
* A step is *applied* while its depth is within Undo, *undone* while Redo still reaches it, and
  *discarded* once a new change replaced it or the design is another one. Every mirrored revision
  updates the states, so Undo from anywhere is followed.
* "Go back to this state" undoes or redoes to the step's depth; only an applied or undone step
  can be reached.
* Plain text: `shared/stepPhrases.ts` turns commands and parameters into message keys with
  values (English and German); the main process writes the English text into notes for the model.
* The picture is taken from PartBuddy's own view once the step's revision is on screen (one extra
  render into a 224 × 140 canvas, WebP data URL). The changed faces are kept by face name, so the
  hover still finds the ones that exist after later rebuilds.
* Before the next message, the model gets one note: what the user changed, undid or went back to
  since its last turn, and to inspect the design before changing it.

### Consequences

* Good: going back loses nothing until the user changes something new, like Undo in any editor.
* Good: the user's own changes are in the log too, so going back never removes them silently.
* Bad: a changing tool call costs two extra history reads (a few milliseconds each).
* Bad: the log lives in memory; after a restart or "Open in SolidCraft" the undo history is new and
  older cards can no longer be reached. Keeping versions per part is a later roadmap item.
* Bad: a change made directly in the SolidCraft window is not a card; the states still follow it.
