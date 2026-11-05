/**
 * Overhangs for FDM printing (UI upgrade step 12): how far a downward face leans from the vertical,
 * with the part printed along +Z on a bed at its lowest point. Faces up to 35° from the vertical
 * print fine, 35–45° are borderline, beyond 45° they need support (the material's profile moves
 * these limits, M7); faces lying on the bed are not overhangs. Pure, on the render buffers; the
 * print direction from M7's orientation comes later.
 */

export const Overhang = { Fine: 0, Bed: 1, Borderline: 2, Support: 3 } as const;
export type Overhang = (typeof Overhang)[keyof typeof Overhang];

/** Degrees from the vertical where a downward face becomes borderline, and where it needs support. */
export interface OverhangLimits {
  borderline: number;
  support: number;
}

/** The limits without a print profile. */
export const OVERHANG_LIMITS: OverhangLimits = { borderline: 35, support: 45 };

/** The limits for a material (M7): support beyond its overhang angle, borderline 10° before. */
export function overhangLimits(support: number): OverhangLimits {
  return { borderline: Math.max(0, support - 10), support };
}

/**
 * Degrees past the limit before a face needs support: a 45° chamfer is exactly at the usual limit,
 * and rounding in its normals must not tip it over (practice run 2026-11-05: a 45° bottom chamfer
 * read as 1,006 mm² needing support).
 */
export const ANGLE_TOLERANCE = 1;

/** How close to the bed (mm) a face must lie to count as lying on it. */
const BED_TOLERANCE = 0.05;

/** The class of a direction: `down` is how much it points down (−z of the unit normal). */
function classifier(limits: OverhangLimits): (down: number) => Overhang {
  const sinBorderline = Math.sin((limits.borderline * Math.PI) / 180);
  const sinSupport = Math.sin(((limits.support + ANGLE_TOLERANCE) * Math.PI) / 180);
  return (down) => {
    if (down > sinSupport) return Overhang.Support;
    if (down > sinBorderline) return Overhang.Borderline;
    return Overhang.Fine;
  };
}

export interface OverhangMap {
  /** Class per render vertex, from its normal: curved faces shade from fine to support. */
  vertices: Uint8Array;
  /** Area in mm² per class, from each triangle's own normal. */
  area: [number, number, number, number];
  /** Area in mm² per B-rep face that needs support (the print check's findings, M7). */
  supportByFace: Float64Array;
}

export interface OverhangInput {
  positions: Float32Array;
  normals: Float32Array;
  index: Uint32Array;
  vertexFaces: Uint32Array;
  faceCount: number;
}

/** Overhang classes of one body printed on a bed at height `bedZ`. */
export function overhangOf(mesh: OverhangInput, bedZ: number, limits: OverhangLimits = OVERHANG_LIMITS): OverhangMap {
  const classOf = classifier(limits);
  const { positions, normals, index, vertexFaces, faceCount } = mesh;
  // A face lies on the bed when none of its vertices is above it.
  const top = new Float64Array(faceCount).fill(Number.NEGATIVE_INFINITY);
  for (let v = 0; v < vertexFaces.length; v += 1) {
    const face = vertexFaces[v] ?? 0;
    top[face] = Math.max(top[face] ?? Number.NEGATIVE_INFINITY, positions[v * 3 + 2] ?? 0);
  }
  const onBed = (face: number) => (top[face] ?? Number.POSITIVE_INFINITY) <= bedZ + BED_TOLERANCE;

  const vertices = new Uint8Array(vertexFaces.length);
  for (let v = 0; v < vertexFaces.length; v += 1) {
    vertices[v] = onBed(vertexFaces[v] ?? 0) ? Overhang.Bed : classOf(-(normals[v * 3 + 2] ?? 0));
  }

  const area: [number, number, number, number] = [0, 0, 0, 0];
  const supportByFace = new Float64Array(faceCount);
  for (let i = 0; i < index.length; i += 3) {
    const a = (index[i] ?? 0) * 3;
    const b = (index[i + 1] ?? 0) * 3;
    const c = (index[i + 2] ?? 0) * 3;
    const ux = (positions[b] ?? 0) - (positions[a] ?? 0);
    const uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0);
    const uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0);
    const vx = (positions[c] ?? 0) - (positions[a] ?? 0);
    const vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0);
    const vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) continue;
    const face = vertexFaces[index[i] ?? 0] ?? 0;
    const kind = onBed(face) ? Overhang.Bed : classOf(-nz / length);
    area[kind] += length / 2;
    if (kind === Overhang.Support) supportByFace[face] = (supportByFace[face] ?? 0) + length / 2;
  }
  return { vertices, area, supportByFace };
}
