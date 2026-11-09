import { sketchFromInspect, tessellateSketch } from '@partbuddy/geometry';

import { centring, hostFace, inPlane, LOGO_PREFIX, movedPlane, placedLogos, planeAngle, rotatedPlane, type CentreAxis, type PlacedSketch, type SketchPlane, type Vec3 } from '../../shared/drawingPlacement';

/**
 * Moving a placed logo, shared by the assistant's `partbuddy_move_drawing` and the logo controls
 * in the selection dock: which logo a picked point belongs to, how far it sits from its face's
 * middle, and the `sketch.redefine` steps that move it (drawingPlacement.ts has the geometry).
 */

export type Step = { command: string; params: Record<string, unknown> };
/** Runs engine commands in one batch, without rolling back, and gives their results; throws on a refusal. */
export type Run = (commands: Step[]) => Promise<unknown[]>;

type Body = { name?: unknown; bbox?: { min?: number[]; max?: number[] } };
type Design = { bodies?: Body[]; sketches?: unknown; timeline?: unknown };

/** How far from the logo's sketch plane a picked point may lie and still belong to it: deeper than any logo. */
const REACH_MM = 20;

const bodiesOf = (design: Design) => (Array.isArray(design.bodies) ? design.bodies : []);

/** The design's bodies and sketches; the engine's `document.inspect` has no boxes, `inspect.measure` adds them. */
async function inspect(run: Run): Promise<Design> {
  const design: Design = (await run([{ command: 'document.inspect', params: {} }]))[0] ?? {};
  const names = bodiesOf(design).flatMap((body) => (typeof body.name === 'string' && !body.bbox ? [body.name] : []));
  if (names.length === 0) return design;
  const measured = ((await run([{ command: 'inspect.measure', params: { bodies: names } }]))[0] as { bodies?: unknown } | undefined)?.bodies;
  const boxes = new Map((Array.isArray(measured) ? (measured as Body[]) : []).map((entry) => [entry.name, entry.bbox]));
  return {
    ...design,
    bodies: bodiesOf(design).map((body) => {
      const bbox = body.bbox ?? boxes.get(body.name);
      return bbox ? { ...body, bbox } : body;
    }),
  };
}

/** Bodies whose box holds the point: the part under a logo's middle, and a colour piece there. */
function around(design: Design, point: Vec3): string[] {
  const inside = (body: Body) => point.every((value, i) => value >= (body.bbox?.min?.[i] ?? Infinity) - 1e-3 && value <= (body.bbox?.max?.[i] ?? -Infinity) + 1e-3);
  return bodiesOf(design).flatMap((body) => (typeof body.name === 'string' && inside(body) ? [body.name] : []));
}

/** The flat face the logo sits on, from `model.faces` and `model.edges` of the bodies around its middle. */
async function hostOf(run: Run, design: Design, plane: SketchPlane) {
  const names = around(design, plane.origin);
  if (names.length === 0) return null;
  const results = await run(names.flatMap((body) => [{ command: 'model.faces', params: { body } }, { command: 'model.edges', params: { body } }]));
  return hostFace(plane, names.map((body, i) => ({ body, faces: results[i * 2], edges: results[i * 2 + 1] })));
}

/** The colour bodies of a logo ("<file name> <fill> <n>", also split pieces "… (2)") and the bodies around its middle. */
function touched(design: Design, sketch: PlacedSketch): string[] {
  const base = sketch.name.slice(LOGO_PREFIX.length).replace(/ \d+$/, '');
  const colour = (name: string) => name.startsWith(`${base} `) && /^[0-9a-f]{6} \d+( \(\d+\))?$/.test(name.slice(base.length + 1));
  const named = bodiesOf(design).flatMap((body) => (typeof body.name === 'string' && colour(body.name) ? [body.name] : []));
  return [...new Set([...around(design, sketch.plane.origin), ...named])];
}

