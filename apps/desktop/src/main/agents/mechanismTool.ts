import { hingeProblem, hingeSteps, pinDiameter, type HingeSpec } from '../../shared/mechanisms';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * `partbuddy_mechanism` (ADR 0027, plan step G3): the assistant asks for a mechanism between two
 * bodies and PartBuddy builds proven print-in-place geometry, joins the bodies with SolidCraft's
 * joint, runs the joint through its range and sets the limits where the parts meet. The model
 * decides where it goes; gaps, knuckles and the joint do not depend on it.
 */

export const MECHANISM_TOOL = 'partbuddy_mechanism';

const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const mechanismTool: UpstreamTool = {
  name: MECHANISM_TOOL,
  description:
    'Build a print-in-place hinge between two bodies that exist: knuckles in turn on both, a pin through them, the same gap everywhere, printed in one piece without support. ' +
    'PartBuddy also joins the two with a joint, finds how far it turns before the bodies meet and sets that as its limits; the user then moves it with a slider in the view. ' +
    'Give the hinge line (from, to) in the gap between the two bodies, level with the bed and half the barrel diameter above it when the part prints lying flat; ' +
    'the bodies should reach to within the barrel radius of that line, so the knuckles grow out of them. Use this instead of modelling a hinge yourself.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['hinge'], description: 'The mechanism; a hinge for now.' },
      fixed: { type: 'string', description: 'The body that stays (exact name); it carries the pin.' },
      moving: { type: 'string', description: 'The body that turns (exact name).' },
      from: { ...vector, description: 'One end of the hinge line in mm.' },
      to: { ...vector, description: 'The other end of the hinge line in mm.' },
      diameter: { type: 'number', minimum: 4, maximum: 40, description: 'Outer diameter of the barrel in mm; default 6. The pin is half of it.' },
      knuckles: { type: 'integer', enum: [3, 5, 7, 9], description: 'How many knuckles; default by the length of the hinge line.' },
      gap: { type: 'number', minimum: 0.2, maximum: 1, description: "The gap between the parts in mm; default the printer's nozzle, at least 0.3." },
      name: { type: 'string', maxLength: 60, description: "The hinge's name in the user's language, e.g. \"Lid hinge\"." },
    },
    required: ['kind', 'fixed', 'moving', 'from', 'to'],
    additionalProperties: false,
  },
};

const vec3 = (value: unknown): [number, number, number] | null =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as [number, number, number]) : null;

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (result.isError || typeof text !== 'string') throw new Error(typeof text === 'string' ? text.slice(0, 300) : 'SolidCraft gave no answer');
  return JSON.parse(text) as unknown;
}

/** The hinge the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function hingeOf(args: Record<string, unknown>, nozzle: number): HingeSpec | string {
  const fixed = typeof args.fixed === 'string' ? args.fixed.trim() : '';
  const moving = typeof args.moving === 'string' ? args.moving.trim() : '';
  const from = vec3(args.from);
  const to = vec3(args.to);
  if (!fixed || !moving || !from || !to) return 'fixed, moving, from and to are needed';
  const length = Math.hypot(...to.map((value, i) => value - (from[i] ?? 0)));
  if (length < 1e-6) return 'from and to must be two points';
  const spec: HingeSpec = {
    fixed,
    moving,
    from,
    to,
    diameter: typeof args.diameter === 'number' ? args.diameter : 6,
    // The rule of the refined designs (F13): one nozzle, at least 0.3 mm.
    gap: typeof args.gap === 'number' ? args.gap : Math.min(1, Math.max(0.3, nozzle)),
    knuckles: typeof args.knuckles === 'number' ? args.knuckles : length < 40 ? 3 : length < 90 ? 5 : 7,
    name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim().slice(0, 60) : 'Hinge',
  };
  return hingeProblem(spec) ?? spec;
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

/** Whole degrees a sweep ran before two parts met, towards zero, so the limit is clear of the contact; `to` when it ran through. */
function reach(sweep: unknown, to: number): number {
  const stopped = (sweep as { stopped_at?: unknown } | undefined)?.stopped_at;
  return typeof stopped === 'number' && Number.isFinite(stopped) ? Math.trunc(stopped) : to;
}

