import { randomUUID } from 'node:crypto';

import { LID, LIP, WEB, hangs, hingeDiameter, hingeLies, printTogether, headRecess, hingeProblem, hingeSteps, pinBridge, webFoot, lidProblem, lidSkirt, lidSteps, lidThread, lipProblem, lipSteps, lipThick, RILLE_DEPTH, pinDiameter, screwFit, screwLengths, screwProblem, screwSink, screwSteps, screwWindow, sinkMost, slideOver, slideProblem, slideRoof, slideSteps, SCREWS_MORE, HOOKS_MORE, PEGS_MORE, snapFrame, snapHold, snapHook, snapLimit, snapProblem, snapSteps, snapStrain, snapWindow, standsUpright, limitWords, uprightSaid, latchArm, latchFrame, latchProblem, latchReach, latchSteps, latchStrain, LATCH, SNAP_OFTEN, SHARP_ROOT, pegBore, pegFloor, pegLength, pegProblem, pegSteps, PEG, SNAP, type HingeSpec, type HingeSide, type LatchSpec, type LidSpec, type LipSpec, type PegSpec, type ScrewSpec, type SlideSpec, type SnapSpec } from '../../shared/mechanisms';
import { BLOCK_SIZES, CLEARANCE_NORMAL, INSERT, type BlockSize } from '../../shared/screwSizes';
import { BRIDGE_SPAN, minimumFloor, minimumWall } from '@partbuddy/geometry';
import { printInPlaceGap, type FitPrinter } from '../../shared/designFit';
import { DEFAULT_MATERIAL, DEFAULT_PRINTER, drawnHole, fitClearance, heldSaid, unmeasuredSaid, type ToolMaterial, type ToolPrinter } from '../../shared/toolFit';

import { componentOf } from '../solidcraft/actions';
import { componentsWithBodies, printGroupsOf } from '../solidcraft/mirror';
import { CURVED_FACE, FACE_DROP, SEAT_UNDER, fallenSaid, seatStock, seatWall, shortOf, type Stock } from './blockTool';
import { markOf, TAKEN_BACK_SAID, takeBack, type Mark, type Run } from './takeBack';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * `partbuddy_mechanism` (ADR 0027, plan step G3): the assistant asks for a mechanism or a connection
 * between two bodies and PartBuddy builds proven geometry; a hinge or a guide it also joins with
 * SolidCraft's joint, runs through its range and limits where the parts meet. The model decides
 * where it goes; gaps, knuckles, flanks and the joint do not depend on it.
 */

export const MECHANISM_TOOL = 'partbuddy_mechanism';

const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

/** The wall a screw lid's neck keeps at least, under the thread (mm); `neckTrial` measures it at `NECK_POINTS` points round the axis. */
export const NECK_WALL = 2;
const NECK_POINTS = 8;
/** mm³ the lid's room may hold beside the neck: SolidCraft gives these volumes to nine digits (rodsInside), so more is plastic. */
const NECK_SLACK = 0.01;
/** How far a knuckle's barrel reaches into its own body at least (mm): less, and it hangs on a sliver (audit W8). */
const HOLD = 0.5;

const mechanismTool: UpstreamTool = {
  name: MECHANISM_TOOL,
  description:
    'Build a mechanism or a connection between two bodies from proven geometry; the answer says how it prints. ' +
    'hinge: knuckles in turn on both bodies and a pin through them, the same gap everywhere, printed in place as one piece. Give the hinge line (from, to) in the gap between the bodies, level with the bed and half the barrel diameter above it when the part prints lying flat, or straight up when it prints standing (a line at a slant is refused); ' +
    'the line must lie closer to both bodies than the barrel radius less ' + String(HOLD) + ' mm, so the knuckles grow out of them: PartBuddy measures that before it builds. It cuts each knuckle\'s room in the other body itself, a gap wider than the barrel, and carries knuckles that start above the bed on webs at 45° down to their own walls, where the wall reaches about one and a quarter barrel diameters below the line (the answer says where it does not, and what then needs support): add no supports of your own. PartBuddy also measures the walls along the line: a room that would leave less than two lines of a wall (of a floor: four layers, at least ' + String(minimumFloor(0.001)) + ' mm) behind it is refused, with how far to move the line. ' +
    'slide: a dovetail rail on the fixed body and its groove in the moving body, which lies over the rail a gap above the face. Give the middle line of the rail (from, to) on that face and the face normal (up). The two print apart and the moving body is pushed onto the rail from an end. Where the moving body stands high enough over that face (the answer names how high) the groove gets a roof at 45° and prints as it stands; otherwise its ceiling is flat and the answer says how to lay the part. ' +
    'PartBuddy also joins the two with a joint, finds how far it moves before the bodies meet (a slide: while the moving body stays on its rail) and sets that as its limits; the user then moves it with a slider in the view. ' +
    'closure: a snap closure between a lid and its box, nothing standing out: a lip inside the lid that goes into the box along its wall and centres the lid, a bead that snaps into a rille of the box\'s wall, and a notch for a fingernail. ' +
    'Give from and to as opposite corners of the lid\'s inner room at its rim (both at the rim\'s height), up as the way the lip stands out of the lid (+Z when the lid lies open side up, -Z when it sits on the box), wall and radius of the lid, and the side with the catch (a long wall, opposite the hinge). ' +
    'When the lid is built open beside the box and closes on a hinge, give the hinge line too (hinge_from, hinge_to), so the rille lands where the bead closes. It makes no joint. ' +
    'When the lid is a flat plate without walls of its own, say flat: from and to are then the corners of the box\'s inner room on the plate\'s face towards the box, and the lip stands on that face. ' +
    'screw: one or more screws that hold the moving body on the fixed one: a clearance hole with the room for the head in the moving body, and on the same line the seat of a heat-set insert (or a modelled thread from M5) in the fixed body; the screws go in as standard parts. ' +
    'Give from where the screw goes in (on the outer face of the moving body) and to where its line passes into the fixed body (on the face the two meet at); more lists where further screws of the same kind go in. ' +
    'snap: cantilever snap hooks standing on the fixed body, each catching in a window cut through a wall of the moving body, for a cover that clips on and comes off by pressing the catches back. Give from as the foot of the hook (on the face of the fixed body it stands on, at the inner face of that wall), up as the way the hook stands, which is the way the parts come apart, to as a point further into the wall (the way the catch points), wall as the wall\'s thickness, and more for further hooks catching the same way; call again for the opposite wall. ' +
    'PartBuddy measures that wall at each hook before it builds and says what is wrong: as thick as wall, its inner face at from, and whole round the window, which goes from ' + String(snapWindow().from) + ' to ' + String(snapWindow().to) + ' mm above the foot and is ' + String(2 * snapWindow().half) + ' mm wide on a 0.4 mm nozzle, by two lines of the nozzle or four layers (at least ' + String(minimumFloor(0.001)) + ' mm), whichever is more, as the part may print either way. On a coarser nozzle, or in a material that takes less bending, the hook is thicker or longer and its window with it: the answer gives the sizes. It makes no joint. ' +
    'plug: a plugged connection that makes no joint, to align and glue the halves of a split part or to push one part onto another. With shape peg (the default): round pegs on the fixed body and their pockets in the moving one; give from as the foot of the peg on the face the two meet at, to as a point further into the moving body, more for further pegs (two or more, far apart, keep the parts from turning), diameter (default 5) and gap per side (default the material\'s push fit to slide and glue, ' + String(fitClearance('push', DEFAULT_PRINTER)) + ' in PLA; its clamp fit to press, ' + String(fitClearance('clamp', DEFAULT_PRINTER)) + ' in PLA). ' +
    'With shape dovetail: a dovetail rail on the fixed body and its groove in the moving one, given as for slide (from, to, up, width, height) but a close fit (gap default the material\'s push fit, ' + String(fitClearance('push', DEFAULT_PRINTER)) + ' in PLA; less to press) and without a joint; the moving body is pushed on from the end at from and stops at to where the groove ends inside it. ' +
    'latch: a snap latch on the outside of a box, where the outer walls of lid and box lie in one plane: an arm grows out of the lid\'s wall, hangs down over the joint and snaps with a hook under a bead on the box; pulled at its lower end it lets go. Give fixed as the box and moving as the lid, from as the middle of the latch on the line where the two meet on that wall, to as a point straight out of the wall, up as the way from box to lid, and width. ' +
    'PartBuddy measures before it builds that both walls are flat there and plastic ' + String(LATCH.into) + ' mm deep, across the latch: on a 0.4 mm nozzle the lid\'s from ' + String(LATCH.foot) + ' to ' + String(latchReach().above) + ' mm above the joint, the box\'s from ' + String(LATCH.foot) + ' to ' + String(latchReach().below) + ' mm below it (on a coarser nozzle the arm is thicker and needs more: the answer says). ' +
    'It is for a lid that lifts off and prints apart from its box: one in the middle of a long wall, or one on each of two opposite walls. A lid on a print-in-place hinge prints with its box, where hook and bead would fuse: use closure there. It makes no joint. ' +
    'lid: a screw lid for a round container. It coils a thread with 45° flanks onto the container\'s neck and makes the lid itself, with the matching thread, flutes to grip and its top as print face; the two mesh as built. ' +
    'Give the container as fixed, the name the lid shall have as moving (no such body yet), from as the centre of the rim at its height, and diameter as the neck\'s outer diameter; the neck must be a plain upright cylinder of that diameter below the rim, with a wall of at least ' + String(NECK_WALL) + ' mm, as far down as the lid covers it: PartBuddy measures that before it builds and says what is wrong. ' +
    'Holes, seats and pockets are drawn wider by the hole allowance of the material in use, and the default fits are its profile\'s: give sizes as they shall come out. ' +
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
      side: { type: 'string', enum: ['x-', 'x+', 'y-', 'y+'], description: 'closure: the wall of the lid\'s inner room with the catch and the notch; with a hinge line, the wall opposite it.' },
      wall: { type: 'number', minimum: 1.6, maximum: 10, description: 'closure: the lid\'s wall thickness in mm; default 2. snap: the thickness of the wall the window goes through; default 2. Not used by the other kinds: a hinge measures its walls itself.' },
      radius: { type: 'number', minimum: 0, description: 'closure: the radius of the inner room\'s corners in mm; default 0 (sharp); at most half the room\'s shorter side less 1 mm.' },
      size: { type: 'string', enum: [...BLOCK_SIZES], description: 'screw: the screw; default M3.' },
      head: { type: 'string', enum: ['cap', 'countersunk', 'none'], description: 'screw: socket head sunk in a counterbore (default), countersunk head, or a head lying on the face.' },
      thread: { type: 'string', enum: ['insert', 'tapped'], description: 'screw: a heat-set insert (default, M2 to M6) or a thread modelled into the plastic (M5 and larger).' },
      more: { type: 'array', items: vector, maxItems: SCREWS_MORE, description: `screw: where further screws like this one go in (up to ${String(SCREWS_MORE)}); they run the same way through the same thickness. snap: the feet of further hooks catching the same way (up to ${String(HOOKS_MORE)}). plug: the feet of further pegs (up to ${String(PEGS_MORE)}).` },
      screws: { type: 'boolean', description: 'screw: put the screws in as standard parts; default true.' },
      flat: { type: 'boolean', description: 'closure: true when the lid is a flat plate without walls; the lip then stands on its face, without a foot inside the lid and without a notch.' },
      hinge_from: { ...vector, description: 'closure: one end of the hinge line the lid closes about, when it is built open.' },
      hinge_to: { ...vector, description: 'closure: the other end of that line; it runs along X or along Y.' },
      diameter: { type: 'number', minimum: 3, maximum: 200, description: 'plug: the diameter of the pegs (3 to 20); default 5. hinge: outer diameter of the barrel in mm (4 to 40); default 6, more where a wider nozzle needs it for two lines round the bore. The pin is half of it. lid: the outer diameter of the neck (16 to 200).' },
      starts: { type: 'integer', enum: [1, 2, 3], description: 'lid: threads side by side; default 1. With 2 or 3 the lid closes in less than a turn.' },
      knuckles: { type: 'integer', enum: [3, 5, 7, 9], description: `hinge: how many knuckles; default by the length of the line. Lying, the pin bridges each knuckle of the moving body and may bridge at most ${String(BRIDGE_SPAN)} mm.` },
      width: { type: 'number', minimum: 2, maximum: 60, description: 'slide: width of the rail at its foot in mm; default 6. It widens by its height on each side. latch: its width along the wall (5 to 40); default 10.' },
      height: { type: 'number', minimum: 1.5, maximum: 20, description: 'slide: height of the rail in mm; default 3, at most width.' },
      gap: { type: 'number', minimum: 0.05, maximum: 1, description: "The gap between the parts in mm. hinge: default and least the printer's nozzle, at least 0.3 (up to 1). slide: default the printer's nozzle, at least 0.3 (allowed 0.2 to 1). lid: radial, default three quarters of the nozzle, 0.3 to 0.6 (allowed 0.2 to 0.6). plug with pegs: per side, default the material's push fit to slide and glue (" + String(fitClearance('push', DEFAULT_PRINTER)) + " in PLA), its clamp fit to press (allowed 0.05 to 0.5); plug dovetail: all round, default the push fit (allowed 0.1 to 1). Not used by closure, snap, latch and screw." },
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

/**
 * What a SolidCraft answer that failed says, in one sentence: the step and its reason, never its JSON (audit
 * N-mechanik-17: "Not built: {\n \"applied\": [], …" reached the model, cut at 300 characters).
 */
export function refusal(text: unknown): string {
  if (typeof text !== 'string') return 'SolidCraft gave no answer';
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    // Plain text: SolidCraft's own sentence.
    return text.slice(0, 300);
  }
  // JSON that is no object (a string, a number) is SolidCraft's sentence too.
  if (typeof reply === 'string') return reply.slice(0, 300);
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) return text.slice(0, 300);
  const { failed, error } = reply as { failed?: { command?: unknown; error?: unknown }; error?: unknown };
  const reason = (value: unknown) => String(typeof value === 'object' && value !== null && 'message' in value ? value.message : value).slice(0, 200);
  if (failed) return `SolidCraft refused ${String(failed.command)}: ${reason(failed.error)}`;
  if (error !== undefined && error !== null) return `SolidCraft refused it: ${reason(error)}`;
  return 'SolidCraft answered with an error and gave no reason';
}

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (result.isError || typeof text !== 'string') throw new Error(refusal(text));
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
    gap: typeof args.gap === 'number' ? args.gap : Math.min(1, printInPlaceGap({ nozzle, layer: 0 })),
    name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim().slice(0, 60) : name,
  };
  return shared;
}

