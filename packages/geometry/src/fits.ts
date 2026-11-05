import { Vector3 } from 'three';

import type { ViewerModel } from './viewerModel';

/**
 * Fits for printed parts (M7, the fit assistant): a hole or a pin is drawn at the size of its
 * counterpart plus the clearance of the chosen fit, per side, from the part's material; holes also
 * get the material's hole allowance, because printed holes come out smaller than drawn.
 */
export type FitKind = 'clamp' | 'push' | 'slide' | 'turn';
export type CylinderKind = 'hole' | 'pin';

export interface FitMaterial {
  /** Clearance per side, mm. */
  clearance: Readonly<Record<FitKind, number>>;
  /** How much smaller a printed hole comes out, on the diameter, mm. */
  holeShrink: number;
  /** How much larger a printed outer size comes out, mm (measured after printing); 0 when unknown. */
  outerGrowth?: number;
}

/**
 * Whether a cylindrical face is a hole (material outside, the normal points to the axis) or a pin
 * (material inside). Null when the face is no cylinder.
 */
export function cylinderKind(model: ViewerModel, face: number): CylinderKind | null {
  const cylinder = model.table.faces[face]?.cylinder;
  if (!cylinder) return null;
  const positions = model.geometry.getAttribute('position').array;
  const index = model.geometry.index?.array ?? [];
  const origin = new Vector3(...cylinder.origin);
  const axis = new Vector3(...cylinder.axis).normalize();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let vote = 0;
  for (let t = 0; t < index.length / 3; t += 1) {
    if (model.triangleFaces[t] !== face) continue;
    a.fromArray(positions, (index[t * 3] ?? 0) * 3);
    b.fromArray(positions, (index[t * 3 + 1] ?? 0) * 3);
    c.fromArray(positions, (index[t * 3 + 2] ?? 0) * 3);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const centre = a.clone().add(b).add(c).divideScalar(3).sub(origin);
    const radial = centre.sub(axis.clone().multiplyScalar(centre.dot(axis)));
    vote += Math.sign(normal.dot(radial));
  }
  if (vote === 0) return null;
  return vote < 0 ? 'hole' : 'pin';
}

/** The diameter to draw a hole or a pin at, for a counterpart of diameter `mating`. */
export function fitDiameter(kind: CylinderKind, mating: number, fit: FitKind, material: FitMaterial): number {
  const gap = 2 * material.clearance[fit];
  // A pin prints larger by the measured outer growth, so it is drawn smaller by as much.
  const value = kind === 'hole' ? mating + gap + material.holeShrink : mating - gap - (material.outerGrowth ?? 0);
  return Math.round(value * 1000) / 1000;
}

/** The diameter a drawn hole or pin comes out at when printed: holes shrink by the allowance. */
export function printedDiameter(kind: CylinderKind, drawn: number, material: FitMaterial): number {
  return Math.round((kind === 'hole' ? drawn - material.holeShrink : drawn + (material.outerGrowth ?? 0)) * 1000) / 1000;
}

/** Fits tried when guessing the counterpart, the most common first. */
const GUESS_ORDER: readonly FitKind[] = ['slide', 'push', 'clamp', 'turn'];

/**
 * The counterpart a drawn hole or pin was most likely made for (practice run 2026-11-05: the
 * assistant draws an M8 hole at 8 + 2 × 0.25 + 0.15 = 8.65 mm, and 9 is no screw). A drawn size on
 * a round number is the counterpart itself; else the fit whose clearance leads back to a round
 * number (whole mm before half ones) names it, with that fit. Otherwise the drawn size, rounded.
 */
export function counterpartOf(kind: CylinderKind, drawn: number, material: FitMaterial): { mating: number; fit: FitKind | null } {
  // Whole millimetres first, over all fits, then half ones: 5.5 is rarer than 6.
  for (const step of [1, 0.5]) {
    const round = (value: number) => Math.round(value / step) * step;
    const isRound = (value: number) => value > 0 && Math.abs(value - round(value)) < 0.005;
    if (isRound(drawn)) return { mating: round(drawn), fit: null };
    for (const fit of GUESS_ORDER) {
      const gap = 2 * material.clearance[fit];
      const mating = kind === 'hole' ? drawn - gap - material.holeShrink : drawn + gap + (material.outerGrowth ?? 0);
      if (isRound(mating)) return { mating: round(mating), fit };
    }
  }
  return { mating: Math.round(drawn), fit: null };
}
