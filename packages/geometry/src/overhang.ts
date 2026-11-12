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
  // A profile without an angle is checked at the usual one, not with a limit nothing passes.
  const limit = Number.isFinite(support) ? support : OVERHANG_LIMITS.support;
  return { borderline: Math.max(0, limit - 10), support: limit };
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
/** Just inside each corner of a triangle: a point on the rim itself belongs to both sides of it. */
const CORNERS: [number, number, number][] = [[0.998, 0.001, 0.001], [0.001, 0.998, 0.001], [0.001, 0.001, 0.998]];
/** Directions a patch is tried to be bridged in, at most: those most of its anchors lie across. */
const DIRECTIONS = 6;
/** Two faces that turn less than this (rad) into each other are one curved surface, not an edge. */
const SMOOTH = Math.PI / 6;

/** A cell of a grid and the eight around it, the cell itself first. */
const AROUND: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Where a patch of overhang ends: an edge in plan, whether the patch hangs from it, and how far the overhang really runs past it. */
interface Rim {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  anchor: boolean;
  ease: number;
}

/**
 * Overhang triangles that are small, so that they need no support.
 *
 * A patch (overhang triangles joined by edges) hangs from its anchors: the rims where the surface
 * goes on downwards into material that stands (`standing`). A point of it holds when it lies within
 * `reach` (mm, across the bed) of an anchor, the way a ledge or a thread flank hangs from its wall,
 * or when it is bridged: across the patch, in the one direction the slicer would lay the bridge,
 * the nearest rim on both sides is an anchor and the two are no more than a span apart
 * (`BRIDGE_SPAN` under a flat ceiling, `arch` under the roof of a lying hole). The direction is taken
 * from the anchors themselves, so the answer does not turn with the part on the bed.
 *
 * What does not hold is reported, with the arm it hangs on back to its anchor: a ceiling, a wide
 * bridge, an arm, the lips beside a slot or a hole. The rest of the patch stays out, so a hole in a
 * long bridge reports the stubs beside it, not the bridge. A patch with no anchor starts in the air.
 */
function smallPatches(positions: ArrayLike<number>, index: ArrayLike<number>, down: ArrayLike<number>, isSupport: (t: number) => boolean, reach: number, arch: number, sinSupport: number, bedZ: number): Set<number> {
  const small = new Set<number>();
  const count = index.length / 3;
  let any = false;
  for (let t = 0; t < count && !any; t += 1) any = isSupport(t);
  if (!any) return small;

  // Render buffers repeat corners per face: weld them, so edges are shared between faces.
  const welded = new Map<string, number>();
  const wx: number[] = [];
  const wy: number[] = [];
  const wz: number[] = [];
  const corner = new Int32Array(index.length);
  for (let i = 0; i < index.length; i += 1) {
    const v = index[i] ?? 0;
    const [px, py, pz] = [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0];
    const key = `${String(Math.round(px / WELD))},${String(Math.round(py / WELD))},${String(Math.round(pz / WELD))}`;
    let w = welded.get(key);
    if (w === undefined) {
      w = wx.length;
      welded.set(key, w);
      wx.push(px);
      wy.push(py);
      wz.push(pz);
    }
    corner[i] = w;
  }
  const vertices = wx.length;
  const x = (w: number) => wx[w] ?? 0;
  const y = (w: number) => wy[w] ?? 0;
  const z = (w: number) => wz[w] ?? 0;
  const at = (t: number, k: number) => corner[t * 3 + k] ?? 0;

  // Every edge with the triangles on it and their third corner.
  const edgeKey = (a: number, b: number) => (a < b ? a * vertices + b : b * vertices + a);
  const edges = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = at(t, k);
      const b = at(t, (k + 1) % 3);
      if (a === b) continue;
      const id = edgeKey(a, b);
      const list = edges.get(id);
      if (list) list.push(t, at(t, (k + 2) % 3));
      else edges.set(id, [t, at(t, (k + 2) % 3)]);
    }
  }

  const standing = standingVertices({ count, vertices, x, y, z, at, down, isSupport, edges, reach, bedZ });

  const seen = new Uint8Array(count);
  for (let start = 0; start < count; start += 1) {
    if (seen[start] || !isSupport(start)) continue;
    // One patch: support triangles joined by edges, and the rims where it ends.
    const patch: number[] = [];
    const rims: Rim[] = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const t = queue.pop() ?? 0;
      patch.push(t);
      for (let k = 0; k < 3; k += 1) {
        const a = at(t, k);
        const b = at(t, (k + 1) % 3);
        const list = edges.get(edgeKey(a, b)) ?? [];
        for (let i = 0; i < list.length; i += 2) {
          const other = list[i] ?? 0;
          const third = list[i + 1] ?? 0;
          if (other === t) continue;
          if (isSupport(other)) {
            if (!seen[other]) {
              seen[other] = 1;
              queue.push(other);
            }
            continue;
          }
          // The neighbour goes on downwards from this edge to material that stands, or the edge
          // lies on the bed: the patch hangs from material here.
          const anchor = (z(third) < Math.min(z(a), z(b)) - WELD && standing(third)) || Math.max(z(a), z(b)) <= bedZ + BED_TOLERANCE;
          rims.push({ ax: x(a), ay: y(a), bx: x(b), by: y(b), anchor, ease: anchor ? easeOf(x(at(t, (k + 2) % 3)), y(at(t, (k + 2) % 3)), x(a), y(a), x(b), y(b), down[t] ?? 0, down[other] ?? 0, sinSupport) : 0 });
        }
      }
    }
    if (!rims.some((rim) => rim.anchor)) continue;
    for (const t of heldTriangles(patch, rims, { x, y, at, down, edges, edgeKey, reach, arch })) small.add(t);
  }
  return small;
}

