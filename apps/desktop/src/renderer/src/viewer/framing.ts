import type { Sphere } from 'three';

/** Room the design may take beyond the framed sphere before the camera frames it again. */
const GROWTH_ALLOWANCE = 1.05;
/** Below this share of the framed radius the design looks lost in the view and is framed again. */
const SHRINK_LIMIT = 0.4;

/**
 * Whether a design whose bounds are now `bounds` no longer fits the view framed for `framed`:
 * it grew out of it (or moved away), or it shrank to a small part of it.
 */
export function needsReframe(framed: Sphere | null, bounds: Sphere): boolean {
  if (bounds.radius <= 0) return false;
  if (!framed || framed.radius <= 0) return true;
  const reach = framed.center.distanceTo(bounds.center) + bounds.radius;
  if (reach > framed.radius * GROWTH_ALLOWANCE) return true;
  return bounds.radius < framed.radius * SHRINK_LIMIT;
}

/**
 * The grid cell for a part of this radius in mm: about a sixth of it, rounded up to 1, 2 or 5 times
 * a power of ten, never below 1 mm. A 40 mm clip gets 5 mm cells, a 300 mm housing 50 mm cells.
 */
export function gridStep(radius: number): number {
  const raw = Math.max(1, radius / 6);
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 5, 10].find((step) => step * power >= raw - 1e-9) ?? 10;
  return factor * power;
}

/**
 * How wide lines may be for the part's size on screen: full width from about 220 px of radius,
 * down to half for a part zoomed far out, where fixed-width lines ran together into a black mass.
 * Reported in steps of 0.05, so zooming re-renders only now and then.
 */
export function lineScaleFor(radiusPixels: number): number {
  return Math.round(Math.min(1, Math.max(0.5, radiusPixels / 220)) * 20) / 20;
}