/** The hinge the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function hingeOf(args: Record<string, unknown>, nozzle: number, layer = 0.2): HingeSpec | string {
  const base = common(args, nozzle, 'Hinge');
  if (typeof base === 'string') return base;
  const { length, ...rest } = base;
  const printer: FitPrinter = { nozzle, layer };
  const lying = hingeLies(rest) === 'lying';
  // Whole micrometres up: knuckles and gaps are laid out in them (hingeSteps).
  const gap = Math.ceil(rest.gap * 1000 - 1e-6) / 1000;
  const spec: HingeSpec = {
    ...rest,
    gap,
    // The standard barrel, or the thinnest that keeps two lines round the bore with this gap on a wider nozzle (audit
    // N-passung-texte-2, W4, T12: from a 0.5 mm nozzle on, the defaults were refused). Standing it stays 6 mm and the
    // answer warns of the thin pin: a barrel of 10 mm for a 5 mm pin made the flat ends over the gaps 111 mm² for 18 at
    // 0.4 mm (review of PR BC-10, 11, measured 2026-11-13).
    diameter: typeof args.diameter === 'number' ? args.diameter : Math.max(6, hingeDiameter(gap, lying, printer) ?? 6),
    // Lying, it is the pin's bridge that counts: inside each knuckle of the moving body it bridges from one fixed knuckle
    // to the next, a gap further on each side than the knuckle is long, and past BRIDGE_SPAN hingeProblem refuses it.
    // Standing, the pin bridges nothing: knuckles of at most 10 mm where the line allows, longer past nine.
    knuckles: typeof args.knuckles === 'number' ? args.knuckles : ([3, 5, 7, 9].find((count) => (lying ? pinBridge({ ...rest, gap, knuckles: count }) <= BRIDGE_SPAN : length / count <= 10)) ?? 9),
  };
  return hingeProblem(spec, printer) ?? spec;
}

/** The guide the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function slideOf(args: Record<string, unknown>, nozzle: number, least = 0.2, layer = 0.2): SlideSpec | string {
  const base = common(args, nozzle, 'Guide');
  if (typeof base === 'string') return base;
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec: SlideSpec = { fixed: base.fixed, moving: base.moving, from: base.from, to: base.to, gap: base.gap, name: base.name, up, width: typeof args.width === 'number' ? args.width : 6, height: typeof args.height === 'number' ? args.height : 3 };
  const problem = slideProblem(spec, least);
  if (problem) return problem;
  const over = slideOver(spec, layer);
  return over === undefined ? spec : { ...spec, over };
}

/** How a guide's gap is said: the same everywhere, or more over the rail's head where that goes to whole layers. */
const gapSaid = (spec: SlideSpec, layer: number, everywhere: string) => (spec.over === undefined ? `${String(spec.gap)} mm ${everywhere}` : `${String(spec.gap)} mm clear, ${String(spec.over)} mm over the rail's head (whole layers of ${String(layer)} mm)`);

/** The closure the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function lipOf(args: Record<string, unknown>, nozzle = 0.4): LipSpec | string {
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
    nozzle,
    name: base.name,
  };
  return lipProblem(spec) ?? spec;
}

/** The pegs the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function pegOf(args: Record<string, unknown>, printer: ToolPrinter = DEFAULT_PRINTER): PegSpec | string {
  const base = common(args, 0.4, 'Peg');
  if (typeof base === 'string') return base;
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((point) => point === null)) return 'more must be a list of points, each three numbers';
  const spec: PegSpec = { fixed: base.fixed, moving: base.moving, from: base.from, to: base.to, more: more as Vec3[], diameter: typeof args.diameter === 'number' ? args.diameter : PEG.least, gap: typeof args.gap === 'number' ? args.gap : within(fitClearance('push', printer), PEG_GAP), ...(printer.material ? { material: printer.material } : {}), name: base.name };
  return pegProblem(spec) ?? spec;
}

/** A default fit from the profile kept within what the kind takes, so a measured fit never refuses a size nobody gave (BC-16 review). */
const within = (value: number, [least, most]: readonly [number, number]) => Math.min(most, Math.max(least, value));
/** What pegOf (pegProblem) and the dovetail (slideOf with its least) take for gap, mm. */
const PEG_GAP = [0.05, 0.5] as const;
const DOVETAIL_GAP = [0.1, 1] as const;

/** The latch the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function latchOf(args: Record<string, unknown>, nozzle = 0.4, material?: { name?: string | undefined }): LatchSpec | string {
  const base = common(args, 0.4, 'Latch');
  if (typeof base === 'string') return base;
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec: LatchSpec = { fixed: base.fixed, moving: base.moving, from: base.from, up, out: base.to.map((value, i) => value - (base.from[i] ?? 0)) as Vec3, width: typeof args.width === 'number' ? args.width : 10, arm: latchArm({ nozzle, layer: 0.2 }, material), name: base.name };
  return latchProblem(spec) ?? spec;
}

/** What each kind reads besides kind, fixed, moving, from and name; a plug by its shape. */
const TAKES: Record<string, readonly string[]> = {
  hinge: ['to', 'gap', 'diameter', 'knuckles'],
  slide: ['to', 'up', 'gap', 'width', 'height'],
  closure: ['to', 'up', 'side', 'wall', 'radius', 'hinge_from', 'hinge_to', 'flat'],
  screw: ['to', 'size', 'head', 'thread', 'more', 'screws'],
  lid: ['diameter', 'starts', 'gap'],
  snap: ['to', 'up', 'more', 'wall'],
  latch: ['to', 'up', 'width'],
  peg: ['shape', 'to', 'more', 'diameter', 'gap'],
  dovetail: ['shape', 'to', 'up', 'width', 'height', 'gap'],
};

/** What the model gave that the kind does not read, said after the answer (audit W15: `gap` passed silently by closure, snap, latch and screw); empty when nothing. */
export function unusedSaid(args: Record<string, unknown>): string {
  const kind = args.kind === 'plug' ? (args.shape === 'dovetail' ? 'dovetail' : 'peg') : String(args.kind);
  const takes = TAKES[kind];
  if (!takes) return '';
  const unused = Object.keys(args).filter((key) => args[key] !== undefined && !['kind', 'fixed', 'moving', 'from', 'name', ...takes].includes(key));
  return unused.length > 0 ? ` ${kind} takes no ${unused.join(', ')}: ${unused.length > 1 ? 'they were' : 'it was'} not used.` : '';
}

/** The snap hooks the model asked for, with PartBuddy's defaults; or what is wrong with the request. */
export function snapOf(args: Record<string, unknown>, nozzle = 0.4, material?: { name?: string | undefined }): SnapSpec | string {
  const base = common(args, 0.4, 'Snap hook');
  if (typeof base === 'string') return base;
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((point) => point === null)) return 'more must be a list of points, each three numbers';
  const toward = base.to.map((value, i) => value - (base.from[i] ?? 0)) as Vec3;
  const spec: SnapSpec = { fixed: base.fixed, moving: base.moving, from: base.from, up, toward, more: more as Vec3[], wall: typeof args.wall === 'number' ? args.wall : 2, hook: snapHook({ nozzle, layer: 0.2 }, material), name: base.name };
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
export function screwOf(args: Record<string, unknown>, nozzle = 0.4, material?: ToolMaterial): ScrewSpec | string {
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
  const spec: ScrewSpec = { fixed: base.fixed, moving: base.moving, from: base.from, to: base.to, more: more as Vec3[], size: size as BlockSize, head, thread, screws: args.screws !== false, nozzle, ...(material ? { material } : {}), name: base.name };
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

/**
 * How far a sweep ran before two parts met, cut towards zero to whole steps so the limit is clear of the contact; `to`
 * when it ran through. Counted in steps first: `Math.trunc(stopped / step) * step` made 0.2 of 0.3 and 12.200000000000001
 * of 12.2 (audit W12).
 */
export function reach(sweep: unknown, to: number, step: number): number {
  const stopped = (sweep as { stopped_at?: unknown } | undefined)?.stopped_at;
  if (typeof stopped !== 'number' || !Number.isFinite(stopped)) return to;
  const steps = Math.trunc(Math.round((stopped / step) * 1e6) / 1e6);
  return Math.round(steps * step * 1e6) / 1e6 + 0;
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
  /** Where a fit held within its range is written (BC-16 review S2). */
  log?: (line: string) => void;
}
/** Keeps the face a mechanism laid its part on, by the face's name, for the plate view. */
type KeepFace = (body: string, face: string) => void;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** How much of a body's box, each way across, the face `layOn` lays it on must fill (own choice: a top with rounds or chamfers of a tenth of its size still passes). */
const FACE_FILLS = 0.75;

/**
 * Sets the print face of `body` on its face that points `down` (along an axis), at the middle of its box, and keeps it for
 * the plate view, as `lidSteps` does for a screw lid (audit W48, R29, N-mechanik-19: the answers of the flat closure and
 * the latch asked the model to set it, and the print check judged them as built: 2400 mm² under a latch's lid). Null when
 * it is set, else why not. The face at that point must fill the box across, both ways, to `FACE_FILLS` at least: on a lid
 * with a knob in the middle the point lies on the knob's top (review of BC-15, S1), and that is not set; nor is a face
 * SolidCraft does not measure.
 * shortcut: the face's two sides are reckoned from its area and outer perimeter as a rectangle's; a ring or an L-shaped top reads smaller and is asked for instead of set.
 */
export async function layOn(run: Run, body: string, down: Vec3, keepFace: KeepFace): Promise<string | null> {
  const axis = down.findIndex((value) => Math.abs(value) > 1e-6);
  if (axis < 0 || down.some((value, i) => i !== axis && Math.abs(value) > 1e-6)) return 'that face does not lie square to an axis';
  try {
    const [measure] = await run([{ command: 'inspect.measure', params: { bodies: [body] } }]);
    const box = ((measure as { bodies?: { bbox?: { min?: unknown; max?: unknown } }[] } | undefined)?.bodies ?? [])[0]?.bbox;
    const [min, max] = [vec3(box?.min), vec3(box?.max)];
    if (!min || !max) return `${body} could not be measured`;
    const point = min.map((value, i) => (i === axis ? ((down[axis] ?? 0) > 0 ? max[i] : value) : round2((value + (max[i] ?? 0)) / 2))) as Vec3;
    const [measured] = await run([{ command: 'inspect.measure', params: { items: [{ type: 'face', body, point }] } }]);
    const item = ((measured as { items?: unknown } | undefined)?.items as { area_mm2?: unknown; perimeter_mm?: unknown; outer_perimeter_mm?: unknown }[] | undefined)?.[0];
    const [area, perimeter] = [item?.area_mm2, item?.outer_perimeter_mm ?? item?.perimeter_mm];
    if (typeof area !== 'number' || typeof perimeter !== 'number' || !(area > 0)) return `SolidCraft did not measure the face at ${JSON.stringify(point)}`;
    // A rectangle of that area and perimeter; a face rounder than a square, as a square of that area.
    const [half, square] = [perimeter / 2, (perimeter / 2) ** 2 - 4 * area];
    const sides = square < 0 ? [Math.sqrt(area), Math.sqrt(area)] : [(half + Math.sqrt(square)) / 2, (half - Math.sqrt(square)) / 2];
    const across = [0, 1, 2].filter((i) => i !== axis).map((i) => (max[i] ?? 0) - (min[i] ?? 0)).sort((a, b) => b - a);
    if ((sides[0] ?? 0) < FACE_FILLS * (across[0] ?? 0) || (sides[1] ?? 0) < FACE_FILLS * (across[1] ?? 0)) return `the face at the middle of that side is about ${sides.map((side) => String(Math.round(side))).join(' × ')} mm of the body's ${across.map((side) => String(round2(side))).join(' × ')} mm: a knob, a step or a hollow stands there`;
    const [laid] = await run([{ command: 'body.print_face', params: { body, point } }]);
    const face = (laid as { face?: unknown } | undefined)?.face;
    if (typeof face !== 'string') return 'SolidCraft named no face';
    keepFace(body, face);
    return null;
  } catch (cause) {
    return (cause as Error).message;
  }
}

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
 * timeline), and `where` tells the model where the line goes. Volume the two share after the build fails the call as
 * well; every other warning of a step goes on in the answer.
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
  // Bodies that overlap already are refused before anything is built (review of BC-15, S3: found only after the build, the
  // take-back had all its steps to undo, near SolidCraft's undo ceiling). A lid the call makes is not there yet.
  if (!makes) {
    const [already] = await run([{ command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } }]);
    const before = overlapOf(already);
    if (before.count > 0) throw new Error(`${spec.fixed} and ${spec.moving} overlap already${before.volume > 0 ? ` (${String(before.volume)} mm³)` : ''}, before anything is built. Make room between them (inspect.interference shows where), then call again`);
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
  const warnings = built.flatMap((result) => {
    const warning = (result as { warning?: unknown } | undefined)?.warning;
    return typeof warning === 'string' && warning.trim() !== '' ? [warning] : [];
  });
  // shortcut: loose pieces are known by SolidCraft's wording (0.40.1); should it change, the warning still reaches the model below, but nothing is taken back. Count each body's pieces then.
  const apart = warnings.filter((warning) => warning.includes('separate pieces')).length;
  if (apart > 0) throw new Error(`${String(apart)} piece(s) did not touch their body and stand apart from it. ${where}`);
  // Bodies that share volume are a fault, not a warning (audit W26: a lid pushed 0.5 mm into its box was built and kept).
  const [clash] = await run([{ command: 'inspect.interference', params: { bodies: [spec.fixed, spec.moving] } }]);
  const after = overlapOf(clash);
  if (after.count > 0) throw new Error(`after the build ${spec.fixed} and ${spec.moving} share volume${after.volume > 0 ? ` (${String(after.volume)} mm³)` : ''}: the mechanism runs into the other body. Make room between them (inspect.interference shows where), then call again`);
  // Every other warning of SolidCraft's goes on as it said it (audit H-09: all but the loose pieces were dropped).
  // shortcut: no step is checked to have cut or added anything (H-09); a hinge's web room cuts nothing where the web misses the other body, so a per-step volume check needs to know which steps must hit first.
  const said = [...new Set(warnings)].map((warning) => warning.slice(0, 200));
  const unchecked = after.unchecked ? ` SolidCraft could not check whether ${spec.fixed} and ${spec.moving} overlap.` : '';
  return `${unchecked}${said.length > 0 ? ` SolidCraft warns: ${said.join(' ')}` : ''}`;
}

/** What `inspect.interference` found: how many pairs overlap, their volume, and whether a pair could not be checked. */
function overlapOf(result: unknown): { count: number; volume: number; unchecked: boolean } {
  const found = result as { count?: unknown; interferences?: unknown; unchecked?: unknown } | undefined;
  const pairs = Array.isArray(found?.interferences) ? (found.interferences as { volume_mm3?: unknown }[]) : [];
  return {
    count: typeof found?.count === 'number' ? found.count : pairs.length,
    volume: round2(pairs.reduce((sum, pair) => sum + (typeof pair.volume_mm3 === 'number' ? pair.volume_mm3 : 0), 0)),
    unchecked: Array.isArray(found?.unchecked) && found.unchecked.length > 0,
  };
}

/**
 * `name`, or with a number where a feature or a sketch of the design is named by it already (as itself, or as its start
 * followed by a space and a mark, the way the mechanisms name their steps); `name` as it is when the design cannot be read.
 */
