import { BLOCK_SIZES, INSERT, ON_FACE, cutsThrough, defaultBlock, needsNormal, sizesOf, stepsOf, throughReach, throughTrial, type BlockSize, type FeatureBlock } from '../../shared/blocks';
import { featureBlockSchema } from '../../shared/contract';
import { KNOB, KNOB_CLEARANCE, KNOB_SHAFTS, knobFlat, knobFlutes, knobInsert, knobProblem, knobSteps, type KnobShaft } from '../../shared/knob';
import { TAPPED_FROM } from '../../shared/mechanisms';
import { MAGNET, MAGNET_HOLDS, magnetPocket, magnetProblem, magnetSteps, magnetStock, type MagnetHold } from '../../shared/magnet';
import { KEYHOLE, WALL, WOOD_SCREWS, WOOD_SCREW_UNDER, countersinkDepth, keyholeDepth, keyholeProblem, keyholeSteps, keyholeStock, woodScrewSteps, woodScrewStock, type WoodScrew } from '../../shared/wallMount';
import { componentOf } from '../solidcraft/actions';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { markOf, TAKEN_BACK_SAID, takeBack } from './takeBack';

/**
 * `partbuddy_block` (plan step F1, standards of 2026-11-11): the function blocks of the interface
 * for the assistant. It names the block, the body, a point on a flat face and the screw; the sizes
 * come from the same standard tables the user's form starts from (ISO 273 clearance, ISO 4762 and
 * ISO 10642 heads, ISO 4032 nuts, common heat-set inserts), not from the model's memory.
 */

export const BLOCK_TOOL = 'partbuddy_block';

/** The blocks the assistant can ask for; a logo goes through its own tool, with the drawing. */
export const ASSISTANT_BLOCKS = ['screwHole', 'tappedHole', 'insertSeat', 'nutTrap', 'boss', 'slot', 'text', 'lip', 'snapFit'] as const;
type AssistantBlock = (typeof ASSISTANT_BLOCKS)[number];
/** Wall mounting (wallMount.ts): not blocks of the interface yet. */
export const WALL_BLOCKS = ['keyhole', 'woodScrew', 'magnet'] as const;
/** A part of its own (knob.ts): body is the name of the new body. */
export const PART_BLOCKS = ['knob'] as const;

const vector = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };

const blockTool: UpstreamTool = {
  name: BLOCK_TOOL,
  description:
    'Build a function block on one body at a point of a flat face, sized from the standard tables: ' +
    'screwHole (clearance hole for a screw, with a counterbore for a socket head, a countersink, or plain), tappedHole (a modelled thread, from M5 in print), ' +
    'insertSeat (the seat of a heat-set insert, M2 to M6), nutTrap (a hexagonal pocket with its clearance hole), boss (a screw boss with an insert seat, standing on the face), ' +
    'slot (a slot for a screw, to adjust), text (embossed or engraved), lip (a lip or a groove on the rim of a shelled body), snapFit (a cantilever snap hook standing on the face). ' +
    'To hang a part on a wall: keyhole (a keyhole slot on the face against the wall, over a screw already in the wall; point is where the screw rests, normal points to the wall, up is the way up as the part hangs) ' +
    'or woodScrew (a countersunk hole for a wood screw, at a point of the face away from the wall); screw is the wood screw in mm. ' +
    'To hold with magnets: magnet (a pocket for a disc magnet at a point of a face, normal out of that face; diameter and height are the magnet\'s, default 6 × 2 mm; hold glue to drop it in on a drop of glue, press to press it in). ' +
    "A knob for a shaft is a part of its own: knob (body is the new body's name, point the centre of its underside where the shaft goes in, normal the way the shaft points, up the way its pointer points; shaft d for a potentiometer's or encoder's D shaft, knurl for a split knurled one, round for a plain shaft with a set screw). " +
    'Give only what differs from the standard; everything else is filled in. For two parts screwed together use partbuddy_mechanism with kind screw instead, which makes both holes on one line.',
  inputSchema: {
    type: 'object',
    properties: {
      block: { type: 'string', enum: [...ASSISTANT_BLOCKS, ...WALL_BLOCKS, ...PART_BLOCKS] },
      body: { type: 'string', description: 'The body (exact name); for knob the name of the new body.' },
      point: { ...vector, description: 'A point on the flat face the block goes at, in mm: the centre of the hole, the foot of the boss, the middle of the text.' },
      normal: { ...vector, description: 'The way out of that face; needed for nutTrap, slot, text, snapFit, keyhole and magnet. knob: the way the shaft points, default +Z.' },
      up: { ...vector, description: 'keyhole: the way up as the part hangs, along the face; default +Z. knob: the way its pointer points, across the shaft; default +Y.' },
      screw: { type: 'number', enum: [...WOOD_SCREWS], description: 'keyhole, woodScrew: the wood screw, its thread diameter in mm; default 4.' },
      size: { type: 'string', enum: [...BLOCK_SIZES], description: 'The screw; default M3. Ignored for text, lip and snapFit.' },
      more: { type: 'array', items: vector, maxItems: 99, description: 'screwHole, tappedHole, insertSeat, keyhole, woodScrew, magnet: further points on the same face, one each.' },
      head: { type: 'string', enum: ['none', 'cap', 'countersunk'], description: 'screwHole: the room for the head; default cap (a counterbore).' },
      fit: { type: 'string', enum: ['close', 'normal', 'loose'], description: 'screwHole: the clearance by ISO 273; default normal.' },
      depth: { type: 'number', description: 'tappedHole, insertSeat, nutTrap, slot, text: depth in mm; default by the block (a slot and a tapped hole go through, see through).' },
      through: {
        type: 'string',
        enum: ['wall', 'body'],
        description:
          'screwHole, tappedHole and slot without depth, and the hole of a nutTrap: how far they go. wall (default): through the wall at the point and no further, so a hole in the side of a hollow box leaves the far side whole. body: through all of the body on its line, as through both cheeks of a fork, a clevis or a hinge block with a gap between.',
      },
      diameter: { type: 'number', description: 'insertSeat: the hole for the insert; boss: its outer diameter; knob: its outer diameter, default 25; magnet: the diameter of the magnet, default 6. Default from the table.' },
      height: { type: 'number', description: 'boss: its height; text: the height of its capitals; lip: its height; knob: its height, default 16; magnet: the height of the magnet, default 2. Default by the block.' },
      length: { type: 'number', description: 'slot: its length; snapFit: the length of the arm. Default 10 and 12 mm.' },
      width: { type: 'number', description: 'slot, lip, snapFit: width in mm. Default by the block.' },
      along: { type: 'string', enum: ['x', 'y'], description: "slot: along the face's first or second direction." },
      text: { type: 'string', maxLength: 80, description: 'text: the words.' },
      mode: { type: 'string', enum: ['emboss', 'deboss'], description: 'text: raised or engraved; default engraved.' },
      type: { type: 'string', enum: ['lip', 'groove'], description: 'lip: a lip, or the groove that takes one.' },
      hold: { type: 'string', enum: [...MAGNET_HOLDS], description: 'magnet: glued in (0.3 mm of room, the default) or pressed in (0.1 mm).' },
      shaft: { type: 'string', enum: [...KNOB_SHAFTS], description: 'knob: the shaft it goes on; default d.' },
      shaftDiameter: { type: 'number', description: 'knob: the diameter of the shaft in mm; default 6.' },
      flat: { type: 'number', description: 'knob on a D shaft: the thickness of the shaft at its flat in mm; 4.5 on a 6 mm shaft, to be measured on any other.' },
      clearance: { type: 'number', description: "knob: added to the shaft's diameter in mm; default 0.2 (0 for knurl). More when the printed knob sits too tight." },
      hook: { type: 'string', enum: ['x+', 'x-', 'y+', 'y-'], description: "snapFit: the way the catch points, along the face's directions." },
    },
    required: ['block', 'body', 'point'],
    additionalProperties: false,
  },
};

