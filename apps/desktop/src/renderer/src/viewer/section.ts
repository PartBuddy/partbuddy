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
  const { axis, min, max } = sectionSpan(section, box);
  const at = min + Math.min(1, Math.max(0, section.position)) * (max - min);
  const normal = axis.clone().multiplyScalar(section.flip ? 1 : -1);
  // Plane: normal · p + constant = 0, kept where normal · p + constant ≥ 0.
  return new Plane(normal, section.flip ? -at : at);
}

/**
 * The direction a section cuts across and how far the bodies reach along it: an axis, or the
 * normal of the face it is aligned to (viewport CAD round). The box's corners give the reach.
 */
export function sectionSpan(section: Section, box: Box3): { axis: Vector3; min: number; max: number } {
  const axis = section.face ? new Vector3(...section.face.normal).normalize() : AXES[section.axis].clone();
  let min = Infinity;
  let max = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const along = axis.x * x + axis.y * y + axis.z * z;
        min = Math.min(min, along);
        max = Math.max(max, along);
      }
    }
  }
  return { axis, min, max };
}

/** How far behind a picked face its section starts (mm). */
export const FACE_INSET = 0.02;

/** A section through a picked flat face, cutting away what lies in front of it: starts exactly at the face. */
export function faceSection(origin: [number, number, number], normal: [number, number, number], box: Box3): Section {
  const section: Section = { axis: 'z', position: 0, flip: false, face: { origin, normal } };
  const { axis, min, max } = sectionSpan(section, box);
  // A hair behind the face: a cut exactly on it fights with the face for the same pixels.
  const at = axis.dot(new Vector3(...origin)) - FACE_INSET;
  return { ...section, position: max > min ? (at - min) / (max - min) : 0.5 };
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
