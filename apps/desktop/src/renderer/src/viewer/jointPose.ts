import type { Joint } from '../../../shared/contract';

type Vec3 = [number, number, number];

/** A rigid move of bodies in the view: turned about the world origin, then shifted. */
export interface JointMove {
  position: Vec3;
  quaternion: [number, number, number, number];
}

/**
 * Where a joint's bodies stand in the view while its slider is dragged (ADR 0027, G4): the bodies
 * as mirrored, moved by the difference between the slider and the value the joint has in the
 * mirror. An angle turns them about the joint's axis, right-handed as SolidCraft drives it; a
 * distance shifts them along it. Null when the mirror gave the joint no axis, or nothing moved.
 */
export function jointMove(joint: Joint, index: number, value: number): JointMove | null {
  const current = joint.values[index];
  if (!current || !joint.axis || !joint.origin) return null;
  const length = Math.hypot(...joint.axis);
  const delta = value - current.value;
  if (length < 1e-9 || Math.abs(delta) < 1e-9) return null;
  const axis = joint.axis.map((component) => component / length) as Vec3;
  if (current.unit === 'mm') return { position: axis.map((component) => component * delta) as Vec3, quaternion: [0, 0, 0, 1] };
  const half = (delta * Math.PI) / 360;
  const sin = Math.sin(half);
  const quaternion: [number, number, number, number] = [axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)];
  // A turn about the axis through the joint's origin: turn about the world origin, then put the origin back.
  const turned = rotate(quaternion, joint.origin);
  return { position: joint.origin.map((component, i) => component - (turned[i] ?? 0)) as Vec3, quaternion };
}

/** A point turned by a unit quaternion. */
export function rotate([x, y, z, w]: [number, number, number, number], [px, py, pz]: Vec3): Vec3 {
  // t = 2 q × p; p' = p + w t + q × t
  const tx = 2 * (y * pz - z * py);
  const ty = 2 * (z * px - x * pz);
  const tz = 2 * (x * py - y * px);
  return [px + w * tx + (y * tz - z * ty), py + w * ty + (z * tx - x * tz), pz + w * tz + (x * ty - y * tx)];
}

/** Seconds a joint takes from one end of its range to the other at normal speed. */
export const TRAVEL_SECONDS = 2.5;

/**
 * One frame of a joint that plays: the value moved by `amount` in its direction. At an end of the
 * range it turns round (`bounce`) or starts over at the other end (`loop`).
 */
export function playStep(value: number, direction: 1 | -1, [min, max]: [number, number], amount: number, mode: 'bounce' | 'loop'): { value: number; direction: 1 | -1; turned: boolean } {
  const span = max - min;
  if (!(span > 0)) return { value: min, direction, turned: true };
  const next = value + direction * Math.min(amount, span);
  if (next >= min && next <= max) return { value: next, direction, turned: false };
  const over = next > max ? next - max : min - next;
  if (mode === 'loop') return { value: next > max ? min + over : max - over, direction, turned: true };
  return next > max ? { value: max - over, direction: -1, turned: true } : { value: min + over, direction: 1, turned: true };
}

/** A joint value shown away from where the mirror has it. */
export interface JointPreview {
  joint: number;
  index: number;
  value: number;
}

/**
 * Where the bodies stand in the view with several joint values away from the mirror at once. A body
 * beyond two joints of a chain takes both moves: the one nearer to it first, then the one that
 * carries that joint along (it moves more bodies).
 */
export function jointPoses(joints: Joint[], previews: JointPreview[]): Map<string, JointMove> {
  const poses = new Map<string, JointMove>();
  const moved = previews
    .flatMap((preview) => {
      const joint = joints.find((entry) => entry.id === preview.joint);
      const move = joint ? jointMove(joint, preview.index, preview.value) : null;
      return joint?.bodies && move ? [{ bodies: joint.bodies, move }] : [];
    })
    .sort((a, b) => a.bodies.length - b.bodies.length);
  for (const { bodies, move } of moved) {
    for (const name of bodies) {
      const inner = poses.get(name);
      poses.set(name, inner ? { quaternion: multiply(move.quaternion, inner.quaternion), position: rotate(move.quaternion, inner.position).map((value, i) => value + (move.position[i] ?? 0)) as Vec3 } : move);
    }
  }
  return poses;
}

type Quaternion = [number, number, number, number];

/** The turn `b`, then the turn `a`. */
function multiply([ax, ay, az, aw]: Quaternion, [bx, by, bz, bw]: Quaternion): Quaternion {
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/**
 * The range a joint plays in, cut to where the check found parts in its way (`joint.sweep`, ADR
 * 0027): a stop on the way to a limit below the value ends the range there, one above likewise.
 * `low` and `high` are the stops the range now ends at, if any.
 */
export function playRange<Stop extends { at: number; limit: number }>([min, max]: [number, number], value: number, stops: readonly Stop[]): { range: [number, number]; low?: Stop; high?: Stop } {
  let low: Stop | undefined;
  let high: Stop | undefined;
  for (const stop of stops) {
    if (stop.limit < value && stop.at >= min && (!low || stop.at > low.at)) low = stop;
    if (stop.limit > value && stop.at <= max && (!high || stop.at < high.at)) high = stop;
  }
  return { range: [low ? Math.min(low.at, value) : min, high ? Math.max(high.at, value) : max], ...(low ? { low } : {}), ...(high ? { high } : {}) };
}