type Vec3 = [number, number, number];
const vec3 = (value: unknown): Vec3 | null =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as Vec3) : null;

/** Why the sizes of a seat or a boss no longer fit the insert of the table; null when they do. */
function outOfTable(block: FeatureBlock): string | null {
  if (block.block !== 'insertSeat' && block.block !== 'boss') return null;
  const insert = INSERT[block.size];
  if (!insert) return null;
  const mm = (value: number) => String(Math.round(value * 100) / 100);
  if (block.block === 'boss') {
    const least = insert.diameter + 2 * insert.wall;
    return block.diameter < least - 1e-9 ? `a boss for an ${block.size} insert is at least ${mm(least)} mm wide: the ${String(insert.diameter)} mm hole and ${String(insert.wall)} mm of wall round it` : null;
  }
  // The insert melts into a hole a little narrower than itself: a hole far off the maker's size holds nothing or splits the part.
  if (block.diameter < insert.diameter * 0.9 - 1e-9 || block.diameter > insert.diameter * 1.1 + 1e-9)
    return `the hole for an ${block.size} insert is ${String(insert.diameter)} mm wide; diameter may differ by a tenth of that (${mm(insert.diameter * 0.9)} to ${mm(insert.diameter * 1.1)} mm)`;
  if (block.depth < insert.length - 1e-9 || block.depth > insert.length * 3 + 1e-9)
    return `the seat of an ${block.size} insert is ${mm(insert.length + 1)} mm deep (the insert is ${String(insert.length)} mm long); depth may be ${String(insert.length)} to ${mm(insert.length * 3)} mm`;
  return null;
}

