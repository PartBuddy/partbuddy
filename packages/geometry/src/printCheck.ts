import { Box3, DoubleSide, Ray, Vector3 } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import { AS_DESIGNED, bedOfPositions, orientBuffers, printedSize, type Down } from './orientation';
import { Overhang, overhangLimits, overhangOf } from './overhang';
import { counterboresOf, supportCause, type SupportCause } from './printFixes';
import { supportNeed } from './supportReach';
import { isSupportBody } from './supportBody';
import type { ViewerModel } from './viewerModel';

/**
 * The "ready to print" check (M7, ADR 0010 as amended on 2026-11-05): pure TypeScript on the
 * mirrored render meshes, no sidecar. It looks at what the practice run and the overhang view
 * showed matters: whether the part fits the printer, walls the nozzle cannot print, overhangs that
 * need support, how much of the part lies on the bed, and features SolidCraft could not build.
 * The part is printed in its print orientation (`down`, as designed by default). Each body stands on
 * its own lowest point: the slicer lays every object of the 3MF onto the bed by itself (seen in
 * Bambu Studio, practice run 2026-11-05), so bodies that touch fall apart there.
 */

export interface PrintCheckProfile {
  /** Build volume X, Y, Z in mm. */
  bed: readonly [number, number, number];
  nozzle: number;
  /** Degrees from the vertical beyond which a face needs support. */
  overhang: number;
  /** Layer height, mm: the air between support printed into the model and the part (default 0.2). */
  layer?: number;
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
  | ({ kind: 'support'; severity: FindingSeverity; area: number; limit: number; cause: SupportCause; ribs?: boolean } & Located)
  | ({ kind: 'contact'; severity: FindingSeverity; area: number } & Located)
  | { kind: 'separate'; severity: FindingSeverity; bodies: string[] }
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

/** How far (mm) a wall printed into the model may be beside a spot and still carry it: half the spacing and some. */
const RIB_REACH = 2.6;

/** Whether a wall printed into the model stands right under a spot (its top one layer below it). */
function carriedByRibs(supports: readonly PrintCheckBody[], spot: Vector3, up: Vector3, layer: number): boolean {
  const below = spot.clone().addScaledVector(up, -(layer + 0.05));
  for (const support of supports) {
    const bvh = support.model.geometry.boundsTree as unknown as MeshBVH | undefined;
    const hit = bvh?.closestPointToPoint(below, undefined, 0, RIB_REACH);
    if (hit && hit.point.dot(up) >= below.dot(up) - 0.6) return true;
  }
  return false;
}

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

function sizeFinding(turned: readonly { positions: Float32Array }[], bed: readonly [number, number, number]): PrintFinding | null {
  const printed = printedSize(turned);
  if (!printed) return null;
  const size = printed.map((value) => round(value, 1)) as [number, number, number];
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
    // Support printed into the model (M7f step 4) is checked for size only: it is no part, it carries.
    const supports = visible.filter((body) => isSupportBody(body.name));
    const partTurned = turned.filter((_, i) => !isSupportBody(visible[i]?.name ?? ''));
    const parts = visible.filter((body) => !isSupportBody(body.name));

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

    // Overhangs and the bed: each body on its own bed, steep overhangs only where nothing carries them.
    const limits = overhangLimits(profile.overhang);
    const SUPPORT_CAUSES: readonly SupportCause[] = ['fillet', 'hole', 'counterbore', 'other'];
    const support: Record<SupportCause, FaceTally[]> = { fillet: [], hole: [], counterbore: [], other: [] };
    const contact: FaceTally[] = [];
    const ribbed: FaceTally[] = [];
    const up = new Vector3(...down).normalize().negate();
    let onBed = 0;
    parts.forEach(({ model }, b) => {
      const geometry = model.geometry;
      const oriented = partTurned[b];
      if (!oriented) return;
      const bedZ = bedOfPositions(oriented.positions);
      const need = supportNeed(model, oriented.positions, down, bedZ, profile.overhang);
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
      const faces = model.table.faces.length;
      const supportTally: Record<SupportCause, FaceTally> = {
        fillet: new FaceTally(faces),
        hole: new FaceTally(faces),
        counterbore: new FaceTally(faces),
        other: new FaceTally(faces),
      };
      // The steps of counterbores facing the bed need support even where the rays see a bridge:
      // the hole cuts the strands (M7f step 3).
      const steps = new Set(counterboresOf(model, down).map((counterbore) => counterbore.step));
      const causes = Array.from({ length: faces }, (_, face) => (steps.has(face) ? 'counterbore' : (need.byFace[face] ?? 0) > 0 ? supportCause(model, face, down) : 'other'));
      const contactTally = new FaceTally(model.table.faces.length);
      const ribTally = new FaceTally(faces);
      const positions = geometry.getAttribute('position').array;
      const index = geometry.index?.array ?? [];
      // Which of the spots that need support stand over walls printed into the model.
      const flagged = new Float64Array(faces);
      const carried = new Float64Array(faces);
      for (let t = 0; t < index.length / 3; t += 1) {
        const face = model.triangleFaces[t] ?? 0;
        const { corners, area } = triangle(positions, index, t);
        if (supports.length > 0 && need.triangles[t] && !steps.has(face)) {
          flagged[face] = (flagged[face] ?? 0) + area;
          if (carriedByRibs(supports, triangle(positions, index, t).centroid, up, profile.layer ?? 0.2)) {
            carried[face] = (carried[face] ?? 0) + area;
            ribTally.add(face, 0, 0, corners);
          }
        }
        if (steps.has(face)) supportTally.counterbore.add(face, area, 0, corners);
        else if ((need.byFace[face] ?? 0) > 0) supportTally[causes[face] ?? 'other'].add(face, 0, 0, corners);
        const vertex = index[t * 3] ?? 0;
        if (map.vertices[vertex] === Overhang.Bed) contactTally.add(face, area, 0, corners);
      }
      need.byFace.forEach((area, face) => {
        if (area <= 0 || steps.has(face)) return;
        const share = (flagged[face] ?? 0) > 0 ? (carried[face] ?? 0) / (flagged[face] ?? 1) : 0;
        ribTally.area[face] = area * share;
        supportTally[causes[face] ?? 'other'].area[face] = area * (1 - share);
      });
      for (const cause of SUPPORT_CAUSES) support[cause].push(supportTally[cause]);
      ribbed.push(ribTally);
      contact.push(contactTally);
    });
    // One finding per cause, each with its own fix (M7f step 2).
    for (const cause of SUPPORT_CAUSES) {
      const needsSupport = locate(parts, support[cause], MIN_AREA);
      if (needsSupport.area >= MIN_AREA) {
        findings.push({ kind: 'support', severity: 'warn', area: round(needsSupport.area, 0), limit: profile.overhang, cause, places: needsSupport.places, box: needsSupport.box });
      }
    }
    // What the walls printed into the model carry is worth knowing: the slicer's supports go off.
    const onRibs = locate(parts, ribbed, MIN_AREA);
    if (onRibs.area >= MIN_AREA) {
      findings.push({ kind: 'support', severity: 'info', area: round(onRibs.area, 0), limit: profile.overhang, cause: 'other', ribs: true, places: onRibs.places, box: onRibs.box });
    }
    if (onBed < MIN_CONTACT) {
      const lying = locate(parts, contact, 1e-6);
      findings.push({ kind: 'contact', severity: 'warn', area: round(onBed, 0), places: lying.places, box: lying.box });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const status: PrintStatus = findings.some((f) => f.severity === 'block') ? 'block' : findings.some((f) => f.severity === 'warn') ? 'warn' : 'ready';
  return { status, findings };
}
