/**
 * Sketch curves for the live view (issue #21): SolidCraft's `sketch.inspect` result read
 * defensively, then flattened into world-space line segments. The mirror carries bodies as
 * face-tagged meshes (ADR 0004); sketches have no body yet, so they travel as curve outlines.
 *
 * The curve definitions match SolidCraft 0.30.1 (checked against its own DXF export within
 * 0.002 mm, packages/geometry/fixtures/sketch-curves.*):
 * - arcs run counter-clockwise from `start_at` to `end_at` (clockwise arcs are stored swapped);
 * - fit-point splines are natural cubic splines over chord-length parameters, periodic ones
 *   close smoothly through their first point;
 * - control-point splines are clamped B-splines with uniform inner knots;
 * - conics are rational quadratic Béziers with the apex weight rho / (1 - rho);
 * - ellipses are full ellipses from the centre, the end of the major axis and the minor radius.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface SketchPlane {
  origin: Vec3;
  xDir: Vec3;
  yDir: Vec3;
}

export type SketchCurveShape =
  | { kind: 'line'; start: Vec2; end: Vec2 }
  | { kind: 'circle'; center: Vec2; radius: number }
  | { kind: 'arc'; center: Vec2; radius: number; start: Vec2; end: Vec2 }
  | { kind: 'ellipse'; center: Vec2; major: Vec2; minorRadius: number }
  | { kind: 'conic'; start: Vec2; apex: Vec2; end: Vec2; rho: number }
  | { kind: 'spline'; points: Vec2[]; control: boolean; periodic: boolean; degree: number };

export type SketchCurve = SketchCurveShape & {
  id: string;
  construction: boolean;
  fullyConstrained: boolean;
};

export interface SketchModel {
  id: number;
  name: string;
  plane: SketchPlane;
  curves: SketchCurve[];
  /** Curves of a type PartBuddy does not draw yet. */
  skipped: number;
}

/** How a segment is drawn: free geometry, fully constrained geometry or construction geometry. */
export const SKETCH_STYLE = { free: 0, constrained: 1, construction: 2 } as const;

export interface SketchLines {
  /** World positions in mm, two points (six numbers) per segment. */
  positions: Float32Array<ArrayBuffer>;
  /** One `SKETCH_STYLE` per segment. */
  styles: Uint8Array<ArrayBuffer>;
  /** The segments of each curve, in order: `first` and `count` count segments. */
  curves: { id: string; first: number; count: number }[];
}

export interface TessellateOptions {
  /** Largest distance between a curve and its segments, in mm. */
  tolerance?: number;
  /** Upper bound of segments per curve. */
  maxSegments?: number;
}

const DEFAULT_TOLERANCE = 0.01;
const DEFAULT_MAX_SEGMENTS = 1024;
/** A curve is split at least this often before the flatness check, so no bulge is missed. */
const MIN_PIECES = 8;
const MAX_DEPTH = 12;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function vec2(value: unknown): Vec2 | null {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1])
    ? [value[0], value[1]]
    : null;
}

function vec3(value: unknown): Vec3 | null {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
    ? [value[0] as number, value[1] as number, value[2] as number]
    : null;
}

function positive(value: unknown): number | null {
  return isFiniteNumber(value) && value > 0 ? value : null;
}