/**
 * How far (mm) past a rim the overhang really runs on a curved surface. The mesh puts the rim on an
 * edge between two facets, the limit angle lies somewhere on the curve between their middles: a
 * hole of 20 segments would read up to a facet narrower than the same hole of 96.
 */
function easeOf(tx: number, ty: number, ax: number, ay: number, bx: number, by: number, downIn: number, downOut: number, sinSupport: number): number {
  const angleIn = Math.asin(Math.max(-1, Math.min(1, downIn)));
  const angleOut = Math.asin(Math.max(-1, Math.min(1, downOut)));
  const turn = angleIn - angleOut;
  if (!(turn > 1e-6) || turn > SMOOTH) return 0;
  const length = Math.hypot(bx - ax, by - ay);
  if (length === 0) return 0;
  // The facet's width in plan: from its far corner to the rim.
  const width = Math.abs((bx - ax) * (ty - ay) - (by - ay) * (tx - ax)) / length;
  const ease = (width * ((angleIn + angleOut) / 2 - Math.asin(sinSupport)) * sinSupport) / (turn * Math.max(downIn, 1e-6));
  return Math.max(-width, Math.min(width, ease));
}

interface Surface {
  count: number;
  vertices: number;
  x: (w: number) => number;
  y: (w: number) => number;
  z: (w: number) => number;
  at: (t: number, k: number) => number;
  down: ArrayLike<number>;
  isSupport: (t: number) => boolean;
  edges: Map<number, number[]>;
  reach: number;
  bedZ: number;
}

/**
 * Which vertices stand on something, found in one flood from the bed: upwards along the surface,
 * never down, and across overhang only as far as a small overhang reaches (a thread flank carries
 * the next turn, a shelf carries neither a lip at its tip nor a wall on it). A face that looks up stands when the
 * underside of the material straight below it does: the floor of a box, the back of a hook not.
 */
