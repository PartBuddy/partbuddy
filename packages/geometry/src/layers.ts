import { EndType, FillRule, inflatePaths, intersect, JoinType, union, type Path64, type Paths64 } from 'clipper2-ts';

/**
 * What stands, layer by layer, the way a slicer builds the part: a body is cut every `LAYER` mm, and
 * of each cut only that is carried which lies over carried material of the cut below, or reaches out
 * from it no further than the material's overhang angle allows. So being carried grows upwards at
 * that angle and no faster: a lip hanging from a shelf stands only where a cheek holds it, a stair
 * of steps that go out faster than they go up loses its footing step by step. An overhang that is
 * bridged carries what is built on it (`bridge`); one that is small, or reported, carries no more
 * than the angle gives.
 */

/** The height (mm) of one cut: the usual layer. */
export const LAYER = 0.2;
/** Clipper works on whole numbers: tenths of a micrometre. */
const SCALE = 1e4;
/** How far (mm) beside carried material a point still counts as on it: the rim of a face lies on the outline itself. */
const ON = 0.02;

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
  /** Triangles of a bridge with their highest point at `z`, as x, y per corner: what is built on them is carried. */
  bridge: (z: number, corners: readonly number[]) => void;
}

/**
 * The layers of a closed body on a bed at `bedZ`; `grow` is how far (mm) carried material may reach
 * out per mm of height. Null for a surface that is not closed: it has no outline to cut.
 * Layers are cut as they are asked for, from the bed up.
 */
export function layersOf({ count, vertices, x, y, z, at }: Soup, bedZ: number, grow: number): Layers | null {
  // Closed: every edge is walked as often one way as the other.
  const net = new Map<number, number>();
  for (let t = 0; t < count; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = at(t, k);
      const b = at(t, (k + 1) % 3);
      if (a === b) continue;
      const key = a < b ? a * vertices + b : b * vertices + a;
      net.set(key, (net.get(key) ?? 0) + (a < b ? 1 : -1));
    }
  }
  for (const value of net.values()) if (value !== 0) return null;

  const planeOf = (k: number) => bedZ + (k + 0.5) * LAYER;
  /** The last cut below a height. */
  const below = (height: number) => Math.max(0, Math.floor((height - bedZ - 1e-3) / LAYER - 0.5));
  // Each triangle with the first and the last cut through it, in the order the cuts reach them.
  const spans: { t: number; from: number; to: number }[] = [];
  for (let t = 0; t < count; t += 1) {
    const [za, zb, zc] = [z(at(t, 0)), z(at(t, 1)), z(at(t, 2))];
    const from = Math.floor((Math.min(za, zb, zc) - bedZ) / LAYER - 0.5) + 1;
    const to = Math.floor((Math.max(za, zb, zc) - bedZ) / LAYER - 0.5);
    if (to >= Math.max(0, from)) spans.push({ t, from: Math.max(0, from), to });
  }
  spans.sort((a, b) => a.from - b.from);
  let reached = 0;
  let active: { t: number; from: number; to: number }[] = [];

  /** The outline of the body in one cut. A corner on the plane counts as above it, so the cut is closed. */
  const outline = (k: number): Paths64 => {
    const plane = planeOf(k);
    while (reached < spans.length && (spans[reached]?.from ?? Infinity) <= k) {
      const span = spans[reached];
      if (span) active.push(span);
      reached += 1;
    }
    active = active.filter((span) => span.to >= k);
    const points = new Map<number, { x: number; y: number }>();
    const next = new Map<number, number[]>();
    for (const { t } of active) {
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
    return paths.length > 0 ? union(paths, FillRule.NonZero) : [];
  };

  const carried: Paths64[] = [];
  const bridges = new Map<number, Paths64>();
  const cut = (upTo: number) => {
    while (carried.length <= upTo) {
      const k = carried.length;
      const body = outline(k);
      const under = carried[k - 1];
      let held = !under ? body : under.length > 0 && body.length > 0 ? intersect(inflatePaths(under, grow * LAYER * SCALE, JoinType.Round, EndType.Polygon, 2, ON * SCALE), body, FillRule.NonZero) : [];
      const bridged = bridges.get(k);
      if (bridged && body.length > 0) held = union(held, intersect(bridged, body, FillRule.NonZero), FillRule.NonZero);
      carried.push(held);
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
      for (const path of carried[k] ?? []) {
        for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
          const [a, b] = [path[i], path[j]];
          if (!a || !b) continue;
          const [dx, dy] = [b.x - a.x, b.y - a.y];
          const length = dx * dx + dy * dy;
          const s = length === 0 ? 0 : Math.max(0, Math.min(1, ((sx - a.x) * dx + (sy - a.y) * dy) / length));
          if (Math.hypot(sx - a.x - s * dx, sy - a.y - s * dy) <= near) return true;
          if (a.y > sy !== b.y > sy && sx < a.x + ((sy - a.y) * dx) / dy) inside = !inside;
        }
      }
      return inside;
    },
    bridge: (height, corners) => {
      const k = below(height) + 1;
      // A cut that is made already is not made again: patches come lowest first.
      if (k < carried.length) return;
      const paths = bridges.get(k) ?? [];
      for (let i = 0; i + 5 < corners.length; i += 6) {
        const path: Path64 = [0, 2, 4].map((c) => ({ x: Math.round((corners[i + c] ?? 0) * SCALE), y: Math.round((corners[i + c + 1] ?? 0) * SCALE) }));
        const [a, b, c] = path;
        if (a && b && c && (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) path.reverse();
        paths.push(path);
      }
      bridges.set(k, paths);
    },
  };
}
