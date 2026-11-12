import { LID, LIP, hingeProblem, hingeSteps, lidProblem, lidSkirt, lidSteps, lidThread, lipProblem, lipSteps, pinDiameter, screwLength, screwProblem, screwSteps, slideProblem, slideSteps, snapProblem, snapSteps, latchProblem, latchReach, latchSteps, LATCH, pegLength, pegProblem, pegSteps, PEG, SNAP, type HingeSpec, type HingeSide, type LatchSpec, type LidSpec, type LipSpec, type PegSpec, type ScrewSpec, type SlideSpec, type SnapSpec } from '../../shared/mechanisms';
import { BLOCK_SIZES, INSERT, type BlockSize } from '../../shared/screwSizes';
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
    'the line must lie closer to both bodies than the barrel radius less 0.5 mm, so the knuckles grow out of them; PartBuddy cuts each knuckle\'s room in the other body itself, a gap wider than the barrel, and carries knuckles that start above the bed on webs at 45° down to their own walls: add no supports of your own. Give wall, the thickness of the walls along the line: a room that would leave less than two lines of a wall behind it is refused, with how far to move the line. ' +
    'slide: a dovetail rail on the fixed body and its groove in the moving body, which lies over the rail a gap above the face. Give the middle line of the rail (from, to) on that face and the face normal (up). ' +
    'PartBuddy also joins the two with a joint, finds how far it moves before the bodies meet (a slide: while the moving body stays on its rail) and sets that as its limits; the user then moves it with a slider in the view. ' +
    'closure: a snap closure between a lid and its box, nothing standing out: a lip inside the lid that goes into the box along its wall and centres the lid, a bead that snaps into a rille of the box\'s wall, and a notch for a fingernail. ' +
    'Give from and to as opposite corners of the lid\'s inner room at its rim (both at the rim\'s height), up as the way the lip stands out of the lid (+Z when the lid lies open side up, -Z when it sits on the box), wall and radius of the lid, and the side with the catch (a long wall, opposite the hinge). ' +
    'When the lid is built open beside the box and closes on a hinge, give the hinge line too (hinge_from, hinge_to), so the rille lands where the bead closes. It makes no joint. ' +
    'When the lid is a flat plate without walls of its own, say flat: from and to are then the corners of the box\'s inner room on the plate\'s face towards the box, and the lip stands on that face. ' +
    'screw: one or more screws that hold the moving body on the fixed one: a clearance hole with the room for the head in the moving body, and on the same line the seat of a heat-set insert (or a modelled thread from M5) in the fixed body; the screws go in as standard parts. ' +
    'Give from where the screw goes in (on the outer face of the moving body) and to where its line passes into the fixed body (on the face the two meet at); more lists where further screws of the same kind go in. ' +
    'snap: cantilever snap hooks standing on the fixed body, each catching in a window cut through a wall of the moving body, for a cover that clips on and comes off by pressing the catches back. Give from as the foot of the hook (on the face of the fixed body it stands on, at the inner face of that wall), up as the way the hook stands, which is the way the parts come apart, to as a point further into the wall (the way the catch points), wall as the wall\'s thickness, and more for further hooks catching the same way; call again for the opposite wall. It makes no joint. ' +
    'plug: a plugged connection that makes no joint, to align and glue the halves of a split part or to push one part onto another. With shape peg (the default): round pegs on the fixed body and their pockets in the moving one; give from as the foot of the peg on the face the two meet at, to as a point further into the moving body, more for further pegs (two or more, far apart, keep the parts from turning), diameter (default 5) and gap per side (default 0.2 to slide and glue, 0.1 to press). ' +
    'With shape dovetail: a dovetail rail on the fixed body and its groove in the moving one, given as for slide (from, to, up, width, height) but a close fit and without a joint; the moving body is pushed on from the end at from and stops at to where the groove ends inside it. ' +
    'latch: a snap latch on the outside of a box, where the outer walls of lid and box lie in one plane: an arm grows out of the lid\'s wall, hangs down over the joint and snaps with a hook under a bead on the box; pulled at its lower end it lets go. Give fixed as the box and moving as the lid, from as the middle of the latch on the line where the two meet on that wall, to as a point straight out of the wall, up as the way from box to lid, and width; the walls must be flat 8.1 mm above the joint and 14.1 mm below it. Opposite the lid\'s hinge, or one on each of two opposite walls. It makes no joint. ' +
    'lid: a screw lid for a round container. It coils a thread with 45° flanks onto the container\'s neck and makes the lid itself, with the matching thread, flutes to grip and its top as print face; the two mesh as built. ' +
    'Give the container as fixed, the name the lid shall have as moving (no such body yet), from as the centre of the rim at its height, and diameter as the neck\'s outer diameter; the neck must be a plain upright cylinder of that diameter below the rim (the answer says how far). ' +
    'Use this instead of modelling a hinge, a guide, a snap lid, a threaded lid or the holes of a screw joint yourself.',
  inputSchema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['hinge', 'slide', 'closure', 'screw', 'lid', 'snap', 'plug', 'latch'], description: 'latch: a snap latch outside a box holds its lid down; plug: two parts are plugged together, by pegs in pockets or pushed onto a dovetail; hinge: turns about a line; slide: moves along a line; closure: a lid snaps shut on its box; screw: one body screwed onto the other; lid: a screw lid is made for a round container; snap: snap hooks on one body catch in windows of the other.' },
      fixed: { type: 'string', description: 'The body that stays (exact name); it carries the pin or the rail. closure: the box.' },
      moving: { type: 'string', description: 'The body that moves (exact name). closure: the lid.' },
      from: { ...vector, description: 'One end of the line in mm. closure: one corner of the lid\'s inner room at its rim. lid: the centre of the container\'s rim. snap: the foot of the hook. latch: the middle of the latch on the line where lid and box meet, on their outer wall.' },
      to: { ...vector, description: 'The other end of the line in mm. closure: the opposite corner, at the same height. lid: not needed. snap: a point further into the wall the catch goes into. latch: a point straight out of the wall.' },
      up: { ...vector, description: 'slide: the normal of the face of the fixed body the rail stands on; default +Z. closure: the way the lip stands out of the lid, +Z or -Z; default +Z. snap: the way the hook stands out of the fixed body; default +Z. latch: the way from the box to the lid; default +Z.' },
      shape: { type: 'string', enum: ['peg', 'dovetail'], description: 'plug: pegs in pockets, or a dovetail to push together; default peg.' },
      side: { type: 'string', enum: ['x-', 'x+', 'y-', 'y+'], description: 'closure: the wall of the lid\'s inner room with the catch and the notch.' },
      wall: { type: 'number', minimum: 1.6, maximum: 10, description: 'closure: the lid\'s wall thickness in mm; default 2. snap: the thickness of the wall the window goes through; default 2. hinge: the thickness of the walls the hinge line runs along; no default.' },
      radius: { type: 'number', minimum: 0, maximum: 100, description: 'closure: the radius of the inner room\'s corners in mm; default 0 (sharp).' },
      size: { type: 'string', enum: [...BLOCK_SIZES], description: 'screw: the screw; default M3.' },
      head: { type: 'string', enum: ['cap', 'countersunk', 'none'], description: 'screw: socket head sunk in a counterbore (default), countersunk head, or a head lying on the face.' },
      thread: { type: 'string', enum: ['insert', 'tapped'], description: 'screw: a heat-set insert (default, M2 to M6) or a thread modelled into the plastic (M5 and larger).' },
      more: { type: 'array', items: vector, maxItems: 40, description: 'screw: where further screws like this one go in; they run the same way through the same thickness. snap: the feet of further hooks catching the same way.' },
      screws: { type: 'boolean', description: 'screw: put the screws in as standard parts; default true.' },
      flat: { type: 'boolean', description: 'closure: true when the lid is a flat plate without walls; the lip then stands on its face, without a foot inside the lid and without a notch.' },
      hinge_from: { ...vector, description: 'closure: one end of the hinge line the lid closes about, when it is built open.' },
      hinge_to: { ...vector, description: 'closure: the other end of that line; it runs along X or along Y.' },
      diameter: { type: 'number', minimum: 3, maximum: 200, description: 'plug: the diameter of the pegs (3 to 20); default 5. hinge: outer diameter of the barrel in mm (4 to 40); default 6. The pin is half of it. lid: the outer diameter of the neck (16 to 200).' },
      starts: { type: 'integer', enum: [1, 2, 3], description: 'lid: threads side by side; default 1. With 2 or 3 the lid closes in less than a turn.' },
      knuckles: { type: 'integer', enum: [3, 5, 7, 9], description: 'hinge: how many knuckles; default by the length of the line.' },
      width: { type: 'number', minimum: 2, maximum: 60, description: 'slide: width of the rail at its foot in mm; default 6. It widens by its height on each side. latch: its width along the wall (5 to 40); default 10.' },
      height: { type: 'number', minimum: 1.5, maximum: 20, description: 'slide: height of the rail in mm; default 3.' },
      gap: { type: 'number', minimum: 0.05, maximum: 1, description: "The gap between the parts in mm; default the printer's nozzle, at least 0.3 (hinge, slide and lid: 0.2 at the least). plug: the room per side, default 0.2." },
      name: { type: 'string', maxLength: 60, description: "The mechanism's name in the user's language, e.g. \"Lid hinge\"." },
    },
    required: ['kind', 'fixed', 'moving', 'from'],
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
    // Knuckles of at most 10 mm where the line allows: inside each one the pin bridges from neighbour to neighbour.
    knuckles: typeof args.knuckles === 'number' ? args.knuckles : ([3, 5, 7, 9].find((count) => length / count <= 10) ?? 9),
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
    ...(args.flat === true ? { flat: true } : {}),
    name: base.name,
  };
  return lipProblem(spec) ?? spec;
}