function shapeOf(raw: Record<string, unknown>): SketchCurveShape | null {
  switch (raw.type) {
    case 'line': {
      const start = vec2(raw.start_at);
      const end = vec2(raw.end_at);
      return start && end ? { kind: 'line', start, end } : null;
    }
    case 'circle': {
      const center = vec2(raw.center_at);
      const radius = positive(raw.radius);
      return center && radius !== null ? { kind: 'circle', center, radius } : null;
    }
    case 'arc': {
      const center = vec2(raw.center_at);
      const radius = positive(raw.radius);
      const start = vec2(raw.start_at);
      const end = vec2(raw.end_at);
      return center && radius !== null && start && end ? { kind: 'arc', center, radius, start, end } : null;
    }
    case 'ellipse': {
      const center = vec2(raw.center_at);
      const major = vec2(raw.major_at);
      const minorRadius = positive(raw.minor_radius);
      return center && major && minorRadius !== null ? { kind: 'ellipse', center, major, minorRadius } : null;
    }
    case 'conic': {
      const start = vec2(raw.start_at);
      const apex = vec2(raw.apex_at);
      const end = vec2(raw.end_at);
      const rho = isFiniteNumber(raw.rho) && raw.rho > 0 && raw.rho < 1 ? raw.rho : null;
      return start && apex && end && rho !== null ? { kind: 'conic', start, apex, end, rho } : null;
    }
    case 'spline': {
      if (!Array.isArray(raw.points_at) || raw.points_at.length < 2) return null;
      const points = raw.points_at.map(vec2);
      if (points.some((point) => point === null)) return null;
      const degree = Number.isInteger(raw.degree) && (raw.degree as number) >= 1 ? (raw.degree as number) : 3;
      return { kind: 'spline', points: points as Vec2[], control: raw.control === true, periodic: raw.periodic === true, degree };
    }
    default:
      return null;
  }
}

/**
 * Reads one `sketch.inspect` result. Throws when the sketch itself is malformed; single curves
 * of unknown type or with invalid numbers are skipped and counted, so one odd curve never hides
 * the rest of the sketch.
 */
export function sketchFromInspect(raw: unknown): SketchModel {
  if (typeof raw !== 'object' || raw === null) throw new Error('sketch.inspect returned no object');
  const record = raw as Record<string, unknown>;
  const plane = typeof record.plane === 'object' && record.plane !== null ? (record.plane as Record<string, unknown>) : {};
  const origin = vec3(plane.origin);
  const xDir = vec3(plane.x_dir);
  const yDir = vec3(plane.y_dir);
  if (!origin || !xDir || !yDir) throw new Error('sketch.inspect returned no sketch plane');
  if (!Number.isInteger(record.id)) throw new Error('sketch.inspect returned no sketch id');
  const rawCurves = Array.isArray(record.curves) ? record.curves : [];
  const curves: SketchCurve[] = [];
  let skipped = 0;
  for (const entry of rawCurves) {
    if (typeof entry !== 'object' || entry === null) {
      skipped += 1;
      continue;
    }
    const curve = entry as Record<string, unknown>;
    const shape = typeof curve.id === 'string' && curve.id !== '' ? shapeOf(curve) : null;
    if (!shape) {
      skipped += 1;
      continue;
    }
    curves.push({
      ...shape,
      id: curve.id as string,
      construction: curve.construction === true,
      fullyConstrained: curve.fully_constrained === true,
    });
  }
  return {
    id: record.id as number,
    name: typeof record.name === 'string' ? record.name : '',
    plane: { origin, xDir, yDir },
    curves,
    skipped,
  };
}

type Curve2 = (t: number) => Vec2;

/**
 * Flattens `f` on [t0, t1]: MIN_PIECES equal pieces, each split in half while its midpoint is
 * further than the tolerance from the chord. Returns the points including both ends.
 */
function flatten(f: Curve2, t0: number, t1: number, tolerance: number, budget: number, out: Vec2[]): void {
  const pieces = Math.max(1, Math.min(MIN_PIECES, budget));
  const perPiece = Math.max(1, Math.floor(budget / pieces));
  if (out.length === 0) out.push(f(t0));
  const refine = (a: number, pa: Vec2, b: number, pb: Vec2, depth: number, allowed: number): void => {
    const m = (a + b) / 2;
    const pm = f(m);
    if (depth >= MAX_DEPTH || allowed <= 1 || distanceToChord(pm, pa, pb) <= tolerance) {
      out.push(pb);
      return;
    }
    const half = Math.floor(allowed / 2);
    refine(a, pa, m, pm, depth + 1, half);
    refine(m, pm, b, pb, depth + 1, allowed - half);
  };
  let previous = out[out.length - 1] as Vec2;
  for (let i = 0; i < pieces; i += 1) {
    const a = t0 + ((t1 - t0) * i) / pieces;
    const b = t0 + ((t1 - t0) * (i + 1)) / pieces;
    const pb = f(b);
    refine(a, previous, b, pb, 0, perPiece);
    previous = pb;
  }
}

