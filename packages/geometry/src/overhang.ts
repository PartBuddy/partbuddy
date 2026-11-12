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

/**
 * How far (mm) an overhang may reach out from the material that goes on below it and still count as
 * small: four extrusion lines. OrcaSlicer and Bambu Studio leave such overhangs without support by
 * default ("Ignore small overhangs": a cluster that is empty after eroding one line width from each
 * side, or narrower than two more, TreeSupport.cpp), and they hold: thread flanks, the nose of a
 * snap fit, a lip.
 */
export function smallOverhangReach(nozzle: number): number {
  return Math.round(4 * 1.125 * nozzle * 100) / 100;
}

/**
 * `count` points spread evenly over a triangle, each as the weights of its three corners: the middle
 * first, then the R2 sequence folded into the triangle. A flat face comes as two triangles, so its
 * middles alone say nothing of what lies between them.
 */
export function spread(count: number): [number, number, number][] {
  const points: [number, number, number][] = [[1 / 3, 1 / 3, 1 / 3]];
  for (let i = 1; i < count; i += 1) {
    let u = (0.5 + i * 0.7548776662466927) % 1;
    let v = (0.5 + i * 0.5698402909980532) % 1;
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    points.push([1 - u - v, u, v]);
  }
  return points;
}

/** Positions closer than this (mm) are one vertex: render buffers repeat corners per face. */
const WELD = 1e-4;

/**
 * How far (mm) a flat ceiling may span between the material on both sides and still print as a
 * bridge without support: UltiMaker, Design for FFF 3D printing (10 mm; Protolabs Network and
 * Xometry Pro name 5 mm for a bridge that does not sag at all). The assistant designs to the same
 * number (printProfiles.ts).
 */
export const BRIDGE_SPAN = 10;

/**
 * Up to this diameter (mm) a hole lying across the layers prints round without support, slightly
 * oval (MakerVerse, FDM Design Guide; the only source of the audit's scale that names a size). The
 * assistant designs to the same number (printProfiles.ts).
 */
export const LYING_HOLE = 8;

/** A face that points down this straight (−z of its unit normal) is a ceiling that can be bridged. */
const LEVEL = 0.99;
/** A face that looks up at least this much (z of its unit normal) has material under it. */
const UP = 0.1;
const CORNERS: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * Overhang triangles that are small: each connected patch whose every point lies within `reach`
 * (mm, across the bed) of an edge where the material goes on below, the way a ledge or a thread
 * flank hangs from its wall, or between two such edges that are the patch's nearest rims on both
 * sides and no more than a span apart: `BRIDGE_SPAN` under a flat ceiling, `arch` under the roof of
 * a lying hole. A patch with no such edge starts in the air, and a patch reaching further (a
 * ceiling, a wide bridge, a cantilevered arm, a lip beside a slot) needs support; both stay.
 * shortcut: point-to-edge distances are compared pairwise per patch; fine for the parts PartBuddy
 * builds, upgrade to a spatial grid if a check of a large mesh gets slow.
 */