export async function freeName(run: Run, name: string): Promise<string> {
  const [design] = await run([{ command: 'document.inspect', params: { timeline: 'summary' } }]).catch(() => []);
  const timeline = (design as { timeline?: unknown } | undefined)?.timeline;
  const taken = (Array.isArray(timeline) ? (timeline as { name?: unknown }[]) : []).flatMap((entry) => (typeof entry.name === 'string' ? [entry.name] : []));
  const used = (candidate: string) => taken.some((entry) => entry === candidate || entry.startsWith(`${candidate} `));
  let free = name;
  for (let n = 2; used(free); n += 1) free = `${name} (${String(n)})`;
  return free;
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
async function join(run: Run, spec: { fixed: string; moving: string; from: Vec3; to: Vec3; name: string }, type: 'revolute' | 'slider', range: [number, number], step: number, shares?: string): Promise<[number, number]> {
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
  // A hinge prints in place, as one piece; the parts of a guide print apart.
  const together = type === 'revolute' ? printTogether([componentOf(listing, spec.fixed), componentOf(listing, spec.moving)], randomUUID().slice(0, 8), spec.name) : [];
  if (!shares) await run([{ command: 'joint.as_built', params: { type, a, b, at: { occurrence: a, point: middle, z: axis }, name: spec.name, quiet: true } }, ...together]);
  // SolidCraft refuses a sweep it cannot afford, such as parts that lie against each other along the way: a joint without
  // limits is no mechanism, so the call fails and is taken back (audit H-26: the answer asked for joint.limits by hand).
  let results: unknown[];
  try {
    results = await run(sweeps);
  } catch (cause) {
    const reason = (cause as Error).message.replace(/^SolidCraft refused joint\.sweep: /, '').slice(0, 160);
    throw new Error(`SolidCraft could not run the ${type === 'revolute' ? 'hinge' : 'guide'} through its range (${reason}), so its limits could not be found. The two bodies probably lie against each other somewhere: make room between them (inspect.clearance shows where), then call again`, { cause });
  }
  const limit = (to: number) => (to === 0 ? 0 : reach(results[sweeps.findIndex((sweep) => sweep.params.to === to)], to, step));
  const limits: [number, number] = [limit(range[0]), limit(range[1])];
  await run([{ command: 'joint.limits', params: { joint, min: limits[0], max: limits[1] } }]);
  return limits;
}

/** The name of the body that measures where the hinge line lies; it is never kept. */
const PROBE = 'PartBuddy probe';

/** Where the hinge line lies against one body: inside it (the trial rod met its plastic), or `distance` mm from it (axis to face) the way `toward`, square to the line. */
export interface Lie {
  inside: boolean;
  distance: number;
  toward: Vec3 | null;
}

/** What `roomDepths` measured: where the line lies against each body (null: further than the barrel is wide), and for the webs the bed and the walls that carry them. */
export interface Lies {
  fixed: Lie | null;
  moving: Lie | null;
  support?: NonNullable<HingeSpec['support']>;
  /** The walls under the line could not be tried, so no knuckle got a web. */
  untried?: boolean;
}

/**
 * Where the hinge line lies against each body, measured on trial with a thin rod on the line: a step that must fail ends
 * the batch, and SolidCraft takes the rod back. A body the rod runs into stands under `overlaps`, not `near` (audit W9:
 * it was read as out of reach, and its skin went unchecked). Why not, when it could not be measured.
 *
 * `support` names the bed and, for the webs of a hinge that hangs, each body whose wall reaches down to where its web
 * would meet it: tried with a second rod inside that wall, just under the web's foot. A web drawn to the wall's plane
 * where the wall had ended hung 4.6 mm in the air under a lid plate (audit 2026-11-12, N-mechanik-5).
 */
export async function roomDepths(upstream: UpstreamTools, spec: HingeSpec, callId: string | undefined): Promise<Lies | string> {
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const length = Math.hypot(...axis);
  const unit = axis.map((value) => value / length);
  const rod = 0.1;
  type Pair = { a?: unknown; b?: unknown; distance_mm?: unknown; from?: unknown; to?: unknown };
  type Reply = { results?: unknown[] };
  // The batch fails on purpose, so its answer comes as an error that still carries the results before the step that failed.
  // A trial SolidCraft gives no answer to is tried once more (review of PR BC-10, 9).
  const trial = async (start: number, end: number): Promise<Reply | null> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const answer = await upstream.callTool(
          'batch',
          {
            commands: [
              { command: 'solid.cylinder', params: { diameter: rod, height: end - start, base: spec.from.map((value, i) => value + (unit[i] ?? 0) * start), axis, operation: 'new', body_name: PROBE } },
              { command: 'inspect.clearance', params: { bodies: [PROBE], against: [spec.fixed, spec.moving], clearance: spec.diameter } },
              { command: 'inspect.measure', params: { bodies: [spec.fixed, spec.moving] } },
              { command: 'sketch.inspect', params: { sketch: 2147483647 } },
            ],
            rollback: true,
          },
          callId,
        );
        const text = answer.content.find((part) => part.type === 'text')?.text;
        const reply = JSON.parse(typeof text === 'string' ? text : '') as Reply;
        if (Array.isArray((reply.results?.[1] as { near?: unknown } | undefined)?.near)) return reply;
      } catch {
        // No answer: tried again, or said.
      }
    }
    return null;
  };
  // A pair's point on the body: `from` lies on `a` (SolidCraft 0.40.1, measured 2026-11-13).
  const onBody = (pair: Pair, body: string) => vec3(pair.a === body ? pair.from : pair.to);
  const onRod = (pair: Pair, body: string) => vec3(pair.a === body ? pair.to : pair.from);
  const along = (point: Vec3) => point.reduce((sum, value, i) => sum + (value - (spec.from[i] ?? 0)) * (unit[i] ?? 0), 0);
  // Met along the line rather than beside it: the end of another hinge on this line, or a face across the line, at an end
  // of the rod. A second hinge end to end with the first read the first one's pin, 0.05 mm off, for the wall (review of
  // PR BC-10, 1): its hold passed always, and its skin was tried the wrong way.
  const ended = (pair: Pair, body: string, start: number, end: number): 'start' | 'end' | null => {
    const [at, from] = [onBody(pair, body), onRod(pair, body)];
    if (!at || !from) return null;
    // Touching, the two points are one and tell beside from along no more: at an end of the rod it is taken for the end of
    // something across the line (measured 2026-11-13: a hinge end to end with another read 0 mm to the other's pin end).
    if (typeof pair.distance_mm === 'number' && pair.distance_mm < 1e-6) return along(at) <= start + 1e-3 ? 'start' : along(at) >= end - 1e-3 ? 'end' : null;
    const way = at.map((value, i) => value - (from[i] ?? 0));
    const axial = Math.abs(way.reduce((sum, value, i) => sum + value * (unit[i] ?? 0), 0));
    if (axial <= Math.sqrt(Math.max(0, way.reduce((sum, value) => sum + value * value, 0) - axial * axial))) return null;
    return along(at) < length / 2 ? 'start' : 'end';
  };
  const bodies = [spec.fixed, spec.moving];
  // So far from the ends that the end of another hinge's barrel lies further than any wall the knuckles can hold on.
  const cut = spec.diameter / 2 + spec.gap;
  let [start, end] = [0, length];
  let reply: Reply | null;
  let near: Pair[] = [];
  for (let round = 0; ; round += 1) {
    reply = await trial(start, end);
    if (!reply) return "SolidCraft's trial gave no answer, twice";
    near = (reply.results?.[1] as { near: Pair[] }).near;
    const hits = bodies.flatMap((body) => {
      const pair = near.find((entry) => entry.a === body || entry.b === body);
      const hit = pair ? ended(pair, body, start, end) : null;
      return hit ? [{ body, hit }] : [];
    });
    if (hits.length === 0) break;
    if (round === 1 || end - start - cut * hits.length < 1) return `the rod on the line meets ${hits.map((entry) => entry.body).join(' and ')} at its ${[...new Set(hits.map((entry) => entry.hit))].join(' and ')}, along the line and not beside it, also ${String(Math.round(cut * 10) / 10)} mm shorter there (the end of another hinge on this line, or a face across it), so the wall beside the line could not be measured`;
    if (hits.some((entry) => entry.hit === 'start')) start += cut;
    if (hits.some((entry) => entry.hit === 'end')) end -= cut;
  }
  const clearance = reply.results?.[1] as { overlaps?: { a?: unknown; b?: unknown }[] } | undefined;
  const overlaps = Array.isArray(clearance?.overlaps) ? clearance.overlaps : [];
  // The way from the line to the body's point, square to the line.
  const offset = (body: string): Vec3 | undefined => {
    const pair = near.find((entry) => entry.a === body || entry.b === body);
    const at = pair ? onBody(pair, body) : null;
    if (!at) return undefined;
    const rel = at.map((value, i) => value - (spec.from[i] ?? 0));
    const on = along(at);
    return rel.map((value, i) => value - on * (unit[i] ?? 0)) as Vec3;
  };
  const lie = (body: string): Lie | null => {
    if (overlaps.some((pair) => pair.a === body || pair.b === body)) return { inside: true, distance: 0, toward: null };
    const pair = near.find((entry) => entry.a === body || entry.b === body);
    // No pair: the body is further away than the barrel is wide.
    if (typeof pair?.distance_mm !== 'number') return null;
    const off = offset(body);
    const size = off ? Math.hypot(...off) : 0;
    return { inside: false, distance: Math.round((pair.distance_mm + rod / 2) * 1000) / 1000, toward: off && size > 1e-9 ? (off.map((value) => value / size) as Vec3) : null };
  };
  // For the webs under the knuckles: the level way from the line to each body's wall, and the bed both stand on.
  const side = (body: string): HingeSide | null => {
    const off = offset(body);
    const level = off ? Math.hypot(off[0], off[1]) : 0;
    // A body under or over the line has no wall beside it to carry a web.
    if (!off || level < 0.2 || level < Math.abs(off[2])) return null;
    return { toward: [off[0] / level, off[1] / level, 0], distance: Math.round(level * 100) / 100 };
  };
  const lies = { fixed: lie(spec.fixed), moving: lie(spec.moving) };
  const lows = (((reply.results?.[2] as { bodies?: { bbox?: { min?: unknown } }[] } | undefined)?.bodies ?? []) as { bbox?: { min?: unknown } }[]).flatMap((body) => vec3(body.bbox?.min)?.[2] ?? []);
  if (lows.length === 0) return lies;
  const bed = Math.min(...lows);
  const { untried, ...walls } = hangs(spec, bed) ? await carried(upstream, spec, bed, { fixed: side(spec.fixed), moving: side(spec.moving) }, callId) : {};
  return { ...lies, support: { bed, ...walls }, ...(untried ? { untried } : {}) };
}

/**
 * What is wrong with where the line lies, before anything is built (audit W8: "within the barrel radius less 0.5 mm" stood
 * only in the text, and a knuckle overlapping its plate by 0.05 mm was built); null when both bodies hold their knuckles.
 * shortcut: the nearest point of each body counts, so a wall that runs off askew from the line is caught only after the
 * build, by SolidCraft's warning of separate pieces; try the line's ends as well when such hinges turn up.
 */
export function lineProblem(lies: Pick<Lies, 'fixed' | 'moving'>, spec: HingeSpec, where: string): string | null {
  if (lies.fixed?.inside && lies.moving?.inside) return `the hinge line runs inside both ${spec.fixed} and ${spec.moving}, so they overlap there. ${where}`;
  for (const key of ['fixed', 'moving'] as const) {
    const lie = lies[key];
    if (!lie) return `${spec[key]} is further from the hinge line than the barrel is wide (${String(spec.diameter)} mm), so its knuckles would not touch it. ${where}`;
    const overlap = Math.round((spec.diameter / 2 - lie.distance) * 1000) / 1000;
    if (lie.inside || overlap >= HOLD) continue;
    if (overlap <= 0) return `the hinge line lies ${String(lie.distance)} mm from ${spec[key]}, outside the barrel's radius of ${String(spec.diameter / 2)} mm, so its knuckles would not touch it. ${where}`;
    return `the hinge line lies ${String(lie.distance)} mm from ${spec[key]}, so the barrel overlaps it by ${String(overlap)} mm, under ${String(HOLD)} mm: its knuckles would hang on a sliver. ${where}`;
  }
  return null;
}

/**
 * The skin a knuckle's room leaves of a body's wall, under `least`: `mm` thin where it was measured whole, or null where
 * only `along` (mm of the line) is known; `floor` when the wall lies under or over the line.
 */
export interface Skin {
  mm: number | null;
  least: number;
  floor: boolean;
  along: number;
}

/** What `skins` found: the thin skins, the least each wall must keep, and how much of the line (0 to 1) each wall keeps it along. */
export interface Skins {
  fixed: Skin | null;
  moving: Skin | null;
  least: { fixed: number; moving: number };
  deep: { fixed: number; moving: number };
}

/**
 * The skins the knuckles' rooms leave behind them, measured (audit W7, R11, H-08: `wall` was the model's word, and
 * without it, or with the trial failed, nothing was checked; a 1.8 mm wall kept 0.8 mm). Two thin rods run along the
 * line, the way to the body's face nearest the line (for a line inside the body, away from the other one): one just
 * behind the room, one just inside where the least wall ends. Each counts by the share of it that lies in the body, as
 * `rodsInside` does, not by touching it somewhere (review of PR BC-10, 2: a rib or a wall ending short of the line passed
 * for the whole line). Plastic behind the room that does not reach the least wall along more than a rod's width of the
 * line is a skin; where the outer rod lies wholly outside, the wall's back stands `distance` short of it and the skin is
 * that thin. A wall under or over the line is a floor and needs four layers, one beside it two lines. Throws, with why,
 * when it could not be measured.
 * shortcut: only the way to the nearest face is tried, so a body that wraps round the line (a corner) is not tried at
 * the sides; add rods round the room when hinges in corners turn up.
 */
export async function skins(upstream: UpstreamTools, spec: HingeSpec, lies: Pick<Lies, 'fixed' | 'moving'>, printer: FitPrinter, callId: string | undefined): Promise<Skins> {
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const length = Math.hypot(...axis);
  const room = spec.diameter / 2 + spec.gap;
  const rod = 0.1;
  const rods = (['fixed', 'moving'] as const).map((key) => {
    const [lie, other] = [lies[key], lies[key === 'fixed' ? 'moving' : 'fixed']];
    const toward = lie?.inside ? other?.toward?.map((value) => -value + 0) : lie?.toward;
    if (!toward) throw new Error(`the way from the line to the wall of ${spec[key]} is not known: ${lie?.inside ? `the line runs inside it, and ${spec[key === 'fixed' ? 'moving' : 'fixed']} gives no way out` : 'its nearest point lies on the line'}`);
    const floor = Math.abs(toward[2] ?? 0) >= Math.SQRT1_2;
    const least = leastAlong(toward as Vec3, printer);
    const at = (offset: number) => spec.from.map((value, i) => value + (toward[i] ?? 0) * offset);
    return { key, least, floor, inner: `${PROBE} ${key} behind`, outer: `${PROBE} ${key}`, bases: [at(room + rod / 2), at(room + least - rod / 2)] };
  });
  const commands = [
    ...rods.flatMap((entry) => [entry.inner, entry.outer].map((name, n) => ({ command: 'solid.cylinder', params: { diameter: rod, height: length, base: entry.bases[n], axis, operation: 'new', body_name: name } }))),
    { command: 'inspect.clearance', params: { bodies: rods.flatMap((entry) => [entry.inner, entry.outer]), against: [spec.fixed, spec.moving], clearance: Math.max(...rods.map((entry) => entry.least)) + 0.01, min_volume: 0 } },
    { command: 'sketch.inspect', params: { sketch: 2147483647 } },
  ];
  type Pair = { a?: unknown; b?: unknown; distance_mm?: unknown; volume_mm3?: unknown };
  let found: { near: Pair[]; overlaps?: Pair[] } | null = null;
  // A trial SolidCraft gives no answer to is tried once more (review of PR BC-10, 9).
  for (let attempt = 0; attempt < 2 && !found; attempt += 1) {
    const answer = await upstream.callTool('batch', { commands, rollback: true }, callId).catch(() => null);
    const text = answer?.content.find((part) => part.type === 'text')?.text;
    try {
      const result = (JSON.parse(typeof text === 'string' ? text : '{}') as { results?: unknown[] }).results?.[commands.length - 2] as { near?: unknown; overlaps?: unknown } | undefined;
      if (Array.isArray(result?.near)) found = result as { near: Pair[]; overlaps?: Pair[] };
    } catch {
      // No answer: tried again, or said.
    }
  }
  if (!found) throw new Error("SolidCraft's trial gave no answer, twice");
  const { near, overlaps = [] } = found;
  // As many overlaps as rods and bodies at most: far under the cap of 25 (rodsInside).
  const both = (pair: Pair, name: string, body: string) => [pair.a, pair.b].includes(name) && [pair.a, pair.b].includes(body);
  const whole = (Math.PI * rod ** 2 * length) / 4;
  const share = (name: string, body: string) => {
    const volume = overlaps.find((pair) => both(pair, name, body))?.volume_mm3;
    return typeof volume === 'number' ? Math.min(1, volume / whole) : 0;
  };
  const out: Skins = { fixed: null, moving: null, least: { fixed: 0, moving: 0 }, deep: { fixed: 0, moving: 0 } };
  for (const entry of rods) {
    const body = spec[entry.key];
    const [behind, deep] = [share(entry.inner, body), share(entry.outer, body)];
    out.least[entry.key] = entry.least;
    out.deep[entry.key] = deep;
    const distance = near.find((pair) => both(pair, entry.outer, body))?.distance_mm;
    if (deep < 0.01 && typeof distance === 'number') {
      const mm = Math.round((entry.least - rod - distance) * 100) / 100;
      if (mm > 0.005 && mm < entry.least) out[entry.key] = { mm, least: entry.least, floor: entry.floor, along: Math.round(behind * length * 10) / 10 };
      continue;
    }
    // Plastic right behind the room along more of the line than reaches the least wall: a skin there, of unknown thickness.
    const along = Math.max(0, behind - deep) * length;
    if (along > ROD) out[entry.key] = { mm: null, least: entry.least, floor: entry.floor, along: Math.round(along * 10) / 10 };
  }
  return out;
}