/** The block the model asked for: the standard of its kind and size with what the model gave laid over it; or what is wrong. */
export function blockOf(args: Record<string, unknown>): FeatureBlock | string {
  const kind = args.block;
  if (typeof kind !== 'string' || !(ASSISTANT_BLOCKS as readonly string[]).includes(kind)) return `block must be one of ${ASSISTANT_BLOCKS.join(', ')}`;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const normal = args.normal === undefined ? null : vec3(args.normal);
  if (needsNormal(kind as AssistantBlock) && !normal) return `${kind} needs normal: the way out of the face, three numbers`;
  const size = (args.size ?? 'M3') as BlockSize;
  const head = args.head === 'countersunk' || args.head === 'none' ? args.head : 'cap';
  const sizes = sizesOf(kind as AssistantBlock, head);
  if (!sizes.includes(size)) return `${kind}${kind === 'screwHole' ? ` with head ${head}` : ''} has no size ${String(args.size)}; it has ${sizes.join(', ')}`;
  // One rule for a printed thread, here and in the screw joint (mechanisms.ts).
  if (kind === 'tappedHole' && Number(size.slice(1)) < TAPPED_FROM) return `a printed ${size} thread strips; use insertSeat (a heat-set insert) for ${size}, or tappedHole from M${String(TAPPED_FROM)}`;
  // The form's placeholder word is no text of the user's.
  if (kind === 'text' && (typeof args.text !== 'string' || !args.text.trim())) return 'text needs text: the words to write';
  const standard = defaultBlock(kind as AssistantBlock, body, point, size, normal ?? [0, 0, 1]);
  // Only the fields this kind has are taken from the model; the schema then checks their values.
  const given = Object.fromEntries(Object.keys(standard).flatMap((key) => (key in args && !['block', 'body', 'point', 'normal', 'size'].includes(key) ? [[key, args[key]]] : [])));
  const more = args.more !== undefined && 'more' in { more: undefined, ...standard } && ['screwHole', 'tappedHole', 'insertSeat'].includes(kind) ? { more: args.more } : {};
  const through = args.through !== undefined && ['screwHole', 'tappedHole', 'slot', 'nutTrap'].includes(kind) ? { through: args.through } : {};
  const parsed = featureBlockSchema.safeParse({ ...standard, ...given, ...more, ...through });
  if (!parsed.success) return `${parsed.error.issues[0]?.path.join('.') ?? kind}: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
  return outOfTable(parsed.data) ?? parsed.data;
}

type Step = { command: string; params: Record<string, unknown> };

/** Plastic a block needs where it cuts (audit R54): a cylinder from `base` along `axis` that must lie wholly in the body. */
export interface Stock {
  /** The point on the face it is measured behind, for the answer. */
  at: Vec3;
  base: Vec3;
  axis: Vec3;
  diameter: number;
  depth: number;
  /** How far under the face the cylinder starts, in mm. */
  from: number;
  /** mm³ of the cylinder the block itself has cut away, when it is measured after the block was built. */
  hole?: number;
  /**
   * The widest the hole is within the cylinder, in mm, when it is measured after the block was built: the ring outside
   * that width is the wall round the hole and must be plastic in full; `hole` and `slack` count inside it alone.
   */
  core?: number;
  /**
   * mm³ more the block may have cut away inside `core`: on a curved face the hole does not end where it ends on a flat
   * one. It lets a cut of that size under the hole pass as well, never one in the wall round it.
   */
  slack?: number;
}

/** In mm: how much deeper than asked a hole may reach on a curved face (measured 2026-11-12: an M3 seat on a rod of 20 mm radius took 0.02 mm more of the stock than on a flat face). */
export const CURVED_FACE = 0.3;

/** In mm: the plastic that must stay under the seat of an insert (three layers of 0.2 mm, as under a magnet pocket; our own choice). */
export const SEAT_UNDER = 0.6;
/** The plastic round an insert: what its maker asks for, and never under 2 mm (as a boss has it). */
export const seatWall = (size: BlockSize) => Math.max(2, INSERT[size]?.wall ?? 2);

/**
 * In mm: how far under the point the plastic is measured from. A face may fall away that far within the width of the
 * stock, as a curved one does (0.47 mm under a magnet pocket on a rod of 20 mm radius); an edge or a chamfer falls
 * further and is read as missing plastic.
 */
export const FACE_DROP = 0.5;

/** mm³ a hole `width` wide may take less than its cylinder on a face that falls away {@link FACE_DROP} at the rim of its stock (the cap of a ball). */
const rimDrop = (width: number, stock: number) => (Math.PI * FACE_DROP * width ** 4) / (8 * stock ** 2);

/**
 * The plastic the seat of an insert needs, measured after it is cut: {@link FACE_DROP} under the face on, the seat itself
 * taken off. `curved` when the seat cut less than its cylinder: only then is the slack of a curved face allowed, and
 * only under the seat: its wall is measured as a ring round it, in full (a slack over the whole cylinder let a seat 5 mm
 * from an edge with a 3 mm chamfer through with 0.5 mm of wall at the top; reviews 3 and 4 of PR #357).
 */
export function seatStock(block: Extract<FeatureBlock, { block: 'insertSeat' }>, point: Vec3, axis: Vec3, curved = false): Stock {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const area = (Math.PI * block.diameter ** 2) / 4;
  return {
    at: point,
    base: point.map((value, k) => round(value + (axis[k] ?? 0) * FACE_DROP)) as Vec3,
    axis,
    diameter: round(block.diameter + 2 * seatWall(block.size)),
    depth: round(block.depth - FACE_DROP + SEAT_UNDER),
    from: FACE_DROP,
    hole: area * (block.depth - FACE_DROP),
    // A hair wider than the seat, so that no face of the probe lies on a face of the seat.
    core: round(block.diameter + 0.02),
    ...(curved ? { slack: area * CURVED_FACE } : {}),
  };
}

/** What a block says when a curved face took some of the wall round its holes: the most at one hole, and the most allowed at one. */
export const fallenSaid = (wall: number, slack: number) =>
  ` Round the hole the face falls away all round, as a curved face does: PartBuddy allowed up to ${String(Math.round(wall * 10) / 10)} mm³ of wall at the top of a hole that this takes, and no more than ${String(Math.round(slack * 10) / 10)} mm³ missing round and under any one hole. A face that falls away to one side on its own is not allowed; where it comes with a curve, PartBuddy cannot always tell it apart.`;

/** What a block says when its measure allowed for a curved face: how much, and that it covers the plastic under the hole alone. */
const lenientSaid = (slack: number) =>
  ` Right under the hole it allows ${String(Math.round(slack * 10) / 10)} mm³ less plastic, ${String(CURVED_FACE)} mm of the hole's depth, as a curved face may take; it cannot tell that from a cut of that size there. The wall round the hole is measured in full.`;

/** A wall mounting the model asked for: its steps and what to say; null when the block is none of them; or what is wrong. */
export function wallOf(args: Record<string, unknown>): { body: string; steps: Step[]; text: string; stock?: Stock[]; cut?: (point: Vec3, axis: Vec3) => Stock; need: string } | string | null {
  if (args.block !== 'keyhole' && args.block !== 'woodScrew') return null;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const screw = (args.screw ?? 4) as WoodScrew;
  if (!(WOOD_SCREWS as readonly number[]).includes(screw)) return `screw must be one of ${WOOD_SCREWS.join(', ')} (mm, a wood screw)`;
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((entry) => entry === null)) return 'more must be a list of points, each three numbers';
  const count = more.length + 1;
  const size = WALL[screw];
  if (args.block === 'woodScrew') {
    return {
      body,
      steps: woodScrewSteps({ body, point, more: more as Vec3[], screw, name: 'Wall screw' }),
      cut: (at, axis) => woodScrewStock(screw, at, axis, FACE_DROP),
      need: `a countersunk hole for a ${String(screw)} mm wood screw needs ${String(screw)} mm of plastic round its ${String(size.clearance)} mm hole and a plate at least ${String(Math.round((countersinkDepth(screw) + WOOD_SCREW_UNDER) * 100) / 100)} mm thick. Thicken the plate, or move the hole away from edges and other cuts`,
      text: `Built ${String(count)} countersunk hole${count > 1 ? 's' : ''} for ${String(screw)} mm wood screws in ${body}: ${String(size.clearance)} mm through, countersink ${String(size.countersink)} mm at 90°, so the head lies flush. Keep at least ${String(screw)} mm of plastic between the ${String(size.clearance)} mm hole and an edge, and the plate thicker than the countersink is deep (${String(Math.round(((size.countersink - size.clearance) / 2) * 10) / 10)} mm).`,
    };
  }
  const normal = vec3(args.normal);
  if (!normal) return 'keyhole needs normal: the way out of the face against the wall, three numbers';
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec = { body, point, normal, up, screw, more: more as Vec3[], name: 'Keyhole' };
  const problem = keyholeProblem(spec);
  if (problem) return problem;
  return {
    body,
    steps: keyholeSteps(spec),
    stock: keyholeStock(spec, FACE_DROP),
    need: `a keyhole needs the part ${String(keyholeDepth(screw))} mm thick behind its entry and its slot. Thicken the part there, move the keyhole away from edges and other cuts, or use woodScrew`,
    text:
      `Built ${String(count)} keyhole slot${count > 1 ? 's' : ''} for ${String(screw)} mm wood screws in ${body}: entry ${String(size.entry)} mm for the head, a slot ${String(size.slot)} mm wide running ${String(KEYHOLE.travel)} mm up to where the screw rests, ` +
      `and behind its ${String(KEYHOLE.lip)} mm lip a pocket ${String(size.pocket)} mm deep for the head. The part must be at least ${String(keyholeDepth(screw))} mm thick there. ` +
      `It prints without support with that face on the bed (the pocket's roof is a bridge of ${String(size.entry)} mm); the screw in the wall stands out ${String(Math.round((KEYHOLE.lip + size.pocket / 2) * 10) / 10)} mm.`,
  };
}

