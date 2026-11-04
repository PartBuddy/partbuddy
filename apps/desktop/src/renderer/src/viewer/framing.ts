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