/** How thick a trial rod is (mm). */
const ROD = 0.2;
/**
 * `inspect.clearance` answers at most 25 overlaps and says nothing of the rest (SolidCraft 0.40.1, measured 2026-11-13:
 * 34 probes against one body gave 25, `truncated: false`; review of BC-07). The rods are compared in groups that stay under it.
 */
const OVERLAPS_MOST = 25;

/**
 * Thin rods along a line, tried in the design and taken back like the rod of `roomDepths`: for each, the share of it
 * (0 to 1) that lies inside `body`. A rod wholly in the body says there is material all along that line.
 */
async function rodsInside(upstream: UpstreamTools, rods: { name: string; base: number[]; body: string; axis?: number[]; length?: number; diameter?: number }[], axis: number[], length: number, callId: string | undefined): Promise<Map<string, number>> {
  const shares = new Map<string, number>();
  if (rods.length === 0 || rods.some((rod) => (rod.length ?? length) <= 0)) return shares;
  const against = [...new Set(rods.map((rod) => rod.body))];
  const size = Math.max(1, Math.floor((OVERLAPS_MOST - 1) / against.length));
  const groups = Array.from({ length: Math.ceil(rods.length / size) }, (_, g) => rods.slice(g * size, (g + 1) * size));
  const answer = await upstream.callTool(
    'batch',
    {
      commands: [
        ...rods.map((rod) => ({ command: 'solid.cylinder', params: { diameter: rod.diameter ?? ROD, height: rod.length ?? length, base: rod.base, axis: rod.axis ?? axis, operation: 'new', body_name: rod.name } })),
        ...groups.map((group) => ({ command: 'inspect.clearance', params: { bodies: group.map((rod) => rod.name), against, min_volume: 0 } })),
        { command: 'sketch.inspect', params: { sketch: 2147483647 } },
      ],
      rollback: true,
    },
    callId,
  );
  const text = answer.content.find((part) => part.type === 'text')?.text;
  const results = (JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[] }).results ?? [];
  const answers = groups.map((_, g) => (results[rods.length + g] as { overlaps?: unknown } | undefined)?.overlaps);
  // A rod or the comparison that failed ends the batch before its answer: that says nothing about the body. Nor does a
  // group whose answer stops at the cap.
  if (answers.some((overlaps) => !Array.isArray(overlaps) || overlaps.length >= OVERLAPS_MOST)) throw new Error('the trial gave no answer');
  const found = answers.flat<unknown[]>();
  // Measured on SolidCraft 0.40.1 (2026-11-12): a rod wholly in a body of 30, 100 and 300 mm comes back with this
  // volume to nine digits, and one through a 1.5 mm gap with 1.500 mm less.
  for (const rod of rods) {
    const whole = (Math.PI * (rod.diameter ?? ROD) ** 2 * (rod.length ?? length)) / 4;
    const inside = (found as { a?: unknown; b?: unknown; volume_mm3?: unknown }[]).find((pair) => [pair.a, pair.b].includes(rod.name) && [pair.a, pair.b].includes(rod.body))?.volume_mm3;
    shares.set(rod.name, typeof inside === 'number' ? inside / whole : 0);
  }
  return shares;
}

/**
 * Of the walls beside a hinge line, those that can carry a web: the web ends on the bed, or a rod inside the wall just
 * under the web's foot lies in the body along the whole line.
 */
async function carried(upstream: UpstreamTools, spec: HingeSpec, bed: number, sides: { fixed: HingeSide | null; moving: HingeSide | null }, callId: string | undefined): Promise<{ fixed?: HingeSide; moving?: HingeSide; untried?: boolean }> {
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const tried = (['fixed', 'moving'] as const).flatMap((key) => {
    const wall = sides[key];
    if (!wall) return [];
    const drop = webFoot(spec.diameter, wall.distance) + ROD;
    // null: the web ends on the bed before it comes to the wall's foot.
    const base = spec.from[2] - drop <= bed ? null : spec.from.map((value, i) => value + (wall.toward[i] ?? 0) * (wall.distance + WEB.into / 2) - (i === 2 ? drop : 0));
    return [{ key, wall, base, name: `${PROBE} ${key}` }];
  });
  const shares = await rodsInside(upstream, tried.flatMap((entry) => (entry.base ? [{ name: entry.name, base: entry.base, body: spec[entry.key] }] : [])), axis, Math.hypot(...axis), callId).catch(() => null);
  // The trial failed: no wall is known to carry a web, and the answer says it was not tried (audit H-08).
  if (shares === null) return { untried: true };
  const out: { fixed?: HingeSide; moving?: HingeSide } = {};
  for (const entry of tried) if (entry.base === null || (shares.get(entry.name) ?? 0) >= 0.9) out[entry.key] = entry.wall;
  return out;
}

/**
 * A closure tried where the lid closes, before anything is built (audit W17, T14, H-10): `lipSteps` places the lip and
 * the rille by the lid's room alone, so the box was never looked at, and a lid built open beside its box was never
 * looked at closed. Rods along each wall the lip goes in by, turned about the hinge line where there is one: one just
 * in front of the lid's wall plane, where the lip's outside comes, and one just past the lip's tip must find no box; along
 * the wall with the catch one from 0.1 mm behind that plane must lie in the box's wall (standing back further, the bead
 * would catch under 0.15 mm), and one behind the rille, two lines further, must too (the rille goes RILLE_DEPTH into
 * that wall). A wall the box stands back from is said, not refused. A lid with walls is tried too: under the foot it
 * must be hollow (review of PR #370: a shallow lid or box passed). Returns what is wrong, or the walls that stand back;
 * throws when the trial gave no answer.
 */
export async function closureTrial(upstream: UpstreamTools, spec: LipSpec, nozzle: number, callId: string | undefined): Promise<{ problem: string | null; back: string[] }> {
  const [x0, y0, x1, y1] = [spec.min[0], spec.min[1], spec.max[0], spec.max[1]].map((size) => (typeof size === 'number' ? size : size.at)) as [number, number, number, number];
  const [rim, radius] = [spec.rim, spec.radius].map((size) => (typeof size === 'number' ? size : size.at)) as [number, number];
  const least = Math.round(nozzle * 2 * 1.125 * 100) / 100;
  const behind = Math.round((RILLE_DEPTH + least) * 100) / 100;
  const thick = lipThick(nozzle);
  // Half a turn about the hinge line takes a point of the open lid to where it is closed.
  const closed = (point: Vec3): Vec3 => {
    const hinge = spec.hinge;
    if (!hinge) return point;
    const [across, z] = [hinge.across, hinge.z].map((size) => (typeof size === 'number' ? size : size.at)) as [number, number];
    return hinge.along === 'x' ? [point[0], 2 * across - point[1], 2 * z - point[2]] : [2 * across - point[0], point[1], 2 * z - point[2]];
  };
  const hingeWall = spec.hinge && !spec.flat ? `${spec.side[0] ?? ''}${spec.side.endsWith('+') ? '-' : '+'}` : null;
  const sides = (['x-', 'x+', 'y-', 'y+'] as const).filter((side) => side !== hingeWall);
  const rods = sides.flatMap((side) => {
    const alongX = side.startsWith('y');
    const out = side.endsWith('+') ? 1 : -1;
    const plane = alongX ? (out > 0 ? y1 : y0) : out > 0 ? x1 : x0;
    const [a0, a1] = alongX ? [x0, x1] : [y0, y1];
    const r = Math.max(0, radius) + 0.5;
    // In the box, where the lid has it closed; or in the lid itself, as it is built.
    const rod = (name: string, across: number, from: number, to: number, high: number, inLid = false) => {
      const z = rim + spec.up * high;
      const [start, end] = [from, to].map((along) => (inLid ? (point: Vec3) => point : closed)(alongX ? [along, across, z] : [across, along, z]));
      const delta = (end as Vec3).map((value, i) => value - ((start as Vec3)[i] ?? 0));
      const length = Math.hypot(...delta);
      return { name: `${PROBE} ${name} ${side}`, base: start as Vec3, body: inLid ? spec.moving : spec.fixed, axis: delta.map((value) => value / length), length };
    };
    const middle = (a0 + a1) / 2;
    const lip = plane - out * (LIP.clear + thick / 2);
    return [
      { side, kind: 'room', ...rod('room', plane - out * 0.15, a0 + r, a1 - r, LIP.high / 2) },
      { side, kind: 'tip', ...rod('tip', lip, a0 + r, a1 - r, LIP.high + 0.15) },
      { side, kind: 'wall', ...rod('wall', plane + out * (0.1 + ROD / 2), a0 + r, a1 - r, LIP.high / 2) },
      ...(side === spec.side ? [{ side, kind: 'behind', ...rod('behind', plane + out * (behind - ROD / 2), middle - LIP.beadLong / 2 - 0.5, middle + LIP.beadLong / 2 + 0.5, 2.5) }] : []),
      ...(side === spec.side && !spec.flat ? [{ side, kind: 'under', ...rod('under', lip, middle - LIP.beadLong / 2, middle + LIP.beadLong / 2, -(LIP.foot + 0.3), true) }] : []),
    ];
  });
  const shares = await rodsInside(upstream, rods, [1, 0, 0], 1, callId);
  const share = (side: string, kind: string) => shares.get(rods.find((rod) => rod.side === side && rod.kind === kind)?.name ?? '') ?? 0;
  const hint = !spec.hinge && spec.up > 0 ? ' If the lid is built open beside the box, give the hinge line it closes about (hinge_from, hinge_to).' : '';
  const narrow = sides.filter((side) => share(side, 'room') > 0.02);
  if (narrow.length > 0) return { problem: `closed, the lip would run into ${spec.fixed}'s wall at the lid's ${narrow.join(', ')} wall${narrow.length > 1 ? 's' : ''}: ${spec.fixed}'s inner room is narrower there than the lid's.${hint} Give from and to as the corners of the lid's inner room where ${spec.fixed}'s inner wall is, or make both rooms the same. Nothing was built.`, back: [] };
  const shallow = sides.filter((side) => share(side, 'tip') > 0.02);
  if (shallow.length > 0) return { problem: `closed, the lip's tip would stand in ${spec.fixed} at the lid's ${shallow.join(', ')} wall${shallow.length > 1 ? 's' : ''}: the lip goes ${String(LIP.high)} mm into ${spec.fixed}, which must be open that deep along its walls.${hint} Make ${spec.fixed} deeper there, or take away what stands in the way. Nothing was built.`, back: [] };
  if (share(spec.side, 'wall') < 0.98) return { problem: `closed, ${spec.fixed}'s wall with the catch (${spec.side}) does not stand where the lid's wall does (it may stand back 0.1 mm at most), so the bead would catch too little or nothing.${hint} Make ${spec.fixed}'s inner room the same as the lid's there. Nothing was built.`, back: [] };
  if (share(spec.side, 'behind') < 0.98) return { problem: `${spec.fixed}'s wall with the catch (${spec.side}) is under ${String(behind)} mm thick behind the middle of the lid's wall, or not straight there: the rille goes ${String(RILLE_DEPTH)} mm into it and two lines (${String(least)} mm) must stay behind it. Make that wall at least ${String(behind)} mm thick there. Nothing was built.`, back: [] };
  if (!spec.flat && share(spec.side, 'under') > 0.02) return { problem: `${spec.moving} is not hollow ${String(LIP.foot + 0.3)} mm below its rim inside its ${spec.side} wall: the lip's foot lies ${String(LIP.foot)} mm down the lid's wall, with its slope under it. Make the lid that deep inside, or use flat for a lid without walls. Nothing was built.`, back: [] };
  return { problem: null, back: sides.filter((side) => side !== spec.side && share(side, 'wall') < 0.5) };
}

/**
 * The neck of a screw lid tried before anything is built (audit W22, N-mechanik-9): the thread is coiled onto the
 * diameter given, so a neck that is narrower left it in the air, a wider one or one off the centre stood in the lid, and
 * a jar shorter than the lid's skirt took the thread below its floor, all built and called fine. Upright rods at
 * `NECK_POINTS` points round the axis, from the lid's mouth up to the plain band at the top (`LID.plain`), so a
 * chamfer or a round on the rim's edges passes (review of BC-07): one 0.15 mm inside the diameter and one at the depth of
 * the least wall must lie in the container, one 0.15 mm outside it must find none. So the neck is round and centred
 * within 0.05 mm and its diameter within 0.1 mm. The rim's height is tried in the middle of the least wall, which such an
 * edge does not reach; and the room the lid takes, as wide as the lid from its mouth to its top, must hold nothing of
 * the container but the neck: no collar, no handle, no rim higher than `from`. Returns what is wrong, or null; throws
 * when the trial gave no answer.
 */
