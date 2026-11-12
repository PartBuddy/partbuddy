import { Box3, DoubleSide, Quaternion, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import { Overhang, overhangLimits, overhangOf, smallOverhangReach } from './overhang';
import type { ViewerModel } from './viewerModel';

/**
 * The "ready to print" check (M7, ADR 0010 as amended on 2026-11-05 for plan step R1): pure
 * TypeScript on the mirrored render meshes, no sidecar. It checks what only the design decides:
 * whether the part fits the printer, walls the nozzle cannot print, bodies that touch, how much of
 * the part lies on the bed, and features SolidCraft could not build. Overhangs are a hint by angle
 * only (yellow, never red): whether something needs support, and how, is the slicer's job; small
 * ones that hang from the material below, as the slicers ignore them, are left out.
 * The part is checked as designed, Z up, or lying on its print face where SolidCraft has one for the
 * body (the slicer export lays it down so). Each body stands on its own lowest point: the slicer lays
 * every object of the 3MF onto the bed by itself (seen in Bambu Studio, 2026-11-05), so bodies that
 * touch fall apart there.
 */

export interface PrintCheckProfile {
  /** Build volume X, Y, Z in mm. */
  bed: readonly [number, number, number];
  nozzle: number;
  /** Degrees from the vertical beyond which a face is an overhang. */
  overhang: number;
}

export interface PrintCheckBody {
  name: string;
  model: ViewerModel;
  /** SolidCraft's print face of the body, by name: the body is checked lying on it. */
  printFace?: string | undefined;
}

export interface PrintCheckFeature {
  name: string;
  error: string | null;
  warning: string | null;
  suppressed: boolean;
  rolledBack: boolean;
}

/** `block`: does not print as it is; `warn`: prints, but check it. */
export type FindingSeverity = 'block' | 'warn';
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
  | ({ kind: 'overhang'; severity: FindingSeverity; area: number; limit: number } & Located)
  | ({ kind: 'contact'; severity: FindingSeverity; area: number } & Located)
  | { kind: 'separate'; severity: FindingSeverity; bodies: string[] }
  | { kind: 'feature'; severity: FindingSeverity; feature: string; message: string }
  /** Two bodies share volume: as separate parts they do not go together (F2, SolidCraft's measure). */
  | ({ kind: 'overlap'; severity: FindingSeverity; bodies: [string, string]; volume: number } & Located)
  /** Two bodies come closer than the material's push fit without touching (F2). */
  | ({ kind: 'tight'; severity: FindingSeverity; bodies: [string, string]; gap: number; minimum: number } & Located)
  /** A joint does not reach a limit: two parts touch on the way (ADR 0027, SolidCraft's sweep). */
  | ({ kind: 'blocked'; severity: FindingSeverity; joint: string; bodies: [string, string]; at: number; limit: number; unit: JointUnit } & Located)
  /** A joint stands away from the position as designed, and the design is exported as it stands. */
  | { kind: 'posed'; severity: FindingSeverity; joint: string; value: number; unit: JointUnit };

export type JointUnit = 'deg' | 'mm';

/** A joint value as it stands, and where a sweep towards a limit stopped because two parts touched. */
export interface MeasuredMotion {
  joints: { name: string; values: { unit: JointUnit; value: number }[] }[];
  stops: { joint: string; unit: JointUnit; to: number; stoppedAt: number; a: string; b: string; at: [number, number, number] }[];
}

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
 * The opposite wall counts only when it faces back within 10°: walls, with or without draft. A wedge
 * is thin only at its edge and the slicer just leaves the tip out: a 60° dovetail edge, or the 30°
 * knife edge where a thread runs out of the end of a bolt (practice 2026-11-08: an M20 bolt read
 * as walls of 0.01 mm and blocked).
 */
const OPPOSITE = -Math.cos((10 * Math.PI) / 180);
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

/** How close (mm) two bodies must come to count as touching. */
const TOUCH = 0.05;
/** Vertices per body looked at for touching, at most. */
const MAX_TOUCH_VERTICES = 4000;

function boundsOf(body: PrintCheckBody): Box3 {
  const geometry = body.model.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

/** Whether body `a` touches or runs into body `b` (in the design frame, before turning). */
function touches(a: PrintCheckBody, b: PrintCheckBody): boolean {
  const boxA = boundsOf(a);
  const boxB = boundsOf(b);
  if (!boxA.clone().expandByScalar(TOUCH).intersectsBox(boxB)) return false;
  const bvh = b.model.geometry.boundsTree as unknown as MeshBVH | undefined;
  if (!bvh) return false;
  const positions = a.model.geometry.getAttribute('position').array;
  const count = positions.length / 3;
  const stride = Math.max(1, Math.ceil(count / MAX_TOUCH_VERTICES));
  const point = new Vector3();
  const ray = new Ray();
  const down = new Vector3(0, 0, -1);
  for (let v = 0; v < count; v += stride) {
    point.fromArray(positions, v * 3);
    if (boxB.containsPoint(point)) {
      // Inside b's box: inside b itself when the first surface below is one b's material leaves through.
      ray.set(point, down);
      const hit = bvh.raycastFirst(ray, DoubleSide);
      if (hit?.face && hit.face.normal.z < 0 && hit.distance > TOUCH) return true;
    }
    const closest = bvh.closestPointToPoint(point, undefined, 0, TOUCH);
    if (closest && closest.distance <= TOUCH) return true;
  }
  return false;
}

/** Width and depth of all bodies together, and the height of the tallest one on its own bed. */
function printedSize(bodies: readonly { positions: ArrayLike<number> }[]): [number, number, number] | null {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  let height = 0;
  for (const { positions } of bodies) {
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 2; k += 1) {
        min[k] = Math.min(min[k] ?? Infinity, positions[i + k] ?? 0);
        max[k] = Math.max(max[k] ?? -Infinity, positions[i + k] ?? 0);
      }
      low = Math.min(low, positions[i + 2] ?? 0);
      high = Math.max(high, positions[i + 2] ?? 0);
    }
    if (Number.isFinite(low)) height = Math.max(height, high - low);
  }
  if (!Number.isFinite(min[0])) return null;
  return [(max[0] ?? 0) - (min[0] ?? 0), (max[1] ?? 0) - (min[1] ?? 0), height];
}

