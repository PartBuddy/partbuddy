import { Matrix4, Quaternion, Vector3 } from 'three';

import { Overhang, overhangLimits, overhangOf } from './overhang';
import type { ViewerModel } from './viewerModel';

/**
 * Print orientation (M7, decided 2026-11-05): which direction of the design points down onto the
 * bed. The design itself never turns; the check, the overhang view and the exported mesh do.
 * `[0, 0, -1]` is the part as designed, standing on its lowest point along +Z.
 */
export type Down = readonly [number, number, number];
export const AS_DESIGNED: Down = [0, 0, -1];

/** The rotation that turns `down` onto -Z, the smallest one (no spin about the vertical). */
export function orientationQuaternion(down: Down = AS_DESIGNED): Quaternion {
  const from = new Vector3(...down).normalize();
  return new Quaternion().setFromUnitVectors(from, new Vector3(0, 0, -1));
}

export function orientationMatrix(down: Down = AS_DESIGNED): Matrix4 {
  return new Matrix4().makeRotationFromQuaternion(orientationQuaternion(down));
}

export function isAsDesigned(down: Down): boolean {
  return Math.abs(down[0]) < 1e-6 && Math.abs(down[1]) < 1e-6 && down[2] < 0;
}

/** Positions and normals turned into the print orientation; the input stays as it is. */
export function orientBuffers(positions: ArrayLike<number>, normals: ArrayLike<number>, down: Down): { positions: Float32Array; normals: Float32Array } {
  const q = orientationQuaternion(down);
  const outP = new Float32Array(positions.length);
  const outN = new Float32Array(normals.length);
  const v = new Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0).applyQuaternion(q);
    outP[i] = v.x;
    outP[i + 1] = v.y;
    outP[i + 2] = v.z;
  }
  for (let i = 0; i < normals.length; i += 3) {
    v.set(normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0).applyQuaternion(q);
    outN[i] = v.x;
    outN[i + 1] = v.y;
    outN[i + 2] = v.z;
  }
  return { positions: outP, normals: outN };
}

/** The faces where a load acts (marked by the user), by body and face name. */
export interface LoadPlace {
  body: string;
  faces: readonly string[];
}

export interface OrientationBody {
  name: string;
  model: ViewerModel;
}

export interface OrientationProfile {
  bed: readonly [number, number, number];
  overhang: number;
}

/** One way to lay the part on the bed, with what decides between them. */
export interface OrientationOption {
  down: [number, number, number];
  /** The face it lies on, when the direction comes from a flat face. */
  face: { body: string; name: string } | null;
  fits: boolean;
  /** mm² needing support. */
  support: number;
  /** mm² on the bed. */
  contact: number;
  /** mm, the printed height. */
  height: number;
  /**
   * How much the marked loads pull or push across the layers, 0 (along the layers, strong) to 1
   * (straight across them, weak); null without marked loads.
   */
  load: number | null;
}

interface FaceDirection {
  body: string;
  name: string;
  normal: Vector3;
  area: number;
}

/** Area-weighted outward normal and area of every face, from the render triangles. */
function faceDirections(body: OrientationBody): FaceDirection[] {
  const { model } = body;
  const positions = model.geometry.getAttribute('position').array;
  const index = model.geometry.index?.array ?? [];
  const sums = model.table.faces.map(() => ({ normal: new Vector3(), area: 0 }));
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < index.length / 3; t += 1) {
    const [ia, ib, ic] = [index[t * 3] ?? 0, index[t * 3 + 1] ?? 0, index[t * 3 + 2] ?? 0];
    a.fromArray(positions, ia * 3);
    b.fromArray(positions, ib * 3);
    c.fromArray(positions, ic * 3);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const sum = sums[model.triangleFaces[t] ?? 0];
    if (!sum) continue;
    sum.normal.add(cross);
    sum.area += cross.length() / 2;
  }
  return sums.map((sum, i) => ({
    body: body.name,
    name: model.table.faces[i]?.name ?? `F${String(i)}`,
    normal: sum.normal.lengthSq() > 0 ? sum.normal.clone().normalize() : new Vector3(),
    area: sum.area,
  }));
}

/** The outward direction of one face (area-weighted), as `down` for laying the part on it. */
export function faceDown(body: OrientationBody, face: number): [number, number, number] | null {
  const direction = faceDirections(body)[face];
  if (!direction || direction.area === 0) return null;
  const { x, y, z } = direction.normal;
  const snap = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
  const out = [snap(x), snap(y), snap(z)] as [number, number, number];
  const length = Math.hypot(...out);
  return length === 0 ? null : (out.map((v) => v / length) as [number, number, number]);
}

