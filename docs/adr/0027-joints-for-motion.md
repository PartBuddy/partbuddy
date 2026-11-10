---
status: accepted
date: 2026-11-10
---

# Joints for motion come from SolidCraft

## Context and Problem Statement

Release 0.3.0 makes moving parts visible: a hinge opens in the view, a slider slides, and the
ready-to-print check will follow the motion. Parts that move need joints. SolidCraft has them
(`joint.as_built`, `joint.drive`, `joint.limits`, `joint.sweep`), but only between components,
and PartBuddy's designs are bodies in one document. [ADR 0026](0026-assembly-order.md) kept the
assembly order out of SolidCraft's joints for that reason. Where do joints live, and what happens
to designs that have none?

## Considered Options

* SolidCraft's joints, with components made only where a joint needs them
* An own joint model in PartBuddy that moves the mirrored meshes in the view
* Components for every design of several parts

## Decision Outcome

Chosen option: **SolidCraft's joints, components only where a joint needs them**, because
SolidCraft already solves the motion, its limits, closed loops and the first contact along the way
(checked with 0.40.0-rc.3 on 2026-11-10: a hinge of two plates stops at 28.07° and at −179.99°,
each sweep in about 5 ms), and an own model would have to redo all of it.

* The assistant makes the bodies that move into components (`component.from_bodies`) and joins them
  (`joint.as_built`, which moves nothing). It calls SolidCraft's commands through `execute`; no
  PartBuddy tool stands between. The bodies keep their names, so notes, the assembly order and the
  exploded view go on working.
* The mirror reads `joint.list` with every revision; the structure carries the joints with their
  values and limits.
* The view shows one slider per joint value. Letting go drives the joint (`joint.drive`), which is
  a step in SolidCraft's history like any other, and the mirror shows where the parts stand.
* The pose is part of the design, as in SolidCraft: what is exported and checked is the design as
  it stands. "As designed" drives every joint back to 0, the position an as-built joint was made in.
* A design without joints stays as it is: no components, no extra request beyond `joint.list`.

### Consequences

* Good, because motion, limits and collisions are SolidCraft's and exact.
* Good, because older projects open unchanged.
* Bad, because the view follows only when the slider is let go; moving while dragging needs the
  parts' transforms in the view and comes with dragging at the part itself.
* Bad, because a design left open at an angle is exported at that angle; the check along the way
  (next step) names it.

### Confirmation

Unit tests for reading `joint.list` and for the phrases of the work log; an end-to-end case moves
a joint with the slider against the SolidCraft double; a contract case builds a hinge in the real
SolidCraft, drives it and reads it back through the mirror.