/** Magnet pockets the model asked for: their steps and what to say; null when the block is none; or what is wrong. */
export function magnetOf(args: Record<string, unknown>): { body: string; steps: Step[]; text: string; stock: Stock[]; need: string } | string | null {
  if (args.block !== 'magnet') return null;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const normal = vec3(args.normal);
  if (!normal) return 'magnet needs normal: the way out of the face the pocket opens in, three numbers';
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((entry) => entry === null)) return 'more must be a list of points, each three numbers';
  const hold = (args.hold ?? 'glue') as MagnetHold;
  if (!MAGNET_HOLDS.includes(hold)) return `hold must be one of ${MAGNET_HOLDS.join(', ')}`;
  const number = (value: unknown, standard: number) => (value === undefined ? standard : typeof value === 'number' ? value : Number.NaN);
  const spec = { body, point, normal, more: more as Vec3[], diameter: number(args.diameter, 6), height: number(args.height, 2), hold, name: 'Magnet' };
  const problem = magnetProblem(spec);
  if (problem) return problem;
  const pocket = magnetPocket(spec);
  const count = more.length + 1;
  return {
    body,
    steps: magnetSteps(spec),
    stock: magnetStock(spec, FACE_DROP),
    need: `a pocket needs ${String(MAGNET.around)} mm of plastic round it and ${String(MAGNET.under)} mm under it. Thicken the part there, move the pocket away from edges and other cuts, or take a thinner magnet`,
    text:
      `Built ${String(count)} pocket${count > 1 ? 's' : ''} for ${String(spec.diameter)} × ${String(spec.height)} mm disc magnets in ${body}: ${String(pocket.diameter)} mm wide and ${String(pocket.depth)} mm deep, so the magnet lies ${String(MAGNET.sunk)} mm under the face, with a chamfered mouth. ` +
      (hold === 'glue' ? 'The magnet drops in and is held by a drop of superglue. ' : `The magnet is pressed in (${String(MAGNET.room.press)} mm of room on the diameter); with more than that missing the plastic splits along its layers, so try one pocket first. `) +
      `Keep at least ${String(MAGNET.around)} mm of plastic round a pocket and ${String(MAGNET.under)} mm under it. Mark the poles before gluing a pair: the two parts must attract. Neodymium magnets lose strength above 80 °C. No pocket of these sizes has been printed yet.`,
  };
}

/** A knob the model asked for: its steps and what to say; null when the block is none; or what is wrong. */
export function knobOf(args: Record<string, unknown>): { body: string; steps: Step[]; text: string; fresh: true } | string | null {
  if (args.block !== 'knob') return null;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body (the name of the new knob) and point (three numbers, the centre of its underside) are needed';
  const axis = args.normal === undefined ? ([0, 0, 1] as Vec3) : vec3(args.normal);
  if (!axis) return 'normal must be three numbers';
  // The pointer's usual way, or another when the shaft itself points that way.
  const usual: Vec3 = Math.abs(axis[0]) < 1e-9 && Math.abs(axis[2]) < 1e-9 ? [0, 0, 1] : [0, 1, 0];
  const toward = args.up === undefined ? usual : vec3(args.up);
  if (!toward) return 'up must be three numbers';
  const shaft = (args.shaft ?? 'd') as KnobShaft;
  if (!KNOB_SHAFTS.includes(shaft)) return `shaft must be one of ${KNOB_SHAFTS.join(', ')}`;
  const number = (value: unknown, standard: number) => (value === undefined ? standard : typeof value === 'number' ? value : Number.NaN);
  const shaftDiameter = number(args.shaftDiameter, 6);
  const flat = number(args.flat, knobFlat(shaftDiameter) ?? Number.NaN);
  if (shaft === 'd' && args.flat === undefined && Number.isNaN(flat)) return `a D shaft of ${String(shaftDiameter)} mm has no one flat: give flat, the shaft's thickness there, as measured`;
  const spec = { body, point, axis, toward, shaft, shaftDiameter, flat, diameter: number(args.diameter, 25), height: number(args.height, 16), clearance: number(args.clearance, KNOB_CLEARANCE[shaft]) };
  const problem = knobProblem(spec);
  if (problem) return problem;
  const bore = Math.round((shaftDiameter + spec.clearance) * 100) / 100;
  const insert = knobInsert(spec);
  const hold =
    shaft === 'd'
      ? `for a ${String(shaftDiameter)} mm D shaft (flat at ${String(flat)} mm): the bore is ${String(bore)} mm wide and ${String(insert)} mm deep, flat over its last ${String(Math.min(KNOB.flat, insert))} mm on the side away from the pointer, with a chamfered mouth, to push on`
      : shaft === 'knurl'
        ? `for a split knurled shaft of ${String(shaftDiameter)} mm: a plain bore ${String(bore)} mm wide and ${String(insert)} mm deep, which the shaft springs into`
        : `for a round ${String(shaftDiameter)} mm shaft: the bore is ${String(bore)} mm wide and ${String(insert)} mm deep, and an M3 set screw cuts its own thread in the ${String(KNOB.setScrew)} mm hole on the side away from the pointer`;
  return {
    body,
    fresh: true,
    steps: knobSteps(spec),
    text:
      `Built the knob "${body}" ${hold}. It is ${String(spec.diameter)} mm wide and ${String(spec.height)} mm high, with ${String(knobFlutes(spec.diameter))} flutes to grip and a groove on its top as the pointer. ` +
      `It prints standing on its top, the bore open upwards, without support (its print face is set). No knob of these sizes has been printed yet: when it sits too tight or too loose, build it again with another clearance.`,
  };
}

