import { areaPaths, EndType, FillRule, inflatePaths, intersect, JoinType, union, type Path64, type Paths64 } from 'clipper2-ts';

/**
 * What stands, layer by layer, the way a slicer builds the part: a body is cut every `LAYER` mm, and
 * of each cut only that is carried which lies over carried material of the cut below, or reaches out
 * from it no further than the material's overhang angle allows. So being carried grows upwards at
 * that angle and no faster: a lip hanging from a shelf stands only where a cheek holds it, a stair
 * of steps that go out faster than they go up loses its footing step by step. An overhang that is
 * bridged carries what is built on it at once, a small one as soon as the material on it has risen
 * as far as the angle would have needed to reach it (`carry`); one that is reported carries nothing.
 */

/** The height (mm) of one cut: the usual layer. */
export const LAYER = 0.2;
/** Clipper works on whole numbers: tenths of a micrometre. */
const SCALE = 1e4;
/** How far (mm) beside carried material a point still counts as on it: the rim of a face lies on the outline itself. */
const ON = 0.02;
/** Cuts per block of the index that finds the triangles of a cut. */
const BLOCK = 4;

/** Triangles on welded vertices. */
export interface Soup {
  count: number;
  vertices: number;
  x: (w: number) => number;
  y: (w: number) => number;
  z: (w: number) => number;
  at: (t: number, k: number) => number;
}

export interface Layers {
  /** Whether the material just below a point of the surface is carried. */
  held: (x: number, y: number, z: number) => boolean;
  /**
   * Triangles of an overhang that holds, with their highest point at `z`, as x, y per corner: what
   * is built on them is carried, once it has risen far enough for the angle to reach `out` mm.
   */
  carry: (z: number, corners: readonly number[], out?: number) => void;
}

/**
 * The layers of a closed body on a bed at `bedZ`; `grow` is how far (mm) carried material may reach
 * out per mm of height. `steep` names the triangles that hang over further than that, `lows` the
 * heights where the surface has a lowest point that looks down: everywhere else a cut is carried as
 * a whole if the one below is, and is not worked out at all unless it is asked for.
 * Null for a surface that is not closed: it has no outline to cut.
 * shortcut: one missing triangle makes the body open, and the caller falls back to its flood along
 * the surface (a triangle that comes twice does not). Close the cut outlines over small gaps if
 * meshes with holes must be cut too.
 */
