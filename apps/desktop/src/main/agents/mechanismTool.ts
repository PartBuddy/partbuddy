import { LIP, hingeProblem, hingeSteps, lipProblem, lipSteps, pinDiameter, slideProblem, slideSteps, type HingeSpec, type LipSpec, type SlideSpec } from '../../shared/mechanisms';
import { componentOf } from '../solidcraft/actions';
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
    'the line must lie closer to both bodies than the barrel radius less 0.5 mm, so the knuckles grow out of them; it needs no distance from their walls, because PartBuddy cuts each knuckle\'s room in the other body itself. ' +
    'slide: a dovetail rail on the fixed body and its groove in the moving body, which lies over the rail a gap above the face. Give the middle line of the rail (from, to) on that face and the face normal (up). ' +
    'PartBuddy also joins the two with a joint, finds how far it moves before the bodies meet (a slide: while the moving body stays on its rail) and sets that as its limits; the user then moves it with a slider in the view. ' +
    'closure: a snap closure between a lid and its box, nothing standing out: a lip inside the lid that goes into the box along its wall and centres the lid, a bead that snaps into a rille of the box\'s wall, and a notch for a fingernail. ' +
    'Give from and to as opposite corners of the lid\'s inner room at its rim (both at the rim\'s height), up as the way the lip stands out of the lid (+Z when the lid lies open side up, -Z when it sits on the box), wall and radius of the lid, and the side with the catch (a long wall, opposite the hinge). ' +
    'When the lid is built open beside the box and closes on a hinge, give the hinge line too (hinge_from, hinge_to), so the rille lands where the bead closes. It makes no joint. ' +
    'Use this instead of modelling a hinge, a guide or a snap lid yourself.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['hinge', 'slide', 'closure'], description: 'hinge: turns about a line; slide: moves along a line; closure: a lid snaps shut on its box.' },
      fixed: { type: 'string', description: 'The body that stays (exact name); it carries the pin or the rail. closure: the box.' },
      moving: { type: 'string', description: 'The body that moves (exact name). closure: the lid.' },
      from: { ...vector, description: 'One end of the line in mm. closure: one corner of the lid\'s inner room at its rim.' },
      to: { ...vector, description: 'The other end of the line in mm. closure: the opposite corner, at the same height.' },
      up: { ...vector, description: 'slide: the normal of the face of the fixed body the rail stands on; default +Z. closure: the way the lip stands out of the lid, +Z or -Z; default +Z.' },
      side: { type: 'string', enum: ['x-', 'x+', 'y-', 'y+'], description: 'closure: the wall of the lid\'s inner room with the catch and the notch.' },
      wall: { type: 'number', minimum: 1.6, maximum: 10, description: 'closure: the lid\'s wall thickness in mm; default 2.' },
      radius: { type: 'number', minimum: 0, maximum: 100, description: 'closure: the radius of the inner room\'s corners in mm; default 0 (sharp).' },
      hinge_from: { ...vector, description: 'closure: one end of the hinge line the lid closes about, when it is built open.' },
      hinge_to: { ...vector, description: 'closure: the other end of that line; it runs along X or along Y.' },
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

