---
status: accepted
date: 2026-11-04
---

# The dimension field: change the driving parameter directly, the assistant otherwise

## Context and Problem Statement

The product owner wants to select an edge, see its length in a field, type a new value and have
PartBuddy carry it out (idea round of 2026-11-04, roadmap M1b). Sending every such change to the
assistant costs seconds and tokens; changing geometry without knowing what drives it breaks the
design. How does PartBuddy know which parameter drives a selected edge, and how does it show the
result before the user commits to it?

## Decision Drivers

* Direct where it is unambiguous, the assistant where intent is needed (decided 2026-11-04)
* No guessing: a direct change must be proven to move the selected edge to the new value
* Formulas are the designer's intent and are never overwritten
* A preview before Enter, without changing the design or its undo history

## Considered Options

* Match the edge to a feature input by geometry rules (edge direction, feature type)
* Try every candidate parameter in SolidCraft and measure the result
* Always ask the assistant

## Decision Outcome

Chosen option: "Try every candidate parameter in SolidCraft and measure the result", because it is
exact for every feature type SolidCraft has, needs no rules per feature and costs a few
milliseconds per candidate.

* **Candidates:** length parameters (`parameters.list`, unit mm) whose expression is a plain number
  and whose value equals the edge length, or the radius of a cylindrical face (also twice the
  radius: a diameter parameter). At most eight are tried.
* **Try:** one `engine.batch` per candidate: `parameters.change`, `model.edges` or `model.faces`,
  then `sketch.inspect` of a sketch that does not exist. That last step fails on purpose, and
  SolidCraft undoes the whole batch, undo history included, but still returns the earlier results.
  **Checked** with SolidCraft 0.30.1 on 2026-11-04: `rollback: true` alone undoes nothing when no
  step fails, and `parameters.change` with an unknown name creates a parameter, so neither can end
  a try. The edge is found again by its name (and the picked point when SolidCraft adds `~k`).
* **Direct:** exactly one candidate moves the selection to the new value. The same kind of batch
  with a face-tagged 3MF export gives the ghost preview. Enter sets the parameter for real; the
  main process accepts only a plain length parameter and a factor of 1 or 2.
* **Assistant:** no candidate or several. Enter sends a short structured request ("Change the
  length of F1:+x|F1:-y from 20 mm to 32 mm. Keep the rest of the part as it is.") with the
  selection note.
* Probes run one at a time, 250 ms after the last keystroke, and not while the assistant works. A
  probe moves SolidCraft's revision although the design is the same; the headless engine records
  it without mirroring.

### Consequences

* Good, because a direct change is proven before it happens, and it takes no tokens.
* Good, because the user sees the result as a ghost before pressing Enter.
* Bad, because an edge driven by a formula or by several parameters always goes to the assistant,
  even when a rule could have found the right one.
* Neutral: with the SolidCraft window, every probe sends `design.changed`, so the unchanged design
  is mirrored again.

### Confirmation

* Unit tests (`test/dimensions.test.ts`): candidates skip formulas and other units, a 20 × 20 box
  tells length from width only by trying, every try ends with the failing read, `apply` refuses
  formulas and unknown names.
* Contract test against SolidCraft 0.30.1: a 20 mm edge of a box is set to 32 mm through the
  field with a preview first, the edge is 32 mm afterwards, and Undo brings back 20 mm.
