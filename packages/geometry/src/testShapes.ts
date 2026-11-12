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
 * A tube lying along X on the bed: outer radius `outer`, a hole of radius `inner`, `length` long.
 * Faces: `F1:outer`, `F1:hole`, `F1:-x`, `F1:+x`.
 */
export function lyingTube(name: string, outer: number, inner: number, length: number, segments = 48) {
  const built: Built = {
    positions: [],
    indices: [],
    triangleFaces: [],
    names: ['F1:outer', 'F1:hole', 'F1:-x', 'F1:+x'],
    normals: [undefined, undefined, [-1, 0, 0], [1, 0, 0]],
    cylinders: [{ origin: [0, 0, outer], axis: [1, 0, 0], radius: outer }, { origin: [0, 0, outer], axis: [1, 0, 0], radius: inner }],
  };
  // Rings: outer at x=0, outer at x=length, inner at x=0, inner at x=length; angle 0 points down.
  const ring = (radius: number, x: number) => {
    const start = built.positions.length / 3;
    for (let i = 0; i < segments; i += 1) {
      const angle = (i * 2 * Math.PI) / segments;
      built.positions.push(x, radius * Math.sin(angle), outer - radius * Math.cos(angle));
    }
    return start;
  };
  const o0 = ring(outer, 0);
  const o1 = ring(outer, length);
  const i0 = ring(inner, 0);
  const i1 = ring(inner, length);
  const quad = (a: number, b: number, c: number, d: number, face: number) => {
    built.indices.push(a, b, c, a, c, d);
    built.triangleFaces.push(face, face);
  };
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    quad(o0 + i, o0 + j, o1 + j, o1 + i, 0); // outside, normals away from the axis
    quad(i0 + i, i1 + i, i1 + j, i0 + j, 1); // the hole, normals towards the axis
    quad(o0 + i, i0 + i, i0 + j, o0 + j, 2); // end at x=0, facing -x
    quad(o1 + i, o1 + j, i1 + j, i1 + i, 3); // end at x=length, facing +x
  }
  return finish(name, built);
}

/**
 * A prism along Y: the convex outline in the XZ plane (counter-clockwise seen from -y, i.e. with
 * X right and Z up), `length` deep. Faces `F1:s0`, `F1:s1` … per outline edge, then `F1:-y`, `F1:+y`.
 */
export function prismBody(name: string, outline: readonly (readonly [number, number])[], length: number) {
  const n = outline.length;
  const built: Built = { positions: [], indices: [], triangleFaces: [], names: [], normals: [] };
  for (const [x, z] of outline) built.positions.push(x, 0, z);
  for (const [x, z] of outline) built.positions.push(x, length, z);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const face = built.names.length;
    built.names.push(`F1:s${String(i)}`);
    built.normals.push(undefined);
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
function ears(outline: readonly (readonly [number, number])[]): [number, number, number][] {
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
