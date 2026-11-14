import { Box3, DoubleSide, Quaternion, Ray, Vector3 } from 'three';
import { ExtendedTriangle, type MeshBVH } from 'three-mesh-bvh';

import { CURVED_TOLERANCE, Overhang, overhangLimits, overhangOf, smallOverhangReach, spread } from './overhang';
import { sameCylinder, type FaceInfo } from './faceTable';
import type { ViewerModel } from './viewerModel';

/**
 * The "ready to print" check (M7, ADR 0010 as amended on 2026-11-05 for plan step R1): pure
 * TypeScript on the mirrored render meshes, no sidecar. It checks what only the design decides:
 * whether the part fits the printer, walls the nozzle cannot print, bodies that touch, how much of
 * the part lies on the bed, bodies that are no closed solid, and features SolidCraft could not build. Overhangs are a hint by angle
 * only (yellow, never red): a part with support prints, and how the support is built is the slicer's job; small
 * ones that hang from the material below, as the slicers ignore them, and ceilings the printer
 * bridges are left out.
 * The part is checked as designed, Z up, or lying on its print face where SolidCraft has one for the
 * body (the slicer export lays it down so). Each body stands on its own lowest point: the slicer lays
 * every object of the 3MF onto the bed by itself (seen in Bambu Studio, 2026-11-05), so bodies that
 * touch fall apart there. Bodies printed as one piece (a print-in-place hinge, `group`) stand on
 * their common lowest point and turn together (audit 2026-11-12, G1).
 */

export interface PrintCheckProfile {
  /** Build volume X, Y, Z in mm. */
  bed: readonly [number, number, number];
  nozzle: number;
  /** Layer height in mm: what lies flat is built of whole layers. */
  layer: number;
  /** Degrees from the vertical beyond which a face is an overhang. */
  overhang: number;
  /** Hints the user turned off in the print settings (BC-24): they are not looked for. */
  off?: readonly PrintHint[] | undefined;
}

/**
 * The hints of BC-24: yellow only, each one switched off in the print settings on its own (Manuel, 2026-11-13). The design
 * hints (`withDesign`, Manuel 2026-11-14) say how the part looks and holds, not whether it prints.
 */
export type PrintHint = 'smallHole' | 'narrowGap' | DesignHint;
export type DesignHint = 'sharpEdge' | 'edgeRadii' | 'rootCorner' | 'shallowSlope' | 'shellCorner';

export interface PrintCheckBody {
  name: string;
  model: ViewerModel;
  /** SolidCraft's print face of the body, by name: the body is checked lying on it. */
  printFace?: string | undefined;
  /**
   * Bodies with the same group print as one piece, as they lie to each other (a print-in-place hinge): they stand on
   * their common lowest point, turned onto the print face of the first of them that has one.
   */
  group?: string | undefined;
}

