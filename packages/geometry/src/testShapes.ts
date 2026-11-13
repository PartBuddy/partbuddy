import type { FaceTable } from './faceTable';
import { buildRenderMesh } from './renderMesh';
import type { TaggedMesh } from './tagged3mf';
import { buildViewerModel, type ViewerModel } from './viewerModel';

/**
 * Shapes for the tests of the print check and the orientation: bodies as SolidCraft would export
 * them, outward triangles and faces named like `F1:+z`. Not used by the app.
 */

type Point = [number, number, number];

interface Built {
  positions: number[];
  indices: number[];
  triangleFaces: number[];
  names: string[];
  normals: (Point | undefined)[];
  cylinders?: ({ origin: Point; axis: Point; radius: number } | undefined)[];
}

function finish(name: string, built: Built): { name: string; model: ViewerModel } {
  const mesh: TaggedMesh = {
    name,
    faceCount: built.names.length,
    positions: Float64Array.from(built.positions),
    indices: Uint32Array.from(built.indices),
    triangleFaces: Uint32Array.from(built.triangleFaces),
  };
  const table: FaceTable = {
    model: 'test',
    body: name,
    units: 'mm',
    faces: built.names.map((faceName, index) => {
      const planeNormal = built.normals[index];
      const cylinder = built.cylinders?.[index];
      return { index, name: faceName, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], ...(planeNormal ? { planeNormal } : {}), ...(cylinder ? { cylinder } : {}) };
    }),
  };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

const QUADS = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] as const;
const SIDES = ['-z', '+z', '-y', '+x', '+y', '-x'] as const;
const NORMALS: Point[] = [[0, 0, -1], [0, 0, 1], [0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]];

/**
 * One body made of boxes, each a closed shell of its own (touching boxes leave faces inside the
 * body, as a union exported without cleanup would). Box `i` has faces `F<i+1>:-z` … `F<i+1>:-x`.
 */
