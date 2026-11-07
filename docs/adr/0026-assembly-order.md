---
status: accepted
date: 2026-11-07
---

# Assembly order per project

## Context and Problem Statement

A print of several parts (housing, board holder, lid, screws) goes together in an order. The 3D
view should play that order as an animation and pull the parts apart along the directions they
are joined in, instead of radially from the middle (F7 until 2026-11-07). SolidCraft has joints
for kinematics, but no assembly sequence, and PartBuddy's designs are mostly bodies in one
document, not components. Where does the order come from, what does it hold, and where is it kept?

## Considered Options

* An own data model per project, set by the assistant, with a proposal from the geometry when it
  is missing
* SolidCraft's joints and components as the source
* Only a proposal from the geometry, nothing stored

## Decision Outcome

Chosen option: **an own data model per project**, because the assistant knows the intent while it
designs the parts (what clips into what, which way a lid goes on), the geometry alone can only
guess it, and joints would force a component structure onto designs that do not need one.

* Schema (`apps/desktop/src/shared/assembly.ts`, Zod, part of the IPC contract): `version: 1`,
  `source` (`assistant` or `suggested`), `groups` (sub-assemblies with their `parent`, nested to any
  depth, no loops) and `steps` with `name`, `part` (a body or a group), `target` (what it joins
  onto), `direction` (the way the part moves into place, model space, Z up) and `group`.
* Kept as `assembly.json` in the project folder, written through a temporary file. A missing or
  invalid file means "no order": older projects open unchanged, and an invalid file is logged.
* The assistant sets it with the PartBuddy tool `partbuddy_assembly` (both routes, never forwarded
  to SolidCraft). PartBuddy checks it against the schema and the bodies of the design and answers
  with the names it knows when a part is unknown.
* Without an order the view proposes one from the bodies' boxes: the largest of the lowest parts is
  the base; then parts that touch what is placed, a part inside another first, bottom up; standard
  parts and very small parts last. Each step joins the part it touches most, from above when it
  sits over it, from the side otherwise. The proposal is computed, not stored, and named as such.
* Playback: sub-assemblies first (deepest first), then each goes into its parent as one piece.
  The exploded view is the same order run backwards.

### Consequences

* Good, because the animation and the exploded view follow the design intent where the assistant
  stated it, and still work for every older project.
* Good, because the file is plain JSON in the user's project folder, readable and versionable.
* Bad, because the order can go stale when bodies are renamed; steps naming missing bodies are
  dropped and bodies the order does not name join at the end, so the view never breaks.
* Bad, because the proposal works on boxes: a part that only touches through a slanted face may be
  taken as free. SolidCraft's clearance check can replace the box test when that matters.

### Confirmation

Unit tests for the schema, the playback order, the proposal, the file and the tool
(`apps/desktop/test/assembly.test.ts`); an end-to-end case plays the assembly of a two-part print.
