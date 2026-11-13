import { areaPaths, EndType, FillRule, inflatePaths, intersect, JoinType, union, type Path64, type Paths64 } from 'clipper2-ts';

/**
 * What stands, layer by layer, the way a slicer builds the part: a body is cut every `LAYER` mm, and
 * of each cut only that is carried which lies over carried material of the cut below, or reaches out
 * from it no further than the material's overhang angle allows. So being carried grows upwards at
 * that angle and no faster: a lip hanging from a shelf stands only where a cheek holds it, a stair
 * of steps that go out faster than they go up loses its footing step by step, and what begins in
 * the air is not carried whatever the angle of its faces. An overhang carries what is built on it
 * only where the caller says so (`carry`); the same cuts answer more than one such reading (`track`).
 *
 * The answer must not depend on where the part lies against the layers: besides the regular cuts
 * there is one just below and one just above every height the caller names (`events`: the top of an
 * overhang, where something begins), and the reach grows with the true height between two cuts.
 */

/** The height (mm) between two regular cuts: the usual layer. */
export const LAYER = 0.2;
/** Clipper works on whole numbers: tenths of a micrometre. */
const SCALE = 1e4;
/** How far (mm) beside carried material a point still counts as on it: the rim of a face lies on the outline itself. */
const ON = 0.02;
/** Half the width (mm) under which carried material counts as a point, not as an outline to grow from. */
const THIN = 3e-3;
/** How far (mm) below and above an event its two cuts lie. */
const BESIDE = 1e-3;
/** Cuts per block of the index that finds the edges of a cut. */
const BLOCK = 4;
/** How far (mm) the corners of triangles may lie off one plane to be one flat face. */
const FLAT = 2e-4;
/**
 * How far a corner of carried material may run ahead of its sides, in layers' reach: the corner of a
 * slope of three flat sides runs twice as fast as its faces, of four sides 1.4 times. A sharper
 * corner is cut square, so carried material never jumps a gap wider than this.
 */
const MITRE = 2.05;
/** Along the cut of a face, how far apart (mm) it is asked whether something is carried there, and how often at most. */
const STEP = 0.25;
const STEPS = 256;

/** Triangles on welded vertices. */
export interface Soup {
  count: number;
  vertices: number;
  x: (w: number) => number;
  y: (w: number) => number;
  z: (w: number) => number;
  at: (t: number, k: number) => number;
}

/** The outline of an overhang seen from above, to say that it carries (`Layers.shape`). */
export type Shape = Paths64;

/** One reading of what is carried: the angle from the bed up, and the overhangs said to carry. */
export interface Carried {
  /** How far (mm) the material just below a point of the surface is from carried material; 0 when it is carried. */
  gap: (x: number, y: number, z: number) => number;
  /**
   * The share of a face (three corners) that is not carried: cut by cut along the layers through
   * it, the length of its cut that does not lie on carried material.
   */
  hanging: (corners: readonly (readonly [number, number, number])[]) => number;
  /**
   * An overhang with its highest point at `z`: what is built on it is carried, and what goes on
   * from it within the angle. With `out`, only once the material has risen far enough for the
   * angle to reach that many mm.
   */
  carry: (z: number, shape: Shape, out?: number) => void;
}

export interface Layers {
  track: () => Carried;
  /** Rings as x, y per corner; what they wind round, either way, is the shape. */
  shape: (rings: readonly (readonly number[])[]) => Shape;
}

