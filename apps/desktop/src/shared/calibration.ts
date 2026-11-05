import type { FitKind, MaterialProfile, StoredMeasurement } from './contract';

/** One suggested value for a material, with how many measurements it rests on. */
export interface Suggestion {
  value: number;
  count: number;
}

export interface MaterialSuggestions {
  holeShrink: Suggestion | null;
  outerGrowth: Suggestion | null;
  clearance: Partial<Record<FitKind, Suggestion>>;
}

/** How much a fit that felt tight or loose moves its clearance per side, mm. */
export const FIT_STEP = 0.05;
/** The newest measurements of a kind that count; older prints may have used other settings. */
const RECENT = 7;

const round = (value: number) => Math.round(value * 100) / 100;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * What the measurements after printing (M7) say about a material: holes come out smaller by the
 * median of drawn minus measured, outer sizes larger by the median of measured minus drawn, and a
 * fit that felt tight or loose moves its clearance by one step from what it was printed with. The
 * median keeps one odd print from moving the values. Only differences from the material's current
 * values are suggested.
 */
export function suggestionsFor(material: MaterialProfile, measurements: readonly StoredMeasurement[]): MaterialSuggestions {
  const own = measurements.filter((entry) => entry.material === material.id);
  const recent = <K extends StoredMeasurement['kind']>(kind: K) => own.filter((entry): entry is Extract<StoredMeasurement, { kind: K }> => entry.kind === kind).slice(-RECENT);

  const holes = recent('hole');
  const shrink = holes.length > 0 ? round(Math.max(0, median(holes.map((entry) => entry.drawn - entry.measured)))) : null;
  const outers = recent('outer');
  const growth = outers.length > 0 ? round(median(outers.map((entry) => entry.measured - entry.drawn))) : null;

  const clearance: Partial<Record<FitKind, Suggestion>> = {};
  const fits = own.filter((entry): entry is Extract<StoredMeasurement, { kind: 'fit' }> => entry.kind === 'fit');
  for (const fit of ['clamp', 'push', 'slide', 'turn'] as const) {
    const latest = fits.filter((entry) => entry.fit === fit).at(-1);
    if (!latest) continue;
    const step = latest.verdict === 'tight' ? FIT_STEP : latest.verdict === 'loose' ? -FIT_STEP : 0;
    const value = round(latest.clearance + step);
    if (Math.abs(value - material.clearance[fit]) > 1e-9) clearance[fit] = { value, count: fits.filter((entry) => entry.fit === fit).length };
  }

  return {
    holeShrink: shrink !== null && Math.abs(shrink - material.holeShrink) > 1e-9 ? { value: shrink, count: holes.length } : null,
    outerGrowth: growth !== null && Math.abs(growth - material.outerGrowth) > 1e-9 ? { value: growth, count: outers.length } : null,
    clearance,
  };
}
