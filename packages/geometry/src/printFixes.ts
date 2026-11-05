import { Vector3 } from 'three';

import { cylinderKind } from './fits';
import type { Down } from './orientation';
import { BRIDGE_SPAN } from './supportReach';
import type { ViewerModel } from './viewerModel';

/**
 * Why a face needs support, and what fixes it (M7f step 2, decided 2026-11-05: the light names
 * the cause, a button fixes it directly with a ghost preview). SolidCraft names the faces of a
 * fillet `F<feature>:blend:<face>|<face>`; a hole is a cylinder with the material outside.
 */
export type SupportCause = 'fillet' | 'hole' | 'other';

/** The fillet feature a face belongs to, from its SolidCraft name, or null. */
export function filletFeatureOf(name: string): number | null {
  const match = /^F(\d+):blend:/.exec(name);
  return match ? Number(match[1]) : null;
}

/** How far a hole's axis may lean out of the horizontal (as the sine) and still count as lying. */
const LYING = 0.1;

/** The cause of support on face `face` of a body printed lying `down`. */
export function supportCause(model: ViewerModel, face: number, down: Down): SupportCause {
  const info = model.table.faces[face];
  if (!info) return 'other';
  if (filletFeatureOf(info.name) !== null) return 'fillet';
  if (info.cylinder && cylinderKind(model, face) === 'hole') {
    const axis = new Vector3(...info.cylinder.axis).normalize();
    if (Math.abs(axis.dot(new Vector3(...down).normalize())) < LYING) return 'hole';
  }
  return 'other';
}

/** A cut over a lying hole: a sketch at one end of the hole, across it, extruded along it. */
export interface HoleRoof {
  /** Where the sketch sits: on the hole's axis at its start, world mm. */
  origin: [number, number, number];
  /** Sketch x: across the hole, level. Sketch y: up in the print. Their cross product runs along the hole. */
  xDir: [number, number, number];
  yDir: [number, number, number];
  /** The outline in sketch coordinates, from the centre over the 45° flanks to the roof. */
  points: [number, number][];
  /** How far the cut runs along the hole, mm. */
  length: number;
  /** Pointed (a teardrop) when a flat roof would be wider than the slicer bridges. */
  pointed: boolean;
  radius: number;
}

// `+ 0` turns -0 into 0, so the numbers read the same when compared or sent.
const r4 = (value: number) => Math.round(value * 1e4) / 1e4 + 0;
const vec = (v: Vector3): [number, number, number] => [r4(v.x), r4(v.y), r4(v.z)];

/**
 * The roof for the lying hole on `face`: 45° flanks from the circle, cut flat at the top of the
 * circle where the flat part is narrow enough to bridge (2r(√2 − 1) ≤ 10 mm, holes up to about
 * Ø24), otherwise up to a point. Null when the face is no lying hole.
 */
export function holeRoof(model: ViewerModel, face: number, down: Down): HoleRoof | null {
  const info = model.table.faces[face];
  if (supportCause(model, face, down) !== 'hole' || !info?.cylinder) return null;
  const { radius } = info.cylinder;
  const axis = new Vector3(...info.cylinder.axis).normalize();
  const base = new Vector3(...info.cylinder.origin);
  // The hole's extent along its axis, from the vertices of its face.
  const positions = model.geometry.getAttribute('position').array;
  let low = Infinity;
  let high = -Infinity;
  const p = new Vector3();
  for (let v = 0; v < model.vertexFaces.length; v += 1) {
    if (model.vertexFaces[v] !== face) continue;
    const t = p.fromArray(positions, v * 3).sub(base).dot(axis);
    low = Math.min(low, t);
    high = Math.max(high, t);
  }
  if (!Number.isFinite(low) || high - low <= 0) return null;
  const up = new Vector3(...down).normalize().negate();
  // Level across the hole; x × y runs along the axis, so the cut goes from the start into the hole.
  const xDir = up.clone().cross(axis).normalize();
  const yDir = axis.clone().cross(xDir).normalize();
  const s = radius / Math.SQRT2;
  const flat = radius * (Math.SQRT2 - 1);
  const pointed = 2 * flat > BRIDGE_SPAN;
  const points: [number, number][] = pointed
    ? [[0, 0], [s, s], [0, radius * Math.SQRT2], [-s, s]]
    : [[0, 0], [s, s], [flat, radius], [-flat, radius], [-s, s]];
  return {
    origin: vec(base.clone().addScaledVector(axis, low)),
    xDir: vec(xDir),
    yDir: vec(yDir),
    points: points.map(([x, y]) => [r4(x), r4(y)]),
    length: r4(high - low),
    pointed,
    radius,
  };
}