export function boxesBody(name: string, boxes: readonly (readonly [Point, Point])[]) {
  const built: Built = { positions: [], indices: [], triangleFaces: [], names: [], normals: [] };
  boxes.forEach(([[x0, y0, z0], [x1, y1, z1]], b) => {
    const base = built.positions.length / 3;
    built.positions.push(x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
    QUADS.forEach(([p, q, r, s], side) => {
      const face = built.names.length;
      built.names.push(`F${String(b + 1)}:${SIDES[side] ?? ''}`);
      built.normals.push(NORMALS[side]);
      built.indices.push(base + p, base + q, base + r, base + p, base + r, base + s);
      built.triangleFaces.push(face, face);
    });
  });
  return finish(name, built);
}

/**
 * A tube lying along X on the bed: outer radius `outer`, a hole of radius `inner`, `length` long, its outside and its
 * hole cut into `segments` and `innerSegments` pieces round (SolidCraft meshes a large and a small circle finer or
 * coarser alike only by chance). Faces: `F1:outer`, `F1:hole`, `F1:-x`, `F1:+x`.
 */
export function lyingTube(name: string, outer: number, inner: number, length: number, segments = 48, innerSegments = segments) {
  const built: Built = {
    positions: [],
    indices: [],
    triangleFaces: [],
    names: ['F1:outer', 'F1:hole', 'F1:-x', 'F1:+x'],
    normals: [undefined, undefined, [-1, 0, 0], [1, 0, 0]],
    cylinders: [{ origin: [0, 0, outer], axis: [1, 0, 0], radius: outer }, { origin: [0, 0, outer], axis: [1, 0, 0], radius: inner }],
  };
  // Rings: outer at x=0, outer at x=length, inner at x=0, inner at x=length; angle 0 points down.
  const ring = (radius: number, x: number, count: number) => {
    const start = built.positions.length / 3;
    for (let i = 0; i < count; i += 1) {
      const angle = (i * 2 * Math.PI) / count;
      built.positions.push(x, radius * Math.sin(angle), outer - radius * Math.cos(angle));
    }
    return start;
  };
  const o0 = ring(outer, 0, segments);
  const o1 = ring(outer, length, segments);
  const i0 = ring(inner, 0, innerSegments);
  const i1 = ring(inner, length, innerSegments);
  /** A triangle of `face`, turned so it faces along `x` (the end caps). */
  const facing = (a: number, b: number, c: number, face: number, x: number) => {
    const p = (v: number) => [built.positions[v * 3 + 1] ?? 0, built.positions[v * 3 + 2] ?? 0];
    const [[ay, az], [by, bz], [cy, cz]] = [p(a), p(b), p(c)] as [[number, number], [number, number], [number, number]];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    built.indices.push(...(nx * x >= 0 ? [a, b, c] : [a, c, b]));
    built.triangleFaces.push(face);
  };
  const quad = (a: number, b: number, c: number, d: number, face: number) => {
    built.indices.push(a, b, c, a, c, d);
    built.triangleFaces.push(face, face);
  };
  for (let i = 0; i < segments; i += 1) quad(o0 + i, o0 + ((i + 1) % segments), o1 + ((i + 1) % segments), o1 + i, 0); // outside, normals away from the axis
  for (let i = 0; i < innerSegments; i += 1) quad(i0 + i, i1 + i, i1 + ((i + 1) % innerSegments), i0 + ((i + 1) % innerSegments), 1); // the hole, normals towards the axis
  // The ends: the two rings zipped by angle.
  for (const [o, n, face, x] of [[o0, i0, 2, -1], [o1, i1, 3, 1]] as const) {
    let [i, j] = [0, 0];
    while (i < segments || j < innerSegments) {
      const outerNext = (i + 1) / segments;
      const innerNext = (j + 1) / innerSegments;
      if (j >= innerSegments || (i < segments && outerNext <= innerNext)) {
        facing(o + (i % segments), o + ((i + 1) % segments), n + (j % innerSegments), face, x);
        i += 1;
      } else {
        facing(o + (i % segments), n + ((j + 1) % innerSegments), n + (j % innerSegments), face, x);
        j += 1;
      }
    }
  }
  return finish(name, built);
}

/** A solid rod lying along X on the bed, `radius` round, `length` long: faces `F1:side` (a cylinder), `F1:-x`, `F1:+x`. */
export function lyingRod(name: string, radius: number, length: number, segments = 24) {
  const built: Built = {
    positions: [0, 0, radius, length, 0, radius],
    indices: [],
    triangleFaces: [],
    names: ['F1:side', 'F1:-x', 'F1:+x'],
    normals: [undefined, [-1, 0, 0], [1, 0, 0]],
    cylinders: [{ origin: [0, 0, radius], axis: [1, 0, 0], radius }],
  };
  for (const x of [0, length]) {
    for (let i = 0; i < segments; i += 1) {
      const angle = (i * 2 * Math.PI) / segments;
      built.positions.push(x, radius * Math.sin(angle), radius - radius * Math.cos(angle));
    }
  }
  const [r0, r1] = [2, 2 + segments];
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    built.indices.push(r0 + i, r0 + j, r1 + j, r0 + i, r1 + j, r1 + i);
    built.triangleFaces.push(0, 0);
    built.indices.push(0, r0 + j, r0 + i, 1, r1 + i, r1 + j);
    built.triangleFaces.push(1, 2);
  }
  return finish(name, built);
}

/**
 * A prism along Y: the convex outline in the XZ plane (counter-clockwise seen from -y, i.e. with
 * X right and Z up), `length` deep. Faces `F1:s0`, `F1:s1` … per outline edge, then `F1:-y`, `F1:+y`;
 * `faces` may name an edge's face otherwise and give it a cylinder, as SolidCraft's `model.faces` does.
 */
export function prismBody(name: string, outline: readonly (readonly [number, number])[], length: number, faces: (edge: number) => { name: string; cylinder?: { origin: Point; axis: Point; radius: number } } | undefined = () => undefined) {
  const n = outline.length;
  const built: Built = { positions: [], indices: [], triangleFaces: [], names: [], normals: [], cylinders: [] };
  for (const [x, z] of outline) built.positions.push(x, 0, z);
  for (const [x, z] of outline) built.positions.push(x, length, z);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const face = built.names.length;
    built.names.push(faces(i)?.name ?? `F1:s${String(i)}`);
    built.normals.push(undefined);
    built.cylinders?.push(faces(i)?.cylinder);
    // Seen from outside: front edge i→j, then back.
    built.indices.push(i, n + j, j, i, n + i, n + j);
    built.triangleFaces.push(face, face);
  }
  const front = built.names.length;
  built.names.push('F1:-y', 'F1:+y');
  built.normals.push([0, -1, 0], [0, 1, 0]);
  for (const [a, b, c] of ears(outline)) {
    built.indices.push(a, b, c);
    built.triangleFaces.push(front);
    built.indices.push(n + a, n + c, n + b);
    built.triangleFaces.push(front + 1);
  }
  return finish(name, built);
}

