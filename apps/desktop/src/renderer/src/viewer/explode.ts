import type { PlayStep } from '../../../shared/assembly';

/**
 * Exploded view and assembly playback (F7, viewport CAD round 2026-11-07): where each body stands
 * when the parts are pulled apart along the directions they are joined in, and at any moment of the
 * animated assembly. Both read the assembly order (the assistant's, or the one proposed from the
 * geometry), so the explosion is the assembly run backwards. Pure, so tests run without WebGL.
 */

export type Vec3 = [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}

/** How far a part moves out per millimetre of its own extent along its direction, at full explosion. */
export const SPREAD = 1.4;

const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

function union(boxes: readonly (Box | undefined)[]): Box | null {
  let result: Box | null = null;
  for (const box of boxes) {
    if (!box) continue;
    result = result
      ? { min: [0, 1, 2].map((i) => Math.min(result?.min[i] ?? 0, box.min[i] ?? 0)) as Vec3, max: [0, 1, 2].map((i) => Math.max(result?.max[i] ?? 0, box.max[i] ?? 0)) as Vec3 }
      : { min: [...box.min], max: [...box.max] };
  }
  return result;
}

/** The extent of a box along a unit direction. */
const extentAlong = (box: Box, d: Vec3) => Math.abs(d[0]) * (box.max[0] - box.min[0]) + Math.abs(d[1]) * (box.max[1] - box.min[1]) + Math.abs(d[2]) * (box.max[2] - box.min[2]);

/**
 * How far each step's part travels, in mm: its own extent along the direction plus a gap, added up
 * over the earlier steps of its group that go the same way, so a lid clears the board beneath it.
 * The first part of each group (no target) stays.
 */
export function travel(steps: readonly PlayStep[], boxes: ReadonlyMap<string, Box>): number[] {
  const all = union([...boxes.values()]);
  const gap = all ? Math.hypot(all.max[0] - all.min[0], all.max[1] - all.min[1], all.max[2] - all.min[2]) * 0.08 : 5;
  const reach = new Map<string, number>();
  return steps.map((step) => {
    if (step.target === null) return 0;
    const d = unit(step.direction);
    const moved = union(step.bodies.map((body) => boxes.get(body)));
    const own = moved ? extentAlong(moved, d) : 0;
    // Steps of one group that go nearly the same way stack up.
    const key = `${step.group ?? ''}|${d.map((v) => Math.round(v * 4)).join(',')}`;
    const total = (reach.get(key) ?? 0) + own + gap;
    reach.set(key, total);
    return total;
  });
}

/** Where each body stands at `amount` from 0 (assembled) to 1 (fully apart): every step's part backs out against its direction. */
export function explodeAlong(steps: readonly PlayStep[], boxes: ReadonlyMap<string, Box>, amount: number): Map<string, Vec3> {
  const factor = Math.min(1, Math.max(0, amount)) * SPREAD;
  const distances = travel(steps, boxes);
  const offsets = new Map<string, Vec3>();
  steps.forEach((step, k) => {
    const d = unit(step.direction);
    const distance = (distances[k] ?? 0) * factor;
    for (const body of step.bodies) {
      const [x, y, z] = offsets.get(body) ?? [0, 0, 0];
      offsets.set(body, [x - d[0] * distance, y - d[1] * distance, z - d[2] * distance]);
    }
  });
  return offsets;
}

/** Where a body stands at a moment of the playback, and whether it is there yet. */
export interface PlayPose {
  offset: Vec3;
  visible: boolean;
}

/**
 * The bodies at playback position `p` from 0 (nothing placed) to the number of steps (all placed):
 * during step k (k ≤ p < k + 1) its part comes in along its direction; a part shows from the start
 * of its first step. A sub-assembly is built away from its place and moves in as one piece.
 */
export function playbackPoses(steps: readonly PlayStep[], boxes: ReadonlyMap<string, Box>, p: number): Map<string, PlayPose> {
  const distances = travel(steps, boxes);
  const poses = new Map<string, PlayPose>();
  steps.forEach((step, k) => {
    const d = unit(step.direction);
    const remaining = 1 - Math.min(1, Math.max(0, p - k));
    // Smooth start and stop of each move.
    const eased = remaining * remaining * (3 - 2 * remaining);
    const distance = (distances[k] ?? 0) * SPREAD * eased;
    for (const body of step.bodies) {
      const pose = poses.get(body) ?? { offset: [0, 0, 0], visible: false };
      pose.offset = [pose.offset[0] - d[0] * distance, pose.offset[1] - d[1] * distance, pose.offset[2] - d[2] * distance];
      pose.visible ||= p >= k;
      poses.set(body, pose);
    }
  });
  return poses;
}

/**
 * The step playing at position `p`; on the end of a step (a whole number) the step just done, so a
 * step back or forward names the step it shows. -1 before anything plays.
 */
export function activeStep(p: number, count: number): number {
  if (count === 0 || p < 0) return -1;
  return Math.min(count - 1, Math.max(0, Math.ceil(p - 1e-6) - 1));
}