export interface LogoMove {
  name: string;
  steps: Step[];
  /** mm along the logo's x and y. */
  by: [number, number];
  /** The logo's middle afterwards. */
  origin: Vec3;
  /** How far it is turned afterwards from level, in degrees. */
  angle: number;
  /** The face it was centred on, "<face> of <body>", or null. */
  face: string | null;
  /** The bodies the move changes, for a ghost. */
  bodies: string[];
}

/**
 * The logos of the design with their planes. The engine's `document.inspect` lists sketches without
 * planes, so each logo sketch is read with `sketch.inspect`; its result also has the curves.
 */
async function readLogos(run: Run, design: Design): Promise<{ logos: Map<string, PlacedSketch[]>; read: Map<number, unknown> }> {
  const list = (Array.isArray(design.sketches) ? design.sketches : []) as { id?: unknown; name?: unknown }[];
  const wanted = list.filter((sketch) => typeof sketch.name === 'string' && sketch.name.startsWith(LOGO_PREFIX) && Number.isInteger(sketch.id));
  if (wanted.length === 0) return { logos: new Map(), read: new Map() };
  const results = await run(wanted.map((sketch) => ({ command: 'sketch.inspect', params: { sketch: sketch.id } })));
  const plane = (result: unknown) => (result as { plane?: unknown } | undefined)?.plane;
  return {
    logos: placedLogos({ sketches: wanted.map((sketch, i) => ({ id: sketch.id, name: sketch.name, plane: plane(results[i]) })) }),
    read: new Map(wanted.map((sketch, i) => [sketch.id as number, results[i]])),
  };
}

interface Depth {
  /** The distance parameter of each extrusion built on the logo's sketches, and its sign: negative cuts in. */
  params: { name: string; sign: 1 | -1 }[];
  /** How deep or high it is now, in mm. */
  depth: number;
}

/**
 * How deep or high a logo is: the extrusions on its sketches (in colours one per piece) and their
 * distance parameters, which SolidCraft creates for every feature input. One value sets them all.
 */
async function depthOf(run: Run, design: Design, sketches: readonly PlacedSketch[]): Promise<Depth | null> {
  type Entry = { id?: unknown; type?: unknown; suppressed?: unknown; rolled_back?: unknown };
  const timeline = (Array.isArray(design.timeline) ? (design.timeline as Entry[]) : []).filter(
    (entry) => Number.isInteger(entry.id) && typeof entry.type === 'string' && entry.type.startsWith('Extrude') && entry.suppressed !== true && entry.rolled_back !== true,
  );
  if (timeline.length === 0) return null;
  const results = await run([...timeline.map((entry) => ({ command: 'timeline.inspect', params: { feature: entry.id } })), { command: 'parameters.list', params: {} }]);
  const listed = (results[timeline.length] as { parameters?: unknown } | undefined)?.parameters;
  const values = new Map((Array.isArray(listed) ? (listed as { name?: unknown; value?: unknown }[]) : []).map((entry) => [entry.name, entry.value]));
  const ids = sketches.map((sketch) => sketch.id);
  const params: (Depth['params'][number] & { value: number })[] = [];
  for (const result of results.slice(0, timeline.length) as { inputs?: unknown; definition?: { sketch?: unknown } }[]) {
    if (!ids.includes(result.definition?.sketch as number)) continue;
    for (const input of Array.isArray(result.inputs) ? (result.inputs as { label?: unknown; param?: unknown; expression?: unknown }[]) : []) {
      if (typeof input.label !== 'string' || !input.label.toLowerCase().includes('distance') || typeof input.param !== 'string') continue;
      const known = values.get(input.param);
      const value = typeof known === 'number' ? known : Number.parseFloat(String(input.expression));
      if (Number.isFinite(value) && value !== 0) params.push({ name: input.param, sign: value < 0 ? -1 : 1, value: Math.abs(value) });
    }
  }
  const first = params[0];
  return first ? { params: params.map(({ name, sign }) => ({ name, sign })), depth: first.value } : null;
}