function standingVertices({ count, vertices, x, y, z, at, down, isSupport, edges, reach, bedZ }: Surface): (w: number) => boolean {
  // Per vertex: the vertices one edge away, and what the way there adds: the run in plan over overhang.
  const next: number[][] = Array.from({ length: vertices }, () => []);
  for (const [id, list] of edges) {
    const a = Math.floor(id / vertices);
    const b = id % vertices;
    let hanging = false;
    for (let i = 0; i < list.length; i += 2) hanging ||= isSupport(list[i] ?? 0);
    // Over overhang the way adds its run in plan; on sound surface it adds nothing (−1).
    const run = hanging ? Math.hypot(x(b) - x(a), y(b) - y(a)) : -1;
    next[a]?.push(b, run);
    next[b]?.push(a, run);
  }

  // Undersides in a grid in plan, to find the one straight below a face that looks up.
  const undersides: number[] = [];
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let t = 0; t < count; t += 1) {
    if (!((down[t] ?? 0) > 0)) continue;
    undersides.push(t);
    for (let k = 0; k < 3; k += 1) {
      minX = Math.min(minX, x(at(t, k)));
      maxX = Math.max(maxX, x(at(t, k)));
      minY = Math.min(minY, y(at(t, k)));
      maxY = Math.max(maxY, y(at(t, k)));
    }
  }
  const cell = Math.max(1e-3, Math.sqrt(((maxX - minX) * (maxY - minY)) / Math.max(1, undersides.length)) * 2);
  const columns = Math.max(1, Math.ceil((maxX - minX) / cell));
  const grid = new Map<number, number[]>();
  for (const t of undersides) {
    const xs = [x(at(t, 0)), x(at(t, 1)), x(at(t, 2))];
    const ys = [y(at(t, 0)), y(at(t, 1)), y(at(t, 2))];
    for (let i = Math.floor((Math.min(...xs) - minX) / cell); i <= Math.floor((Math.max(...xs) - minX) / cell); i += 1) {
      for (let j = Math.floor((Math.min(...ys) - minY) / cell); j <= Math.floor((Math.max(...ys) - minY) / cell); j += 1) {
        const list = grid.get(j * (columns + 1) + i);
        if (list) list.push(t);
        else grid.set(j * (columns + 1) + i, [t]);
      }
    }
  }
  // Turns of a thread lie over each other in plan: each cell from the top down, so a point finds
  // the underside below it without passing every turn.
  const lowest = (t: number) => Math.min(z(at(t, 0)), z(at(t, 1)), z(at(t, 2)));
  let tallest = 0;
  for (const t of undersides) tallest = Math.max(tallest, Math.max(z(at(t, 0)), z(at(t, 1)), z(at(t, 2))) - lowest(t));
  for (const list of grid.values()) list.sort((a, b) => lowest(b) - lowest(a));
  /** The underside straight below a point, the highest one, or −1. */
  const below = (px: number, py: number, pz: number): number => {
    let found = -1;
    let height = -Infinity;
    const list = grid.get(Math.floor((py - minY) / cell) * (columns + 1) + Math.floor((px - minX) / cell)) ?? [];
    // The first that does not begin above the point.
    let from = 0;
    for (let to = list.length; from < to; ) {
      const middle = (from + to) >> 1;
      if (lowest(list[middle] ?? 0) > pz) from = middle + 1;
      else to = middle;
    }
    for (let i = from; i < list.length; i += 1) {
      const t = list[i] ?? 0;
      const [az, bz, cz] = [z(at(t, 0)), z(at(t, 1)), z(at(t, 2))];
      // Nothing further down reaches up to the best so far.
      if (Math.min(az, bz, cz) + tallest < height) break;
      const [ax, ay, bx, by, cx, cy] = [x(at(t, 0)), y(at(t, 0)), x(at(t, 1)), y(at(t, 1)), x(at(t, 2)), y(at(t, 2))];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0) continue;
      const u = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) / area;
      const v = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / area;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const pointZ = az + u * (bz - az) + v * (cz - az);
      if (pointZ < pz - WELD && pointZ > height) {
        height = pointZ;
        found = t;
      }
    }
    return found;
  };
  // Per underside the faces that look up above it, and per vertex the undersides that wait for it.
  const above = new Map<number, number[]>();
  const waiting = new Map<number, number[]>();
  for (let t = 0; t < count; t += 1) {
    if (!((down[t] ?? 0) < -UP)) continue;
    const under = below((x(at(t, 0)) + x(at(t, 1)) + x(at(t, 2))) / 3, (y(at(t, 0)) + y(at(t, 1)) + y(at(t, 2))) / 3, (z(at(t, 0)) + z(at(t, 1)) + z(at(t, 2))) / 3);
    if (under < 0) continue;
    const list = above.get(under);
    if (list) list.push(t);
    else {
      above.set(under, [t]);
      for (let k = 0; k < 3; k += 1) {
        const watchers = waiting.get(at(under, k));
        if (watchers) watchers.push(under);
        else waiting.set(at(under, k), [under]);
      }
    }
  }

  // The flood. `run` is how far over overhang the way from standing material to a vertex leads.
  const run = new Float64Array(vertices).fill(Infinity);
  const queue: number[] = [];
  const reached = (w: number, value: number) => {
    if (value > reach + WELD || value >= (run[w] ?? Infinity) - 1e-9) return;
    run[w] = value;
    queue.push(w);
  };
  for (let w = 0; w < vertices; w += 1) if (z(w) <= bedZ + BED_TOLERANCE) reached(w, 0);
  for (let head = 0; head < queue.length; head += 1) {
    const w = queue[head] ?? 0;
    const list = next[w] ?? [];
    for (let i = 0; i < list.length; i += 2) {
      const n = list[i] ?? 0;
      if (z(n) < z(w) - WELD) continue;
      const over = list[i + 1] ?? 0;
      // A small overhang that holds carries what rises from it: a step on a step on a step.
      reached(n, over >= 0 ? (run[w] ?? 0) + over : z(n) > z(w) + WELD ? 0 : (run[w] ?? 0));
    }
    for (const under of waiting.get(w) ?? []) {
      if (!Number.isFinite(run[at(under, 0)]) || !Number.isFinite(run[at(under, 1)]) || !Number.isFinite(run[at(under, 2)])) continue;
      for (const t of above.get(under) ?? []) for (let k = 0; k < 3; k += 1) reached(at(t, k), 0);
      above.delete(under);
    }
  }
  return (w) => Number.isFinite(run[w]);
}