/** The pegs the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function pegOf(args: Record<string, unknown>): PegSpec | string {
  const base = common(args, 0.4, 'Peg');
  if (typeof base === 'string') return base;
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((point) => point === null)) return 'more must be a list of points, each three numbers';
  const spec: PegSpec = { fixed: base.fixed, moving: base.moving, from: base.from, to: base.to, more: more as Vec3[], diameter: typeof args.diameter === 'number' ? args.diameter : PEG.least, gap: typeof args.gap === 'number' ? args.gap : 0.2, name: base.name };
  return pegProblem(spec) ?? spec;
}

/** The latch the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function latchOf(args: Record<string, unknown>): LatchSpec | string {
  const base = common(args, 0.4, 'Latch');
  if (typeof base === 'string') return base;
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec: LatchSpec = { fixed: base.fixed, moving: base.moving, from: base.from, up, out: base.to.map((value, i) => value - (base.from[i] ?? 0)) as Vec3, width: typeof args.width === 'number' ? args.width : 10, name: base.name };
  return latchProblem(spec) ?? spec;
}

/** The snap hooks the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function snapOf(args: Record<string, unknown>): SnapSpec | string {
  const base = common(args, 0.4, 'Snap hook');
  if (typeof base === 'string') return base;
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((point) => point === null)) return 'more must be a list of points, each three numbers';
  const toward = base.to.map((value, i) => value - (base.from[i] ?? 0)) as Vec3;
  const spec: SnapSpec = { fixed: base.fixed, moving: base.moving, from: base.from, up, toward, more: more as Vec3[], wall: typeof args.wall === 'number' ? args.wall : 2, name: base.name };
  return snapProblem(spec) ?? spec;
}

/** The screw lid the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function lidOf(args: Record<string, unknown>, nozzle: number): LidSpec | string {
  const stays = typeof args.fixed === 'string' ? args.fixed.trim() : '';
  const lid = typeof args.moving === 'string' ? args.moving.trim().slice(0, 60) : '';
  const centre = vec3(args.from);
  if (!stays || !lid || !centre || typeof args.diameter !== 'number') return 'fixed (the container), moving (the name of the lid to make), from (the centre of the rim) and diameter (of the neck) are needed';
  const spec: LidSpec = {
    fixed: stays,
    moving: lid,
    centre,
    diameter: args.diameter,
    starts: typeof args.starts === 'number' ? args.starts : 1,
    // A nozzle's three quarters, at least 0.3 mm: lids of printed jars run from 0.2 to 0.6 mm, and a tight one binds on a wide neck.
    gap: typeof args.gap === 'number' ? args.gap : Math.min(0.6, Math.max(0.3, Math.round(nozzle * 75) / 100)),
    name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim().slice(0, 60) : 'Thread',
  };
  return lidProblem(spec) ?? spec;
}

/** The screw joint the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function screwOf(args: Record<string, unknown>): ScrewSpec | string {
  const base = common(args, 0.4, 'Screw');
  if (typeof base === 'string') return base;
  const size = args.size === undefined ? 'M3' : args.size;
  if (typeof size !== 'string' || !(BLOCK_SIZES as readonly string[]).includes(size)) return `size must be one of ${BLOCK_SIZES.join(', ')}`;
  const head = args.head === undefined ? 'cap' : args.head;
  if (head !== 'cap' && head !== 'countersunk' && head !== 'none') return 'head must be cap, countersunk or none';
  const thread = args.thread === undefined ? 'insert' : args.thread;
  if (thread !== 'insert' && thread !== 'tapped') return 'thread must be insert or tapped';
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((point) => point === null)) return 'more must be a list of points, each three numbers';
  const spec: ScrewSpec = { fixed: base.fixed, moving: base.moving, from: base.from, to: base.to, more: more as Vec3[], size: size as BlockSize, head, thread, screws: args.screws !== false, name: base.name };
  return screwProblem(spec) ?? spec;
}

/** The occurrence that places a body, from `component.list`; null while the body is still in the design itself. */
export function occurrenceOf(listing: unknown, body: string): string | null {
  return placed(listing, body)?.name ?? null;
}