export async function neckTrial(upstream: UpstreamTools, spec: LidSpec, callId: string | undefined): Promise<string | null> {
  const skirt = lidSkirt(spec);
  const thread = lidThread(spec);
  const radius = spec.diameter / 2;
  const outer = radius + thread.depth + spec.gap + LID.wall;
  const [cx, cy, rim] = spec.centre;
  const mouth = rim - skirt;
  const rings = [
    { ring: 'inside', at: radius - 0.15, z: mouth, length: skirt - LID.plain },
    { ring: 'wall', at: radius - NECK_WALL + ROD / 2, z: mouth, length: skirt - LID.plain },
    { ring: 'outside', at: radius + 0.15, z: mouth, length: skirt - LID.plain },
    { ring: 'rim', at: radius - NECK_WALL / 2, z: rim - LID.plain, length: LID.plain },
  ];
  const rods = rings.flatMap(({ ring, at, z, length }) =>
    Array.from({ length: NECK_POINTS }, (_, k) => {
      // Half a step off the axes: a rod wholly inside the wall on the seam of the jar's cylinder (at +Y) came back with no
      // plastic at all (SolidCraft 0.40.1, measured 2026-11-13: inspect.clearance and inspect.interference both said 0).
      // shortcut: a seam elsewhere, as a revolved neck may have, can still hide one rod; report it to SolidCraft and drop this then.
      const angle = ((2 * k + 1) * Math.PI) / NECK_POINTS;
      return { name: `${PROBE} ${ring} ${String(k)}`, base: [round2(cx + at * Math.cos(angle)), round2(cy + at * Math.sin(angle)), round2(z)], body: spec.fixed, length: round2(length), ring };
    }),
  );
  // The lid's room and the neck's, on the axis: what lies in the first and not in the second stands where the lid comes.
  const room = { name: `${PROBE} lid`, base: [cx, cy, round2(mouth)], body: spec.fixed, length: round2(skirt + LID.top), diameter: round2(2 * outer) };
  const neck = { name: `${PROBE} neck`, base: [cx, cy, round2(mouth)], body: spec.fixed, length: round2(skirt), diameter: round2(2 * (radius + 0.15)) };
  const shares = await rodsInside(upstream, [...rods, room, neck], [0, 0, 1], skirt, callId);
  // Of each ring: at how many of its points it found what it must not, and the plastic in the worst rod, in mm.
  const worst = (ring: string, want: 'in' | 'out') => {
    const found = rods.filter((rod) => rod.ring === ring).map((rod) => ({ mm: (shares.get(rod.name) ?? 0) * rod.length, length: rod.length }));
    const bad = found.filter(({ mm, length }) => (want === 'in' ? mm < length - 0.05 : mm > 0.05));
    return { count: bad.length, mm: round2(want === 'in' ? Math.min(...found.map(({ mm }) => mm)) : Math.max(...found.map(({ mm }) => mm))) };
  };
  const points = String(NECK_POINTS);
  const where = `round [${String(round2(cx))}, ${String(round2(cy))}] from ${String(skirt)} to ${String(LID.plain)} mm below the rim at z ${String(round2(rim))}`;
  const inside = worst('inside', 'in');
  if (inside.count > 0) return `the neck of ${spec.fixed} is not a cylinder of ${String(spec.diameter)} mm ${where}: just inside that diameter ${String(inside.count)} of ${points} points round it have no plastic all the way (the least ${String(inside.mm)} of ${String(round2(skirt - LID.plain))} mm). The neck is narrower, off centre, shorter than the lid's skirt or not upright, or its rim lies lower than from; give from as the centre of the rim at its height and diameter as the neck's outer diameter, or make the neck plain and ${String(skirt)} mm long`;
  const outside = worst('outside', 'out');
  if (outside.count > 0) return `the neck of ${spec.fixed} is not a cylinder of ${String(spec.diameter)} mm ${where}: just outside that diameter ${String(outside.count)} of ${points} points round it meet plastic of ${spec.fixed} (up to ${String(outside.mm)} mm), where the lid's thread would stand. The neck is wider or off centre, or something joins it there: a collar or a shoulder`;
  const wall = worst('wall', 'in');
  if (wall.count > 0) return `the neck of ${spec.fixed} is under ${String(NECK_WALL)} mm thick ${where} at ${String(wall.count)} of ${points} points round it; make its wall at least ${String(NECK_WALL)} mm, so it carries the thread`;
  const low = worst('rim', 'in');
  if (low.count > 0) return `the rim of ${spec.fixed} lies lower than z ${String(round2(rim))} at ${String(low.count)} of ${points} points round it (the least ${String(low.mm)} of the top ${String(LID.plain)} mm are plastic); give from as the centre of the rim at its height`;
  const volume = (probe: { name: string; length: number; diameter: number }) => (shares.get(probe.name) ?? 0) * ((Math.PI * probe.diameter ** 2) / 4) * probe.length;
  const extra = round2(volume(room) - volume(neck));
  if (extra > NECK_SLACK) return `${spec.fixed} has ${String(extra)} mm³ of plastic beside its neck where the lid comes, within ${String(round2(2 * outer))} mm from ${String(skirt)} mm below the rim to ${String(LID.top)} mm above it: a collar, a handle or a shoulder stands there, or the rim lies higher than from. Keep that room free, or give from as the centre of the rim at its height`;
  return null;
}

/** How far a wall's face may stand behind `from` where a snap hook or a latch is tried (mm): the rods in it lie that far behind. */
const FACE_SLACK = 0.1;
/** mm of a rod's length a snap hook's or a latch's trial lets go: SolidCraft gives these volumes to nine digits (rodsInside), so more is plastic, or a skin left over a window. */
const TRIAL_SLACK = 0.001;
/** How far in front of a latch's wall the rod lies that must find no plastic (mm): a face standing out further would meet the arm. */
const LATCH_FRONT = 0.15;
/** How far past a hook's wall the rod reaches that must find nothing, so the window opens (mm). */
const WINDOW_BEYOND = 1;

/** The least a wall keeps along `way`, the way it is thick: four layers where that runs upright (a floor), two lines otherwise; for the hinge's skins (a hook's window takes the larger of both, snapNeeds). */
const leastAlong = (way: Vec3, printer: FitPrinter) => (Math.abs(way[2]) >= Math.SQRT1_2 ? minimumFloor(printer.layer) : minimumWall(printer.nozzle));

/**
 * Where each snap hook's window goes, round it, as `snapTrial` tries it (mm above the foot, and the width in all). The wall
 * round it keeps two lines or four layers, whichever is more: how the part will lie to print is not known when it is built,
 * and lying on its side a bar of the design's two lines is a floor (BC-11 review: 0.8 instead of 1.8 mm on a 0.8 mm nozzle).
 */
export function snapNeeds(spec: Pick<SnapSpec, 'hook'>, printer: FitPrinter): { low: number; high: number; wide: number; bar: number; post: number } {
  const window = snapWindow(spec.hook);
  const least = Math.max(minimumFloor(printer.layer), minimumWall(printer.nozzle));
  const [bar, post] = [least, least];
  return { low: round2(window.from - bar), high: round2(window.to + bar), wide: round2(2 * (window.half + post)), bar, post };
}

/**
 * The wall of each snap hook's window tried before anything is built (audit N-mechanik-11, W23): `wall` was the model's
 * word and the window was cut that deep wherever it landed, so a wall thicker than said kept a pocket, one too low got no
 * window at all, and the answer said "through" either way. Five rods per hook: two across the wall, `FACE_SLACK` behind
 * from, just inside the outer edge of the bars under and over the window (two lines, or four layers where a bar lies
 * level) and as wide as the window and the posts beside it; one up in front of the wall, where the arm and its catch go,
 * and one across the window where its cut starts, `gap` before from, which must find no plastic; one through the wall at the window's middle, from `FACE_SLACK` behind its face to as far
 * short of `wall`; and one from `wall` on, `WINDOW_BEYOND` out, which must find nothing, so the window opens. Returns what is wrong,
 * or null; throws when the trial gave no answer.
 * shortcut: the posts beside the window are tried along the bars only, not between them; add rods there if walls with a slot beside a hook turn up.
 */
export async function snapTrial(upstream: UpstreamTools, spec: SnapSpec, printer: FitPrinter, callId: string | undefined): Promise<string | null> {
  const { up, toward, across } = snapFrame(spec);
  const { hook: arm } = spec;
  const window = snapWindow(arm);
  const { low, high, wide, bar, post } = snapNeeds(spec, printer);
  const middle = (window.from + window.to) / 2;
  const feet = [spec.from, ...spec.more];
  const rods = feet.flatMap((foot, hook) => {
    const at = (u: number, t: number, a: number) => foot.map((value, k) => round2(value + (up[k] ?? 0) * u + (toward[k] ?? 0) * t + (across[k] ?? 0) * a));
    // Plus zero: no negative zero in what goes to SolidCraft.
    const rod = (kind: string, base: number[], axis: Vec3, length: number) => ({ name: `${PROBE} ${String(hook + 1)} ${kind}`, hook, kind, base, axis: axis.map((value) => value + 0), length: round2(length), body: spec.moving });
    const face = FACE_SLACK + ROD / 2;
    return [
      rod('under', at(low + ROD / 2, face, -wide / 2), across, wide),
      rod('over', at(high - ROD / 2, face, -wide / 2), across, wide),
      rod('front', at(0, -arm.gap / 2, 0), up, arm.length),
      // Just before where the window's cut starts, across it: a wall that curves further towards the hook keeps a wedge there.
      rod('curve', at(middle, -(arm.gap + ROD / 2), -window.half), across, 2 * window.half),
      rod('through', at(middle, FACE_SLACK, 0), toward, spec.wall - 2 * FACE_SLACK),
      rod('beyond', at(middle, spec.wall, 0), toward, WINDOW_BEYOND),
    ];
  });
  // Two windows side by side keep a post between them: what the wall has there is measured, but not what the other window takes.
  const apart = round2(2 * window.half + post);
  for (const [i, one] of feet.entries()) {
    for (const [k, two] of feet.entries()) {
      if (k <= i) continue;
      const delta = two.map((value, n) => value - (one[n] ?? 0));
      const side = Math.abs(delta.reduce((sum, value, n) => sum + value * (across[n] ?? 0), 0));
      const rise = Math.abs(delta.reduce((sum, value, n) => sum + value * (up[n] ?? 0), 0));
      if (side < apart - 1e-6 && rise < high - low) return `hooks ${String(i + 1)} and ${String(k + 1)} stand ${String(round2(side))} mm apart along the wall: their windows are ${String(2 * window.half)} mm wide and keep ${String(post)} mm of wall between them, so the middles must be at least ${String(apart)} mm apart`;
    }
  }
  const shares = await rodsInside(upstream, rods, up, arm.length, callId);
  for (const hook of feet.keys()) {
    const found = (kind: string) => {
      const rod = rods.find((entry) => entry.hook === hook && entry.kind === kind);
      return { mm: round2((shares.get(rod?.name ?? '') ?? 0) * (rod?.length ?? 0)), length: rod?.length ?? 0 };
    };
    const where = feet.length > 1 ? ` at hook ${String(hook + 1)} (from ${JSON.stringify(feet[hook])})` : '';
    // In this order, so that each says the first thing wrong: something in the arm's way, no wall round the window, then its thickness.
    const front = found('front');
    if (front.mm > TRIAL_SLACK) return `${spec.moving} stands in front of from${where}: in the ${String(arm.gap)} mm the arm keeps off the wall, up to ${String(arm.length)} mm above the foot, ${String(front.mm)} mm of the way are plastic, so the hook would run into it. Give from on the inner face of the wall, with the room in front of it free`;
    const curve = found('curve');
    if (curve.mm > TRIAL_SLACK) return `${spec.moving}'s wall${where} curves towards the hook by more than the ${String(arm.gap)} mm the arm keeps off it, across the window's ${String(2 * window.half)} mm (${String(curve.mm)} mm of a line there are plastic), so a thin wedge of it would stay in the window. Put the hook where the wall is flatter, or make it flat there`;
    for (const side of ['under', 'over'] as const) {
      const bars = found(side);
      if (bars.mm < bars.length - TRIAL_SLACK) return `${spec.moving}'s wall${where} does not stand whole round the window, which goes from ${String(window.from)} to ${String(window.to)} mm above the foot: it needs ${String(bar)} mm of wall under and over it (from ${String(low)} to ${String(high)} mm above the foot) and ${String(post)} mm beside it (${String(wide)} mm wide in all), its face at most ${String(FACE_SLACK)} mm behind from; ${side} the window only ${String(bars.mm)} of ${String(bars.length)} mm are plastic. Make the wall that high and wide there, or move the hook`;
    }
    const through = found('through');
    if (through.mm < through.length - TRIAL_SLACK) return `${spec.moving}'s wall${where} is not ${String(spec.wall)} mm thick behind from: through the middle of the window, from ${String(FACE_SLACK)} mm behind from, only ${String(through.mm)} of ${String(through.length)} mm are plastic. Give from on the inner face of that wall and wall as its thickness there (1.6 to 10 mm)`;
    const beyond = found('beyond');
    if (beyond.mm > TRIAL_SLACK) return `${spec.moving}'s wall${where} is thicker than ${String(spec.wall)} mm behind from, or something stands right behind it: ${String(beyond.mm)} mm of plastic lie within ${String(WINDOW_BEYOND)} mm past it, so the window would leave a skin instead of going through. Give wall as the wall's thickness there`;
  }
  return null;
}

/** How far the latch's walls must be plastic behind their face, and from where to where along `up`, as `latchTrial` tries them. */
function latchNeeds(arm = LATCH): { deep: number; lid: [number, number]; box: [number, number] } {
  const { above, below } = latchReach(arm);
  return { deep: arm.into, lid: [arm.foot, above], box: [-below, -arm.foot] };
}

/**
 * The walls under a latch tried before anything is built (audit N-mechanik-10, R50): "flat 8.1 mm above the joint and
 * 14.1 mm below it" stood in the text alone, so a lid 6 mm high had the arm's root stand 2.1 mm over its top, which it
 * then lay on to print, and a box 10 mm high had the bead and the arm hang under its floor. Upright rods at the latch's
 * middle and at both its edges: in each wall, where the profiles' roots go `into` it (the lid's from `foot` to the
 * reach above the joint, the box's as far below it), which must be plastic all the way, and one `LATCH_FRONT` in front of
 * the wall's plane over both stretches, which must find neither body, so the arm hangs `off` the wall and nothing stands
 * in its way. Returns what is wrong, or null; throws when the trial gave no answer.
 */
export async function latchTrial(upstream: UpstreamTools, spec: LatchSpec, callId: string | undefined): Promise<string | null> {
  const { up, out, run } = latchFrame(spec);
  const { deep, lid, box } = latchNeeds(spec.arm);
  const at = (y: number, x: number, z: number) => spec.from.map((value, k) => round2(value + (up[k] ?? 0) * y + (out[k] ?? 0) * x + (run[k] ?? 0) * z));
  const edges = (half: number) => [-(half - ROD / 2), 0, half - ROD / 2];
  const wide = spec.width / 2 + spec.arm.beside;
  const inside = (kind: 'lid' | 'box', body: string, [from, to]: [number, number], half: number) => edges(half).map((z, n) => ({ name: `${PROBE} ${kind} ${String(n)}`, kind, base: at(from, -(deep - ROD / 2), z), axis: up, length: round2(to - from), body }));
  const rods = [
    ...inside('lid', spec.moving, lid, spec.width / 2),
    ...inside('box', spec.fixed, box, wide),
    ...edges(wide).flatMap((z, n) => [spec.moving, spec.fixed].map((body, k) => ({ name: `${PROBE} front ${String(n)} ${String(k)}`, kind: 'front', base: at(box[0], LATCH_FRONT, z), axis: up, length: round2(lid[1] - box[0]), body }))),
  ];
  const shares = await rodsInside(upstream, rods, up, lid[1] - lid[0], callId);
  const mm = (rod: (typeof rods)[number]) => round2((shares.get(rod.name) ?? 0) * rod.length);
  const least = (kind: string) => Math.min(...rods.filter((rod) => rod.kind === kind).map(mm));
  const [lidLength, boxLength] = [round2(lid[1] - lid[0]), round2(box[1] - box[0])];
  if (least('lid') < lidLength - TRIAL_SLACK) return `${spec.moving} (the lid) is not plastic ${String(deep)} mm deep behind its outer face at from, from ${String(lid[0])} to ${String(lid[1])} mm above the joint across the latch's ${String(spec.width)} mm, where the arm's root goes into it (the least found is ${String(least('lid'))} of ${String(lidLength)} mm). Make ${spec.moving} at least ${String(lid[1])} mm high there with a flat wall that wide, give from on the line where the two meet, or move the latch away from an edge`;
  if (least('box') < boxLength - TRIAL_SLACK) return `${spec.fixed} (the box) is not plastic ${String(deep)} mm deep behind its outer face at from, from ${String(-box[1])} to ${String(-box[0])} mm below the joint across ${String(round2(2 * wide))} mm, where the bead goes into it and the arm hangs (the least found is ${String(least('box'))} of ${String(boxLength)} mm). Make ${spec.fixed} at least ${String(-box[0])} mm high there with a flat wall that wide, give from on the line where the two meet, or move the latch away from an edge`;
  const proud = rods.filter((rod) => rod.kind === 'front' && mm(rod) > TRIAL_SLACK);
  if (proud.length > 0) {
    const bodies = [...new Set(proud.map((rod) => rod.body))];
    return `${bodies.join(' and ')} stand${bodies.length > 1 ? '' : 's'} out of the wall's plane at from: ${String(LATCH_FRONT)} mm in front of it, from ${String(-box[0])} mm below the joint to ${String(lid[1])} mm above it, up to ${String(Math.max(...proud.map(mm)))} mm of the way are plastic, where the arm hangs ${String(spec.arm.off)} mm off the wall. Give from and to on a flat stretch of the outer wall, where lid and box lie in one plane`;
  }
  return null;
}