function smallPatches(positions: ArrayLike<number>, index: ArrayLike<number>, support: readonly number[], reach: number, arch: number, bedZ: number): Set<number> {
  const small = new Set<number>();
  if (support.length === 0) return small;
  const key = (v: number) => `${String(Math.round((positions[v * 3] ?? 0) / WELD))},${String(Math.round((positions[v * 3 + 1] ?? 0) / WELD))},${String(Math.round((positions[v * 3 + 2] ?? 0) / WELD))}`;
  const keys = new Map<number, string>();
  const keyOf = (v: number) => {
    let k = keys.get(v);
    if (k === undefined) {
      k = key(v);
      keys.set(v, k);
    }
    return k;
  };
  const edgeKey = (a: number, b: number) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const x = (v: number) => positions[v * 3] ?? 0;
  const y = (v: number) => positions[v * 3 + 1] ?? 0;
  const z = (v: number) => positions[v * 3 + 2] ?? 0;
  /** The normal of a triangle, not of unit length. */
  const normalOf = (t: number): [number, number, number] => {
    const [a, b, c] = [index[t * 3] ?? 0, index[t * 3 + 1] ?? 0, index[t * 3 + 2] ?? 0];
    const [ux, uy, uz, vx, vy, vz] = [x(b) - x(a), y(b) - y(a), z(b) - z(a), x(c) - x(a), y(c) - y(a), z(c) - z(a)];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  // Every edge of the body with the triangles on it and their third corner; per vertex the vertices
  // one edge away, and whether a face that looks up meets it.
  const edges = new Map<string, { triangle: number; third: number }[]>();
  const links = new Map<string, number[]>();
  const looksUp = new Set<string>();
  for (let t = 0; t < index.length / 3; t += 1) {
    const [nx, ny, nz] = normalOf(t);
    const up = nz > UP * Math.hypot(nx, ny, nz);
    for (let k = 0; k < 3; k += 1) {
      const a = index[t * 3 + k] ?? 0;
      const b = index[t * 3 + ((k + 1) % 3)] ?? 0;
      const third = index[t * 3 + ((k + 2) % 3)] ?? 0;
      const id = edgeKey(a, b);
      const list = edges.get(id);
      if (list) list.push({ triangle: t, third });
      else edges.set(id, [{ triangle: t, third }]);
      const near = links.get(keyOf(a));
      if (near) near.push(b, third);
      else links.set(keyOf(a), [b, third]);
      if (up) looksUp.add(keyOf(a));
    }
  }
  // Whether the material at a vertex stands on something: going down along the mesh, never up, it
  // comes to the bed or to a face that looks up (a floor, the flank below). The tip of a drip edge
  // under a shelf ends in the air instead.
  // shortcut: a hook whose own back looks up counts as standing; follow the material below the
  // face that looks up if such a shape must be told apart.
  const stands = new Map<string, boolean>();
  const grounded = (start: number): boolean => {
    const known = stands.get(keyOf(start));
    if (known !== undefined) return known;
    const visited = new Set<string>([keyOf(start)]);
    const stack = [start];
    let found = false;
    while (stack.length > 0 && !found) {
      const v = stack.pop() ?? 0;
      if (z(v) <= bedZ + BED_TOLERANCE || looksUp.has(keyOf(v))) found = true;
      else
        for (const next of links.get(keyOf(v)) ?? []) {
          if (z(next) > z(v) + WELD || visited.has(keyOf(next))) continue;
          visited.add(keyOf(next));
          stack.push(next);
        }
    }
    stands.set(keyOf(start), found);
    return found;
  };
  const isSupport = new Set(support);
  const seen = new Set<number>();
  for (const start of support) {
    if (seen.has(start)) continue;
    // One patch: support triangles joined by edges.
    const patch: number[] = [];
    const anchors: [number, number][] = [];
    // Every edge where the patch ends, and whether it is an anchor.
    const rim: [number, number, boolean][] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const t = queue.pop() ?? 0;
      patch.push(t);
      for (let k = 0; k < 3; k += 1) {
        const a = index[t * 3 + k] ?? 0;
        const b = index[t * 3 + ((k + 1) % 3)] ?? 0;
        for (const other of edges.get(edgeKey(a, b)) ?? []) {
          if (other.triangle === t) continue;
          if (isSupport.has(other.triangle)) {
            if (!seen.has(other.triangle)) {
              seen.add(other.triangle);
              queue.push(other.triangle);
            }
          } else {
            // The neighbour goes on downwards from this edge to where it stands, or the edge lies
            // on the bed: the patch hangs from material here.
            const anchor = (z(other.third) < Math.min(z(a), z(b)) - WELD && grounded(other.third)) || Math.max(z(a), z(b)) <= bedZ + BED_TOLERANCE;
            if (anchor) anchors.push([a, b]);
            rim.push([a, b, anchor]);
          }
        }
      }
    }
    if (anchors.length === 0) continue;
    const near = (px: number, py: number) => {
      for (const [a, b] of anchors) {
        const ax = positions[a * 3] ?? 0;
        const ay = positions[a * 3 + 1] ?? 0;
        const dx = (positions[b * 3] ?? 0) - ax;
        const dy = (positions[b * 3 + 1] ?? 0) - ay;
        const length = dx * dx + dy * dy;
        const s = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
        if (Math.hypot(px - ax - s * dx, py - ay - s * dy) <= reach) return true;
      }
      return false;
    };
    // A point is bridged where a straight line through it leaves the patch over an anchor on both
    // sides, within the span. A free edge or a hole on the way makes that side an arm, not a bridge.
    const bridged = (px: number, py: number, span: number) => {
      for (let turn = 0; turn < 12; turn += 1) {
        const dx = Math.cos((turn * Math.PI) / 12);
        const dy = Math.sin((turn * Math.PI) / 12);
        // Distance to the nearest rim ahead and behind, and whether it is free.
        const ends = [
          { at: Infinity, free: false },
          { at: Infinity, free: false },
        ];
        for (const [a, b, anchor] of rim) {
          const ax = x(a) - px;
          const ay = y(a) - py;
          const ex = x(b) - x(a);
          const ey = y(b) - y(a);
          const cross = dx * ey - dy * ex;
          if (Math.abs(cross) < 1e-12) continue;
          const s = (ax * dy - ay * dx) / cross;
          if (s < -1e-6 || s > 1 + 1e-6) continue;
          const along = (ax * ey - ay * ex) / cross;
          const end = ends[along >= 0 ? 0 : 1];
          if (!end) continue;
          const at = Math.abs(along);
          // Two rims met at one point: a free one among them decides.
          if (Math.abs(at - end.at) <= WELD) end.free ||= !anchor;
          else if (at < end.at) {
            end.at = at;
            end.free = !anchor;
          }
        }
        if (ends.every((end) => !end.free) && (ends[0]?.at ?? Infinity) + (ends[1]?.at ?? Infinity) <= span + WELD) return true;
      }
      return false;
    };
    // Every point of the patch, not only its corners: a ceiling has all its corners on its walls.
    const holds = patch.every((t) => {
      const [a, b, c] = [index[t * 3] ?? 0, index[t * 3 + 1] ?? 0, index[t * 3 + 2] ?? 0];
      const [nx, ny, nz] = normalOf(t);
      const span = -nz > LEVEL * Math.hypot(nx, ny, nz) ? BRIDGE_SPAN : arch;
      const points = [...spread(Math.ceil(Math.abs(nz) / 2 / (reach / 2) ** 2)), ...CORNERS];
      return points.every(([wa, wb, wc]) => {
        const px = wa * x(a) + wb * x(b) + wc * x(c);
        const py = wa * y(a) + wb * y(b) + wc * y(c);
        return near(px, py) || bridged(px, py, span);
      });
    });
    if (holds) for (const t of patch) small.add(t);
  }
  return small;
}

