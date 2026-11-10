import { surfaceKind, type FaceInfo, type FaceTable, type SurfaceKind } from './faceTable';

/**
 * Note anchors (ADR 0006, ADR 0020): where a note sits on the model, kept by SolidCraft's
 * persistent face names, with the face's shape as a fallback when a rebuild renamed or split it.
 * Pure arithmetic over face tables; the anchor as set is stored in the design file, the resolved
 * place is worked out again after every revision and never written back.
 */

export type Vec3 = [number, number, number];

/** The shape of a face when the note was set, to find it again after a rename. */
export interface FaceSignature {
  surface: SurfaceKind;
  area: number;
  centroid: Vec3;
  normal?: Vec3 | undefined;
  axis?: Vec3 | undefined;
  radius?: number | undefined;
}

/**
 * Face-local position: the offset from the face's centroid (planes and other faces), or for a
 * cylinder the height above the centroid along the axis and the radial direction.
 */
export type LocalPosition =
  | { frame: 'offset'; offset: Vec3 }
  | { frame: 'cylinder'; height: number; radial: Vec3 };

export type NoteAnchor =
  | { kind: 'face'; body: string; face: string; exact: boolean; local: LocalPosition; signature: FaceSignature; world: Vec3; normal: Vec3 }
  | { kind: 'edge'; body: string; faces: [string, string]; centroids: [Vec3, Vec3]; world: Vec3 }
  | { kind: 'point'; body: string; world: Vec3 };

/** attached: found by name; moved: found by lineage or shape; ambiguous: several faces fit; orphaned: lost. */
export type AnchorStatus = 'attached' | 'moved' | 'ambiguous' | 'orphaned';

export interface ResolvedAnchor {
  status: AnchorStatus;
  /** Where the note sits now (the last known place when orphaned). */
  world: Vec3;
  normal?: Vec3 | undefined;
  /** The face or edge name the note sits on now, when it differs from the stored one or is found. */
  target?: string | undefined;
}

/** Signature score needed to accept a face found by shape, and its lead over the next best (ADR 0006). */
export const ACCEPT_SCORE = 0.75;
export const ACCEPT_MARGIN = 0.15;
const MAX_ANGLE_DEG = 5;
const RADIUS_TOLERANCE = 0.05;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : scale(a, 1 / l);
};
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const roundVec = (a: Vec3): Vec3 => [round(a[0]), round(a[1]), round(a[2])];

/** Name of a face without SolidCraft's split suffixes (`#1`, `#[F6:+x]#2`): the lineage key. */
export function lineageOf(name: string): string {
  const at = name.indexOf('#');
  return at < 0 ? name : name.slice(0, at);
}

export function signatureOf(face: FaceInfo): FaceSignature {
  const signature: FaceSignature = { surface: surfaceKind(face), area: round(face.area), centroid: roundVec(face.centroid) };
  if (face.planeNormal) signature.normal = roundVec(face.planeNormal);
  if (face.cylinder) {
    signature.axis = roundVec(face.cylinder.axis);
    signature.radius = round(face.cylinder.radius);
  }
  return signature;
}

function localOf(face: FaceInfo, point: Vec3): LocalPosition {
  if (face.cylinder) {
    const axis = normalize(face.cylinder.axis);
    const height = dot(sub(point, face.cylinder.origin), axis) - dot(sub(face.centroid, face.cylinder.origin), axis);
    const fromAxis = sub(sub(point, face.cylinder.origin), scale(axis, dot(sub(point, face.cylinder.origin), axis)));
    return { frame: 'cylinder', height: round(height), radial: roundVec(normalize(fromAxis)) };
  }
  return { frame: 'offset', offset: roundVec(sub(point, face.centroid)) };
}