export interface PrintCheckFeature {
  name: string;
  /** SolidCraft's type of the timeline entry: `Sketch` and `Construction…` build no material. */
  type?: string | undefined;
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
  | { kind: 'size'; severity: FindingSeverity; body: string; size:[number, number, number]; bed: [number, number, number]; lying: boolean }
  /** `floor`: what lies flat (a floor, a lid), measured against layers; else a wall, against lines. */
  | ({ kind: 'thinWall'; severity: FindingSeverity; floor: boolean; /** For a floor: how many layers the minimum is. */ layers?: number; thickness: number; minimum: number; area: number } & Located)
  | ({ kind: 'overhang'; severity: FindingSeverity; area: number; limit: number } & Located)
  /** Rounded edges on the bed (a fillet on a bottom edge): `area` leans past `limit`° from the bed up (BC-27). */
  | ({ kind: 'roundBedEdge'; severity: FindingSeverity; area: number; limit: number } & Located)
  /** Holes under `minimum` across (BC-24, S12): how many, and the diameter of the smallest. */
  | ({ kind: 'smallHole'; severity: FindingSeverity; holes: number; diameter: number; minimum: number } & Located)
  /** Slots between two walls of one body under `minimum` wide (BC-24): `gap` the narrowest, over `area` of wall. */
  | ({ kind: 'narrowGap'; severity: FindingSeverity; gap: number; minimum: number; area: number } & Located)
  /**
   * Bodies with no rounded or chamfered edge at all (design hint): `edges` sharp outer edges, `length` mm of them, and the
   * radius the design rules ask for the largest such body (`size` its longest side).
   */
  | ({ kind: 'sharpEdge'; severity: FindingSeverity; edges: number; length: number; size: number; radius: number } & Located)
  /** Outer fillets of more than `most` radius families on one body (design hint): `radii` of the body with the most, smallest first. */
  | ({ kind: 'edgeRadii'; severity: FindingSeverity; radii: number[]; families: number; most: number } & Located)
  /**
   * Slender arms standing on a face with a sharp inner corner at their root (design hint): `roots` such corners; the thinnest
   * arm `thickness` thick and `length` long; `radius` the root fillet the design rules ask for it.
   */
  | ({ kind: 'rootCorner'; severity: FindingSeverity; roots: number; thickness: number; length: number; radius: number } & Located)
  /** Flat faces facing up that lean under `limit`° from flat (design hint): `faces` of them over `area` mm², the shallowest at `angle`°, its layer steps `step` mm wide. */
  | ({ kind: 'shallowSlope'; severity: FindingSeverity; faces: number; area: number; angle: number; step: number; limit: number } & Located)
  /**
   * A shell's rounded outer edges where the wall thins under half (design hint): `corners` such fillets; the thinnest
   * `thickness` against the `wall` beside it, its outer `radius` and the `inner` radius that keeps the wall even.
   */
  | ({ kind: 'shellCorner'; severity: FindingSeverity; corners: number; thickness: number; wall: number; radius: number; inner: number } & Located)
  /** The bodies with too little on the bed: how many, and the area of the one with the least. */
  | ({ kind: 'contact'; severity: FindingSeverity; area: number; bodies: number } & Located)
  | { kind: 'separate'; severity: FindingSeverity; bodies: string[] }
  /** Bodies printed as one piece (a print-in-place hinge) that touch: they fuse in the print and do not move (review of PR 366). */
  | { kind: 'fused'; severity: FindingSeverity; bodies: string[] }
  /** Bodies that are open shells (SolidCraft's surface bodies): no solid to print. */
  | { kind: 'open'; severity: FindingSeverity; bodies: string[] }
  /** Bodies whose print face is no flat face of them any more (renamed or changed since it was set): checked without it (audit H-29). */
  | { kind: 'faceLost'; severity: FindingSeverity; bodies: string[] }
  | { kind: 'feature'; severity: FindingSeverity; feature: string; message: string }
  /** Two bodies share volume: as separate parts they do not go together (F2, SolidCraft's measure). */
  | ({ kind: 'overlap'; severity: FindingSeverity; bodies: [string, string]; volume: number } & Located)
  /**
   * Two bodies come closer than the push fit without touching (F2); `inPlace`: they print as one piece and move against
   * each other, and come closer than the print-in-place gap, so they fuse in the print (audit D10).
   */
  | ({ kind: 'tight'; severity: FindingSeverity; bodies: [string, string]; gap: number; minimum: number; inPlace?: true } & Located)
  /**
   * A joint does not reach a limit: two parts touch on the way (ADR 0027, SolidCraft's sweep). `free`: the joint has no
   * limit on that side, and `limit` is only where the run was to end (audit H-04).
   */
  | ({ kind: 'blocked'; severity: FindingSeverity; joint: string; bodies: [string, string]; at: number; limit: number; unit: JointUnit; free?: true } & Located)
  /** A joint stands away from the position as designed, and the design is exported as it stands. */
  | { kind: 'posed'; severity: FindingSeverity; joint: string; value: number; unit: JointUnit }
  /** Features that build material but are not in the part as checked and exported: suppressed, or after the timeline's marker. */
  | { kind: 'leftOut'; severity: FindingSeverity; rolledBack: boolean; features: string[] };

export type JointUnit = 'deg' | 'mm';

/** A joint value as it stands, and where a sweep towards a limit stopped because two parts touched. */
export interface MeasuredMotion {
  joints: { name: string; values: { unit: JointUnit; value: number }[] }[];
  stops: { joint: string; unit: JointUnit; to: number; stoppedAt: number; a: string; b: string; at: [number, number, number]; free?: boolean }[];
}

export interface PrintCheck {
  status: PrintStatus;
  findings: PrintFinding[];
}

/**
 * The narrowest line a slicer lays by default: Bambu Studio's outer wall, the nozzle and 0.02 mm (0.22, 0.42, 0.62 and
 * 0.82 mm for its 0.2, 0.4, 0.6 and 0.8 mm nozzles: `outer_wall_line_width` of fdm_process_common.json and of
 * fdm_process_single_0.10_nozzle_0.2, …_0.30_nozzle_0.6, …_0.40_nozzle_0.8; PrusaSlicer 0.45 at 0.4, Arachne narrower
 * still). A wall under it does not print as a wall: under the nozzle alone was too late (audit MG-16, yardstick S1/S3),
 * under Prusa's 0.45 too early, as a wall of just one line drawn at 0.45 mm reads a little under it on a mesh (review of
 * PR #371, B1), and 1.05 times the nozzle was over Bambu's line for every nozzle but 0.4 (second review, S4).
 * shortcut: PrusaSlicer's profiles lay 0.25 mm outer walls on its 0.25 mm nozzle and 0.61 mm on 0.6 (PrusaResearch
 * 2.3.2.ini), so walls of 0.25–0.27 and 0.61 mm read red there though Prusa prints them; take the slicer of the
 * profile into the rule if those turn up.
 */
export function thinnestLine(nozzle: number): number {
  return Math.round((nozzle + 0.02) * 1000) / 1000;
}

/** Two extrusion lines of the nozzle: the thinnest wall that prints solid. */
export function minimumWall(nozzle: number): number {
  return Math.round(nozzle * 2 * 1.125 * 100) / 100;
}


/**
 * Four layers, and at least 0.8 mm: the thinnest floor or lid that prints closed (Stratasys Direct,
 * FDM Design Guide: four layers; Protolabs Network, key design considerations: over 0.8 mm). The
 * assistant designs to the same number (printProfiles.ts).
 */
export function minimumFloor(layer: number): number {
  return Math.round(Math.max(0.8, layerOf(layer) * 4) * 100) / 100;
}

/** The layer height to check with: the usual 0.2 mm where the profile names none, so floors are still checked. */
function layerOf(layer: number): number {
  return Number.isFinite(layer) && layer > 0 ? layer : 0.2;
}

/** Below this, an area is noise of the tessellation, not a finding (mm²). */
const MIN_AREA = 1;
/** Walls under one line over at least this area make the part unprintable (mm²). */
const BLOCK_THIN_AREA = 5;
/**
 * The opposite wall counts only when it faces back within 10°: walls, with or without draft. A wedge
 * is thin only at its edge and the slicer just leaves the tip out: a 60° dovetail edge, or the 30°
 * knife edge where a thread runs out of the end of a bolt (practice 2026-11-08: an M20 bolt read
 * as walls of 0.01 mm and blocked).
 */
const OPPOSITE = -Math.cos((10 * Math.PI) / 180);
/** Rays spread over a body's surface; a finer mesh still has one ray in the middle of every triangle. */
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

/**
 * The direction that points at the bed as the body lies: the normal of its print face, if it has a flat one. A face a cut
 * split is named `F1:+z#[…]` per piece until the next save renames the stored face; the pieces share its normal, so the
 * body lies on them (as `resolvePrintFaces` takes them).
 */
function printDown({ model, printFace }: PrintCheckBody): Vector3 | undefined {
  const flat = printFace ? model.table.faces.filter((face) => face.planeNormal) : [];
  const down = (flat.find((face) => face.name === printFace) ?? flat.find((face) => face.name.startsWith(`${printFace ?? ''}#`)))?.planeNormal;
  return down ? new Vector3(...down).normalize() : undefined;
}

/** A face within 45° of lying flat is a floor, a lid or a step: it is built in layers, not in lines. */
const FLAT = Math.SQRT1_2;
/** Just inside each corner of a triangle, as weights of its corners. */
const CORNERS: [number, number, number][] = [[0.998, 0.001, 0.001], [0.001, 0.998, 0.001], [0.001, 0.001, 0.998]];

/**
 * Whether a triangle lies on a cylinder the material lies outside of: a hole, a room cut for a knuckle, a flute. Its
 * outward normal points towards the axis.
 */
function hollowAt(model: PrintCheckBody['model'], t: number, normal: Vector3, centroid: Vector3): boolean {
  const cylinder = model.table.faces[model.triangleFaces[t] ?? 0]?.cylinder;
  if (!cylinder) return false;
  const axis = new Vector3(...cylinder.axis).normalize();
  const off = centroid.clone().sub(new Vector3(...cylinder.origin));
  return off.sub(axis.multiplyScalar(off.dot(axis))).dot(normal) < 0;
}

/**
 * A face runs along a hole when it lies within 15° of its axis: a side the hole breaks out of, not a rim it goes in or out at.
 * shortcut: a side that leans more than that (a drafted or slanted outer wall, from about 20°) is not found when a hole breaks
 * out of it, as before PR #365; nor are counterbores and countersinks (`cbore`, `csink`) or slots, which are no `…:bore:…`
 * cylinder. Measure the wall round the hole's own section instead if those must be found.
 */
const ALONG = Math.sin((15 * Math.PI) / 180);

/**
 * The wall between two cylinders round one axis: the difference of their radii; null when they are no such pair, or of one
 * radius: the far side of the same round face is across a solid rod, measured on the mesh (second review of PR #371, B2).
 * shortcut: other curved walls (a sphere, a fillet, a cone) are measured on the mesh, a little under their true size;
 * measure them on SolidCraft's surfaces if walls of just one line drawn round such faces turn red.
 */
function coaxial(a: FaceInfo | undefined, b: FaceInfo | undefined): number | null {
  const [p, q] = [a?.cylinder, b?.cylinder];
  if (!p || !q) return null;
  const axis = new Vector3(...p.axis).normalize();
  if (Math.abs(Math.abs(axis.dot(new Vector3(...q.axis).normalize())) - 1) > 1e-6) return null;
  const off = new Vector3(...q.origin).sub(new Vector3(...p.origin));
  if (off.sub(axis.multiplyScalar(off.dot(axis))).length() > 1e-3) return null;
  const gap = Math.abs(p.radius - q.radius);
  return gap < 1e-6 ? null : gap;
}

/**
 * The smallest hole that prints open (yardstick S12: "should not be smaller than 2 mm", Q4; Q16 2.0 mm): under it a hole
 * closes up or comes out well under size, whatever the nozzle, and is drilled out after printing.
 */
export const SMALLEST_HOLE = 2;

/** A hole goes round: the widest angle round its axis with no corner of its faces is under this (a quarter turn). */
const HOLE_GAP = Math.PI / 2;

/**
 * The holes of one body under SMALLEST_HOLE across (BC-24, S12), by SolidCraft's exact cylinders (`model.faces`), so the
 * coarse mesh of a small hole does not decide its size: a cylinder the material lies round (`hollowAt`), the faces of one
 * cylinder together, going all the way round. A groove, a fillet in an inner corner or a hole breaking out of a side
 * leaves more than a quarter turn without a corner and is no hole here, nor is a pocket shallower than it is wide. Per
 * face: its area, and the hole's diameter. Returns the tally and the number of holes. Linear in the triangles; the angles
 * are sorted per hole. Exported for its speed test.
 * shortcut: only exact cylinders: a hole drawn as a polygon, or in a mesh imported as such, is not found.
 */
export function smallHoles({ model }: PrintCheckBody): { tally: FaceTally; holes: number } {
  const faces = model.table.faces;
  const tally = new FaceTally(faces.length);
  const index = model.geometry.index?.array;
  const positions = model.geometry.getAttribute('position').array;
  const small = (face: FaceInfo | undefined) => !!face?.cylinder && face.cylinder.radius * 2 < SMALLEST_HOLE - EPSILON;
  if (!index || !faces.some(small)) return { tally, holes: 0 };
  const triangles = new Map<number, number[]>();
  const hollow = new Set<number>();
  for (let t = 0; t < index.length / 3; t += 1) {
    const face = model.triangleFaces[t] ?? 0;
    if (!small(faces[face])) continue;
    const own = triangles.get(face) ?? [];
    if (!hollow.has(face)) {
      const { normal, centroid } = triangle(positions, index, t);
      if (normal && hollowAt(model, t, normal, centroid)) hollow.add(face);
    }
    own.push(t);
    triangles.set(face, own);
  }
  // One cylinder per radius, axis (either way) and axis line (its point nearest the origin), to 0.001 mm: a map, as a
  // perforated plate of 4000 holes took 370 ms comparing every face with every group (BC-24 review).
  // shortcut: a value lying on a rounding step splits one hole in two groups, each less than round; key with a tolerance if one turns up.
  const groups = new Map<string, number[]>();
  const key = (n: number) => String(Math.round(n * 1000) || 0);
  for (const face of hollow) {
    const cylinder = faces[face]?.cylinder;
    if (!cylinder) continue;
    const axis = new Vector3(...cylinder.axis).normalize();
    if (axis.x < -EPSILON || (Math.abs(axis.x) <= EPSILON && (axis.y < -EPSILON || (Math.abs(axis.y) <= EPSILON && axis.z < 0)))) axis.negate();
    const origin = new Vector3(...cylinder.origin);
    const foot = origin.sub(axis.clone().multiplyScalar(origin.dot(axis)));
    const id = [cylinder.radius, axis.x, axis.y, axis.z, foot.x, foot.y, foot.z].map(key).join('|');
    const group = groups.get(id);
    if (group) group.push(face);
    else groups.set(id, [face]);
  }
  let holes = 0;
  for (const group of groups.values()) {
    const cylinder = faces[group[0] ?? 0]?.cylinder;
    if (!cylinder) continue;
    const axis = new Vector3(...cylinder.axis).normalize();
    const u = new Vector3().crossVectors(axis, Math.abs(axis.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
    const v = new Vector3().crossVectors(axis, u);
    const off = new Vector3();
    const angles: number[] = [];
    let [low, high] = [Infinity, -Infinity];
    for (const face of group) {
      for (const t of triangles.get(face) ?? []) {
        for (let k = 0; k < 3; k += 1) {
          const p = (index[t * 3 + k] ?? 0) * 3;
          off.set((positions[p] ?? 0) - cylinder.origin[0], (positions[p + 1] ?? 0) - cylinder.origin[1], (positions[p + 2] ?? 0) - cylinder.origin[2]);
          angles.push(Math.atan2(off.dot(v), off.dot(u)));
          low = Math.min(low, off.dot(axis));
          high = Math.max(high, off.dot(axis));
        }
      }
    }
    // A pocket shallower than it is wide (a dice pip 1.5 × 0.4 mm) prints as a dimple and needs no drill (BC-24 review).
    if (high - low < cylinder.radius * 2 - EPSILON) continue;
    angles.sort((a, b) => a - b);
    let gap = (angles[0] ?? 0) + 2 * Math.PI - (angles[angles.length - 1] ?? 0);
    for (let i = 1; i < angles.length; i += 1) gap = Math.max(gap, (angles[i] ?? 0) - (angles[i - 1] ?? 0));
    if (gap >= HOLE_GAP) continue;
    holes += 1;
    for (const face of group) {
      for (const t of triangles.get(face) ?? []) {
        const { corners, area } = triangle(positions, index, t);
        tally.add(face, area, cylinder.radius * 2, corners);
      }
    }
  }
  return { tally, holes };
}

/** What is too thin in one body: the faces under the minimum, and the area (mm²) that does not print at all. */
interface Thin {
  faces: FaceTally;
  unprintable: number;
}

/**
 * The narrowest slot between two walls of one body that stays open (BC-24): the gap PartBuddy keeps between print-in-place
 * parts, one nozzle and never under 0.3 mm (Prusa; designFit.ts `printInPlaceGap`, yardstick S34 0.3 to 0.6 mm). Narrower,
 * the lines on both sides squeeze into it and the slot prints closed: an engraved stroke, a kerf, a slit between letters.
 */
export function narrowestGap(nozzle: number): number {
  return Math.round(Math.max(0.3, nozzle) * 1000) / 1000;
}

/** Per triangle, the shell of the body it belongs to: triangles that share a corner (by position) are one shell. */
function shellsOf(model: PrintCheckBody['model']): Uint32Array {
  const index = model.geometry.index?.array ?? [];
  const positions = model.geometry.getAttribute('position').array;
  const parent = Array.from({ length: index.length / 3 }, (_, t) => t);
  const root = (t: number): number => {
    let r = t;
    while (parent[r] !== r) r = parent[r] ?? r;
    while (parent[t] !== r) [parent[t], t] = [r, parent[t] ?? r];
    return r;
  };
  const corner = new Map<string, number>();
  for (let i = 0; i < index.length; i += 1) {
    const p = (index[i] ?? 0) * 3;
    const at = `${String(positions[p])},${String(positions[p + 1])},${String(positions[p + 2])}`;
    const t = Math.floor(i / 3);
    const seen = corner.get(at);
    if (seen === undefined) corner.set(at, t);
    else parent[root(t)] = root(seen);
  }
  return Uint32Array.from(parent, (_, t) => root(t));
}

/**
 * Wall thickness under each triangle: rays straight into the material, spread a nozzle width apart
 * over the triangle, and at its corners (between two flat faces a wall is thinnest at one of them).
 * Walls stand against two lines and the nozzle; floors and lids, as the body lies, against four
 * layers and one.
 * Every triangle is looked at: a thin rib of a few triangles on a bolt of 150 000 is found, and counted with its own
 * area (audit MG-18, D40: over 40 000 triangles every n-th was, its area times n).
 * shortcut: a body with more surface than MAX_RAYS nozzle widths squared has its large triangles sampled more coarsely;
 * raise MAX_RAYS (or check in a worker) if thin spots in the middle of large faces of large parts are missed.
 */
function thinWalls(body: PrintCheckBody, profile: PrintCheckProfile, down = new Vector3(0, 0, -1), filled: readonly PrintCheckBody[] = []): { walls: Thin; floors: Thin; gaps: FaceTally } {
  const { model } = body;
  const geometry = model.geometry;
  // computeBoundsTree builds a MeshBVH (viewerModel.ts); the augmented type only names its base.
  const bvh = geometry.boundsTree as unknown as MeshBVH | undefined;
  const walls: Thin = { faces: new FaceTally(model.table.faces.length), unprintable: 0 };
  const floors: Thin = { faces: new FaceTally(model.table.faces.length), unprintable: 0 };
  const gaps = new FaceTally(model.table.faces.length);
  const gapMinimum = profile.off?.includes('narrowGap') ? 0 : narrowestGap(profile.nozzle);
  let shells: Uint32Array | undefined;
  const index = geometry.index?.array;
  const positions = geometry.getAttribute('position').array;
  if (!bvh || !index) return { walls, floors, gaps };
  const triangles = index.length / 3;
  let surface = 0;
  for (let t = 0; t < triangles; t += 1) surface += triangle(positions, index, t).area;
  const cell = Math.max(profile.nozzle ** 2, surface / MAX_RAYS);
  const ray = new Ray();
  for (let t = 0; t < triangles; t += 1) {
    const { corners, area, normal, centroid } = triangle(positions, index, t);
    if (!normal || area === 0) continue;
    // The bore of a hole (SolidCraft names the wall of a `solid.hole` "…:bore:…") is meant to be closed all round: a face
    // of the part that runs along it within the minimum is its wall, at whatever angle the two meet. So a hole that opens
    // the part's wall is found as a wall of nothing, as one that leaves 0.1 mm of it is (audit N-normteile-policy-2: a
    // 3.4 mm hole 1 mm from the side cut the side open over 20 mm and was passed). A face the hole goes in or out through
    // lies across it (a rod drilled across, a chamfer, a hole drilled askew: the slicer leaves out that rim's edge, as a
    // dovetail's), and another hole or cut cylinder it meets is no wall of it (review of PR #365).
    const face = model.table.faces[model.triangleFaces[t] ?? 0];
    const bore = face?.name.includes(':bore') && face.cylinder && hollowAt(model, t, normal, centroid) ? new Vector3(...face.cylinder.axis).normalize() : null;
    const flat = Math.abs(normal.dot(down)) >= FLAT;
    const thin = flat ? floors : walls;
    const minimum = flat ? minimumFloor(profile.layer) : minimumWall(profile.nozzle);
    const printable = flat ? layerOf(profile.layer) : thinnestLine(profile.nozzle);
    const count = Math.ceil(area / cell);
    ray.direction.copy(normal).negate();
    const along = (axis: number, [a, b, c]: [number, number, number]) => a * (corners[axis] ?? 0) + b * (corners[axis + 3] ?? 0) + c * (corners[axis + 6] ?? 0);
    [...spread(count), ...(count > 1 ? CORNERS : [])].forEach((weights, p) => {
      ray.origin.set(along(0, weights), along(1, weights), along(2, weights)).addScaledVector(normal, -EPSILON);
      const hit = bvh.raycastFirst(ray, DoubleSide, 0, minimum);
      if (!hit || hit.faceIndex === t || hit.faceIndex === undefined || hit.faceIndex === null) return;
      // Between two faces round one axis the wall is the difference of their radii, however coarse their meshes are: a tube
      // of 0.45 mm meshed 24 round outside and 48 inside read 0.41 mm and blocked (review of PR #371, B1).
      const thickness = coaxial(face, model.table.faces[model.triangleFaces[hit.faceIndex] ?? 0]) ?? hit.distance + EPSILON;
      // A wall of just the minimum is not under it.
      if (thickness > minimum - EPSILON) return;
      const met = triangle(positions, index, hit.faceIndex);
      const opposite = met.normal;
      if (!opposite || (opposite.dot(normal) > OPPOSITE && !(bore && Math.abs(opposite.dot(bore)) < ALONG && !hollowAt(model, hit.faceIndex, opposite, met.centroid)))) return;
      // The corners only say how thin the face gets; its area is shared out among the spread points.
      const share = p < count ? area / count : 0;
      thin.faces.add(model.triangleFaces[t] ?? 0, share, thickness, corners);
      if (thickness < printable - EPSILON) thin.unprintable += share;
    });
    // BC-24: out of a wall into the air, a wall of the same body facing back within 10° is a slot (`narrowestGap`).
    // shortcut: walls only, as the body lies; a slit under a layer between a floor and a ceiling of one body is not looked
    // for (PartBuddy's print-in-place parts are bodies of their own, measured by SolidCraft as `tight`).
    if (flat || gapMinimum === 0) continue;
    ray.direction.copy(normal);
    spread(count).forEach((weights) => {
      ray.origin.set(along(0, weights), along(1, weights), along(2, weights)).addScaledVector(normal, EPSILON);
      const hit = bvh.raycastFirst(ray, DoubleSide, 0, gapMinimum);
      if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) return;
      const other = model.table.faces[model.triangleFaces[hit.faceIndex] ?? 0];
      // Across a hole: the small-hole hint says it.
      if (face && other && sameCylinder(face, other)) return;
      // Between two faces round one axis (a peg in a cup) the gap is the difference of their radii: the facets lie
      // cos(π/n) inside them, and 0.4 mm meshed 24 round read 0.398 (BC-24 review), as walls did in #371 B1.
      const gap = coaxial(face, other) ?? hit.distance + EPSILON;
      if (gap > gapMinimum - EPSILON) return;
      const opposite = triangle(positions, index, hit.faceIndex).normal;
      if (!opposite || opposite.dot(normal) > OPPOSITE) return;
      // Two shells of one body that do not touch (an imported print-in-place mesh) are no slot (BC-24 review): left out.
      // shortcut: such a gap is not told at all; say it as parts of one mesh coming close if print-in-place meshes need it.
      shells ??= shellsOf(model);
      if (shells[t] !== shells[hit.faceIndex]) return;
      // Air filled by another body of the part is no slot: a debossed logo's colour body fills its pocket (BC-24 review).
      const middle = ray.origin.clone().addScaledVector(normal, hit.distance / 2);
      if (filled.some((other) => { const tree = other.model.geometry.boundsTree as unknown as MeshBVH | undefined; return !!tree && boundsOf(other).containsPoint(middle) && within(middle, tree); })) return;
      gaps.add(model.triangleFaces[t] ?? 0, area / count, gap, corners);
    });
  }
  return { walls, floors, gaps };
}

/**
 * Faces whose tallied area reaches `minArea`, with their names and common bounds. With `together`, smaller faces of a
 * body count when together they reach it: twenty ribs of 0.9 mm² a side are 36 mm² of thin wall, not twenty times noise
 * (audit D7). Overhangs do not add up so: the lying countersinks of the contract test's wall holder leave under 1 mm²
 * on each of two cone faces, which the slicers print, and together they turned a ready part yellow (contract test run
 * 43445239910, `wallholder` fixture).
 */
function locate(bodies: readonly PrintCheckBody[], tallies: readonly FaceTally[], minArea: number, together = false) {
  const places: FindingPlace[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let area = 0;
  let extreme = Number.POSITIVE_INFINITY;
  bodies.forEach((body, b) => {
    const tally = tallies[b];
    if (!tally) return;
    const faces: string[] = [];
    const small = tally.area.reduce((sum, value) => (value < minArea ? sum + value : sum), 0);
    tally.area.forEach((value, face) => {
      if (value <= 0 || (value < minArea && !(together && small >= minArea))) return;
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

/** How close (mm) to the bed a corner must lie to touch it: overhang.ts's BED_TOLERANCE. */
const BED_TOUCH = 0.05;

/**
 * A rounded bed edge has a facet leaning more than 65° from the vertical (BC-27 review B1): a fillet runs flat into the
 * bed, and meshed in two facets or more its lowest one leans at least 67.5°. A chamfer has one slope all the way: the
 * rules' 45°, or the material's angle where that is less, reads at most about 46° on the facets of a cone round a
 * rounded corner or a disc, which lean past a 40° or 35° material's limit but are no fillet.
 * shortcut: a cone leaning more than 65° at the bed (a chamfer nearly flat) is told as a rounded edge too; tell cones
 * apart by their single slope if one turns up.
 */
const FILLET_FOOT = Math.sin((65 * Math.PI) / 180);

/** How close (mm) two bodies must come to count as touching. */
const TOUCH = 0.05;
/** Askew, so a ray does not run along the edges of boxes drawn on the axes. */
const ASKEW = new Vector3(0.21, 0.33, -1).normalize();

function boundsOf(body: PrintCheckBody): Box3 {
  const geometry = body.model.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox ?? new Box3();
}

/** Whether a point lies in the material of a body: the first surface a ray from it meets is one the material leaves through. */
function within(point: Vector3, bvh: MeshBVH): boolean {
  const hit = bvh.raycastFirst(new Ray(point, ASKEW), DoubleSide);
  return !!hit?.face && hit.face.normal.dot(ASKEW) > 0;
}

/**
 * Whether a triangle of one surface comes within TOUCH of one of the other, triangle against triangle. Each triangle of
 * `a` near `b` asks `b` only for the triangles whose boxes come that close, and skips those wholly on one side of its
 * plane: a bolt of 100 000 triangles in a nut of 50 000 with 0.2 mm clearance takes about 0.2 s (three-mesh-bvh's
 * closestPointToGeometry, which compares every pair of near leaves, took 2 s; corners alone took 0.1 s and missed).
 */
function surfacesMeet(a: MeshBVH, b: MeshBVH, nearB: Box3): boolean {
  const near = new Box3();
  const own = new ExtendedTriangle();
  const other = new ExtendedTriangle();
  const normal = new Vector3();
  /** Triangle `i` of the BVH's own order into `into`. */
  const read = (bvh: MeshBVH, i: number, into: ExtendedTriangle) => {
    const t = bvh.resolveTriangleIndex(i);
    const index = bvh.geometry.index?.array ?? [];
    const positions = bvh.geometry.getAttribute('position').array;
    for (const [k, corner] of [into.a, into.b, into.c].entries()) corner.fromArray(positions, (index[t * 3 + k] ?? 0) * 3);
    into.needsUpdate = true;
  };
  const meets = () => {
    if (other.a.x > near.max.x && other.b.x > near.max.x && other.c.x > near.max.x) return false;
    if (other.a.x < near.min.x && other.b.x < near.min.x && other.c.x < near.min.x) return false;
    if (other.a.y > near.max.y && other.b.y > near.max.y && other.c.y > near.max.y) return false;
    if (other.a.y < near.min.y && other.b.y < near.min.y && other.c.y < near.min.y) return false;
    if (other.a.z > near.max.z && other.b.z > near.max.z && other.c.z > near.max.z) return false;
    if (other.a.z < near.min.z && other.b.z < near.min.z && other.c.z < near.min.z) return false;
    // All of the other on one side of this triangle's plane, further than TOUCH: apart.
    const offset = normal.dot(own.a);
    const [da, db, dc] = [normal.dot(other.a) - offset, normal.dot(other.b) - offset, normal.dot(other.c) - offset];
    if (Math.min(da, db, dc) > TOUCH || Math.max(da, db, dc) < -TOUCH) return false;
    return own.distanceToTriangle(other) <= TOUCH;
  };
  return a.shapecast({
    intersectsBounds: (box) => box.intersectsBox(nearB),
    intersectsRange: (offset, count) => {
      for (let i = offset; i < offset + count; i += 1) {
        read(a, i, own);
        near.setFromPoints([own.a, own.b, own.c]).expandByScalar(TOUCH);
        if (!near.intersectsBox(nearB)) continue;
        own.getNormal(normal);
        const found = b.shapecast({
          intersectsBounds: (box) => box.intersectsBox(near),
          intersectsRange: (from, many) => {
            for (let j = from; j < from + many; j += 1) {
              read(b, j, other);
              if (meets()) return true;
            }
            return false;
          },
        });
        if (found) return true;
      }
      return false;
    },
  });
}

/**
 * Whether two bodies touch or run into each other (in the design frame, before turning): their surfaces come within
 * TOUCH, triangle against triangle, or one lies wholly inside the other. Corners alone missed two bars laid across each
 * other, which touch over 100 mm² with no corner of one near the other (audit N-druckpruefung-3, MG-19, D41).
 */
function touches(a: PrintCheckBody, b: PrintCheckBody): boolean {
  if (!boundsOf(a).clone().expandByScalar(TOUCH).intersectsBox(boundsOf(b))) return false;
  const bvhA = a.model.geometry.boundsTree as unknown as MeshBVH | undefined;
  const bvhB = b.model.geometry.boundsTree as unknown as MeshBVH | undefined;
  if (!bvhA || !bvhB) return false;
  if (surfacesMeet(bvhA, bvhB, boundsOf(b).clone().expandByScalar(TOUCH))) return true;
  // Surfaces apart: either one body holds the other whole, or they are apart. Any point of one says which.
  const corner = (body: PrintCheckBody) => new Vector3().fromArray(body.model.geometry.getAttribute('position').array, 0);
  return within(corner(a), bvhB) || within(corner(b), bvhA);
}

/** Width, depth and height of one body as it lies. */
function extentOf(positions: ArrayLike<number>): [number, number, number] {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k] ?? Infinity, positions[i + k] ?? 0);
      max[k] = Math.max(max[k] ?? -Infinity, positions[i + k] ?? 0);
    }
  }
  return [(max[0] ?? 0) - (min[0] ?? 0), (max[1] ?? 0) - (min[1] ?? 0), (max[2] ?? 0) - (min[2] ?? 0)];
}

/** The body seen from above: the convex hull of its points (monotone chain). */
function outlineOf(positions: ArrayLike<number>): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < positions.length; i += 3) points.push([positions[i] ?? 0, positions[i + 1] ?? 0]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: readonly [number, number][]) => {
    const hull: [number, number][] = [];
    for (const p of list) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2] ?? p;
        const b = hull[hull.length - 1] ?? p;
        if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0) break;
        hull.pop();
      }
      hull.push(p);
    }
    return hull;
  };
  return [...half(points), ...half([...points].reverse())];
}