function distanceToChord(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length;
}

/** Segments for a circle arc from the chord tolerance (sagitta), within [MIN_PIECES, budget]. */
function arcSegments(radius: number, sweep: number, tolerance: number, budget: number): number {
  const step = tolerance >= radius ? Math.PI / 2 : 2 * Math.acos(1 - tolerance / radius);
  return Math.min(budget, Math.max(MIN_PIECES, Math.ceil(Math.abs(sweep) / step)));
}

function circlePoints(center: Vec2, radius: number, from: number, sweep: number, tolerance: number, budget: number): Vec2[] {
  const n = arcSegments(radius, sweep, tolerance, budget);
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i += 1) {
    const angle = from + (sweep * i) / n;
    points.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  return points;
}

function chordParameters(points: Vec2[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Vec2;
    const b = points[i] as Vec2;
    u.push((u[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return u;
}

/** Solves a tridiagonal system (Thomas algorithm); `a` is below, `b` on and `c` above the diagonal. */
function solveTridiagonal(a: number[], b: number[], c: number[], d: number[]): number[] {
  const n = b.length;
  const cp = new Array<number>(n).fill(0);
  const dp = new Array<number>(n).fill(0);
  cp[0] = (c[0] as number) / (b[0] as number);
  dp[0] = (d[0] as number) / (b[0] as number);
  for (let i = 1; i < n; i += 1) {
    const m = (b[i] as number) - (a[i] as number) * (cp[i - 1] as number);
    cp[i] = (c[i] as number) / m;
    dp[i] = ((d[i] as number) - (a[i] as number) * (dp[i - 1] as number)) / m;
  }
  const x = new Array<number>(n).fill(0);
  x[n - 1] = dp[n - 1] as number;
  for (let i = n - 2; i >= 0; i -= 1) x[i] = (dp[i] as number) - (cp[i] as number) * (x[i + 1] as number);
  return x;
}

/** Solves a cyclic tridiagonal system (corners `a[0]` and `c[n-1]`) with Sherman–Morrison. */
function solveCyclic(a: number[], b: number[], c: number[], d: number[]): number[] {
  const n = b.length;
  const alpha = c[n - 1] as number;
  const beta = a[0] as number;
  const gamma = -(b[0] as number);
  const bb = b.slice();
  bb[0] = (b[0] as number) - gamma;
  bb[n - 1] = (b[n - 1] as number) - (alpha * beta) / gamma;
  const x = solveTridiagonal(a, bb, c, d);
  const u = new Array<number>(n).fill(0);
  u[0] = gamma;
  u[n - 1] = alpha;
  const z = solveTridiagonal(a, bb, c, u);
  const factor = ((x[0] as number) + (beta * (x[n - 1] as number)) / gamma) / (1 + (z[0] as number) + (beta * (z[n - 1] as number)) / gamma);
  return x.map((value, i) => value - factor * (z[i] as number));
}

/**
 * Second derivatives of a cubic spline through `values` at parameters `u`: natural ends, or
 * periodic (the last value equals the first and is not repeated in the system).
 */
function splineMoments(u: number[], values: number[], periodic: boolean): number[] {
  const n = u.length - 1;
  const h = (i: number) => (u[i + 1] as number) - (u[i] as number);
  const slope = (i: number) => ((values[i + 1] as number) - (values[i] as number)) / h(i);
  if (periodic) {
    if (n < 3) return new Array<number>(n + 1).fill(0);
    const a: number[] = [];
    const b: number[] = [];
    const c: number[] = [];
    const d: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const before = i === 0 ? n - 1 : i - 1;
      a.push(h(before));
      b.push(2 * (h(before) + h(i)));
      c.push(h(i));
      d.push(6 * (slope(i) - slope(before)));
    }
    const m = solveCyclic(a, b, c, d);
    return [...m, m[0] as number];
  }
  if (n < 2) return new Array<number>(n + 1).fill(0);
  const a: number[] = [];
  const b: number[] = [];
  const c: number[] = [];
  const d: number[] = [];
  for (let i = 1; i < n; i += 1) {
    a.push(h(i - 1));
    b.push(2 * (h(i - 1) + h(i)));
    c.push(h(i));
    d.push(6 * (slope(i) - slope(i - 1)));
  }
  return [0, ...solveTridiagonal(a, b, c, d), 0];
}

function fitSplinePoints(points: Vec2[], periodic: boolean, tolerance: number, budget: number): Vec2[] {
  // Repeated points would give zero-length intervals.
  const distinct = points.filter((p, i) => i === 0 || p[0] !== (points[i - 1] as Vec2)[0] || p[1] !== (points[i - 1] as Vec2)[1]);
  if (periodic) {
    const first = distinct[0] as Vec2;
    const last = distinct[distinct.length - 1] as Vec2;
    if (first[0] !== last[0] || first[1] !== last[1]) distinct.push([first[0], first[1]]);
  }
  if (distinct.length < 2) return distinct;
  const u = chordParameters(distinct);
  const closed = periodic && distinct.length >= 4;
  const mx = splineMoments(u, distinct.map((p) => p[0]), closed);
  const my = splineMoments(u, distinct.map((p) => p[1]), closed);
  const out: Vec2[] = [];
  const spans = distinct.length - 1;
  const perSpan = Math.max(1, Math.floor(budget / spans));
  for (let i = 0; i < spans; i += 1) {
    const u0 = u[i] as number;
    const u1 = u[i + 1] as number;
    const h = u1 - u0;
    const p0 = distinct[i] as Vec2;
    const p1 = distinct[i + 1] as Vec2;
    const evaluate = (m: number[], y0: number, y1: number, x: number) => {
      const m0 = m[i] as number;
      const m1 = m[i + 1] as number;
      const left = u1 - x;
      const right = x - u0;
      return (m0 * left ** 3 + m1 * right ** 3) / (6 * h) + (y0 / h - (m0 * h) / 6) * left + (y1 / h - (m1 * h) / 6) * right;
    };
    flatten((x) => [evaluate(mx, p0[0], p1[0], x), evaluate(my, p0[1], p1[1], x)], u0, u1, tolerance, perSpan, out);
  }
  return out;
}

/** De Boor evaluation of a clamped B-spline with uniform inner knots. */
function controlSplinePoints(points: Vec2[], degree: number, tolerance: number, budget: number): Vec2[] {
  const k = Math.min(degree, points.length - 1);
  const n = points.length;
  const knots: number[] = [];
  for (let i = 0; i <= k; i += 1) knots.push(0);
  const inner = n - k - 1;
  for (let i = 1; i <= inner; i += 1) knots.push(i / (inner + 1));
  for (let i = 0; i <= k; i += 1) knots.push(1);
  const evaluate = (t: number): Vec2 => {
    let span = k;
    while (span < n - 1 && t >= (knots[span + 1] as number)) span += 1;
    const d = points.slice(span - k, span + 1).map((p): Vec2 => [p[0], p[1]]);
    for (let r = 1; r <= k; r += 1) {
      for (let j = k; j >= r; j -= 1) {
        const i = span - k + j;
        const left = knots[i] as number;
        const right = knots[i + k + 1 - r] as number;
        const alpha = right === left ? 0 : (t - left) / (right - left);
        const a = d[j - 1] as Vec2;
        const b = d[j] as Vec2;
        d[j] = [(1 - alpha) * a[0] + alpha * b[0], (1 - alpha) * a[1] + alpha * b[1]];
      }
    }
    return d[k] as Vec2;
  };
  const out: Vec2[] = [];
  const spans = inner + 1;
  const perSpan = Math.max(1, Math.floor(budget / spans));
  for (let s = 0; s < spans; s += 1) flatten(evaluate, s / spans, (s + 1) / spans, tolerance, perSpan, out);
  return out;
}

/** The curve as a polyline in sketch coordinates. */
export function curvePolyline(curve: SketchCurveShape, options: TessellateOptions = {}): Vec2[] {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const budget = options.maxSegments ?? DEFAULT_MAX_SEGMENTS;
  switch (curve.kind) {
    case 'line':
      return [curve.start, curve.end];
    case 'circle':
      return circlePoints(curve.center, curve.radius, 0, 2 * Math.PI, tolerance, budget);
    case 'arc': {
      const from = Math.atan2(curve.start[1] - curve.center[1], curve.start[0] - curve.center[0]);
      const to = Math.atan2(curve.end[1] - curve.center[1], curve.end[0] - curve.center[0]);
      let sweep = to - from;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const points = circlePoints(curve.center, curve.radius, from, sweep, tolerance, budget);
      // Exact end points, so connected curves meet without a gap.
      points[0] = curve.start;
      points[points.length - 1] = curve.end;
      return points;
    }
    case 'ellipse': {
      const [cx, cy] = curve.center;
      const ax = curve.major[0] - cx;
      const ay = curve.major[1] - cy;
      const a = Math.hypot(ax, ay);
      if (a === 0) return [];
      const cos = ax / a;
      const sin = ay / a;
      const b = curve.minorRadius;
      const out: Vec2[] = [];
      flatten(
        (t) => {
          const x = a * Math.cos(t);
          const y = b * Math.sin(t);
          return [cx + x * cos - y * sin, cy + x * sin + y * cos];
        },
        0,
        2 * Math.PI,
        tolerance,
        budget,
        out,
      );
      return out;
    }
    case 'conic': {
      const w = curve.rho / (1 - curve.rho);
      const { start: s, apex: m, end: e } = curve;
      const out: Vec2[] = [];
      flatten(
        (t) => {
          const b0 = (1 - t) ** 2;
          const b1 = 2 * w * t * (1 - t);
          const b2 = t ** 2;
          const sum = b0 + b1 + b2;
          return [(b0 * s[0] + b1 * m[0] + b2 * e[0]) / sum, (b0 * s[1] + b1 * m[1] + b2 * e[1]) / sum];
        },
        0,
        1,
        tolerance,
        budget,
        out,
      );
      out[0] = s;
      out[out.length - 1] = e;
      return out;
    }
    case 'spline':
      return curve.control
        ? controlSplinePoints(curve.points, curve.degree, tolerance, budget)
        : fitSplinePoints(curve.points, curve.periodic, tolerance, budget);
  }
}

/** Flattens every curve of the sketch into world-space line segments. */
export function tessellateSketch(sketch: SketchModel, options: TessellateOptions = {}): SketchLines {
  const { origin, xDir, yDir } = sketch.plane;
  const coordinates: number[] = [];
  const styles: number[] = [];
  const curves: SketchLines['curves'] = [];
  for (const curve of sketch.curves) {
    const points = curvePolyline(curve, options);
    const first = styles.length;
    const style = curve.construction
      ? SKETCH_STYLE.construction
      : curve.fullyConstrained
        ? SKETCH_STYLE.constrained
        : SKETCH_STYLE.free;
    for (let i = 1; i < points.length; i += 1) {
      for (const [x, y] of [points[i - 1] as Vec2, points[i] as Vec2]) {
        coordinates.push(origin[0] + x * xDir[0] + y * yDir[0], origin[1] + x * xDir[1] + y * yDir[1], origin[2] + x * xDir[2] + y * yDir[2]);
      }
      styles.push(style);
    }
    curves.push({ id: curve.id, first, count: styles.length - first });
  }
  return { positions: Float32Array.from(coordinates), styles: Uint8Array.from(styles), curves };
}
