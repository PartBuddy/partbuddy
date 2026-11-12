import { areaPaths, EndType, FillRule, inflatePaths, intersect, JoinType, union, type Path64, type Paths64 } from 'clipper2-ts';

/**
 * What stands, layer by layer, the way a slicer builds the part: a body is cut every `LAYER` mm, and
 * of each cut only that is carried which lies over carried material of the cut below, or reaches out
 * from it no further than the material's overhang angle allows. So being carried grows upwards at
 * that angle and no faster: a lip hanging from a shelf stands only where a cheek holds it, a stair
 * of steps that go out faster than they go up loses its footing step by step, and what begins in
 * the air is not carried whatever the angle of its faces. An overhang carries what is built on it
 * only where the caller says so (`carry`); the same cuts answer more than one such reading (`track`).
 */

/** The height (mm) of one cut: the usual layer. */
export const LAYER = 0.2;
/** Clipper works on whole numbers: tenths of a micrometre. */
const SCALE = 1e4;
/** How far (mm) beside carried material a point still counts as on it: the rim of a face lies on the outline itself. */
const ON = 0.02;
/** Cuts per block of the index that finds the edges of a cut. */
const BLOCK = 4;
/**
 * How far a corner of carried material may run ahead of its sides, in layers' reach: the corner of a
 * slope of three flat sides runs twice as fast as its faces, of four sides 1.4 times. A sharper
 * corner is cut square, so carried material never jumps a gap wider than this.
 */
const MITRE = 2.05;

/** Triangles on welded vertices. */
export interface Soup {
  count: number;
  vertices: number;
  x: (w: number) => number;
  y: (w: number) => number;
  z: (w: number) => number;
  at: (t: number, k: number) => number;
}

/** One reading of what is carried: the angle from the bed up, and the overhangs said to carry. */
export interface Carried {
  /** How far (mm) the material just below a point of the surface is from carried material; 0 when it is carried. */
  gap: (x: number, y: number, z: number) => number;
  /**
   * Triangles of an overhang with their highest point at `z`, as x, y per corner: what is built on
   * them is carried, and what goes on from them within the angle. With `out`, only once the material
   * has risen far enough for the angle to reach that many mm.
   */
  carry: (z: number, corners: readonly number[], out?: number) => void;
}

export interface Layers {
  track: () => Carried;
}

/**
 * The layers of a closed body on a bed at `bedZ`; `grow` is how far (mm) carried material may reach
 * out per mm of height. `rough` names the heights (from, to) where the angle alone does not say that
 * a cut is carried as the one below: faces that hang over further, ridges that run out faster, and
 * the lowest points of faces that look down. Everywhere else a cut is carried as a whole if the one
 * below is, and is not worked out at all unless it is asked for.
 * Null for a surface that is not closed: it has no outline to cut.
 * shortcut: one missing triangle makes the body open, and the caller falls back to its flood along
 * the surface (a triangle that comes twice does not). Close the cut outlines over small gaps if
 * meshes with holes must be cut too.
 */
