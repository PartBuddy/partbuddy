import { hingeProblem, hingeSteps, pinDiameter, slideProblem, slideSteps, type HingeSpec, type SlideSpec } from '../../shared/mechanisms';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * `partbuddy_mechanism` (ADR 0027, plan step G3): the assistant asks for a mechanism between two
 * bodies and PartBuddy builds proven print-in-place geometry, joins the bodies with SolidCraft's
 * joint, runs the joint through its range and sets the limits where the parts meet. The model
 * decides where it goes; gaps, knuckles, flanks and the joint do not depend on it.
 */

export const MECHANISM_TOOL = 'partbuddy_mechanism';

const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const mechanismTool: UpstreamTool = {
  name: MECHANISM_TOOL,
  description:
    'Build a print-in-place mechanism between two bodies that exist, printed in one piece without support, with the same gap everywhere. ' +
    'hinge: knuckles in turn on both bodies and a pin through them. Give the hinge line (from, to) in the gap between the bodies, level with the bed and half the barrel diameter above it when the part prints lying flat; ' +
    'the bodies should reach to within the barrel radius of that line, so the knuckles grow out of them. ' +
    'slide: a dovetail rail on the fixed body and its groove in the moving body, which lies over the rail a gap above the face. Give the middle line of the rail (from, to) on that face and the face normal (up). ' +
    'PartBuddy also joins the two with a joint, finds how far it moves before the bodies meet (a slide: while the moving body stays on its rail) and sets that as its limits; the user then moves it with a slider in the view. ' +
    'Use this instead of modelling a hinge or a guide yourself.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['hinge', 'slide'], description: 'hinge: turns about a line; slide: moves along a line.' },
      fixed: { type: 'string', description: 'The body that stays (exact name); it carries the pin or the rail.' },
      moving: { type: 'string', description: 'The body that moves (exact name).' },
      from: { ...vector, description: 'One end of the line in mm.' },
      to: { ...vector, description: 'The other end of the line in mm.' },
      up: { ...vector, description: 'slide: the normal of the face of the fixed body the rail stands on; default +Z.' },
      diameter: { type: 'number', minimum: 4, maximum: 40, description: 'hinge: outer diameter of the barrel in mm; default 6. The pin is half of it.' },
      knuckles: { type: 'integer', enum: [3, 5, 7, 9], description: 'hinge: how many knuckles; default by the length of the line.' },
      width: { type: 'number', minimum: 2, maximum: 60, description: 'slide: width of the rail at its foot in mm; default 6. It widens by its height on each side.' },
      height: { type: 'number', minimum: 1.5, maximum: 20, description: 'slide: height of the rail in mm; default 3.' },
      gap: { type: 'number', minimum: 0.2, maximum: 1, description: "The gap between the parts in mm; default the printer's nozzle, at least 0.3." },
      name: { type: 'string', maxLength: 60, description: "The mechanism's name in the user's language, e.g. \"Lid hinge\"." },
    },
    required: ['kind', 'fixed', 'moving', 'from', 'to'],
    additionalProperties: false,
  },
};

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

const vec3 = (value: unknown): Vec3 | null =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as Vec3) : null;

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (result.isError || typeof text !== 'string') throw new Error(typeof text === 'string' ? text.slice(0, 300) : 'SolidCraft gave no answer');
  return JSON.parse(text) as unknown;
}

/** What both kinds share: the two bodies, the line, the gap by the rule of the refined designs (F13: one nozzle, at least 0.3 mm) and the name. */
interface Shared {
  fixed: string;
  moving: string;
  from: Vec3;
  to: Vec3;
  gap: number;
  name: string;
  length: number;
}

function common(args: Record<string, unknown>, nozzle: number, name: string): Shared | string {
  const stays = typeof args.fixed === 'string' ? args.fixed.trim() : '';
  const moves = typeof args.moving === 'string' ? args.moving.trim() : '';
  const from = vec3(args.from);
  const to = vec3(args.to);
  if (!stays || !moves || !from || !to) return 'fixed, moving, from and to are needed';
  const length = Math.hypot(...to.map((value, i) => value - (from[i] ?? 0)));
  if (length < 1e-6) return 'from and to must be two points';
  const shared: Shared = {
    fixed: stays,
    moving: moves,
    from,
    to,
    length,
    gap: typeof args.gap === 'number' ? args.gap : Math.min(1, Math.max(0.3, nozzle)),
    name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim().slice(0, 60) : name,
  };
  return shared;
}

