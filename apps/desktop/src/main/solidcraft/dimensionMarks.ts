import type { DimensionMark } from '../../shared/contract';

/**
 * Dimensions shown in the view (M2b-3, ADR 0020): the sketch dimensions and feature inputs of a
 * feature, placed in world space from what SolidCraft reports (checked with 0.30.1):
 * `sketch.inspect` dimensions refer to curves (`l`, `c`) and points (`p`, `q`) by index, points carry
 * their world position; `timeline.inspect` gives each feature's inputs (label, parameter,
 * expression, unit) and its definition (sketch and profile, edge picks, hole position, box corner,
 * cylinder base and axis). Pure functions; the supervisor reads the data.
 */

type Vec3 = [number, number, number];
type Vec2 = [number, number];

export interface RawSketch {
  plane?: { origin?: unknown; x_dir?: unknown; y_dir?: unknown };
  curves?: unknown[];
  points?: unknown[];
  constraints?: unknown[];
}

export interface RawFeature {
  id: number;
  name: string;
  type: string;
  inputs: unknown[];
  definition: Record<string, unknown>;
}

export interface RawParameter {
  name: string;
  expression: string;
  unit: string;
  value: number;
  source?: string;
  used_by?: string[];
}

const PLAIN_NUMBER = /^\s*-?\d+(\.\d+)?\s*(mm|deg)?\s*$/;
const IDENTIFIER = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*$/u;

const isVec = (value: unknown, n: number): value is number[] =>
  Array.isArray(value) && value.length === n && value.every((v) => typeof v === 'number' && Number.isFinite(v));
const vec3 = (value: unknown): Vec3 | null => (isVec(value, 3) ? (value as Vec3) : null);
const vec2 = (value: unknown): Vec2 | null => (isVec(value, 2) ? (value as Vec2) : null);

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : scale(a, 1 / l);
};
const round = (value: number) => Math.round(value * 1000) / 1000;
const r3 = (a: Vec3): Vec3 => [round(a[0]), round(a[1]), round(a[2])];

/** Any direction at right angles to `axis`. */
function perpendicular(axis: Vec3): Vec3 {
  const helper: Vec3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return unit(cross(axis, helper));
}

/** How the user can change a dimension (ADR 0017: formulas are never overwritten). */
export function editOf(expression: string, parameters: readonly RawParameter[], own: string): DimensionMark['edit'] {
  if (PLAIN_NUMBER.test(expression)) return { mode: 'direct' };
  const name = IDENTIFIER.exec(expression)?.[1];
  const driver = name ? parameters.find((parameter) => parameter.name === name) : undefined;
  if (driver && PLAIN_NUMBER.test(driver.expression)) {
    const others = (driver.used_by ?? []).filter((user) => user !== own).length;
    return { mode: 'parameter', name: driver.name, others };
  }
  return { mode: 'assistant' };
}

interface Frame {
  origin: Vec3;
  x: Vec3;
  y: Vec3;
  normal: Vec3;
}

function frameOf(sketch: RawSketch): Frame {
  const origin = vec3(sketch.plane?.origin) ?? [0, 0, 0];
  const x = unit(vec3(sketch.plane?.x_dir) ?? [1, 0, 0]);
  const y = unit(vec3(sketch.plane?.y_dir) ?? [0, 1, 0]);
  return { origin, x, y, normal: unit(cross(x, y)) };
}

const toWorld = (frame: Frame, p: Vec2): Vec3 => add(frame.origin, add(scale(frame.x, p[0]), scale(frame.y, p[1])));

interface SketchCurve {
  type: string;
  start?: Vec3;
  end?: Vec3;
  center?: Vec3;
  radius?: number;
}

function curvesOf(sketch: RawSketch, frame: Frame): SketchCurve[] {
  return (sketch.curves ?? []).map((raw) => {
    const curve = (raw ?? {}) as Record<string, unknown>;
    const start = vec2(curve.start_at);
    const end = vec2(curve.end_at);
    const center = vec2(curve.center_at);
    const out: SketchCurve = { type: typeof curve.type === 'string' ? curve.type : '' };
    if (start) out.start = toWorld(frame, start);
    if (end) out.end = toWorld(frame, end);
    if (center) out.center = toWorld(frame, center);
    if (typeof curve.radius === 'number') out.radius = curve.radius;
    return out;
  });
}

function pointsOf(sketch: RawSketch, frame: Frame): (Vec3 | null)[] {
  return (sketch.points ?? []).map((raw) => {
    const point = (raw ?? {}) as Record<string, unknown>;
    const at = vec2(point.at);
    return vec3(point.world) ?? (at ? toWorld(frame, at) : null);
  });
}