/** The number of sorted heights below `height`. */
function countBelow(heights: Float64Array, height: number): number {
  let [low, high] = [0, heights.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((heights[middle] ?? 0) < height) low = middle + 1;
    else high = middle;
  }
  return low;
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
export function layersOf({ count, vertices, x, y, z, at }: Soup, bedZ: number, grow: number, rough: Iterable<readonly [number, number]>, events: Iterable<number>): Layers | null {
  // Each triangle once, with the triangles on each of its edges.
  const once = new Map<number, number[]>();
  const onEdge = new Map<number, number[]>();
  const kept: number[] = [];
  let top = bedZ;
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
    top = Math.max(top, z(a), z(b), z(c));
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

  // The cuts: the regular ones, and one beside each event on either side. What begins less than
  // half a layer over the bed lies in the first layer, which stands as a whole.
  const heights: number[] = [];
  for (let k = 0; bedZ + (k + 0.5) * LAYER <= top + LAYER; k += 1) heights.push(bedZ + (k + 0.5) * LAYER);
  for (const event of events) for (const height of [event - BESIDE, event + BESIDE]) if (height > bedZ + LAYER / 2) heights.push(height);
  heights.sort((p, q) => p - q);
  const planes = Float64Array.from(heights.filter((height, i) => i === 0 || height - (heights[i - 1] ?? 0) > 1e-9));
  const planeOf = (k: number) => planes[k] ?? Infinity;
  /** The last cut below a height. */
  const below = (height: number) => Math.max(0, countBelow(planes, height - 1e-9) - 1);
  const isRough = new Uint8Array(planes.length + 1);
  for (const [low, high] of rough) {
    // From the first cut at or over the lower end to the first one over the upper end.
    const to = Math.min(planes.length, countBelow(planes, high + 1e-9));
    for (let k = countBelow(planes, low - 1e-9); k <= to; k += 1) isRough[k] = 1;
  }

  // Flat faces: triangles in one plane, joined over their edges. A cut passes through all the
  // triangles of the flat end of a long stair, but enters and leaves the face only through its
  // rim; so the cut is made of the rims of the flat faces, not of every triangle. A face grows from
  // its largest triangle, and takes in only what lies in that triangle's plane: the facets of a
  // fine cone turn a little each and are no flat face.
  const normal = new Float64Array(count * 3);
  const size = new Float64Array(count);
  for (const t of kept) {
    const [a, b, c] = [at(t, 0), at(t, 1), at(t, 2)];
    const n = [(y(b) - y(a)) * (z(c) - z(a)) - (z(b) - z(a)) * (y(c) - y(a)), (z(b) - z(a)) * (x(c) - x(a)) - (x(b) - x(a)) * (z(c) - z(a)), (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a))] as const;
    size[t] = Math.hypot(...n);
    if ((size[t] ?? 0) > 0) normal.set([n[0] / (size[t] ?? 1), n[1] / (size[t] ?? 1), n[2] / (size[t] ?? 1)], t * 3);
  }
  const face = new Int32Array(count).fill(-1);
  for (const seed of [...kept].sort((p, q) => (size[q] ?? 0) - (size[p] ?? 0))) {
    if ((face[seed] ?? 0) >= 0) continue;
    face[seed] = seed;
    if (!((size[seed] ?? 0) > 0)) continue;
    const [nx, ny, nz] = [normal[seed * 3] ?? 0, normal[seed * 3 + 1] ?? 0, normal[seed * 3 + 2] ?? 0];
    const offset = nx * x(at(seed, 0)) + ny * y(at(seed, 0)) + nz * z(at(seed, 0));
    const stack = [seed];
    while (stack.length > 0) {
      const t = stack.pop() ?? 0;
      for (let i = 0; i < 3; i += 1) {
        const [u, v] = [at(t, i), at(t, (i + 1) % 3)];
        const list = onEdge.get(u < v ? u * vertices + v : v * vertices + u) ?? [];
        if (list.length !== 4) continue;
        const other = list[0] === t ? (list[2] ?? 0) : (list[0] ?? 0);
        if ((face[other] ?? 0) >= 0 || nx * (normal[other * 3] ?? 0) + ny * (normal[other * 3 + 1] ?? 0) + nz * (normal[other * 3 + 2] ?? 0) < 0) continue;
        let flat = true;
        for (let j = 0; j < 3 && flat; j += 1) flat = Math.abs(nx * x(at(other, j)) + ny * y(at(other, j)) + nz * z(at(other, j)) - offset) <= FLAT;
        if (!flat) continue;
        face[other] = seed;
        stack.push(other);
      }
    }
  }
  // The rims: per edge and face on it the lower-numbered end, the other, the face, whether the face
  // walks it from the first to the second, and the first and the last cut through it.
  const rims: [a: number, b: number, face: number, forward: number, from: number, to: number][] = [];
  const blocks: number[][] = [];
  for (const [key, list] of onEdge) {
    if (list.length === 4 && face[list[0] ?? 0] === face[list[2] ?? 0]) continue;
    const a = Math.floor(key / vertices);
    const b = key % vertices;
    // A corner on a plane counts as above it: cut by the planes over the lower end, up to the upper end.
    const from = countBelow(planes, Math.min(z(a), z(b)) + 1e-12);
    const to = countBelow(planes, Math.max(z(a), z(b)) + 1e-12) - 1;
    if (to < from) continue;
    for (let i = 0; i < list.length; i += 2) {
      for (let block = Math.floor(from / BLOCK); block <= Math.floor(to / BLOCK); block += 1) (blocks[block] ??= []).push(rims.length);
      rims.push([a, b, face[list[i] ?? 0] ?? 0, list[i + 1] ?? 0, from, to]);
    }
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

  /** How far (in clipper's units, squared) a point is from the rim of an area, and whether it lies in it. */
  const place = (paths: Paths64, sx: number, sy: number, enough: number): [inside: boolean, least: number] => {
    let inside = false;
    let least = Infinity;
    for (const path of paths) {
      for (let i = 0, j = path.length - 1; i < path.length; j = i, i += 1) {
        const [a, b] = [path[i], path[j]];
        if (!a || !b) continue;
        const [dx, dy] = [b.x - a.x, b.y - a.y];
        const length = dx * dx + dy * dy;
        const s = length === 0 ? 0 : Math.max(0, Math.min(1, ((sx - a.x) * dx + (sy - a.y) * dy) / length));
        least = Math.min(least, (sx - a.x - s * dx) ** 2 + (sy - a.y - s * dy) ** 2);
        if (least <= enough) return [true, least];
        if (a.y > sy !== b.y > sy && sx < a.x + ((sy - a.y) * dx) / dy) inside = !inside;
      }
    }
    return [inside, least];
  };
  const on = (ON * SCALE) ** 2;

  // What the readings share: a cut that grows from the same carried cut below, with the same
  // overhangs carrying, is worked out once.
  const worked = new Map<number, { under: Paths64; more: readonly [Shape, number][]; whole: boolean; held: Paths64 }[]>();
  const none: readonly [Shape, number][] = [];

  const track = (): Carried => {
    // Per cut: whether all of it is carried, and if not, what of it is.
    const whole: boolean[] = [];
    const part: Paths64[] = [];
    const carriedIn = (k: number) => (whole[k] ? outline(k) : (part[k] ?? []));
    // Per cut what overhangs below it carry, with how far (mm) each has grown at the angle by then.
    const added = new Map<number, [Shape, number][]>();
    const cut = (upTo: number) => {
      for (let k = whole.length; k <= Math.min(upTo, planes.length - 1); k += 1) {
        // On the bed everything stands; over a cut that is carried, what only leans within the angle is too.
        if (k === 0 || (whole[k - 1] && !isRough[k])) {
          whole.push(true);
          continue;
        }
        const under = carriedIn(k - 1);
        const more = added.get(k) ?? none;
        const known = worked.get(k)?.find((entry) => entry.under === under && entry.more.length === more.length && entry.more.every(([shape, grown], i) => { const other = more[i]; return shape === other?.[0] && grown === other[1]; }));
        if (known) {
          whole.push(known.whole);
          if (!known.whole) part[k] = known.held;
          continue;
        }
        const body = outline(k);
        // All of the cut is carried when nothing of it is left over but the rounding of the cut, and
        // no piece of it is without any carried material: what begins in the air is small in its
        // first cut, but it is a piece of its own, and a sliver of it is no rounding.
        const all = (held: Paths64) => areaPaths(body) - areaPaths(held) <= 1 && body.every((path) => !path[0] || place(held, path[0].x, path[0].y, on)[0]);
        // Mitred, as a slope of flat sides grows: its corners run ahead of its faces, and no arcs pile up cut by cut.
        // What is thinner than a point (THIN on each side) carries nothing on: the first cut through
        // the edge of a keel is a sliver whose ends point anywhere, and mitred they would run ahead.
        const reaching = (paths: Paths64, by: number) => intersect(by * SCALE >= 1 ? inflatePaths(inflatePaths(paths, -THIN * SCALE, JoinType.Miter, EndType.Polygon, MITRE), (by + THIN) * SCALE, JoinType.Miter, EndType.Polygon, MITRE) : paths, body, FillRule.NonZero);
        let held = under.length > 0 && body.length > 0 ? reaching(under, grow * (planeOf(k) - planeOf(k - 1))) : [];
        // What an overhang below carries is added only where the angle has not reached already.
        for (const [shape, grown] of more) {
          if (body.length === 0 || all(held)) break;
          held = union(held, reaching(shape, grown), FillRule.NonZero);
        }
        whole.push(all(held));
        if (!whole[k]) part[k] = held;
        const list = worked.get(k);
        if (list) list.push({ under, more, whole: whole[k] ?? false, held });
        else worked.set(k, [{ under, more, whole: whole[k] ?? false, held }]);
      }
    };
    return {
      gap: (px, py, pz) => {
        const k = below(pz);
        cut(k);
        // The cut lies below the point; up to the point the material may have grown further.
        const near = (Math.abs(pz - planeOf(k)) * grow + ON) * SCALE;
        const [inside, least] = place(carriedIn(k), px * SCALE, py * SCALE, near * near);
        return inside ? 0 : (Math.sqrt(least) - near) / SCALE;
      },
      hanging: (corners) => {
        const [low, high] = [Math.min(...corners.map((corner) => corner[2])), Math.max(...corners.map((corner) => corner[2]))];
        const [from, to] = [countBelow(planes, low + 1e-12), countBelow(planes, high + 1e-12) - 1];
        let [all, free] = [0, 0];
        for (let k = from; k <= to; k += 1) {
          const plane = planeOf(k);
          // The cut of the face in this plane: between the two of its edges that pass through it.
          const ends: [number, number][] = [];
          for (let i = 0; i < 3; i += 1) {
            const [a, b] = [corners[i], corners[(i + 1) % 3]];
            if (!a || !b || a[2] >= plane === b[2] >= plane) continue;
            const s = (plane - a[2]) / (b[2] - a[2]);
            ends.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
          }
          const [start, end] = ends;
          if (!start || !end) continue;
          // Each cut stands for the heights halfway to the cuts beside it.
          const length = Math.hypot(end[0] - start[0], end[1] - start[1]) * (Math.min(high, (plane + planeOf(k + 1)) / 2) - Math.max(low, (plane + (planes[k - 1] ?? bedZ)) / 2));
          all += length;
          cut(k);
          const [mx, my] = [((start[0] + end[0]) / 2) * SCALE, ((start[1] + end[1]) / 2) * SCALE];
          // A cut carried as a whole carries the face, unless the face is not in it: just over where
          // something begins it is thinner than the cut can hold, and that hangs.
          if (whole[k] && place(outline(k), mx, my, on)[0]) continue;
          const steps = Math.max(1, Math.min(STEPS, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / STEP)));
          let off = 0;
          for (let i = 0; i < steps; i += 1) {
            const s = (i + 0.5) / steps;
            if (!place(carriedIn(k), (start[0] + s * (end[0] - start[0])) * SCALE, (start[1] + s * (end[1] - start[1])) * SCALE, on)[0]) off += 1;
          }
          free += (length * off) / steps;
        }
        if (all > 0) return free / all;
        // A face that lies between two cuts: asked at its middle.
        const middle = (axis: number) => ((corners[0]?.[axis] ?? 0) + (corners[1]?.[axis] ?? 0) + (corners[2]?.[axis] ?? 0)) / 3;
        const k = below(middle(2));
        cut(k);
        const near = (Math.abs(middle(2) - planeOf(k)) * grow + ON) * SCALE;
        return place(carriedIn(k), middle(0) * SCALE, middle(1) * SCALE, near * near)[0] ? 0 : 1;
      },
      carry: (height, shape, out = 0) => {
        // The first cut over the overhang, or over the height at which the angle has reached far enough.
        const k = out > 0 ? countBelow(planes, height + out / grow) : countBelow(planes, height + 1e-9);
        // A cut that is made already is not made again: patches come lowest first.
        if (k < whole.length || k >= planes.length) return;
        // From the overhang up to the cut the material goes on at the angle; one that carries late has only its own outline.
        const entry: [Shape, number] = [shape, out > 0 ? 0 : Math.max(0, planeOf(k) - height) * grow];
        const list = added.get(k);
        if (list) list.push(entry);
        else added.set(k, [entry]);
      },
    };
  };
  return {
    track,
    shape: (rings) => {
      const paths: Paths64 = rings.map((ring) => {
        const path: Path64 = [];
        for (let i = 0; i + 1 < ring.length; i += 2) path.push({ x: Math.round((ring[i] ?? 0) * SCALE), y: Math.round((ring[i + 1] ?? 0) * SCALE) });
        return path;
      });
      return union(paths, FillRule.NonZero);
    },
  };
}
