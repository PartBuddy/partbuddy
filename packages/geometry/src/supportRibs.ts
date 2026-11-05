import { DoubleSide, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import { bedOfPositions, orientBuffers, type Down } from './orientation';
import { supportNeed, type SupportNeed } from './supportReach';
import type { ViewerModel } from './viewerModel';

/**
 * Support printed into the model (M7f step 4, decided 2026-11-05): thin walls under the spots that
 * need support, each its own body, standing on the bed. The common numbers for designed-in breakaway
 * supports: walls 1 mm thick, one layer of air under the part, 0.5 mm beside it (Prusa forum,
 * Ultimaker community, dreaming3d). The slicer lays every body onto the bed by itself, so only
 * walls that stand on the bed stay where they belong; spots above other parts of the model get none.
 */


export interface RibOptions {
  /** Layer height of the printer, mm: the air between a wall and the part above it. */
  layer: number;
  /** mm between the walls. */
  spacing?: number;
  /** mm, the wall's thickness. */
  thickness?: number;
  /** mm of air beside the part. */
  gap?: number;
}

/** One wall: a sketch on a vertical plane, extruded symmetrically by its thickness. */
export interface SupportRib {
  /** On the bed, where the wall's line starts, world mm. */
  origin: [number, number, number];
  /** Along the wall, level. */
  xDir: [number, number, number];
  /** Up in the print. */
  yDir: [number, number, number];
  /** The outline in sketch coordinates: along the bed, then back along the top under the part. */
  points: [number, number][];
  thickness: number;
}

/** Sample step along a wall, mm. */
const STEP = 0.5;
/** Walls lower than this (mm) are left out: such spots rest on the first layers. */
const MIN_HEIGHT = 1;
/** Shorter walls (mm) are left out. */
const MIN_LENGTH = 2;
/** At most this many walls, and points per wall. */
const MAX_RIBS = 60;
const MAX_POINTS = 200;

const r4 = (value: number) => Math.round(value * 1e4) / 1e4 + 0;
const vec = (v: Vector3): [number, number, number] => [r4(v.x), r4(v.y), r4(v.z)];

/** Drops points of a polyline that lie on the line between their neighbours. */
function simplify(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const kept: [number, number][] = [points[0] ?? [0, 0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [ax, ay] = kept[kept.length - 1] ?? [0, 0];
    const [bx, by] = points[i] ?? [0, 0];
    const [cx, cy] = points[i + 1] ?? [0, 0];
    const off = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / Math.max(Math.hypot(cx - ax, cy - ay), 1e-9);
    if (off > 0.02) kept.push([bx, by]);
  }
  kept.push(points[points.length - 1] ?? [0, 0]);
  return kept;
}

/**
 * Walls under the spots of one body that need support, printed lying `down`. Each sample along a
 * wall looks straight up from under the bed: the first surface it meets must be one of those spots
 * (for the wall's middle) and well above the bed, and so must the surfaces half a wall plus the gap
 * to either side, so the wall keeps its distance from the part.
 */
export function supportRibs(model: ViewerModel, down: Down, need: SupportNeed, options: RibOptions): SupportRib[] {
  const bvh = model.geometry.boundsTree as unknown as MeshBVH | undefined;
  const index = model.geometry.index?.array;
  if (!bvh || !index) return [];
  const spacing = options.spacing ?? 4;
  const thickness = options.thickness ?? 1;
  const gap = options.gap ?? 0.5;
  const up = new Vector3(...down).normalize().negate();
  const ref = Math.abs(up.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const a = ref.clone().sub(up.clone().multiplyScalar(ref.dot(up))).normalize();
  const b = up.clone().cross(a).normalize();

  // The bed, and the footprint of the spots in (a, b).
  const positions = model.geometry.getAttribute('position').array;
  const p = new Vector3();
  let bed = Infinity;
  for (let v = 0; v < positions.length / 3; v += 1) bed = Math.min(bed, p.fromArray(positions, v * 3).dot(up));
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (let t = 0; t < index.length / 3; t += 1) {
    if (!need.triangles[t]) continue;
    for (let k = 0; k < 3; k += 1) {
      p.fromArray(positions, (index[t * 3 + k] ?? 0) * 3);
      minA = Math.min(minA, p.dot(a));
      maxA = Math.max(maxA, p.dot(a));
      minB = Math.min(minB, p.dot(b));
      maxB = Math.max(maxB, p.dot(b));
    }
  }
  if (!Number.isFinite(bed) || !Number.isFinite(minA)) return [];
  // Walls along the longer side of the footprint, so there are fewer and longer ones.
  const [along, across, from, to, start, end] = maxA - minA >= maxB - minB ? [a, b, minB, maxB, minA, maxA] : [b, a, minA, maxA, minB, maxB];

  const ray = new Ray();
  /** The height of the spot above (s, c) that needs support, or null. */
  const ceiling = (s: number, c: number, mustNeed: boolean): number | null => {
    ray.origin.copy(along).multiplyScalar(s).addScaledVector(across, c).addScaledVector(up, bed - 1);
    ray.direction.copy(up);
    const hit = bvh.raycastFirst(ray, DoubleSide);
    if (!hit || hit.faceIndex == null) return null;
    const height = hit.point.dot(up) - bed;
    if (height < MIN_HEIGHT) return null;
    if (mustNeed && !need.triangles[hit.faceIndex]) return null;
    return height;
  };

  const ribs: SupportRib[] = [];
  const side = thickness / 2 + gap;
  for (let c = from + spacing / 2; c <= to && ribs.length < MAX_RIBS; c += spacing) {
    let run: [number, number][] = [];
    const flush = () => {
      // Keep the gap at the run's ends too: a run ends at a wall or where the spots end.
      const trimmed = run.filter(([s]) => s >= (run[0]?.[0] ?? 0) + gap && s <= (run[run.length - 1]?.[0] ?? 0) - gap);
      run = [];
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if (!first || !last || last[0] - first[0] < MIN_LENGTH || ribs.length >= MAX_RIBS) return;
      const top = simplify(trimmed.map(([s, h]): [number, number] => [r4(s - first[0]), r4(h)]));
      const outline: [number, number][] = [[0, 0], [r4(last[0] - first[0]), 0], ...top.reverse()];
      if (outline.length > MAX_POINTS) return;
      const origin = along.clone().multiplyScalar(first[0]).addScaledVector(across, c).addScaledVector(up, bed);
      ribs.push({ origin: vec(origin), xDir: vec(along), yDir: vec(up), points: outline, thickness });
    };
    for (let s = start; s <= end + 1e-9; s += STEP) {
      const middle = ceiling(s, c, true);
      const left = middle === null ? null : ceiling(s, c - side, false);
      const right = middle === null || left === null ? null : ceiling(s, c + side, false);
      if (middle === null || left === null || right === null) {
        flush();
        continue;
      }
      const height = Math.min(middle, left, right) - options.layer;
      if (height < MIN_HEIGHT) {
        flush();
        continue;
      }
      run.push([s, height]);
    }
    flush();
  }
  return ribs;
}

/** The walls for one body as it lies now, from the material's overhang limit and the printer's layer. */
export function ribsFor(model: ViewerModel, down: Down, overhang: number, layer: number): SupportRib[] {
  const turned = orientBuffers(model.geometry.getAttribute('position').array, model.geometry.getAttribute('normal').array, down);
  const need = supportNeed(model, turned.positions, down, bedOfPositions(turned.positions), overhang);
  return supportRibs(model, down, need, { layer });
}