/** Places a face-local position on a (possibly rebuilt) face. */
function placeOn(face: FaceInfo, local: LocalPosition): { world: Vec3; normal: Vec3 } {
  if (local.frame === 'cylinder' && face.cylinder) {
    const axis = normalize(face.cylinder.axis);
    const height = dot(sub(face.centroid, face.cylinder.origin), axis) + local.height;
    const radialInPlane = sub(local.radial, scale(axis, dot(local.radial, axis)));
    const radial = length(radialInPlane) > 1e-9 ? normalize(radialInPlane) : normalize(sub(face.point, face.cylinder.origin));
    const world = add(add(face.cylinder.origin, scale(axis, height)), scale(radial, face.cylinder.radius));
    return { world: roundVec(world), normal: roundVec(radial) };
  }
  const offset = local.frame === 'offset' ? local.offset : ([0, 0, 0] as Vec3);
  if (face.planeNormal) {
    const n = normalize(face.planeNormal);
    // Keep the point on the face's plane even when the face turned a little.
    const inPlane = sub(offset, scale(n, dot(offset, n)));
    return { world: roundVec(add(face.centroid, inPlane)), normal: roundVec(n) };
  }
  return { world: roundVec(add(face.centroid, offset)), normal: [0, 0, 1] };
}

/** The anchor for a note on a face, set at `point` (where the user clicked). */
export function faceAnchor(table: FaceTable, faceName: string, point: Vec3, normal: Vec3): NoteAnchor | null {
  const face = table.faces.find((candidate) => candidate.name === faceName);
  if (!face) return null;
  return {
    kind: 'face',
    body: table.body,
    face: face.name,
    exact: face.exact,
    local: localOf(face, point),
    signature: signatureOf(face),
    world: roundVec(point),
    normal: roundVec(normalize(normal)),
  };
}

/** The anchor for a note on an edge: the two faces that meet there (`A|B`, as SolidCraft names edges). */
export function edgeAnchor(table: FaceTable, edgeName: string, point: Vec3): NoteAnchor | null {
  // A face left by a fillet carries a `|` in its own name (`F2:blend:F1:+x|F1:+y`), so the edge's name is
  // cut at each `|` in turn until both halves are faces of the body.
  const face = (name: string) => table.faces.find((candidate) => candidate.name === name);
  let a: FaceInfo | undefined;
  let b: FaceInfo | undefined;
  for (let cut = edgeName.indexOf('|'); cut >= 0 && !(a && b); cut = edgeName.indexOf('|', cut + 1)) {
    a = face(edgeName.slice(0, cut));
    b = face(edgeName.slice(cut + 1));
  }
  if (!a || !b) return null;
  return { kind: 'edge', body: table.body, faces: [a.name, b.name], centroids: [roundVec(a.centroid), roundVec(b.centroid)], world: roundVec(point) };
}

export function pointAnchor(body: string, point: Vec3): NoteAnchor {
  return { kind: 'point', body, world: roundVec(point) };
}

const angleBetween = (a: Vec3, b: Vec3, either = false): number => {
  const cos = dot(normalize(a), normalize(b));
  return (Math.acos(Math.min(1, Math.max(-1, either ? Math.abs(cos) : cos))) * 180) / Math.PI;
};

/**
 * How well a face matches a signature, 0 … 1 (ADR 0006): the surface type and the normal or axis
 * (within 5°) gate the match; radius, area ratio and centroid distance score it.
 */
export function signatureScore(signature: FaceSignature, face: FaceInfo): number {
  const candidate = signatureOf(face);
  if (candidate.surface !== signature.surface) return 0;
  if (signature.normal && candidate.normal && angleBetween(signature.normal, candidate.normal) > MAX_ANGLE_DEG) return 0;
  if (signature.axis && candidate.axis && angleBetween(signature.axis, candidate.axis, true) > MAX_ANGLE_DEG) return 0;
  const parts: { weight: number; value: number }[] = [];
  parts.push({ weight: 0.3, value: 1 });
  if (signature.radius !== undefined && candidate.radius !== undefined) {
    const off = Math.abs(candidate.radius - signature.radius) / Math.max(signature.radius, 1e-9);
    if (off > RADIUS_TOLERANCE) return 0;
    parts.push({ weight: 0.2, value: 1 - off / RADIUS_TOLERANCE / 2 });
  }
  const areaRatio = Math.min(candidate.area, signature.area) / Math.max(candidate.area, signature.area, 1e-9);
  parts.push({ weight: 0.3, value: areaRatio });
  const reach = Math.max(10, Math.sqrt(Math.max(signature.area, 0)));
  const distance = length(sub(candidate.centroid, signature.centroid));
  parts.push({ weight: 0.4, value: Math.max(0, 1 - distance / reach) });
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.weight * part.value, 0) / total;
}