/** What a piece stands on: its area on the bed, the first and second moments of that area, its corners, and its top. */
interface Footprint {
  area: number;
  x: number;
  y: number;
  xx: number;
  yy: number;
  xy: number;
  /** The corners on the bed, x y z each (z unused). */
  corners: number[];
  top: number;
}

const emptyFootprint = (): Footprint => ({ area: 0, x: 0, y: 0, xx: 0, yy: 0, xy: 0, corners: [], top: -Infinity });

/** Adds a triangle lying on the bed to a footprint: its area and its moments about the axes (X and Y as it lies). */
function addToFootprint(foot: Footprint, [ax, ay, , bx, by, , cx, cy]: readonly number[]): void {
  const [x1, y1, x2, y2, x3, y3] = [ax ?? 0, ay ?? 0, bx ?? 0, by ?? 0, cx ?? 0, cy ?? 0];
  const area = Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2;
  foot.area += area;
  foot.x += (area * (x1 + x2 + x3)) / 3;
  foot.y += (area * (y1 + y2 + y3)) / 3;
  foot.xx += (area * (x1 * x1 + x2 * x2 + x3 * x3 + x1 * x2 + x2 * x3 + x3 * x1)) / 6;
  foot.yy += (area * (y1 * y1 + y2 * y2 + y3 * y3 + y1 * y2 + y2 * y3 + y3 * y1)) / 6;
  foot.xy += (area * (2 * (x1 * y1 + x2 * y2 + x3 * y3) + x1 * y2 + x2 * y1 + x1 * y3 + x3 * y1 + x2 * y3 + x3 * y2)) / 12;
  foot.corners.push(x1, y1, 0, x2, y2, 0, x3, y3, 0);
}

