import { LID, LIP, WEB, hangs, headRecess, hingeProblem, hingeSteps, pinBridge, webFoot, lidProblem, lidSkirt, lidSteps, lidThread, lipProblem, lipSteps, pinDiameter, screwLength, screwProblem, screwSteps, slideProblem, slideRoof, slideSteps, snapProblem, snapSteps, latchProblem, latchReach, latchSteps, LATCH, pegLength, pegProblem, pegSteps, PEG, SNAP, type HingeSpec, type HingeSide, type LatchSpec, type LidSpec, type LipSpec, type PegSpec, type ScrewSpec, type SlideSpec, type SnapSpec } from '../../shared/mechanisms';
import { BLOCK_SIZES, CLEARANCE_NORMAL, INSERT, type BlockSize } from '../../shared/screwSizes';
import { BRIDGE_SPAN } from '@partbuddy/geometry';

import { componentOf } from '../solidcraft/actions';
import { CURVED_FACE, FACE_DROP, SEAT_UNDER, fallenSaid, seatStock, seatWall, shortOf, type Stock } from './blockTool';
import { markOf, TAKEN_BACK_SAID, takeBack, type Mark, type Run } from './takeBack';
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
    'Build a mechanism between two bodies that exist, with the same gap everywhere; the answer says how it prints. ' +
    'hinge: knuckles in turn on both bodies and a pin through them, printed in place as one piece. Give the hinge line (from, to) in the gap between the bodies, level with the bed and half the barrel diameter above it when the part prints lying flat; ' +
    'the line must lie closer to both bodies than the barrel radius less 0.5 mm, so the knuckles grow out of them; PartBuddy cuts each knuckle\'s room in the other body itself, a gap wider than the barrel, and carries knuckles that start above the bed on webs at 45° down to their own walls, where the wall reaches about one and a quarter barrel diameters below the line (the answer says where it does not, and what then needs support): add no supports of your own. Give wall, the thickness of the walls along the line: a room that would leave less than two lines of a wall behind it is refused, with how far to move the line. ' +
    'slide: a dovetail rail on the fixed body and its groove in the moving body, which lies over the rail a gap above the face. Give the middle line of the rail (from, to) on that face and the face normal (up). The two print apart and the moving body is pushed onto the rail from an end. Where the moving body stands high enough over that face (the answer names how high) the groove gets a roof at 45° and prints as it stands; otherwise its ceiling is flat and the answer says how to lay the part. ' +
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
    // Knuckles of at most 10 mm where the line allows. Lying, it is the pin's bridge that counts: inside each knuckle of the
    // moving body it bridges from one fixed knuckle to the next, a gap further on each side than the knuckle is long.
    knuckles: typeof args.knuckles === 'number' ? args.knuckles : ([3, 5, 7, 9].find((count) => (Math.abs(rest.to[2] - rest.from[2]) < 1e-6 ? (length + (count + 1) * rest.gap) / count : length / count) <= 10) ?? 9),
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

/**
 * One call of the tool: how it reaches SolidCraft, and the design as it was before the first step was built (null
 * when it could not be read, unset while nothing is begun), so a call that fails later is taken back. `shares` is the
 * joint a second hinge on the same line goes on turning about.
 */