/** The drawing's box over every sketch of a logo, in the first one's plane around the middle: [min x, min y, max x, max y] in mm. */
function boxOf(sketches: readonly PlacedSketch[], read: Map<number, unknown>): [number, number, number, number] | null {
  let [minU, minV, maxU, maxV] = [Infinity, Infinity, -Infinity, -Infinity];
  const plane = sketches[0]?.plane;
  for (const sketch of sketches) {
    let positions: Float32Array;
    try {
      positions = tessellateSketch(sketchFromInspect(read.get(sketch.id))).positions;
    } catch {
      continue;
    }
    for (let p = 0; plane && p + 2 < positions.length; p += 3) {
      const [a, b] = inPlane(plane, [positions[p] ?? 0, positions[p + 1] ?? 0, positions[p + 2] ?? 0]);
      [minU, minV, maxU, maxV] = [Math.min(minU, a), Math.min(minV, b), Math.max(maxU, a), Math.max(maxV, b)];
    }
  }
  return Number.isFinite(minU) ? [minU, minV, maxU, maxV] : null;
}

/**
 * A sketch scaled about its origin: opened, its curves and free points transformed, closed again;
 * the pocket, cut or colour body built on it follows (probed with SolidCraft, 2026-11-09). The
 * sketch's own origin is fixed and cannot move, nor can projected geometry.
 */
function scaleSteps(sketch: number, inspected: unknown, factor: number): Step[] {
  const read = (inspected ?? {}) as { curves?: { id?: unknown }[]; points?: { id?: unknown; fixed?: unknown; projected?: unknown }[] };
  const entities = [
    ...(read.curves ?? []).flatMap((curve) => (typeof curve.id === 'string' ? [curve.id] : [])),
    ...(read.points ?? []).flatMap((point) => (typeof point.id === 'string' && point.id !== 'origin' && point.fixed !== true && point.projected !== true ? [point.id] : [])),
  ];
  if (entities.length === 0) return [];
  return [
    { command: 'sketch.edit', params: { sketch } },
    { command: 'sketch.transform', params: { entities, factor: Math.round(factor * 1e6) / 1e6, center: [0, 0] } },
    { command: 'sketch.finish', params: {} },
  ];
}

/** What changes about a logo; null or left out keeps it. */
export interface LogoChange {
  /** mm along the logo's own x and y. */
  by?: [number, number] | null | undefined;
  /** Onto its face's middle along this axis, before `by`. */
  centre?: CentreAxis | null | undefined;
  /** Degrees counter-clockwise about its middle, after moving. */
  rotate?: number | null | undefined;
  /** How wide in mm, aspect kept, about its middle. */
  width?: number | null | undefined;
  /** How deep or high in mm. */
  depth?: number | null | undefined;
}

/**
 * The steps that change a logo: scaled to `width` about its middle, onto its face's middle along
 * `centre`, then by `by`, then turned by `rotate`; `depth` sets how deep or high.
 */
