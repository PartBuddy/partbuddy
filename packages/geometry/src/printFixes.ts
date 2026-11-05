import { Vector3 } from 'three';

import { cylinderKind } from './fits';
import type { Down } from './orientation';
import { BRIDGE_SPAN, SHORT_OVERHANG } from './supportReach';
import type { ViewerModel } from './viewerModel';

/**
 * Why a face needs support, and what fixes it (M7f step 2, decided 2026-11-05: the light names
 * the cause, a button fixes it directly with a ghost preview). SolidCraft names the faces of a
 * fillet `F<feature>:blend:<face>|<face>`; a hole is a cylinder with the material outside.
 */
export type SupportCause = 'fillet' | 'hole' | 'counterbore' | 'other';

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

/**
 * A counterbore that opens towards the bed (M7f step 3): a wide bore from below, a narrower hole
 * going on above, and the flat step between them facing down. A slicer bridges the step from wall
 * to wall, but the hole cuts every strand that crosses it, so the pieces hang from one side only
 * (Bambu Studio supports a 8/4.5 mm counterbore in both of its support modes, 2026-11-05).
 */
export interface Counterbore {
  /** The step face, facing the bed. */
  step: number;
  /** On the axis at the height of the step, world mm. */
  origin: [number, number, number];
  /** Radius of the hole above and of the bore below. */
  hole: number;
  bore: number;
  /** mm² of the step. */
  area: number;
}

/** How far apart (mm) an axis or a height may be and still count as the same. */
const SAME = 0.05;

/** The extent of a face along a direction from a point, from its vertices. */
function extentAlong(model: ViewerModel, face: number, from: Vector3, direction: Vector3): [number, number] {
  const positions = model.geometry.getAttribute('position').array;
  const p = new Vector3();
  let low = Infinity;
  let high = -Infinity;
  for (let v = 0; v < model.vertexFaces.length; v += 1) {
    if (model.vertexFaces[v] !== face) continue;
    const t = p.fromArray(positions, v * 3).sub(from).dot(direction);
    low = Math.min(low, t);
    high = Math.max(high, t);
  }
  return [low, high];
}

/** The largest distance of a face's vertices from an axis. */
function reachFrom(model: ViewerModel, face: number, base: Vector3, axis: Vector3): number {
  const positions = model.geometry.getAttribute('position').array;
  const p = new Vector3();
  let far = 0;
  for (let v = 0; v < model.vertexFaces.length; v += 1) {
    if (model.vertexFaces[v] !== face) continue;
    p.fromArray(positions, v * 3).sub(base);
    far = Math.max(far, p.sub(axis.clone().multiplyScalar(p.dot(axis))).length());
  }
  return far;
}

/** The counterbores of a body that open towards the bed when it is printed lying `down`. */
export function counterboresOf(model: ViewerModel, down: Down): Counterbore[] {
  const up = new Vector3(...down).normalize().negate();
  const faces = model.table.faces;
  // Holes standing upright in the print, with where they start and end along `up`.
  const upright = faces.flatMap((info, face) => {
    if (!info.cylinder || cylinderKind(model, face) !== 'hole') return [];
    const axis = new Vector3(...info.cylinder.axis).normalize();
    if (Math.abs(axis.dot(up)) < 1 - 1e-3) return [];
    const base = new Vector3(...info.cylinder.origin);
    const [low, high] = extentAlong(model, face, base, up);
    return [{ face, base, radius: info.cylinder.radius, low, high }];
  });
  const found: Counterbore[] = [];
  const seen = new Set<number>();
  for (const bore of upright) {
    for (const hole of upright) {
      if (hole.radius >= bore.radius - SAME) continue;
      // Coaxial: the hole's base lies on the bore's axis.
      const offset = hole.base.clone().sub(bore.base);
      if (offset.clone().sub(up.clone().multiplyScalar(offset.dot(up))).length() > SAME) continue;
      // The bore ends where the hole starts, measured from the bore's base: the step.
      const holeStart = hole.low + offset.dot(up);
      const holeEnd = hole.high + offset.dot(up);
      if (Math.abs(bore.high - holeStart) > SAME || holeEnd <= holeStart) continue;
      const stepHeight = bore.high;
      const step = faces.findIndex((info, face) => {
        if (!info.planeNormal || new Vector3(...info.planeNormal).dot(up) > -1 + 1e-3) return false;
        const [low, high] = extentAlong(model, face, bore.base, up);
        // At the height of the step and around this bore's axis (a plate has several at one height).
        return Math.abs(low - stepHeight) <= SAME && Math.abs(high - stepHeight) <= SAME && reachFrom(model, face, bore.base, up) <= bore.radius + SAME;
      });
      if (step < 0) continue;
      const origin = bore.base.clone().addScaledVector(up, stepHeight);
      if (seen.has(step)) continue;
      seen.add(step);
      found.push({ step, origin: vec(origin), hole: hole.radius, bore: bore.radius, area: Math.PI * (bore.radius ** 2 - hole.radius ** 2) });
    }
  }
  // A step no wider than a short overhang grows from the bore's wall without help.
  return found.filter((item) => item.bore - item.hole > SHORT_OVERHANG);
}

/** The stepped bridge over a counterbore: two cuts into the layers above the step. */
export interface SteppedBridge {
  /** On the axis at the step; x and y level, their cross product points up into the material. */
  origin: [number, number, number];
  xDir: [number, number, number];
  yDir: [number, number, number];
  /** Layer 1: a slot as wide as the hole across the bore, its ends just inside the bore's wall. */
  slot: [number, number][];
  /** Layers 1 and 2: a square as wide as the hole. */
  square: [number, number][];
  /** How deep the slot and the square are cut, from the sketch: one and two layers and the overlap. */
  slotDepth: number;
  squareDepth: number;
}

/**
 * The cuts start this far below the step, in the bore's air: a cut that starts exactly in the
 * step's plane makes SolidCraft retry its boolean and report it as a warning (2026-11-05).
 */
const OVERLAP = 0.01;
/** How far (mm) the slot's ends stay off the bore's wall. */
const SLOT_CLEAR = 0.05;

/**
 * The stepped bridge (Hackaday, "3D printing bores without support", 2023): the first layer over
 * the step leaves only a slot as wide as the hole open, so its strands run from wall to wall beside
 * the hole; the second leaves only a square, bridged across the slot; then the hole goes on round.
 */
export function steppedBridge(counterbore: Counterbore, down: Down, layer: number): SteppedBridge {
  const up = new Vector3(...down).normalize().negate();
  // Level x: the world X, or Y when X stands upright.
  const ref = Math.abs(up.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const xDir = ref.clone().sub(up.clone().multiplyScalar(ref.dot(up))).normalize();
  const yDir = up.clone().cross(xDir).normalize();
  const r = counterbore.hole;
  // The slot ends just short of the bore's wall: corners right on it leave faces without area.
  const half = Math.sqrt(Math.max(counterbore.bore ** 2 - r ** 2, 0)) - SLOT_CLEAR;
  const rect = (w: number, h: number): [number, number][] => [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [r4(x ?? 0), r4(y ?? 0)]);
  const origin = vec(new Vector3(...counterbore.origin).addScaledVector(up, -OVERLAP));
  return { origin, xDir: vec(xDir), yDir: vec(yDir), slot: rect(half, r), square: rect(r, r), slotDepth: r4(layer + OVERLAP), squareDepth: r4(2 * layer + OVERLAP) };
}