/** The body's mesh as it lies on the bed: turned onto its print face, or as designed. */
function laid({ model, printFace }: PrintCheckBody): { positions: ArrayLike<number>; normals: ArrayLike<number> } {
  const positions = model.geometry.getAttribute('position').array;
  const normals = model.geometry.getAttribute('normal').array;
  const down = printFace ? model.table.faces.find((face) => face.name === printFace)?.planeNormal : undefined;
  if (!down) return { positions, normals };
  const turn = new Quaternion().setFromUnitVectors(new Vector3(...down).normalize(), new Vector3(0, 0, -1));
  const v = new Vector3();
  const turned = (source: ArrayLike<number>) => {
    const out = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      v.set(source[i] ?? 0, source[i + 1] ?? 0, source[i + 2] ?? 0).applyQuaternion(turn);
      out[i] = v.x;
      out[i + 1] = v.y;
      out[i + 2] = v.z;
    }
    return out;
  };
  return { positions: turned(positions), normals: turned(normals) };
}

/** The lowest point of one body: the bed it stands on. */
function bedOf(positions: ArrayLike<number>): number {
  let low = Infinity;
  for (let i = 2; i < positions.length; i += 3) low = Math.min(low, positions[i] ?? Infinity);
  return Number.isFinite(low) ? low : 0;
}

