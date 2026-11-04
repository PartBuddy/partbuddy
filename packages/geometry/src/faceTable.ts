/** One entry of SolidCraft's `model.faces` result, as stored next to the fixture. */
export interface FaceInfo {
  index: number;
  name: string;
  exact: boolean;
  area: number;
  centroid: [number, number, number];
  /** A point on the face that SolidCraft resolves to this face. */
  point: [number, number, number];
  planeNormal?: [number, number, number] | undefined;
  cylinder?:
    | {
        origin: [number, number, number];
        axis: [number, number, number];
        radius: number;
      }
    | undefined;
}

export interface FaceTable {
  model: string;
  body: string;
  units: 'mm';
  faces: FaceInfo[];
}

export type SurfaceKind = 'plane' | 'cylinder' | 'other';

export function surfaceKind(face: FaceInfo): SurfaceKind {
  if (face.planeNormal) return 'plane';
  if (face.cylinder) return 'cylinder';
  return 'other';
}

/** Feature prefix of a SolidCraft face name, e.g. "F5" in "F5:side#1". */
export function featureOf(face: FaceInfo): string {
  return face.name.split(':', 1)[0] ?? face.name;
}

/** True when two faces lie on the same cylinder (SolidCraft splits cylinders into pieces). */
export function sameCylinder(a: FaceInfo, b: FaceInfo, tolerance = 1e-3): boolean {
  if (!a.cylinder || !b.cylinder) return false;
  const close = (x: number, y: number) => Math.abs(x - y) <= tolerance;
  const parallel = Math.abs(
    a.cylinder.axis[0] * b.cylinder.axis[0] +
      a.cylinder.axis[1] * b.cylinder.axis[1] +
      a.cylinder.axis[2] * b.cylinder.axis[2],
  );
  if (!close(parallel, 1) || !close(a.cylinder.radius, b.cylinder.radius)) return false;
  const d = a.cylinder.origin.map((value, i) => value - (b.cylinder?.origin[i] ?? 0));
  const along = d[0]! * a.cylinder.axis[0] + d[1]! * a.cylinder.axis[1] + d[2]! * a.cylinder.axis[2];
  const off = Math.hypot(
    d[0]! - along * a.cylinder.axis[0],
    d[1]! - along * a.cylinder.axis[1],
    d[2]! - along * a.cylinder.axis[2],
  );
  return off <= tolerance;
}

type Vec3 = [number, number, number];

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function fail(index: number, what: string): never {
  throw new Error(`model.faces entry ${index}: ${what}`);
}

/**
 * Converts the result of SolidCraft's `model.faces` command (snake_case, as the control channel
 * returns it) into a face table. Throws on any entry that does not match the documented shape, so
 * a changed SolidCraft contract fails loudly instead of mislabelling faces (ADR 0004).
 */
export function faceTableFromModelFaces(result: unknown, body: string, model: string): FaceTable {
  const raw = (result as { faces?: unknown } | null)?.faces;
  if (!Array.isArray(raw)) throw new Error('model.faces returned no face list');
  const faces = raw.map((entry: unknown, i): FaceInfo => {
    if (typeof entry !== 'object' || entry === null) fail(i, 'not an object');
    const e = entry as Record<string, unknown>;
    if (e.index !== i) fail(i, `index ${String(e.index)} out of order`);
    if (typeof e.name !== 'string' || e.name === '') fail(i, 'name missing');
    if (typeof e.exact !== 'boolean') fail(i, 'exact flag missing');
    if (typeof e.area !== 'number' || !Number.isFinite(e.area)) fail(i, 'area missing');
    if (!isVec3(e.centroid) || !isVec3(e.point)) fail(i, 'centroid or point missing');
    const face: FaceInfo = { index: i, name: e.name, exact: e.exact, area: e.area, centroid: e.centroid, point: e.point };
    if (e.plane_normal !== undefined && e.plane_normal !== null) {
      if (!isVec3(e.plane_normal)) fail(i, 'plane_normal malformed');
      face.planeNormal = e.plane_normal;
    }
    if (e.cylinder !== undefined && e.cylinder !== null) {
      const c = e.cylinder as Record<string, unknown>;
      if (!isVec3(c.origin) || !isVec3(c.axis) || typeof c.radius !== 'number') fail(i, 'cylinder malformed');
      face.cylinder = { origin: c.origin, axis: c.axis, radius: c.radius };
    }
    return face;
  });
  return { model, body, units: 'mm', faces };
}
