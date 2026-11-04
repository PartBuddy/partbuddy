---
status: accepted
date: 2026-11-04
---

# Mirror SolidCraft geometry through face-tagged 3MF and the face table

## Context and Problem Statement

PartBuddy shows its own 3D view while SolidCraft builds the model in the background. After every
feature step the view must update, faces and edges must be pickable, and each triangle must map to
the CAD face it belongs to, so that notes and selections can refer to topology. Which path brings
the geometry into the viewer with a stable face mapping and acceptable latency?

Evidence: [research § Geometry pipeline](../research.md#2-geometry-pipeline).

## Decision Drivers

* Correct mapping triangle → SolidCraft face, including the persistent face name
* Latency per step small compared to SolidCraft's own rebuild
* Ready-made, permissively licensed components on the hot path
* A fallback for foreign files and for SolidCraft versions without the tagged export

## Considered Options

* Face-tagged 3MF (`file.export {format: "3mf-tagged"}`) plus `model.faces`, parsed in a worker
* STEP export, tessellated with occt-import-js or replicad (OCCT compiled to WebAssembly)
* glTF with `EXT_mesh_features` face IDs
* Native OCCT tessellation in a sidecar process

## Decision Outcome

Chosen option: "Face-tagged 3MF plus `model.faces`", because it is the only path that keeps
SolidCraft's own face numbering and names. Per step:

1. The SolidCraft supervisor in the main process (own glue) holds a control-channel subscription and reacts to
   `design.changed {document_id, revision}`.
2. One `batch` call: `file.export` (3mf-tagged) and `model.faces` for each changed body.
3. A worker unzips with fflate, parses `ft:face` per triangle into typed arrays and joins the
   face table (name, `exact`, area, centroid, normal, cylinder data).
4. Edges are derived where neighbouring triangles carry different face IDs; SolidCraft names
   edges `faceA|faceB`, so derived edges get its names.
5. three-mesh-bvh builds the picking structure (`indirect: true`, because the default reorders the
   index buffer); the geometry is swapped in one step.
6. Note anchors are re-resolved ([ADR 0006](0006-note-anchoring.md)).

Fallback chain: plain 3MF with faces assigned by closest point to `model.faces[].point` → STEP with
occt-import-js (LGPL-2.1, shipped as a separate replaceable file; signature-only anchoring) →
rendered image only.

### Consequences

* Good, because the measured pipeline overhead is about 70 ms for a 30-face part, 200 ms for
  110 faces and 0.7 s for 410 faces, while SolidCraft's rebuild takes 0.4 s, 3 s and 23 s.
  The viewer keeps the previous mesh with a "rebuilding" state and never blocks.
* Good, because the hot path uses only MIT-licensed libraries (three, three-mesh-bvh, fflate).
* Bad, because face indices change on every rebuild (18 of 30 faces after one parameter change in
  the benchmark). Nothing may be cached by face index; anchors use names.
* Bad, because the tagged 3MF format is at version 1 and SolidCraft releases often. Every
  SolidCraft update needs a contract test (export, face table, index check) before the supported
  version is raised.
* Neutral: the three.js `3MFLoader` ignores foreign namespaces, so a small own parser is needed.
  It is part of the geometry adapter and covered by fixture tests (`tools/fixtures`).

### Confirmation

A contract test runs the fixture script through the pinned SolidCraft CLI, exports the tagged 3MF
and the face table, and checks that every `model.faces[].point` lies on a triangle with the same
face ID.

## Pros and Cons of the Options

### STEP + occt-import-js

* Good, because it reads any STEP file.
* Bad, because the STEP face set differs from SolidCraft's (22 vs 30, 70 vs 110, 346 vs 410
  faces in the benchmark); names cannot be mapped back.
* Bad, because it is 20–35 times slower than parsing the tagged 3MF and LGPL-2.1.

### glTF with EXT_mesh_features

* Bad, because SolidCraft has no glTF export and the extension is a draft; an extra conversion
  step would add latency without new information. Kept as a possible export format.

### Native OCCT sidecar

* Bad, because it ships a second CAD kernel with LGPL obligations and still loses SolidCraft's names.