/** That occurrence with its id, which is what `joint.list` names a joint's two sides by. */
function placed(listing: unknown, body: string): { id?: unknown; name: string } | null {
  const components = (listing as { components?: unknown } | undefined)?.components;
  if (!Array.isArray(components)) return null;
  for (const entry of components as { parent?: unknown; bodies?: unknown; occurrences?: unknown }[]) {
    if (entry.parent === null || !Array.isArray(entry.bodies) || !entry.bodies.includes(body)) continue;
    const occurrence = Array.isArray(entry.occurrences) ? (entry.occurrences[0] as { id?: unknown; name?: unknown } | undefined) : undefined;
    if (typeof occurrence?.name === 'string') return { id: occurrence.id, name: occurrence.name };
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
 * One call of the tool: how it reaches SolidCraft, and SolidCraft's undo depth before the first step was built
 * (null when it could not be read, unset while nothing is begun), so a call that fails later is taken back.
 */
interface Site {
  upstream: UpstreamTools;
  run: Run;
  callId: string | undefined;
  mark: { undo?: number | null };
}
/** Keeps the face a mechanism laid its part on, by the face's name, for the plate view. */
type KeepFace = (body: string, face: string) => void;
const round2 = (value: number) => Math.round(value * 100) / 100;

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
    // A plastic feature names its body in `body`; every other step in `targets`.
    const owner = (later: Step): unknown => (Array.isArray(later.params.targets) ? (later.params.targets as unknown[])[0] : later.command.startsWith('plastic.') ? later.params.body : undefined);
    const target = steps.slice(i).map(owner).find((name) => name !== undefined);
    const component = typeof target === 'string' ? componentOf(listing, target) : 0;
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
 * means the line is not where the bodies are: the call fails and with that everything is taken back (practice run 2026-11-10: the model kept a gap between the
 * hinge line and the walls, mended the loose knuckles with webs, and their warnings stayed in the
 * timeline), and `where` tells the model where the line goes. Volume the two still share is a warning.
 *
 * With `joins` the mechanism ends in a joint of that type: a second one between the same two bodies is refused, and a
 * name another joint has gets a number, in `spec` itself, before the steps are made. SolidCraft takes a name twice, and
 * sweep and limits by that name then met the first joint (audit 2026-11-12, N-mechanik-3: the answer gave the first
 * hinge's limits, the second had none, and a third call built a third joint between the same parts).
 */
async function build({ upstream, run, callId, mark }: Site, spec: { fixed: string; moving: string; name: string }, steps: Step[] | (() => Step[]), where: string, makes = false, ready: () => Promise<void> = () => Promise.resolve(), joins?: 'revolute' | 'slider'): Promise<string> {
  const before = jsonOf(await upstream.callTool('inspect_design', {}, callId)) as { bodies?: { name?: unknown }[]; undo?: unknown };
  const bodies = (before.bodies ?? []).map((body) => body.name);
  // A mechanism that makes its moving body (a lid) needs the name free.
  if (makes && bodies.includes(spec.moving)) throw new Error(`a body ${JSON.stringify(spec.moving)} exists already; give the lid another name, or delete that body first`);
  const missing = (makes ? [spec.fixed] : [spec.fixed, spec.moving]).filter((name) => !bodies.includes(name));
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
  if (joins) {
    const list = ((joints as { joints?: unknown } | undefined)?.joints ?? []) as { name?: unknown; type?: unknown; a?: unknown; b?: unknown }[];
    const [a, b] = [placed(listing, spec.fixed), placed(listing, spec.moving)];
    const side = (occurrence: { id?: unknown; name: string }, value: unknown) => value === occurrence.id || value === occurrence.name;
    const same = a && b ? list.find((joint) => joint.type === joins && ((side(a, joint.a) && side(b, joint.b)) || (side(b, joint.a) && side(a, joint.b)))) : undefined;
    const kind = joins === 'revolute' ? 'hinge' : 'guide';
    if (same) throw new Error(`the joint ${JSON.stringify(same.name)} already joins ${spec.fixed} and ${spec.moving} as a ${kind}, and a second ${kind} between the same two bodies would bind it. Change that one instead: take it back with undo, or delete its features and its joint, then call again`);
    const taken = new Set(list.map((joint) => joint.name));
    const asked = spec.name;
    for (let n = 2; taken.has(spec.name); n += 1) spec.name = `${asked} (${String(n)})`;
  }
  // The bodies are there and stand as designed: what must be measured on them before anything is built.
  await ready();
  // From here on the design changes: a call that fails later is taken back to this depth.
  mark.undo = typeof before.undo === 'number' ? before.undo : null;
  const built = await run(activated(typeof steps === 'function' ? steps() : steps, listing));
  const apart = built.filter((result) => {
    const warning = (result as { warning?: unknown } | undefined)?.warning;
    return typeof warning === 'string' && warning.includes('separate pieces');
  }).length;
  if (apart > 0) throw new Error(`${String(apart)} piece(s) did not touch their body and stand apart from it. ${where}`);
  const [clash] = await run([{ command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } }]);
  const overlaps = ((clash as { count?: unknown } | undefined)?.count as number | undefined) ?? 0;
  return overlaps > 0 ? ' Warning: the two bodies still share volume away from the mechanism; make room between them.' : '';
}

/** Makes the two bodies components unless they are, joins them where they are and sets the limits: the range clear of contact within `range`. */
async function join(run: Run, spec: { fixed: string; moving: string; from: Vec3; to: Vec3; name: string }, type: 'revolute' | 'slider', range: [number, number], step: number): Promise<[number, number] | string> {
  let [listing] = await run([{ command: 'component.list', params: {} }]);
  const loners = [spec.fixed, spec.moving].filter((name) => occurrenceOf(listing, name) === null);
  if (loners.length > 0) [, listing] = await run([{ command: 'component.from_bodies', params: { bodies: loners } }, { command: 'component.list', params: {} }]);
  const a = occurrenceOf(listing, spec.fixed);
  const b = occurrenceOf(listing, spec.moving);
  if (!a || !b) throw new Error(`${spec.fixed} and ${spec.moving} did not become components, so no joint could join them.`);
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

/** The name of the body that measures where the hinge line lies; it is never kept. */
const PROBE = 'PartBuddy probe';

/**
 * How deep the room of a knuckle goes into each body, from the face nearest the hinge line (mm; 0 when it does not
 * reach it). A wall thicker than that by less than two lines is left as a skin behind the room (practice run
 * 2026-11-12: 0.8 mm of a 1.8 mm wall). Measured on trial with a thin rod on the line: a step that must fail ends the
 * batch, and SolidCraft takes the rod back. Null when it could not be measured.
 */
export async function roomDepths(upstream: UpstreamTools, spec: HingeSpec, callId: string | undefined): Promise<{ fixed: number; moving: number; support?: NonNullable<HingeSpec['support']> } | null> {
  try {
    const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
    const rod = 0.1;
    // The batch fails on purpose, so its answer comes as an error that still carries the results before the step that failed.
    const answer = await upstream.callTool(
        'batch',
        {
          commands: [
            { command: 'solid.cylinder', params: { diameter: rod, height: Math.hypot(...axis), base: spec.from, axis, operation: 'new', body_name: PROBE } },
            { command: 'inspect.clearance', params: { bodies: [PROBE], against: [spec.fixed, spec.moving], clearance: spec.diameter } },
            { command: 'inspect.measure', params: { bodies: [spec.fixed, spec.moving] } },
            { command: 'sketch.inspect', params: { sketch: 2147483647 } },
          ],
          rollback: true,
        },
        callId,
      );
    const text = answer.content.find((part) => part.type === 'text')?.text;
    const reply = JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[] };
    const near = (reply.results?.[1] as { near?: { a?: unknown; b?: unknown; distance_mm?: unknown; from?: unknown; to?: unknown }[] } | undefined)?.near;
    if (!Array.isArray(near)) return null;
    const depth = (body: string) => {
      const pair = near.find((entry) => entry.a === body || entry.b === body);
      // No pair: the body is further away than the barrel is wide, and build() says so.
      if (typeof pair?.distance_mm !== 'number') return 0;
      return Math.max(0, Math.round((spec.diameter / 2 + spec.gap - pair.distance_mm - rod / 2) * 100) / 100);
    };
    // For the webs under the knuckles: the level way from the line to each body's wall, and the bed both stand on.
    const length = Math.hypot(...axis);
    const side = (body: string): HingeSide | null => {
      const pair = near.find((entry) => entry.a === body || entry.b === body);
      const offsets = [vec3(pair?.from), vec3(pair?.to)].flatMap((point) => {
        if (!point) return [];
        const rel = point.map((value, i) => value - (spec.from[i] ?? 0));
        const along = rel.reduce((sum, value, i) => sum + value * ((axis[i] ?? 0) / length), 0);
        return [rel.map((value, i) => value - along * ((axis[i] ?? 0) / length)) as Vec3];
      });
      // Of the pair's two points the one off the line lies on the body; the other is on the rod.
      const off = offsets.sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0];
      const level = off ? Math.hypot(off[0], off[1]) : 0;
      // A body under or over the line has no wall beside it to carry a web.
      if (!off || level < 0.2 || level < Math.abs(off[2])) return null;
      return { toward: [off[0] / level, off[1] / level, 0], distance: Math.round(level * 100) / 100 };
    };
    const lows = (((reply.results?.[2] as { bodies?: { bbox?: { min?: unknown } }[] } | undefined)?.bodies ?? []) as { bbox?: { min?: unknown } }[]).flatMap((body) => vec3(body.bbox?.min)?.[2] ?? []);
    const [fixed, moving] = [side(spec.fixed), side(spec.moving)];
    const support = fixed && moving && lows.length > 0 ? { bed: Math.min(...lows), fixed, moving } : undefined;
    return { fixed: depth(spec.fixed), moving: depth(spec.moving), ...(support ? { support } : {}) };
  } catch {
    return null;
  }
}

/** What is wrong with the walls behind the knuckles' rooms, when the model said how thick they are; null when they print. */
export function skinProblem(depths: { fixed: number; moving: number }, spec: { fixed: string; moving: string }, wall: number, nozzle: number): string | null {
  const least = Math.round(nozzle * 2 * 1.125 * 100) / 100;
  const mm = (value: number) => String(Math.round(value * 100) / 100);
  for (const [body, depth] of [[spec.fixed, depths.fixed], [spec.moving, depths.moving]] as const) {
    const skin = wall - depth;
    if (depth > 0 && skin > 1e-6 && skin < least - 1e-6) {
      return `the rooms of the knuckles would go ${mm(depth)} mm into the ${mm(wall)} mm wall of ${body} and leave a skin of ${mm(skin)} mm behind them, under two lines (${mm(least)} mm). Make that wall at least ${mm(depth + least)} mm thick, or move the line ${mm(least - skin)} mm further from ${body}, or ${mm(skin)} mm closer to it so the rooms open through the wall. Nothing was built.`;
    }
  }
  return null;
}

const MOVE = 'The user moves it with the slider "Moving parts" in the view.';

/** What the model hears when the joint is made but its range could not be found. */
const unswept = (reason: string) =>
  `SolidCraft could not run it through its range (${reason.slice(0, 160)}), so no limits are set. The two bodies probably lie against each other somewhere: look with inspect.clearance, make room, then set joint.limits yourself after joint.sweep.`;

/**
 * Takes back what a call built before it failed: every step SolidCraft counted since `before`, in one batch. (A batch
 * with rollback around the build itself, or a checkpoint from an earlier batch, does not do it: measured on 0.40.1.)
 * False when the design could not be put back.
 */
async function takeBack(run: Run, before: number | null): Promise<boolean> {
  if (before === null) return false;
  try {
    const [now] = await run([{ command: 'document.inspect', params: {} }]);
    const depth = (now as { undo?: unknown } | undefined)?.undo;
    if (typeof depth !== 'number') return false;
    if (depth > before) await run(Array.from({ length: depth - before }, () => ({ command: 'edit.undo', params: {} })));
    return true;
  } catch {
    return false;
  }
}

/**
 * A call ends in one of two states: built, with what is missing said in the answer, or not built and the design as it
 * was. A failure after the first step (the joint refused, the travel not measurable) left knuckles and cuts behind under
 * "Not built", and the next call built them twice (audit 2026-11-12, H-02).
 */
async function buildMechanism(upstream: UpstreamTools, args: Record<string, unknown>, nozzle: number, callId: string | undefined, keepFace: KeepFace): Promise<string> {
  const run: Run = async (commands) => {
    const result = await upstream.callTool('batch', { commands }, callId);
    const text = result.content.find((part) => part.type === 'text')?.text;
    let reply: { results?: unknown[]; failed?: { command?: unknown; error?: unknown } } | undefined;
    try {
      reply = JSON.parse(typeof text === 'string' ? text : '') as typeof reply;
    } catch {
      reply = undefined;
    }
    // SolidCraft marks a batch with a failed step as an error and still answers in JSON: only the step and its reason go on.
    if (reply?.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 200)}`);
    if (result.isError || !reply) throw new Error(typeof text === 'string' ? text.slice(0, 300) : 'SolidCraft gave no answer');
    return reply.results ?? [];
  };
  const site: Site = { upstream, run, callId, mark: {} };
  try {
    return await mechanism(site, args, nozzle, keepFace);
  } catch (cause) {
    const message = (cause as Error).message;
    // Unset: the call was refused before anything was built.
    if (site.mark.undo === undefined) throw cause;
    throw new Error(`${message.replace(/\.?$/, '.')} ${(await takeBack(run, site.mark.undo)) ? 'Everything was taken back.' : 'What was begun could not be taken back: undo it before you call again.'}`, { cause });
  }
}

async function mechanism(site: Site, args: Record<string, unknown>, nozzle: number, keepFace: KeepFace): Promise<string> {
  const { upstream, run, callId } = site;
  if (args.kind === 'hinge') {
    const spec = hingeOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const reach = String(Math.round((spec.diameter / 2 - 0.5) * 10) / 10);
    let depths: Awaited<ReturnType<typeof roomDepths>> = null;
    let webs = 0;
    const least = String(Math.round(nozzle * 2 * 1.125 * 100) / 100);
    const rooms = () => depths ? ` The knuckles' rooms go ${String(depths.fixed)} mm into ${spec.fixed} and ${String(depths.moving)} mm into ${spec.moving}, measured from the face nearest the line: a wall there must be ${least} mm thicker than that, or thinner than it (the room then opens through the wall); anything between is left as a thin skin.` : '';
    const warnings = await build(site, spec,
      // With the walls and the bed measured, knuckles that start in the air get their webs.
      () => {
        const steps = hingeSteps(depths?.support ? { ...spec, support: depths.support } : spec);
        webs = steps.filter((step) => step.command === 'solid.extrude' && String(step.params.name).endsWith('◣')).length;
        return steps;
      },
      `Put the hinge line within ${reach} mm of both bodies (the barrel is ${String(spec.diameter)} mm, so it must overlap each by at least 0.5 mm). PartBuddy cuts each knuckle's room in the other body itself.`,
      false,
      async () => {
        depths = await roomDepths(upstream, spec, callId);
        const thin = depths && typeof args.wall === 'number' ? skinProblem(depths, spec, args.wall, nozzle) : null;
        if (thin) throw new Error(thin);
      },
      'revolute',
    );
    const range = await join(run, spec, 'revolute', [-180, 180], 1);
    if (typeof range === 'string') return `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns) and joined them, but ${unswept(range)}${warnings}`;
    const [min, max] = range;
    return (
      `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns): ${String(spec.knuckles)} knuckles, barrel ${String(spec.diameter)} mm, pin ${String(pinDiameter(spec.diameter))} mm, ` +
      `gap ${String(spec.gap)} mm everywhere. It turns from ${String(min)}° to ${String(max)}° before the bodies meet, and those are its limits now; 0° is as designed. ` +
      `${MOVE} If it should open further, make room where the bodies meet and set joint.limits again.${webs > 0 ? ` ${String(webs)} knuckles start above the bed and stand on webs at 45° down to their own walls, so they print without support.` : ''}${rooms()}${warnings}`
    );
  }
  if (args.kind === 'slide') {
    const spec = slideOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(site, spec, () => slideSteps(spec), `Put the line from–to on a face of ${spec.fixed}, with up as that face's normal, so the rail stands on it.`, false, undefined, 'slider');
    const [measure] = await run([{ command: 'inspect.measure', params: { bodies: [spec.moving] } }]);
    const travel = railTravel(measure, spec.from, spec.to);
    if (!travel) throw new Error(`${spec.moving} could not be measured, so how far the guide may travel is not known.`);
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
    const warnings = await build(site, spec, lipSteps(spec), spec.flat ? `Give from and to as opposite corners of the inner room of ${spec.fixed} on the face of ${spec.moving} towards it, so the lip stands on the plate.` : `Give from and to as opposite corners of the inner room of ${spec.moving} at its rim, so the lip lies on its wall.`);
    if (spec.flat) {
      return `Built the closure "${spec.name}" between ${spec.fixed} (the box) and ${spec.moving} (the flat lid): a lip ${String(LIP.thick)} mm thick and ${String(LIP.high)} mm high on the plate, ${String(LIP.clear)} mm clear of the box's wall, and a bead that snaps ${String(LIP.bead - LIP.clear)} mm into a rille of that wall. The plate has no notch to open it: let it stand out over the box by a millimetre or two on the side of the catch. It prints with the lip up: set the print face of the plate on its outer face. It makes no joint. Keep the box's wall straight and at least 1.6 mm thick where the lip goes in.${warnings}`;
    }
    return (
      `Built the closure "${spec.name}" between ${spec.fixed} (the box) and ${spec.moving} (the lid): a lip ${String(LIP.thick)} mm thick and ${String(LIP.high)} mm high inside the lid, ${String(LIP.clear)} mm clear of the box's wall, a bead that snaps ${String(LIP.bead - LIP.clear)} mm into a rille of that wall, and a notch in the lid's rim to open it. It makes no joint and needs no room outside the box. Keep the box's wall straight and at least 1.6 mm thick where the lip goes in.${warnings}`
    );
  }
  if (args.kind === 'lid') {
    const spec = lidOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const thread = lidThread(spec);
    const skirt = lidSkirt(spec);
    const warnings = await build(site, spec, lidSteps(spec), `Give from as the centre of the rim of ${spec.fixed} and diameter as the outer diameter of its neck, which must be a plain upright cylinder over the top ${String(skirt)} mm.`, true);
    // SolidCraft has the lid's print face from the steps, but does not report it: asked for once more, it names the face,
    // which the plate view needs to lay the lid on its top too.
    const [laid] = await run([{ command: 'body.print_face', params: { body: spec.moving, point: [spec.centre[0], spec.centre[1], round2(spec.centre[2] + LID.top)] } }]).catch(() => []);
    const face = (laid as { face?: unknown } | undefined)?.face;
    if (typeof face === 'string') keepFace(spec.moving, face);
    return (
      `Built the screw lid "${spec.moving}" for ${spec.fixed}: a thread with 45° flanks on the neck, pitch ${String(thread.pitch)} mm, ${String(thread.depth)} mm deep, ${String(spec.starts)} start${spec.starts > 1 ? 's' : ''}, ` +
      `and the same inside the lid, ${String(spec.gap)} mm clear; it closes in ${String(round2(thread.turns))} turn${thread.turns > 1 ? 's' : ''} and stops with its inner top on the rim. ` +
      `The lid is ${String(round2(spec.diameter + 2 * (thread.depth + spec.gap + LID.wall)))} mm wide and covers the top ${String(skirt)} mm of the neck, has flutes to grip and prints standing on its top (its print face is set); both parts print without support. ` +
      `Keep the neck a plain cylinder of ${String(spec.diameter)} mm there, with a wall of at least 2 mm.${warnings}`
    );
  }
  if (args.kind === 'screw') {
    const spec = screwOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(site, spec, screwSteps(spec), `Give from on the outer face of ${spec.moving} and to on the face where it meets ${spec.fixed}.`);
    const count = spec.more.length + 1;
    const length = screwLength(spec);
    const insert = INSERT[spec.size];
    const screw = spec.head === 'countersunk' ? 'countersunk screws (ISO 10642)' : 'socket head cap screws (ISO 4762)';
    return (
      `Built ${String(count)} screw joint${count > 1 ? 's' : ''} "${spec.name}" that hold${count > 1 ? '' : 's'} ${spec.moving} on ${spec.fixed}: in ${spec.moving} a clearance hole for ${spec.size} (ISO 273, normal)` +
      `${spec.head === 'cap' ? ' with a counterbore for the head' : spec.head === 'countersunk' ? ' with a 90° countersink' : ''}, in ${spec.fixed} ` +
      `${spec.thread === 'insert' && insert ? `the seat of a heat-set insert (${String(insert.diameter)} mm wide, ${String(insert.length + 1)} mm deep)` : 'a modelled thread'}. ` +
      `${length === null ? 'No standard screw length ends inside the thread at this thickness, so no screws were put in: choose the length yourself.' : `To buy: ${String(count)} × ${spec.size}×${String(length)} ${screw}${spec.thread === 'insert' && insert ? ` and ${String(count)} ${spec.size} heat-set inserts ${String(insert.length)} mm long` : ''}${spec.screws ? '; the screws are in the design as standard parts' : ''}.`} ` +
      `${spec.thread === 'insert' ? 'Leave at least 2 mm of plastic around each insert (a boss where the wall is thinner).' : ''}${warnings}`
    );
  }
  if (args.kind === 'snap') {
    const spec = snapOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(site, spec, snapSteps(spec), `Give from as a point on a face of ${spec.fixed} at the inner face of the wall of ${spec.moving}, up as that face's normal and to as a point further into that wall.`);
    const count = spec.more.length + 1;
    return (
      `Built ${String(count)} snap hook${count > 1 ? 's' : ''} "${spec.name}" on ${spec.fixed}, each with its window through the ${String(spec.wall)} mm wall of ${spec.moving}: an arm ${String(SNAP.length)} mm long, ${String(SNAP.thickness)} mm thick and ${String(SNAP.width)} mm wide, ${String(SNAP.gap)} mm off the wall, with a catch of ${String(SNAP.catch)} mm that lies over the window's edge. ` +
      `Pushed together the hooks snap in by themselves (about 1.4 % strain at the root); to open, press each catch back through its window. It makes no joint. ` +
      `An arm printed standing breaks along its layers at about half the strain: where the part allows, lay ${spec.fixed} so that the arms lie flat, and use PETG or ABS rather than PLA for a part opened often. Put hooks on opposite walls so that they hold each other in their windows.${warnings}`
    );
  }
  if (args.kind === 'latch') {
    const spec = latchOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    const reach = latchReach();
    const warnings = await build(site, spec, latchSteps(spec), `Give from on the line where ${spec.moving} and ${spec.fixed} meet, on their outer wall, and to as a point straight out of that wall; both walls must lie in one plane there.`);
    return (
      `Built the latch "${spec.name}": an arm ${String(spec.width)} mm wide and ${String(LATCH.thick)} mm thick grows out of the wall of ${spec.moving} (the lid), hangs ${String(LATCH.off)} mm off the wall over the joint and snaps with its hook under a bead ${String(LATCH.bead)} mm high on ${spec.fixed} (the box); the two overlap by ${String(LATCH.bead - LATCH.clear)} mm on 45° faces. ` +
      `Pressing the lid down snaps it shut (about 1.3 % strain at the arm's root); pulling the arm's lower end away from the box opens it, and so does a strong pull on the lid. It makes no joint. ` +
      `It needs ${String(reach.above)} mm of flat wall on the lid above the joint and ${String(reach.below)} mm on the box below it. Print the lid on its top: the arm then grows out of it without support; the box prints standing. The arm stands upright that way and bends across its layers, the weak way: for a lid opened often use PETG or ABS rather than PLA. Not printed yet: how firmly it holds shows on the first print.${warnings}`
    );
  }
  if (args.kind === 'plug' && args.shape === 'dovetail') {
    // The guide's own dovetail as a close fit: 0.2 mm, where guides for printed dovetails run from 0.1 to 0.3.
    const spec = slideOf({ ...args, gap: typeof args.gap === 'number' ? args.gap : 0.2, name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name : 'Dovetail' }, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(site, spec, slideSteps(spec), `Put the line from–to on a face of ${spec.fixed}, with up as that face's normal, so the rail stands on it.`);
    return (
      `Built the dovetail "${spec.name}" between ${spec.fixed} (carries the rail) and ${spec.moving} (has the groove): ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high with 45° flanks, ${String(spec.gap)} mm clear all round. ` +
      `It makes no joint: ${spec.moving} is pushed on along the line and stops where the groove ends inside it; where the groove runs through, nothing stops it. Print both with the rail's line level or upright, so the flanks need no support. Not printed yet: when it binds or rattles, build it again with another gap.${warnings}`
    );
  }
  if (args.kind === 'plug') {
    if (args.shape !== undefined && args.shape !== 'peg') throw new Error('shape must be peg or dovetail');
    const spec = pegOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(site, spec, pegSteps(spec), `Give from as a point on the face where ${spec.fixed} and ${spec.moving} meet, and to as a point further into ${spec.moving}.`);
    const count = spec.more.length + 1;
    const long = pegLength(spec.diameter);
    return (
      `Built ${String(count)} peg${count > 1 ? 's' : ''} "${spec.name}" on ${spec.fixed} with ${count > 1 ? 'their pockets' : 'its pocket'} in ${spec.moving}: ${String(spec.diameter)} mm thick and ${String(long)} mm long, ${String(spec.gap)} mm clear per side, the pocket ${String(PEG.deeper)} mm deeper for air and glue, tip and mouth chamfered. It makes no joint. ` +
      `${count === 1 ? 'One round peg lets the parts turn about it: add a second one far from it (more). ' : ''}${spec.diameter < PEG.least ? `A peg under ${String(PEG.least)} mm printed standing is weak. ` : ''}` +
      `A peg printed standing breaks along its layers sooner than one lying; ${String(Math.max(2 * spec.diameter, 4))} mm of plastic should stay round each pocket's axis. Not printed yet: when it binds or rattles, build it again with another gap.${warnings}`
    );
  }
  throw new Error('kind must be hinge, slide, closure, screw, lid, snap, plug or latch');
}

/** The upstream tools plus `partbuddy_mechanism`; `nozzle` is the printer's nozzle in use, for the default gap. */
export function withMechanismTool(upstream: UpstreamTools, nozzle: () => number, keepFace: KeepFace = () => undefined): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), mechanismTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== MECHANISM_TOOL) return upstream.callTool(name, args, callId);
      try {
        return { content: [{ type: 'text', text: await buildMechanism(upstream, args, nozzle(), callId, keepFace) }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route, after the joint guidance. */
export const MECHANISM_GUIDANCE = `For a hinge (a lid that folds, a flap, a clamp that opens) or a guide (a drawer, a slider, a carriage on a rail) call ${MECHANISM_TOOL} once both bodies exist instead of modelling knuckles, a pin or a rail yourself: it builds the print-in-place geometry with the right gaps, joins the bodies and sets the limits. For a lid that should hold shut by itself (a box, a case, a container) call it with kind closure instead of modelling a latch, a hook or a clip: a lip with a snap bead inside the lid, nothing standing out and no wall cut through. For parts that are screwed together (a lid on a housing, a bracket on a base, a cover) call it with kind screw instead of drilling the holes yourself: it sizes the clearance hole, the room for the head and the seat of the heat-set insert, and says which screws to buy. For a round container that should screw shut (a jar, a canister, a bottle cap) build the container with a plain cylindrical neck and call it with kind lid: it threads the neck and makes the lid, instead of modelling a thread yourself. For a cover or a housing half that should clip on and come off again by pressing on catches (an electronics housing, a battery cover) call it with kind snap: hooks on one part, their windows through the other part's wall. For a lid that should be held down by a latch one sees and opens with a finger (a tool box, a case with a hinged lid) call it with kind latch: a snap latch outside, on the wall opposite the hinge. For a part split in two to fit the printer, or two parts that are plugged or glued together, call it with kind plug: pegs with their pockets (two or more), or shape dovetail to push one part onto the other.`;
