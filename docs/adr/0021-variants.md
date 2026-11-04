---
status: accepted
date: 2026-11-04
---

# Variants by recording and replaying the assistant's changes

## Context and Problem Statement

"Show me three" (roadmap M2c): the assistant builds two to four variants of a change, the user
browses them in a strip under the view and takes one. The idea round of 2026-11-04 decided to
build them one after another in the same design and to keep each as a SolidCraft checkpoint.
Checked with SolidCraft 0.30.1 (ADR 0018): restoring a checkpoint drops it and every later one
and the whole redo history, and only the last 16 are kept, so variant A is gone once variant B is
restored. PartBuddy needs another way to hold several finished variants and to bring back the one
the user takes, without breaking the undo history and the work log.

## Considered Options

* Record each variant's changing tool calls, return to the starting state, replay the chosen one
* Each variant as one command batch from the assistant, built only on trial
* Each variant saved as its own `.sc` file, the chosen one opened

## Decision Outcome

Chosen option: **record and replay** (decided by the product owner on 2026-11-04, replacing the
checkpoint plan), because the user watches each variant being built, as with every other change,
and the design, its undo history and the work log stay as they are.

**Checked with SolidCraft 0.30.1 on 2026-11-04 (headless):** on a 40 × 20 × 10 mm box, variant A
(sketch on a face, a circle cut through, a fillet: features 2–4, curves `l1…l4`, `c1`, 7982.82
mm³) was built, undone to the box in 1 ms, variant B (a chamfer) built and undone, and A's
commands replayed as one batch. The result was the same features, the same curve and feature ids
and the same volume. Undo rewinds SolidCraft's id counters with the design, so commands that
name ids replay exactly on the same starting state.

### Flow

1. **Start.** The user presses **Variants** at the composer (2–4, default three) or writes "show
   me three …". When the assistant is unsure between ways, it may offer variants with a card
   (`partbuddy_offer_variants {count, request}`); it builds only after the user's click.
2. **Build, one turn per variant.** PartBuddy keeps control of the loop: it records the starting
   state (document id, undo depth) and asks the assistant for variant *k of n* with the request
   and the short descriptions of the variants so far ("differ clearly from these"). The assistant
   builds as usual, visible live, and ends with `partbuddy_variant_done {name, difference}`.
3. **Record.** During a variant turn PartBuddy records every changing call (`execute`, `batch`,
   `set_parameter`, `undo`, `redo`) with its arguments, as the work log already sees them, plus
   the measured volume and bounding box afterwards. No step cards appear for variant turns; a
   variant card does.
4. **Keep and reset.** At `variant_done` PartBuddy keeps the mirrored bodies (face-tagged 3MF)
   and a thumbnail of the view, then undoes back to the starting depth. A variant turn that ends
   without `variant_done`, or stops, is reset the same way and shown as failed.
5. **Browse.** The strip under the view shows each variant with its thumbnail, name and the
   assistant's difference line. A click shows its kept bodies in the view, rotatable, with a bar
   "Preview of variant B · Back to the part"; the design itself does not change. Dimensions,
   selection and notes do not work in the preview.
6. **Take.** **Take this one** replays the recorded calls on the starting state, as one work-log
   step "Variant B taken", and compares volume and bounding box with the recording. A mismatch
   is reported and the replay stays (the user can undo it). If the design changed since the
   variants were built (another document id or undo depth), taking is refused with that reason.
   **Discard** clears the strip; the design is already at the starting state.

Variants live for the session, in memory. The assistant's normal tool policy and question gates
apply in variant turns; the note guard (ADR 0020) keeps it from undoing past the starting state
into the user's notes.

### Built (M2c)

`main/agents/variants.ts` runs the loop; `engineSteps.ts` turns recorded tool calls into engine
steps (shared with the note guard's undo trial). The kept state is mirrored at once
(`supervisor.mirrorNow`), so the renderer shows exactly that revision and takes the picture
(`VariantThumbs`) before PartBuddy resets; it waits at most 6 s for it. The work log is quiet
during variant turns (no step cards); taking a variant is one user step "Variant “B” taken".
The strip sits between the view and the timeline; while a variant is shown, picking, the HUD,
notes, dimensions and the pen rest. "show me three" / "zeig mir drei" in a message starts
variants as well as the composer's Variants switch.

### Consequences

* Good, because each variant is built in the open, like any change, and taking one is exact.
* Good, because the undo history and "Back to this step" keep working; nothing is overwritten.
* Bad, because n variants cost n assistant turns: time and tokens grow with the count, which is
  why the count is 2–4 and the assistant only offers variants.
* Bad, because a replay depends on the same starting state; any change in between refuses taking.
* Neutral: browsing shows kept shapes, not the live part, so dimensions and notes wait until a
  variant is taken.

### Confirmation

* Unit tests: recording keeps only changing calls in order; replay batches them; the start check
  refuses a changed design; volume or bounding box mismatch is reported.
* E2E against headless SolidCraft with the test double of Claude Code: three variants of a box,
  the design back at the box after each, browsing shows each kept shape, taking B gives B's
  volume and one work-log step, undo returns to the box.

## Pros and Cons of the Options

### Each variant as one command batch, built on trial

* Good, because nothing in the design moves until the user takes one.
* Bad, because the user does not see variants being built, and a variant that needs a question
  or several steps cannot be expressed as one batch.

### Each variant as its own file

* Bad, because opening a file replaces the design and its undo history; the work log's "Back
  to this step" would no longer reach anything before the variant.
