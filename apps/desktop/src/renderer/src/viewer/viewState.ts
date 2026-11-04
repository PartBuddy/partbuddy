import { edgeName, surfaceKind, type ViewerModel } from '@partbuddy/geometry';

import type { Selection, ViewState } from '../../../shared/contract';
import type { LiveChanges, ModelState, Pick } from '../state/store';

type Vec3 = [number, number, number];

function at(values: Float32Array, index: number): Vec3 {
  return [values[index * 3] ?? 0, values[index * 3 + 1] ?? 0, values[index * 3 + 2] ?? 0];
}

/** SolidCraft's name of edge `edge` and whether it is unique (the two faces meet only once). */
export function edgeLabel(model: ViewerModel, edge: number): { name: string; exact: boolean } {
  const a = model.edgeFaces[edge * 2] ?? 0;
  const b = model.edgeFaces[edge * 2 + 1] ?? 0;
  const faces = model.table.faces;
  let meetings = 0;
  for (let e = 0; e < model.edgeLengths.length; e += 1) {
    if (model.edgeFaces[e * 2] === a && model.edgeFaces[e * 2 + 1] === b) meetings += 1;
  }
  return { name: edgeName(faces[a]?.name ?? `#${a}`, faces[b]?.name ?? `#${b}`), exact: meetings === 1 };
}

/** End points of an edge: the vertices that coincide with its first and last segment ends. */
function edgeEnds(model: ViewerModel, edge: number): Vec3[] {
  const first = model.edgeRanges[edge * 2] ?? 0;
  const count = model.edgeRanges[edge * 2 + 1] ?? 0;
  const ends: Vec3[] = [];
  for (let v = 0; v < model.vertices.length / 3; v += 1) {
    const corner = at(model.vertices, v);
    for (let s = first; s < first + count; s += 1) {
      const hit = [at(model.edgeSegments, s * 2), at(model.edgeSegments, s * 2 + 1)].some(
        (p) => p[0] === corner[0] && p[1] === corner[1] && p[2] === corner[2],
      );
      if (hit) {
        ends.push(corner);
        break;
      }
    }
    if (ends.length === 2) break;
  }
  return ends;
}

/** The radius of a cylinder the edge lies on (a hole or boss rim), if one of its faces is one. */
function edgeRadius(model: ViewerModel, edge: number): number | undefined {
  for (const index of [model.edgeFaces[edge * 2], model.edgeFaces[edge * 2 + 1]]) {
    const face = index === undefined ? undefined : model.table.faces[index];
    if (face?.cylinder) return face.cylinder.radius;
  }
  return undefined;
}

/** The selection as the assistant gets it: names and a few numbers, no picture. */
export function selectionOf(model: ModelState, pick: Pick | null): Selection | null {
  if (!pick || model.status !== 'ready') return null;
  const body = model.bodies[pick.body];
  if (!body) return null;
  const viewer = body.model;
  switch (pick.kind) {
    case 'face': {
      const face = viewer.table.faces[pick.face];
      if (!face) return null;
      const selection: Selection = { kind: 'face', body: body.name, face: face.name, surface: surfaceKind(face), area: face.area, point: pick.point, normal: pick.normal };
      if (face.cylinder) selection.radius = face.cylinder.radius;
      return selection;
    }
    case 'edge': {
      if (pick.edge >= viewer.edgeLengths.length) return null;
      const { name, exact } = edgeLabel(viewer, pick.edge);
      const selection: Selection = { kind: 'edge', body: body.name, edge: name, exact, length: viewer.edgeLengths[pick.edge] ?? 0, point: pick.point, ends: edgeEnds(viewer, pick.edge) };
      const radius = edgeRadius(viewer, pick.edge);
      if (radius) selection.radius = radius;
      return selection;
    }
    case 'vertex':
      if (pick.vertex * 3 >= viewer.vertices.length) return null;
      return { kind: 'vertex', body: body.name, point: at(viewer.vertices, pick.vertex) };
  }
}

/** Short text for chips and the status bar: the face or edge name, or the vertex position. */
export function selectionName(selection: Selection): string {
  if (selection.kind === 'face') return selection.face;
  if (selection.kind === 'edge') return selection.edge;
  return selection.point.map((value) => Math.round(value * 100) / 100).join(' ');
}

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

/** What the view shows, for the assistant's `partbuddy_view` tool. */
/** Every selection the assistant can read, in picking order. */
export function selectionsOf(model: ModelState, picks: Pick[]): Selection[] {
  return picks.map((pick) => selectionOf(model, pick)).filter((selection): selection is Selection => selection !== null);
}

export function viewStateOf(model: ModelState, picks: Pick[], changes: LiveChanges | null, camera: CameraView | null): ViewState {
  const ready = model.status === 'ready';
  return {
    camera,
    selections: selectionsOf(model, picks),
    bodies: ready ? model.bodies.map((body) => ({ name: body.name, faces: body.model.table.faces.length })) : [],
    sketches: ready ? model.sketches.map((sketch) => ({ name: sketch.name, active: sketch.active })) : [],
    changes: changes ? { faces: changes.count, sketchCurves: changes.sketchCurves } : null,
  };
}
