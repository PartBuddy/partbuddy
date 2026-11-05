import { DoubleSide, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import { AS_DESIGNED, orientBuffers, type Down } from './orientation';
import { Overhang, overhangLimits, overhangOf } from './overhang';
import type { ViewerModel } from './viewerModel';

/**
 * The "ready to print" check (M7, ADR 0010 as amended on 2026-11-05): pure TypeScript on the
 * mirrored render meshes, no sidecar. It looks at what the practice run and the overhang view
 * showed matters: whether the part fits the printer, walls the nozzle cannot print, overhangs that
 * need support, how much of the part lies on the bed, and features SolidCraft could not build.
 * The part is printed in its print orientation (`down`, as designed by default), standing on its
 * lowest point.
 */

export interface PrintCheckProfile {
  /** Build volume X, Y, Z in mm. */
  bed: readonly [number, number, number];
  nozzle: number;
  /** Degrees from the vertical beyond which a face needs support. */
  overhang: number;
}

export interface PrintCheckBody {
  name: string;
  model: ViewerModel;
}

export interface PrintCheckFeature {
  name: string;
  error: string | null;
  warning: string | null;
  suppressed: boolean;
  rolledBack: boolean;
}

/** `block`: does not print as it is; `warn`: prints, but check it; `info`: worth knowing. */
export type FindingSeverity = 'block' | 'warn' | 'info';
export type PrintStatus = 'ready' | 'warn' | 'block';

/** Where a finding is: the faces by their SolidCraft names, per body. */
export interface FindingPlace {
  body: string;
  faces: string[];
}

export interface FindingBox {
  min: [number, number, number];
  max: [number, number, number];
}

interface Located {
  places: FindingPlace[];
  box: FindingBox | null;
}

export type PrintFinding =
  | { kind: 'size'; severity: FindingSeverity; size: [number, number, number]; bed: [number, number, number]; lying: boolean }
  | ({ kind: 'thinWall'; severity: FindingSeverity; thickness: number; minimum: number; area: number } & Located)
  | ({ kind: 'support'; severity: FindingSeverity; area: number; limit: number } & Located)
  | ({ kind: 'contact'; severity: FindingSeverity; area: number } & Located)
  | { kind: 'feature'; severity: FindingSeverity; feature: string; message: string };

export interface PrintCheck {
  status: PrintStatus;
  findings: PrintFinding[];
}

/** Two extrusion lines of the nozzle: the thinnest wall that prints solid. */
export function minimumWall(nozzle: number): number {
  return Math.round(nozzle * 2 * 1.125 * 100) / 100;
}

/** Below this, an area is noise of the tessellation, not a finding (mm²). */
const MIN_AREA = 1;
/** Walls under the nozzle width over at least this area make the part unprintable (mm²). */
const BLOCK_THIN_AREA = 5;
/** Less than this on the bed and the part may come loose or tip over (mm²). */
const MIN_CONTACT = 25;
/**
 * The opposite wall counts only when it faces back within 30°: parallel walls and sharp wedges.
 * A 60° dovetail edge is thin right at the edge too, but prints.
 */
const OPPOSITE = -Math.cos((30 * Math.PI) / 180);
/** Rays per body at most; larger meshes are sampled evenly. */
const MAX_RAYS = 40_000;
const EPSILON = 1e-3;

/** Per B-rep face of one body: an accumulated area, the extreme value and the bounds. */
class FaceTally {
  readonly area: Float64Array;
  readonly extreme: Float64Array;
  readonly min: Float64Array;
  readonly max: Float64Array;

  constructor(faces: number) {
    this.area = new Float64Array(faces);
    this.extreme = new Float64Array(faces).fill(Number.POSITIVE_INFINITY);
    this.min = new Float64Array(faces * 3).fill(Number.POSITIVE_INFINITY);
    this.max = new Float64Array(faces * 3).fill(Number.NEGATIVE_INFINITY);
  }

  add(face: number, area: number, value: number, points: readonly number[]): void {
    this.area[face] = (this.area[face] ?? 0) + area;
    this.extreme[face] = Math.min(this.extreme[face] ?? Number.POSITIVE_INFINITY, value);
    for (let p = 0; p < points.length; p += 3) {
      for (let k = 0; k < 3; k += 1) {
        const i = face * 3 + k;
        this.min[i] = Math.min(this.min[i] ?? Number.POSITIVE_INFINITY, points[p + k] ?? 0);
        this.max[i] = Math.max(this.max[i] ?? Number.NEGATIVE_INFINITY, points[p + k] ?? 0);
      }
    }
  }
}

/** Triangle corners, unit normal and area, from the render buffers. */
function triangle(positions: ArrayLike<number>, index: ArrayLike<number>, t: number) {
  const a = (index[t * 3] ?? 0) * 3;
  const b = (index[t * 3 + 1] ?? 0) * 3;
  const c = (index[t * 3 + 2] ?? 0) * 3;
  const corners = [a, b, c].flatMap((v) => [positions[v] ?? 0, positions[v + 1] ?? 0, positions[v + 2] ?? 0]);
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = corners as [number, number, number, number, number, number, number, number, number];
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  return {
    corners,
    area: length / 2,
    normal: length === 0 ? null : new Vector3(nx / length, ny / length, nz / length),
    centroid: new Vector3((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3),
  };
}

/** Wall thickness under each triangle: a ray from its middle straight into the material. */
function thinWalls(body: PrintCheckBody, minimum: number): FaceTally {
  const { model } = body;
  const geometry = model.geometry;
  // computeBoundsTree builds a MeshBVH (viewerModel.ts); the augmented type only names its base.
  const bvh = geometry.boundsTree as unknown as MeshBVH | undefined;
  const tally = new FaceTally(model.table.faces.length);
  const index = geometry.index?.array;
  const positions = geometry.getAttribute('position').array;
  if (!bvh || !index) return tally;
  const triangles = index.length / 3;
  const stride = Math.max(1, Math.ceil(triangles / MAX_RAYS));
  const ray = new Ray();
  for (let t = 0; t < triangles; t += stride) {
    const { corners, area, normal, centroid } = triangle(positions, index, t);
    if (!normal || area === 0) continue;
    ray.origin.copy(centroid).addScaledVector(normal, -EPSILON);
    ray.direction.copy(normal).negate();
    const hit = bvh.raycastFirst(ray, DoubleSide, 0, minimum);
    if (!hit || hit.faceIndex === t || hit.faceIndex === undefined || hit.faceIndex === null) continue;
    const opposite = triangle(positions, index, hit.faceIndex).normal;
    if (!opposite || opposite.dot(normal) > OPPOSITE) continue;
    tally.add(model.triangleFaces[t] ?? 0, area * stride, hit.distance + EPSILON, corners);
  }
  return tally;
}

/** Faces whose tallied area reaches `minArea`, with their names and common bounds. */
function locate(bodies: readonly PrintCheckBody[], tallies: readonly FaceTally[], minArea: number, accept: (tally: FaceTally, face: number) => boolean = () => true) {
  const places: FindingPlace[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let area = 0;
  let extreme = Number.POSITIVE_INFINITY;
  bodies.forEach((body, b) => {
    const tally = tallies[b];
    if (!tally) return;
    const faces: string[] = [];
    tally.area.forEach((value, face) => {
      if (value < minArea || !accept(tally, face)) return;
      faces.push(body.model.table.faces[face]?.name ?? `F${String(face)}`);
      area += value;
      extreme = Math.min(extreme, tally.extreme[face] ?? Number.POSITIVE_INFINITY);
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k] ?? Infinity, tally.min[face * 3 + k] ?? Infinity);
        max[k] = Math.max(max[k] ?? -Infinity, tally.max[face * 3 + k] ?? -Infinity);
      }
    });
    if (faces.length > 0) places.push({ body: body.name, faces });
  });
  const box: FindingBox | null = Number.isFinite(min[0]) ? { min, max } : null;
  return { places, box, area, extreme };
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function sizeFinding(turned: readonly { positions: Float32Array }[], bed: readonly [number, number, number]): PrintFinding | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of turned) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k] ?? Infinity, positions[i + k] ?? 0);
        max[k] = Math.max(max[k] ?? -Infinity, positions[i + k] ?? 0);
      }
    }
  }
  if (!Number.isFinite(min[0])) return null;
  const size = [0, 1, 2].map((k) => round((max[k] ?? 0) - (min[k] ?? 0), 1)) as [number, number, number];
  const fits = (x: number, y: number, z: number) => x <= bed[0] && y <= bed[1] && z <= bed[2];
  const [x, y, z] = size;
  // Turned on the bed, the slicer places it; that is no finding.
  if (fits(x, y, z) || fits(y, x, z)) return null;
  const lying = fits(x, z, y) || fits(z, x, y) || fits(y, z, x) || fits(z, y, x);
  return { kind: 'size', severity: 'block', size, bed: [...bed], lying };
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { block: 0, warn: 1, info: 2 };

