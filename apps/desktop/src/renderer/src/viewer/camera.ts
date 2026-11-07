/**
 * Camera helpers of the 3D view (viewport CAD round, 2026-11-07): the standard view directions and
 * the box a selection fills, for "fit to selection". Pure functions over plain arrays, so tests run
 * without WebGL.
 */

export type Vec3 = [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** The camera direction of each standard view (Z up, front is -Y); top and bottom lean a hair to the front to keep "up" defined. */
export const VIEW_DIRECTIONS = {
  iso: [0.55, -0.68, 0.48],
  front: [0, -1, 0],
  back: [0, 1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1e-4, 1],
  bottom: [0, -1e-4, -1],
} as const satisfies Record<string, Vec3>;
export type DirectionView = keyof typeof VIEW_DIRECTIONS;

/** The arrays of one body that a pick refers to (a subset of the geometry package's ViewerModel). */
export interface PickArrays {
  positions: ArrayLike<number>;
  index: ArrayLike<number>;
  triangleFaces: ArrayLike<number>;
  edgeSegments: ArrayLike<number>;
  edgeRanges: ArrayLike<number>;
  vertices: ArrayLike<number>;
}

export type BoxPick = { kind: 'face'; face: number } | { kind: 'edge'; edge: number } | { kind: 'vertex'; vertex: number };

function grow(box: Box | null, x: number, y: number, z: number): Box {
  if (!box) return { min: [x, y, z], max: [x, y, z] };
  box.min = [Math.min(box.min[0], x), Math.min(box.min[1], y), Math.min(box.min[2], z)];
  box.max = [Math.max(box.max[0], x), Math.max(box.max[1], y), Math.max(box.max[2], z)];
  return box;
}

const at = (values: ArrayLike<number>, i: number) => values[i] ?? 0;

/** The box around one picked face (its triangles), edge (its segments) or vertex; null when it does not exist. */
export function pickBox(arrays: PickArrays, pick: BoxPick): Box | null {
  let box: Box | null = null;
  if (pick.kind === 'face') {
    for (let t = 0; t < arrays.triangleFaces.length; t += 1) {
      if (arrays.triangleFaces[t] !== pick.face) continue;
      for (let k = 0; k < 3; k += 1) {
        const v = at(arrays.index, t * 3 + k) * 3;
        box = grow(box, at(arrays.positions, v), at(arrays.positions, v + 1), at(arrays.positions, v + 2));
      }
    }
  } else if (pick.kind === 'edge') {
    const first = at(arrays.edgeRanges, pick.edge * 2);
    const count = at(arrays.edgeRanges, pick.edge * 2 + 1);
    for (let s = first * 6; s < (first + count) * 6; s += 3) box = grow(box, at(arrays.edgeSegments, s), at(arrays.edgeSegments, s + 1), at(arrays.edgeSegments, s + 2));
  } else if (pick.vertex * 3 + 2 < arrays.vertices.length) {
    const v = pick.vertex * 3;
    box = grow(box, at(arrays.vertices, v), at(arrays.vertices, v + 1), at(arrays.vertices, v + 2));
  }
  return box;
}

/**
 * The box to fit for a selection: all picked boxes together, grown to at least `least` mm on each
 * side so a vertex or a short edge stays in context.
 */
export function selectionBox(boxes: readonly (Box | null)[], least: number): Box | null {
  let union: Box | null = null;
  for (const box of boxes) {
    if (!box) continue;
    union = grow(union, ...box.min);
    union = grow(union, ...box.max);
  }
  if (!union) return null;
  const min = [...union.min] as Vec3;
  const max = [...union.max] as Vec3;
  for (let axis = 0; axis < 3; axis += 1) {
    const missing = Math.max(0, least - ((max[axis] ?? 0) - (min[axis] ?? 0))) / 2;
    min[axis] = (min[axis] ?? 0) - missing;
    max[axis] = (max[axis] ?? 0) + missing;
  }
  return { min, max };
}
