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

type Vec3 = [number, number, number];

/** Where the drag arrow of a dimension sits, the way that makes the value larger, and how much a mm of drag adds. */
export interface DimensionHandle {
  origin: Vec3;
  direction: Vec3;
  /** A diameter grows by 2 mm for each mm the side moves out. */
  perMm: number;
  /** The value may be zero or negative (a logo's distance from its face's middle). */
  signed?: boolean;
}

function unit(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-9 ? [v[0] / length, v[1] / length, v[2] / length] : null;
}

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
const dot = (a: readonly number[], b: readonly number[]) => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);

/**
 * The drag arrow for the dimension of a selection: at the far end of an edge along it, on a
 * cylinder outwards from its axis, at the second of two faces away from the first.
 */
export function handleOf(bodies: BodyModel[], picks: Pick[], dimension: Dimension): DimensionHandle | null {
  const [a, b] = picks;
  const model = a ? bodies[a.body]?.model : undefined;
  if (!a || !model) return null;
  const target = dimension.target;
  if (target.measure === 'length' && a.kind === 'edge') {
    const first = model.edgeRanges[a.edge * 2] ?? 0;
    const count = model.edgeRanges[a.edge * 2 + 1] ?? 0;
    if (count < 1) return null;
    const points = model.edgeSegments.subarray(first * 6, (first + count) * 6);
    const direction = unit(sub(Array.from(points.subarray(3, 6)), Array.from(points.subarray(0, 3))));
    if (!direction) return null;
    // The segments of an edge need not come in order: the arrow goes to the point furthest along it.
    let origin: Vec3 = [points[0] ?? 0, points[1] ?? 0, points[2] ?? 0];
    for (let i = 3; i < points.length; i += 3) {
      const point: Vec3 = [points[i] ?? 0, points[i + 1] ?? 0, points[i + 2] ?? 0];
      if (dot(sub(point, origin), direction) > 0) origin = point;
    }
    return { origin, direction, perMm: 1 };
  }
  if (target.measure === 'radius') {
    const cylinder = model.table.faces.find((face) => face.name === target.face)?.cylinder;
    if (!cylinder) return null;
    const along = dot(sub(a.point, cylinder.origin), cylinder.axis);
    const onAxis = [0, 1, 2].map((i) => (cylinder.origin[i] ?? 0) + (cylinder.axis[i] ?? 0) * along);
    const direction = unit(sub(a.point, onAxis));
    return direction ? { origin: a.point, direction, perMm: dimension.shown === 'diameter' ? 2 : 1 } : null;
  }
  if (target.measure === 'distance' && a.kind === 'face' && b?.kind === 'face') {
    const first = model.table.faces[a.face];
    const second = model.table.faces[b.face];
    const normal = second?.planeNormal;
    if (!first || !second || !normal) return null;
    const away = dot(sub(second.point, first.point), normal) >= 0 ? 1 : -1;
    return { origin: b.point, direction: [normal[0] * away, normal[1] * away, normal[2] * away], perMm: 1 };
  }
  return null;
}

/**
 * The value a drag gives: the pointer's movement on screen along the arrow as projected there
 * (`step` is where 1 mm along the arrow lands, from its foot), in whole mm or tenths with `fine`.
 */
export function draggedValue(base: number, handle: DimensionHandle, step: { x: number; y: number }, moved: { x: number; y: number }, fine: boolean): number | null {
  const pixels = step.x * step.x + step.y * step.y;
  // An arrow that points at the camera has no direction on screen to drag along.
  if (pixels < 0.25) return null;
  const mm = (moved.x * step.x + moved.y * step.y) / pixels;
  const grid = fine ? 0.1 : 1;
  const value = Math.round((base + mm * handle.perMm) / grid) * grid;
  return value > 0 || handle.signed ? Math.round(value * 1000) / 1000 || 0 : null;
}
