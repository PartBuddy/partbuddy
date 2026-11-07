/**
 * Plate nesting (viewport CAD round, 2026-11-07, the one slicer-like task PartBuddy does on
 * purpose): lays the footprints of the printed parts onto the bed of the chosen printer, turned in
 * steps, with a minimum gap between parts and a margin to the bed edge, on as many plates as needed.
 * No free library fitted: maxrects-packer (MIT) packs rectangles only, SVGnest and Deepnest are
 * DOM-bound or GPL, libnest2d is native C++. So: bottom-left fill over convex hulls, largest part
 * first; each candidate is pushed down and left while it stays free. Pure (runs in a worker).
 * shortcut: convex hulls, so a part never nests inside the hollow of another; upgrade to no-fit
 * polygons of the real outlines when plates of interlocking parts matter.
 */

export type Vec2 = [number, number];

export interface NestPart {
  id: string;
  /** Points of the footprint (any order; only the convex hull counts), in the part's own XY. */
  points: Vec2[];
  /** Height of the part as it lies on the bed. */
  height: number;
}

export interface NestOptions {
  /** Build volume X, Y, Z in mm. */
  bed: [number, number, number];
  /** Smallest gap between two parts. */
  spacing: number;
  /** Smallest gap to the bed edge. */
  margin: number;
  /** Turns tried per part (24: every 15°). */
  rotations: number;
}

/** A part on a plate: turned by `angle` (radians, about its own origin), then moved by x, y. */
export interface Placement {
  id: string;
  plate: number;
  angle: number;
  x: number;
  y: number;
}

export interface NestResult {
  plates: number;
  placements: Placement[];
  /** Parts larger than the bed in every turn (placed alone, over the edge) or taller than it. */
  misfits: { id: string; reason: 'size' | 'height' }[];
}

/** The convex hull, counter-clockwise (Andrew's monotone chain). */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as Vec2, lower[lower.length - 1] as Vec2, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2] as Vec2, upper[upper.length - 1] as Vec2, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(polygon: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Vec2;
    const b = polygon[(i + 1) % polygon.length] as Vec2;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

const rotate = (polygon: readonly Vec2[], angle: number): Vec2[] => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return polygon.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};

const bounds = (polygon: readonly Vec2[]) => ({
  minX: Math.min(...polygon.map((p) => p[0])),
  minY: Math.min(...polygon.map((p) => p[1])),
  maxX: Math.max(...polygon.map((p) => p[0])),
  maxY: Math.max(...polygon.map((p) => p[1])),
});

/**
 * The largest gap between two convex polygons along one of their edge normals (negative: they
 * overlap). The true distance is at least this, so a gap ≥ spacing guarantees the spacing.
 */
export function separation(a: readonly Vec2[], b: readonly Vec2[]): number {
  let best = -Infinity;
  for (const [first, second] of [
    [a, b],
    [b, a],
  ] as const) {
    for (let i = 0; i < first.length; i += 1) {
      const p = first[i] as Vec2;
      const q = first[(i + 1) % first.length] as Vec2;
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (length < 1e-9) continue;
      const nx = (q[1] - p[1]) / length;
      const ny = -(q[0] - p[0]) / length;
      let maxA = -Infinity;
      for (const v of first) maxA = Math.max(maxA, v[0] * nx + v[1] * ny);
      let minB = Infinity;
      for (const v of second) minB = Math.min(minB, v[0] * nx + v[1] * ny);
      best = Math.max(best, minB - maxA);
    }
  }
  return best;
}

interface Placed {
  polygon: Vec2[];
  box: ReturnType<typeof bounds>;
}