/** Middle of the sketch's geometry, to push dimension lines outward. */
function middleOf(curves: SketchCurve[], fallback: Vec3): Vec3 {
  const points = curves.flatMap((curve) => [curve.start, curve.end, curve.center].filter((p): p is Vec3 => p !== undefined));
  if (points.length === 0) return fallback;
  return scale(points.reduce(add), 1 / points.length);
}

/** Offset of a dimension line: in the sketch plane, at right angles to the measured span, away from the middle. */
function outward(frame: Frame, from: Vec3, to: Vec3, middle: Vec3, gap: number): Vec3 {
  const along = unit(sub(to, from));
  let side = unit(cross(frame.normal, along));
  if (length(side) === 0) side = frame.y;
  const centre = scale(add(from, to), 0.5);
  if (dot(sub(centre, middle), side) < 0) side = scale(side, -1);
  return scale(side, gap);
}

type Placed = NonNullable<DimensionMark['geometry']>;

function linear(from: Vec3, to: Vec3, offset: Vec3): Placed {
  return { from: r3(from), to: r3(to), offset: r3(offset), anchor: r3(add(scale(add(from, to), 0.5), offset)) };
}

function leader(from: Vec3, to: Vec3): Placed {
  return { from: r3(from), to: r3(to), offset: [0, 0, 0], anchor: r3(add(to, scale(sub(to, from), 0.25))) };
}

/** Dimensions of a sketch: their parameters and where they sit. */
export function sketchMarks(
  sketch: RawSketch,
  feature: { id: number; name: string },
  parameters: readonly RawParameter[],
  body: string | null,
): DimensionMark[] {
  const frame = frameOf(sketch);
  const curves = curvesOf(sketch, frame);
  const points = pointsOf(sketch, frame);
  const middle = middleOf(curves, frame.origin);
  const size = Math.max(
    10,
    ...curves.flatMap((curve) => [curve.start, curve.end, curve.center].filter((p): p is Vec3 => p !== undefined).map((p) => length(sub(p, middle)) * 2)),
  );
  const gap = Math.max(2, size * 0.08);
  const marks: DimensionMark[] = [];
  for (const raw of sketch.constraints ?? []) {
    const k = (raw ?? {}) as Record<string, unknown>;
    if (typeof k.param !== 'string' || typeof k.expression !== 'string' || typeof k.value !== 'number' || typeof k.type !== 'string') continue;
    const type = k.type;
    const kind: DimensionMark['kind'] = type === 'radius' ? 'radius' : type === 'diameter' ? 'diameter' : type === 'angle' ? 'angle' : 'linear';
    let geometry: Placed | null = null;
    const curve = typeof k.l === 'number' ? curves[k.l] : typeof k.c === 'number' ? curves[k.c] : undefined;
    const p = typeof k.p === 'number' ? points[k.p] : null;
    const q = typeof k.q === 'number' ? points[k.q] : null;
    if ((kind === 'radius' || kind === 'diameter') && curve?.center && curve.radius !== undefined) {
      const dir = unit(add(frame.x, frame.y));
      const rim = add(curve.center, scale(dir, curve.radius));
      geometry = kind === 'diameter' ? leader(sub(curve.center, scale(dir, curve.radius)), rim) : leader(curve.center, rim);
    } else if (kind === 'linear' && p && q) {
      let to = q;
      if (type === 'distance_x' || type === 'horizontal') to = add(p, scale(frame.x, dot(sub(q, p), frame.x)));
      if (type === 'distance_y' || type === 'vertical') to = add(p, scale(frame.y, dot(sub(q, p), frame.y)));
      geometry = linear(p, to, outward(frame, p, to, middle, gap));
    } else if (kind === 'linear' && curve?.start && curve.end) {
      geometry = linear(curve.start, curve.end, outward(frame, curve.start, curve.end, middle, gap));
    } else if (curve?.start && curve.end) {
      geometry = leader(curve.start, scale(add(curve.start, curve.end), 0.5));
    }
    marks.push({
      id: `${String(feature.id)}:${k.param}`,
      parameter: k.param,
      label: type,
      feature,
      expression: k.expression,
      value: k.value,
      unit: kind === 'angle' ? 'deg' : 'mm',
      kind,
      edit: editOf(k.expression, parameters, k.param),
      body,
      geometry,
    });
  }
  return marks;
}

interface Input {
  label: string;
  param: string;
  expression: string;
  unit: string;
}

function inputsOf(feature: RawFeature): Input[] {
  return feature.inputs.flatMap((raw) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    return typeof input.param === 'string' && typeof input.expression === 'string'
      ? [{ label: typeof input.label === 'string' ? input.label : input.param, param: input.param, expression: input.expression, unit: typeof input.unit === 'string' ? input.unit : 'mm' }]
      : [];
  });
}