/** The closure the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function lipOf(args: Record<string, unknown>): LipSpec | string {
  const base = common(args, 0.4, 'Closure');
  if (typeof base === 'string') return base;
  const { from, to } = base;
  if (Math.abs(from[2] - to[2]) > 1e-6) return 'from and to must both lie at the height of the lid\'s rim';
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up || Math.abs(up[0]) > 1e-6 || Math.abs(up[1]) > 1e-6 || Math.abs(up[2]) < 1e-6) return 'up must be +Z (the lid lies open side up) or -Z (the lid sits on the box)';
  const side = args.side;
  if (side !== 'x-' && side !== 'x+' && side !== 'y-' && side !== 'y+') return 'side must be x-, x+, y- or y+: the wall with the catch';
  let hinge: LipSpec['hinge'];
  if (args.hinge_from !== undefined || args.hinge_to !== undefined) {
    const [a, b] = [vec3(args.hinge_from), vec3(args.hinge_to)];
    if (!a || !b) return 'hinge_from and hinge_to must both be three numbers';
    const alongX = Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[0] - b[0]) > 1e-6;
    const alongY = Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) > 1e-6;
    if (Math.abs(a[2] - b[2]) > 1e-6 || alongX === alongY) return 'the hinge line must run level, along X or along Y';
    hinge = alongX ? { along: 'x', across: a[1], z: a[2] } : { along: 'y', across: a[0], z: a[2] };
  }
  const spec: LipSpec = {
    fixed: base.fixed,
    moving: base.moving,
    min: [Math.min(from[0], to[0]), Math.min(from[1], to[1])],
    max: [Math.max(from[0], to[0]), Math.max(from[1], to[1])],
    rim: from[2],
    up: up[2] > 0 ? 1 : -1,
    radius: typeof args.radius === 'number' ? args.radius : 0,
    wall: typeof args.wall === 'number' ? args.wall : 2,
    side,
    ...(hinge ? { hinge } : {}),
    name: base.name,
  };
  return lipProblem(spec) ?? spec;
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

/**
 * The steps with each one's component made active first. Geometry built from the design level
 * onto a body that is a component stays where it is when a joint moves the body (SolidCraft
 * 0.40.0-rc.3, practice run 2026-11-10: lips added to a hinged lid hung in the air once it
 * closed); built with the body's component active it moves along. A sketch belongs to the
 * component of the step that uses it. Ends at the design level.
 */
export function activated(steps: Step[], listing: unknown): Step[] {
  const out: Step[] = [];
  let active = 0;
  for (const [i, step] of steps.entries()) {
    const target = steps.slice(i).find((later) => Array.isArray(later.params.targets))?.params.targets as unknown[] | undefined;
    const component = typeof target?.[0] === 'string' ? componentOf(listing, target[0]) : 0;
    if (component !== active) out.push({ command: 'component.activate', params: { component } });
    active = component;
    out.push(step);
  }
  if (active !== 0) out.push({ command: 'component.activate', params: { component: 0 } });
  return out;
}

/**
 * Builds the solids. A joined piece that does not touch its body stays in it as a separate piece,
 * and SolidCraft says so in the step's warning (0.40.0-rc.3: "… is now in 2 separate pieces"); it
 * means the line is not where the bodies are: everything is taken back (practice run 2026-11-10: the model kept a gap between the
 * hinge line and the walls, mended the loose knuckles with webs, and their warnings stayed in the
 * timeline), and `where` tells the model where the line goes. Volume the two still share is a warning.
 */
