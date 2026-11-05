/**
 * The look of the 3D view (UI upgrade, professional look). Two variants are built side by side
 * for Manuel to choose from; the build picks one with `VITE_VIEW_LOOK` (a or b). Once he has
 * chosen, the other goes and this switch with it.
 *
 * a "Classic": cool blue-grey part with a slight sheen on a light gradient, thin dark edges, the
 *   view tools as a bar at the bottom centre (close to Fusion).
 * b "Calm": warm light-grey matte part on a flat background, stronger soft edges, the view tools as
 *   a slim bar at the top centre (close to Shapr3D and Onshape).
 */
export type ViewLook = 'a' | 'b';

export const VIEW_LOOK: ViewLook = import.meta.env.VITE_VIEW_LOOK === 'b' ? 'b' : 'a';

export interface LookSettings {
  roughness: number;
  metalness: number;
  /** Model edges in CSS pixels; above 1 they are drawn as fat lines. */
  edgeWidth: number;
  /** Where the view tools sit. */
  toolbar: 'bottom' | 'top';
}

export const LOOK: LookSettings =
  VIEW_LOOK === 'b'
    ? { roughness: 0.8, metalness: 0, edgeWidth: 1.7, toolbar: 'top' }
    : { roughness: 0.38, metalness: 0.25, edgeWidth: 1, toolbar: 'bottom' };

/** Marks the document, so the design tokens can carry each look's colours. */
export function applyLook(): void {
  document.documentElement.dataset.look = VIEW_LOOK;
}