/**
 * The face under a guide's rail tried before anything is built (audit N-mechanik-13: `up` was checked only to be square
 * to the line, and `up: [0, 1, 1]` on a level plate was built). Four rods along the line at both edges of the rail's
 * foot: two `FACE_SLACK` under from–to, which must lie in the fixed body all the way, and two as far over it, which must
 * find none of it. So the face is there under the whole rail, from–to lies on it, and up is its normal to within
 * `FACE_SLACK` over half the foot (about 2° at the default rail). Returns what is wrong, or null; throws when the trial
 * gave no answer.
 */
export async function railFace(upstream: UpstreamTools, spec: SlideSpec, callId: string | undefined): Promise<string | null> {
  const axis = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const length = Math.hypot(...axis);
  const along = axis.map((value) => value / length);
  const up = spec.up.map((value) => value / Math.hypot(...spec.up));
  const across = [0, 1, 2].map((i) => (up[(i + 1) % 3] ?? 0) * (along[(i + 2) % 3] ?? 0) - (up[(i + 2) % 3] ?? 0) * (along[(i + 1) % 3] ?? 0));
  const [edge, depth] = [spec.width / 2 - ROD / 2, FACE_SLACK + ROD / 2];
  const rods = [-1, 1].flatMap((side) =>
    (['under', 'over'] as const).map((kind) => ({ name: `${PROBE} ${kind} ${side > 0 ? '+' : '-'}`, kind, body: spec.fixed, base: spec.from.map((value, i) => value + (across[i] ?? 0) * side * edge + (up[i] ?? 0) * (kind === 'under' ? -depth : depth) + 0) })),
  );
  const shares = await rodsInside(upstream, rods, along, length, callId);
  const mm = (kind: 'under' | 'over') => rods.filter((rod) => rod.kind === kind).map((rod) => round2((shares.get(rod.name) ?? 0) * length));
  const [under, over] = [Math.min(...mm('under')), Math.max(...mm('over'))];
  const foot = `at the edges of the rail's ${String(spec.width)} mm foot`;
  if (under < round2(length) - TRIAL_SLACK) return `${spec.fixed} has no face under the whole rail: ${String(FACE_SLACK)} mm under from–to, ${foot}, only ${String(under)} of ${String(round2(length))} mm are plastic. Give from and to on a flat face of ${spec.fixed} that carries the whole rail, and up as that face's normal`;
  if (over > TRIAL_SLACK) return `${spec.fixed} stands over the line the rail goes on: ${String(FACE_SLACK)} mm over from–to, ${foot}, ${String(over)} mm of the way are plastic. up is not the normal of the face there (the face is tilted against it), or from–to lies under the face: give from and to on the face and up as its normal`;
  return null;
}

/** Whether two bodies print as one piece, as the mirror groups them for the print check and the plate: joined by a hinge PartBuddy marked (`printTogether`). */
async function printedTogether(run: Run, one: string, two: string): Promise<boolean> {
  const [listing, joints] = await run([
    { command: 'component.list', params: {} },
    { command: 'joint.list', params: {} },
  ]);
  const parts = componentsWithBodies(listing);
  if (parts.length < 2) return false;
  const described = await run(parts.map((part) => ({ command: 'component.metadata', params: { component: part.id } })));
  return printGroupsOf(parts, described, listing, joints, [one, two]).some((group) => group.includes(one) && group.includes(two));
}

/**
 * What is wrong with the walls behind the knuckles' rooms, as `skins` measured them; null when they print. A way to move
 * the line is offered only as far as both bodies still hold their knuckles (`HOLD`; review of PR BC-10, 6).
 */
export function skinProblem(found: Pick<Skins, 'fixed' | 'moving'>, spec: Pick<HingeSpec, 'fixed' | 'moving' | 'diameter'>, lies: Pick<Lies, 'fixed' | 'moving'>, nozzle: number): string | null {
  const mm = (value: number) => String(Math.round(value * 100) / 100);
  // How far the line may move away from a body before its knuckles hang on less than HOLD.
  const slack = (lie: Lie | null) => (lie && !lie.inside ? spec.diameter / 2 - HOLD - lie.distance + 1e-6 : Infinity);
  for (const key of ['fixed', 'moving'] as const) {
    const skin = found[key];
    if (!skin) continue;
    const other = key === 'fixed' ? 'moving' : 'fixed';
    const solid = skin.floor ? `the ${mm(skin.least)} mm a floor needs to print closed` : `two lines of the ${String(nozzle)} mm nozzle (${mm(skin.least)} mm)`;
    if (skin.mm === null) return `the rooms of the knuckles would leave a skin under ${solid} of ${spec[key]}'s wall behind them, along about ${mm(skin.along)} mm of the line. Make that wall thicker there, so it keeps ${mm(skin.least)} mm behind the rooms, or thinner than the rooms reach. Nothing was built.`;
    const short = skin.least - skin.mm;
    const ways = [
      short <= slack(lies[key]) ? `move the line ${mm(short)} mm away from that skin, towards ${spec[other]}` : null,
      skin.mm <= slack(lies[other]) ? (short <= slack(lies[key]) ? `${mm(skin.mm)} mm towards it, so the rooms open through it` : `move the line ${mm(skin.mm)} mm towards that skin, so the rooms open through it`) : null,
      `make that wall ${mm(short)} mm thicker`,
    ].filter((way) => way !== null);
    const said = ways.length === 1 ? ways[0] ?? '' : `${ways.slice(0, -1).join(', or ')}, or ${ways.at(-1) ?? ''}`;
    return `the rooms of the knuckles would leave a skin of ${mm(skin.mm)} mm of ${spec[key]}'s wall behind them, under ${solid}. ${said.charAt(0).toUpperCase()}${said.slice(1)}. Nothing was built.`;
  }
  return null;
}

const MOVE = 'The user moves it with the slider "Moving parts" in the view.';

/** What leans 45° prints without support only in a material that allows it: PETG and the carbon-filled ones stop at 40°. */
const leans = (what: string, overhang: number) => `${what} lean 45°, more than the ${String(overhang)}° the material in use prints without support: they need support there, or a material that prints 45°.`;

/**
 * What a lying hinge that hangs above the bed needs to print, from what was measured and built: said only as far as it
 * holds. "Stand on webs …, so they print without support" stood over 90 to 619 mm² the print check still found
 * (audit 2026-11-12, N-mechanik-4), and over webs that had no wall under them (N-mechanik-5).
 */
function hingePrint(spec: HingeSpec, depths: Lies | null, overhang: number): string {
  // Standing, the knuckles' lower ends are flat over the gap (audit N-mechanik-7, H-07: 9 to 22 mm² of overhang, unsaid).
  // shortcut: said, not built away; ends at 45° (a cone into a cone) would take the hollow ends into each knuckle's room too: build them when standing hinges are asked for.
  if (hingeLies(spec) === 'standing') return ` Standing, the lower end of each knuckle is flat and hangs over the gap to the knuckle below it, which the print check reports as overhang: the slicer bridges it from the walls, and where it sags into the gap the knuckles stick together. Print a test piece first, or lay the hinge with its line level, where no end hangs.${pinDiameter(spec.diameter) < PEG.least ? ` A pin under ${String(PEG.least)} mm printed standing breaks along its layers sooner than one lying.` : ''}`;
  // The roof over the bore and the webs are laid for the parts as designed, down being -z (audit H-08).
  const laid = ' The roof over the bore and the flat under the pin are laid for printing as designed, -z down: a print face that lays the parts otherwise turns them away from the bed.';
  const support = depths?.support;
  if (!support) return ` PartBuddy could not measure the bed and the walls beside the line, so no knuckle got a web: those that start above the bed need support.${laid}`;
  if (depths.untried && hangs(spec, support.bed)) return ` The knuckles start above the bed, and PartBuddy could not try the walls under the line this time, so no knuckle got a web: they need support, or build the hinge again.${laid}`;
  if (!hangs(spec, support.bed)) return laid;
  const count = { fixed: (spec.knuckles + 1) / 2, moving: (spec.knuckles - 1) / 2 };
  const bare = (['fixed', 'moving'] as const).filter((key) => !support[key]);
  const webs = `stand on webs at 45° that run from under the barrel down to their own wall`;
  if (bare.length === 0) {
    const all = ` All ${String(spec.knuckles)} knuckles start above the bed and ${webs}, and the pin is flat underneath where it bridges from knuckle to knuckle`;
    if (overhang < 45) return `${all}. ${leans('Webs, barrels and the bore', overhang)}${laid}`;
    return `${all}, so the hinge prints as it stands, without support.${laid}`;
  }
  const hung = bare.map((key) => `the ${String(count[key])} of ${spec[key]}`).join(' and ');
  const held = bare.length === 1 ? ` The ${String(count[bare[0] === 'fixed' ? 'moving' : 'fixed'])} knuckles of ${spec[bare[0] === 'fixed' ? 'moving' : 'fixed']} ${webs}.` : '';
  return ` The knuckles start above the bed, and ${hung} got no web: a web meets its wall ${String(webFoot(spec.diameter, spec.diameter / 2 - HOLD))} mm below the line at the most, and PartBuddy found no wall beside the line that reaches down there. They need support, or a wall that reaches down that far before the hinge is built.${held}${laid}`;
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
      // Audit W13: a body that lies over the whole rail cannot slide on it, and "slides from 0 mm to 0 mm" was the answer.
      // shortcut: only along an axis; askew the travel goes by the body's box, which reaches past a body that fits (review of BC-15, S2: 30 × 10 on a 40 mm rail at 45° read [0, 0]), so no such refusal there. Measure the body along the line when askew guides turn up.
      const alongAxis = axis.filter((value) => Math.abs(value) > 1e-6).length === 1;
      if (joins && alongAxis && travel[0] === 0 && travel[1] === 0) throw new Error(`${spec.moving} lies over the whole rail (from–to, ${String(round2(length))} mm) or reaches past both its ends, so it has no way to slide while it stays on the rail. Make the rail longer than ${spec.moving} is along it, or ${spec.moving} shorter`);
      // Not measured is not built: that the rail stands on a face of the fixed body, square to up, is checked here or nowhere.
      const face = await railFace(site.upstream, spec, site.callId).catch((cause: unknown) => {
        throw new Error(`PartBuddy could not measure the face of ${spec.fixed} under the rail: ${(cause as Error).message}. So it could not check that the rail stands on it with up as its normal, and nothing was built`);
      });
      if (face) throw new Error(face);
      const unit = (vector: number[]) => vector.map((value) => value / Math.hypot(...vector));
      const [along, up] = [unit(axis), unit(spec.up)];
      const across = [0, 1, 2].map((i) => (up[(i + 1) % 3] ?? 0) * (along[(i + 2) % 3] ?? 0) - (up[(i + 2) % 3] ?? 0) * (along[(i + 1) % 3] ?? 0));
      // The stretch of the line the body lies over: its travel either way is what of the rail it leaves free.
      const [start, covered] = [-travel[0], length + travel[0] - travel[1]];
      // Over the ridge and its two edges, and over the middle of each flank: each rod's top where the skin over the roof ends.
      const flank = (roof.ceiling + roof.ridge) / 4;
      const [ridge, slope] = [roof.top + skin - ROD / 2, (spec.height + (spec.over ?? spec.gap) + roof.top) / 2 + skin * Math.SQRT2 - ROD / 2];
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
async function buildMechanism(upstream: UpstreamTools, args: Record<string, unknown>, printer: ToolPrinter, callId: string | undefined, keepFace: KeepFace, overhang: number, log: (line: string) => void): Promise<string> {
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
    if (reply?.failed || result.isError || !reply) throw new Error(refusal(text));
    return reply.results ?? [];
  };
  const site: Site = { upstream, run, callId, mark: {}, log };
  try {
    const unused = unusedSaid(args);
    return `${await mechanism(site, args, printer, keepFace, overhang)}${unused}`;
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
          // A countersink sunk deeper (screwFit) is as wide as its mouth down to where its cone starts.
          const diameter = r3(recess.diameter - (spec.head === 'countersunk' ? 2 * Math.max(0, FACE_DROP - (screwFit(spec)?.sink ?? 0)) : 0));
          // The clearance hole is the ring's inside: a curved face is told from an edge by where round it the plastic is missing.
          return { at, base: at.map((value, k) => r3(value + (axis[k] ?? 0) * FACE_DROP)) as Vec3, axis, diameter, depth: r3(recess.depth - FACE_DROP), from: FACE_DROP, hole: 0, core: drawnHole(CLEARANCE_NORMAL[spec.size], spec.material), slack: ((Math.PI * diameter ** 2) / 4) * CURVED_FACE };
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

/** Where no standard length fits a screw joint: the nearest shorter and longer ones, and what each lacks or has too much. */
function unfit(spec: ScrewSpec): string {
  const { least, most, through } = screwWindow(spec);
  const lengths = screwLengths(spec);
  const [shorter, longer] = [screwSink(spec), lengths.find((length) => length > most)];
  const held = spec.thread === 'insert' ? 'insert' : 'thread';
  const said = [
    shorter === null ? null : `${spec.size}×${String(shorter.length)} holds only ${String(round2(Math.max(0, shorter.length - through)))} mm of the ${held}, where ${String(round2(least - through))} are needed${spec.head === 'none' ? '' : shorter.sink > sinkMost(spec.size) ? `, and its head would have to sink ${String(shorter.sink)} mm deeper, more than the ${String(sinkMost(spec.size))} mm (one diameter) a head may` : `, and sinking the head ${String(shorter.sink)} mm deeper would leave too little plastic under it`}`,
    longer === undefined ? null : `${spec.size}×${String(longer)} reaches ${String(round2(longer - most))} mm past the ${held}`,
  ].filter((part) => part !== null);
  return `No standard ${spec.size} screw length (${lengths.length > 0 ? `${String(lengths[0])} to ${String(lengths.at(-1))} mm` : 'none in the table'}) ends inside the ${held} at this thickness${said.length > 0 ? `: ${said.join('; ')}` : ''}`;
}

/** The plastic each pocket of a peg needs in the moving body (audit W24, N-mechanik-12: a pocket deeper than the body went through it unsaid), measured before anything is cut. */
export function pegStock(spec: PegSpec, nozzle = 0.4, layer = 0.2): Stock[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0));
  const length = Math.hypot(...delta);
  const axis = delta.map((value) => Math.round((value / length) * 1e6) / 1e6) as Vec3;
  const r3 = (value: number) => Math.round(value * 1000) / 1000;
  return [spec.from, ...spec.more].map((at) => ({
    at,
    base: at.map((value, k) => r3(value + (axis[k] ?? 0) * FACE_DROP)) as Vec3,
    axis,
    diameter: r3(pegBore(spec) + 2 * PEG.wall),
    depth: r3(pegLength(spec.diameter) + PEG.deeper + pegFloor(nozzle, layer) - FACE_DROP),
    from: FACE_DROP,
    hole: 0,
  }));
}