/** Checks the mirrored bodies against the printer and material of the part. */
export function checkPrint(
  bodies: readonly PrintCheckBody[],
  profile: PrintCheckProfile,
  features: readonly PrintCheckFeature[] = [],
  down: Down = AS_DESIGNED,
): PrintCheck {
  const findings: PrintFinding[] = [];

  for (const feature of features) {
    if (feature.suppressed || feature.rolledBack) continue;
    if (feature.error) findings.push({ kind: 'feature', severity: 'block', feature: feature.name, message: feature.error });
    else if (feature.warning) findings.push({ kind: 'feature', severity: 'warn', feature: feature.name, message: feature.warning });
  }

  const visible = bodies.filter((body) => body.model.table.faces.length > 0);
  if (visible.length > 0) {
    // The bodies in the print orientation; walls do not depend on it, the rest does.
    const turned = visible.map(({ model }) => orientBuffers(model.geometry.getAttribute('position').array, model.geometry.getAttribute('normal').array, down));
    const size = sizeFinding(turned, profile.bed);
    if (size) findings.push(size);

    // Walls: under two lines they print poorly, under the nozzle width not at all.
    const minimum = minimumWall(profile.nozzle);
    const walls = visible.map((body) => thinWalls(body, minimum));
    const tooThin = locate(visible, walls, MIN_AREA, (tally, face) => (tally.extreme[face] ?? Infinity) < profile.nozzle);
    const thin = locate(visible, walls, MIN_AREA);
    if (thin.places.length > 0) {
      const severity: FindingSeverity = tooThin.area >= BLOCK_THIN_AREA ? 'block' : 'warn';
      findings.push({ kind: 'thinWall', severity, thickness: round(thin.extreme), minimum, area: round(thin.area, 0), places: thin.places, box: thin.box });
    }

    // Overhangs and the bed, with the same rule as the overhang view.
    let bedZ = Infinity;
    for (const { positions } of turned) for (let i = 2; i < positions.length; i += 3) bedZ = Math.min(bedZ, positions[i] ?? Infinity);
    const limits = overhangLimits(profile.overhang);
    const support: FaceTally[] = [];
    const contact: FaceTally[] = [];
    let onBed = 0;
    visible.forEach(({ model }, b) => {
      const geometry = model.geometry;
      const oriented = turned[b];
      if (!oriented) return;
      const map = overhangOf(
        {
          positions: oriented.positions,
          normals: oriented.normals,
          index: (geometry.index?.array ?? new Uint32Array()) as Uint32Array,
          vertexFaces: model.vertexFaces,
          faceCount: model.table.faces.length,
        },
        bedZ,
        limits,
      );
      onBed += map.area[Overhang.Bed];
      const supportTally = new FaceTally(model.table.faces.length);
      const contactTally = new FaceTally(model.table.faces.length);
      const positions = geometry.getAttribute('position').array;
      const index = geometry.index?.array ?? [];
      for (let t = 0; t < index.length / 3; t += 1) {
        const face = model.triangleFaces[t] ?? 0;
        const { corners, area } = triangle(positions, index, t);
        if ((map.supportByFace[face] ?? 0) > 0) supportTally.add(face, 0, 0, corners);
        const vertex = index[t * 3] ?? 0;
        if (map.vertices[vertex] === Overhang.Bed) contactTally.add(face, area, 0, corners);
      }
      supportTally.area.set(map.supportByFace);
      support.push(supportTally);
      contact.push(contactTally);
    });
    const needsSupport = locate(visible, support, MIN_AREA);
    if (needsSupport.area >= MIN_AREA) {
      findings.push({ kind: 'support', severity: 'warn', area: round(needsSupport.area, 0), limit: profile.overhang, places: needsSupport.places, box: needsSupport.box });
    }
    if (onBed < MIN_CONTACT) {
      const lying = locate(visible, contact, 1e-6);
      findings.push({ kind: 'contact', severity: 'warn', area: round(onBed, 0), places: lying.places, box: lying.box });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const status: PrintStatus = findings.some((f) => f.severity === 'block') ? 'block' : findings.some((f) => f.severity === 'warn') ? 'warn' : 'ready';
  return { status, findings };
}