async function build(upstream: UpstreamTools, run: Run, spec: { fixed: string; moving: string }, steps: Step[], where: string, callId: string | undefined): Promise<string> {
  const before = jsonOf(await upstream.callTool('inspect_design', {}, callId)) as { bodies?: { name?: unknown }[]; undo?: unknown };
  const bodies = (before.bodies ?? []).map((body) => body.name);
  const missing = [spec.fixed, spec.moving].filter((name) => !bodies.includes(name));
  if (missing.length > 0) throw new Error(`no body ${missing.map((name) => JSON.stringify(name)).join(' or ')}; the bodies are ${bodies.map((name) => JSON.stringify(name)).join(', ') || 'none'}`);
  // The line is given in the world as designed: with a joint away from 0 its bodies stand elsewhere.
  const [listing, joints] = await run([
    { command: 'component.list', params: {} },
    { command: 'joint.list', params: {} },
  ]);
  const away = (((joints as { joints?: { name?: unknown; values?: { value?: unknown }[] }[] } | undefined)?.joints ?? []) as { name?: unknown; values?: { value?: unknown }[] }[])
    .filter((joint) => (joint.values ?? []).some((value) => typeof value.value === 'number' && Math.abs(value.value) > 1e-6))
    .map((joint) => String(joint.name));
  if (away.length > 0) throw new Error(`the joint(s) ${away.map((name) => JSON.stringify(name)).join(', ')} stand away from 0; drive them back with joint.drive first, so the bodies are where they were designed`);
  const built = await run(activated(steps, listing));
  const apart = built.filter((result) => {
    const warning = (result as { warning?: unknown } | undefined)?.warning;
    return typeof warning === 'string' && warning.includes('separate pieces');
  }).length;
  const [after, clash] = await run([
    { command: 'document.inspect', params: {} },
    { command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } },
  ]);
  const overlaps = ((clash as { count?: unknown } | undefined)?.count as number | undefined) ?? 0;
  if (apart > 0) {
    const loose = `${String(apart)} piece(s) did not touch their body and stand apart from it. ${where}`;
    const undone = (after as { undo?: unknown } | undefined)?.undo;
    if (typeof before.undo !== 'number' || typeof undone !== 'number' || undone <= before.undo) throw new Error(`${loose} Undo what was built, then call again.`);
    for (let step = before.undo; step < undone; step += 1) await upstream.callTool('undo', {}, callId);
    throw new Error(`${loose} Everything was taken back; call again with the line moved.`);
  }
  return overlaps > 0 ? ' Warning: the two bodies still share volume away from the mechanism; make room between them.' : '';
}

/** Makes the two bodies components unless they are, joins them where they are and sets the limits: the range clear of contact within `range`. */
async function join(run: Run, spec: { fixed: string; moving: string; from: Vec3; to: Vec3; name: string }, type: 'revolute' | 'slider', range: [number, number], step: number): Promise<[number, number] | string> {
  let [listing] = await run([{ command: 'component.list', params: {} }]);
  const loners = [spec.fixed, spec.moving].filter((name) => occurrenceOf(listing, name) === null);
  if (loners.length > 0) [, listing] = await run([{ command: 'component.from_bodies', params: { bodies: loners } }, { command: 'component.list', params: {} }]);
  const a = occurrenceOf(listing, spec.fixed);
  const b = occurrenceOf(listing, spec.moving);
  if (!a || !b) throw new Error('the solids are built, but the bodies did not become components; join them with joint.as_built');
  const middle = spec.from.map((value, i) => (value + (spec.to[i] ?? value)) / 2);
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const sweeps = range.filter((to) => to !== 0).map((to) => ({ command: 'joint.sweep', params: { joint: spec.name, from: 0, to } }));
  await run([{ command: 'joint.as_built', params: { type, a, b, at: { occurrence: a, point: middle, z: axis }, name: spec.name, quiet: true } }]);
  // SolidCraft refuses a sweep it cannot afford, such as parts that lie against each other along the way: the joint stays, without limits.
  let results: unknown[];
  try {
    results = await run(sweeps);
  } catch (cause) {
    return (cause as Error).message.replace(/^SolidCraft refused joint\.sweep: /, '');
  }
  const limit = (to: number) => (to === 0 ? 0 : reach(results[sweeps.findIndex((sweep) => sweep.params.to === to)], to, step));
  const limits: [number, number] = [limit(range[0]), limit(range[1])];
  await run([{ command: 'joint.limits', params: { joint: spec.name, min: limits[0], max: limits[1] } }]);
  return limits;
}

const MOVE = 'The user moves it with the slider "Moving parts" in the view.';

/** What the model hears when the joint is made but its range could not be found. */
const unswept = (reason: string) =>
  `SolidCraft could not run it through its range (${reason.slice(0, 160)}), so no limits are set. The two bodies probably lie against each other somewhere: look with inspect.clearance, make room, then set joint.limits yourself after joint.sweep.`;

