/**
 * Exploded view (plan step F7): how far each body moves when the parts are pulled apart. Each body
 * moves away from the middle of all of them, by `SPREAD` times its distance at full explosion; the
 * whole lot is then lifted so nothing sinks below where the lowest part stood.
 */

export type Vec3 = [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** At full explosion each body stands this many times as far from the middle as before, plus itself. */
export const SPREAD = 1.5;

const middle = (box: Box): Vec3 => [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];

/**
 * The offset of each body for `amount` from 0 (assembled) to 1 (fully apart). Fewer than two bodies
 * do not move.
 * shortcut: bodies that share their middle (a part inside another) stay together; upgrade to an
 * order along the main axis when such assemblies matter.
 */
export function explodeOffsets(boxes: readonly Box[], amount: number): Vec3[] {
  const factor = Math.min(1, Math.max(0, amount)) * SPREAD;
  if (boxes.length < 2 || factor === 0) return boxes.map(() => [0, 0, 0]);
  const centres = boxes.map(middle);
  const centre: Vec3 = [0, 1, 2].map((axis) => centres.reduce((sum, c) => sum + (c[axis] ?? 0), 0) / centres.length) as Vec3;
  const offsets = centres.map((c): Vec3 => [(c[0] - centre[0]) * factor, (c[1] - centre[1]) * factor, (c[2] - centre[2]) * factor]);
  const floor = Math.min(...boxes.map((box) => box.min[2]));
  const lowest = Math.min(...boxes.map((box, i) => box.min[2] + (offsets[i]?.[2] ?? 0)));
  const lift = Math.max(0, floor - lowest);
  return offsets.map(([x, y, z]) => [x, y, z + lift]);
}
