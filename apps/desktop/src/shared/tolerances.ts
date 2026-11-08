import { FIT_KINDS, type FitKind, type MaterialProfile } from './contract';

/**
 * The steps of the test pieces the tolerance assistant makes (decided 2026-11-08): the clearance per
 * side of the fit comb's holes, the nominal sizes of the hole plate and the overhang steps. What the
 * user reads off the printed pieces becomes the material's values; nothing else of the profile.
 */
export const FIT_STEPS = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5] as const;
export const HOLE_SIZES = [3, 5, 8, 10] as const;
export const OVERHANG_STEPS = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70] as const;

/** What the user read off the prints; a value left out keeps the material's own. */
export interface ToleranceReadings {
  /** Per fit the smallest comb step that meets it: clamps tight, pushes in by hand, slides, turns freely. */
  fits: Partial<Record<FitKind, number>>;
  /** The measured diameter of each hole of the hole plate, in the order of HOLE_SIZES. */
  holes: readonly (number | null)[];
  /** The steepest overhang step that printed clean. */
  overhang: number | null;
}

export type ReadingProblem = { field: 'fit'; fit: FitKind } | { field: 'hole'; size: number } | { field: 'overhang' } | { field: 'order' };

const toStep = (value: number) => Math.round(value * 20) / 20;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isStep = (steps: readonly number[], value: number) => steps.some((step) => Math.abs(step - value) < 1e-9);

/**
 * The material with the readings applied: the fits and the overhang as read, the hole allowance as
 * the mean of nominal minus measured over the holes given, on 0.05 mm. Within the profile's limits;
 * a reading that is no step, or a hole more than 1 mm off its size, is a problem and changes nothing.
 * Fits that do not grow from clamp to turn are a problem too: the user read a step wrong.
 */
export function applyReadings(material: MaterialProfile, readings: ToleranceReadings): { material: MaterialProfile; problems: ReadingProblem[] } {
  const problems: ReadingProblem[] = [];
  const clearance = { ...material.clearance };
  for (const fit of FIT_KINDS) {
    const value = readings.fits[fit];
    if (value === undefined) continue;
    if (Number.isFinite(value) && isStep(FIT_STEPS, value)) clearance[fit] = clamp(toStep(value), -0.5, 2);
    else problems.push({ field: 'fit', fit });
  }
  const read = FIT_KINDS.filter((fit) => readings.fits[fit] !== undefined).map((fit) => clearance[fit]);
  if (read.some((value, i) => i > 0 && value < (read[i - 1] ?? value))) problems.push({ field: 'order' });

  const shrink: number[] = [];
  HOLE_SIZES.forEach((size, i) => {
    const measured = readings.holes[i];
    if (measured === null || measured === undefined) return;
    if (Number.isFinite(measured) && measured > 0 && Math.abs(size - measured) <= 1) shrink.push(size - measured);
    else problems.push({ field: 'hole', size });
  });
  const holeShrink = shrink.length > 0 ? clamp(toStep(shrink.reduce((sum, value) => sum + value, 0) / shrink.length), 0, 1) : material.holeShrink;

  let overhang = material.overhang;
  if (readings.overhang !== null) {
    if (Number.isFinite(readings.overhang) && isStep(OVERHANG_STEPS, readings.overhang)) overhang = clamp(readings.overhang, 20, 70);
    else problems.push({ field: 'overhang' });
  }
  return { material: { ...material, overhang, holeShrink, clearance }, problems };
}
