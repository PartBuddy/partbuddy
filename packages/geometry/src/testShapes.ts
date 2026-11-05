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
      return { index, name: faceName, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], ...(planeNormal ? { planeNormal } : {}) };
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

/** A box body, one shell, faces `F1:-z` … `F1:-x`. */
export function boxBody(name: string, min: Point, max: Point) {
  return boxesBody(name, [[min, max]]);
}

/**
 * A tube lying along X on the bed: outer radius `outer`, a hole of radius `inner`, `length` long.
 * Faces: `F1:outer`, `F1:hole`, `F1:-x`, `F1:+x`.
 */
export function lyingTube(name: string, outer: number, inner: number, length: number, segments = 48) {
  const built: Built = { positions: [], indices: [], triangleFaces: [], names: ['F1:outer', 'F1:hole', 'F1:-x', 'F1:+x'], normals: [undefined, undefined, [-1, 0, 0], [1, 0, 0]] };
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
  for (let i = 1; i < n - 1; i += 1) {
    built.indices.push(0, i, i + 1);
    built.triangleFaces.push(front);
    built.indices.push(n, n + i + 1, n + i);
    built.triangleFaces.push(front + 1);
  }
  return finish(name, built);
}