async function buildHinge(upstream: UpstreamTools, args: Record<string, unknown>, nozzle: number, callId: string | undefined): Promise<string> {
  const spec = hingeOf(args, nozzle);
  if (typeof spec === 'string') throw new Error(spec);
  const run = async (commands: { command: string; params: Record<string, unknown> }[]): Promise<unknown[]> => {
    const reply = jsonOf(await upstream.callTool('batch', { commands }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
    if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 200)}`);
    return reply.results ?? [];
  };
  const bodies = ((jsonOf(await upstream.callTool('inspect_design', {}, callId)) as { bodies?: { name?: unknown }[] }).bodies ?? []).map((body) => body.name);
  const missing = [spec.fixed, spec.moving].filter((name) => !bodies.includes(name));
  if (missing.length > 0) throw new Error(`no body ${missing.map((name) => JSON.stringify(name)).join(' or ')}; the bodies are ${bodies.map((name) => JSON.stringify(name)).join(', ') || 'none'}`);

  await run(hingeSteps(spec));
  // Each knuckle must have grown onto its body, and the two must not share volume.
  const [after, clash] = await run([
    { command: 'document.inspect', params: {} },
    { command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } },
  ]);
  const count = ((after as { bodies?: unknown[] } | undefined)?.bodies ?? []).length;
  const overlaps = ((clash as { count?: unknown } | undefined)?.count as number | undefined) ?? 0;
  const loose = count > bodies.length ? ` Warning: ${String(count - bodies.length)} piece(s) came loose as bodies of their own: a body does not reach the hinge line, so move the line or the body and undo this hinge.` : '';
  const shared = overlaps > 0 ? ' Warning: the two bodies still share volume away from the hinge; make room between them.' : '';

  // Joints hold components: the two bodies become components unless they are already.
  let [listing] = await run([{ command: 'component.list', params: {} }]);
  const loners = [spec.fixed, spec.moving].filter((name) => occurrenceOf(listing, name) === null);
  if (loners.length > 0) [, listing] = await run([{ command: 'component.from_bodies', params: { bodies: loners } }, { command: 'component.list', params: {} }]);
  const a = occurrenceOf(listing, spec.fixed);
  const b = occurrenceOf(listing, spec.moving);
  if (!a || !b) throw new Error('the hinge is built, but its bodies did not become components; join them with joint.as_built');
  const middle = spec.from.map((value, i) => (value + (spec.to[i] ?? value)) / 2);
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const [, up, down] = await run([
    { command: 'joint.as_built', params: { type: 'revolute', a, b, at: { occurrence: a, point: middle, z: axis }, name: spec.name, quiet: true } },
    { command: 'joint.sweep', params: { joint: spec.name, from: 0, to: 180 } },
    { command: 'joint.sweep', params: { joint: spec.name, from: 0, to: -180 } },
  ]);
  const max = reach(up, 180);
  const min = reach(down, -180);
  await run([{ command: 'joint.limits', params: { joint: spec.name, min, max } }]);
  return (
    `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns): ${String(spec.knuckles)} knuckles, barrel ${String(spec.diameter)} mm, pin ${String(pinDiameter(spec.diameter))} mm, ` +
    `gap ${String(spec.gap)} mm everywhere. It turns from ${String(min)}° to ${String(max)}° before the bodies meet, and those are its limits now; 0° is as designed. ` +
    'The user moves it with the slider "Moving parts" in the view. If it should open further, make room where the bodies meet and set joint.limits again.' +
    loose +
    shared
  );
}

/** The upstream tools plus `partbuddy_mechanism`; `nozzle` is the printer's nozzle in use, for the default gap. */
export function withMechanismTool(upstream: UpstreamTools, nozzle: () => number): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), mechanismTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== MECHANISM_TOOL) return upstream.callTool(name, args, callId);
      try {
        if (args.kind !== 'hinge') throw new Error('kind must be hinge');
        return { content: [{ type: 'text', text: await buildHinge(upstream, args, nozzle(), callId) }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route, after the joint guidance. */
export const MECHANISM_GUIDANCE = `For a hinge (a lid that folds, a flap, a clamp that opens) call ${MECHANISM_TOOL} once both bodies exist instead of modelling knuckles and a pin yourself: it builds a print-in-place hinge with the right gaps, joins the bodies and sets the limits.`;