/** The triangles of a simple polygon given counter-clockwise, by clipping ears: the outline need not be convex. */
export function ears(outline: readonly (readonly [number, number])[]): [number, number, number][] {
  const turn = (o: number, a: number, b: number) => {
    const [ox, oz] = outline[o] ?? [0, 0];
    const [ax, az] = outline[a] ?? [0, 0];
    const [bx, bz] = outline[b] ?? [0, 0];
    return (ax - ox) * (bz - oz) - (az - oz) * (bx - ox);
  };
  const left = outline.map((_, i) => i);
  const triangles: [number, number, number][] = [];
  while (left.length > 3) {
    const n = left.length;
    const at = left.findIndex((b, i) => {
      const a = left[(i + n - 1) % n] ?? 0;
      const c = left[(i + 1) % n] ?? 0;
      return turn(a, b, c) > 0 && left.every((p) => p === a || p === b || p === c || turn(a, b, p) < 0 || turn(b, c, p) < 0 || turn(c, a, p) < 0);
    });
    if (at < 0) throw new Error('prismBody: the outline is not a simple counter-clockwise polygon');
    triangles.push([left[(at + n - 1) % n] ?? 0, left[at] ?? 0, left[(at + 1) % n] ?? 0]);
    left.splice(at, 1);
  }
  triangles.push([left[0] ?? 0, left[1] ?? 0, left[2] ?? 0]);
  return triangles;
}

/**
 * A body of blocks on a grid: the cells between the planes `xs`, `ys`, `zs` for which `filled` says
 * so, as one closed shell with the faces between two filled cells left out. One face per direction
 * and plane, named like `F1:-z@8` (facing down, at z 8).
 */
export function gridBody(name: string, xs: readonly number[], ys: readonly number[], zs: readonly number[], filled: (i: number, j: number, k: number) => boolean) {
  const built: Built = { positions: [], indices: [], triangleFaces: [], names: [], normals: [] };
  const vertices = new Map<string, number>();
  const vertex = (point: Point) => {
    const key = point.join(',');
    let v = vertices.get(key);
    if (v === undefined) {
      v = built.positions.length / 3;
      vertices.set(key, v);
      built.positions.push(...point);
    }
    return v;
  };
  const inside = (i: number, j: number, k: number) => i >= 0 && j >= 0 && k >= 0 && i < xs.length - 1 && j < ys.length - 1 && k < zs.length - 1 && filled(i, j, k);
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      for (let k = 0; k < zs.length - 1; k += 1) {
        if (!inside(i, j, k)) continue;
        const [x0, x1, y0, y1, z0, z1] = [xs[i] ?? 0, xs[i + 1] ?? 0, ys[j] ?? 0, ys[j + 1] ?? 0, zs[k] ?? 0, zs[k + 1] ?? 0];
        const corners: Point[] = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
        NORMALS.forEach(([dx, dy, dz], side) => {
          if (inside(i + dx, j + dy, k + dz)) return;
          const faceName = `F1:${SIDES[side] ?? ''}@${String([z0, z1, y0, x1, y1, x0][side] ?? 0)}`;
          let face = built.names.indexOf(faceName);
          if (face < 0) {
            face = built.names.push(faceName) - 1;
            built.normals.push([dx, dy, dz]);
          }
          const [p, q, r, s] = (QUADS[side] ?? [0, 0, 0, 0]).map((corner) => vertex(corners[corner] ?? [0, 0, 0]));
          built.indices.push(p ?? 0, q ?? 0, r ?? 0, p ?? 0, r ?? 0, s ?? 0);
          built.triangleFaces.push(face, face);
        });
      }
    }
  }
  return finish(name, built);
}