async function mechanism(site: Site, args: Record<string, unknown>, printer: ToolPrinter, keepFace: KeepFace, overhang: number): Promise<string> {
  const { upstream, run, callId } = site;
  const { nozzle, layer } = printer;
  if (args.kind === 'hinge') {
    const spec = hingeOf(args, nozzle, layer);
    if (typeof spec === 'string') throw new Error(spec);
    const reach = String(Math.round((spec.diameter / 2 - HOLD) * 10) / 10);
    const where = `Put the hinge line within ${reach} mm of both bodies (the barrel is ${String(spec.diameter)} mm, so it must overlap each by at least ${String(HOLD)} mm). PartBuddy cuts each knuckle's room in the other body itself.`;
    let depths: Lies | null = null;
    let left: Skins | null = null;
    // What was measured before the build, said as measured: how deep the rooms go, and that no wall behind them is left thinner than prints.
    const rooms = () => {
      if (!depths || !left) return '';
      const room = String(Math.round((spec.diameter / 2 + spec.gap) * 100) / 100);
      const into = (key: 'fixed' | 'moving') => (depths?.[key]?.inside ? `${room} mm and more into ${spec[key]} (the line runs inside it)` : `${String(Math.round((spec.diameter / 2 + spec.gap - (depths?.[key]?.distance ?? 0)) * 100) / 100)} mm into ${spec[key]}`);
      const length = Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0)));
      // Where a wall keeps the least behind the rooms along part of the line only, that is said: elsewhere nothing of it is behind them.
      const part = (['fixed', 'moving'] as const).filter((key) => (left?.deep[key] ?? 1) < 0.9).map((key) => ` ${spec[key]} keeps it along ${String(Math.round((left?.deep[key] ?? 0) * length * 10) / 10)} of the ${String(Math.round(length * 10) / 10)} mm of the line; elsewhere nothing of its wall stands behind the rooms that way.`).join('');
      return ` The knuckles' rooms go ${into('fixed')} and ${into('moving')}, measured from the face nearest the line, and PartBuddy measured the walls behind them on the way to that face: no room leaves a skin there under ${String(left.least.fixed)} mm of ${spec.fixed} or ${String(left.least.moving)} mm of ${spec.moving}.${part}`;
    };
    const warnings = await build(site, spec,
      // With the walls and the bed measured, knuckles that start in the air get their webs.
      () => hingeSteps(depths?.support ? { ...spec, support: depths.support } : spec),
      where,
      false,
      async () => {
        // Not measured is not built: the knuckles' hold and the walls behind their rooms are checked here or nowhere (audit H-08, W7).
        const measured = await roomDepths(upstream, spec, callId);
        if (typeof measured === 'string') throw new Error(`PartBuddy could not measure where the hinge line lies against ${spec.fixed} and ${spec.moving}: ${measured}. So it could not check that the knuckles hold and leave no thin skin, and nothing was built. Check that both are solid bodies beside the line (inspect.measure) before you call again`);
        depths = measured;
        const off = lineProblem(depths, spec, where);
        if (off) throw new Error(off);
        const tried = await skins(upstream, spec, depths, { nozzle, layer }, callId).catch((cause: unknown) => (cause as Error).message);
        if (typeof tried === 'string') throw new Error(`PartBuddy could not measure the walls behind the knuckles' rooms: ${tried}. So it could not check that none is left as a thin skin, and nothing was built`);
        left = tried;
        const thin = skinProblem(left, spec, depths, nozzle);
        if (thin) throw new Error(thin);
      },
      'revolute',
    );
    // A hinge on the line of an earlier one only narrows what that joint allows: it is run through its limits again.
    const range = await join(run, spec, 'revolute', site.shares?.limits ?? [-180, 180], 1, site.shares?.name);
    // Review of PR #366, K1: which print face lays the hinge, said where it is decided.
    const print = `${site.shares ? ` It lies on the line of the hinge "${site.shares.name}" and turns about that hinge's joint, which carries both now.` : ''}${hingePrint(spec, depths, overhang)} ${spec.fixed} and ${spec.moving} print as one piece, as they lie to each other: the print check, the plate view and "send to slicer" lay both on the print face of whichever of them comes first in the design and has one (the exported 3MF keeps them as designed), so give only one of them a print face.`;
    const [min, max] = range;
    return (
      `Built the hinge "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (turns): ${String(spec.knuckles)} knuckles, barrel ${String(spec.diameter)} mm, pin ${String(pinDiameter(spec.diameter))} mm, ` +
      `gap ${String(spec.gap)} mm everywhere. It turns from ${String(min)}° to ${String(max)}° before the bodies meet, and those are its limits now; 0° is as designed. ` +
      `${MOVE} If it should open further, make room where the bodies meet, take the hinge back with undo and call again.${print}${rooms()}${warnings}`
    );
  }
  if (args.kind === 'slide') {
    const spec = slideOf(args, nozzle, 0.2, layer);
    if (typeof spec === 'string') throw new Error(spec);
    // The box along the line is the same before and after the groove is cut.
    const { warnings, measure, print } = await buildGuide(site, spec, nozzle, overhang, 'slider');
    const travel = railTravel(measure, spec.from, spec.to);
    if (!travel) throw new Error(`${spec.moving} could not be measured, so how far the guide may travel is not known.`);
    const range = await join(run, spec, 'slider', travel, 0.1);
    const [min, max] = range;
    const mm = (value: number) => String(Math.round(value * 10) / 10);
    return (
      `Built the guide "${spec.name}" between ${spec.fixed} (stays) and ${spec.moving} (slides): a dovetail rail ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high, ` +
      `gap ${gapSaid(spec, layer, 'everywhere')}. It slides from ${mm(min)} mm to ${mm(max)} mm while ${spec.moving} stays on the rail and the bodies do not meet, and those are its limits now; 0 mm is as designed. ` +
      `${MOVE} Nothing holds it at the ends of the rail; add stops if it must not come off. ${print}${warnings}`
    );
  }
  if (args.kind === 'closure') {
    const spec = lipOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const thick = lipThick(nozzle);
    const behind = Math.round((RILLE_DEPTH + nozzle * 2 * 1.125) * 100) / 100;
    // Unset: the trial gave no answer, and the answer says what to keep instead.
    let tried: Awaited<ReturnType<typeof closureTrial>> | undefined;
    const warnings = await build(site, spec, lipSteps(spec), spec.flat ? `Give from and to as opposite corners of the inner room of ${spec.fixed} on the face of ${spec.moving} towards it, so the lip stands on the plate.` : `Give from and to as opposite corners of the inner room of ${spec.moving} at its rim, so the lip lies on its wall.`, false, async () => {
      tried = await closureTrial(upstream, spec, nozzle, callId).catch(() => undefined);
      if (tried?.problem) throw new Error(tried.problem);
    });
    const box = tried
      ? ` PartBuddy tried ${spec.fixed}'s wall where the lid closes: the lip goes in, and the wall with the catch is at least ${String(behind)} mm thick behind the rille.${tried.back.length > 0 ? ` At the lid's ${tried.back.join(', ')} wall${tried.back.length > 1 ? 's' : ''} ${spec.fixed}'s wall stands back from the lid's, so the lip does not centre the lid there.` : ''}`
      : ` PartBuddy could not try ${spec.fixed}'s wall: keep it straight where the lip goes in, and at least ${String(behind)} mm thick behind the rille.`;
    const unhinged = spec.hinge && !spec.flat ? ' The wall at the hinge keeps no lip: the hinge holds the lid there, and its knuckles turn where the lip would stand.' : '';
    // Audit T11: the lip's foot and the bead's flanks are 45°, more than some materials print without support.
    const steep = overhang < 45 ? ` ${leans(spec.flat ? "The bead's flanks" : "The slope under the lip's foot and the bead's flanks", overhang)}` : '';
    if (spec.flat) {
      // The lip stands along up: the plate prints on its face the other way.
      const laid = await layOn(run, spec.moving, [0, 0, -spec.up], keepFace);
      return `Built the closure "${spec.name}" between ${spec.fixed} (the box) and ${spec.moving} (the flat lid): a lip ${String(thick)} mm thick and ${String(LIP.high)} mm high on the plate, ${String(LIP.clear)} mm clear of the box's wall, and a bead that snaps ${String(LIP.bead - LIP.clear)} mm into a rille of that wall. The plate has no notch to open it: let it stand out over the box by a millimetre or two on the side of the catch. It prints with the lip up, lying on the plate's outer face, ${laid === null ? 'which is set as its print face, in place of any it had' : `which PartBuddy could not set as its print face (${laid}): set it there`}. It makes no joint.${steep}${box}${warnings}`;
    }
    return (
      `Built the closure "${spec.name}" between ${spec.fixed} (the box) and ${spec.moving} (the lid): a lip ${String(thick)} mm thick and ${String(LIP.high)} mm high inside the lid, ${String(LIP.clear)} mm clear of the box's wall, a bead that snaps ${String(LIP.bead - LIP.clear)} mm into a rille of that wall, and a notch through the lid's rim to open it. It makes no joint and needs no room outside the box.${unhinged}${steep}${box}${warnings}`
    );
  }
  if (args.kind === 'lid') {
    const spec = lidOf(args, nozzle);
    if (typeof spec === 'string') throw new Error(spec);
    const thread = lidThread(spec);
    const skirt = lidSkirt(spec);
    // Set from the trial; an object, so the answer below reads what the trial wrote.
    const neck = { measured: false };
    const asked = spec.name;
    const warnings = await build(site, spec, () => lidSteps(spec), `Give from as the centre of the rim of ${spec.fixed} and diameter as the outer diameter of its neck, which must be a plain upright cylinder over the top ${String(skirt)} mm.`, true, async () => {
      const problem = await neckTrial(upstream, spec, callId).catch(() => undefined);
      if (problem) throw new Error(problem);
      neck.measured = problem === null;
      // The thread's sketches and the flutes' pattern name what they take by the name: a second lid of the same name took
      // the first one's (audit G3). A name the design has already gets a number, before the steps are made.
      spec.name = await freeName(run, spec.name);
    });
    // SolidCraft has the lid's print face from the steps, but does not report it: asked for once more, it names the face,
    // which the plate view needs to lay the lid on its top too.
    const [laid] = await run([{ command: 'body.print_face', params: { body: spec.moving, point: [spec.centre[0], spec.centre[1], round2(spec.centre[2] + LID.top)] } }]).catch(() => []);
    const face = (laid as { face?: unknown } | undefined)?.face;
    if (typeof face === 'string') keepFace(spec.moving, face);
    return (
      `Built the screw lid "${spec.moving}" for ${spec.fixed}: a thread with 45° flanks on the neck, pitch ${String(thread.pitch)} mm, ${String(thread.depth)} mm deep, ${String(spec.starts)} start${spec.starts > 1 ? 's' : ''}, ` +
      `and the same inside the lid, ${String(spec.gap)} mm clear radially (${String(round2(spec.gap / Math.SQRT2))} mm square to the 45° flanks); it closes in ${String(round2(thread.turns))} turn${thread.turns > 1 ? 's' : ''} and stops with its inner top on the rim. ` +
      `The lid is ${String(round2(spec.diameter + 2 * (thread.depth + spec.gap + LID.wall)))} mm wide and covers the top ${String(skirt)} mm of the neck, has flutes to grip and prints standing on its top (its print face is set); ${overhang < 45 ? leans("the threads' flanks on both parts", overhang).replace(/\.$/, '') : 'both parts print without support'}. ` +
      (neck.measured ? `PartBuddy measured the neck: a plain cylinder of ${String(spec.diameter)} mm there, centred on from, with a wall of at least ${String(NECK_WALL)} mm.` : `PartBuddy could not measure the neck this time: keep it a plain cylinder of ${String(spec.diameter)} mm there, with a wall of at least ${String(NECK_WALL)} mm.`) +
      (spec.name === asked ? '' : ` Its thread and flutes are named "${spec.name}": the design has "${asked}" already.`) +
      warnings
    );
  }
  if (args.kind === 'screw') {
    const spec = screwOf(args, nozzle, printer.material);
    if (typeof spec === 'string') throw new Error(spec);
    // The plastic round the holes is measured before anything is built (audit R54): nothing of a joint that lacks it is built.
    const stock = screwStock(spec);
    const recess = headRecess(spec);
    const room = spec.head === 'cap' ? 'counterbore' : 'countersink';
    const sink = screwFit(spec)?.sink ?? 0;
    const measured = { all: true, fell: 0 };
    const warnings = await build(site, spec, screwSteps(spec), `Give from on the outer face of ${spec.moving} and to on the face where it meets ${spec.fixed}.`, false, async () => {
      for (const [body, rooms, need] of [
        [spec.moving, stock.moving, `the ${room} for the head is ${String(recess?.diameter)} mm wide${sink > 0 ? ` and ${String(recess?.depth)} mm deep, sunk ${String(sink)} mm deeper so that a standard length fits,` : ''} and must lie wholly inside ${spec.moving}: move the screw at least ${String(round2((recess?.diameter ?? 0) / 2))} mm away from its edges and other cuts, or use head none`],
        [spec.fixed, stock.fixed, `the seat of an ${spec.size} insert needs ${String(seatWall(spec.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it. Thicken ${spec.fixed} there, move the screw away from edges and other cuts, or put a boss there`],
      ] as const) {
        if (rooms.length === 0) continue;
        const short = await shortOf(upstream, body, rooms, callId, (mm3) => (measured.fell = Math.max(measured.fell, mm3)));
        if (short) throw new Error(`${short}; ${need}.`);
        measured.all &&= short === null;
      }
    });
    const count = spec.more.length + 1;
    const fit = screwFit(spec);
    const insert = INSERT[spec.size];
    const screw = spec.head === 'countersunk' ? 'countersunk screws (ISO 10642)' : 'socket head cap screws (ISO 4762)';
    const clearance = CLEARANCE_NORMAL[spec.size];
    const sunk = fit && fit.sink > 0 ? `, sunk ${String(fit.sink)} mm deeper than the head needs so that a standard length ends in the ${spec.thread === 'insert' ? 'insert' : 'thread'}` : '';
    return (
      `Built ${String(count)} screw joint${count > 1 ? 's' : ''} "${spec.name}" that hold${count > 1 ? '' : 's'} ${spec.moving} on ${spec.fixed}: in ${spec.moving} a clearance hole of ${String(clearance)} mm for ${spec.size} (ISO 273, normal: ${String(round2(clearance - Number(spec.size.slice(1))))} mm over the screw; drawn ${String(drawnHole(clearance, spec.material))} mm, the material's hole allowance wider, so that it comes out at that size)` +
      `${spec.head === 'cap' ? ` with a counterbore for the head${sunk}` : spec.head === 'countersunk' ? ` with a 90° countersink${sunk}` : ''}, in ${spec.fixed} ` +
      `${spec.thread === 'insert' && insert ? `the seat of a heat-set insert (${String(insert.diameter)} mm wide, its maker's size, and ${String(insert.length + 1)} mm deep)` : `a modelled ${spec.size} thread`}. ` +
      `${fit === null ? `${unfit(spec)}, so no screws were put in: change the thickness or the size.` : `To buy: ${String(count)} × ${spec.size}×${String(fit.length)} ${screw}${spec.thread === 'insert' && insert ? ` and ${String(count)} ${spec.size} heat-set inserts ${String(insert.length)} mm long` : ''}${spec.screws ? '; the screws are in the design as standard parts' : ''}.`} ` +
      // Audit N-mechanik-20: the modelled thread is ISO's, and the print check does not see its flanks.
      (spec.thread === 'tapped' ? `The thread has ISO's 60° flanks: printed with its axis upright, their undersides lean 60°, more than prints clean, so run an ${spec.size} tap through it after printing, or use an insert where the part allows. ` : '') +
      (spec.thread === 'insert' ? `Each insert's seat needs ${String(seatWall(spec.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it${recess ? `, and the ${room} for each head lies inside ${spec.moving}` : ''}. ` : recess ? `The ${room} for each head lies inside ${spec.moving}. ` : '') +
      `${stock.moving.length + stock.fixed.length === 0 ? '' : measured.all ? `PartBuddy measured that plastic, from ${String(FACE_DROP)} mm under the faces on: it is there.${measured.fell > 0 ? fallenSaid(measured.fell, Math.max(0, ...stock.moving.map((room) => room.slack ?? 0))) : ''}` : 'PartBuddy could not measure that plastic this time: check it yourself.'}${warnings}`
    );
  }
  if (args.kind === 'snap') {
    const spec = snapOf(args, nozzle, printer.material);
    if (typeof spec === 'string') throw new Error(spec);
    const warnings = await build(site, spec, snapSteps(spec), `Give from as a point on a face of ${spec.fixed} at the inner face of the wall of ${spec.moving}, up as that face's normal and to as a point further into that wall.`, false, async () => {
      // Not measured is not built: whether the window goes through a wall that holds the catch is checked here or nowhere.
      const problem = await snapTrial(upstream, spec, printer, callId).catch((cause: unknown) => {
        throw new Error(`PartBuddy could not measure the wall of ${spec.moving} at the hooks: ${(cause as Error).message}. So it could not check that each window goes through a wall that holds the catch, and nothing was built`);
      });
      if (problem) throw new Error(problem);
    });
    const count = spec.more.length + 1;
    const { hook } = spec;
    const hold = snapHold();
    const strain = snapStrain({ length: hook.length, thickness: hook.thickness, catchDepth: hold, catchLength: hook.catchLength });
    const limit = snapLimit(printer.material);
    const { low, high, wide } = snapNeeds(spec, printer);
    const sized = hook.length !== SNAP.length || hook.thickness !== SNAP.thickness || hook.catch !== SNAP.catch ? ` (on the ${String(nozzle)} mm nozzle in ${limit.name}: an arm of two lines at the least, a catch of the narrowest line a slicer lays, and long enough to bend within what the material takes)` : '';
    return (
      `Built ${String(count)} snap hook${count > 1 ? 's' : ''} "${spec.name}" on ${spec.fixed}, each with its window through the ${String(spec.wall)} mm wall of ${spec.moving}: an arm ${String(hook.length)} mm long, ${String(hook.thickness)} mm thick and ${String(hook.width)} mm wide, ${String(hook.gap)} mm off the wall, with a catch ${String(hook.catch)} mm deep that reaches ${String(hold)} mm over the window's edge${sized}. ` +
      `Pushed together the hooks snap in by themselves (the arm bends ${String(hold)} mm, about ${String(Math.round(strain * 10) / 10)} % strain at the root); to open, press each catch back through its window. It makes no joint. ` +
      `That strain is within the ${limitWords(limit)}${strain > limit.often ? `; for a cover taken off often keep under ${String(limit.often)} % (${String(Math.round(SNAP_OFTEN * 100))} % of that, Bayer)` : ''}. ` +
      `The arms meet their foot in a sharp edge (SolidCraft's hook has no radius, and one beside the wall would run into it), where the formula assumes a round one: count about ${String(Math.round(SHARP_ROOT * strain * 10) / 10)} % there (a sharp root about ${String(SHARP_ROOT)} times as strained, Bayer)${SHARP_ROOT * strain > limit.strain ? `, more than those ${String(limit.strain)} %: print a test piece first${limit.known && limit.type === 'PLA' ? ', or use PETG' : ''}` : ''}. ` +
      `PartBuddy measured that wall at each hook first: ${String(spec.wall)} mm thick behind from and whole round the window, from ${String(low)} to ${String(high)} mm above the foot and ${String(wide)} mm wide. ` +
      `${uprightSaid('an arm', standsUpright(spec.up) ? `As designed the arms stand upright: where the part allows, lay ${spec.fixed} so that they lie flat.` : `Keep ${spec.fixed} lying as designed, with the arms flat.`)} Put hooks on opposite walls so that they hold each other in their windows.${warnings}`
    );
  }
  if (args.kind === 'latch') {
    const spec = latchOf(args, nozzle, printer.material);
    if (typeof spec === 'string') throw new Error(spec);
    const { deep, lid, box } = latchNeeds(spec.arm);
    const warnings = await build(site, spec, latchSteps(spec), `Give from on the line where ${spec.moving} and ${spec.fixed} meet, on their outer wall, and to as a point straight out of that wall; both walls must lie in one plane there.`, false, async () => {
      // Audit R40, H-24: hook and bead touch, which holds only for a lid printed apart from its box.
      // SolidCraft's refusal said with what it stopped (review of BC-11: it reached the model bare).
      const together = await printedTogether(run, spec.fixed, spec.moving).catch((cause: unknown) => {
        throw new Error(`PartBuddy could not read whether ${spec.moving} and ${spec.fixed} print as one piece (${(cause as Error).message}), so it could not check that a latch may join them, and nothing was built`);
      });
      if (together) throw new Error(`${spec.moving} and ${spec.fixed} print as one piece, joined by a print-in-place hinge. A latch needs the lid closed on its box: built open beside it (as a hinged box prints), the two walls share no seam for arm and bead; built closed, the hook lies on its bead without room and printed together they would fuse. A latch is for a lid that lifts off and prints apart; for a lid on a hinge use kind closure, which takes the hinge line`);
      // Not measured is not built: the walls under the latch are checked here or nowhere.
      const problem = await latchTrial(upstream, spec, callId).catch((cause: unknown) => {
        throw new Error(`PartBuddy could not measure the walls of ${spec.moving} and ${spec.fixed} at the latch: ${(cause as Error).message}. So it could not check that they are flat where the arm and the bead go, and nothing was built`);
      });
      if (problem) throw new Error(problem);
    });
    const laid = await layOn(run, spec.moving, latchFrame(spec).up, keepFace);
    return (
      `Built the latch "${spec.name}": an arm ${String(spec.width)} mm wide and ${String(spec.arm.thick)} mm thick grows out of the wall of ${spec.moving} (the lid), hangs ${String(spec.arm.off)} mm off the wall over the joint and snaps with its hook under a bead ${String(spec.arm.bead)} mm high on ${spec.fixed} (the box); the two overlap by ${String(round2(spec.arm.bead - spec.arm.clear))} mm on 45° faces, and the arm meets its root in a ${String(spec.arm.root)} mm radius${spec.arm.thick === LATCH.thick && spec.arm.lever === LATCH.lever ? '' : ` (on the ${String(nozzle)} mm nozzle: an arm of two lines at the least, ${String(spec.arm.lever)} mm from its root to the hook)`}. ` +
      `Pressing the lid down snaps it shut (about ${String(Math.round(latchStrain(spec.arm) * 10) / 10)} % strain at the arm's root); pulling the arm's lower end away from the box opens it, and so does a strong pull on the lid. It makes no joint. ` +
      `PartBuddy measured both walls first: flat and plastic ${String(deep)} mm deep across the latch, on ${spec.moving} from ${String(lid[0])} to ${String(lid[1])} mm above the joint and on ${spec.fixed} from ${String(-box[1])} to ${String(-box[0])} mm below it. The lid prints on its top, ${laid === null ? 'which is set as its print face, in place of any it had' : `which PartBuddy could not set as its print face (${laid}): set it there`}: ${overhang < 45 ? leans("the arm's foot and the bead's faces", overhang).replace(/\.$/, '') : 'the arm then grows out of it without support'}; the box prints standing. ${uprightSaid('the arm', `Lying it would be within the ${limitWords(snapLimit(printer.material))}, but no way of printing the lid lays it flat: print a test piece first.`)} Not printed yet: how firmly it holds shows on the first print.${warnings}`
    );
  }
  if (args.kind === 'plug' && args.shape === 'dovetail') {
    // The guide's own dovetail as a close fit, pushed together: the material's push fit, as round a peg (audit W16: 0.2 mm
    // for every material before), within the 0.1 to 0.3 mm guides for printed dovetails give.
    const spec = slideOf({ ...args, gap: typeof args.gap === 'number' ? args.gap : within(fitClearance('push', printer), DOVETAIL_GAP), name: typeof args.name === 'string' && args.name.trim() !== '' ? args.name : 'Dovetail' }, nozzle, 0.1, layer);
    if (typeof spec === 'string') throw new Error(spec);
    const held = typeof args.gap === 'number' ? '' : heldSaid('a dovetail plug', 'push', fitClearance('push', printer), spec.gap, `${String(DOVETAIL_GAP[0])} to ${String(DOVETAIL_GAP[1])} mm all round`);
    if (held) site.log?.(`partbuddy_mechanism dovetail:${held}`);
    const { warnings, print } = await buildGuide(site, spec, nozzle, overhang);
    return (
      `Built the dovetail "${spec.name}" between ${spec.fixed} (carries the rail) and ${spec.moving} (has the groove): ${String(spec.width)} mm wide at its foot and ${String(spec.height)} mm high with 45° flanks, ${gapSaid(spec, layer, 'clear all round')}. ` +
      `It makes no joint: ${spec.moving} is pushed on along the line and stops where the groove ends inside it; where the groove runs through, nothing stops it. ${print} Not printed yet: when it binds or rattles, build it again with another gap.${held}${typeof args.gap === 'number' ? '' : unmeasuredSaid(printer)}${warnings}`
    );
  }
  if (args.kind === 'plug') {
    if (args.shape !== undefined && args.shape !== 'peg') throw new Error('shape must be peg or dovetail');
    const spec = pegOf(args, printer);
    if (typeof spec === 'string') throw new Error(spec);
    const held = typeof args.gap === 'number' ? '' : heldSaid('a peg', 'push', fitClearance('push', printer), spec.gap, `${String(PEG_GAP[0])} to ${String(PEG_GAP[1])} mm a side`);
    if (held) site.log?.(`partbuddy_mechanism plug:${held}`);
    const long = pegLength(spec.diameter);
    const floor = pegFloor(nozzle, layer);
    const stock = pegStock(spec, nozzle, layer);
    const deep = round2(long + PEG.deeper + floor);
    const pockets = { measured: false };
    const warnings = await build(site, spec, pegSteps(spec), `Give from as a point on the face where ${spec.fixed} and ${spec.moving} meet, and to as a point further into ${spec.moving}.`, false, async () => {
      const short = await shortOf(upstream, spec.moving, stock, callId);
      if (short) throw new Error(`${short}; each pocket needs ${String(PEG.wall)} mm of plastic round it and ${String(floor)} mm under it, ${String(deep)} mm from the face in all. Make ${spec.moving} thicker there, move the peg away from its edges, or use a smaller diameter (a peg is 1.5 diameters long).`);
      pockets.measured = short === null;
    });
    const count = spec.more.length + 1;
    return (
      `Built ${String(count)} peg${count > 1 ? 's' : ''} "${spec.name}" on ${spec.fixed} with ${count > 1 ? 'their pockets' : 'its pocket'} in ${spec.moving}: ${String(spec.diameter)} mm thick and ${String(long)} mm long, ${String(spec.gap)} mm clear per side as printed (the pocket drawn ${String(pegBore(spec))} mm wide, the material's hole allowance wider), the pocket ${String(PEG.deeper)} mm deeper for air and glue, tip and mouth chamfered. It makes no joint. ` +
      `${count === 1 ? 'One round peg lets the parts turn about it: add a second one far from it (more). ' : ''}${spec.diameter < PEG.least ? `A peg under ${String(PEG.least)} mm printed standing is weak. ` : ''}` +
      `A peg printed standing breaks along its layers sooner than one lying. ${pockets.measured ? `PartBuddy measured ${spec.moving}: each pocket has ${String(PEG.wall)} mm of plastic round it and ${String(floor)} mm under it.` : `PartBuddy could not measure ${spec.moving} this time: keep ${String(PEG.wall)} mm of plastic round each pocket and ${String(floor)} mm under it, ${String(deep)} mm from the face.`} Not printed yet: when it binds or rattles, build it again with another gap.${held}${typeof args.gap === 'number' ? '' : unmeasuredSaid(printer)}${warnings}`
    );
  }
  throw new Error('kind must be hinge, slide, closure, screw, lid, snap, plug or latch');
}