function jsonOf(result: ToolResult): unknown {
  const text = result.content.find((part) => part.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('SolidCraft gave no answer');
  if (!result.isError) return JSON.parse(text) as unknown;
  // A batch that is taken back answers its failure as an error: say which command, not the whole reply.
  let failed: { command?: unknown; error?: unknown } | undefined;
  try {
    failed = (JSON.parse(text) as { failed?: { command?: unknown; error?: unknown } }).failed;
  } catch {
    failed = undefined;
  }
  throw new Error(failed ? `SolidCraft refused ${String(failed.command)}: ${String(failed.error).slice(0, 300)}` : text.slice(0, 300));
}

/**
 * The way a hole went into the body, from what `inspect.measure` says before and after it: the plastic it took lies
 * on its axis, so its centre of mass lies straight under the point. SolidCraft's answer to `solid.hole` names no
 * direction, and these blocks are given none. One hole at a time: two holes that take unequal amounts (a stepped
 * plate, a pocket under one of them) have no common centre under the middle of their points. Null when it cannot
 * be told. Measured 2026-11-12: SolidCraft gives the centre of mass with all the digits of a double, and on a block
 * of 200 × 200 × 50 mm the axis of one M3 seat came out within a hundredth of a degree.
 */
export function cutAxis(body: string, before: unknown, after: unknown, point: Vec3): Vec3 | null {
  const of = (measured: unknown) => (measured as { bodies?: { name?: unknown; volume_mm3?: unknown; center_of_mass?: unknown }[] } | undefined)?.bodies?.find((entry) => entry.name === body);
  const [was, is] = [of(before), of(after)];
  const [from, to] = [vec3(was?.center_of_mass), vec3(is?.center_of_mass)];
  const [full, left] = [was?.volume_mm3, is?.volume_mm3];
  if (typeof full !== 'number' || typeof left !== 'number' || !from || !to) return null;
  const taken = full - left;
  if (!(taken > 1e-6)) return null;
  const way = from.map((value, k) => (value * full - (to[k] ?? 0) * left) / taken - (point[k] ?? 0)) as Vec3;
  const length = Math.hypot(...way);
  // Nearer to the point than a tenth of a millimetre, the direction is noise.
  return length > 0.1 ? (way.map((value) => Math.round((value / length) * 1e6) / 1e6 + 0) as Vec3) : null;
}

/** Volume in mm³ of every body by name as `inspect.measure` answers; NaN for a body that is not closed. */
function volumesOf(measured: unknown): Map<string, number> {
  const bodies = (measured as { bodies?: { name?: unknown; volume_mm3?: unknown }[] } | undefined)?.bodies ?? [];
  return new Map(bodies.flatMap((entry) => (typeof entry.name === 'string' ? [[entry.name, typeof entry.volume_mm3 === 'number' ? entry.volume_mm3 : NaN] as const] : [])));
}

/** Why a block would not land on the body it names, from the volumes before and after a trial; null when it does. */
export function misplaced(body: string, before: Map<string, number>, after: Map<string, number>): string | null {
  if (!before.has(body)) return `there is no body named ${body}; the design has ${[...before.keys()].join(', ') || 'no body'}`;
  // SolidCraft makes each loose piece a body of its own (seen with 0.40.1: "Strip" and "Strip (1)").
  const pieces = [...after.keys()].filter((name) => !before.has(name));
  if (pieces.length > 0) return `it would leave ${String(pieces.length + 1)} bodies where ${body} was one (${pieces.join(', ')}): the cut goes right through the part there. Give a point with more plastic round it, or a smaller size`;
  const changed = (name: string) => Math.abs((after.get(name) ?? 0) - (before.get(name) ?? 0)) > 1e-6;
  const others = [...new Set([...before.keys(), ...after.keys()])].filter((name) => name !== body && changed(name));
  if (others.length > 0) return `at this point it would change ${others.join(', ')}, not only ${body}; give a point on a face of ${body} alone, away from other bodies`;
  if (Number.isFinite(before.get(body)) && !changed(body)) return `it would change nothing on ${body}: the point is not on a face of ${body}`;
  return null;
}

/**
 * mm³ a seat may cut less than its cylinder on a flat face: what is noise in the measure, not a face that falls away.
 * SolidCraft 0.40.1 gave cylinders wholly in a part as 1.0000000 of their volume (seven digits, {@link STOCK_FULL}), and
 * `taken` is the difference of two body volumes, good to about 1e-12 of the body in doubles; a seat on a rod of 20 mm
 * radius cut 0.9997 of its cylinder, three hundred times above the first.
 */
const cutNoise = (whole: number, body: number) => whole * 1e-6 + body * 1e-12;

/** The name of the bodies that measure the plastic at a block; they are never kept. */
const PROBE = 'PartBuddy probe';

/**
 * How much of a stock cylinder must be plastic. SolidCraft 0.40.1 measures the shared volume exactly, not on
 * facets: seven cylinders wholly inside a block, a rod and a ball, along the axes and askew, each gave 1.0000000
 * of their volume; one with 0.02 mm of its 2.8 mm outside gave 0.99286, one with 0.01 mm of its width over an edge
 * 0.99993 (tools/audit, r54-shares, 2026-11-12).
 */
export const STOCK_FULL = 0.999;

/**
 * How deep each cut of a block that cuts through must go to pass the wall at its point and no further (blocks.ts, audit
 * W2), found on trial; SolidCraft takes the trial back. Undefined when it could not be tried: the block is then built
 * as before, and what goes wrong with it is found after.
 */
export async function reachOf(upstream: UpstreamTools, block: FeatureBlock, wrap: (steps: Step[]) => Step[], callId: string | undefined): Promise<(number | null)[] | undefined> {
  const trial = wrap(throughTrial(block));
  try {
    const answer = await upstream.callTool('batch', { commands: [...trial, { command: 'sketch.inspect', params: { sketch: 2147483647 } }], rollback: true }, callId);
    const text = answer.content.find((part) => part.type === 'text')?.text;
    const reply = JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[]; failed?: { index?: unknown } };
    if (reply.failed?.index !== trial.length) return undefined;
    return throughReach(block, reply.results?.[trial.map((step) => step.command).lastIndexOf('inspect.measure')]);
  } catch {
    return undefined;
  }
}

/**
 * Where the body has less plastic than a block's cuts need (audit R54): each stock cylinder is laid in as a body
 * on trial and SolidCraft says how much of it lies in the part. A step that must fail ends the batch, and
 * SolidCraft takes the probes back, leaving revision, undo and redo as they were (as mechanismTool.ts measures a
 * hinge line). Null when all of it is plastic; `undefined` when it could not be measured. `fallen` is told the mm³ of
 * wall that a curved face took and that were allowed.
 */
