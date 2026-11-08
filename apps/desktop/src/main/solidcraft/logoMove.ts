import { sketchFromInspect, tessellateSketch } from '@partbuddy/geometry';

import { centring, hostFace, inPlane, LOGO_PREFIX, movedPlane, placedLogos, type CentreAxis, type PlacedSketch, type SketchPlane, type Vec3 } from '../../shared/drawingPlacement';

/**
 * Moving a placed logo, shared by the assistant's `partbuddy_move_drawing` and the logo controls
 * in the selection dock: which logo a picked point belongs to, how far it sits from its face's
 * middle, and the `sketch.redefine` steps that move it (drawingPlacement.ts has the geometry).
 */

export type Step = { command: string; params: Record<string, unknown> };
/** Runs engine commands in one batch, without rolling back, and gives their results; throws on a refusal. */
export type Run = (commands: Step[]) => Promise<unknown[]>;

type Body = { name?: unknown; bbox?: { min?: number[]; max?: number[] } };
type Design = { bodies?: Body[]; sketches?: unknown };

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

/** The steps that move a logo: onto its face's middle along `centre` first, then by `by`. */
export async function planLogoMove(run: Run, logo: string, by: [number, number] | null, centre: CentreAxis | null): Promise<LogoMove> {
  const design = await inspect(run);
  const { logos } = await readLogos(run, design);
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
  return {
    name: first.name,
    steps: sketches.map((sketch) => ({ command: 'sketch.redefine', params: { sketch: sketch.id, plane: movedPlane(sketch.plane, du, dv) } })),
    by: [du, dv],
    origin: movedPlane(first.plane, du, dv).origin,
    face,
    bodies: touched(design, first),
  };
}

export interface LogoSpot {
  /** The sketch name, "Logo <name>". */
  logo: string;
  /** Where the logo's middle sits from its face's middle, along the logo's x and y; null without a flat face under it. */
  offset: [number, number] | null;
  plane: SketchPlane;
  /** The drawing's box in its plane, around the middle: [min x, min y, max x, max y] in mm. */
  box: [number, number, number, number];
}

/** The logo a picked point belongs to: within its drawing's box seen along the sketch's normal, nearest to its plane. */
export async function logoAt(run: Run, point: Vec3): Promise<LogoSpot | null> {
  const design = await inspect(run);
  const { logos, read } = await readLogos(run, design);
  let best: { sketch: PlacedSketch; distance: number; box: [number, number, number, number] } | null = null;
  for (const sketch of [...logos.values()].flat()) {
    let positions: Float32Array;
    try {
      positions = tessellateSketch(sketchFromInspect(read.get(sketch.id))).positions;
    } catch {
      continue;
    }
    const [u, v] = inPlane(sketch.plane, point);
    let [minU, minV, maxU, maxV] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let p = 0; p + 2 < positions.length; p += 3) {
      const [a, b] = inPlane(sketch.plane, [positions[p] ?? 0, positions[p + 1] ?? 0, positions[p + 2] ?? 0]);
      [minU, minV, maxU, maxV] = [Math.min(minU, a), Math.min(minV, b), Math.max(maxU, a), Math.max(maxV, b)];
    }
    const { x_dir: x, y_dir: y, origin } = sketch.plane;
    const normal: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    const distance = Math.abs(normal.reduce((sum, n, k) => sum + n * ((point[k] ?? 0) - (origin[k] ?? 0)), 0));
    const inside = u >= minU - 0.5 && u <= maxU + 0.5 && v >= minV - 0.5 && v <= maxV + 0.5;
    if (inside && distance <= REACH_MM && (!best || distance < best.distance)) best = { sketch, distance, box: [minU, minV, maxU, maxV] };
  }
  if (!best) return null;
  const first = logos.get(best.sketch.name)?.[0] ?? best.sketch;
  const host = await hostOf(run, design, first.plane);
  const middle = host ? centring(host.extent, 'both') : null;
  const tidy = (value: number) => Math.round(value * 1000) / 1000 || 0;
  return { logo: first.name, offset: middle ? [tidy(-middle[0]), tidy(-middle[1])] : null, plane: first.plane, box: best.box.map(tidy) as LogoSpot['box'] };
}
