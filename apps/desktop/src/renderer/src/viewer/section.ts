import { useMemo } from 'react';
import { Box3, Plane, Vector3 } from 'three';

import { useStudio, type BodyModel, type Section } from '../state/store';

const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const;

/** Box around every body; empty for an empty design. */
export function bodiesBox(bodies: readonly BodyModel[]): Box3 {
  const box = new Box3();
  for (const body of bodies) {
    const geometry = body.model.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(geometry.boundingBox);
  }
  return box;
}

/**
 * The clipping plane of a section (UI upgrade step 9) through the bodies' box. three.js keeps what
 * lies on the plane's positive side, so without `flip` the side below the cut stays (z ≤ cut for
 * the Z axis), with `flip` the side above it.
 */
export function sectionPlane(section: Section | null, box: Box3): Plane | null {
  if (!section || box.isEmpty()) return null;
  const axis = AXES[section.axis];
  const min = box.min.dot(axis);
  const max = box.max.dot(axis);
  const at = min + Math.min(1, Math.max(0, section.position)) * (max - min);
  const normal = axis.clone().multiplyScalar(section.flip ? 1 : -1);
  // Plane: normal · p + constant = 0, kept where normal · p + constant ≥ 0.
  return new Plane(normal, section.flip ? -at : at);
}

/** Whether a point is on the side of the section that stays visible (always, without a section). */
export function keeps(plane: Plane | null, point: Vector3 | readonly [number, number, number]): boolean {
  if (!plane) return true;
  const p = point instanceof Vector3 ? point : new Vector3(point[0], point[1], point[2]);
  return plane.distanceToPoint(p) >= -1e-6;
}

/** The section plane of the current design, shared by the bodies, the picker and the pen. */
export function useSectionPlane(bodies: readonly BodyModel[]): Plane | null {
  const section = useStudio((s) => s.section);
  return useMemo(() => sectionPlane(section, bodiesBox(bodies)), [section, bodies]);
}