/**
 * Bambu Studio's auto brim (Brim.cpp, configBrimWidthByVolumeGroups, read 2026-11-13): a piece standing tall on a small
 * footprint gets a brim of h² / 1920 · max(Y extent / Ixx, X extent / Iyy) · v mm, Ixx and Iyy the second moments of
 * its first layer about its centre, v the fastest of the process's print speeds (Model.cpp `findMaxSpeed`); a brim
 * under 5 mm, or under 1.5 times the footprint's diagonal, is left out. The adhesion factor is 1, that of PLA.
 * A piece that would get one has too little on the bed for its height: it may come loose or tip over (audit D17, MG-20;
 * no source names a fixed area, the 25 mm² before had none). A 5 × 5 × 200 mm tower gets one, a 4 × 4 × 10 mm pin not.
 * Bambu reads X and Y as the part lies in the slicer; the check reads the footprint's two main axes instead, where its
 * second moment is least and most, so turning a fin on the plate does not change the answer, and a part exported along
 * its axes reads as Bambu reads it when the footprint has an axis of symmetry (a plate, a T, a U). A footprint alike all round (a square, a circle) has no main axes: it is read across
 * its narrowest width, as Bambu reads a square along its sides. The worst of all directions read slender plates up to
 * 1.2 times Bambu's (third review of PR #371, S6).
 * shortcut: an L footprint's main axes lie at a slant, so it reads up to 1.9 times what Bambu reads along X and Y (an L
 * 40 × 40 × 5 is reported from about 152 mm high, Bambu adds a brim from about 211 mm); it warns early, never late.
 * shortcut: PETG (factor 2) and TPU (0.5) are taken as PLA, the speed is Bambu's standard, and the footprint is the
 * faces on the bed, not the first layer the slicer cuts: a chamfer or a round at the foot leaves the footprint smaller
 * than that layer, so such a part reads a little less steady than Bambu takes it, and a round footprint's extent is its
 * diameter, not the diagonal of its box. Pass material and speed to the check, and cut the first layer, if parts are
 * misjudged so.
 */
function tipsOver(foot: Footprint, bed: number): boolean {
  if (foot.area < 1e-6) return true;
  const height = foot.top - bed;
  const cx = foot.x / foot.area;
  const cy = foot.y / foot.area;
  const [xx, yy, xy] = [foot.xx - foot.area * cx * cx, foot.yy - foot.area * cy * cy, foot.xy - foot.area * cx * cy];
  const hull = outlineOf(foot.corners);
  const extent = (angle: number) => {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    let [low, high] = [Infinity, -Infinity];
    for (const [x, y] of hull) {
      low = Math.min(low, x * c + y * s);
      high = Math.max(high, x * c + y * s);
    }
    return high - low;
  };
  const spread = (angle: number) => Math.cos(angle) ** 2 * xx + 2 * Math.cos(angle) * Math.sin(angle) * xy + Math.sin(angle) ** 2 * yy;
  const degrees = Array.from({ length: 180 }, (_, i) => (i * Math.PI) / 180);
  const widths = degrees.map(extent);
  const diagonal = Math.max(...widths);
  const main = 0.5 * Math.atan2(2 * xy, xx - yy);
  const [least, most] = [spread(main), spread(main + Math.PI / 2)];
  const alike = Math.abs(least - most) <= 1e-3 * (least + most);
  const worst = alike ? Math.min(...widths) / Math.max(least, 1e-9) : Math.max(extent(main) / Math.max(least, 1e-9), extent(main + Math.PI / 2) / Math.max(most, 1e-9));
  const brim = ((height * height) / 1920) * worst * BRIM_SPEED;
  return brim >= Math.min(BRIM_LEAST, 1.5 * diagonal);
}

/**
 * The speed of the auto brim: the fastest of Bambu Studio's standard process for the X1C, inner walls at 300 mm/s
 * (`0.20mm Standard @BBL X1C`, read 2026-11-13; 250 is only Bambu's fallback when a process names none), so the check
 * asks for a brim where the slicer lays one. And the narrowest brim it lays (mm).
 */
const BRIM_SPEED = 300;
const BRIM_LEAST = 5;

/** A size counts as fitting up to this much over the plate: sizes are shown to 0.1 mm. */
const SIZE_SLACK = 0.05;

/**
 * Whether the body fits the plate turned about Z by some angle: the slicer turns it freely, so a
 * long bar lies across the diagonal.
 * shortcut: tried in steps of 0.1°, which is 0.3 mm at the end of a 300 mm bar; solve the angles
 * exactly if a part that fits by less than that must not be blocked.
 */
function fitsTurned(positions: ArrayLike<number>, width: number, depth: number): boolean {
  const outline = outlineOf(positions);
  for (let step = 1; step < 1800; step += 1) {
    const cos = Math.cos((step * Math.PI) / 1800);
    const sin = Math.sin((step * Math.PI) / 1800);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of outline) {
      minX = Math.min(minX, x * cos - y * sin);
      maxX = Math.max(maxX, x * cos - y * sin);
      minY = Math.min(minY, x * sin + y * cos);
      maxY = Math.max(maxY, x * sin + y * cos);
    }
    if (maxX - minX <= width + SIZE_SLACK && maxY - minY <= depth + SIZE_SLACK) return true;
  }
  return false;
}

