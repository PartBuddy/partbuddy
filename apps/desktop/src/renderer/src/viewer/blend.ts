/**
 * Before/after weights (UI upgrade step 13): `t` runs from 0 (only the old state) to 1 (only the
 * new one). Each side stays fully there for the first half of the way, so the middle shows both
 * solid, and the far ends show one alone.
 */
export function blendWeights(t: number): { before: number; after: number } {
  const clamped = Math.min(1, Math.max(0, t));
  return { before: Math.min(1, 2 * (1 - clamped)), after: Math.min(1, 2 * clamped) };
}

/** How opaque the ghost of a tried value is at most, so the part under it still reads. */
export const GHOST_OPACITY = 0.85;
