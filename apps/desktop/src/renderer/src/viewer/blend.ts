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

/**
 * How a ghost weighs against the part (0 the part, 1 the ghost): at 0.25 the part stays solid and
 * the ghost shows half strong. The slider that moved it went with before/after (plan step R2).
 */
export const PREVIEW_BLEND = 0.25;