/** A mesh as the overhang check takes it, without the normals: for shapes that are no body with faces. */
export interface RawMesh {
  positions: Float32Array;
  index: Uint32Array;
  vertexFaces: Uint32Array;
  faceCount: number;
}

export function meshOf(body: { model: ViewerModel }): RawMesh {
  const geometry = body.model.geometry;
  return { positions: geometry.getAttribute('position').array as Float32Array, index: geometry.index?.array as Uint32Array, vertexFaces: body.model.vertexFaces, faceCount: body.model.table.faces.length };
}

/** A mesh from triangles given by their corners, outward counter-clockwise; equal corners become one vertex. */
export function soup(triangles: readonly (readonly Point[])[]): RawMesh {
  const seen = new Map<string, number>();
  const positions: number[] = [];
  const index: number[] = [];
  for (const triangle of triangles) {
    for (const point of triangle) {
      const key = point.join(',');
      let v = seen.get(key);
      if (v === undefined) {
        v = positions.length / 3;
        seen.set(key, v);
        positions.push(...point);
      }
      index.push(v);
    }
  }
  return { positions: Float32Array.from(positions), index: Uint32Array.from(index), vertexFaces: new Uint32Array(positions.length / 3), faceCount: 1 };
}

/** A circle of `n` points round the Z axis. */
export const circle = (radius: number, z: number, n: number): Point[] => Array.from({ length: n }, (_, i) => [radius * Math.cos((i * 2 * Math.PI) / n), radius * Math.sin((i * 2 * Math.PI) / n), z]);

/**
 * A surface through rings of points, each joined to the next; `wrap` closes every ring. Triangles
 * face away from the Z axis, flat rings up or down as `facing` says (1, −1) for the step after them.
 */
export function ringSurface(rings: readonly (readonly Point[])[], facing: readonly number[], wrap = true): RawMesh {
  const positions = rings.flat(2);
  const per = rings[0]?.length ?? 0;
  const index: number[] = [];
  const point = (v: number) => [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0] as const;
  for (let r = 0; r + 1 < rings.length; r += 1) {
    for (let i = 0; i < (wrap ? per : per - 1); i += 1) {
      const j = (i + 1) % per;
      const quad = [r * per + i, r * per + j, (r + 1) * per + j, (r + 1) * per + i] as const;
      for (const [a, b, c] of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] as const) {
        const [pa, pb, pc] = [point(a), point(b), point(c)];
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]] as const;
        const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]] as const;
        const normal = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]] as const;
        const radial = normal[0] * (pa[0] + pb[0] + pc[0]) + normal[1] * (pa[1] + pb[1] + pc[1]);
        const flip = Math.abs(radial) > 1e-9 ? radial < 0 : normal[2] * (facing[r] ?? 0) < 0;
        index.push(a, flip ? c : b, flip ? b : c);
      }
    }
  }
  return { positions: Float32Array.from(positions), index: Uint32Array.from(index), vertexFaces: new Uint32Array(positions.length / 3), faceCount: 1 };
}

/** A body of revolution round Z from a profile of [radius, z]; a radius of 0 closes it on the axis. */
export function revolved(profile: readonly (readonly [number, number])[], facing: readonly number[], n = 96): RawMesh {
  return ringSurface(profile.map(([radius, z]) => circle(radius, z, n)), facing);
}

/**
 * A body of revolution round Z from a closed profile of [radius, z], counter-clockwise with the radius to the right:
 * unlike `revolved` its faces may look towards the axis, as the wall of a pocket does. Corners on the axis close it.
 */
export function lathe(profile: readonly (readonly [number, number])[], n = 48): RawMesh {
  const triangles: Point[][] = [];
  const at = ([r, z]: readonly [number, number], k: number): Point => (r === 0 ? [0, 0, z] : [r * Math.cos((k * 2 * Math.PI) / n), r * Math.sin((k * 2 * Math.PI) / n), z]);
  profile.forEach((p, i) => {
    const q = profile[(i + 1) % profile.length] ?? p;
    for (let k = 0; k < n; k += 1) {
      if (p[0] !== 0) triangles.push([at(p, k), at(p, k + 1), at(q, k + 1)]);
      if (q[0] !== 0) triangles.push([at(p, k), at(q, k + 1), at(q, k)]);
    }
  });
  return soup(triangles);
}