interface PatchSurface {
  x: (w: number) => number;
  y: (w: number) => number;
  at: (t: number, k: number) => number;
  down: ArrayLike<number>;
  edges: Map<number, number[]>;
  edgeKey: (a: number, b: number) => number;
  reach: number;
  arch: number;
}

/** The triangles of one patch that hold: near an anchor, or bridged in the patch's one direction. */
function heldTriangles(patch: readonly number[], rims: readonly Rim[], { x, y, at, down, edges, edgeKey, reach, arch }: PatchSurface): number[] {
  // The rims in grids in plan: what a point can hang from lies in the cells around it. The anchors
  // in cells as wide as a small overhang reaches, all rims in cells a bridge span wide.
  const gridOf = (cell: number, wanted: (rim: Rim) => boolean) => {
    const cells = new Map<number, Rim[]>();
    const cellOf = (value: number) => Math.floor(value / cell) + 32768;
    for (const rim of rims) {
      if (!wanted(rim)) continue;
      for (let i = cellOf(Math.min(rim.ax, rim.bx)); i <= cellOf(Math.max(rim.ax, rim.bx)); i += 1) {
        for (let j = cellOf(Math.min(rim.ay, rim.by)); j <= cellOf(Math.max(rim.ay, rim.by)); j += 1) {
          const list = cells.get(i * 65536 + j);
          if (list) list.push(rim);
          else cells.set(i * 65536 + j, [rim]);
        }
      }
    }
    /** The rims in the cells around a point, until `found` says it has what it looked for. */
    return (px: number, py: number, found: (rim: Rim) => boolean): boolean => {
      // The point's own cell first: what is nearest is most likely there.
      for (const [di, dj] of AROUND) {
        for (const rim of cells.get((cellOf(px) + di) * 65536 + cellOf(py) + dj) ?? []) if (found(rim)) return true;
      }
      return false;
    };
  };
  const anchorsAround = gridOf(reach, (rim) => rim.anchor);
  const rimsAround = gridOf(BRIDGE_SPAN, () => true);
  const near = (px: number, py: number) =>
    anchorsAround(px, py, (rim) => {
      const dx = rim.bx - rim.ax;
      const dy = rim.by - rim.ay;
      const length = dx * dx + dy * dy;
      const s = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - rim.ax) * dx + (py - rim.ay) * dy) / length));
      return Math.hypot(px - rim.ax - s * dx, py - rim.ay - s * dy) <= reach;
    });
  // Along a line through the point the patch ends at the nearest rim ahead and behind. A bridge has
  // an anchor at both; a free edge or a hole on the way makes that side an arm.
  const bridged = (px: number, py: number, dx: number, dy: number, span: number) => {
    const ends = [
      { at: Infinity, free: false, ease: 0 },
      { at: Infinity, free: false, ease: 0 },
    ];
    rimsAround(px, py, (rim) => {
      const ex = rim.bx - rim.ax;
      const ey = rim.by - rim.ay;
      const cross = dx * ey - dy * ex;
      if (Math.abs(cross) < 1e-9 * Math.hypot(ex, ey)) return false;
      const s = ((rim.ax - px) * dy - (rim.ay - py) * dx) / cross;
      if (s < -1e-6 || s > 1 + 1e-6) return false;
      const along = ((rim.ax - px) * ey - (rim.ay - py) * ex) / cross;
      const end = ends[along >= 0 ? 0 : 1];
      if (!end) return false;
      const distance = Math.abs(along);
      // Two rims met at one point: a free one among them decides.
      if (Math.abs(distance - end.at) <= WELD) end.free ||= !rim.anchor;
      else if (distance < end.at) {
        end.at = distance;
        end.free = !rim.anchor;
        end.ease = rim.ease;
      }
      return false;
    });
    const [ahead, behind] = ends;
    return ahead !== undefined && behind !== undefined && !ahead.free && !behind.free && ahead.at + ahead.ease + behind.at + behind.ease <= span + WELD;
  };

  // The directions most of the anchors lie across, by their length: a bridge spans from anchor to anchor.
  const bins = new Map<number, [number, number, number]>();
  for (const rim of rims) {
    if (!rim.anchor) continue;
    const length = Math.hypot(rim.bx - rim.ax, rim.by - rim.ay);
    if (length === 0) continue;
    const angle = Math.atan2(rim.by - rim.ay, rim.bx - rim.ax);
    const turned = ((angle % Math.PI) + Math.PI) % Math.PI;
    const bin = bins.get(Math.floor((turned * 180) / Math.PI)) ?? [0, 0, 0];
    bins.set(Math.floor((turned * 180) / Math.PI), [bin[0] + length, bin[1] + length * Math.cos(2 * angle), bin[2] + length * Math.sin(2 * angle)]);
  }
  const directions = [...bins.values()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, DIRECTIONS)
    .map(([, cos, sin]): [number, number] => {
      const along = Math.atan2(sin, cos) / 2;
      return [-Math.sin(along), Math.cos(along)];
    });

  // A patch that is flat over a third of its width or more is a ceiling with rounded or chamfered
  // sides; one that is curved nearly all the way is the roof of a hole, and the few flat facets at
  // its top (a fifth of a round roof) are part of the arch.
  const planOf = (t: number) => Math.abs((x(at(t, 1)) - x(at(t, 0))) * (y(at(t, 2)) - y(at(t, 0))) - (y(at(t, 1)) - y(at(t, 0))) * (x(at(t, 2)) - x(at(t, 0)))) / 2;
  const ceiling = patch.reduce((sum, t) => sum + ((down[t] ?? 0) > LEVEL ? 2 * planOf(t) : -planOf(t)), 0) >= 0;
  /** The points of a triangle in plan, and the span a bridge under it may have. */
  const sampled = (t: number) => {
    const [a, b, c] = [at(t, 0), at(t, 1), at(t, 2)];
    const plan = planOf(t);
    const points = [...spread(Math.ceil(plan / (reach / 2) ** 2)), ...CORNERS].map(([wa, wb, wc]): [number, number] => [wa * x(a) + wb * x(b) + wc * x(c), wa * y(a) + wb * y(b) + wc * y(c)]);
    return { plan, points, span: ceiling && (down[t] ?? 0) > LEVEL ? BRIDGE_SPAN : arch };
  };
  // Per triangle: whether all of it lies near an anchor, and in which directions it does not hold.
  const nearAll = new Map<number, boolean>();
  const fails = new Map<number, boolean[]>();
  const lost = directions.map(() => 0);
  let lostNear = 0;
  for (const t of patch) {
    const { plan, points, span } = sampled(t);
    let allNear = true;
    const failing = directions.map(() => false);
    for (const [px, py] of points) {
      if (near(px, py)) continue;
      allNear = false;
      directions.forEach(([dx, dy], d) => {
        if (!failing[d] && !bridged(px, py, dx, dy, span)) failing[d] = true;
      });
    }
    nearAll.set(t, allNear);
    fails.set(t, failing);
    failing.forEach((failed, d) => {
      if (failed) lost[d] = (lost[d] ?? 0) + plan;
    });
    if (!allNear) lostNear += plan;
  }
  // The one direction that leaves the least hanging; a patch with no direction holds only near its anchors.
  const best = lost.indexOf(Math.min(...lost));
  const direction = directions[best];
  const failed = (t: number) => (direction ? (fails.get(t)?.[best] ?? false) : !(nearAll.get(t) ?? false));
  if (direction ? (lost[best] ?? 0) === 0 : lostNear === 0) return [...patch];

  // What fails, and the arm it hangs on: the triangles next to it that lie near an anchor but are
  // no part of a bridge themselves.
  const inPatch = new Set(patch);
  const hanging = new Set(patch.filter(failed));
  const stack = [...hanging];
  while (stack.length > 0) {
    const t = stack.pop() ?? 0;
    for (let k = 0; k < 3; k += 1) {
      const list = edges.get(edgeKey(at(t, k), at(t, (k + 1) % 3))) ?? [];
      for (let i = 0; i < list.length; i += 2) {
        const other = list[i] ?? 0;
        if (!inPatch.has(other) || hanging.has(other) || !(nearAll.get(other) ?? false)) continue;
        const { points, span } = sampled(other);
        if (direction && points.every(([px, py]) => bridged(px, py, direction[0], direction[1], span))) continue;
        hanging.add(other);
        stack.push(other);
      }
    }
  }
  return patch.filter((t) => !hanging.has(t));
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
  // How much each triangle points down (−z of its unit normal).
  const down = new Float64Array(index.length / 3);
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
    down[i / 3] = length === 0 ? 0 : -nz / length;
    triangles.push({ kind: length === 0 ? Overhang.Fine : onBed(face) ? Overhang.Bed : classOf(-nz / length), face, area: length / 2 });
  }
  // The roof of a lying hole overhangs between the two lines where its wall passes the limit.
  const sinSupport = Math.sin(((limits.support + ANGLE_TOLERANCE) * Math.PI) / 180);
  const small = reach > 0 ? smallPatches(positions, index, down, (t) => triangles[t]?.kind === Overhang.Support, reach, LYING_HOLE * sinSupport, sinSupport, bedZ) : new Set<number>();
  triangles.forEach(({ kind, face, area: size }, t) => {
    const counted = small.has(t) ? Overhang.Borderline : kind;
    area[counted] += size;
    if (counted === Overhang.Support) supportByFace[face] = (supportByFace[face] ?? 0) + size;
  });
  return { vertices, area, supportByFace };
}
