import { DoubleSide, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import type { Down } from './orientation';
import { ANGLE_TOLERANCE } from './overhang';
import type { ViewerModel } from './viewerModel';

/**
 * Which overhangs really need support (M7, practice run 2026-11-05). The angle alone flags too
 * much: Bambu Studio printed the top of horizontal Ø4.5 holes, their countersinks and the 1 mm
 * ceiling of a lid groove without a single support, where the light warned. A slicer looks at each
 * layer against the one below; so does this, at each overhanging spot:
 * - short: a wall of the layer below is within reach, the overhang grows out of it by a few lines;
 * - bridged: walls on two opposite sides, close enough to bridge (holes, slots, grooves);
 * - resting: the spot lies on material (faces inside the part, near the bed).
 * Only what is none of these counts as needing support. Pure, on the BVH of the render mesh.
 */

/** An overhang reaching at most this far from a wall prints as overhanging lines (mm). */
export const SHORT_OVERHANG = 1.5;
/** Walls on two opposite sides at most this far apart are bridged (mm). */
export const BRIDGE_SPAN = 10;
/** How far under the overhang the layer below is looked at (mm, about half a layer). */
const BELOW = 0.1;
/** Overhangs this close above the bed rest on the first layers (mm). */
const NEAR_BED = 0.5;
/** One look per this much overhang area (mm²), at most `MAX_SPLIT²` per triangle. */
const SAMPLE_AREA = 1;
const MAX_SPLIT = 8;
/** Eight horizontal directions: opposite ones are four apart. */
const DIRECTIONS = 8;

export interface SupportNeed {
  /** mm² per B-rep face that needs support. */
  byFace: Float64Array;
  /** mm² that need support in all. */
  area: number;
  /** mm² steeper than the limit that print anyway: short, bridged or resting. */
  carried: number;
}

/**
 * The overhang area of one body that needs support when printed lying `down`, on a bed at
 * `bedZ` (in the turned frame). `turned` holds the body's positions in the print orientation.
 */
export function supportNeed(model: ViewerModel, turned: ArrayLike<number>, down: Down, bedZ: number, supportAngle: number): SupportNeed {
  const geometry = model.geometry;
  const positions = geometry.getAttribute('position').array;
  const index = geometry.index?.array ?? [];
  const faceCount = model.table.faces.length;
  const triangles = index.length / 3;
  const byFace = new Float64Array(faceCount);
  const sinSupport = Math.sin(((supportAngle + ANGLE_TOLERANCE) * Math.PI) / 180);

  // Faces lying on the bed are no overhang: none of their vertices is above it (as in overhangOf).
  const top = new Float64Array(faceCount).fill(Number.NEGATIVE_INFINITY);
  for (let v = 0; v < model.vertexFaces.length; v += 1) {
    const face = model.vertexFaces[v] ?? 0;
    top[face] = Math.max(top[face] ?? Number.NEGATIVE_INFINITY, turned[v * 3 + 2] ?? 0);
  }

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ta = new Vector3();
  const tb = new Vector3();
  const tc = new Vector3();
  const steep: number[] = [];
  for (let t = 0; t < triangles; t += 1) {
    const face = model.triangleFaces[t] ?? 0;
    if ((top[face] ?? Number.POSITIVE_INFINITY) <= bedZ + 0.05) continue;
    ta.fromArray(turned, (index[t * 3] ?? 0) * 3);
    tb.fromArray(turned, (index[t * 3 + 1] ?? 0) * 3);
    tc.fromArray(turned, (index[t * 3 + 2] ?? 0) * 3);
    const normal = tb.clone().sub(ta).cross(tc.clone().sub(ta));
    const length = normal.length();
    if (length === 0 || -normal.z / length <= sinSupport) continue;
    steep.push(t);
  }

  // computeBoundsTree builds a MeshBVH (viewerModel.ts); the augmented type only names its base.
  const bvh = geometry.boundsTree as unknown as MeshBVH | undefined;
  const downward = new Vector3(...down).normalize();
  const helper = Math.abs(downward.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = helper.clone().cross(downward).normalize();
  const w = downward.clone().cross(u).normalize();
  const directions = Array.from({ length: DIRECTIONS }, (_, k) => {
    const angle = (k * 2 * Math.PI) / DIRECTIONS;
    return u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(w, Math.sin(angle));
  });
  const ray = new Ray();
  const point = new Vector3();
  const distances = new Float64Array(DIRECTIONS);

  const hitFaces = new Int32Array(DIRECTIONS);

  /** Whether the layer under `origin` carries an overhang of `face`: resting, short or bridged. */
  const carried = (origin: Vector3, face: number): boolean => {
    if (!bvh) return false;
    // Inside the part: going down, the first surface is one the material leaves through.
    ray.set(origin, downward);
    const below = bvh.raycastFirst(ray, DoubleSide);
    if (below?.face && below.face.normal.dot(downward) > 0) return true;
    for (let k = 0; k < DIRECTIONS; k += 1) {
      ray.set(origin, directions[k] ?? u);
      const hit = bvh.raycastFirst(ray, DoubleSide, 0, BRIDGE_SPAN);
      distances[k] = hit ? hit.distance : Number.POSITIVE_INFINITY;
      hitFaces[k] = hit?.faceIndex != null ? (model.triangleFaces[hit.faceIndex] ?? -1) : -1;
    }
    for (let k = 0; k < DIRECTIONS; k += 1) {
      // Short: another face (a wall) right beside it. The overhang's own face beside it is its
      // slope going on, which is what the angle rule is about.
      if ((distances[k] ?? Infinity) <= SHORT_OVERHANG && hitFaces[k] !== face) return true;
    }
    for (let k = 0; k < DIRECTIONS / 2; k += 1) {
      if ((distances[k] ?? Infinity) + (distances[k + DIRECTIONS / 2] ?? Infinity) <= BRIDGE_SPAN) return true;
    }
    return false;
  };

  let area = 0;
  let carriedArea = 0;
  for (const t of steep) {
    a.fromArray(positions, (index[t * 3] ?? 0) * 3);
    b.fromArray(positions, (index[t * 3 + 1] ?? 0) * 3);
    c.fromArray(positions, (index[t * 3 + 2] ?? 0) * 3);
    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    const cross = ab.clone().cross(ac);
    const triangleArea = cross.length() / 2;
    const face = model.triangleFaces[t] ?? 0;
    ta.fromArray(turned, (index[t * 3] ?? 0) * 3);
    tb.fromArray(turned, (index[t * 3 + 1] ?? 0) * 3);
    tc.fromArray(turned, (index[t * 3 + 2] ?? 0) * 3);
    if ((ta.z + tb.z + tc.z) / 3 - bedZ <= NEAR_BED) {
      carriedArea += triangleArea;
      continue;
    }
    // Look at the triangle in m² equal parts, at the centre of each.
    const m = Math.min(MAX_SPLIT, Math.max(1, Math.ceil(Math.sqrt(triangleArea / SAMPLE_AREA))));
    const share = triangleArea / (m * m);
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; i + j < m; j += 1) {
        const centres: [number, number][] = [[(i + 1 / 3) / m, (j + 1 / 3) / m]];
        if (i + j < m - 1) centres.push([(i + 2 / 3) / m, (j + 2 / 3) / m]);
        for (const [s, r] of centres) {
          point.copy(a).addScaledVector(ab, s).addScaledVector(ac, r).addScaledVector(downward, BELOW);
          if (carried(point, face)) {
            carriedArea += share;
          } else {
            byFace[face] = (byFace[face] ?? 0) + share;
            area += share;
          }
        }
      }
    }
  }
  return { byFace, area, carried: carriedArea };
}