interface Site {
  upstream: UpstreamTools;
  run: Run;
  callId: string | undefined;
  mark: { state?: Mark | null };
  shares?: { name: string; limits: [number, number] };
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
 * A cut that leaves a new body behind has cut its body apart (a groove's roof through a plate thinner than it is high:
 * SolidCraft answers `created_bodies` and no warning): that fails the call too, whatever the mechanism.
 *
 * With `joins` the mechanism ends in a joint of that type: a second one between the same two bodies is refused, unless
 * it is a hinge on the line of the first (two short hinges on a long flap), which shares that joint. A
 * name another joint has gets a number, in `spec` itself, before the steps are made. SolidCraft takes a name twice, and
 * sweep and limits by that name then met the first joint (audit 2026-11-12, N-mechanik-3: the answer gave the first
 * hinge's limits, the second had none, and a third call built a third joint between the same parts).
 */
async function build(site: Site, spec: { fixed: string; moving: string; name: string; from?: Vec3; to?: Vec3 }, steps: Step[] | (() => Step[]), where: string, makes = false, ready: () => Promise<void> = () => Promise.resolve(), joins?: 'revolute' | 'slider'): Promise<string> {
  const { upstream, run, callId, mark } = site;
  const before = jsonOf(await upstream.callTool('inspect_design', {}, callId)) as { bodies?: { name?: unknown }[] };
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
    const list = ((joints as { joints?: unknown } | undefined)?.joints ?? []) as { name?: unknown; type?: unknown; a?: unknown; b?: unknown; frame_a?: { origin?: unknown; z?: unknown }; values?: { limits?: unknown }[] }[];
    const [a, b] = [placed(listing, spec.fixed), placed(listing, spec.moving)];
    const side = (occurrence: { id?: unknown; name: string }, value: unknown) => value === occurrence.id || value === occurrence.name;
    const same = a && b ? list.find((joint) => joint.type === joins && ((side(a, joint.a) && side(b, joint.b)) || (side(b, joint.a) && side(a, joint.b)))) : undefined;
    const kind = joins === 'revolute' ? 'hinge' : 'guide';
    if (same) {
      // On the line of the first hinge the second turns about the same axis: it binds nothing and needs no joint of its own.
      const [origin, z] = [vec3(same.frame_a?.origin), vec3(same.frame_a?.z)];
      const line = spec.from && spec.to ? spec.to.map((value, i) => value - (spec.from?.[i] ?? 0)) : null;
      const off = (vector: number[], along: number[]) => Math.hypot(...[0, 1, 2].map((i) => (vector[(i + 1) % 3] ?? 0) * (along[(i + 2) % 3] ?? 0) - (vector[(i + 2) % 3] ?? 0) * (along[(i + 1) % 3] ?? 0))) / Math.hypot(...along);
      const onLine = joins === 'revolute' && origin && z && line && spec.from && off(z, line) < 1e-3 * Math.hypot(...z) && off(origin.map((value, i) => value - (spec.from?.[i] ?? 0)), line) < 0.01;
      // On the stretch of the first itself the new knuckles would be cut into the old ones (audit 2026-11-12, H-02): the
      // first joint lies in the middle of its hinge, so a line that holds that point lies over it.
      const at = onLine ? origin.reduce((sum, value, i) => sum + (value - (spec.from?.[i] ?? 0)) * (line[i] ?? 0), 0) / line.reduce((sum, value) => sum + value * value, 0) : -1;
      // A hinge that reaches only partly over the first, or over a second one that has no joint of its own, holds no
      // such point (review 3 of PR #358): those are known by their pins.
      const over = at >= 0 && at <= 1 ? String(same.name) : onLine && spec.from ? await pinOver(run, spec.from, line) : null;
      if (over !== null) throw new Error(`the hinge ${JSON.stringify(over)} already joins ${spec.fixed} and ${spec.moving} on this stretch of the line, and new knuckles would be cut into its own. Change that one instead: take it back with undo, or delete its features and its joint, then call again. A second hinge goes on the same line beside the first.`);
      if (!onLine) throw new Error(`the joint ${JSON.stringify(same.name)} already joins ${spec.fixed} and ${spec.moving} as a ${kind}${joins === 'revolute' ? ' on another line' : ''}, and a second ${joins === 'revolute' ? 'axis' : 'guide'} between the same two bodies would bind it. ${joins === 'revolute' ? 'Put this hinge on the line of the first, or change the first' : 'Change that one instead'}: take it back with undo, or delete its features and its joint, then call again.`);
      const limits = same.values?.[0]?.limits;
      site.shares = { name: String(same.name), limits: Array.isArray(limits) && typeof limits[0] === 'number' && typeof limits[1] === 'number' ? [limits[0], limits[1]] : [-180, 180] };
    }
    const taken = new Set(list.map((joint) => joint.name));
    const asked = spec.name;
    for (let n = 2; taken.has(spec.name); n += 1) spec.name = `${asked} (${String(n)})`;
  }
  // The bodies are there and stand as designed: what must be measured on them before anything is built.
  await ready();
  // From here on the design changes: a call that fails later is taken back to this state.
  mark.state = await markOf(run);
  const sent = activated(typeof steps === 'function' ? steps() : steps, listing);
  const built = await run(sent);
  for (const [i, step] of sent.entries()) {
    const result = built[i] as { created_bodies?: unknown; removed_bodies?: unknown } | undefined;
    const made = [result?.created_bodies, result?.removed_bodies].flatMap((names) => (Array.isArray(names) ? (names as unknown[]) : []));
    // A step that makes its own body (a lid, a screw) says so; every other one works on a body that is there.
    if (made.length === 0 || step.params.operation === 'new' || step.command === 'parts.insert') continue;
    throw new Error(`the step ${JSON.stringify(step.params.name ?? step.command)} cut ${JSON.stringify((step.params.targets as unknown[] | undefined)?.[0] ?? step.params.body ?? 'a body')} apart (${made.map((name) => JSON.stringify(name)).join(', ')} came of it): the body is too thin or too small where the mechanism goes.`);
  }
  const apart = built.filter((result) => {
    const warning = (result as { warning?: unknown } | undefined)?.warning;
    return typeof warning === 'string' && warning.includes('separate pieces');
  }).length;
  if (apart > 0) throw new Error(`${String(apart)} piece(s) did not touch their body and stand apart from it. ${where}`);
  const [clash] = await run([{ command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } }]);
  const overlaps = ((clash as { count?: unknown } | undefined)?.count as number | undefined) ?? 0;
  return overlaps > 0 ? ' Warning: the two bodies still share volume away from the mechanism; make room between them.' : '';
}

/**
 * The name of a hinge whose pin lies on the stretch `from`–`from + line`, or null. Every hinge keeps its pin as the
 * feature "<name> ●", and `timeline.inspect` says where that cylinder starts and how long it is (SolidCraft 0.40.1).
 * shortcut: a pin that was renamed, or whose body was moved since, is not found; then only the first joint's point is known.
 */