/**
 * The upstream tools plus `partbuddy_mechanism`; `nozzle` is the printer's nozzle in use, for the default gap, `overhang`
 * how far the material in use leans without support (degrees), for what the answers promise, `layer` its layer
 * height, for the hinge's gap and floors (0.2 mm where none is given), `material` the part's material, for the fits of
 * pegs and the hole allowance of drilled holes and pockets, and `log` where a refusal is written.
 */
export function withMechanismTool(
  upstream: UpstreamTools,
  nozzle: () => number,
  keepFace: KeepFace = () => undefined,
  overhang: () => number = () => 45,
  layer: () => number = () => 0.2,
  material: () => ToolMaterial = () => DEFAULT_MATERIAL,
  log: (line: string) => void = () => undefined,
): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), mechanismTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== MECHANISM_TOOL) return upstream.callTool(name, args, callId);
      try {
        return { content: [{ type: 'text', text: await buildMechanism(upstream, args, { nozzle: nozzle(), layer: layer(), material: material() }, callId, keepFace, overhang(), log) }] };
      } catch (cause) {
        // The refusal reaches the model; the log keeps which kind and why, for a report (audit BC-15 rest).
        log(`partbuddy_mechanism ${String(args.kind)} not built: ${(cause as Error).message.slice(0, 300)}`);
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route, after the joint guidance. */
export const MECHANISM_GUIDANCE = `For a hinge (a lid that folds, a flap, a clamp that opens) or a guide (a drawer, a slider, a carriage on a rail) call ${MECHANISM_TOOL} once both bodies exist instead of modelling knuckles, a pin or a rail yourself: it builds the geometry with the right gaps, joins the bodies and sets the limits. For a lid that should hold shut by itself (a box, a case, a container) call it with kind closure instead of modelling a latch, a hook or a clip: a lip with a snap bead inside the lid, nothing standing out, only a notch for a fingernail in the lid's rim. For parts that are screwed together (a lid on a housing, a bracket on a base, a cover) call it with kind screw instead of drilling the holes yourself: it sizes the clearance hole, the room for the head and the seat of the heat-set insert, and says which screws to buy. For a round container that should screw shut (a jar, a canister, a bottle cap) build the container with a plain cylindrical neck and call it with kind lid: it threads the neck and makes the lid, instead of modelling a thread yourself. For a cover or a housing half that should clip on and come off again by pressing on catches (an electronics housing, a battery cover) call it with kind snap: hooks on one part, their windows through the other part's wall. For a lid that lifts off and should be held down by a latch one sees and opens with a finger (a tool box, a case) call it with kind latch: a snap latch outside; a lid on a hinge prints with its box and is held by kind closure instead. For a part split in two to fit the printer, or two parts that are plugged or glued together, call it with kind plug: pegs with their pockets (two or more), or shape dovetail to push one part onto the other.`;