export async function planLogoMove(run: Run, logo: string, change: LogoChange): Promise<LogoMove> {
  const { by = null, centre = null, rotate = null, width = null, depth = null } = change;
  const design = await inspect(run);
  const { logos, read } = await readLogos(run, design);
  const sketches = logos.get(logo) ?? logos.get(`${LOGO_PREFIX}${logo}`);
  const first = sketches?.[0];
  if (!sketches || !first) throw new Error(`there is no logo "${logo}"; placed logos: ${[...logos.keys()].join(', ') || 'none'}`);
  let [du, dv] = [0, 0];
  let face: string | null = null;
  if (centre) {
    const host = await hostOf(run, design, first.plane);
    if (!host) throw new Error(`no flat face under the middle of ${first.name} to centre it on`);
    [du, dv] = centring(host.extent, centre);
    face = `${host.face} of ${host.body}`;
  }
  du += by?.[0] ?? 0;
  dv += by?.[1] ?? 0;
  const turn = rotate ?? 0;
  // Every sketch of the logo shares the plane through its middle, so all turn about the same point.
  const planeOf = (plane: SketchPlane) => (turn === 0 ? movedPlane(plane, du, dv) : rotatedPlane(movedPlane(plane, du, dv), turn));
  const steps: Step[] = [];
  if (width !== null) {
    const box = boxOf(sketches, read);
    if (!box || box[2] - box[0] <= 0) throw new Error(`${first.name} has no drawing PartBuddy can measure`);
    const factor = width / (box[2] - box[0]);
    // Every sketch's middle is its origin: each scales about [0, 0] and the pieces stay together.
    if (Math.abs(factor - 1) > 1e-6) for (const sketch of sketches) steps.push(...scaleSteps(sketch.id, read.get(sketch.id), factor));
  }
  if (du !== 0 || dv !== 0 || turn !== 0) steps.push(...sketches.map((sketch) => ({ command: 'sketch.redefine', params: { sketch: sketch.id, plane: planeOf(sketch.plane) } })));
  if (depth !== null) {
    const now = await depthOf(run, design, sketches);
    if (!now) throw new Error(`${first.name} is not built by an extrusion whose depth PartBuddy can set`);
    for (const param of now.params) steps.push({ command: 'parameters.change', params: { name: param.name, expression: `${String(Math.round(param.sign * depth * 1000) / 1000)} mm` } });
  }
  return {
    name: first.name,
    steps,
    by: [du, dv],
    origin: movedPlane(first.plane, du, dv).origin,
    angle: planeAngle(planeOf(first.plane)),
    face,
    bodies: touched(design, first),
  };
}

export interface LogoSpot {
  /** The sketch name, "SVG-Logo <name>". */
  logo: string;
  /** Where the logo's middle sits from its face's middle, along the logo's x and y; null without a flat face under it. */
  offset: [number, number] | null;
  plane: SketchPlane;
  /** The drawing's box in its plane, around the middle: [min x, min y, max x, max y] in mm. */
  box: [number, number, number, number];
  /** How deep (cut in) or high (built up) it is, or null when no extrusion of it has a distance to set. */
  depth: { value: number; raised: boolean } | null;
  /** How far it is turned from level, in degrees counter-clockwise. */
  angle: number;
}

/** The logo a picked point belongs to: within its drawing's box seen along the sketch's normal, nearest to its plane. */
export async function logoAt(run: Run, point: Vec3): Promise<LogoSpot | null> {
  const design = await inspect(run);
  const { logos, read } = await readLogos(run, design);
  let best: { sketch: PlacedSketch; distance: number; box: [number, number, number, number] } | null = null;
  for (const group of logos.values()) {
    const sketch = group[0];
    const box = boxOf(group, read);
    if (!sketch || !box) continue;
    const [u, v] = inPlane(sketch.plane, point);
    const [minU, minV, maxU, maxV] = box;
    const { x_dir: x, y_dir: y, origin } = sketch.plane;
    const normal: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    const distance = Math.abs(normal.reduce((sum, n, k) => sum + n * ((point[k] ?? 0) - (origin[k] ?? 0)), 0));
    const inside = u >= minU - 0.5 && u <= maxU + 0.5 && v >= minV - 0.5 && v <= maxV + 0.5;
    if (inside && distance <= REACH_MM && (!best || distance < best.distance)) best = { sketch, distance, box: [minU, minV, maxU, maxV] };
  }
  if (!best) return null;
  const first = best.sketch;
  const host = await hostOf(run, design, first.plane);
  const middle = host ? centring(host.extent, 'both') : null;
  const tidy = (value: number) => Math.round(value * 1000) / 1000 || 0;
  const depth = await depthOf(run, design, logos.get(first.name) ?? [first]);
  return {
    logo: first.name,
    offset: middle ? [tidy(-middle[0]), tidy(-middle[1])] : null,
    plane: first.plane,
    box: best.box.map(tidy) as LogoSpot['box'],
    depth: depth && { value: tidy(depth.depth), raised: depth.params[0]?.sign === 1 },
    angle: planeAngle(first.plane),
  };
}