async function pinOver(run: Run, from: Vec3, line: number[]): Promise<string | null> {
  try {
    const [design] = await run([{ command: 'document.inspect', params: { timeline: 'summary' } }]);
    const timeline = (design as { timeline?: unknown } | undefined)?.timeline;
    const pins = (Array.isArray(timeline) ? (timeline as { id?: unknown; name?: unknown }[]) : []).filter((entry) => typeof entry.name === 'string' && entry.name.endsWith(' ●'));
    if (pins.length === 0) return null;
    const read = (await run(pins.map((pin) => ({ command: 'timeline.inspect', params: { feature: pin.id } })))) as ({ suppressed?: unknown; definition?: { base?: unknown; axis?: unknown; height?: unknown } } | undefined)[];
    const length = Math.hypot(...line);
    const along = (vector: number[]) => vector.reduce((sum, value, i) => sum + value * ((line[i] ?? 0) / length), 0);
    for (const [n, pin] of read.entries()) {
      const [base, axis, height] = [vec3(pin?.definition?.base), vec3(pin?.definition?.axis), Number.parseFloat(String(pin?.definition?.height))];
      if (!base || !axis || !(height > 0) || pin?.suppressed === true) continue;
      const rel = base.map((value, i) => value - (from[i] ?? 0));
      const [start, turn] = [along(rel), along(axis) / Math.hypot(...axis)];
      // Beside the line, or across it: another hinge.
      if (Math.sqrt(Math.max(0, rel.reduce((sum, value) => sum + value * value, 0) - start * start)) > 0.01 || Math.abs(turn) < 0.999) continue;
      const [low, high] = turn > 0 ? [start, start + height] : [start - height, start];
      if (low < length - 1e-6 && high > 1e-6) return String(pins[n]?.name).slice(0, -2);
    }
  } catch {
    // Not readable: the first joint's point was tried already.
  }
  return null;
}

/** Makes the two bodies components unless they are, joins them where they are and sets the limits: the range clear of contact within `range`. */
async function join(run: Run, spec: { fixed: string; moving: string; from: Vec3; to: Vec3; name: string }, type: 'revolute' | 'slider', range: [number, number], step: number, shares?: string): Promise<[number, number] | string> {
  let [listing] = await run([{ command: 'component.list', params: {} }]);
  const loners = [spec.fixed, spec.moving].filter((name) => occurrenceOf(listing, name) === null);
  if (loners.length > 0) [, listing] = await run([{ command: 'component.from_bodies', params: { bodies: loners } }, { command: 'component.list', params: {} }]);
  const a = occurrenceOf(listing, spec.fixed);
  const b = occurrenceOf(listing, spec.moving);
  if (!a || !b) throw new Error(`${spec.fixed} and ${spec.moving} did not become components, so no joint could join them.`);
  const middle = spec.from.map((value, i) => (value + (spec.to[i] ?? value)) / 2);
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const joint = shares ?? spec.name;
  const sweeps = range.filter((to) => to !== 0).map((to) => ({ command: 'joint.sweep', params: { joint, from: 0, to } }));
  if (!shares) await run([{ command: 'joint.as_built', params: { type, a, b, at: { occurrence: a, point: middle, z: axis }, name: spec.name, quiet: true } }]);
  // SolidCraft refuses a sweep it cannot afford, such as parts that lie against each other along the way: the joint stays, without limits.
  let results: unknown[];
  try {
    results = await run(sweeps);
  } catch (cause) {
    return (cause as Error).message.replace(/^SolidCraft refused joint\.sweep: /, '');
  }
  const limit = (to: number) => (to === 0 ? 0 : reach(results[sweeps.findIndex((sweep) => sweep.params.to === to)], to, step));
  const limits: [number, number] = [limit(range[0]), limit(range[1])];
  await run([{ command: 'joint.limits', params: { joint, min: limits[0], max: limits[1] } }]);
  return limits;
}

/** The name of the body that measures where the hinge line lies; it is never kept. */
const PROBE = 'PartBuddy probe';

/**
 * How deep the room of a knuckle goes into each body, from the face nearest the hinge line (mm; 0 when it does not
 * reach it). A wall thicker than that by less than two lines is left as a skin behind the room (practice run
 * 2026-11-12: 0.8 mm of a 1.8 mm wall). Measured on trial with a thin rod on the line: a step that must fail ends the
 * batch, and SolidCraft takes the rod back. Null when it could not be measured.
 *
 * `support` names the bed and, for the webs of a hinge that hangs, each body whose wall reaches down to where its web
 * would meet it: tried with a second rod inside that wall, just under the web's foot. A web drawn to the wall's plane
 * where the wall had ended hung 4.6 mm in the air under a lid plate (audit 2026-11-12, N-mechanik-5).
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
    if (lows.length === 0) return { fixed: depth(spec.fixed), moving: depth(spec.moving) };
    const bed = Math.min(...lows);
    const sides = hangs(spec, bed) ? await carried(upstream, spec, bed, { fixed: side(spec.fixed), moving: side(spec.moving) }, callId) : {};
    return { fixed: depth(spec.fixed), moving: depth(spec.moving), support: { bed, ...sides } };
  } catch {
    return null;
  }
}

/** How thick a trial rod is (mm). */
const ROD = 0.2;

/**
 * Thin rods along a line, tried in the design and taken back like the rod of `roomDepths`: for each, the share of it
 * (0 to 1) that lies inside `body`. A rod wholly in the body says there is material all along that line.
 */