/** Where an input of a feature sits, from its definition; null when PartBuddy has no place for it. */
function placeInput(feature: RawFeature, input: Input, value: number, sketch: RawSketch | null): { geometry: Placed | null; kind: DimensionMark['kind'] } {
  const d = feature.definition;
  const label = input.label.toLowerCase();
  const kindOf = (): DimensionMark['kind'] => (input.unit === 'deg' ? 'angle' : label.includes('diameter') ? 'diameter' : label.includes('radius') ? 'radius' : 'linear');
  const kind = kindOf();
  const gap = Math.max(2, Math.abs(value) * 0.15);
  if (feature.type.startsWith('Extrude') && sketch && label.includes('distance')) {
    const frame = frameOf(sketch);
    const curves = curvesOf(sketch, frame);
    const loop = ((d.profiles as { loops?: unknown } | undefined)?.loops as string[][] | undefined)?.[0];
    const ids = (sketch.curves ?? []).map((raw) => (raw as { id?: unknown } | null)?.id);
    const first = loop?.[0] ? curves[ids.indexOf(loop[0])] : curves[0];
    const corner = first?.start ?? first?.center;
    if (!corner) return { geometry: null, kind };
    const extent = (d.extent ?? {}) as { direction?: unknown };
    const sign = extent.direction === 'negative' ? -1 : 1;
    const start = extent.direction === 'symmetric' ? sub(corner, scale(frame.normal, value / 2)) : corner;
    const end = add(start, scale(frame.normal, sign * value));
    const middle = middleOf(curves, frame.origin);
    const away = unit(sub(corner, middle));
    return { geometry: linear(start, end, scale(length(away) > 0 ? away : frame.x, gap)), kind };
  }
  const pick = Array.isArray(d.edges) ? vec3((d.edges as unknown[])[0]) : null;
  if ((feature.type.startsWith('Fillet') || feature.type.startsWith('Chamfer')) && pick) {
    return { geometry: { from: r3(pick), to: r3(pick), offset: [0, 0, 0], anchor: r3(pick) }, kind };
  }
  const position = vec3(d.position);
  if (feature.type.startsWith('Hole') && position) {
    const direction = unit(vec3(d.direction) ?? [0, 0, -1]);
    if (label.includes('depth')) return { geometry: linear(position, add(position, scale(direction, value)), scale(perpendicular(direction), gap)), kind };
    const radius = kind === 'diameter' ? value / 2 : value;
    return { geometry: leader(position, add(position, scale(perpendicular(direction), radius))), kind };
  }
  const corner = vec3(d.corner);
  if (feature.type.startsWith('Box') && corner) {
    const axes: Record<string, { along: Vec3; side: Vec3 }> = {
      length: { along: [1, 0, 0], side: [0, -1, 0] },
      width: { along: [0, 1, 0], side: [-1, 0, 0] },
      height: { along: [0, 0, 1], side: [-1, -1, 0] },
    };
    const axis = axes[label];
    if (axis) return { geometry: linear(corner, add(corner, scale(axis.along, value)), scale(unit(axis.side), gap)), kind };
  }
  const base = vec3(d.base);
  if (feature.type.startsWith('Cylinder') && base) {
    const axis = unit(vec3(d.axis) ?? [0, 0, 1]);
    const radius = typeof d.radius === 'string' || typeof d.radius === 'number' ? Number.parseFloat(String(d.radius)) : NaN;
    const side = perpendicular(axis);
    if (label.includes('height')) {
      const offset = scale(side, (Number.isFinite(radius) ? radius : 0) + gap);
      return { geometry: linear(base, add(base, scale(axis, value)), offset), kind };
    }
    if (label.includes('radius')) return { geometry: leader(base, add(base, scale(side, value))), kind };
  }
  return { geometry: null, kind };
}

/** The inputs of a feature (distance, radius, depth …), placed where PartBuddy knows how. */
export function featureMarks(feature: RawFeature, parameters: readonly RawParameter[], sketch: RawSketch | null, body: string | null): DimensionMark[] {
  return inputsOf(feature).map((input) => {
    const value = parameters.find((parameter) => parameter.name === input.param)?.value ?? Number.parseFloat(input.expression);
    const { geometry, kind } = placeInput(feature, input, value, sketch);
    return {
      id: `${String(feature.id)}:${input.param}`,
      parameter: input.param,
      label: input.label,
      feature: { id: feature.id, name: feature.name },
      expression: input.expression,
      value: Number.isFinite(value) ? value : 0,
      unit: input.unit === 'deg' ? 'deg' : 'mm',
      kind,
      edit: editOf(input.expression, parameters, input.param),
      body,
      geometry,
    };
  });
}