export function layersOf({ count, vertices, x, y, z, at }: Soup, bedZ: number, grow: number, rough: Iterable<readonly [number, number]>): Layers | null {
  const planeOf = (k: number) => bedZ + (k + 0.5) * LAYER;
  /** The last cut below a height. */
  const below = (height: number) => Math.max(0, Math.floor((height - bedZ - 1e-3) / LAYER - 0.5));

  // Each triangle once, with the triangles on each of its edges.
  const once = new Map<number, number[]>();
  const onEdge = new Map<number, number[]>();
  const kept: number[] = [];
  for (let t = 0; t < count; t += 1) {
    const [a, b, c] = [at(t, 0), at(t, 1), at(t, 2)];
    if (a === b || b === c || c === a) continue;
    const lowest = Math.min(a, b, c);
    const [second, third] = lowest === a ? [b, c] : lowest === b ? [c, a] : [a, b];
    const thirds = once.get(lowest * vertices + second);
    if (thirds?.includes(third)) continue;
    if (thirds) thirds.push(third);
    else once.set(lowest * vertices + second, [third]);
    kept.push(t);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = u < v ? u * vertices + v : v * vertices + u;
      const list = onEdge.get(key);
      // The triangle, and whether it walks the edge from its lower-numbered end.
      if (list) list.push(t, u < v ? 1 : 0);
      else onEdge.set(key, [t, u < v ? 1 : 0]);
    }
  }
  // Closed: every edge is walked as often one way as the other.
  for (const list of onEdge.values()) {
    let net = 0;
    for (let i = 1; i < list.length; i += 2) net += list[i] ? 1 : -1;
    if (net !== 0) return null;
  }

  // Flat faces: triangles in one plane, joined over their edges. A cut passes through all the
  // triangles of the flat end of a long stair, but enters and leaves the face only through its
  // rim; so the cut is made of the rims of the flat faces, not of every triangle.
  const normal = new Float64Array(count * 3);
  for (const t of kept) {
    const [a, b, c] = [at(t, 0), at(t, 1), at(t, 2)];
    const n = [(y(b) - y(a)) * (z(c) - z(a)) - (z(b) - z(a)) * (y(c) - y(a)), (z(b) - z(a)) * (x(c) - x(a)) - (x(b) - x(a)) * (z(c) - z(a)), (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a))] as const;
    const length = Math.hypot(...n);
    if (length > 0) normal.set([n[0] / length, n[1] / length, n[2] / length], t * 3);
  }
  const inPlane = (s: number, t: number) => (normal[s * 3] ?? 0) * (normal[t * 3] ?? 0) + (normal[s * 3 + 1] ?? 0) * (normal[t * 3 + 1] ?? 0) + (normal[s * 3 + 2] ?? 0) * (normal[t * 3 + 2] ?? 0) > 1 - 1e-6;
  const face = new Int32Array(count).fill(-1);
  const find = (t: number): number => {
    let root = t;
    while ((face[root] ?? -1) >= 0) root = face[root] ?? 0;
    while (t !== root) {
      const up = face[t] ?? 0;
      face[t] = root;
      t = up;
    }
    return root;
  };
  for (const list of onEdge.values()) {
    if (list.length !== 4 || !inPlane(list[0] ?? 0, list[2] ?? 0)) continue;
    const [p, q] = [find(list[0] ?? 0), find(list[2] ?? 0)];
    if (p !== q) face[p] = q;
  }
  // The rims: per edge and face on it the lower-numbered end, the other, the face, whether the face
  // walks it from the first to the second, and the first and the last cut through it.
  const rims: [a: number, b: number, face: number, forward: number, from: number, to: number][] = [];
  const blocks: number[][] = [];
  for (const [key, list] of onEdge) {
    if (list.length === 4 && find(list[0] ?? 0) === find(list[2] ?? 0)) continue;
    const a = Math.floor(key / vertices);
    const b = key % vertices;
    const from = Math.max(0, Math.floor((Math.min(z(a), z(b)) - bedZ) / LAYER - 0.5) + 1);
    const to = Math.floor((Math.max(z(a), z(b)) - bedZ) / LAYER - 0.5);
    if (to < from) continue;
    for (let i = 0; i < list.length; i += 2) {
      for (let block = Math.floor(from / BLOCK); block <= Math.floor(to / BLOCK); block += 1) (blocks[block] ??= []).push(rims.length);
      rims.push([a, b, find(list[i] ?? 0), list[i + 1] ?? 0, from, to]);
    }
  }
  const isRough: boolean[] = [];
  for (const [low, high] of rough) {
    const to = Math.ceil((high - bedZ + 1e-6) / LAYER - 0.5);
    for (let k = Math.max(0, Math.ceil((low - bedZ - 1e-6) / LAYER - 0.5)); k <= to; k += 1) isRough[k] = true;
  }

  const outlines = new Map<number, Paths64>();
  /** The outline of the body in one cut. A corner on the plane counts as above it, so the cut is closed. */
  const outline = (k: number): Paths64 => {
    const known = outlines.get(k);
    if (known) return known;
    const plane = planeOf(k);
    const points = new Map<number, { x: number; y: number }>();
    // Per face the edges where its rim dips under the plane, and where it rises through it.
    const crossed = new Map<number, [dips: number[], rises: number[]]>();
    for (const rim of blocks[Math.floor(k / BLOCK)] ?? []) {
      const [a, b, f, forward, from, to] = rims[rim] ?? [0, 0, 0, 0, 1, 0];
      if (k < from || k > to || z(a) >= plane === z(b) >= plane) continue;
      const key = a * vertices + b;
      if (!points.has(key)) {
        const s = (plane - z(a)) / (z(b) - z(a));
        points.set(key, { x: Math.round((x(a) + s * (x(b) - x(a))) * SCALE), y: Math.round((y(a) + s * (y(b) - y(a))) * SCALE) });
      }
      const sides = crossed.get(f) ?? [[], []];
      if (sides[0].length + sides[1].length === 0) crossed.set(f, sides);
      // Walked as the face walks it, the edge dips when it starts above the plane.
      sides[z(a) >= plane === (forward === 1) ? 0 : 1].push(key);
    }
    // Round a face as seen from outside, the cut runs from where the rim dips under the plane to
    // where it rises through it: so the material lies to its left, however short the cut is.
    const next = new Map<number, number[]>();
    for (const [f, [dips, rises]] of crossed) {
      if (dips.length > 1) {
        // A face that is cut more than once: along the cut (z × normal), each piece from a dip to the next rise.
        const along = (key: number) => (points.get(key)?.x ?? 0) * -(normal[f * 3 + 1] ?? 0) + (points.get(key)?.y ?? 0) * (normal[f * 3] ?? 0);
        dips.sort((p, q) => along(p) - along(q));
        rises.sort((p, q) => along(p) - along(q));
      }
      dips.forEach((start, i) => {
        const end = rises[i];
        if (end === undefined) return;
        const list = next.get(start);
        if (list) list.push(end);
        else next.set(start, [end]);
      });
    }
    const paths: Paths64 = [];
    for (const [start, list] of next) {
      while (list.length > 0) {
        const path: Path64 = [];
        let node = start;
        for (let out = next.get(node); out && out.length > 0; out = next.get(node)) {
          const point = points.get(node);
          if (point) path.push(point);
          node = out.pop() ?? start;
        }
        if (path.length >= 3) paths.push(path);
      }
    }
    const cut = paths.length > 0 ? union(paths, FillRule.NonZero) : [];
    outlines.set(k, cut);
    return cut;
  };

  const track = (): Carried => {
    // Per cut: whether all of it is carried, and if not, what of it is.
    const whole: boolean[] = [];
    const part: Paths64[] = [];
    const carriedIn = (k: number) => (whole[k] ? outline(k) : (part[k] ?? []));
    // Per cut what overhangs below it carry, with how far (mm) each has grown at the angle by then.
    const added = new Map<number, [paths: Paths64, grown: number][]>();
    const cut = (upTo: number) => {
      for (let k = whole.length; k <= upTo; k += 1) {
        // On the bed everything stands; over a cut that is carried, what only leans within the angle is too.
        if (k === 0 || (whole[k - 1] && !isRough[k])) {
          whole.push(true);
          continue;
        }
        const body = outline(k);
        const under = carriedIn(k - 1);
        const all = (held: Paths64) => areaPaths(body) - areaPaths(held) <= 1e-4 * SCALE * SCALE;
        // Mitred, as a slope of flat sides grows: its corners run ahead of its faces, and no arcs pile up cut by cut.
        const reaching = (paths: Paths64, by: number) => intersect(by > 0 ? inflatePaths(paths, by * SCALE, JoinType.Miter, EndType.Polygon, MITRE) : paths, body, FillRule.NonZero);
        let held = under.length > 0 && body.length > 0 ? reaching(under, grow * LAYER) : [];
        // What an overhang below carries is added only where the angle has not reached already.
        for (const [paths, grown] of added.get(k) ?? []) {
          if (body.length === 0 || all(held)) break;
          held = union(held, reaching(union(paths, FillRule.NonZero), grown), FillRule.NonZero);
        }
        whole.push(all(held));
        if (!whole[k]) part[k] = held;
      }
    };
    return {
      gap: (px, py, pz) => {
        const k = below(pz);
        cut(k);
        // The cut lies below the point; up to the point the material may have grown further.
        const near = (Math.abs(pz - planeOf(k)) * grow + ON) * SCALE;
        const [sx, sy] = [px * SCALE, py * SCALE];
        let inside = false;
        let least = Infinity;
        for (const path of carriedIn(k)) {
          for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
            const [a, b] = [path[i], path[j]];
            if (!a || !b) continue;
            const [dx, dy] = [b.x - a.x, b.y - a.y];
            const length = dx * dx + dy * dy;
            const s = length === 0 ? 0 : Math.max(0, Math.min(1, ((sx - a.x) * dx + (sy - a.y) * dy) / length));
            least = Math.min(least, (sx - a.x - s * dx) ** 2 + (sy - a.y - s * dy) ** 2);
            if (least <= near * near) return 0;
            if (a.y > sy !== b.y > sy && sx < a.x + ((sy - a.y) * dx) / dy) inside = !inside;
          }
        }
        return inside ? 0 : (Math.sqrt(least) - near) / SCALE;
      },
      carry: (height, corners, out = 0) => {
        const k = below(height) + 1 + Math.ceil(out / (grow * LAYER));
        // A cut that is made already is not made again: patches come lowest first.
        if (k < whole.length) return;
        const paths: Paths64 = [];
        for (let i = 0; i + 5 < corners.length; i += 6) {
          const path: Path64 = [0, 2, 4].map((c) => ({ x: Math.round((corners[i + c] ?? 0) * SCALE), y: Math.round((corners[i + c + 1] ?? 0) * SCALE) }));
          const [a, b, c] = path;
          if (a && b && c && (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) path.reverse();
          paths.push(path);
        }
        // From the overhang up to the cut the material goes on at the angle; one that carries late has only its own outline.
        const entry: [Paths64, number] = [paths, out > 0 ? 0 : Math.max(0, planeOf(k) - height) * grow];
        const list = added.get(k);
        if (list) list.push(entry);
        else added.set(k, [entry]);
      },
    };
  };
  return { track };
}
