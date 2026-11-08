import type { ViewerModel } from '@partbuddy/geometry';

import type { DimensionTarget } from '../../../shared/contract';
import type { BodyModel, Pick } from '../state/store';
import { edgeLabel } from './viewState';

/** What the dimension field in the selection dock edits (M1b), worked out from the mirrored model. */

type Shown = 'length' | 'diameter' | 'radius' | 'spacing';

export interface Dimension {
  shown: Shown;
  /** The value as shown (a diameter is twice the radius SolidCraft is asked about). */
  value: number;
  target: DimensionTarget;
  /** From the shown value to the value of the target's measure. */
  scale: number;
}

/** True when the face's own edges include a closed loop: a full hole or boss, shown as a diameter. */
function hasClosedLoop(model: ViewerModel, face: number): boolean {
  for (let e = 0; e < model.edgeLengths.length; e += 1) {
    if (model.edgeFaces[e * 2] !== face && model.edgeFaces[e * 2 + 1] !== face) continue;
    const first = model.edgeRanges[e * 2] ?? 0;
    const count = model.edgeRanges[e * 2 + 1] ?? 0;
    const start = model.edgeSegments.subarray(first * 6, first * 6 + 3);
    const end = model.edgeSegments.subarray((first + count) * 6 - 3, (first + count) * 6);
    if (count > 2 && start.every((value, i) => Math.abs(value - (end[i] ?? 0)) < 1e-6)) return true;
  }
  return false;
}

function radiusDimension(model: ViewerModel, body: string, face: number): Dimension | null {
  const info = model.table.faces[face];
  if (!info?.cylinder) return null;
  const full = hasClosedLoop(model, face);
  return {
    shown: full ? 'diameter' : 'radius',
    value: full ? info.cylinder.radius * 2 : info.cylinder.radius,
    target: { measure: 'radius', body, face: info.name },
    scale: full ? 0.5 : 1,
  };
}

/** The distance between two parallel flat faces of one body, or null. */
export function spacingDimension(bodies: BodyModel[], a: Pick, b: Pick): Dimension | null {
  if (a.kind !== 'face' || b.kind !== 'face' || a.body !== b.body || a.face === b.face) return null;
  const body = bodies[a.body];
  const first = body?.model.table.faces[a.face];
  const second = body?.model.table.faces[b.face];
  const n = first?.planeNormal;
  const m = second?.planeNormal;
  if (!body || !first || !second || !n || !m) return null;
  if (Math.abs(Math.abs(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]) - 1) > 1e-6) return null;
  const value = Math.abs(n[0] * (second.point[0] - first.point[0]) + n[1] * (second.point[1] - first.point[1]) + n[2] * (second.point[2] - first.point[2]));
  if (!(value > 1e-6)) return null;
  return { shown: 'spacing', value, target: { measure: 'distance', body: body.name, faces: [first.name, second.name] }, scale: 1 };
}

/** What the dimension field edits: one edge's length or cylinder's radius, or the distance of two parallel faces. */
export function dimensionFor(bodies: BodyModel[], picks: Pick[]): Dimension | null {
  const [a, b] = picks;
  if (picks.length === 1 && a) return dimensionOf(bodies, a);
  return picks.length === 2 && a && b ? spacingDimension(bodies, a, b) : null;
}

/** What the dimension field edits for a selection: an edge length, or the radius of a cylinder. */
export function dimensionOf(bodies: BodyModel[], pick: Pick): Dimension | null {
  const body = bodies[pick.body];
  if (!body) return null;
  const model = body.model;
  if (pick.kind === 'face') return radiusDimension(model, body.name, pick.face);
  if (pick.kind !== 'edge') return null;
  for (const face of [model.edgeFaces[pick.edge * 2], model.edgeFaces[pick.edge * 2 + 1]]) {
    if (face !== undefined && model.table.faces[face]?.cylinder) return radiusDimension(model, body.name, face);
  }
  const length = model.edgeLengths[pick.edge] ?? 0;
  if (!(length > 0)) return null;
  return { shown: 'length', value: length, target: { measure: 'length', body: body.name, edge: edgeLabel(model, pick.edge).name, point: pick.point }, scale: 1 };
}