export async function shortOf(upstream: UpstreamTools, body: string, stock: Stock[], callId: string | undefined, fallen: (mm3: number) => void = () => undefined): Promise<string | null | undefined> {
  try {
    // Each stock cylinder, and where a hole is cut in it already a cylinder as wide as the hole (`core`) as well: the two apart
    // are the wall round the hole and what lies under it.
    const probes = stock.flatMap((room, i) => [{ width: room.diameter, name: `${PROBE} ${String(i)}` }, ...(room.core ? [{ width: room.core, name: `${PROBE} ${String(i)} core` }] : [])].map((probe) => ({ ...probe, room })));
    const answer = await upstream.callTool(
      'batch',
      {
        commands: [
          ...probes.flatMap(({ room, width, name }) => [
            { command: 'solid.cylinder', params: { diameter: `${String(width)} mm`, height: `${String(room.depth)} mm`, base: room.base, axis: room.axis, operation: 'new', body_name: name } },
            { command: 'inspect.interference', params: { bodies: [body, name] } },
          ]),
          { command: 'sketch.inspect', params: { sketch: 2147483647 } },
        ],
        rollback: true,
      },
      callId,
    );
    const text = answer.content.find((part) => part.type === 'text')?.text;
    const results = (JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[] }).results;
    if (!Array.isArray(results) || results.length < probes.length * 2) return undefined;
    // The plastic in each probe and its centre (null when SolidCraft gives none).
    const measured = probes.map((_, k) => {
      const found = (results[k * 2 + 1] as { interferences?: { volume_mm3?: unknown; center?: unknown; centre?: unknown }[] } | undefined)?.interferences;
      if (!Array.isArray(found)) return { volume: NaN, centre: null };
      const parts = found.map((pair) => ({ volume: typeof pair.volume_mm3 === 'number' ? pair.volume_mm3 : 0, centre: vec3(pair.center ?? pair.centre) }));
      const volume = parts.reduce((sum, part) => sum + part.volume, 0);
      const centre = parts.every((part) => part.centre || part.volume === 0) && volume > 0 ? ([0, 1, 2].map((i) => parts.reduce((sum, part) => sum + part.volume * (part.centre?.[i] ?? 0), 0) / volume) as Vec3) : null;
      return { volume, centre };
    });
    if (measured.some((probe) => Number.isNaN(probe.volume))) return undefined;
    const area = (width: number) => (Math.PI * width ** 2) / 4;
    let k = 0;
    for (const room of stock) {
      const outer = measured[k++] ?? { volume: NaN, centre: null };
      const inner = room.core ? (measured[k++] ?? { volume: NaN, centre: null }) : { volume: 0, centre: null };
      const [whole, core] = [outer.volume, inner.volume];
      if (room.core && room.slack) {
        // A face that falls away evenly round the hole takes the top of the wall all round, as the slack of a curved face
        // let it before (review 4 of PR #357); the wall and what lies under the hole then share that slack.
        const full = { ring: (area(room.diameter) - area(room.core)) * room.depth, core: area(room.core) * room.depth - (room.hole ?? 0) };
        const missing = { ring: full.ring - (whole - core), core: full.core - core };
        const shape = missing.ring > full.ring * (1 - STOCK_FULL) ? wallShape(room, outer, inner, full.ring, missing.ring) : null;
        if (shape && curvedWall(missing.ring, shape.off, shape.down, room.core / 2, room.diameter / 2, room.depth) && missing.ring + missing.core <= (full.ring + full.core) * (1 - STOCK_FULL) + room.slack) {
          fallen(missing.ring);
          continue;
        }
      }
      // The wall round the hole (all of the cylinder where nothing is cut yet), then what lies under the hole.
      const parts = room.core
        ? [
            { plastic: whole - core, full: (area(room.diameter) - area(room.core)) * room.depth, slack: 0, over: `a ring from ${String(room.core)} to ${String(room.diameter)} mm wide`, by: 'the far side, an edge, a face that falls away to one side or another cut' },
            { plastic: core, full: area(room.core) * room.depth - (room.hole ?? 0), slack: room.slack ?? 0, over: `a width of ${String(room.core)} mm, under the hole` },
          ]
        : [{ plastic: whole, full: area(room.diameter) * room.depth - (room.hole ?? 0), slack: room.slack ?? 0, over: `a width of ${String(room.diameter)} mm` }];
      for (const { plastic, full, slack, over, by = 'the far side, an edge or another cut' } of parts as { plastic: number; full: number; slack: number; over: string; by?: string }[]) {
        if (plastic >= full * STOCK_FULL - slack) continue;
        // The cylinder starts under the face: with none of it in the part, all that is known is that the part ends above it.
        const has = plastic < full * 0.001 ? `less than ${String(room.from)}` : String(Math.round((room.from + (room.depth * plastic) / full) * 100) / 100);
        return `at [${room.at.join(', ')}] ${body} has ${has} mm of plastic where ${String(Math.round((room.from + room.depth) * 100) / 100)} mm are needed (the mean over ${over}; ${by} takes the rest)`;
      }
    }
    return null;
  } catch {
    return undefined;
  }
}

/**
 * Where what is missing of the wall round a hole lies: `off` the axis and `down` from the start of the stock, in mm,
 * from the centres SolidCraft gives of the plastic in the stock cylinder and in the hole's; null without them.
 */
function wallShape(room: Stock, outer: { volume: number; centre: Vec3 | null }, inner: { volume: number; centre: Vec3 | null }, full: number, missing: number): { off: number; down: number } | null {
  if (!outer.centre || (inner.volume > 0 && !inner.centre) || !(missing > 0)) return null;
  const length = Math.hypot(...room.axis);
  const axis = room.axis.map((value) => value / length) as Vec3;
  // The full wall is a ring round the axis: its centre lies on the axis, half its depth down.
  const whole = room.base.map((value, i) => value + (axis[i] ?? 0) * (room.depth / 2));
  const at = [0, 1, 2].map((i) => ((whole[i] ?? 0) * full - ((outer.centre?.[i] ?? 0) * outer.volume - (inner.centre?.[i] ?? 0) * inner.volume)) / missing - (room.base[i] ?? 0));
  const down = at.reduce((sum, value, i) => sum + value * (axis[i] ?? 0), 0);
  return { off: Math.hypot(...at.map((value, i) => value - down * (axis[i] ?? 0))), down };
}

/**
 * mm³ and depth of the centre (under the start of the stock) of what a face falling k·q² at q from the point takes of a
 * ring of stock: q across a rod (`rod`) or from the point on a ball. Summed over a polar grid.
 */
function curvedLoss(k: number, inner: number, outer: number, depth: number, rod: boolean): { volume: number; down: number } {
  const [n, m] = [40, 72];
  let [volume, moment] = [0, 0];
  for (let i = 0; i < n; i += 1) {
    const r = inner + ((i + 0.5) * (outer - inner)) / n;
    for (let j = 0; j < m; j += 1) {
      const q = rod ? r * Math.abs(Math.cos(((j + 0.5) * 2 * Math.PI) / m)) : r;
      const lost = Math.min(depth, Math.max(0, k * q * q - FACE_DROP));
      volume += lost * r;
      moment += ((lost * lost) / 2) * r;
    }
  }
  const cell = ((outer - inner) / n) * ((2 * Math.PI) / m);
  return { volume: volume * cell, down: volume > 0 ? moment / volume : 0 };
}

