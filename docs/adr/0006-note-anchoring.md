---
status: accepted
date: 2026-11-04
---

# Anchor notes to persistent face names with a signature fallback (own implementation)

## Context and Problem Statement

Users pin notes to timeline features, faces, edges or free points. The notes are context for the
AI ("this edge R2 instead of R1"). After a rebuild with changed parameters a note must still sit on
the same face, or say clearly that it lost its place. Face indices change on every rebuild, so an
anchor needs a more robust identity.

This is an own implementation; no ready-made library solves anchoring against SolidCraft topology.
Evidence: [research § Note anchoring](../research.md#23-note-anchoring).

## Decision Drivers

* Notes must not silently jump to a wrong face
* Works with SolidCraft's naming, including split, merged and geometry-only (`exact: false`) faces
* Cheap enough to run after every step (a few hundred faces)

## Considered Options

* Persistent face name as primary key, face-local position, signature and free point as fallbacks
* World point only (re-pick the nearest face after rebuild)
* Face index from the tagged export
* A generic geometric-hashing library

## Decision Outcome

Chosen option: "Persistent face name with fallbacks", because SolidCraft itself stores references
by name and resolves them through split and merge lineage, and a world point does not move with
the face.

Anchor record (stored by PartBuddy, not in the design file; since [ADR 0020](0020-markups.md) the
anchor as set is stored in the `.sc` file, the resolved fields stay in memory):

```text
NoteAnchor
  kind        face | edge | feature | free
  body        body name
  scName      face name, or "faceA|faceB" for an edge
  exact       flag from model.faces
  feature     creating feature id and name
  local       position in the face's own frame (u/v on planes, angle and height on cylinders)
  world       last resolved point and normal
  signature   surface type, normal or axis, radius, area, centroid, neighbour face names
  revision    document id and revision of the last resolution
  status      attached | moved | ambiguous | orphaned
```

Re-resolution after each revision:

1. Exact name match → place by the face-local position, snap to the face with three-mesh-bvh.
2. Lineage match (`name#[…]`, `#k` pieces) → nearest piece to the old point; status `moved`.
3. Signature score (type gate, normal/axis within 5°, radius ±5 %, area ratio, centroid distance,
   neighbour overlap) → accept at ≥ 0.75 with a margin of ≥ 0.15, otherwise `ambiguous`.
4. Free point relative to the body's bounding box.
5. Otherwise `orphaned`: the note stays in the list with a re-attach action.

Faces with `exact: false` and pattern instances (`@F…k`) always get the signature check, even on a
name hit.

### Consequences

* Good, because notes never move without telling the user (`moved`, `ambiguous`, `orphaned`).
* Good, because the matching is plain arithmetic over at most a few hundred faces (< 1 ms).
* Bad, because the score weights are a first proposal; they are tuned on test designs before 1.0.
* Bad, because the anchor depends on SolidCraft's naming scheme; a change in naming needs a
  migration and is caught by the contract test of [ADR 0004](0004-geometry-pipeline.md).

### Confirmation

Fixture tests change parameters of the sample model and assert the expected status of each test
note (attached, moved, orphaned).

## Pros and Cons of the Options

### World point only

* Bad, because the point stays in space while the face moves; after a length change the note lands
  on the wrong face or in the air.

### Face index

* Bad, because indices are reassigned on every rebuild (benchmark: 18 of 30, 93 of 110 faces).

### Geometric-hashing library

* Bad, because no maintained library for B-rep face matching was found; the signature check needs
  no library.
