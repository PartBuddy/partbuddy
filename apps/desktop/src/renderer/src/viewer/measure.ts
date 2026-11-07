/**
 * Measures read from the mirrored geometry (viewport CAD round, 2026-11-07): the radius of a round
 * edge, and distance and angle between two picks while SolidCraft's exact measure is on its way
 * or unavailable (offline, rebuilding). SolidCraft's answer replaces these as soon as it comes.
 * Pure functions, so tests run without WebGL.
 */

export type Vec3 = [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export interface Circle {
  center: Vec3;
  radius: number;
  normal: Vec3;
}

/** The points of one B-rep edge in order: the start of each segment and the end of the last. */
export function edgePoints(segments: ArrayLike<number>, ranges: ArrayLike<number>, edge: number): Vec3[] {
  const first = ranges[edge * 2] ?? 0;
  const count = ranges[edge * 2 + 1] ?? 0;
  const points: Vec3[] = [];
  for (let s = first; s < first + count; s += 1) points.push([segments[s * 6] ?? 0, segments[s * 6 + 1] ?? 0, segments[s * 6 + 2] ?? 0]);
  if (count > 0) {
    const e = (first + count - 1) * 6;
    points.push([segments[e + 3] ?? 0, segments[e + 4] ?? 0, segments[e + 5] ?? 0]);
  }
  return points;
}

/**
 * The circle through the points of an edge, when they lie on one within `tolerance` mm (an arc or a
 * full circle); null for a straight or free curve. The circle runs through the first, a middle and
 * the last point (the first and the middle of a closed loop's three spread points).
 */
export function circleOf(points: readonly Vec3[], tolerance = 0.02): Circle | null {
  if (points.length < 4) return null;
  const a = points[0] as Vec3;
  const b = points[Math.floor(points.length / 3)] as Vec3;
  const c = points[Math.floor((points.length * 2) / 3)] as Vec3;
  const ab = sub(b, a);
  const ac = sub(c, a);
  const normal = cross(ab, ac);
  const n2 = dot(normal, normal);
  if (n2 < 1e-12) return null;
  // Circumcentre of a, b, c.
  const term = add(scale(cross(normal, ab), dot(ac, ac)), scale(cross(ac, normal), dot(ab, ab)));
  const center = add(a, scale(term, 1 / (2 * n2)));
  const radius = length(sub(a, center));
  const unit = scale(normal, 1 / Math.sqrt(n2));
  for (const point of points) {
    const offset = sub(point, center);
    if (Math.abs(length(offset) - radius) > tolerance || Math.abs(dot(offset, unit)) > tolerance) return null;
  }
  return { center, radius, normal: unit };
}

/** A pick as the local measure sees it: where it was picked, and a face's normal or a straight edge's direction. */
export interface MeasurePick {
  point: Vec3;
  normal?: Vec3 | undefined;
  direction?: Vec3 | undefined;
}

/** The direction of a straight edge, or undefined for a curved one. */
export function lineDirection(points: readonly Vec3[], tolerance = 0.02): Vec3 | undefined {
  if (points.length < 2) return undefined;
  const a = points[0] as Vec3;
  const span = sub(points[points.length - 1] as Vec3, a);
  const len = length(span);
  if (len < 1e-9) return undefined;
  const unit = scale(span, 1 / len);
  for (const point of points) {
    const offset = sub(point, a);
    if (length(sub(offset, scale(unit, dot(offset, unit)))) > tolerance) return undefined;
  }
  return unit;
}

const degrees = (cos: number) => (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;

/**
 * Distance and angle between two picks: two parallel faces measure plane to plane, anything else
 * from point to point; the angle (0 to 90°) between faces, straight edges or one of each, null
 * when a pick has no direction.
 */
export function localMeasure(a: MeasurePick, b: MeasurePick): { distance: number; angle: number | null } {
  let angle: number | null = null;
  if (a.normal && b.normal) angle = degrees(Math.abs(dot(a.normal, b.normal)));
  else if (a.direction && b.direction) angle = degrees(Math.abs(dot(a.direction, b.direction)));
  else if ((a.normal && b.direction) || (a.direction && b.normal)) angle = 90 - degrees(Math.abs(dot((a.normal ?? a.direction) as Vec3, (b.normal ?? b.direction) as Vec3)));
  const parallelFaces = a.normal && b.normal && angle !== null && angle < 0.01;
  const distance = parallelFaces && a.normal ? Math.abs(dot(sub(b.point, a.point), a.normal)) : length(sub(b.point, a.point));
  return { distance, angle: angle === null ? null : Math.round(angle * 1000) / 1000 };
}