/** The hinge the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function hingeOf(args: Record<string, unknown>, nozzle: number): HingeSpec | string {
  const base = common(args, nozzle, 'Hinge');
  if (typeof base === 'string') return base;
  const { length, ...rest } = base;
  const spec: HingeSpec = {
    ...rest,
    diameter: typeof args.diameter === 'number' ? args.diameter : 6,
    knuckles: typeof args.knuckles === 'number' ? args.knuckles : length < 40 ? 3 : length < 90 ? 5 : 7,
  };
  return hingeProblem(spec) ?? spec;
}

/** The guide the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function slideOf(args: Record<string, unknown>, nozzle: number): SlideSpec | string {
  const base = common(args, nozzle, 'Guide');
  if (typeof base === 'string') return base;
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec: SlideSpec = { fixed: base.fixed, moving: base.moving, from: base.from, to: base.to, gap: base.gap, name: base.name, up, width: typeof args.width === 'number' ? args.width : 6, height: typeof args.height === 'number' ? args.height : 3 };
  return slideProblem(spec) ?? spec;
}

/** The occurrence that places a body, from `component.list`; null while the body is still in the design itself. */
export function occurrenceOf(listing: unknown, body: string): string | null {
  const components = (listing as { components?: unknown } | undefined)?.components;
  if (!Array.isArray(components)) return null;
  for (const entry of components as { parent?: unknown; bodies?: unknown; occurrences?: unknown }[]) {
    if (entry.parent === null || !Array.isArray(entry.bodies) || !entry.bodies.includes(body)) continue;
    const name = (Array.isArray(entry.occurrences) ? (entry.occurrences[0] as { name?: unknown } | undefined) : undefined)?.name;
    if (typeof name === 'string') return name;
  }
  return null;
}

/**
 * How far a slide may travel while the moving body stays on its rail: from the body's box
 * (`inspect.measure`) along the line. A body longer than the rail gets no travel that way.
 */
export function railTravel(measure: unknown, from: Vec3, to: Vec3): [number, number] | null {
  const box = ((measure as { bodies?: { bbox?: { min?: unknown; max?: unknown } }[] } | undefined)?.bodies ?? [])[0]?.bbox;
  const min = vec3(box?.min);
  const max = vec3(box?.max);
  if (!min || !max) return null;
  const delta = to.map((value, i) => value - (from[i] ?? 0));
  const length = Math.hypot(...delta);
  const along = [0, 1, 2, 3, 4, 5, 6, 7].map((corner) =>
    [0, 1, 2].reduce((sum, i) => sum + ((((corner >> i) & 1 ? max[i] : min[i]) ?? 0) - (from[i] ?? 0)) * ((delta[i] ?? 0) / length), 0),
  );
  const round = (value: number) => Math.round(value * 10) / 10;
  return [round(Math.min(0, -Math.min(...along))), round(Math.max(0, length - Math.max(...along)))];
}

/** How far a sweep ran before two parts met, cut towards zero so the limit is clear of the contact; `to` when it ran through. */
function reach(sweep: unknown, to: number, step: number): number {
  const stopped = (sweep as { stopped_at?: unknown } | undefined)?.stopped_at;
  return typeof stopped === 'number' && Number.isFinite(stopped) ? Math.trunc(stopped / step) * step : to;
}

type Run = (commands: Step[]) => Promise<unknown[]>;

/** Builds the solids and says what went wrong with them: a piece that came loose as a body of its own, or volume the two still share. */
async function build(upstream: UpstreamTools, run: Run, spec: { fixed: string; moving: string }, steps: Step[], callId: string | undefined): Promise<string> {
  const bodies = ((jsonOf(await upstream.callTool('inspect_design', {}, callId)) as { bodies?: { name?: unknown }[] }).bodies ?? []).map((body) => body.name);
  const missing = [spec.fixed, spec.moving].filter((name) => !bodies.includes(name));
  if (missing.length > 0) throw new Error(`no body ${missing.map((name) => JSON.stringify(name)).join(' or ')}; the bodies are ${bodies.map((name) => JSON.stringify(name)).join(', ') || 'none'}`);
  await run(steps);
  const [after, clash] = await run([
    { command: 'document.inspect', params: {} },
    { command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } },
  ]);
  const count = ((after as { bodies?: unknown[] } | undefined)?.bodies ?? []).length;
  const overlaps = ((clash as { count?: unknown } | undefined)?.count as number | undefined) ?? 0;
  return (
    (count > bodies.length ? ` Warning: ${String(count - bodies.length)} piece(s) came loose as bodies of their own: a body does not reach the line, so move the line or the body and undo this.` : '') +
    (overlaps > 0 ? ' Warning: the two bodies still share volume away from the mechanism; make room between them.' : '')
  );
}