async function buildMechanism(upstream: UpstreamTools, args: Record<string, unknown>, nozzle: number, callId: string | undefined): Promise<string> {
  const run: Run = async (commands) => {
    const reply = jsonOf(await upstream.callTool('batch', { commands }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
    if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 200)}`);
    return reply.results ?? [];
  };
  if (args.kind === 'hinge') {
    const spec = hingeOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const reach = String(Math.round((spec.diameter / 2 - 0.5) * 10) / 10);
    const warnings = await build(
      upstream,
      run,
      spec,
      hingeSteps(spec),
      `Put the hinge line within ${reach} mm of both bodies (the barrel is ${String(spec.diameter)} mm, so it must overlap each by at least 0.5 mm). It needs no distance from their walls: PartBuddy cuts each knuckle's room in the other body itself.`,
      callId,
    );
    const range = await join(run, spec, 'revolute', [-180, 180], 1);
    if (typeof range === 'string') return `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns) and joined them, but ${unswept(range)}${warnings}`;
    const [min, max] = range;
    return (
      `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns): ${String(spec.knuckles)} knuckles, barrel ${String(spec.diameter)} mm, pin ${String(pinDiameter(spec.diameter))} mm, ` +
      `gap ${String(spec.gap)} mm everywhere. It turns from ${String(min)}° to ${String(max)}° before the bodies meet, and those are its limits now; 0° is as designed. ` +
      `${MOVE} If it should open further, make room where the bodies meet and set joint.limits again.${warnings}`
    );
  }
  if (args.kind === 'slide') {
    const spec = slideOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(upstream, run, spec, slideSteps(spec), `Put the line from–to on a face of ${spec.fixed}, with up as that face's normal, so the rail stands on it.`, callId);
    const [measure] = await run([{ command: 'inspect.measure', params: { bodies: [spec.moving] } }]);
    const travel = railTravel(measure, spec.from, spec.to);
    if (!travel) throw new Error('the guide is built, but the moving body could not be measured; join the bodies with joint.as_built {type: slider}');
    const range = await join(run, spec, 'slider', travel, 0.1);
    if (typeof range === 'string') return `Built the guide "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (slides) and joined them, but ${unswept(range)}${warnings}`;
    const [min, max] = range;
    const mm = (value: number) => String(Math.round(value * 10) / 10);
    return (
      `Built the guide "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (slides): a dovetail rail ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high, ` +
      `gap ${String(spec.gap)} mm everywhere. It slides from ${mm(min)} mm to ${mm(max)} mm while ${spec.moving} stays on the rail and the bodies do not meet, and those are its limits now; 0 mm is as designed. ` +
      `${MOVE} Nothing holds it at the ends of the rail; add stops if it must not come off.${warnings}`
    );
  }
  if (args.kind === 'closure') {
    const spec = lipOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(upstream, run, spec, lipSteps(spec), `Give from and to as opposite corners of the inner room of ${spec.moving} at its rim, so the lip lies on its wall.`, callId);
    return (
      `Built the closure "${spec.name}" between ${spec.fixed} (the box) and ${spec.moving} (the lid): a lip ${String(LIP.thick)} mm thick and ${String(LIP.high)} mm high inside the lid, ${String(LIP.clear)} mm clear of the box's wall, a bead that snaps ${String(LIP.bead - LIP.clear)} mm into a rille of that wall, and a notch in the lid's rim to open it. It makes no joint and needs no room outside the box. Keep the box's wall straight and at least 1.6 mm thick where the lip goes in.${warnings}`
    );
  }
  throw new Error('kind must be hinge, slide or closure');
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
export const MECHANISM_GUIDANCE = `For a hinge (a lid that folds, a flap, a clamp that opens) or a guide (a drawer, a slider, a carriage on a rail) call ${MECHANISM_TOOL} once both bodies exist instead of modelling knuckles, a pin or a rail yourself: it builds the print-in-place geometry with the right gaps, joins the bodies and sets the limits. For a lid that should hold shut by itself (a box, a case, a container) call it with kind closure instead of modelling a latch, a hook or a clip: a lip with a snap bead inside the lid, nothing standing out and no wall cut through.`;