/** Evaluates laying the bodies with `down` onto the bed. */
export function evaluateOrientation(
  bodies: readonly OrientationBody[],
  profile: OrientationProfile,
  down: Down,
  loads: readonly LoadPlace[] = [],
): Omit<OrientationOption, 'face'> {
  const turned = bodies.map(({ model }) => {
    const geometry = model.geometry;
    return orientBuffers(geometry.getAttribute('position').array, geometry.getAttribute('normal').array, down);
  });
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
  const size = [0, 1, 2].map((k) => (max[k] ?? 0) - (min[k] ?? 0)) as [number, number, number];
  const { bed } = profile;
  const fits = (size[2] <= bed[2] && size[0] <= bed[0] && size[1] <= bed[1]) || (size[2] <= bed[2] && size[1] <= bed[0] && size[0] <= bed[1]);
  const bedZ = min[2] ?? 0;
  const limits = overhangLimits(profile.overhang);
  let support = 0;
  let contact = 0;
  bodies.forEach(({ model }, i) => {
    const buffers = turned[i];
    if (!buffers) return;
    const map = overhangOf(
      { positions: buffers.positions, normals: buffers.normals, index: (model.geometry.index?.array ?? new Uint32Array()) as Uint32Array, vertexFaces: model.vertexFaces, faceCount: model.table.faces.length },
      bedZ,
      limits,
    );
    support += map.area[Overhang.Support];
    contact += map.area[Overhang.Bed];
  });

  let load: number | null = null;
  if (loads.length > 0) {
    const q = orientationQuaternion(down);
    let weighted = 0;
    let total = 0;
    for (const body of bodies) {
      const marked = new Set(loads.filter((place) => place.body === body.name).flatMap((place) => place.faces));
      if (marked.size === 0) continue;
      for (const face of faceDirections(body)) {
        if (!marked.has(face.name) || face.area === 0) continue;
        // A load on a face acts along its normal; across the layers means along Z.
        weighted += Math.abs(face.normal.clone().applyQuaternion(q).z) * face.area;
        total += face.area;
      }
    }
    if (total > 0) load = weighted / total;
  }
  return { down: [...down], fits, support, contact, height: size[2], load };
}

const round = (value: number, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Candidates: the six axis directions and the outward normals of the largest flat faces. */
function candidates(bodies: readonly OrientationBody[]): { down: Vector3; face: { body: string; name: string } | null }[] {
  const list: { down: Vector3; face: { body: string; name: string } | null }[] = [
    [0, 0, -1],
    [0, 0, 1],
    [0, -1, 0],
    [0, 1, 0],
    [-1, 0, 0],
    [1, 0, 0],
  ].map((v) => ({ down: new Vector3(...v), face: null }));
  const flat = bodies.flatMap((body) =>
    faceDirections(body).filter((face, i) => face.area > 0 && body.model.table.faces[i]?.planeNormal !== undefined),
  );
  flat.sort((x, y) => y.area - x.area);
  for (const face of flat.slice(0, 16)) {
    const same = list.find((entry) => entry.down.angleTo(face.normal) < (1 * Math.PI) / 180);
    if (same) {
      same.face ??= { body: face.body, name: face.name };
      continue;
    }
    list.push({ down: face.normal.clone(), face: { body: face.body, name: face.name } });
  }
  return list;
}

/**
 * Ways to lay the part on the bed, best first: it must fit; then marked loads should run along the
 * layers; then little support, enough on the bed and a low height. Explainable on purpose: the
 * user sees the numbers that decided.
 */
export function proposeOrientations(
  bodies: readonly OrientationBody[],
  profile: OrientationProfile,
  loads: readonly LoadPlace[] = [],
): OrientationOption[] {
  const options = candidates(bodies).map(({ down, face }) => {
    const result = evaluateOrientation(bodies, profile, [down.x, down.y, down.z], loads);
    return {
      ...result,
      down: result.down.map((value) => round(value, 6)) as [number, number, number],
      face,
      support: round(result.support),
      contact: round(result.contact),
      height: round(result.height, 1),
      load: result.load === null ? null : round(result.load, 2),
    };
  });
  // Less than this on the bed costs like support: the part may come loose.
  const shortfall = (contact: number) => Math.max(0, 100 - contact) * 3;
  const cost = (option: OrientationOption) => option.support + shortfall(option.contact) + option.height;
  // Loads in four steps, so a small difference in angle does not outweigh a lot of support.
  const loadStep = (option: OrientationOption) => (option.load === null ? 0 : Math.round(option.load * 4));
  return options.sort((x, y) => Number(y.fits) - Number(x.fits) || loadStep(x) - loadStep(y) || cost(x) - cost(y));
}

/** The vertices of all bodies turned into the print orientation and set onto the bed (min z 0), as a 4×4 matrix. */
export function placementMatrix(bodies: readonly OrientationBody[], down: Down): Matrix4 {
  const rotation = orientationMatrix(down);
  let minZ = Infinity;
  const v = new Vector3();
  for (const { model } of bodies) {
    const positions = model.geometry.getAttribute('position').array;
    for (let i = 0; i < positions.length; i += 3) {
      v.set(positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0).applyMatrix4(rotation);
      minZ = Math.min(minZ, v.z);
    }
  }
  return new Matrix4().makeTranslation(0, 0, Number.isFinite(minZ) ? -minZ : 0).multiply(rotation);
}
