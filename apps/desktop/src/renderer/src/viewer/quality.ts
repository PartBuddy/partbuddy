import type { ViewportQuality } from '../../../shared/contract';

/** What a quality profile sets in the 3D view (issue #484). */
export interface QualityProfile {
  /** Device pixel ratio range of the canvas. */
  dpr: [number, number];
  /** How far the resolution may drop while the camera moves (AdaptiveDpr); 1 keeps it. */
  minDpr: number;
  /** Multisampled edges; a property of the WebGL context, so a change builds the canvas anew. */
  antialias: boolean;
  /** Side of the contact shadow's map in pixels; 0 draws no shadow. */
  shadowMap: number;
}

export const QUALITY: Record<ViewportQuality, QualityProfile> = {
  performance: { dpr: [1, 1], minDpr: 0.5, antialias: false, shadowMap: 0 },
  // How the view drew before the profiles came.
  balanced: { dpr: [1, 2], minDpr: 0.5, antialias: true, shadowMap: 1024 },
  quality: { dpr: [1, 2], minDpr: 1, antialias: true, shadowMap: 2048 },
};