/** Makes the two bodies components unless they are, joins them where they are and sets the limits: the range clear of contact within `range`. */
async function join(run: Run, spec: { fixed: string; moving: string; from: Vec3; to: Vec3; name: string }, type: 'revolute' | 'slider', range: [number, number], step: number): Promise<[number, number]> {
  let [listing] = await run([{ command: 'component.list', params: {} }]);
  const loners = [spec.fixed, spec.moving].filter((name) => occurrenceOf(listing, name) === null);
  if (loners.length > 0) [, listing] = await run([{ command: 'component.from_bodies', params: { bodies: loners } }, { command: 'component.list', params: {} }]);
  const a = occurrenceOf(listing, spec.fixed);
  const b = occurrenceOf(listing, spec.moving);
  if (!a || !b) throw new Error('the solids are built, but the bodies did not become components; join them with joint.as_built');
  const middle = spec.from.map((value, i) => (value + (spec.to[i] ?? value)) / 2);
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const sweeps = range.filter((to) => to !== 0).map((to) => ({ command: 'joint.sweep', params: { joint: spec.name, from: 0, to } }));
  const results = await run([{ command: 'joint.as_built', params: { type, a, b, at: { occurrence: a, point: middle, z: axis }, name: spec.name, quiet: true } }, ...sweeps]);
  const limit = (to: number) => (to === 0 ? 0 : reach(results[1 + sweeps.findIndex((sweep) => sweep.params.to === to)], to, step));
  const limits: [number, number] = [limit(range[0]), limit(range[1])];
  await run([{ command: 'joint.limits', params: { joint: spec.name, min: limits[0], max: limits[1] } }]);
  return limits;
}

const MOVE = 'The user moves it with the slider "Moving parts" in the view.';

async function buildMechanism(upstream: UpstreamTools, args: Record<string, unknown>, nozzle: number, callId: string | undefined): Promise<string> {
  const run: Run = async (commands) => {
    const reply = jsonOf(await upstream.callTool('batch', { commands }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
    if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 200)}`);
    return reply.results ?? [];
  };
  if (args.kind === 'hinge') {
    const spec = hingeOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(upstream, run, spec, hingeSteps(spec), callId);
    const [min, max] = await join(run, spec, 'revolute', [-180, 180], 1);
    return (
      `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns): ${String(spec.knuckles)} knuckles, barrel ${String(spec.diameter)} mm, pin ${String(pinDiameter(spec.diameter))} mm, ` +
      `gap ${String(spec.gap)} mm everywhere. It turns from ${String(min)}° to ${String(max)}° before the bodies meet, and those are its limits now; 0° is as designed. ` +
      `${MOVE} If it should open further, make room where the bodies meet and set joint.limits again.${warnings}`
    );
  }
  if (args.kind === 'slide') {
    const spec = slideOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(upstream, run, spec, slideSteps(spec), callId);
    const [measure] = await run([{ command: 'inspect.measure', params: { bodies: [spec.moving] } }]);
    const travel = railTravel(measure, spec.from, spec.to);
    if (!travel) throw new Error('the guide is built, but the moving body could not be measured; join the bodies with joint.as_built {type: slider}');
    const [min, max] = await join(run, spec, 'slider', travel, 0.1);
    const mm = (value: number) => String(Math.round(value * 10) / 10);
    return (
      `Built the guide "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (slides): a dovetail rail ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high, ` +
      `gap ${String(spec.gap)} mm everywhere. It slides from ${mm(min)} mm to ${mm(max)} mm while ${spec.moving} stays on the rail and the bodies do not meet, and those are its limits now; 0 mm is as designed. ` +
      `${MOVE} Nothing holds it at the ends of the rail; add stops if it must not come off.${warnings}`
    );
  }
  throw new Error('kind must be hinge or slide');
}

/** The upstream tools plus `partbuddy_mechanism`; `nozzle` is the printer's nozzle in use, for the default gap. */
export function withMechanismTool(upstream: UpstreamTools, nozzle: () => number): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), mechanismTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== MECHANISM_TOOL) return upstream.callTool(name, args, callId);
      try {
        return { content: [{ type: 'text', text: await buildMechanism(upstream, args, nozzle(), callId) }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route, after the joint guidance. */
export const MECHANISM_GUIDANCE = `For a hinge (a lid that folds, a flap, a clamp that opens) or a guide (a drawer, a slider, a carriage on a rail) call ${MECHANISM_TOOL} once both bodies exist instead of modelling knuckles, a pin or a rail yourself: it builds the print-in-place geometry with the right gaps, joins the bodies and sets the limits.`;
