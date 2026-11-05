import type { PartFamily, PartsLibrary } from '../../../shared/contract';

/** Families that need a length (screws, bolts, set screws, pins). */
export function hasLength(library: PartsLibrary, family: PartFamily): boolean {
  return (library.find((entry) => entry.family === family)?.lengths?.length ?? 0) > 0;
}

/**
 * The size that fits a hole of this diameter (B7): for a bearing the one whose outside comes
 * closest, for everything else the largest whose diameter still goes in (0.1 mm allowance for the
 * hole's print allowance), else the smallest.
 */
export function suggestSize(library: PartsLibrary, family: PartFamily, hole: number): string | null {
  const sizes = (library.find((entry) => entry.family === family)?.sizes ?? []).filter((size) => size.diameter !== null);
  if (sizes.length === 0) return null;
  if (family === 'bearing') {
    return sizes.reduce((best, size) => (Math.abs((size.diameter ?? 0) - hole) < Math.abs((best.diameter ?? 0) - hole) ? size : best)).size;
  }
  const fitting = sizes.filter((size) => (size.diameter ?? Infinity) <= hole + 0.1);
  const pick = fitting.length > 0 ? fitting.reduce((best, size) => ((size.diameter ?? 0) > (best.diameter ?? 0) ? size : best)) : sizes[0];
  return pick?.size ?? null;
}

/** The size's default length, or the nearest length of the family's list. */
export function suggestLength(library: PartsLibrary, family: PartFamily, size: string): number | null {
  const entry = library.find((candidate) => candidate.family === family);
  if (!entry?.lengths?.length) return null;
  const wanted = entry.sizes.find((candidate) => candidate.size === size)?.defaultLength ?? entry.lengths[0] ?? null;
  if (wanted === null) return null;
  return entry.lengths.reduce((best, length) => (Math.abs(length - wanted) < Math.abs(best - wanted) ? length : best));
}