function nearestTo(faces: FaceInfo[], point: Vec3): FaceInfo | undefined {
  let best: FaceInfo | undefined;
  let bestDistance = Infinity;
  for (const face of faces) {
    const distance = length(sub(face.centroid, point));
    if (distance < bestDistance) {
      best = face;
      bestDistance = distance;
    }
  }
  return best;
}

function resolveFace(anchor: Extract<NoteAnchor, { kind: 'face' }>, table: FaceTable): ResolvedAnchor {
  const orphaned: ResolvedAnchor = { status: 'orphaned', world: anchor.world, normal: anchor.normal };
  const placed = (face: FaceInfo, status: AnchorStatus): ResolvedAnchor => ({ status, ...placeOn(face, anchor.local), target: face.name });
  // Geometry-only names and pattern instances can land on another face after a rebuild.
  const fragile = (face: FaceInfo) => !face.exact || face.name.includes('@');

  const named = table.faces.find((face) => face.name === anchor.face);
  if (named) {
    if (!fragile(named) || signatureScore(anchor.signature, named) >= ACCEPT_SCORE) return placed(named, 'attached');
    return placed(named, 'moved');
  }
  const lineage = lineageOf(anchor.face);
  const pieces = table.faces.filter((face) => lineageOf(face.name) === lineage);
  const piece = nearestTo(pieces, anchor.world);
  if (piece) return placed(piece, 'moved');

  const scored = table.faces
    .map((face) => ({ face, score: signatureScore(anchor.signature, face) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < ACCEPT_SCORE) return orphaned;
  if (second && best.score - second.score < ACCEPT_MARGIN) return placed(best.face, 'ambiguous');
  return placed(best.face, 'moved');
}

function resolveEdge(anchor: Extract<NoteAnchor, { kind: 'edge' }>, table: FaceTable): ResolvedAnchor {
  const found = anchor.faces.map((name, i) => {
    const exact = table.faces.find((face) => face.name === name);
    if (exact) return { face: exact, moved: false };
    const pieces = table.faces.filter((face) => lineageOf(face.name) === lineageOf(name));
    const piece = nearestTo(pieces, anchor.centroids[i] ?? anchor.world);
    return piece ? { face: piece, moved: true } : null;
  });
  const [a, b] = found;
  if (!a || !b) return { status: 'orphaned', world: anchor.world };
  // The edge moves with its two faces: the mean shift of their centroids.
  const shift = scale(add(sub(a.face.centroid, anchor.centroids[0]), sub(b.face.centroid, anchor.centroids[1])), 0.5);
  const target = [a.face.name, b.face.name].sort().join('|');
  return { status: a.moved || b.moved ? 'moved' : 'attached', world: roundVec(add(anchor.world, shift)), target };
}

/** Where an anchor sits in the newest revision; `tables` are the face tables of every body shown. */
export function resolveAnchor(anchor: NoteAnchor, tables: readonly FaceTable[]): ResolvedAnchor {
  const table = tables.find((candidate) => candidate.body === anchor.body);
  if (!table) return { status: 'orphaned', world: anchor.world, ...(anchor.kind === 'face' ? { normal: anchor.normal } : {}) };
  switch (anchor.kind) {
    case 'face':
      return resolveFace(anchor, table);
    case 'edge':
      return resolveEdge(anchor, table);
    case 'point':
      return { status: 'attached', world: anchor.world };
  }
}