/**
 * Overhang classes of one body printed on a bed at height `bedZ`. With `reach`, overhangs that reach
 * no further than that from the material below (`smallOverhangReach`) count as borderline, not as
 * needing support.
 */
export function overhangOf(mesh: OverhangInput, bedZ: number, limits: OverhangLimits = OVERHANG_LIMITS, reach = 0): OverhangMap {
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
  const triangles: { kind: Overhang; face: number; area: number }[] = [];
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
    const face = vertexFaces[index[i] ?? 0] ?? 0;
    triangles.push({ kind: length === 0 ? Overhang.Fine : onBed(face) ? Overhang.Bed : classOf(-nz / length), face, area: length / 2 });
  }
  const support = reach > 0 ? triangles.flatMap((triangle, t) => (triangle.kind === Overhang.Support ? [t] : [])) : [];
  // The roof of a lying hole overhangs between the two lines where its wall passes the limit.
  const arch = LYING_HOLE * Math.sin(((limits.support + ANGLE_TOLERANCE) * Math.PI) / 180);
  const small = smallPatches(positions, index, support, reach, arch, bedZ);
  triangles.forEach(({ kind, face, area: size }, t) => {
    const counted = small.has(t) ? Overhang.Borderline : kind;
    area[counted] += size;
    if (counted === Overhang.Support) supportByFace[face] = (supportByFace[face] ?? 0) + size;
  });
  return { vertices, area, supportByFace };
}