/**
 * Whether `missing` mm³ of the wall round a hole, centred `off` the axis and `down` under the start of the stock, are what
 * a curved face takes: one that falls away all round the point, as a rod, a ball, a cone or a torus does, takes the top
 * of the ring all round, and the centre of that lies near the axis (on a cone it leans towards the apex: 0.65 mm for M3 at
 * 45°, 1.2 mm at 60°; review 6 of PR #357). An edge or a chamfer that leaves the hole whole takes the ring beyond the
 * hole's rim on one side, so the centre of that lies further out. A rib too narrow on both sides takes the ring all the way
 * down (deeper than a curved face that takes as much).
 */
export function curvedWall(missing: number, off: number, down: number, inner: number, outer: number, depth: number): boolean {
  // shortcut: the centre does not tell a cone from a curve with a gentle chamfer to one side, whose even part pulls the
  // centre in; 0.6 of the hole's half width lets cones to 60° through and keeps a chamfer at 0.3 just past the rim of an M3
  // on a rod of 8 mm out (review 7 of PR #357), not every such mix. Upgrade: a probe on the far side, as a curve takes
  // plastic there too and a chamfer does not.
  if (off > 0.6 * inner) return false;
  return [true, false].some((rod) => {
    let [low, high] = [0, (FACE_DROP + depth) / inner ** 2];
    for (let step = 0; step < 20 && curvedLoss(high, inner, outer, depth, rod).volume < missing; step += 1) high *= 2;
    if (curvedLoss(high, inner, outer, depth, rod).volume < missing) return false;
    for (let step = 0; step < 40; step += 1) {
      const k = (low + high) / 2;
      if (curvedLoss(k, inner, outer, depth, rod).volume < missing) low = k;
      else high = k;
    }
    // Half again as deep as the model, and 0.05 mm, for a face that is no paraboloid.
    return down <= curvedLoss(high, inner, outer, depth, rod).down * 1.5 + 0.05;
  });
}

/**
 * How far a block's cut without depth went (audit W2): through the wall at each point as measured on trial, or, when that
 * could not be measured or the model asked for it, through all of the body on its line.
 */
function reachSaid(block: FeatureBlock, reach: (number | null)[] | undefined): string {
  const all = ` through all of ${block.body} on its line`;
  // A depth given is how deep it goes, whatever `through` says.
  if ('depth' in block && block.depth && block.block !== 'nutTrap') return '';
  if ('through' in block && block.through === 'body') return ` It goes${all}.`;
  if (!cutsThrough(block)) return '';
  if (reach?.every((value) => value !== null))
    return ` It goes through the wall at ${reach.length > 1 ? 'each point' : 'the point'} and up to a millimetre past it, as measured on trial (${reach.map(String).join(', ')} mm from the face), not on through a far wall; give through body to go through all of ${block.body}.`;
  // Undefined: SolidCraft refused the trial or it failed; a null: no plastic of the body at that point.
  const why = reach ? `no plastic of ${block.body} lies within ${String(ON_FACE)} mm of ${reach.length > 1 ? 'some of the points' : 'the point'}, so its wall could not be measured` : 'SolidCraft could not run the trial that measures the wall';
  return ` ${why.charAt(0).toUpperCase()}${why.slice(1)}: it went${all}, far walls too; check it, and give depth where it must stop sooner.`;
}

/** What was built, with the sizes it took from the tables, for the model to tell the user. */
function built(block: FeatureBlock): string {
  const { block: kind, body, point, ...sizes } = block;
  const listed = Object.entries(sizes)
    .filter(([key, value]) => key !== 'normal' && key !== 'more' && value !== undefined && value !== null)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(', ');
  const count = 'more' in block && block.more ? block.more.length + 1 : 1;
  return `Built ${count > 1 ? `${String(count)} × ` : ''}${kind} on ${body} at [${point.join(', ')}]: ${listed}.`;
}