/**
 * The same body placed otherwise: mirrored in X if asked, turned about Z by `degrees` and lifted by `lift` mm. The
 * corners of its faces are joined again by position, so the body stays a closed shell; planes and cylinders turn with it.
 */
export function posed<T extends { name: string; model: ViewerModel }>(body: T, degrees: number, mirrored = false, lift = 0): T {
  const cos = Math.cos((degrees * Math.PI) / 180);
  const sin = Math.sin((degrees * Math.PI) / 180);
  const turn = ([x, y, z]: Point, shift: number): Point => {
    const mx = mirrored ? -x : x;
    return [cos * mx - sin * y, sin * mx + cos * y, z + shift];
  };
  const source = body.model.geometry.getAttribute('position').array;
  const index = body.model.geometry.index?.array ?? [];
  const welded = new Map<string, number>();
  const positions: number[] = [];
  const of = (v: number) => {
    const point: Point = [source[v * 3] ?? 0, source[v * 3 + 1] ?? 0, source[v * 3 + 2] ?? 0];
    const key = point.join(',');
    let at = welded.get(key);
    if (at === undefined) {
      at = positions.length / 3;
      welded.set(key, at);
      positions.push(...turn(point, lift));
    }
    return at;
  };
  const indices: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [of(index[t] ?? 0), of(index[t + 1] ?? 0), of(index[t + 2] ?? 0)];
    // Mirrored, the triangles turn the other way round.
    indices.push(...(mirrored ? [a, c, b] : [a, b, c]));
  }
  const table: FaceTable = {
    ...body.model.table,
    faces: body.model.table.faces.map((face) => ({
      ...face,
      ...(face.planeNormal ? { planeNormal: turn(face.planeNormal, 0) } : {}),
      ...(face.cylinder ? { cylinder: { ...face.cylinder, origin: turn(face.cylinder.origin, lift), axis: turn(face.cylinder.axis, 0) } } : {}),
    })),
  };
  const mesh: TaggedMesh = { name: body.name, faceCount: table.faces.length, positions: Float64Array.from(positions), indices: Uint32Array.from(indices), triangleFaces: Uint32Array.from(body.model.triangleFaces) };
  return { ...body, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

/**
 * A closed mesh as one body, for shapes that come as triangles; corners that meet are joined. What lies flat facing down
 * or up is a face of its own (`F1:-z`, `F1:+z`), the rest `F1:skin`: SolidCraft splits the corners between faces, so a
 * base keeps its own normals and is not rounded into the side.
 */
export function rawBody(name: string, mesh: RawMesh) {
  const built: Built = { positions: [], indices: [], triangleFaces: [], names: ['F1:skin', 'F1:-z', 'F1:+z'], normals: [undefined, [0, 0, -1], [0, 0, 1]] };
  const seen = new Map<string, number>();
  const at = (v: number) => {
    const point = [0, 1, 2].map((k) => Math.round((mesh.positions[v * 3 + k] ?? 0) * 1e6) / 1e6);
    const key = point.join(',');
    let w = seen.get(key);
    if (w === undefined) {
      w = built.positions.length / 3;
      seen.set(key, w);
      built.positions.push(...point);
    }
    return w;
  };
  for (let t = 0; t < mesh.index.length; t += 3) {
    const [a, b, c] = [at(mesh.index[t] ?? 0), at(mesh.index[t + 1] ?? 0), at(mesh.index[t + 2] ?? 0)];
    // Triangles drawn to a point on the axis are dropped: they have no area and no edge to share.
    if (a === b || b === c || a === c) continue;
    built.indices.push(a, b, c);
    const z = (v: number) => built.positions[v * 3 + 2] ?? 0;
    const flat = z(a) === z(b) && z(b) === z(c);
    const [ax, ay, bx, by, cx, cy] = [a, b, c].flatMap((v) => [built.positions[v * 3] ?? 0, built.positions[v * 3 + 1] ?? 0]) as [number, number, number, number, number, number];
    const up = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;
    built.triangleFaces.push(flat ? (up ? 2 : 1) : 0);
  }
  return finish(name, built);
}