export function layersOf({ count, vertices, x, y, z, at }: Soup, bedZ: number, grow: number, steep: (t: number) => boolean, lows: readonly number[]): Layers | null {
  // Each triangle once, and closed: every edge is walked as often one way as the other.
  const once = new Map<number, number[]>();
  const net = new Map<number, number>();
  const planeOf = (k: number) => bedZ + (k + 0.5) * LAYER;
  /** The last cut below a height. */
  const below = (height: number) => Math.max(0, Math.floor((height - bedZ - 1e-3) / LAYER - 0.5));
  // Each triangle with the first and the last cut through it, found by blocks of cuts.
  const spans: [t: number, from: number, to: number][] = [];
  const blocks: number[][] = [];
  // The cuts with something below them that the angle alone does not carry.
  const rough: boolean[] = [];
  const roughen = (low: number, high: number) => {
    const to = Math.ceil((high - bedZ + 1e-6) / LAYER - 0.5);
    for (let k = Math.max(0, Math.ceil((low - bedZ - 1e-6) / LAYER - 0.5)); k <= to; k += 1) rough[k] = true;
  };
  for (let t = 0; t < count; t += 1) {
    const [a, b, c] = [at(t, 0), at(t, 1), at(t, 2)];
    if (a === b || b === c || c === a) continue;
    const lowest = Math.min(a, b, c);
    const [second, third] = lowest === a ? [b, c] : lowest === b ? [c, a] : [a, b];
    const thirds = once.get(lowest * vertices + second);
    if (thirds?.includes(third)) continue;
    if (thirds) thirds.push(third);
    else once.set(lowest * vertices + second, [third]);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = u < v ? u * vertices + v : v * vertices + u;
      net.set(key, (net.get(key) ?? 0) + (u < v ? 1 : -1));
    }
    const [low, high] = [Math.min(z(a), z(b), z(c)), Math.max(z(a), z(b), z(c))];
    if (steep(t)) roughen(low, high);
    const from = Math.max(0, Math.floor((low - bedZ) / LAYER - 0.5) + 1);
    const to = Math.floor((high - bedZ) / LAYER - 0.5);
    if (to < from) continue;
    for (let block = Math.floor(from / BLOCK); block <= Math.floor(to / BLOCK); block += 1) (blocks[block] ??= []).push(spans.length);
    spans.push([t, from, to]);
  }
  for (const value of net.values()) if (value !== 0) return null;
  for (const low of lows) roughen(low, low);

  const outlines = new Map<number, Paths64>();
  /** The outline of the body in one cut. A corner on the plane counts as above it, so the cut is closed. */
  const outline = (k: number): Paths64 => {
    const known = outlines.get(k);
    if (known) return known;
    const plane = planeOf(k);
    const points = new Map<number, { x: number; y: number }>();
    const next = new Map<number, number[]>();
    for (const span of blocks[Math.floor(k / BLOCK)] ?? []) {
      const [t, from, to] = spans[span] ?? [0, 1, 0];
      if (k < from || k > to) continue;
      // Round the triangle as seen from outside, the cut runs from the edge that dips under the
      // plane to the edge that rises through it: so the material lies to its left, however short it is.
      let start = -1;
      let end = -1;
      for (let i = 0; i < 3; i += 1) {
        const [u, v] = [at(t, i), at(t, (i + 1) % 3)];
        if (z(u) >= plane === z(v) >= plane) continue;
        const [a, b] = u < v ? [u, v] : [v, u];
        const key = a * vertices + b;
        if (!points.has(key)) {
          const s = (plane - z(a)) / (z(b) - z(a));
          points.set(key, { x: Math.round((x(a) + s * (x(b) - x(a))) * SCALE), y: Math.round((y(a) + s * (y(b) - y(a))) * SCALE) });
        }
        if (z(u) >= plane) start = key;
        else end = key;
      }
      if (start < 0 || end < 0) continue;
      const list = next.get(start);
      if (list) list.push(end);
      else next.set(start, [end]);
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

  // Per cut: whether all of it is carried, and if not, what of it is.
  const whole: boolean[] = [];
  const part: Paths64[] = [];
  const carriedIn = (k: number) => (whole[k] ? outline(k) : (part[k] ?? []));
  const added = new Map<number, Paths64>();
  const cut = (upTo: number) => {
    for (let k = whole.length; k <= upTo; k += 1) {
      // On the bed everything stands; over a cut that is carried, what only leans within the angle is too.
      if (k === 0 || (whole[k - 1] && !rough[k])) {
        whole.push(true);
        continue;
      }
      const body = outline(k);
      const under = carriedIn(k - 1);
      const all = (held: Paths64) => areaPaths(body) - areaPaths(held) <= 1e-4 * SCALE * SCALE;
      // Mitred, as a slope grows: its corners run ahead of its faces, and no arcs pile up cut by cut.
      let held = under.length > 0 && body.length > 0 ? intersect(inflatePaths(under, grow * LAYER * SCALE, JoinType.Miter, EndType.Polygon, 4), body, FillRule.NonZero) : [];
      // What an overhang below carries is added only where the angle has not reached already.
      const more = added.get(k);
      if (more && body.length > 0 && !all(held)) held = union(held, intersect(more, body, FillRule.NonZero), FillRule.NonZero);
      if (all(held)) {
        whole.push(true);
        continue;
      }
      whole.push(false);
      part[k] = held;
    }
  };

  return {
    held: (px, py, pz) => {
      const k = below(pz);
      cut(k);
      // The cut lies below the point; up to the point the material may have grown further.
      const near = (Math.abs(pz - planeOf(k)) * grow + ON) * SCALE;
      const [sx, sy] = [px * SCALE, py * SCALE];
      let inside = false;
      for (const path of carriedIn(k)) {
        for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
          const [a, b] = [path[i], path[j]];
          if (!a || !b) continue;
          const [dx, dy] = [b.x - a.x, b.y - a.y];
          const length = dx * dx + dy * dy;
          const s = length === 0 ? 0 : Math.max(0, Math.min(1, ((sx - a.x) * dx + (sy - a.y) * dy) / length));
          if ((sx - a.x - s * dx) ** 2 + (sy - a.y - s * dy) ** 2 <= near * near) return true;
          if (a.y > sy !== b.y > sy && sx < a.x + ((sy - a.y) * dx) / dy) inside = !inside;
        }
      }
      return inside;
    },
    carry: (height, corners, out = 0) => {
      const k = below(height) + 1 + Math.ceil(out / (grow * LAYER));
      // A cut that is made already is not made again: patches come lowest first.
      if (k < whole.length) return;
      const paths = added.get(k) ?? [];
      for (let i = 0; i + 5 < corners.length; i += 6) {
        const path: Path64 = [0, 2, 4].map((c) => ({ x: Math.round((corners[i + c] ?? 0) * SCALE), y: Math.round((corners[i + c + 1] ?? 0) * SCALE) }));
        const [a, b, c] = path;
        if (a && b && c && (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) path.reverse();
        paths.push(path);
      }
      added.set(k, paths);
    },
  };
}