/** The upstream tools plus `partbuddy_block`. */
export function withBlockTool(upstream: UpstreamTools, keepFace: (body: string, face: string) => void = () => undefined, log: (line: string) => void = () => undefined): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), blockTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== BLOCK_TOOL) return upstream.callTool(name, args, callId);
      const wall = wallOf(args) ?? knobOf(args) ?? magnetOf(args);
      if (typeof wall === 'string') return { content: [{ type: 'text', text: `Not built: ${wall}` }], isError: true };
      const block = wall ? null : blockOf(args);
      if (typeof block === 'string') return { content: [{ type: 'text', text: `Not built: ${block}` }], isError: true };
      try {
        const run = async (commands: { command: string; params: Record<string, unknown> }[], rollback = false) => {
          const reply = jsonOf(await upstream.callTool('batch', { commands, ...(rollback ? { rollback } : {}) }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
          if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 300)}`);
          return reply.results ?? [];
        };
        // A sketch belongs to the component of its body: built with that component active, the block moves with the body.
        const steps = wall ? wall.steps : block ? stepsOf(block) : [];
        const body = wall ? wall.body : (block?.body ?? '');
        const [listing] = steps.some((step) => step.command === 'sketch.create') ? await run([{ command: 'component.list', params: {} }]) : [undefined];
        const component = listing === undefined ? 0 : componentOf(listing, body);
        // A new part must not take the name of a body there is: its cuts would go into that one.
        const taken = ((listing as { components?: { bodies?: unknown }[] } | undefined)?.components ?? []).some((entry) => Array.isArray(entry.bodies) && entry.bodies.includes(body));
        if (wall && 'fresh' in wall && taken) return { content: [{ type: 'text', text: `Not built: there is a body named ${body} already; give the knob another name` }], isError: true };
        const wrap = (inner: Step[]) => (component === 0 ? inner : [{ command: 'component.activate', params: { component } }, ...inner, { command: 'component.activate', params: { component: 0 } }]);
        const fresh = wall !== null && 'fresh' in wall;
        const measure = { command: 'inspect.measure', params: {} };
        const [measured] = await run([measure]);
        const before = volumesOf(measured);
        const missing = fresh ? null : misplaced(body, before, before);
        if (missing?.startsWith('there is no body')) return { content: [{ type: 'text', text: `Not built: ${missing}` }], isError: true };
        // A cut "through" goes through the wall at its point, not on through the far side of a hollow part (audit W2).
        const reach = block && cutsThrough(block) ? await reachOf(upstream, block, wrap, callId) : undefined;
        const sequence = wrap(block && reach ? stepsOf(block, undefined, reach) : steps);
        // A pocket that comes out of the far side or of an edge is not built at all.
        const { stock, cut, need } = (wall ?? {}) as { stock?: Stock[]; cut?: (point: Vec3, axis: Vec3) => Stock; need?: string };
        const short = stock ? await shortOf(upstream, body, stock, callId) : null;
        if (short) return { content: [{ type: 'text', text: `Not built: ${short}; ${need ?? ''}.` }], isError: true };
        // Holes that are given no direction are measured once they are cut, each along the way it went in.
        const holes: { points: Vec3[]; stock: (point: Vec3, axis: Vec3, curved: boolean) => Stock; whole?: number; drop?: number; need: string } | null =
          block?.block === 'insertSeat'
            ? {
                points: [block.point, ...(block.more ?? [])],
                stock: (point, axis, curved) => seatStock(block, point, axis, curved),
                whole: ((Math.PI * block.diameter ** 2) / 4) * block.depth,
                drop: rimDrop(block.diameter, block.diameter + 2 * seatWall(block.size)),
                need: `the seat of an ${block.size} insert needs ${String(seatWall(block.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it. Thicken the part there, move the seat away from edges and other cuts, or use a boss`,
              }
            : cut && need
              ? { points: [vec3(args.point) ?? [0, 0, 0], ...(Array.isArray(args.more) ? args.more.flatMap((entry) => { const point = vec3(entry); return point ? [point] : []; }) : [])], stock: cut, need }
              : null;
        // The design before the block, to take it back to.
        const mark = await markOf(run);
        let results: unknown[];
        let after: boolean | null = null;
        let lenient = 0;
        let fell = 0;
        // One hole a step, measured after each: every hole has its own way in, also on a stepped part or on two faces.
        const sent = holes ? sequence.flatMap((step) => [step, measure]) : [...sequence, measure];
        try {
          results = await run(sent);
          // The point decides what SolidCraft cuts, so the named body is checked before the block stays.
          const wrong = fresh ? null : misplaced(body, before, volumesOf(results[results.length - 1]));
          if (wrong) throw new Error(wrong);
          if (holes) {
            const stocks: Stock[] = [];
            for (const [i, point] of holes.points.entries()) {
              const [was, is] = [i === 0 ? measured : results[i * 2 - 1], results[i * 2 + 1]];
              const taken = (volumesOf(was).get(body) ?? NaN) - (volumesOf(is).get(body) ?? NaN);
              // A seat is cut out of solid plastic: where its rim breaks out of the face it takes less than its cylinder.
              if (holes.whole && taken < holes.whole * STOCK_FULL - (holes.drop ?? 0))
                throw new Error(
                  `at [${point.join(', ')}] the seat would cut ${String(Math.round(taken * 10) / 10)} mm³ of plastic where its whole cylinder is ${String(Math.round(holes.whole * 10) / 10)} mm³: its rim breaks out of the face, into an edge, a chamfer, the far side or another cut; ${holes.need}. If a hole is there already at that point (a pilot hole), it counts as missing plastic too: delete that hole's feature and build the seat in its place.`,
                );
              const axis = cutAxis(body, was, is, point);
              if (axis) stocks.push(holes.stock(point, axis, holes.whole !== undefined && taken < holes.whole - cutNoise(holes.whole, volumesOf(was).get(body) ?? 0)));
            }
            const thin = stocks.length === holes.points.length ? await shortOf(upstream, body, stocks, callId, (mm3) => (fell = Math.max(fell, mm3))) : undefined;
            if (thin) throw new Error(`${thin}; ${holes.need}.`);
            after = thin === null;
            lenient = Math.max(0, ...stocks.map((room) => room.slack ?? 0));
          }
        } catch (cause) {
          // Nothing of a block that failed half way, landed on another body or found too little plastic stays. (A batch with
          // `rollback` or a checkpoint is no way back in SolidCraft 0.40.1: after the one the same modelled thread fails for
          // real, and the other is gone once a batch has run.)
          const taken = await takeBack(run, mark);
          if (taken !== 'back') {
            log(`partbuddy_block ${String(args.block)} on ${body} could not be taken back (${taken}) after: ${(cause as Error).message.slice(0, 200)}`);
            throw new Error(`${(cause as Error).message.replace(/\.$/, '')}. ${TAKEN_BACK_SAID[taken]}`, { cause });
          }
          throw cause;
        }
        // The plate view lays the part on the face SolidCraft names (print-faces.json), as the slicer will.
        const face = results.map((result) => (result as { face?: unknown } | undefined)?.face).find((entry) => typeof entry === 'string');
        if (face) keepFace(body, face);
        const warnings = results.flatMap((result) => {
          const warning = (result as { warning?: unknown } | undefined)?.warning;
          return typeof warning === 'string' ? [warning.slice(0, 200)] : [];
        });
        // What was measured is said as it was measured, and what was not is said too, never passed over.
        const unmeasured = ' PartBuddy could not measure that plastic this time: check it yourself.';
        const under = `from ${String(FACE_DROP)} mm under the face on`;
        const stockSaid = stock
          ? short === null
            ? ` PartBuddy measured that plastic before building, ${under}: it is there.`
            : unmeasured
          : holes
            ? after
              ? ` PartBuddy measured that plastic, ${under}${holes.whole ? ', and that each seat cut its whole cylinder' : ''}: it is there.${fell > 0 ? fallenSaid(fell, lenient) : lenient > 0 ? lenientSaid(lenient) : ''}`
              : unmeasured
            : '';
        const said = (wall ? wall.text : block ? built(block) + reachSaid(block, reach) : '') + (block?.block === 'insertSeat' ? ` Each seat needs ${String(seatWall(block.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it.` : '');
        return { content: [{ type: 'text', text: `${said}${stockSaid}${warnings.length > 0 ? ` SolidCraft warns: ${warnings.join(' ')}` : ''}` }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route. */
export const BLOCK_GUIDANCE = `For a screw hole, a tapped hole, the seat of a heat-set insert, a nut trap, a screw boss, a slot, text, a lid's lip or a snap hook on one body call ${BLOCK_TOOL} instead of drilling or modelling it yourself: it takes clearance, head, nut and insert sizes from the standard tables. For a part that hangs on a wall use its keyhole (hung over screws in the wall) or woodScrew (screwed on through countersunk holes) blocks, two of them level for anything wider than 60 mm. For parts held by magnets (a lid, a tool holder, a sign) use its magnet block for each pocket instead of drilling a hole of the magnet's size; ask for the magnet's diameter and height when the user has not said. For a knob on a potentiometer, an encoder or any other shaft use its knob block, which makes the knob as a part of its own; ask for the shaft (D, knurled or round, and its diameter) when the user has not said.`;