async function rodsInside(upstream: UpstreamTools, rods: { name: string; base: number[]; body: string }[], axis: number[], length: number, callId: string | undefined): Promise<Map<string, number>> {
  const shares = new Map<string, number>();
  if (rods.length === 0 || length <= 0) return shares;
  const answer = await upstream.callTool(
    'batch',
    {
      commands: [
        ...rods.map((rod) => ({ command: 'solid.cylinder', params: { diameter: ROD, height: length, base: rod.base, axis, operation: 'new', body_name: rod.name } })),
        { command: 'inspect.clearance', params: { bodies: rods.map((rod) => rod.name), against: [...new Set(rods.map((rod) => rod.body))], min_volume: 0 } },
        { command: 'sketch.inspect', params: { sketch: 2147483647 } },
      ],
      rollback: true,
    },
    callId,
  );
  const text = answer.content.find((part) => part.type === 'text')?.text;
  const found = ((JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[] }).results?.[rods.length] as { overlaps?: unknown } | undefined)?.overlaps;
  // A rod or the comparison that failed ends the batch before its answer: that says nothing about the body.
  if (!Array.isArray(found)) throw new Error('the trial gave no answer');
  // Measured on SolidCraft 0.40.1 (2026-11-12): a rod wholly in a body of 30, 100 and 300 mm comes back with this
  // volume to nine digits, and one through a 1.5 mm gap with 1.500 mm less.
  const whole = (Math.PI * ROD * ROD * length) / 4;
  for (const rod of rods) {
    const inside = (found as { a?: unknown; b?: unknown; volume_mm3?: unknown }[]).find((pair) => [pair.a, pair.b].includes(rod.name) && [pair.a, pair.b].includes(rod.body))?.volume_mm3;
    shares.set(rod.name, typeof inside === 'number' ? inside / whole : 0);
  }
  return shares;
}

/**
 * Of the walls beside a hinge line, those that can carry a web: the web ends on the bed, or a rod inside the wall just
 * under the web's foot lies in the body along the whole line.
 */