/** The body's mesh as it lies on the bed: turned so `down` points at it, or as designed. */
function laid(body: PrintCheckBody, down: Vector3 | undefined): { positions: ArrayLike<number>; normals: ArrayLike<number> } {
  const positions = body.model.geometry.getAttribute('position').array;
  const normals = body.model.geometry.getAttribute('normal').array;
  if (!down) return { positions, normals };
  const turn = new Quaternion().setFromUnitVectors(down, new Vector3(0, 0, -1));
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

/** Each body as it lies on the bed, the direction that points at it, and the height of the bed it stands on. */
export interface LaidBody {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  down: Vector3 | undefined;
  bed: number;
}

/** The bodies of one piece: the body itself, or every body of its group. */
const pieceOf = (bodies: readonly PrintCheckBody[], b: number): number[] => {
  const group = bodies[b]?.group;
  return group === undefined ? [b] : bodies.flatMap((other, i) => (other.group === group ? [i] : []));
};

/** The bodies as they lie on the bed: each on its own lowest point and print face, a group as one piece (`group`). */
export function laidBodies(bodies: readonly PrintCheckBody[]): LaidBody[] {
  const downs = bodies.map((_, b) => pieceOf(bodies, b).map((i) => (bodies[i] ? printDown(bodies[i]) : undefined)).find(Boolean));
  const meshes = bodies.map((body, b) => laid(body, downs[b]));
  const lows = meshes.map((mesh) => bedOf(mesh.positions));
  return meshes.map((mesh, b) => ({ ...mesh, down: downs[b], bed: Math.min(...pieceOf(bodies, b).map((i) => lows[i] ?? Infinity)) }));
}

/** A body that fits the build volume in no position on the plate. */
function sizeFinding(body: string, positions: ArrayLike<number>, bed: readonly [number, number, number]): PrintFinding | null {
  const [x, y, z] = extentOf(positions);
  if (!Number.isFinite(x)) return null;
  const fits = (a: number, b: number, c: number) => a <= bed[0] + SIZE_SLACK && b <= bed[1] + SIZE_SLACK && c <= bed[2] + SIZE_SLACK;
  // Turned on the bed, the slicer places it; that is no finding.
  if (fits(x, y, z) || fits(y, x, z) || (z <= bed[2] + SIZE_SLACK && fitsTurned(positions, bed[0], bed[1]))) return null;
  const lying = fits(x, z, y) || fits(z, x, y) || fits(y, z, x) || fits(z, y, x);
  return { kind: 'size', severity: 'block', body, size: [round(x, 1), round(y, 1), round(z, 1)], bed: [...bed], lying };
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { block: 0, warn: 1 };

const statusOf = (findings: readonly PrintFinding[]): PrintStatus =>
  findings.some((f) => f.severity === 'block') ? 'block' : findings.some((f) => f.severity === 'warn') ? 'warn' : 'ready';

/** Checks the mirrored bodies against the printer and material of the part. */
export function checkPrint(bodies: readonly PrintCheckBody[], profile: PrintCheckProfile, features: readonly PrintCheckFeature[] = []): PrintCheck {
  const findings: PrintFinding[] = [];

  // A suppressed or rolled back feature that builds material is not in the part as checked: said, so leaving out a failing
  // feature does not read as a fix, nor a rolled back timeline as the whole part (audit H-03). Sketches and construction
  // geometry build nothing (review of PR #371, K5).
  const builds = (feature: PrintCheckFeature) => !/^(Sketch|Construction)/.test(feature.type ?? '');
  for (const rolledBack of [false, true]) {
    const left = features.filter((feature) => builds(feature) && (rolledBack ? feature.rolledBack : feature.suppressed && !feature.rolledBack));
    if (left.length > 0) findings.push({ kind: 'leftOut', severity: 'warn', rolledBack, features: left.map((feature) => feature.name) });
  }
  for (const feature of features) {
    if (feature.rolledBack || feature.suppressed) continue;
    if (feature.error) findings.push({ kind: 'feature', severity: 'block', feature: feature.name, message: feature.error });
    else if (feature.warning) findings.push({ kind: 'feature', severity: 'warn', feature: feature.name, message: feature.warning });
  }

  // A surface body has no volume to fill: nothing else about it is worth a finding.
  const shells = bodies.filter((body) => body.model.table.faces.length > 0);
  const open = shells.filter((body) => body.model.openEdges > 0);
  if (open.length > 0) findings.push({ kind: 'open', severity: 'block', bodies: open.map((body) => body.name) });
  // A model that carries no count is taken as closed, not dropped from the check.
  const parts = shells.filter((body) => !(body.model.openEdges > 0));
  if (parts.length > 0) {
    // A print face that is gone leaves the body as designed: said, not done silently (audit H-29).
    // shortcut: a face kept under a body's old name is not found for the renamed body (no finding until a save brings
    // SolidCraft's faces, PrintFaceKeeper.takeSaved); pass the kept faces of bodies that are gone if that must be said.
    const lost = parts.filter((body) => body.printFace && !printDown(body)).map((body) => body.name);
    if (lost.length > 0) findings.push({ kind: 'faceLost', severity: 'warn', bodies: lost });
    const meshes = laidBodies(parts);
    // Each piece against the plate by itself: the slicer places every one, on more plates if need be.
    parts.forEach((_, b) => {
      const piece = pieceOf(parts, b);
      if (piece[0] !== b) return;
      const positions = piece.length === 1 ? (meshes[b]?.positions ?? []) : piece.flatMap((i) => Array.from(meshes[i]?.positions ?? []));
      const size = sizeFinding(piece.map((i) => parts[i]?.name).join(' + ').slice(0, 200), positions, profile.bed);
      if (size) findings.push(size);
    });

    // Walls: under two lines they print poorly, under the nozzle width not at all. Floors and lids:
    // under four layers they do not close, under one layer nothing is laid.
    const thin = parts.map((body, b) => thinWalls(body, profile, meshes[b]?.down, parts.filter((other) => other !== body)));
    for (const floor of [false, true]) {
      const kind = thin.map((body) => (floor ? body.floors : body.walls));
      const found = locate(parts, kind.map((body) => body.faces), MIN_AREA, true);
      if (found.places.length === 0) continue;
      const unprintable = kind.reduce((sum, body) => sum + body.unprintable, 0);
      const minimum = floor ? minimumFloor(profile.layer) : minimumWall(profile.nozzle);
      const layers = floor ? { layers: round(minimum / layerOf(profile.layer), 1) } : {};
      findings.push({ kind: 'thinWall', severity: unprintable >= BLOCK_THIN_AREA ? 'block' : 'warn', floor, ...layers, thickness: round(found.extreme), minimum, area: round(found.area, 0), places: found.places, box: found.box });
    }
    // Slots that print closed (BC-24): a hint, as the part prints, only the slot not.
    const slots = locate(parts, thin.map((body) => body.gaps), MIN_AREA, true);
    if (slots.places.length > 0) findings.push({ kind: 'narrowGap', severity: 'warn', gap: round(slots.extreme, 3), minimum: narrowestGap(profile.nozzle), area: round(slots.area, 0), places: slots.places, box: slots.box });

    // Holes under 2 mm (BC-24): a hint, as they print, only not open or to size.
    if (!profile.off?.includes('smallHole')) {
      const holes = parts.map(smallHoles);
      const found = locate(parts, holes.map((body) => body.tally), 0);
      const count = holes.reduce((sum, body) => sum + body.holes, 0);
      if (count > 0) findings.push({ kind: 'smallHole', severity: 'warn', holes: count, diameter: round(found.extreme), minimum: SMALLEST_HOLE, places: found.places, box: found.box });
    }

    // Bodies that touch fall apart in the slicer, each laid onto the bed by itself. Bodies printed as one piece stay
    // together there (audit G1), and where they touch they fuse: a hinge whose lid touches its box does not turn.
    const separate = new Set<string>();
    const fused = new Set<string>();
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const a = parts[i];
        const b = parts[j];
        if (!a || !b || !touches(a, b)) continue;
        const found = a.group !== undefined && a.group === b.group ? fused : separate;
        found.add(a.name);
        found.add(b.name);
      }
    }
    if (separate.size > 0) findings.push({ kind: 'separate', severity: 'warn', bodies: [...separate] });
    if (fused.size > 0) findings.push({ kind: 'fused', severity: 'warn', bodies: [...fused] });

    // Overhangs by angle and the area on the bed, each body on the bed of its piece.
    const limits = overhangLimits(profile.overhang);
    const overhang: FaceTally[] = [];
    const rounded: FaceTally[] = [];
    // How far a curved face leans down past the limit, with the tolerance of curved faces (overhang.ts).
    const roundLean = Math.sin(((limits.support + CURVED_TOLERANCE) * Math.PI) / 180);
    const standing: { tally: FaceTally; area: number; foot: Footprint }[] = [];
    parts.forEach((body, b) => {
      const { model } = body;
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
        mesh.bed,
        limits,
        smallOverhangReach(profile.nozzle),
      );
      const faces = model.table.faces.length;
      const overhangTally = new FaceTally(faces);
      const contactTally = new FaceTally(faces);
      const roundTally = new FaceTally(faces);
      // Per curved face as it lies: whether it touches the bed beside a face lying there, whether a facet lies as flat as a
      // fillet's foot, its corners (x y z each), and how high its leaning part reaches; and its facets leaning past the limit.
      const besideBed = new Uint8Array(faces);
      const flatFoot = new Uint8Array(faces);
      const faceCorners = new Map<number, number[]>();
      const leanTop = new Float64Array(faces).fill(-Infinity);
      const leaning: { face: number; area: number; corners: number[]; lying: ReturnType<typeof triangle> }[] = [];
      const at = (v: number) => `${String(Math.round((mesh.positions[v * 3] ?? 0) * 1000))},${String(Math.round((mesh.positions[v * 3 + 1] ?? 0) * 1000))}`;
      const bedPoints = new Set<string>();
      map.vertices.forEach((kind, v) => {
        if (kind === Overhang.Bed) bedPoints.add(at(v));
      });
      const foot = emptyFootprint();
      for (let i = 2; i < mesh.positions.length; i += 3) foot.top = Math.max(foot.top, mesh.positions[i] ?? -Infinity);
      for (let t = 0; t < index.length / 3; t += 1) {
        const face = model.triangleFaces[t] ?? 0;
        // The finding points at the faces where they are in the design, not where they lie on the bed.
        const { corners, area } = triangle(geometry.getAttribute('position').array, index, t);
        const lying = triangle(mesh.positions, index, t);
        if ((map.supportByFace[face] ?? 0) > 0) overhangTally.add(face, 0, 0, corners);
        if (map.vertices[index[t * 3] ?? 0] === Overhang.Bed) contactTally.add(face, area, 0, corners);
        // As it lies: all three corners on the bed.
        if ([0, 1, 2].every((k) => map.vertices[index[t * 3 + k] ?? 0] === Overhang.Bed)) addToFootprint(foot, lying.corners);
        if (!map.curved[face] || map.vertices[index[t * 3] ?? 0] === Overhang.Bed) continue;
        for (let k = 0; k < 3; k += 1) {
          const v = index[t * 3 + k] ?? 0;
          if ((mesh.positions[v * 3 + 2] ?? Infinity) <= mesh.bed + BED_TOUCH && bedPoints.has(at(v))) besideBed[face] = 1;
        }
        const own = faceCorners.get(face) ?? [];
        own.push(...lying.corners);
        faceCorners.set(face, own);
        if (lying.normal && -lying.normal.z > FILLET_FOOT) flatFoot[face] = 1;
        if (lying.normal && -lying.normal.z > roundLean) leaning.push({ face, area, corners, lying });
      }
      // Only the outside of a round counts (review M1): the face's corners round a facet lie behind it on the whole, as along
      // a fillet's profile, also where it runs round the foot of a hole (the tight bend of the profile outweighs the wide
      // one round the hole). Round a hole's roof they lie in front.
      for (const { face, area, corners, lying } of leaning) {
        const { normal, centroid } = lying;
        const own = faceCorners.get(face) ?? [];
        // A face told as an overhang is left out below anyway: no need to look round its every facet (quadratic in its size).
        if (!besideBed[face] || !flatFoot[face] || !normal || (map.supportByFace[face] ?? 0) >= MIN_AREA) continue;
        let reach = 0;
        for (let k = 0; k < 9; k += 3) reach = Math.max(reach, centroid.distanceTo(new Vector3(lying.corners[k], lying.corners[k + 1], lying.corners[k + 2])));
        // Three times the way from the middle to the farthest corner: the neighbours across each edge of the facet count.
        const within = (3 * reach) ** 2;
        let behind = 0;
        for (let k = 0; k < own.length; k += 3) {
          const [dx, dy, dz] = [(own[k] ?? 0) - centroid.x, (own[k + 1] ?? 0) - centroid.y, (own[k + 2] ?? 0) - centroid.z];
          if (dx * dx + dy * dy + dz * dz <= within) behind += dx * normal.x + dy * normal.y + dz * normal.z;
        }
        if (behind >= -EPSILON) continue;
        roundTally.add(face, area, 0, corners);
        leanTop[face] = Math.max(leanTop[face] ?? -Infinity, lying.corners[2] ?? -Infinity, lying.corners[5] ?? -Infinity, lying.corners[8] ?? -Infinity);
      }
      map.supportByFace.forEach((area, face) => {
        overhangTally.area[face] = area;
      });
      overhang.push(overhangTally);
      // A rounded bed edge (BC-27): a curved face that starts on the bed beside a face lying there, leaning past the limit
      // above the first layer (under it the slicer's first layer is all there is of it). A large one needs support and is
      // told as an overhang already; this tells the small ones the slicers print without, whose foot ends flat and curls.
      roundTally.area.forEach((_, face) => {
        if ((leanTop[face] ?? -Infinity) <= mesh.bed + layerOf(profile.layer) || (overhangTally.area[face] ?? 0) >= MIN_AREA) roundTally.area[face] = 0;
      });
      rounded.push(roundTally);
      standing[b] = { tally: contactTally, area: map.area[Overhang.Bed], foot };
    });
    // Each piece lies on the bed by itself: one with a broad base does not hold another on its edge. A group holds as one.
    const loose: { body: PrintCheckBody; tally: FaceTally; area: number }[] = [];
    parts.forEach((body, b) => {
      const tally = standing[b]?.tally;
      const piece = pieceOf(parts, b);
      const onBed = piece.reduce((sum, i) => sum + (standing[i]?.area ?? 0), 0);
      const foot = piece.reduce((all, i) => {
        const one = standing[i]?.foot;
        if (!one) return all;
        return { area: all.area + one.area, x: all.x + one.x, y: all.y + one.y, xx: all.xx + one.xx, yy: all.yy + one.yy, xy: all.xy + one.xy, corners: [...all.corners, ...one.corners], top: Math.max(all.top, one.top) };
      }, emptyFootprint());
      if (tally && tipsOver(foot, meshes[b]?.bed ?? 0)) loose.push({ body, tally, area: onBed });
    });
    const steep = locate(parts, overhang, MIN_AREA);
    if (steep.area >= MIN_AREA) {
      findings.push({ kind: 'overhang', severity: 'warn', area: round(steep.area, 0), limit: limits.support, places: steep.places, box: steep.box });
    }
    const bedEdges = locate(parts, rounded, MIN_AREA, true);
    if (bedEdges.places.length > 0) findings.push({ kind: 'roundBedEdge', severity: 'warn', area: round(bedEdges.area, 0), limit: limits.support, places: bedEdges.places, box: bedEdges.box });
    // One finding for all of them: fifty pins are one thing to say, and none drops off the end of a list.
    if (loose.length > 0) {
      const lying = locate(loose.map((entry) => entry.body), loose.map((entry) => entry.tally), 1e-6);
      const places = loose.map(({ body }) => lying.places.find((place) => place.body === body.name) ?? { body: body.name, faces: [] });
      findings.push({ kind: 'contact', severity: 'warn', area: round(Math.min(...loose.map((entry) => entry.area)), 0), bodies: loose.length, places, box: lying.box });
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

/** Bodies printed as one piece that move against each other (`pair`), and the gap they need not to fuse (audit D10). */
export interface InPlaceFit {
  gap: number;
  pair: (a: string, b: string) => boolean;
}

/**
 * Adds the clearance between bodies (plan step F2) to the check: overlaps, and gaps that are no contact but narrower
 * than the push fit (per side), or than `inPlace.gap` between bodies that print as one piece and move. Both print, so
 * both are warnings; the pair's bodies are named, since SolidCraft measures bodies, not faces. A gap is compared as it
 * is said, to 0.001 mm like the scaled fits: SolidCraft measures a gap of 0.4 mm as 0.39999999999998.
 */
export function withClearance(check: PrintCheck, measured: MeasuredClearance, pushFit: number, inPlace?: InPlaceFit): PrintCheck {
  const findings: PrintFinding[] = [...check.findings];
  for (const overlap of measured.overlaps) {
    if (overlap.volume < MIN_OVERLAP) continue;
    // shortcut: an overlap stays a warning the assistant must fix or name (audit H-12); between bodies a joint moves or an
    // assembly step puts together it should block, which needs the joints' bodies and the assembly order passed in here.
    findings.push({ kind: 'overlap', severity: 'warn', bodies: [overlap.a, overlap.b], volume: round(overlap.volume), places: [], box: overlap.box });
  }
  for (const near of measured.near) {
    const together = inPlace !== undefined && inPlace.pair(near.a, near.b);
    const minimum = together ? inPlace.gap : pushFit;
    if (minimum <= 0 || near.distance < CONTACT || round(near.distance, 3) >= minimum) continue;
    const min = near.from.map((value, i) => round(Math.min(value, near.to[i] ?? value) - GAP_PAD, 3)) as [number, number, number];
    const max = near.from.map((value, i) => round(Math.max(value, near.to[i] ?? value) + GAP_PAD, 3)) as [number, number, number];
    findings.push({ kind: 'tight', severity: 'warn', bodies: [near.a, near.b], gap: round(near.distance, 3), minimum, ...(together ? { inPlace: true as const } : {}), places: [], box: { min, max } });
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { status: statusOf(findings), findings };
}
/** A free joint's angle within one turn (-180° to 180°): a run of a whole turn stops at -300°, which is 60°. */
export const withinTurn = (deg: number) => Math.round((deg - 360 * Math.round(deg / 360)) * 10) / 10;
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
    findings.push({ kind: 'blocked', severity: 'warn', joint: stop.joint, bodies: [bodyOf(stop.a), bodyOf(stop.b)], at: round(stop.stoppedAt, 1), limit: round(stop.to, 1), unit: stop.unit, ...(stop.free ? { free: true as const } : {}), places: [], box: { min, max } });
  }
  for (const joint of measured.joints) {
    for (const value of joint.values) {
      if (Math.abs(value.value) > 1e-3) findings.push({ kind: 'posed', severity: 'warn', joint: joint.name, value: round(value.value, 1), unit: value.unit });
    }
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { status: statusOf(findings), findings };
}

/** The design hints, in the order the note names them. */
export const DESIGN_HINTS: readonly DesignHint[] = ['sharpEdge', 'edgeRadii', 'rootCorner', 'shallowSlope', 'shellCorner'];

/** Within 10° two faces run on smoothly: a fillet into its faces, the facets of one curved face. */
const SMOOTH = Math.cos((10 * Math.PI) / 180);
/** Turning more than 60° two faces make a sharp edge: a box's 90°, not the two 45° turns of a chamfer. */
const SHARP = Math.cos((60 * Math.PI) / 180);
/** Turning outwards between 15° and 55° two faces make a bevel: either side of a chamfer, however it was built. */
const BEVEL = [Math.cos((15 * Math.PI) / 180), Math.cos((55 * Math.PI) / 180)] as const;

/** Where two faces of one body meet, from the mesh: mm of it in all, turning sharp out or in, turning in at all, running on smoothly. */
interface FaceEdge {
  a: number;
  b: number;
  length: number;
  sharpOut: number;
  sharpIn: number;
  inward: number;
  smooth: number;
  /** mm turning outwards as a chamfer does (`BEVEL`). */
  bevel: number;
  /** A sharp stretch lies on the bed as the body lies. */
  bed: boolean;
  /** The sharp stretches, xyz xyz each. */
  segments: number[];
  /** A facet of each face at a smooth stretch (-1: none), to measure from. */
  smoothAt: [number, number];
}

/**
 * Every pair of faces that meet, by the facets on either side of each mesh edge between them (render vertices are split
 * per face, so corners are matched by position). The halves of one cylinder are one face. Linear in the triangles.
 */
function faceEdges(model: ViewerModel, laid?: LaidBody): Map<number, FaceEdge> {
  const index = model.geometry.index?.array ?? [];
  const positions = model.geometry.getAttribute('position').array;
  const faces = model.table.faces;
  const weld = new Uint32Array(positions.length / 3);
  const ids = new Map<string, number>();
  for (let v = 0; v < weld.length; v += 1) {
    const key = `${String(positions[v * 3])},${String(positions[v * 3 + 1])},${String(positions[v * 3 + 2])}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    weld[v] = id;
  }
  const corners = ids.size;
  const open = new Map<number, number>();
  const pairs = new Map<number, FaceEdge>();
  const onBed = (v: number) => !!laid && (laid.positions[v * 3 + 2] ?? Infinity) <= laid.bed + BED_TOUCH;
  for (let t = 0; t < index.length / 3; t += 1) {
    const face = model.triangleFaces[t] ?? 0;
    for (let k = 0; k < 3; k += 1) {
      const p = index[t * 3 + k] ?? 0;
      const q = index[t * 3 + ((k + 1) % 3)] ?? 0;
      const [i, j] = [weld[p] ?? 0, weld[q] ?? 0];
      if (i === j) continue;
      const key = i < j ? i * corners + j : j * corners + i;
      const first = open.get(key);
      if (first === undefined) {
        open.set(key, t);
        continue;
      }
      open.delete(key);
      const other = model.triangleFaces[first] ?? 0;
      const [fa, fb] = [faces[other], faces[face]];
      if (other === face || !fa || !fb || sameCylinder(fa, fb)) continue;
      const n1 = triangle(positions, index, first).normal;
      const n2 = triangle(positions, index, t).normal;
      if (!n1 || !n2) continue;
      // The corner of this facet off the edge, against the other facet's plane: in front of it, the faces make an inner corner.
      const r = (index[t * 3 + ((k + 2) % 3)] ?? 0) * 3;
      const side = ((positions[r] ?? 0) - (positions[p * 3] ?? 0)) * n1.x + ((positions[r + 1] ?? 0) - (positions[p * 3 + 1] ?? 0)) * n1.y + ((positions[r + 2] ?? 0) - (positions[p * 3 + 2] ?? 0)) * n1.z;
      const ends = [positions[p * 3] ?? 0, positions[p * 3 + 1] ?? 0, positions[p * 3 + 2] ?? 0, positions[q * 3] ?? 0, positions[q * 3 + 1] ?? 0, positions[q * 3 + 2] ?? 0];
      const length = Math.hypot((ends[3] ?? 0) - (ends[0] ?? 0), (ends[4] ?? 0) - (ends[1] ?? 0), (ends[5] ?? 0) - (ends[2] ?? 0));
      const [a, b] = other < face ? [other, face] : [face, other];
      const id = a * faces.length + b;
      let pair = pairs.get(id);
      if (!pair) {
        pair = { a, b, length: 0, sharpOut: 0, sharpIn: 0, inward: 0, smooth: 0, bevel: 0, bed: false, segments: [], smoothAt: [-1, -1] };
        pairs.set(id, pair);
      }
      pair.length += length;
      const cos = n1.dot(n2);
      if (cos > SMOOTH) {
        pair.smooth += length;
        pair.smoothAt = other < face ? [first, t] : [t, first];
      } else if (side > EPSILON) pair.inward += length;
      else if (cos < BEVEL[0] && cos > BEVEL[1]) pair.bevel += length;
      if (cos >= SHARP) continue;
      if (side > EPSILON) pair.sharpIn += length;
      else pair.sharpOut += length;
      pair.segments.push(...ends);
      if (onBed(p) && onBed(q) && laid && [first, t].some((s) => (triangle(laid.positions, index, s).normal?.z ?? 0) < -0.99)) pair.bed = true;
    }
  }
  return pairs;
}

/** Per face, whether it is a cylinder the material lies outside of (a hole, `hollowAt`), by one facet of it. */
function hollowFaces(model: ViewerModel): Uint8Array {
  const index = model.geometry.index?.array ?? [];
  const positions = model.geometry.getAttribute('position').array;
  const hollow = new Uint8Array(model.table.faces.length);
  const seen = new Uint8Array(model.table.faces.length);
  for (let t = 0; t < index.length / 3; t += 1) {
    const face = model.triangleFaces[t] ?? 0;
    if (seen[face] || !model.table.faces[face]?.cylinder) continue;
    const { normal, centroid } = triangle(positions, index, t);
    if (!normal) continue;
    seen[face] = 1;
    if (hollowAt(model, t, normal, centroid)) hollow[face] = 1;
  }
  return hollow;
}

/**
 * The radius the design rules ask on outer edges that are seen or touched (printProfiles.ts, "Edges"): 1 mm on parts under
 * 30 mm, 2 mm up to 100 mm, 3 mm above.
 */
export function edgeRadius(size: number): number {
  return size < 30 ? 1 : size <= 100 ? 2 : 3;
}

/** Bodies smaller than this are details (a pin, a key): no edge hint (mm, the longest side). */
const SMALLEST_PART = 10;
/** A sharp edge shorter than this is a detail (a step, a letter); a body with less sharp edge than LEAST_SHARP in all is left alone (mm). */
const SHORTEST_EDGE = 2;
const LEAST_SHARP = 10;

/**
 * The longest side of a body, the same however it is turned: its extent along its longest sharp edge, across it on the
 * plane of one of its faces, and along that face's normal.
 */
function sizeAlong(model: ViewerModel, pairs: readonly FaceEdge[]): number {
  const longest = pairs.reduce<FaceEdge | undefined>((best, pair) => (!best || pair.length > best.length ? pair : best), undefined);
  const normal = longest ? model.table.faces[longest.a]?.planeNormal : undefined;
  const s = longest?.segments ?? [];
  if (!normal || s.length < 6) return Math.max(...extentOf(model.geometry.getAttribute('position').array));
  const along = new Vector3((s[3] ?? 0) - (s[0] ?? 0), (s[4] ?? 0) - (s[1] ?? 0), (s[5] ?? 0) - (s[2] ?? 0)).normalize();
  const up = new Vector3(...normal).normalize();
  const axes = [along, new Vector3().crossVectors(up, along).normalize(), up];
  const positions = model.geometry.getAttribute('position').array;
  const point = new Vector3();
  return Math.max(
    ...axes.map((axis) => {
      let [low, high] = [Infinity, -Infinity];
      for (let i = 0; i < positions.length; i += 3) {
        const d = point.set(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0).dot(axis);
        low = Math.min(low, d);
        high = Math.max(high, d);
      }
      return high - low;
    }),
  );
}

/** One body as the design hints read it. */
interface DesignBody {
  body: PrintCheckBody;
  laid: LaidBody | undefined;
  pairs: FaceEdge[];
  hollow: Uint8Array;
}

/**
 * `sharpEdge`: a body of SolidCraft's with no fillet and no chamfer at all (no `blend(` face), no fillet-like round of an
 * import either (a convex cylinder running on smoothly from a flat face) and no chamfer made otherwise (two faces turning
 * 15° to 55° outwards all along their edge, as a cone joined on the knob block's top), whose edges between two flat faces turn more than
 * 60° outwards: the rules round those by its size (research O14, H9: the block look). Edges on the bed (chamfered there,
 * BC-27) are left out, and so are edges under 2 mm (a letter, a step), round edges (a hole's rim, a knuckle's end: the
 * entry chamfer of the details rule, or a mechanism's) and bodies under 10 mm.
 * shortcut: a body that has one fillet or chamfer anywhere is taken as treated, so outer edges left sharp beside a rounded
 * corner (a plate rounded at its corners, sharp along the top) are not told: PartBuddy's own sign, slide stop and housing do
 * so on purpose, and the mesh cannot tell an edge that is seen or touched from one that is not. Tell them if a rule names it.
 */
function sharpEdges(bodies: readonly DesignBody[]): PrintFinding | null {
  let [edges, length, size] = [0, 0, 0];
  const tallies = bodies.map(({ body, pairs, hollow }) => {
    const faces = body.model.table.faces;
    const tally = new FaceTally(faces.length);
    if (faces.some((face) => face.name.includes('blend('))) return tally;
    const curvedOut = (face: number) => !!faces[face]?.cylinder && !hollow[face];
    if (pairs.some((pair) => pair.smooth >= 1 && ((!!faces[pair.a]?.planeNormal && curvedOut(pair.b)) || (!!faces[pair.b]?.planeNormal && curvedOut(pair.a))))) return tally;
    // A chamfer made otherwise (the knob block's top is a cone joined on): an edge turning out as a chamfer's do, all along.
    if (pairs.some((pair) => pair.bevel >= SHORTEST_EDGE && pair.bevel >= 0.9 * pair.length)) return tally;
    const flat = (face: number) => !!faces[face]?.planeNormal;
    const found = pairs.filter((pair) => flat(pair.a) && flat(pair.b) && !pair.bed && pair.sharpOut >= SHORTEST_EDGE && pair.sharpOut >= 0.9 * pair.length);
    const mm = found.reduce((sum, pair) => sum + pair.sharpOut, 0);
    const longest = sizeAlong(body.model, found);
    if (mm < LEAST_SHARP || longest < SMALLEST_PART) return tally;
    for (const pair of found) for (const face of [pair.a, pair.b]) tally.add(face, pair.sharpOut, 0, pair.segments);
    edges += found.length;
    length += mm;
    size = Math.max(size, longest);
    return tally;
  });
  if (edges === 0) return null;
  const found = locate(bodies.map(({ body }) => body), tallies, 0);
  return { kind: 'sharpEdge', severity: 'warn', edges, length: round(length, 0), size: round(size, 0), radius: edgeRadius(size), places: found.places, box: found.box };
}

/** The design rules: at most two or three radii per part, so they match (printProfiles.ts, "Edges"). */
export const MOST_RADII = 3;
/** Radii less than a quarter apart read as one (5 and 6 mm; own choice): the eye does not tell them apart on a part. */
const RADIUS_FAMILY = 1.25;

/**
 * `edgeRadii` (research O1, H6): the fillets on a body's outer edges (SolidCraft's `blend(` cylinders the material lies
 * inside of) in more than three families of radii. Inner fillets (a root, a pocket's corner) are left out, as are holes,
 * threads and rounds that are no fillet (a knuckle, a boss).
 * shortcut: only fillets along straight edges are cylinders; a fillet's corner patch (a sphere or torus) and a fillet along a
 * curve carry no radius in `model.faces` and are not counted. Read their radius from SolidCraft if a part rounds only so.
 */
function edgeRadii(bodies: readonly DesignBody[]): PrintFinding | null {
  let worst: number[] = [];
  let families = 0;
  const tallies = bodies.map(({ body, hollow }) => {
    const faces = body.model.table.faces;
    const tally = new FaceTally(faces.length);
    const fillets = faces.filter((face) => face.cylinder && face.name.includes('blend(') && !hollow[face.index]);
    const radii = [...new Set(fillets.map((face) => round(face.cylinder?.radius ?? 0)))].sort((a, b) => a - b);
    let count = 0;
    let start = -Infinity;
    for (const radius of radii) {
      if (radius > start * RADIUS_FAMILY + EPSILON) [count, start] = [count + 1, radius];
    }
    if (count <= MOST_RADII) return tally;
    for (const face of fillets) tally.add(face.index, Math.max(face.area, EPSILON), face.cylinder?.radius ?? 0, face.centroid);
    if (count > families) [families, worst] = [count, radii];
    return tally;
  });
  if (families === 0) return null;
  const found = locate(bodies.map(({ body }) => body), tallies, 0);
  return { kind: 'edgeRadii', severity: 'warn', radii: worst.slice(0, 12), families, most: MOST_RADII, places: found.places, box: found.box };
}

/** An arm from three times its thickness long bends at its root (research H1, H2: own choice); shorter, a stub, not an arm. */
const SLENDER = 3;
/** An arm stands on its foot along this share of its width, and is this many times as long as wide (own choice). */
const ARM_ROOTED = 0.8;
const ARM_LONG = 1.5;
/** Arms shorter than this are details (a letter, a rib's end), mm. */
const SHORTEST_ARM = 3;
/** Concave stretches shorter than this along an arm's other edges are mesh noise, mm. */
const NO_CORNER = 0.05;

/** The root fillet the design rules ask for an arm `thickness` thick: half of it, and at least 1 mm and two nozzles (printProfiles.ts, "Edges"). */
export function rootRadius(thickness: number, nozzle: number): number {
  return round(Math.max(thickness / 2, 1, 2 * nozzle), 2);
}

/**
 * `rootCorner` (research F2, F6, F7, H1): a flat side of a slender arm (a snap arm, a hook, a thin post) whose only inner
 * corner is a sharp one at its foot, where it stands on another flat face; every other edge of it turns outwards, so the
 * arm stands free and bends at that corner, where a sharp corner concentrates the stress (a root of half the thickness
 * takes the notch factor from about 3 to 1.5: D19). An arm is `SLENDER` times as long as it is thick (measured into the
 * material from its side), rooted along its whole width and half as long again as wide, so a box wall (joined to its
 * neighbours), a fin or a rib (longer than high), a stout post and a hinge leaf on its knuckles are no arm. The finding names the thinnest arm and the radius the rules ask.
 * shortcut: flat sides only: a round pin or boss on a face, and an arm whose root is a slope (the latch's 45° foot), are
 * not looked at; what loads the arm is not known, so a thin post that carries nothing is told as well.
 */
function rootCorners(bodies: readonly DesignBody[], nozzle: number): PrintFinding | null {
  let [roots, thickness, length] = [0, Infinity, 0];
  const tallies = bodies.map(({ body, pairs, hollow }) => {
    const { model } = body;
    const faces = model.table.faces;
    const tally = new FaceTally(faces.length);
    const bvh = model.geometry.boundsTree as unknown as MeshBVH | undefined;
    const index = model.geometry.index?.array;
    const positions = model.geometry.getAttribute('position').array;
    if (!bvh || !index) return tally;
    const flat = (face: number) => !!faces[face]?.planeNormal;
    const byFace = new Map<number, FaceEdge[]>();
    for (const pair of pairs) {
      for (const face of [pair.a, pair.b]) {
        const list = byFace.get(face) ?? [];
        list.push(pair);
        byFace.set(face, list);
      }
    }
    // Per flat face, its one sharp inner corner with another flat face, if every other edge of it turns outwards: a smooth
    // one only into a fillet the material lies inside of (a rounded tip), never into an inner round (a shell's corner).
    const rounded = (pair: FaceEdge, face: number) => {
      const other = pair.a === face ? pair.b : pair.a;
      return pair.smooth > NO_CORNER && !(faces[other]?.cylinder && !hollow[other]);
    };
    const candidates = new Map<number, FaceEdge>();
    for (const [face, list] of byFace) {
      if (!flat(face)) continue;
      const inner = list.filter((pair) => pair.inward > NO_CORNER || rounded(pair, face));
      const root = inner[0];
      if (inner.length !== 1 || !root || !flat(root.a) || !flat(root.b) || root.sharpIn < 1 || root.sharpIn < 0.9 * root.length) continue;
      candidates.set(face, root);
    }
    if (candidates.size === 0) return tally;
    const corners = new Map<number, number[]>();
    for (let t = 0; t < index.length / 3; t += 1) {
      const face = model.triangleFaces[t] ?? 0;
      if (!candidates.has(face)) continue;
      const own = corners.get(face) ?? [];
      for (let k = 0; k < 3; k += 1) {
        const p = (index[t * 3 + k] ?? 0) * 3;
        own.push(positions[p] ?? 0, positions[p + 1] ?? 0, positions[p + 2] ?? 0);
      }
      corners.set(face, own);
    }
    const ray = new Ray();
    for (const [face, root] of candidates) {
      const own = corners.get(face) ?? [];
      const normal = faces[face]?.planeNormal;
      const s = root.segments;
      if (!normal || own.length < 9 || s.length < 6) continue;
      // The foot as a straight line: the point of it farthest from any one, and the point farthest from that.
      const farthest = (start: Vector3) => {
        let best = start;
        for (let k = 0; k < s.length; k += 3) {
          const point = new Vector3(s[k], s[k + 1], s[k + 2]);
          if (point.distanceToSquared(start) > best.distanceToSquared(start)) best = point;
        }
        return best;
      };
      const from = farthest(new Vector3(s[0], s[1], s[2]));
      const to = farthest(from);
      const wide = from.distanceTo(to);
      if (wide < EPSILON) continue;
      const along = to.clone().sub(from).divideScalar(wide);
      const middle = from.clone().add(to).multiplyScalar(0.5);
      let long = 0;
      let [low, high] = [Infinity, -Infinity];
      const centre = new Vector3();
      const off = new Vector3();
      for (let k = 0; k < own.length; k += 3) {
        off.set((own[k] ?? 0) - from.x, (own[k + 1] ?? 0) - from.y, (own[k + 2] ?? 0) - from.z);
        [low, high] = [Math.min(low, off.dot(along)), Math.max(high, off.dot(along))];
        long = Math.max(long, off.addScaledVector(along, -off.dot(along)).length());
        centre.add(new Vector3(own[k], own[k + 1], own[k + 2]));
      }
      // Rooted along its whole width, and half as long again as wide: a hinge leaf on its knuckles or a tab is no arm.
      const across = high - low;
      if (long < SHORTEST_ARM || wide < ARM_ROOTED * across || long < ARM_LONG * across) continue;
      // Into the material from the side, a little above the foot: the arm's thickness.
      centre.divideScalar(own.length / 3).sub(middle);
      const up = centre.addScaledVector(along, -centre.dot(along)).normalize();
      const out = new Vector3(...normal).normalize();
      ray.origin.copy(middle).addScaledVector(up, Math.min(long / 4, 1)).addScaledVector(out, -EPSILON);
      ray.direction.copy(out).negate();
      const hit = bvh.raycastFirst(ray, DoubleSide, 0, long);
      if (!hit?.face || hit.face.normal.dot(out) > -0.9) continue;
      const thick = hit.distance + EPSILON;
      if (long < SLENDER * thick) continue;
      roots += 1;
      if (thick < thickness) [thickness, length] = [thick, long];
      tally.add(face, root.sharpIn, thick, s);
      tally.add(root.a === face ? root.b : root.a, root.sharpIn, thick, s);
    }
    return tally;
  });
  if (roots === 0) return null;
  const found = locate(bodies.map(({ body }) => body), tallies, 0);
  return { kind: 'rootCorner', severity: 'warn', roots, thickness: round(thickness), length: round(length, 1), radius: rootRadius(thickness, nozzle), places: found.places, box: found.box };
}

/** Up to this angle from flat a face shows its layers as wide steps (research O4, D5): 0.75 mm and more at 0.2 mm layers. */
export const SHALLOW_SLOPE = 15;
/** A sloped face smaller than this is a detail (a chamfer's end, a letter), mm². */
const SHALLOW_AREA = 50;

/**
 * `shallowSlope` (research O4, H4): a flat face that faces up as the part lies and leans less than `SHALLOW_SLOPE` from flat,
 * rising at least one layer across: the layers show on it as steps `layer / tan(angle)` wide, more than on any other face.
 * Faces under 50 mm² are left out. The finding names the shallowest and its steps.
 * shortcut: flat faces only: the flat top of a dome or a large fillet shows the same steps and is not told. Which face is
 * seen is not known: a slope on the inside of a box is told as well.
 */
function shallowSlopes(bodies: readonly DesignBody[], layer: number): PrintFinding | null {
  const step = layerOf(layer);
  let [count, area, angle] = [0, 0, Infinity];
  const lean = Math.cos((SHALLOW_SLOPE * Math.PI) / 180);
  const tallies = bodies.map(({ body, laid }) => {
    const { model } = body;
    const faces = model.table.faces;
    const tally = new FaceTally(faces.length);
    const index = model.geometry.index?.array;
    if (!laid || !index) return tally;
    const design = model.geometry.getAttribute('position').array;
    // Per flat face as it lies: its area, its normal by the area of its facets (a sliver's own normal is off), and how high it reaches.
    const normal = new Float64Array(faces.length * 3);
    const low = new Float64Array(faces.length).fill(Infinity);
    const high = new Float64Array(faces.length).fill(-Infinity);
    const sum = new Float64Array(faces.length);
    for (let t = 0; t < index.length / 3; t += 1) {
      const face = model.triangleFaces[t] ?? 0;
      if (!faces[face]?.planeNormal) continue;
      const lying = triangle(laid.positions, index, t);
      if (!lying.normal) continue;
      sum[face] = (sum[face] ?? 0) + lying.area;
      for (const [k, value] of [lying.normal.x, lying.normal.y, lying.normal.z].entries()) normal[face * 3 + k] = (normal[face * 3 + k] ?? 0) + value * lying.area;
      for (let k = 2; k < 9; k += 3) {
        low[face] = Math.min(low[face] ?? Infinity, lying.corners[k] ?? Infinity);
        high[face] = Math.max(high[face] ?? -Infinity, lying.corners[k] ?? -Infinity);
      }
    }
    const shallow = new Uint8Array(faces.length);
    faces.forEach((_, face) => {
      const z = (normal[face * 3 + 2] ?? 0) / (Math.hypot(normal[face * 3] ?? 0, normal[face * 3 + 1] ?? 0, normal[face * 3 + 2] ?? 0) || 1);
      if (z < lean || (sum[face] ?? 0) < SHALLOW_AREA || (high[face] ?? 0) - (low[face] ?? 0) < step - EPSILON) return;
      shallow[face] = 1;
      count += 1;
      area += sum[face] ?? 0;
      angle = Math.min(angle, (Math.acos(Math.min(1, z)) * 180) / Math.PI);
    });
    for (let t = 0; t < index.length / 3; t += 1) {
      const face = model.triangleFaces[t] ?? 0;
      if (!shallow[face]) continue;
      const { corners, area: own } = triangle(design, index, t);
      tally.add(face, own, 0, corners);
    }
    return tally;
  });
  if (count === 0) return null;
  const found = locate(bodies.map(({ body }) => body), tallies, 0);
  return { kind: 'shallowSlope', severity: 'warn', faces: count, area: round(area, 0), angle: round(angle, 1), step: round(step / Math.tan((angle * Math.PI) / 180), 1), limit: SHALLOW_SLOPE, places: found.places, box: found.box };
}

/** A wall up to this thick is a shell's wall (mm, own choice): thicker, a rounded edge cuts into solid material. */
const SHELL_WALL = 5;
/** A shell's wall round a rounded corner may thin to half the wall (research O1, H7: D18 asks the inside at least half the wall). */
const CORNER_SHARE = 0.5;

/**
 * `shellCorner` (research O1, H7): a shell's outer edge rounded (a convex fillet between two of its walls) while its inside
 * stays sharp or rounds otherwise, so the wall thins in the corner under half of what it is beside it. Concentric, the
 * inside rounds to the outer radius less the wall (fillet before shelling, D19) and the wall stays even. The wall beside the
 * fillet: from the walls it runs into, straight in, at most 5 mm (else no shell); in the corner: from every facet of the
 * fillet towards its axis. The finding names the thinnest corner, the wall beside it and the radius the inside wants.
 * shortcut: fillets along straight edges only (cylinders); a corner patch where three fillets meet is not looked at.
 */
function shellCorners(bodies: readonly DesignBody[]): PrintFinding | null {
  let [corners, thinnest, wall, radius] = [0, Infinity, 0, 0];
  const tallies = bodies.map(({ body, pairs, hollow }) => {
    const { model } = body;
    const faces = model.table.faces;
    const tally = new FaceTally(faces.length);
    const bvh = model.geometry.boundsTree as unknown as MeshBVH | undefined;
    const index = model.geometry.index?.array;
    const positions = model.geometry.getAttribute('position').array;
    if (!bvh || !index) return tally;
    const ray = new Ray();
    /** How thick the material is straight in from a facet, up to `most`; null where the far side does not face back. */
    const depth = (t: number, most: number, back: boolean) => {
      const { normal, centroid } = triangle(positions, index, t);
      if (!normal) return null;
      ray.origin.copy(centroid).addScaledVector(normal, -EPSILON);
      ray.direction.copy(normal).negate();
      const hit = bvh.raycastFirst(ray, DoubleSide, 0, most);
      if (!hit?.face || (back && hit.face.normal.dot(normal) > -0.9)) return null;
      return hit.distance + EPSILON;
    };
    // Per convex fillet: the wall of the flat faces it runs into smoothly, measured from the facet beside it.
    const beside = new Map<number, number>();
    for (const pair of pairs) {
      if (pair.smooth < 1) continue;
      for (const [fillet, flat, at] of [[pair.a, pair.b, pair.smoothAt[1]], [pair.b, pair.a, pair.smoothAt[0]]] as const) {
        const face = faces[fillet];
        if (!face?.cylinder || !face.name.includes('blend(') || hollow[fillet] || !faces[flat]?.planeNormal || at < 0) continue;
        const thick = depth(at, SHELL_WALL, true);
        if (thick !== null) beside.set(fillet, Math.min(beside.get(fillet) ?? Infinity, thick));
      }
    }
    if (beside.size === 0) return tally;
    const least = new Map<number, number>();
    for (let t = 0; t < index.length / 3; t += 1) {
      const face = model.triangleFaces[t] ?? 0;
      const nominal = beside.get(face);
      if (nominal === undefined) continue;
      const thick = depth(t, nominal, false) ?? nominal;
      least.set(face, Math.min(least.get(face) ?? Infinity, thick));
    }
    for (const [face, thick] of least) {
      const nominal = beside.get(face) ?? 0;
      if (thick >= CORNER_SHARE * nominal) continue;
      corners += 1;
      tally.add(face, Math.max(faces[face]?.area ?? 0, EPSILON), thick, faces[face]?.centroid ?? []);
      if (thick < thinnest) [thinnest, wall, radius] = [thick, nominal, faces[face]?.cylinder?.radius ?? 0];
    }
    return tally;
  });
  if (corners === 0) return null;
  const found = locate(bodies.map(({ body }) => body), tallies, 0);
  return { kind: 'shellCorner', severity: 'warn', corners, thickness: round(thinnest), wall: round(wall), radius: round(radius), inner: round(Math.max(0, radius - wall)), places: found.places, box: found.box };
}

/**
 * Adds the design hints (Manuel, 2026-11-14) to the check: how the part looks and holds, not whether it prints, so yellow
 * only and each turned off on its own (in the print settings, or with the design rule it belongs to). Each body lies as the
 * check lays it; open bodies are left out as there. Linear in the triangles.
 */
export function withDesign(check: PrintCheck, bodies: readonly PrintCheckBody[], profile: PrintCheckProfile): PrintCheck {
  const off = profile.off ?? [];
  const parts = bodies.filter((body) => body.model.table.faces.length > 0 && !(body.model.openEdges > 0));
  if (DESIGN_HINTS.every((hint) => off.includes(hint)) || parts.length === 0) return check;
  const laid = laidBodies(parts);
  const read: DesignBody[] = parts.map((body, b) => ({
    body,
    laid: laid[b],
    pairs: [...faceEdges(body.model, laid[b]).values()],
    hollow: hollowFaces(body.model),
  }));
  const hints: Record<DesignHint, () => PrintFinding | null> = {
    sharpEdge: () => sharpEdges(read),
    edgeRadii: () => edgeRadii(read),
    rootCorner: () => rootCorners(read, profile.nozzle),
    shallowSlope: () => shallowSlopes(read, profile.layer),
    shellCorner: () => shellCorners(read),
  };
  const found = DESIGN_HINTS.map((hint) => (off.includes(hint) ? null : hints[hint]()));
  const findings = [...check.findings, ...found.filter((finding): finding is PrintFinding => finding !== null)];
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { status: statusOf(findings), findings };
}