function sizeFinding(bodies: readonly { positions: ArrayLike<number> }[], bed: readonly [number, number, number]): PrintFinding | null {
  const printed = printedSize(bodies);
  if (!printed) return null;
  const size = printed.map((value) => round(value, 1)) as [number, number, number];
  const fits = (x: number, y: number, z: number) => x <= bed[0] && y <= bed[1] && z <= bed[2];
  const [x, y, z] = size;
  // Turned on the bed, the slicer places it; that is no finding.
  if (fits(x, y, z) || fits(y, x, z)) return null;
  const lying = fits(x, z, y) || fits(z, x, y) || fits(y, z, x) || fits(z, y, x);
  return { kind: 'size', severity: 'block', size, bed: [...bed], lying };
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { block: 0, warn: 1 };

const statusOf = (findings: readonly PrintFinding[]): PrintStatus =>
  findings.some((f) => f.severity === 'block') ? 'block' : findings.some((f) => f.severity === 'warn') ? 'warn' : 'ready';

/** Checks the mirrored bodies against the printer and material of the part. */
export function checkPrint(bodies: readonly PrintCheckBody[], profile: PrintCheckProfile, features: readonly PrintCheckFeature[] = []): PrintCheck {
  const findings: PrintFinding[] = [];

  for (const feature of features) {
    if (feature.suppressed || feature.rolledBack) continue;
    if (feature.error) findings.push({ kind: 'feature', severity: 'block', feature: feature.name, message: feature.error });
    else if (feature.warning) findings.push({ kind: 'feature', severity: 'warn', feature: feature.name, message: feature.warning });
  }

  const parts = bodies.filter((body) => body.model.table.faces.length > 0);
  if (parts.length > 0) {
    const meshes = parts.map(laid);
    const size = sizeFinding(meshes, profile.bed);
    if (size) findings.push(size);

    // Walls: under two lines they print poorly, under the nozzle width not at all.
    const minimum = minimumWall(profile.nozzle);
    const walls = parts.map((body) => thinWalls(body, minimum));
    const tooThin = locate(parts, walls, MIN_AREA, (tally, face) => (tally.extreme[face] ?? Infinity) < profile.nozzle);
    const thin = locate(parts, walls, MIN_AREA);
    if (thin.places.length > 0) {
      const severity: FindingSeverity = tooThin.area >= BLOCK_THIN_AREA ? 'block' : 'warn';
      findings.push({ kind: 'thinWall', severity, thickness: round(thin.extreme), minimum, area: round(thin.area, 0), places: thin.places, box: thin.box });
    }

    // Bodies that touch fall apart in the slicer, each laid onto the bed by itself.
    const separate = new Set<string>();
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const a = parts[i];
        const b = parts[j];
        if (a && b && (touches(a, b) || touches(b, a))) {
          separate.add(a.name);
          separate.add(b.name);
        }
      }
    }
    if (separate.size > 0) findings.push({ kind: 'separate', severity: 'warn', bodies: [...separate] });

    // Overhangs by angle and the area on the bed, each body on its own bed.
    const limits = overhangLimits(profile.overhang);
    const overhang: FaceTally[] = [];
    const contact: FaceTally[] = [];
    let onBed = 0;
    parts.forEach(({ model }, b) => {
      const geometry = model.geometry;
      const mesh = meshes[b];
      if (!mesh) return;
      const index = geometry.index?.array ?? [];
      const map = overhangOf(
        {
          positions: mesh.positions as Float32Array,
          normals: mesh.normals as Float32Array,
          index: index as Uint32Array,
          vertexFaces: model.vertexFaces,
          faceCount: model.table.faces.length,
        },
        bedOf(mesh.positions),
        limits,
        smallOverhangReach(profile.nozzle),
      );
      onBed += map.area[Overhang.Bed];
      const faces = model.table.faces.length;
      const overhangTally = new FaceTally(faces);
      const contactTally = new FaceTally(faces);
      for (let t = 0; t < index.length / 3; t += 1) {
        const face = model.triangleFaces[t] ?? 0;
        // The finding points at the faces where they are in the design, not where they lie on the bed.
        const { corners, area } = triangle(geometry.getAttribute('position').array, index, t);
        if ((map.supportByFace[face] ?? 0) > 0) overhangTally.add(face, 0, 0, corners);
        if (map.vertices[index[t * 3] ?? 0] === Overhang.Bed) contactTally.add(face, area, 0, corners);
      }
      map.supportByFace.forEach((area, face) => {
        overhangTally.area[face] = area;
      });
      overhang.push(overhangTally);
      contact.push(contactTally);
    });
    const steep = locate(parts, overhang, MIN_AREA);
    if (steep.area >= MIN_AREA) {
      findings.push({ kind: 'overhang', severity: 'warn', area: round(steep.area, 0), limit: profile.overhang, places: steep.places, box: steep.box });
    }
    if (onBed < MIN_CONTACT) {
      const lying = locate(parts, contact, 1e-6);
      findings.push({ kind: 'contact', severity: 'warn', area: round(onBed, 0), places: lying.places, box: lying.box });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { status: statusOf(findings), findings };
}

/** What SolidCraft measured between the bodies (`inspect.clearance`), in its own words. */
export interface MeasuredClearance {
  overlaps: { a: string; b: string; volume: number; box: FindingBox }[];
  near: { a: string; b: string; distance: number; from: [number, number, number]; to: [number, number, number] }[];
}

/** Below this, a shared volume is the contact of two faces, not an overlap (mm³). */
const MIN_OVERLAP = 0.01;
/** Below this, two bodies touch; the mesh check already reports touching bodies (mm). */
const CONTACT = 1e-3;
/** The box around a narrow gap, padded so the camera has something to frame (mm). */
const GAP_PAD = 2;

/**
 * Adds the clearance between bodies (plan step F2) to the check: overlaps, and gaps narrower than
 * the material's push fit (per side) that are no contact. Both print, so both are warnings; the
 * pair's bodies are named, since SolidCraft measures bodies, not faces.
 */
export function withClearance(check: PrintCheck, measured: MeasuredClearance, pushFit: number): PrintCheck {
  const findings: PrintFinding[] = [...check.findings];
  for (const overlap of measured.overlaps) {
    if (overlap.volume < MIN_OVERLAP) continue;
    findings.push({ kind: 'overlap', severity: 'warn', bodies: [overlap.a, overlap.b], volume: round(overlap.volume), places: [], box: overlap.box });
  }
  if (pushFit > 0) {
    for (const near of measured.near) {
      if (near.distance < CONTACT || near.distance >= pushFit) continue;
      const min = near.from.map((value, i) => round(Math.min(value, near.to[i] ?? value) - GAP_PAD, 3)) as [number, number, number];
      const max = near.from.map((value, i) => round(Math.max(value, near.to[i] ?? value) + GAP_PAD, 3)) as [number, number, number];
      findings.push({ kind: 'tight', severity: 'warn', bodies: [near.a, near.b], gap: round(near.distance), minimum: pushFit, places: [], box: { min, max } });
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { status: statusOf(findings), findings };
}
/** A sweep that stops this close to its limit reached it: a flap folding flat onto its base (deg, mm). */
const AT_LIMIT: Record<JointUnit, number> = { deg: 0.5, mm: 0.1 };
/** SolidCraft names an occurrence "<component>:<n>"; the component of a body carries the body's name. */
const bodyOf = (occurrence: string) => occurrence.replace(/:\d+$/, '');

/**
 * Adds the motion of the joints (ADR 0027) to the check: a joint that parts stop before its limit,
 * and a joint left away from the position as designed. Both print, so both are warnings.
 */
export function withMotion(check: PrintCheck, measured: MeasuredMotion): PrintCheck {
  const findings: PrintFinding[] = [...check.findings];
  for (const stop of measured.stops) {
    if (Math.abs(stop.to - stop.stoppedAt) <= AT_LIMIT[stop.unit]) continue;
    const min = stop.at.map((value) => round(value - GAP_PAD, 3)) as [number, number, number];
    const max = stop.at.map((value) => round(value + GAP_PAD, 3)) as [number, number, number];
    findings.push({ kind: 'blocked', severity: 'warn', joint: stop.joint, bodies: [bodyOf(stop.a), bodyOf(stop.b)], at: round(stop.stoppedAt, 1), limit: round(stop.to, 1), unit: stop.unit, places: [], box: { min, max } });
  }
  for (const joint of measured.joints) {
    for (const value of joint.values) {
      if (Math.abs(value.value) > 1e-3) findings.push({ kind: 'posed', severity: 'warn', joint: joint.name, value: round(value.value, 1), unit: value.unit });
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { status: statusOf(findings), findings };
}