async function carried(upstream: UpstreamTools, spec: HingeSpec, bed: number, sides: { fixed: HingeSide | null; moving: HingeSide | null }, callId: string | undefined): Promise<{ fixed?: HingeSide; moving?: HingeSide }> {
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const tried = (['fixed', 'moving'] as const).flatMap((key) => {
    const wall = sides[key];
    if (!wall) return [];
    const drop = webFoot(spec.diameter, wall.distance) + ROD;
    // null: the web ends on the bed before it comes to the wall's foot.
    const base = spec.from[2] - drop <= bed ? null : spec.from.map((value, i) => value + (wall.toward[i] ?? 0) * (wall.distance + WEB.into / 2) - (i === 2 ? drop : 0));
    return [{ key, wall, base, name: `${PROBE} ${key}` }];
  });
  const shares = await rodsInside(upstream, tried.flatMap((entry) => (entry.base ? [{ name: entry.name, base: entry.base, body: spec[entry.key] }] : [])), axis, Math.hypot(...axis), callId).catch(() => new Map<string, number>());
  const out: { fixed?: HingeSide; moving?: HingeSide } = {};
  for (const entry of tried) if (entry.base === null || (shares.get(entry.name) ?? 0) >= 0.9) out[entry.key] = entry.wall;
  return out;
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
const unswept = (reason: string, shares?: string) =>
  `SolidCraft could not run it through its range (${reason.slice(0, 160)}), so ${shares ? `the limits of "${shares}" stay as they were, untried with this hinge` : 'no limits are set'}. The two bodies probably lie against each other somewhere: look with inspect.clearance, make room, then set joint.limits yourself after joint.sweep.`;

/** What leans 45° prints without support only in a material that allows it: PETG and the carbon-filled ones stop at 40°. */
const leans = (what: string, overhang: number) => `${what} lean 45°, more than the ${String(overhang)}° the material in use prints without support: they need support there, or a material that prints 45°.`;

/**
 * What a lying hinge that hangs above the bed needs to print, from what was measured and built: said only as far as it
 * holds. "Stand on webs …, so they print without support" stood over 90 to 619 mm² the print check still found
 * (audit 2026-11-12, N-mechanik-4), and over webs that had no wall under them (N-mechanik-5).
 */
function hingePrint(spec: HingeSpec, depths: Awaited<ReturnType<typeof roomDepths>>, overhang: number): string {
  if (Math.abs(spec.to[2] - spec.from[2]) > 1e-6) return '';
  const bridge = pinBridge(spec);
  // Nine knuckles is the most one hinge has: a longer line takes two hinges, which share their joint.
  const sags = bridge > BRIDGE_SPAN ? ` The pin bridges ${String(Math.round(bridge * 10) / 10)} mm inside each knuckle of ${spec.moving}, more than prints clean (${String(BRIDGE_SPAN)} mm): ${spec.knuckles < 9 ? 'use more knuckles' : 'build two shorter hinges on the same line instead of this one'}.` : '';
  const support = depths?.support;
  if (!support) return ` PartBuddy could not measure the bed and the walls beside the line, so no knuckle got a web: those that start above the bed need support.${sags}`;
  if (!hangs(spec, support.bed)) return sags;
  const count = { fixed: (spec.knuckles + 1) / 2, moving: (spec.knuckles - 1) / 2 };
  const bare = (['fixed', 'moving'] as const).filter((key) => !support[key]);
  const webs = `stand on webs at 45° that run from under the barrel down to their own wall`;
  if (bare.length === 0) {
    const all = ` All ${String(spec.knuckles)} knuckles start above the bed and ${webs}, and the pin is flat underneath where it bridges from knuckle to knuckle`;
    if (overhang < 45) return `${all}. ${leans('Webs, barrels and the bore', overhang)}${sags}`;
    return `${all}${sags ? '.' : ', so the hinge prints as it stands, without support.'}${sags}`;
  }
  const hung = bare.map((key) => `the ${String(count[key])} of ${spec[key]}`).join(' and ');
  const held = bare.length === 1 ? ` The ${String(count[bare[0] === 'fixed' ? 'moving' : 'fixed'])} knuckles of ${spec[bare[0] === 'fixed' ? 'moving' : 'fixed']} ${webs}.` : '';
  return ` The knuckles start above the bed, and ${hung} got no web: a web meets its wall ${String(webFoot(spec.diameter, spec.diameter / 2 - 0.5))} mm below the line at the most, and there is no wall there. They need support, or a wall that reaches down that far before the hinge is built.${held}${sags}`;
}

/**
 * Builds the rail and the groove of a guide or a dovetail. Whether the moving body is solid where the groove's roof
 * goes is tried first, with rods along the groove over the ridge and over both flanks, two lines of plastic above
 * them: only then does the groove get its roof. The body's box does not say it: a plate with a knob on it is high
 * enough by its box, and the roof cut it in two along the rail under "Neither needs support" (review of PR #358).
 * Without a roof the ceiling stays flat and `print` says what that means (audit 2026-11-12, T5: "printed in one piece
 * without support" over a ceiling of 13.9 mm).
 */
async function buildGuide(site: Site, spec: SlideSpec, nozzle: number, overhang: number, joins?: 'slider'): Promise<{ warnings: string; measure: unknown; print: string }> {
  const roof = slideRoof(spec);
  const skin = nozzle * 2 * 1.125;
  const needed = Math.round((roof.top + skin) * 10) / 10;
  let measure: unknown;
  // Why the groove got no roof, when it is not that the body was found short of material there.
  // 'partly': every rod lies mostly in the body, and `short` mm of the worst one do not.
  const roofless: { why: 'failed' | 'askew' | 'partly' | null; short: number } = { why: null, short: 0 };
  const warnings = await build(
    site,
    spec,
    () => slideSteps(spec),
    `Put the line from–to on a face of ${spec.fixed}, with up as that face's normal, so the rail stands on it.`,
    false,
    async () => {
      [measure] = await site.run([{ command: 'inspect.measure', params: { bodies: [spec.moving] } }]);
      const travel = railTravel(measure, spec.from, spec.to);
      if (!travel) throw new Error(`${spec.moving} could not be measured, so neither the room for the groove's roof nor how far the guide may travel is known`);
      const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
      const length = Math.hypot(...axis);
      const unit = (vector: number[]) => vector.map((value) => value / Math.hypot(...vector));
      const [along, up] = [unit(axis), unit(spec.up)];
      const across = [0, 1, 2].map((i) => (up[(i + 1) % 3] ?? 0) * (along[(i + 2) % 3] ?? 0) - (up[(i + 2) % 3] ?? 0) * (along[(i + 1) % 3] ?? 0));
      // The stretch of the line the body lies over: its travel either way is what of the rail it leaves free.
      const [start, covered] = [-travel[0], length + travel[0] - travel[1]];
      // Over the ridge and its two edges, and over the middle of each flank: each rod's top where the skin over the roof ends.
      const flank = (roof.ceiling + roof.ridge) / 4;
      const [ridge, slope] = [roof.top + skin - ROD / 2, (spec.height + spec.gap + roof.top) / 2 + skin * Math.SQRT2 - ROD / 2];
      const over: [number, number][] = [[0, ridge], [roof.ridge / 2, ridge], [-roof.ridge / 2, ridge], [flank, slope], [-flank, slope]];
      const rods = over.map(([x, y], n) => ({ name: `${PROBE} ${String(n + 1)}`, body: spec.moving, base: spec.from.map((value, i) => value + (along[i] ?? 0) * start + (across[i] ?? 0) * x + (up[i] ?? 0) * y) }));
      const shares = await rodsInside(site.upstream, rods, axis, covered, site.callId).catch(() => null);
      // No more than a rod's width of any rod may lie outside the body: through a cross groove the roof would break out.
      spec.roof = shares !== null && covered > 0 && rods.every((rod) => (1 - (shares.get(rod.name) ?? 0)) * covered <= ROD);
      // shortcut: the rods are as long as the body's box along the line, so over a line askew to the axes (or a body
      // turned on its face) they reach past the body and no roof is built; lay them by the body itself when that turns up.
      // shortcut: ends that are not flat (a round or chamfered body) leave the rods short there, and the groove gets
      // no roof though the body is full over it; the answer says so. Try only the stretch each rod can lie in when it turns up.
      const least = shares === null ? 0 : Math.min(...rods.map((rod) => shares.get(rod.name) ?? 0));
      roofless.short = Math.round((1 - least) * covered * 10) / 10;
      roofless.why = spec.roof ? null : shares === null ? 'failed' : along.filter((value) => Math.abs(value) > 1e-6).length > 1 ? 'askew' : least >= 0.5 ? 'partly' : null;
    },
    joins,
  );
  const untried = roofless.why;
  const apart = `The two print apart, each with up pointing up, and ${spec.moving} is then pushed onto the rail from an end.`;
  const wide = String(Math.round(roof.ceiling * 10) / 10);
  const flanks = spec.roof ? "The rail's flanks and the roof over the groove" : "The rail's flanks";
  const steep = overhang < 45 ? leans(flanks, overhang) : null;
  const solid = `solid up to ${String(needed)} mm over the face the rail is on`;
  const box = "the line runs askew to the axes, where the trial goes by the body's box and can reach past the body";
  const ends = `material is missing at that height along up to ${String(roofless.short)} mm of it: at ends that are round, chamfered or turned, or in a gap across the groove`;
  const print = spec.roof
    ? `${apart} ${steep ?? `Neither needs support: the rail's flanks and the roof over the groove lean 45°, and the roof's ridge is a bridge of ${String(roof.ridge)} mm.`}`
    : roof.ceiling <= BRIDGE_SPAN
      ? `${apart} The groove's ceiling is flat and ${wide} mm wide, which prints as a bridge (up to ${String(BRIDGE_SPAN)} mm)${steep ? `. ${steep}` : ", and the rail's flanks lean 45°: neither needs support."} ${untried === 'failed' ? `Whether ${spec.moving} is ${solid} could not be tried (SolidCraft's trial failed)` : untried === 'askew' ? `The trial did not find ${spec.moving} ${solid} all along the groove (${box})` : untried === 'partly' ? `${spec.moving} is ${solid} along most of the groove only (${ends})` : `${spec.moving} is not ${solid} all along the groove`}, so the groove got no roof.`
      : `${apart} The groove's ceiling is flat and ${wide} mm wide, more than prints as a bridge (${String(BRIDGE_SPAN)} mm): a roof at 45° over it needs ${spec.moving} to be ${solid}, all along the groove, and ${untried === 'failed' ? "whether it is could not be tried (SolidCraft's trial failed)" : untried === 'askew' ? `the trial did not find it so (${box})` : untried === 'partly' ? `it is along most of it only (${ends})` : 'it is not'}. Print ${spec.moving} turned over instead, lying on its top with the groove open upwards (set that face as its print face), or ${untried ? 'make sure it is' : 'make it'} that high there and build this again.${steep ? ` ${steep}` : ''}`;
  return { warnings, measure, print };
}

/**
 * A call ends in one of two states: built, with what is missing said in the answer, or not built and the design as it
 * was. A failure after the first step (the joint refused, the travel not measurable) left knuckles and cuts behind under
 * "Not built", and the next call built them twice (audit 2026-11-12, H-02).
 */
async function buildMechanism(upstream: UpstreamTools, args: Record<string, unknown>, nozzle: number, callId: string | undefined, keepFace: KeepFace, overhang: number): Promise<string> {
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
    return await mechanism(site, args, nozzle, keepFace, overhang);
  } catch (cause) {
    const message = (cause as Error).message;
    // Unset: the call was refused before anything was built.
    if (!('state' in site.mark)) throw cause;
    throw new Error(`${message.replace(/\.?$/, '.')} ${TAKEN_BACK_SAID[await takeBack(run, site.mark.state ?? null)]}`, { cause });
  }
}

/**
 * The plastic a screw joint needs (audit R54), measured before anything is drilled: the room for each head wholly inside
 * the moving body (a countersink by its width half a millimetre down, where its 90° cone is a millimetre narrower than at
 * the face), and round and under each insert's seat what the seat block needs ({@link seatStock}), the seat itself
 * plastic too, as nothing is drilled yet (a pilot hole there counts as missing; review of PR #365).
 * A curved face may take the top of the head's room all round, as it may round a seat (`curvedWall` in blockTool.ts):
 * the head still lies on the floor of its room. One that falls away to one side, an edge, may not.
 */
export function screwStock(spec: ScrewSpec): { moving: Stock[]; fixed: Stock[] } {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const length = Math.hypot(...delta);
  const axis = delta.map((value) => Math.round((value / length) * 1e6) / 1e6) as Vec3;
  const recess = headRecess(spec);
  const insert = INSERT[spec.size];
  const r3 = (value: number) => Math.round(value * 1000) / 1000;
  const entries = [spec.from, ...spec.more];
  return {
    moving: recess
      ? entries.map((at) => {
          const diameter = r3(recess.diameter - (spec.head === 'countersunk' ? 2 * FACE_DROP : 0));
          // The clearance hole is the ring's inside: a curved face is told from an edge by where round it the plastic is missing.
          return { at, base: at.map((value, k) => r3(value + (axis[k] ?? 0) * FACE_DROP)) as Vec3, axis, diameter, depth: r3(recess.depth - FACE_DROP), from: FACE_DROP, hole: 0, core: CLEARANCE_NORMAL[spec.size], slack: ((Math.PI * diameter ** 2) / 4) * CURVED_FACE };
        })
      : [],
    fixed:
      spec.thread === 'insert' && insert
        ? entries.map((at) => {
            const meet = at.map((value, k) => r3(value + (delta[k] ?? 0))) as Vec3;
            return { ...seatStock({ block: 'insertSeat', body: spec.fixed, point: meet, size: spec.size, diameter: insert.diameter, depth: insert.length + 1 }, meet, axis), hole: 0 };
          })
        : [],
  };
}

async function mechanism(site: Site, args: Record<string, unknown>, nozzle: number, keepFace: KeepFace, overhang: number): Promise<string> {
  const { upstream, run, callId } = site;
  if (args.kind === 'hinge') {
    const spec = hingeOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const reach = String(Math.round((spec.diameter / 2 - 0.5) * 10) / 10);
    let depths: Awaited<ReturnType<typeof roomDepths>> = null;
    const least = String(Math.round(nozzle * 2 * 1.125 * 100) / 100);
    const rooms = () => depths ? ` The knuckles' rooms go ${String(depths.fixed)} mm into ${spec.fixed} and ${String(depths.moving)} mm into ${spec.moving}, measured from the face nearest the line: a wall there must be ${least} mm thicker than that, or thinner than it (the room then opens through the wall); anything between is left as a thin skin.` : '';
    const warnings = await build(site, spec,
      // With the walls and the bed measured, knuckles that start in the air get their webs.
      () => hingeSteps(depths?.support ? { ...spec, support: depths.support } : spec),
      `Put the hinge line within ${reach} mm of both bodies (the barrel is ${String(spec.diameter)} mm, so it must overlap each by at least 0.5 mm). PartBuddy cuts each knuckle's room in the other body itself.`,
      false,
      async () => {
        depths = await roomDepths(upstream, spec, callId);
        const thin = depths && typeof args.wall === 'number' ? skinProblem(depths, spec, args.wall, nozzle) : null;
        if (thin) throw new Error(thin);
      },
      'revolute',
    );
    // A hinge on the line of an earlier one only narrows what that joint allows: it is run through its limits again.
    const range = await join(run, spec, 'revolute', site.shares?.limits ?? [-180, 180], 1, site.shares?.name);
    const print = `${site.shares ? ` It lies on the line of the hinge "${site.shares.name}" and turns about that hinge's joint, which carries both now.` : ''}${hingePrint(spec, depths, overhang)}`;
    if (typeof range === 'string') return `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns) and joined them, but ${unswept(range, site.shares?.name)}${print}${warnings}`;
    const [min, max] = range;
    return (
      `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns): ${String(spec.knuckles)} knuckles, barrel ${String(spec.diameter)} mm, pin ${String(pinDiameter(spec.diameter))} mm, ` +
      `gap ${String(spec.gap)} mm everywhere. It turns from ${String(min)}° to ${String(max)}° before the bodies meet, and those are its limits now; 0° is as designed. ` +
      `${MOVE} If it should open further, make room where the bodies meet and set joint.limits again.${print}${rooms()}${warnings}`
    );
  }
  if (args.kind === 'slide') {
    const spec = slideOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    // The box along the line is the same before and after the groove is cut.
    const { warnings, measure, print } = await buildGuide(site, spec, nozzle, overhang, 'slider');
    const travel = railTravel(measure, spec.from, spec.to);
    if (!travel) throw new Error(`${spec.moving} could not be measured, so how far the guide may travel is not known.`);
    const range = await join(run, spec, 'slider', travel, 0.1);
    if (typeof range === 'string') return `Built the guide "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (slides) and joined them, but ${unswept(range)} ${print}${warnings}`;
    const [min, max] = range;
    const mm = (value: number) => String(Math.round(value * 10) / 10);
    return (
      `Built the guide "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (slides): a dovetail rail ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high, ` +
      `gap ${String(spec.gap)} mm everywhere. It slides from ${mm(min)} mm to ${mm(max)} mm while ${spec.moving} stays on the rail and the bodies do not meet, and those are its limits now; 0 mm is as designed. ` +
      `${MOVE} Nothing holds it at the ends of the rail; add stops if it must not come off. ${print}${warnings}`
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
      `The lid is ${String(round2(spec.diameter + 2 * (thread.depth + spec.gap + LID.wall)))} mm wide and covers the top ${String(skirt)} mm of the neck, has flutes to grip and prints standing on its top (its print face is set); ${overhang < 45 ? leans("the threads' flanks on both parts", overhang).replace(/\.$/, '') : 'both parts print without support'}. ` +
      `Keep the neck a plain cylinder of ${String(spec.diameter)} mm there, with a wall of at least 2 mm.${warnings}`
    );
  }
  if (args.kind === 'screw') {
    const spec = screwOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    // The plastic round the holes is measured before anything is built (audit R54): nothing of a joint that lacks it is built.
    const stock = screwStock(spec);
    const recess = headRecess(spec);
    const room = spec.head === 'cap' ? 'counterbore' : 'countersink';
    const measured = { all: true, fell: 0 };
    const warnings = await build(site, spec, screwSteps(spec), `Give from on the outer face of ${spec.moving} and to on the face where it meets ${spec.fixed}.`, false, async () => {
      for (const [body, rooms, need] of [
        [spec.moving, stock.moving, `the ${room} for the head is ${String(recess?.diameter)} mm wide and must lie wholly inside ${spec.moving}: move the screw at least ${String(round2((recess?.diameter ?? 0) / 2))} mm away from its edges and other cuts, or use head none`],
        [spec.fixed, stock.fixed, `the seat of an ${spec.size} insert needs ${String(seatWall(spec.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it. Thicken ${spec.fixed} there, move the screw away from edges and other cuts, or put a boss there`],
      ] as const) {
        if (rooms.length === 0) continue;
        const short = await shortOf(upstream, body, rooms, callId, (mm3) => (measured.fell = Math.max(measured.fell, mm3)));
        if (short) throw new Error(`${short}; ${need}.`);
        measured.all &&= short === null;
      }
    });
    const count = spec.more.length + 1;
    const length = screwLength(spec);
    const insert = INSERT[spec.size];
    const screw = spec.head === 'countersunk' ? 'countersunk screws (ISO 10642)' : 'socket head cap screws (ISO 4762)';
    return (
      `Built ${String(count)} screw joint${count > 1 ? 's' : ''} "${spec.name}" that hold${count > 1 ? '' : 's'} ${spec.moving} on ${spec.fixed}: in ${spec.moving} a clearance hole for ${spec.size} (ISO 273, normal)` +
      `${spec.head === 'cap' ? ' with a counterbore for the head' : spec.head === 'countersunk' ? ' with a 90° countersink' : ''}, in ${spec.fixed} ` +
      `${spec.thread === 'insert' && insert ? `the seat of a heat-set insert (${String(insert.diameter)} mm wide, ${String(insert.length + 1)} mm deep)` : 'a modelled thread'}. ` +
      `${length === null ? 'No standard screw length ends inside the thread at this thickness, so no screws were put in: choose the length yourself.' : `To buy: ${String(count)} × ${spec.size}×${String(length)} ${screw}${spec.thread === 'insert' && insert ? ` and ${String(count)} ${spec.size} heat-set inserts ${String(insert.length)} mm long` : ''}${spec.screws ? '; the screws are in the design as standard parts' : ''}.`} ` +
      (spec.thread === 'insert' ? `Each insert's seat needs ${String(seatWall(spec.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it${recess ? `, and the ${room} for each head lies inside ${spec.moving}` : ''}. ` : recess ? `The ${room} for each head lies inside ${spec.moving}. ` : '') +
      `${stock.moving.length + stock.fixed.length === 0 ? '' : measured.all ? `PartBuddy measured that plastic, from ${String(FACE_DROP)} mm under the faces on: it is there.${measured.fell > 0 ? fallenSaid(measured.fell, Math.max(0, ...stock.moving.map((room) => room.slack ?? 0))) : ''}` : 'PartBuddy could not measure that plastic this time: check it yourself.'}${warnings}`
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
      `It needs ${String(reach.above)} mm of flat wall on the lid above the joint and ${String(reach.below)} mm on the box below it. Print the lid on its top: ${overhang < 45 ? leans("the arm's foot and the bead's faces", overhang).replace(/\.$/, '') : 'the arm then grows out of it without support'}; the box prints standing. The arm stands upright that way and bends across its layers, the weak way: for a lid opened often use PETG or ABS rather than PLA. Not printed yet: how firmly it holds shows on the first print.${warnings}`
    );
  }
  if (args.kind === 'plug' && args.shape === 'dovetail') {
    // The guide's own dovetail as a close fit: 0.2 mm, where guides for printed dovetails run from 0.1 to 0.3.
    const spec = slideOf({ ...args, gap: typeof args.gap === 'number' ? args.gap : 0.2, name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name : 'Dovetail' }, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const { warnings, print } = await buildGuide(site, spec, nozzle, overhang);
    return (
      `Built the dovetail "${spec.name}" between ${spec.fixed} (carries the rail) and ${spec.moving} (has the groove): ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high with 45° flanks, ${String(spec.gap)} mm clear all round. ` +
      `It makes no joint: ${spec.moving} is pushed on along the line and stops where the groove ends inside it; where the groove runs through, nothing stops it. ${print} Not printed yet: when it binds or rattles, build it again with another gap.${warnings}`
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

/** The upstream tools plus `partbuddy_mechanism`; `nozzle` is the printer's nozzle in use, for the default gap, and `overhang` how far the material in use leans without support (degrees), for what the answers promise. */
export function withMechanismTool(upstream: UpstreamTools, nozzle: () => number, keepFace: KeepFace = () => undefined, overhang: () => number = () => 45): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), mechanismTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== MECHANISM_TOOL) return upstream.callTool(name, args, callId);
      try {
        return { content: [{ type: 'text', text: await buildMechanism(upstream, args, nozzle(), callId, keepFace, overhang()) }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route, after the joint guidance. */
export const MECHANISM_GUIDANCE = `For a hinge (a lid that folds, a flap, a clamp that opens) or a guide (a drawer, a slider, a carriage on a rail) call ${MECHANISM_TOOL} once both bodies exist instead of modelling knuckles, a pin or a rail yourself: it builds the geometry with the right gaps, joins the bodies and sets the limits. For a lid that should hold shut by itself (a box, a case, a container) call it with kind closure instead of modelling a latch, a hook or a clip: a lip with a snap bead inside the lid, nothing standing out and no wall cut through. For parts that are screwed together (a lid on a housing, a bracket on a base, a cover) call it with kind screw instead of drilling the holes yourself: it sizes the clearance hole, the room for the head and the seat of the heat-set insert, and says which screws to buy. For a round container that should screw shut (a jar, a canister, a bottle cap) build the container with a plain cylindrical neck and call it with kind lid: it threads the neck and makes the lid, instead of modelling a thread yourself. For a cover or a housing half that should clip on and come off again by pressing on catches (an electronics housing, a battery cover) call it with kind snap: hooks on one part, their windows through the other part's wall. For a lid that should be held down by a latch one sees and opens with a finger (a tool box, a case with a hinged lid) call it with kind latch: a snap latch outside, on the wall opposite the hinge. For a part split in two to fit the printer, or two parts that are plugged or glued together, call it with kind plug: pegs with their pockets (two or more), or shape dovetail to push one part onto the other.`;