/** Lays out the parts; deterministic for the same input. */
export function nest(parts: readonly NestPart[], options: NestOptions): NestResult {
  const [width, depth, height] = options.bed;
  const { margin, spacing } = options;
  const step = Math.max(0.5, Math.min(width, depth) / 200);
  const angles = Array.from({ length: Math.max(1, options.rotations) }, (_, i) => (i * 2 * Math.PI) / Math.max(1, options.rotations));
  const hulls = parts.map((part) => ({ part, hull: convexHull(part.points) }));
  hulls.sort((a, b) => polygonArea(b.hull) - polygonArea(a.hull) || a.part.id.localeCompare(b.part.id));

  const plates: Placed[][] = [];
  const placements: Placement[] = [];
  const misfits: NestResult['misfits'] = [];

  const free = (plate: Placed[], polygon: Vec2[], box: Placed['box']) =>
    box.minX >= margin - 1e-6 &&
    box.minY >= margin - 1e-6 &&
    box.maxX <= width - margin + 1e-6 &&
    box.maxY <= depth - margin + 1e-6 &&
    plate.every(
      (other) =>
        box.minX >= other.box.maxX + spacing ||
        box.maxX <= other.box.minX - spacing ||
        box.minY >= other.box.maxY + spacing ||
        box.maxY <= other.box.minY - spacing ||
        separation(polygon, other.polygon) >= spacing - 1e-6,
    );

  const shift = (polygon: Vec2[], dx: number, dy: number): Vec2[] => polygon.map(([x, y]) => [x + dx, y + dy]);

  /** The best spot on one plate for one turned hull: candidates from the corners of what is placed, pushed down and left. */
  const spotOn = (plate: Placed[], turned: Vec2[]) => {
    const local = bounds(turned);
    const xs = [margin, ...plate.map((other) => other.box.maxX + spacing)];
    const ys = [margin, ...plate.map((other) => other.box.maxY + spacing)];
    let best: { dx: number; dy: number; top: number; right: number } | null = null;
    for (const y0 of ys) {
      for (const x0 of xs) {
        let dx = x0 - local.minX;
        let dy = y0 - local.minY;
        let polygon = shift(turned, dx, dy);
        if (!free(plate, polygon, bounds(polygon))) continue;
        // Push down, then left, while it stays free.
        for (let moved = true; moved; ) {
          moved = false;
          for (const [sx, sy] of [
            [0, -step],
            [-step, 0],
          ] as const) {
            const next = shift(polygon, sx, sy);
            if (free(plate, next, bounds(next))) {
              polygon = next;
              dx += sx;
              dy += sy;
              moved = true;
            }
          }
        }
        const box = bounds(polygon);
        if (!best || box.maxY < best.top - 1e-6 || (Math.abs(box.maxY - best.top) <= 1e-6 && box.maxX < best.right)) best = { dx, dy, top: box.maxY, right: box.maxX };
      }
    }
    return best;
  };

  for (const { part, hull } of hulls) {
    if (part.height > height) misfits.push({ id: part.id, reason: 'height' });
    let placed = false;
    for (let index = 0; index <= plates.length && !placed; index += 1) {
      const plate = plates[index] ?? [];
      let best: { angle: number; dx: number; dy: number; top: number; right: number } | null = null;
      for (const angle of angles) {
        const spot = spotOn(plate, rotate(hull, angle));
        if (spot && (!best || spot.top < best.top - 1e-6 || (Math.abs(spot.top - best.top) <= 1e-6 && spot.right < best.right))) best = { angle, ...spot };
      }
      if (!best) continue;
      const polygon = shift(rotate(hull, best.angle), best.dx, best.dy);
      if (index === plates.length) plates.push([]);
      plates[index]?.push({ polygon, box: bounds(polygon) });
      placements.push({ id: part.id, plate: index, angle: best.angle, x: best.dx, y: best.dy });
      placed = true;
    }
    if (!placed) {
      // Larger than the bed in every turn: alone on a plate of its own, in the turn that overhangs least.
      const angle = angles.reduce((a, b) => {
        const area = (turn: number) => {
          const box = bounds(rotate(hull, turn));
          return Math.max(0, box.maxX - box.minX - (width - 2 * margin)) + Math.max(0, box.maxY - box.minY - (depth - 2 * margin));
        };
        return area(b) < area(a) ? b : a;
      }, 0);
      const turned = rotate(hull, angle);
      const box = bounds(turned);
      plates.push([{ polygon: shift(turned, margin - box.minX, margin - box.minY), box }]);
      placements.push({ id: part.id, plate: plates.length - 1, angle, x: margin - box.minX, y: margin - box.minY });
      misfits.push({ id: part.id, reason: 'size' });
    }
  }
  // Each plate's layout as a whole moves to the middle of the bed, as slicers place it; it only
  // moves inward, so margins and gaps stay. A part over the edge stays where it is.
  plates.forEach((plate, index) => {
    if (placements.some((placement) => placement.plate === index && misfits.some((misfit) => misfit.id === placement.id && misfit.reason === 'size'))) return;
    const minX = Math.min(...plate.map((entry) => entry.box.minX));
    const maxX = Math.max(...plate.map((entry) => entry.box.maxX));
    const minY = Math.min(...plate.map((entry) => entry.box.minY));
    const maxY = Math.max(...plate.map((entry) => entry.box.maxY));
    const dx = (width - minX - maxX) / 2;
    const dy = (depth - minY - maxY) / 2;
    for (const placement of placements) {
      if (placement.plate !== index) continue;
      placement.x += dx;
      placement.y += dy;
    }
  });
  return { plates: plates.length, placements, misfits };
}

/** The outline of a placed part on its plate, for drawing and checks. */
export function placedOutline(points: readonly Vec2[], placement: Placement): Vec2[] {
  return rotate(convexHull(points), placement.angle).map(([x, y]) => [x + placement.x, y + placement.y]);
}
