import { BRIDGE_SPAN, minimumFloor, minimumWall } from '@partbuddy/geometry';

import { BLOCK_SIZES, DEFAULT_PRINTER, nutCorners, nutFlatsOfFit, ENTRY_CHAMFER, INSERT, ON_FACE, blockLimit, bossFillet, limitSaid, raisedBlock, snapRoot, TEXT_STROKE, cutsThrough, strokesKnown, defaultBlock, hasSize, needsNormal, sizesOf, snapStrain, stepsOf, tapDrill, textDepth, textStroke, throughReach, throughTrial, throughWall, type BlockSize, type FeatureBlock } from '../../shared/blocks';
import { featureBlockSchema } from '../../shared/contract';
import type { FitPrinter } from '../../shared/designFit';
import { CLEARANCE, NUT, NUT_DIN_FLATS, THREAD_ALLOWANCE, headRoom, pilotHole, printedThread, screwDiameter } from '../../shared/screwSizes';
import { drawnHole, fitClearance, heldSaid, holeRoom, unmeasuredSaid, type ToolPrinter } from '../../shared/toolFit';
import { KNOB, knobClearance, KNOB_CLEARANCE_MOST, KNOB_SHAFTS, knobFlat, knobFlutes, knobInsert, knobProblem, knobSteps, type KnobShaft } from '../../shared/knob';
import { SNAP_OFTEN, TAPPED_FROM, limitWords, snapLimit, standsUpright, uprightSaid } from '../../shared/mechanisms';
import { MAGNET, MAGNET_HOLDS, MAGNET_MORE, PRESS_INTERFERENCE, PRESS_RANGE, magnetPocket, magnetRoom, magnetProblem, magnetSteps, magnetStock, type MagnetHold } from '../../shared/magnet';
import { KEYHOLE, WALL, WALL_MORE, WOOD_SCREWS, WOOD_SCREW_UNDER, countersinkDepth, keyholeDepth, keyholeProblem, keyholeRoof, ROOF_LEAN, keyholeSteps, keyholeStock, wallSizes, woodScrewSteps, woodScrewStock, type WoodScrew } from '../../shared/wallMount';
import { componentOf } from '../solidcraft/actions';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { ASK_TOOL } from './questions';
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
    'screwHole (clearance hole for a screw, with a counterbore for a socket head, a countersink, or plain), tappedHole (a modelled thread with room for printing, from M5), ' +
    'insertSeat (the seat of a heat-set insert, M2 to M6), nutTrap (a hexagonal pocket with its clearance hole), boss (a screw boss with an insert seat, standing on the face), ' +
    'slot (a slot for a screw, to adjust), text (embossed or engraved), lip (a lip or a groove on the rim of a shelled body), snapFit (a cantilever snap hook standing on the face). ' +
    'To hang a part on a wall: keyhole (a keyhole slot on the face against the wall, over a screw already in the wall; point is where the screw rests, normal points to the wall, up is the way up as the part hangs) ' +
    'or woodScrew (a countersunk hole for a wood screw, at a point of the face away from the wall); screw is the wood screw in mm, needed. ' +
    "To hold with magnets: magnet (a pocket for a disc magnet at a point of a face, normal out of that face; diameter and height are the magnet's as the user measured them, needed; hold glue to drop it in on a drop of glue, press to press it in). " +
    "A knob for a shaft is a part of its own: knob (body is the new body's name, point the centre of its underside where the shaft goes in, normal the way the shaft points, up the way its pointer points; shaft, needed: d for a potentiometer's or encoder's D shaft, knurl for a split knurled one, round for a plain shaft with a set screw; shaftDiameter, needed). " +
    'Sizes of holes, slots and pockets are the sizes they come out at: PartBuddy draws them wider by the hole allowance of the material in use, and takes the room of a fit from its profile; do not add either yourself (an insert\'s seat is drawn at its maker\'s size). ' +
    'Give only what differs from the standard; everything else is filled in. A field a block does not take is refused, not passed over, and so is a size that does not print on the nozzle of the printer in use. ' +
    'For two parts screwed together use partbuddy_mechanism with kind screw instead, which makes both holes on one line.',
  inputSchema: {
    type: 'object',
    properties: {
      block: { type: 'string', enum: [...ASSISTANT_BLOCKS, ...WALL_BLOCKS, ...PART_BLOCKS] },
      body: { type: 'string', description: 'The body (exact name); for knob the name of the new body.' },
      point: { ...vector, description: 'A point on the flat face the block goes at, in mm: the centre of the hole, the foot of the boss, the middle of the text.' },
      normal: {
        ...vector,
        description:
          'The way out of that face; needed for nutTrap, slot, text, snapFit, keyhole and magnet. knob: the way the shaft points, default +Z. screwHole, tappedHole, insertSeat, boss, lip and woodScrew go square into the face at the point and do not use it.',
      },
      up: { ...vector, description: 'keyhole: the way up as the part hangs, along the face; default +Z. knob: the way its pointer points, across the shaft; default +Y.' },
      screw: { type: 'number', enum: [...WOOD_SCREWS], description: 'keyhole, woodScrew: the wood screw, its thread diameter in mm; needed.' },
      size: { type: 'string', enum: [...BLOCK_SIZES], description: 'The screw; default M3. Not used by text, lip and snapFit; keyhole, woodScrew, magnet and knob take none.' },
      more: {
        type: 'array',
        items: vector,
        maxItems: 99,
        description: `screwHole, tappedHole, insertSeat, keyhole, woodScrew, magnet: further points on the same face, one each; up to 99, for magnet ${String(MAGNET_MORE)}, for keyhole and woodScrew ${String(WALL_MORE)}.`,
      },
      name: {
        type: 'string',
        maxLength: 100,
        description: "screwHole, tappedHole, insertSeat, nutTrap, slot, keyhole, woodScrew, magnet: the name of its features in the timeline, in the user's language; several holes get a number each.",
      },
      head: { type: 'string', enum: ['none', 'cap', 'countersunk'], description: 'screwHole: the room for the head; default cap (a counterbore).' },
      fit: { type: 'string', enum: ['close', 'normal', 'loose'], description: 'screwHole: the clearance hole by ISO 273 (fine, medium, coarse), from PartBuddy\'s table; default normal. close only from M6: below, a printed hole loses the little room it leaves.' },
      depth: { type: 'number', description: 'tappedHole, insertSeat, nutTrap, slot, text: depth in mm; default by the block (a slot and a tapped hole go through, see through).' },
      through: {
        type: 'string',
        enum: ['wall', 'body'],
        description:
          'screwHole, tappedHole and slot without depth, and the hole of a nutTrap: how far they go. wall (default): through the wall at the point and no further, so a hole in the side of a hollow box leaves the far side whole. body: through all of the body on its line, as through both cheeks of a fork, a clevis or a hinge block with a gap between.',
      },
      diameter: { type: 'number', description: 'insertSeat: the hole for the insert, the maker\'s size for printed parts (drawn as given); boss: its outer diameter; knob: its outer diameter, default 25; magnet: the diameter of the magnet, needed. Default from the table.' },
      height: { type: 'number', description: 'boss: its height; text: the height of its capitals, default 7; lip: its height; knob: its height, default 16; magnet: the height of the magnet, needed. Default by the block.' },
      length: { type: 'number', description: 'slot: the distance between the centres of its round ends, which is how far the screw can travel; the slot is its width longer; default 10. snapFit: the length of the arm, default 12 mm, longer where the nozzle and the material in use need it; an arm that bends more at its root than the material takes is refused, with the length it needs.' },
      width: { type: 'number', description: 'slot, lip, snapFit: width in mm. Default by the block.' },
      along: { type: 'string', enum: ['x', 'y'], description: "slot: along the face's first or second direction." },
      text: { type: 'string', maxLength: 80, description: 'text: the words.' },
      mode: { type: 'string', enum: ['emboss', 'deboss'], description: 'text: raised or engraved; default engraved.' },
      type: { type: 'string', enum: ['lip', 'groove'], description: 'lip: a lip, or the groove that takes one.' },
      hold: { type: 'string', enum: [...MAGNET_HOLDS], description: `magnet: glued in (the material's push fit, the default: ${String(magnetRoom('glue', DEFAULT_PRINTER))} mm of room in PLA) or pressed in (the pocket ${String(PRESS_INTERFERENCE)} mm under the magnet as printed).` },
      shaft: { type: 'string', enum: [...KNOB_SHAFTS], description: 'knob: the shaft it goes on; needed.' },
      shaftDiameter: { type: 'number', description: 'knob: the diameter of the shaft in mm; needed.' },
      flat: { type: 'number', description: 'knob on a D shaft: the thickness of the shaft at its flat in mm; 4.5 on a 6 mm shaft, to be measured on any other.' },
      clearance: { type: 'number', description: `knob: added to the shaft's diameter in mm, as printed; default the material's clamp fit on both sides (${String(knobClearance('d', DEFAULT_PRINTER))} in PLA; 0 for knurl). More when the printed knob sits too tight.` },
      hook: { type: 'string', enum: ['x+', 'x-', 'y+', 'y-'], description: "snapFit: the way the catch points, along the face's directions." },
      thickness: { type: 'number', description: 'snapFit: the thickness of the arm, default 1.5 (two lines at the least).' },
      catchDepth: { type: 'number', description: 'snapFit: how far the catch stands out, default 0.8.' },
      catchLength: { type: 'number', description: 'snapFit: the length of the catch along the arm, default 1.5.' },
      flats: { type: 'number', description: `nutTrap: the pocket across its flats as printed; default the nut's plus the material's push fit on both sides (${String(2 * fitClearance('push', DEFAULT_PRINTER))} mm in PLA).` },
      gap: { type: 'number', description: `lip with type groove: the room beside the lip, default the material's slide fit (${String(fitClearance('slide', DEFAULT_PRINTER))} in PLA).` },
      bold: { type: 'boolean', description: 'text: bold (the default) or not; not bold needs taller capitals.' },
      modeled: { type: 'boolean', description: 'tappedHole: the thread cut into the wall (the default) or only listed.' },
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

/**
 * The thinnest plastic under a pocket or engraved text: two lines (a wall) or four layers (a floor), whichever is more.
 * The block cannot know which way the part will lie: under a pocket that opens upwards it is a floor, under one that opens
 * sideways a wall (printCheck.ts).
 */
export const leastFloor = (printer: FitPrinter) => Math.max(minimumWall(printer.nozzle), minimumFloor(printer.layer));
const mm = (value: number) => String(Math.round(value * 100) / 100);
const on = (printer: FitPrinter) => `on a ${String(printer.nozzle)} mm nozzle`;
/** Which of the two {@link leastFloor} takes, said: two lines of wall, or a floor of four layers and at least 0.8 mm. */
const floorWhy = (printer: FitPrinter) =>
  minimumWall(printer.nozzle) >= minimumFloor(printer.layer) ? `two lines ${on(printer)}` : `a floor of four ${String(printer.layer)} mm layers, at least 0.8 mm`;

/** Why a size of a block does not print on the printer, in English; null when all do. The form checks the same (index.ts, BlockPanel.tsx). */
export const printLimit = (block: FeatureBlock, printer: FitPrinter): string | null => {
  const limit = blockLimit(block, printer);
  return limit ? limitSaid(limit) : null;
};

/**
 * What the model is told of a snap fit's strain, against what the profile's material takes (audit T18, R56, R41): over it the
 * block is refused (blockLimit), as in the form; the root's radius, and which way the arm bends in the layers.
 */
const strainSaid = (block: Extract<FeatureBlock, { block: 'snapFit' }>, printer: ToolPrinter) => {
  const strain = snapStrain(block);
  const limit = snapLimit(printer.material);
  const often = strain > limit.often ? ` For a part taken apart often keep under ${String(limit.often)} % (${String(Math.round(SNAP_OFTEN * 100))} % of that, Bayer): make the arm longer or thinner, or the catch shallower.` : '';
  const upright = standsUpright(block.normal) ? 'As designed it stands upright: where the part allows, lay the part so that the arm lies flat.' : 'Keep the part lying as designed, with the arm flat.';
  return ` The arm bends ${mm(strain)} % at its root as the catch snaps in, within the ${limitWords(limit)}.${often} It meets the face in a radius of up to ${mm(snapRoot(block))} mm on both sides, smaller where the face ends closer to it. ${uprightSaid('the arm', upright)}`;
};

/** The fields each block takes besides block, body and point (the blocks of the interface: the fields of their standard). */
const TAKES: Record<string, readonly string[]> = {
  keyhole: ['normal', 'up', 'screw', 'more', 'name'],
  woodScrew: ['normal', 'screw', 'more', 'name'],
  magnet: ['normal', 'more', 'diameter', 'height', 'hold', 'name'],
  knob: ['normal', 'up', 'shaft', 'shaftDiameter', 'flat', 'clearance', 'diameter', 'height'],
};
/** The blocks whose features take the name the model gives (SolidCraft names no lip, boss, snap fit or emboss). */
const NAMED = ['screwHole', 'tappedHole', 'insertSeat', 'nutTrap', 'slot'];

/** What the model gave that the block does not take, said so that it can call again (audit W30, R28); null when nothing. */
function unusedOf(args: Record<string, unknown>, takes: readonly string[]): string | null {
  const unused = Object.keys(args).filter((key) => args[key] !== undefined && !['block', 'body', 'point', ...takes].includes(key));
  return unused.length > 0 ? `${String(args.block)} takes no ${unused.join(', ')}; it takes ${takes.join(', ')}. Leave out what it does not take` : null;
}

/** A direction the model gave: three numbers that are not all zero; null otherwise. */
const direction = (value: unknown): Vec3 | null => {
  const v = vec3(value);
  return v && Math.hypot(...v) > 1e-9 ? v : null;
};

/**
 * The names of a block's features, each its own: the model's name on the cut, its sketch marked ✎, the hole under a nut
 * trap's pocket ● (as a hinge's pin), several holes numbered.
 */
export function named(steps: Step[], name: string | undefined): Step[] {
  if (!name) return steps;
  const holes = steps.filter((step) => step.command === 'solid.hole').length;
  const cut = steps.some((step) => step.command === 'solid.extrude');
  let n = 0;
  return steps.map((step) => {
    const own =
      step.command === 'sketch.create' ? `${name} ✎` : step.command === 'solid.extrude' ? name : step.command !== 'solid.hole' ? null : holes > 1 ? `${name} ${String((n += 1))}` : cut ? `${name} ●` : name;
    return own === null ? step : { ...step, params: { ...step.params, name: own } };
  });
}

/** The block the model asked for: the standard of its kind and size with what the model gave laid over it; or what is wrong. */
export function blockOf(args: Record<string, unknown>, printer: ToolPrinter = DEFAULT_PRINTER): FeatureBlock | string {
  const kind = args.block;
  if (typeof kind !== 'string' || !(ASSISTANT_BLOCKS as readonly string[]).includes(kind)) return `block must be one of ${[...ASSISTANT_BLOCKS, ...WALL_BLOCKS, ...PART_BLOCKS].join(', ')}`;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const normal = args.normal === undefined ? null : direction(args.normal);
  if (needsNormal(kind as AssistantBlock) && !normal) return `${kind} needs normal: the way out of the face, three numbers, not all zero`;
  if (args.name !== undefined && (typeof args.name !== 'string' || !args.name.trim() || args.name.length > 100)) return 'name must be the words to call its features, at most 100 characters';
  const size = (args.size ?? 'M3') as BlockSize;
  const head = args.head === 'countersunk' || args.head === 'none' ? args.head : 'cap';
  const sizes = sizesOf(kind as AssistantBlock, head);
  if (!sizes.includes(size)) return `${kind}${kind === 'screwHole' ? ` with head ${head}` : ''} has no size ${String(args.size)}; it has ${sizes.join(', ')}`;
  // One rule for a printed thread, here and in the screw joint (mechanisms.ts).
  if (kind === 'tappedHole' && Number(size.slice(1)) < TAPPED_FROM) return `a printed ${size} thread strips; use insertSeat (a heat-set insert) for ${size}, or tappedHole from M${String(TAPPED_FROM)}`;
  // The form's placeholder word is no text of the user's.
  if (kind === 'text' && (typeof args.text !== 'string' || !args.text.trim())) return 'text needs text: the words to write';
  const standard = defaultBlock(kind as AssistantBlock, body, point, size, normal ?? [0, 0, 1], printer);
  const hasMore = ['screwHole', 'tappedHole', 'insertSeat'].includes(kind);
  const hasThrough = ['screwHole', 'tappedHole', 'slot', 'nutTrap'].includes(kind);
  const takes = [...Object.keys(standard).filter((key) => !['block', 'body', 'point'].includes(key)), ...(needsNormal(kind as AssistantBlock) ? [] : ['normal']), ...(hasMore ? ['more'] : []), ...(hasThrough ? ['through'] : []), ...(NAMED.includes(kind) ? ['name'] : [])];
  const unused = unusedOf(args, takes);
  if (unused) return unused;
  // The fields of this kind are taken from the model; the schema then checks their values.
  const given = Object.fromEntries(Object.keys(standard).flatMap((key) => (key in args && !['block', 'body', 'point', 'normal', 'size'].includes(key) ? [[key, args[key]]] : [])));
  const more = args.more !== undefined && hasMore ? { more: args.more } : {};
  const through = args.through !== undefined && hasThrough ? { through: args.through } : {};
  const parsed = featureBlockSchema.safeParse({ ...standard, ...given, ...more, ...through });
  if (!parsed.success) return `${parsed.error.issues[0]?.path.join('.') ?? kind}: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
  // A standard size the printer cannot print (a wider nozzle) is raised to what it can; one the model gave is refused below.
  const { block } = raisedBlock(parsed.data, printer, Object.keys(given));
  return outOfTable(block) ?? printLimit(block, printer) ?? block;
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
  // Drawn as given (stepOf: the maker's hole, no allowance).
  const seat = block.diameter;
  const area = (Math.PI * seat ** 2) / 4;
  return {
    at: point,
    base: point.map((value, k) => round(value + (axis[k] ?? 0) * FACE_DROP)) as Vec3,
    axis,
    diameter: round(seat + 2 * seatWall(block.size)),
    depth: round(block.depth - FACE_DROP + SEAT_UNDER),
    from: FACE_DROP,
    hole: area * (block.depth - FACE_DROP),
    // A hair wider than the seat, so that no face of the probe lies on a face of the seat.
    core: round(seat + 0.02),
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
export function wallOf(args: Record<string, unknown>, printer: ToolPrinter = DEFAULT_PRINTER): { body: string; steps: Step[]; text: string; stock?: Stock[]; cut?: (point: Vec3, axis: Vec3) => Stock; need: string } | string | null {
  if (args.block !== 'keyhole' && args.block !== 'woodScrew') return null;
  const unused = unusedOf(args, TAKES[args.block] ?? []);
  if (unused) return unused;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  // The wood screw in the user's hand decides every size: none is assumed (audit R15).
  if (args.screw === undefined) return `${args.block} needs screw: the wood screw's thread diameter in mm (${WOOD_SCREWS.join(', ')}); ask the user with ${ASK_TOOL} if they did not say`;
  const screw = args.screw as WoodScrew;
  if (!(WOOD_SCREWS as readonly number[]).includes(screw)) return `screw must be one of ${WOOD_SCREWS.join(', ')} (mm, a wood screw)`;
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((entry) => entry === null)) return 'more must be a list of points, each three numbers';
  if (more.length > WALL_MORE) return `at most ${String(WALL_MORE)} further ${args.block === 'keyhole' ? 'keyholes' : 'holes'}`;
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 100) : null;
  const count = more.length + 1;
  // As printed; drawn the material's hole allowance wider (wallSizes, BC-16 review S3).
  const size = WALL[screw];
  const material = printer.material;
  const drawn = wallSizes(screw, material);
  if (args.block === 'woodScrew') {
    return {
      body,
      steps: woodScrewSteps({ body, point, more: more as Vec3[], screw, name: name ?? 'Wall screw' }, material),
      cut: (at, axis) => woodScrewStock(screw, at, axis, FACE_DROP, material),
      need: `a countersunk hole for a ${String(screw)} mm wood screw needs ${String(screw)} mm of plastic round its ${String(size.clearance)} mm hole and a plate at least ${String(Math.round((countersinkDepth(screw, material) + WOOD_SCREW_UNDER) * 100) / 100)} mm thick. Thicken the plate, or move the hole away from edges and other cuts`,
      text: `Built ${String(count)} countersunk hole${count > 1 ? 's' : ''} for ${String(screw)} mm wood screws in ${body}: ${String(size.clearance)} mm through, countersink ${String(size.countersink)} mm at 90° (DIN 74; drawn ${String(drawn.clearance)} and ${String(drawn.countersink)} mm, the material's hole allowance wider), so the head lies flush. Keep at least ${String(screw)} mm of plastic between the ${String(size.clearance)} mm hole and an edge, and the plate thicker than the countersink is deep (${mm(countersinkDepth(screw, material))} mm).`,
    };
  }
  const normal = vec3(args.normal);
  if (!normal) return 'keyhole needs normal: the way out of the face against the wall, three numbers';
  const up = args.up === undefined ? ([0, 0, 1] as Vec3) : vec3(args.up);
  if (!up) return 'up must be three numbers';
  const spec = { body, point, normal, up, screw, more: more as Vec3[], name: name ?? 'Keyhole' };
  const problem = keyholeProblem(spec);
  if (problem) return problem;
  return {
    body,
    steps: keyholeSteps(spec, material),
    stock: keyholeStock(spec, FACE_DROP, material),
    need: `a keyhole needs the part ${String(keyholeDepth(screw, material))} mm thick behind its entry and its slot. Thicken the part there, move the keyhole away from edges and other cuts, or use woodScrew`,
    text:
      `Built ${String(count)} keyhole slot${count > 1 ? 's' : ''} for ${String(screw)} mm wood screws in ${body}: entry ${String(size.entry)} mm for the head, a slot ${String(size.slot)} mm wide running ${String(KEYHOLE.travel)} mm up to where the screw rests (drawn ${String(drawn.entry)} and ${String(drawn.slot)} mm, the material's hole allowance wider), ` +
      `and behind its ${String(KEYHOLE.lip)} mm lip a pocket ${String(size.pocket)} mm deep for the head. The part must be at least ${String(keyholeDepth(screw, material))} mm thick there. ` +
      `It prints without support with that face on the bed: the pocket's roof is a bridge of ${mm(drawn.entry - 2 * keyholeRoof(screw, material) * Math.tan((ROOF_LEAN * Math.PI) / 180))} mm${keyholeRoof(screw, material) > 0 ? `, its sides leaning in at ${String(ROOF_LEAN)}° from upright over the last ${mm(keyholeRoof(screw, material))} mm` : ''} (bridged up to ${String(BRIDGE_SPAN)} mm, as the print check counts; over 5 mm it may sag a little, Hubs). The screw in the wall stands out ${String(Math.round((KEYHOLE.lip + size.pocket / 2) * 10) / 10)} mm.`,
  };
}

/** Magnet pockets the model asked for: their steps and what to say; null when the block is none; or what is wrong. */
export function magnetOf(args: Record<string, unknown>, printer: ToolPrinter = DEFAULT_PRINTER): { body: string; steps: Step[]; text: string; stock: Stock[]; need: string } | string | null {
  if (args.block !== 'magnet') return null;
  const unused = unusedOf(args, TAKES.magnet ?? []);
  if (unused) return unused;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body and point (three numbers on a flat face) are needed';
  const normal = vec3(args.normal);
  if (!normal) return 'magnet needs normal: the way out of the face the pocket opens in, three numbers';
  const more = args.more === undefined ? [] : Array.isArray(args.more) ? args.more.map(vec3) : null;
  if (!more || more.some((entry) => entry === null)) return 'more must be a list of points, each three numbers';
  const hold = (args.hold ?? 'glue') as MagnetHold;
  if (!MAGNET_HOLDS.includes(hold)) return `hold must be one of ${MAGNET_HOLDS.join(', ')}`;
  // Magnets differ: a pocket for a size the user did not give holds nothing (audit R15).
  if (args.diameter === undefined || args.height === undefined) return `magnet needs diameter and height: the magnet's, as the user measured them; ask the user with ${ASK_TOOL} if they did not say`;
  const number = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 100) : 'Magnet';
  const spec = { body, point, normal, more: more as Vec3[], diameter: number(args.diameter), height: number(args.height), hold, name };
  const problem = magnetProblem(spec);
  if (problem) return problem;
  const pocket = magnetPocket(spec, printer);
  const count = more.length + 1;
  // Under the pocket a floor or a wall, as the part may lie either way: the same least as under a nut trap (audit H-22).
  const under = leastFloor(printer);
  return {
    body,
    steps: magnetSteps(spec, printer),
    stock: magnetStock(spec, FACE_DROP, under, printer),
    need: `a pocket needs ${String(MAGNET.around)} mm of plastic round it and ${mm(under)} mm under it (${floorWhy(printer)}, as the part may lie either way). Thicken the part there, move the pocket away from edges and other cuts, or take a thinner magnet`,
    text:
      `Built ${String(count)} pocket${count > 1 ? 's' : ''} for ${String(spec.diameter)} × ${String(spec.height)} mm disc magnets in ${body}: ${String(pocket.diameter)} mm wide as printed (drawn ${String(pocket.drawn)} mm, the material's hole allowance wider) and ${String(pocket.depth)} mm deep, so the magnet lies ${String(MAGNET.sunk)} mm under the face, with a chamfered mouth. ` +
      (hold === 'glue'
        ? `The magnet drops in, with ${String(magnetRoom('glue', printer))} mm of room on the diameter (the material's push fit), and is held by a drop of superglue. `
        : `The magnet is pressed in: the pocket comes out ${String(PRESS_INTERFERENCE)} mm under it on the diameter (a press fit takes ${String(PRESS_RANGE[0])} to ${String(PRESS_RANGE[1])} mm); with more than that missing the plastic splits along its layers, so try one pocket first. `) +
      `Keep at least ${String(MAGNET.around)} mm of plastic round a pocket and ${mm(under)} mm under it. Mark the poles before gluing a pair: the two parts must attract. Neodymium magnets lose strength above 80 °C. No pocket of these sizes has been printed yet.${hold === 'glue' ? unmeasuredSaid(printer) : ''}`,
  };
}

/** A knob the model asked for: its steps and what to say; null when the block is none; or what is wrong. */
export function knobOf(args: Record<string, unknown>, printer: ToolPrinter = DEFAULT_PRINTER): { body: string; steps: Step[]; text: string; fresh: true; held: string } | string | null {
  if (args.block !== 'knob') return null;
  const unused = unusedOf(args, TAKES.knob ?? []);
  if (unused) return unused;
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  const point = vec3(args.point);
  if (!body || !point) return 'body (the name of the new knob) and point (three numbers, the centre of its underside) are needed';
  const axis = args.normal === undefined ? ([0, 0, 1] as Vec3) : vec3(args.normal);
  if (!axis) return 'normal must be three numbers';
  // The pointer's usual way, or another when the shaft itself points that way.
  const usual: Vec3 = Math.abs(axis[0]) < 1e-9 && Math.abs(axis[2]) < 1e-9 ? [0, 0, 1] : [0, 1, 0];
  const toward = args.up === undefined ? usual : vec3(args.up);
  if (!toward) return 'up must be three numbers';
  // The shaft in the user's hand decides the bore: none is assumed (audit R15).
  if (args.shaft === undefined || args.shaftDiameter === undefined) return `knob needs shaft (${KNOB_SHAFTS.join(', ')}) and shaftDiameter, as the user measured them; ask the user with ${ASK_TOOL} if they did not say`;
  const shaft = args.shaft as KnobShaft;
  if (!KNOB_SHAFTS.includes(shaft)) return `shaft must be one of ${KNOB_SHAFTS.join(', ')}`;
  const number = (value: unknown, standard: number) => (value === undefined ? standard : typeof value === 'number' ? value : Number.NaN);
  const shaftDiameter = number(args.shaftDiameter, Number.NaN);
  const flat = number(args.flat, knobFlat(shaftDiameter) ?? Number.NaN);
  if (shaft === 'd' && args.flat === undefined && Number.isNaN(flat)) return `a D shaft of ${String(shaftDiameter)} mm has no one flat: give flat, the shaft's thickness there, as measured`;
  const spec = { body, point, axis, toward, shaft, shaftDiameter, flat, diameter: number(args.diameter, 25), height: number(args.height, 16), clearance: number(args.clearance, knobClearance(shaft, printer)) };
  const problem = knobProblem(spec);
  if (problem) return problem;
  // A clearance from the profile, said where it was held within what a knob takes (BC-16 review S2) and where it is not read off the pieces.
  const fromProfile = args.clearance === undefined && shaft !== 'knurl';
  const held = fromProfile ? heldSaid('a knob', 'clamp', 2 * fitClearance('clamp', printer), spec.clearance, `0 to ${String(KNOB_CLEARANCE_MOST)} mm on the diameter`) : '';
  const bore = Math.round((shaftDiameter + spec.clearance) * 100) / 100;
  // As printed; knobSteps draws it wider by the material's hole allowance.
  const drawn = ` (drawn ${mm(drawnHole(bore, printer.material))} mm)`;
  const insert = knobInsert(spec);
  const hold =
    shaft === 'd'
      ? `for a ${String(shaftDiameter)} mm D shaft (flat at ${String(flat)} mm): the bore is ${String(bore)} mm wide${drawn} and ${String(insert)} mm deep, flat over its last ${String(Math.min(KNOB.flat, insert))} mm on the side away from the pointer, with a chamfered mouth, to push on`
      : shaft === 'knurl'
        ? `for a split knurled shaft of ${String(shaftDiameter)} mm: a plain bore ${String(bore)} mm wide${drawn} and ${String(insert)} mm deep, which the shaft springs into`
        : `for a round ${String(shaftDiameter)} mm shaft: the bore is ${String(bore)} mm wide${drawn} and ${String(insert)} mm deep, and an M3 set screw cuts its own thread in the ${String(pilotHole(3, printer.material))} mm hole on the side away from the pointer`;
  return {
    body,
    fresh: true,
    steps: knobSteps(spec, printer),
    text:
      `Built the knob "${body}" ${hold}. It is ${String(spec.diameter)} mm wide and ${String(spec.height)} mm high, with ${String(knobFlutes(spec.diameter))} flutes to grip and a groove on its top as the pointer. ` +
      `It prints standing on its top, the bore open upwards, without support (its print face is set). No knob of these sizes has been printed yet: when it sits too tight or too loose, build it again with another clearance.${held}${fromProfile ? unmeasuredSaid(printer) : ''}`,
    held,
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
export function volumesOf(measured: unknown): Map<string, number> {
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
export async function reachOf(upstream: UpstreamTools, block: FeatureBlock, wrap: (steps: Step[]) => Step[], callId: string | undefined): Promise<{ reach: (number | null)[]; wall: (number | null)[] } | undefined> {
  const trial = wrap(throughTrial(block));
  try {
    const answer = await upstream.callTool('batch', { commands: [...trial, { command: 'sketch.inspect', params: { sketch: 2147483647 } }], rollback: true }, callId);
    const text = answer.content.find((part) => part.type === 'text')?.text;
    const reply = JSON.parse(typeof text === 'string' ? text : '') as { results?: unknown[]; failed?: { index?: unknown } };
    if (reply.failed?.index !== trial.length) return undefined;
    const measured = reply.results?.[trial.map((step) => step.command).lastIndexOf('inspect.measure')];
    return { reach: throughReach(block, measured), wall: throughWall(block, measured) };
  } catch {
    return undefined;
  }
}

/**
 * The block whose trial finds the wall under a block that must not go through it (audit N-bloecke-6, W31): a nut trap
 * (its own trial drills the hole alone), engraved text and an engraved or inlaid logo (a plain M3 hole at its middle;
 * drawingTool.ts, audit W39). Null for every other block.
 */
export function wallTrial(block: FeatureBlock): FeatureBlock | null {
  if (block.block === 'nutTrap') return block;
  if ((block.block === 'text' || block.block === 'logo') && block.mode === 'deboss') return { block: 'screwHole', body: block.body, point: block.point, size: 'M3', head: 'none', fit: 'normal' };
  return null;
}

/**
 * How narrow the flat rim face at `point` is at its narrowest, from SolidCraft's faces and edges of the body (`model.faces`,
 * `model.edges`: start, mid and end of each edge). The edges in the rim's plane make loops; the smallest loop round the
 * point is the rim's outside, the loops within it its inside, and the rim is as narrow as the two come closest. A mean
 * width let a box with walls of 1.6 mm on three sides and 6 mm on one through as 2.49 mm (review of PR #369).
 * A round edge is a piece of the circle of the round face it bounds (`cylinder` of model.faces: exact centre and radius),
 * its pieces ending on the edge's own ends: SolidCraft puts the seam of a circle at one point of the rim, and a polygon whose
 * ends missed it by 1e-15 counted the seam twice (second review of PR 369).
 * Undefined when it cannot be told: no flat face at the point, no inside within its outside, or an edge that is neither
 * straight nor on a round face (an ellipse, a spline: model.edges gives no more than three points of it).
 */
export function rimNarrowest(point: Vec3, faces: unknown, edges: unknown): number | undefined {
  const dot = (a: readonly number[], b: readonly number[]) => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
  const sub = (a: readonly number[], b: readonly number[]): Vec3 => [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
  const listed = (faces as { faces?: { name?: unknown; plane_normal?: unknown; point?: unknown; cylinder?: { axis?: unknown; origin?: unknown; radius?: unknown } }[] } | undefined)?.faces ?? [];
  const plane = listed
    .map((face) => ({ n: vec3(face.plane_normal), at: vec3(face.point) }))
    .find(({ n, at }) => n && at && Math.hypot(...n) > 1e-9 && Math.abs(dot(sub(point, at), n)) / Math.hypot(...n) < 1e-4);
  if (!plane?.n) return undefined;
  const length = Math.hypot(...plane.n);
  const n = plane.n.map((value) => value / length) as Vec3;
  // Two directions in the plane, for flat coordinates.
  const axis: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = axis.map((value, k) => value - (n[k] ?? 0) * dot(axis, n));
  const e1 = u.map((value) => value / Math.hypot(...u)) as Vec3;
  const e2: Vec3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  const flat = (p: Vec3): [number, number] => [dot(sub(p, point), e1), dot(sub(p, point), e2)];
  const inPlane = (p: Vec3 | null): p is Vec3 => p !== null && Math.abs(dot(sub(p, point), n)) < 1e-4;
  // Each edge in the plane as a polyline: a line as itself, a round edge in pieces of the circle of its round face.
  type Line = { ends: [string, string]; points: [number, number][] };
  const key = (p: [number, number]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const lines: Line[] = [];
  /** The faces an edge lies between, from its name "A|B": a name may hold | inside brackets, as "F4:blend(F3:+y|F3:-x)". */
  const facesOf = (name: string) => {
    const parts: string[] = [];
    let [depth, from] = [0, 0];
    for (let i = 0; i < name.length; i += 1) {
      const char = name.charAt(i);
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      if (char === '|' && depth === 0) [parts[parts.length], from] = [name.slice(from, i), i + 1];
    }
    return [...parts, name.slice(from)];
  };
  /** The centre (flat) and radius of the round face an edge bounds, its axis square to the rim; null when it bounds none. */
  const roundOf = (name: unknown): { centre: [number, number]; r: number } | null => {
    for (const face of typeof name === 'string' ? facesOf(name) : []) {
      const round = listed.find((entry) => entry.name === face)?.cylinder;
      const [axis, origin] = [vec3(round?.axis), vec3(round?.origin)];
      if (axis && origin && typeof round?.radius === 'number' && Math.abs(Math.abs(dot(axis, n)) - Math.hypot(...axis)) < 1e-6 * Math.hypot(...axis)) return { centre: flat(origin), r: round.radius };
    }
    return null;
  };
  for (const edge of (edges as { edges?: { name?: unknown; start?: unknown; mid?: unknown; end?: unknown }[] } | undefined)?.edges ?? []) {
    const [s, m, e] = [vec3(edge.start), vec3(edge.mid), vec3(edge.end)];
    if (!inPlane(s) || !inPlane(m) || !inPlane(e)) continue;
    const [a, b, c] = [flat(s), flat(m), flat(e)];
    const closed = Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-6;
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (!closed && Math.abs(cross) < 1e-9 * Math.max(1, Math.hypot(c[0] - a[0], c[1] - a[1]) ** 2)) {
      lines.push({ ends: [key(a), key(c)], points: [a, c] });
      continue;
    }
    const round = roundOf(edge.name);
    if (!round) return undefined;
    const { centre, r } = round;
    const angle = (p: [number, number]) => Math.atan2(p[1] - centre[1], p[0] - centre[0]);
    const [from, via] = [angle(a), angle(b)];
    // The way round from start through mid to end.
    const turn = (to: number) => ((to - from) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = closed || turn(via) < turn(angle(c));
    const sweep = closed ? 2 * Math.PI : ccw ? turn(angle(c)) : -(2 * Math.PI - turn(angle(c)));
    const pieces = Math.max(8, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 256));
    // The pieces end exactly on the edge's own ends, so that a loop closes where its neighbour starts.
    const points = Array.from({ length: pieces + 1 }, (_, k) => (k === 0 ? a : k === pieces ? c : ([centre[0] + r * Math.cos(from + (sweep * k) / pieces), centre[1] + r * Math.sin(from + (sweep * k) / pieces)] as [number, number])));
    lines.push({ ends: closed ? [key(a), key(a)] : [key(a), key(c)], points });
  }
  // Loops: edges joined at their ends.
  const parent = new Map<string, string>();
  const root = (k: string): string => {
    const up = parent.get(k) ?? k;
    return up === k ? k : root(up);
  };
  for (const line of lines) parent.set(root(line.ends[0]), root(line.ends[1]));
  const loops = [...new Set(lines.map((line) => root(line.ends[0])))].map((id) => lines.filter((line) => root(line.ends[0]) === id).flatMap((line) => line.points.slice(1).map((p, k) => [line.points[k] ?? p, p] as [[number, number], [number, number]])));
  type Segment = [[number, number], [number, number]];
  // The winding number, each piece counted once with half-open ends: a vertex on the line through p is not counted twice.
  const inside = (p: [number, number], loop: Segment[]) =>
    loop.reduce((winding, [a, b]) => {
      const left = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
      return a[1] <= p[1] && b[1] > p[1] && left > 0 ? winding + 1 : a[1] > p[1] && b[1] <= p[1] && left < 0 ? winding - 1 : winding;
    }, 0) !== 0;
  const area = (loop: Segment[]) => {
    const xs = loop.flatMap(([a, b]) => [a[0], b[0]]);
    const ys = loop.flatMap(([a, b]) => [a[1], b[1]]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  };
  const outer = loops.filter((loop) => inside([0, 0], loop)).sort((a, b) => area(a) - area(b))[0];
  if (!outer) return undefined;
  const inner = loops.filter((loop) => loop !== outer && loop[0] && inside(loop[0][0], outer) && !inside([0, 0], loop));
  if (inner.length === 0) return undefined;
  const toSegment = (p: [number, number], [a, b]: Segment) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  // Two loops that do not cross come closest at an end of a piece of one of them.
  const between = (from: Segment[], to: Segment[]) => Math.min(...from.flatMap(([a, b]) => [a, b]).map((p) => Math.min(...to.map((segment) => toSegment(p, segment)))));
  const narrowest = Math.min(...inner.map((loop) => Math.min(between(loop, outer), between(outer, loop))));
  // To a hundredth: a round edge in pieces reads up to a thousandth narrow.
  return Number.isFinite(narrowest) ? Math.round(narrowest * 100) / 100 : undefined;
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

/**
 * A default fit of a block that was held within what the block takes, said (BC-16 review S2): the nut pocket's flats from the push
 * fit, the groove's gap from the slide fit. Empty where the model gave the size or nothing was held.
 */
export function heldOf(block: FeatureBlock, args: Record<string, unknown>, printer: ToolPrinter): string {
  if (block.block === 'nutTrap' && args.flats === undefined) return heldSaid(`an ${block.size} nut pocket`, 'push', nutFlatsOfFit(block.size, printer), block.flats, `${String(NUT[block.size][0])} mm to under the nut's ${String(nutCorners(block.size))} mm across corners`);
  if (block.block === 'lip' && block.type === 'groove' && args.gap === undefined) return heldSaid('a groove', 'slide', fitClearance('slide', printer), block.gap, 'no gap under 0');
  return '';
}

/** What was built, with the sizes it took from the tables and the standard of each size it did not (audit R6), for the model to tell the user. */
function built(block: FeatureBlock, args: Record<string, unknown> = {}, printer: ToolPrinter = DEFAULT_PRINTER): string {
  const { block: kind, body, point, ...sizes } = block;
  const standard = defaultBlock(kind, body, point, block.size, 'normal' in block ? block.normal : undefined, printer) as Record<string, unknown>;
  const listed = Object.entries(sizes)
    // A size is no screw's for text, a lip or a snap fit: it is not said.
    .filter(([key, value]) => key !== 'normal' && key !== 'more' && (key !== 'size' || hasSize(kind)) && value !== undefined && value !== null)
    // A standard size the printer cannot print was raised (blockOf): said so, with why (second review of PR 369).
    .map(([key, value]) => `${key} ${String(value)}${typeof value === 'number' && typeof standard[key] === 'number' && standard[key] !== value ? (key in args ? ` (standard ${String(standard[key])})` : ` (raised from the standard ${String(standard[key])} for the ${String(printer.nozzle)} mm nozzle)`) : ''}`)
    .join(', ');
  const count = 'more' in block && block.more ? block.more.length + 1 : 1;
  // `length` is SolidCraft's centre to centre (audit T44): the slot itself is its width longer.
  const slot = block.block === 'slot' ? ` The length is centre to centre, how far the screw can travel: the slot is ${mm(block.length + block.width)} mm long.` : '';
  return `Built ${count > 1 ? `${String(count)} × ` : ''}${kind} on ${body} at [${point.join(', ')}]: ${listed}.${slot}${holeSaid(block, printer)}${heldOf(block, args, printer)}`;
}


/** Why an insert's seat is drawn at the maker's size (BC-16 review S1). */
export const INSERT_SEAT_SAID = "The insert's hole is drawn at its maker's size for printed parts, without the material's hole allowance: the insert melts into it.";

/** The sizes of a block's holes from PartBuddy's tables, said (audit W21, R7, S-09, S-11, S-14, MV-09). */
function holeSaid(block: FeatureBlock, printer: ToolPrinter): string {
  const chamfer = `its mouth chamfered ${String(ENTRY_CHAMFER)} mm at 45°`;
  /** A hole as it is drawn: wider by the material's hole allowance, so that it comes out at its size (audit S-10). */
  const drawn = (size: number) => `drawn ${mm(drawnHole(size, printer.material))} mm, ${mm(holeRoom(size, printer.material))} mm wider for the hole allowance of the material in use, so that it comes out at ${mm(size)} mm`;
  switch (block.block) {
    case 'screwHole': {
      const hole = CLEARANCE[block.fit][block.size];
      const series = { close: 'fine', normal: 'medium', loose: 'coarse' }[block.fit];
      const head =
        block.head === 'cap'
          ? `, under a counterbore ${mm(headRoom(block.size, 'cap').diameter)} mm wide and ${mm(headRoom(block.size, 'cap').depth)} mm deep with two bridge layers of ${String(printer.layer)} mm under its floor (a slot, then a square), so that floor prints facing the bed without support`
          : block.head === 'countersunk'
            ? `, under a 90° countersink ${mm(headRoom(block.size, 'countersunk', drawnHole(hole, printer.material)).diameter)} mm wide, in which the head sinks flush`
            : `, ${chamfer}`;
      return ` The hole is ${String(hole)} mm (ISO 273 ${series}, PartBuddy's table), ${mm(hole - screwDiameter(block.size))} mm over the screw: ${drawn(hole)}${head}.`;
    }
    case 'tappedHole':
      return block.modeled
        ? ` The thread is ${printedThread(block.size).designation}: the ISO profile of ${block.size} with ${String(THREAD_ALLOWANCE)} mm more on every diameter for printing (${String(THREAD_ALLOWANCE / 2)} mm a side; Sovol and SelfCAD name 0.1 to 0.2), drilled ${String(tapDrill(block))} mm, ${chamfer}. No such thread has been printed here yet: try one before a part depends on it.`
        : ` It is drilled ${String(tapDrill(block))} mm, the tap drill of ${block.size}, to be tapped after printing, ${chamfer}.`;
    case 'insertSeat':
      return ` ${INSERT_SEAT_SAID}`;
    case 'boss':
      return ` It stands straight, without draft, with a ${mm(bossFillet(block, printer))} mm fillet at its foot. ${INSERT_SEAT_SAID}`;
    case 'slot':
      return ` It is ${drawn(block.width)} wide.`;
    case 'nutTrap': {
      const din = NUT_DIN_FLATS[block.size];
      const pocket = ` The pocket is ${drawn(block.flats)} across its flats.`;
      return din ? `${pocket} ISO 4032 ${block.size} nuts are ${String(NUT[block.size][0])} mm across their flats; the older DIN 934 hex and DIN 562 square nuts are ${String(din)} mm and do not go in: for those give flats ${mm(din + 2 * fitClearance('push', printer))}.` : pocket;
    }
    default:
      return '';
  }
}

/**
 * What a block says of what it measured and of what it did not (audit W31, N-bloecke-5, N-bloecke-6, T30): `wall` is how
 * thick the part is at its point as the trial measured it, `rim` the width of a lip's rim; undefined or null when unmeasured.
 */
function measuredSaid(block: FeatureBlock, wall: number | null | undefined, rim: number | undefined, printer: ToolPrinter): string {
  const unmeasured = wall === null ? `no plastic of ${block.body} lies within ${String(ON_FACE)} mm of the point` : 'SolidCraft could not run the trial that measures it';
  switch (block.block) {
    case 'text': {
      const stroke = block.height * (block.bold ? TEXT_STROKE.bold : TEXT_STROKE.regular);
      const under =
        block.mode !== 'deboss'
          ? ''
          : typeof wall === 'number'
            ? ` The part is ${mm(wall)} mm thick at the middle of the text, as measured on trial: ${mm(wall - block.depth)} mm stay under the letters there.`
            : ` PartBuddy could not measure the part under the text (${unmeasured}): check that the letters do not come out on the far side.`;
      // What prints less well is built as given and said (audit R36): the design rules' depth and stroke for text.
      const [deep, wide] = [textDepth(printer), textStroke(printer)];
      const shallow = block.depth < deep - 1e-9 ? ` ${mm(block.depth)} mm ${block.mode === 'deboss' ? 'deep' : 'high'} is under the ${mm(deep)} mm text needs to read well (0.5 mm in whole ${String(printer.layer)} mm layers, Xometry); it was built as given.` : '';
      const thin = strokesKnown(block) && stroke < wide - 1e-9 ? ` Text reads well with strokes of ${mm(wide)} mm (Xometry; two lines at the least): capitals ${String(Math.ceil((wide / (block.bold ? TEXT_STROKE.bold : TEXT_STROKE.regular)) * 10 - 1e-6) / 10)} mm high give that.` : '';
      return ` Its strokes are about ${mm(stroke)} mm wide; the gaps between the letters were not measured: the print check shows them.${thin}${shallow}${under}`;
    }
    case 'nutTrap': {
      const under = typeof wall === 'number' ? ` The wall is ${mm(wall)} mm thick there, as measured on trial: ${mm(wall - block.depth)} mm of it stay under the nut.` : ` PartBuddy could not measure the wall there (${unmeasured}): check that the pocket does not come out on the far side.`;
      return `${under} Lying open downwards, the pocket's roof is a bridge with the hole in it, and lying on its side its top is an overhang: PartBuddy did not check either; print the part with the pocket opening upwards where it allows.`;
    }
    case 'lip':
      return typeof rim === 'number'
        ? ` The rim is ${mm(rim)} mm wide at its narrowest (measured on its edges)${block.type === 'groove' ? `: ${mm(rim - block.width - block.gap)} mm of wall stay beside the groove there` : ''}.`
        : ` PartBuddy could not measure the rim: check ${block.type === 'groove' ? 'the wall beside the groove' : 'that the lip stands on the rim'} yourself.`;
    case 'snapFit':
      return strainSaid(block, printer);
    default:
      return '';
  }
}

/**
 * The joints that stand away from where they rest and move `body` (audit W34, review of PR #369): a joint rests at 0, or at
 * the end of its limits nearest 0 (SolidCraft 0.40.1 puts a slider limited to [5, 50] at 5 as it joins it, and will not
 * drive it to 0); it moves the side that is not fixed. Said as "name" stands at …, rests at …; empty when none.
 * shortcut: a part joined by a second joint to the part a joint moved is not found (a part inside the moved one is); follow
 * the joints from part to part if that matters.
 */
export function jointsMoving(joints: unknown, listing: unknown, body: string): string[] {
  const list = joints as { fixed?: unknown; joints?: { name?: unknown; a?: unknown; b?: unknown; values?: { value?: unknown; limits?: unknown; unit?: unknown }[] }[] } | undefined;
  const fixed = Array.isArray(list?.fixed) ? (list.fixed as unknown[]) : [];
  type Listed = { id?: unknown; parent?: unknown; bodies?: unknown; occurrences?: { id?: unknown; name?: unknown; parent?: unknown }[] };
  const all = (listing as { components?: Listed[] } | undefined)?.components ?? [];
  // The occurrences that carry the body: its component's, and those of every component above it, as a part on a moved part
  // moves with it (second review of PR 369: "Tip" in "Flap").
  const carriers: { id?: unknown; name?: unknown }[] = [];
  const seen = new Set<unknown>();
  const queue = all.filter((entry) => entry.parent !== null && Array.isArray(entry.bodies) && entry.bodies.includes(body));
  for (let entry = queue.shift(); entry; entry = queue.shift()) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    for (const occurrence of entry.occurrences ?? []) {
      carriers.push(occurrence);
      queue.push(...all.filter((above) => above.id === occurrence.parent && above.parent !== null));
    }
  }
  const holds = (side: unknown) => carriers.some((occurrence) => occurrence.id === side || occurrence.name === side);
  return (list?.joints ?? []).flatMap((joint) => {
    if (![joint.a, joint.b].some((side) => side !== undefined && !fixed.includes(side) && holds(side))) return [];
    const away = (joint.values ?? []).flatMap((value) => {
      if (typeof value.value !== 'number') return [];
      const [low, high] = Array.isArray(value.limits) && typeof value.limits[0] === 'number' && typeof value.limits[1] === 'number' ? [value.limits[0], value.limits[1]] : [-Infinity, Infinity];
      const rest = Math.min(Math.max(0, low), high);
      const unit = value.unit === 'deg' ? '°' : ' mm';
      return Math.abs(value.value - rest) > 1e-6 ? [`stands at ${mm(value.value)}${unit} and rests at ${mm(rest)}${unit}`] : [];
    });
    return away.length > 0 ? [`${JSON.stringify(String(joint.name))} ${away.join(', ')}`] : [];
  });
}

/** The upstream tools plus `partbuddy_block`; `printer` is the user's, whose nozzle and layer the sizes are checked for. */
export function withBlockTool(upstream: UpstreamTools, keepFace: (body: string, face: string) => void = () => undefined, log: (line: string) => void = () => undefined, printer: () => ToolPrinter = () => DEFAULT_PRINTER): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), blockTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== BLOCK_TOOL) return upstream.callTool(name, args, callId);
      let fit: ToolPrinter = DEFAULT_PRINTER;
      try {
        fit = printer();
      } catch (cause) {
        log(`partbuddy_block: no printer profile, checked for a ${String(DEFAULT_PRINTER.nozzle)} mm nozzle (${(cause as Error).message.slice(0, 200)})`);
      }
      const wall = wallOf(args, fit) ?? knobOf(args, fit) ?? magnetOf(args, fit);
      if (typeof wall === 'string') return { content: [{ type: 'text', text: `Not built: ${wall}` }], isError: true };
      const block = wall ? null : blockOf(args, fit);
      if (typeof block === 'string') return { content: [{ type: 'text', text: `Not built: ${block}` }], isError: true };
      try {
        const run = async (commands: { command: string; params: Record<string, unknown> }[], rollback = false) => {
          const reply = jsonOf(await upstream.callTool('batch', { commands, ...(rollback ? { rollback } : {}) }, callId)) as { results?: unknown[]; failed?: { command?: unknown; error?: unknown } };
          if (reply.failed) throw new Error(`SolidCraft refused ${String(reply.failed.command)}: ${String(reply.failed.error).slice(0, 300)}`);
          return reply.results ?? [];
        };
        // A sketch belongs to the component of its body: built with that component active, the block moves with the body.
        const name = block && typeof args.name === 'string' ? args.name.trim() : undefined;
        const steps = wall ? wall.steps : block ? named(stepsOf(block, undefined, undefined, fit), name) : [];
        const body = wall ? wall.body : (block?.body ?? '');
        const [listing] = steps.some((step) => step.command === 'sketch.create') ? await run([{ command: 'component.list', params: {} }]) : [undefined];
        const component = listing === undefined ? 0 : componentOf(listing, body);
        // A new part must not take the name of a body there is: its cuts would go into that one.
        const taken = ((listing as { components?: { bodies?: unknown }[] } | undefined)?.components ?? []).some((entry) => Array.isArray(entry.bodies) && entry.bodies.includes(body));
        if (wall && 'fresh' in wall && taken) return { content: [{ type: 'text', text: `Not built: there is a body named ${body} already; give the knob another name` }], isError: true };
        const wrap = (inner: Step[]) => (component === 0 ? inner : [{ command: 'component.activate', params: { component } }, ...inner, { command: 'component.activate', params: { component: 0 } }]);
        const fresh = wall !== null && 'fresh' in wall;
        const measure = { command: 'inspect.measure', params: {} };
        const [measured, joints] = await run([measure, { command: 'joint.list', params: {} }]);
        const before = volumesOf(measured);
        const missing = fresh ? null : misplaced(body, before, before);
        if (missing?.startsWith('there is no body')) return { content: [{ type: 'text', text: `Not built: ${missing}` }], isError: true };
        // The point is given in the world as designed: a joint that stands away from where it rests has moved the body elsewhere (audit W34).
        const hasJoints = ((joints as { joints?: { values?: unknown[] }[] } | undefined)?.joints ?? []).length > 0;
        const away = !fresh && hasJoints ? jointsMoving(joints, listing ?? (await run([{ command: 'component.list', params: {} }]))[0], body) : [];
        if (away.length > 0)
          return { content: [{ type: 'text', text: `Not built: ${body} stands moved by its joint: ${away.join('; ')}. Drive the joint to where it rests with joint.drive first, so ${body} is where it was designed` }], isError: true };
        // A cut "through" goes through the wall at its point, not on through the far side of a hollow part (audit W2); a nut
        // trap and engraved text must stop short of it, so their wall is measured on the same trial.
        const probe = block ? (cutsThrough(block) ? block : wallTrial(block)) : null;
        const tried = probe ? await reachOf(upstream, probe, wrap, callId) : undefined;
        const reach = block && cutsThrough(block) ? tried?.reach : undefined;
        const thick = tried?.wall[0];
        const floor = leastFloor(fit);
        if (block && (block.block === 'nutTrap' || block.block === 'text') && typeof thick === 'number' && block.depth + floor > thick + 1e-9) {
          const what = block.block === 'nutTrap' ? `the pocket of an ${block.size} nut trap is ${mm(block.depth)} mm deep` : `text engraved ${mm(block.depth)} mm deep`;
          // A smaller nut whose standard pocket fits there.
          const smaller = block.block === 'nutTrap' ? BLOCK_SIZES.filter((size) => Number(size.slice(1)) < Number(block.size.slice(1)) && (defaultBlock('nutTrap', body, block.point, size) as { depth: number }).depth + floor <= thick + 1e-9).at(-1) : undefined;
          const instead = smaller ? ` An ${smaller} nut trap (pocket ${mm((defaultBlock('nutTrap', body, block.point, smaller) as { depth: number }).depth)} mm deep) fits there; it takes an ${smaller} screw instead of the ${block.size}.` : '';
          return {
            content: [{ type: 'text', text: `Not built: at [${block.point.join(', ')}] ${body} is ${mm(thick)} mm thick (measured on trial); ${what} and needs ${mm(floor)} mm of plastic under it (${floorWhy(fit)}, as the part may lie either way), ${mm(block.depth + floor)} mm in all. Put it where the part is thicker, or thicken the part there.${instead}` }],
            isError: true,
          };
        }
        // A groove takes its width and gap out of the rim: what stays beside it must still print (audit N-bloecke-5).
        let rim: number | undefined;
        if (block?.block === 'lip') {
          try {
            const [faces, edges] = await run([
              { command: 'model.faces', params: { body } },
              { command: 'model.edges', params: { body } },
            ]);
            rim = rimNarrowest(block.point, faces, edges);
          } catch {
            rim = undefined;
          }
          const least = minimumWall(fit.nozzle);
          if (block.type === 'groove' && rim !== undefined && rim - block.width - block.gap < least - 1e-9)
            return {
              content: [{ type: 'text', text: `Not built: the rim of ${body} is ${mm(rim)} mm wide at its narrowest (measured on its edges); a groove ${mm(block.width + block.gap)} mm wide (width and gap) leaves ${mm(rim - block.width - block.gap)} mm of wall beside it there, under the ${mm(least)} mm of two lines ${on(fit)}. Give a narrower width, or make the wall thicker.` }],
              isError: true,
            };
        }
        const sequence = wrap(block && reach ? named(stepsOf(block, undefined, reach, fit), name) : steps);
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
          // A piece that does not touch the body stays in it apart, and SolidCraft only warns (audit W34, as mechanismTool.ts).
          const apart = results.map((result) => (result as { warning?: unknown } | undefined)?.warning).find((warning) => typeof warning === 'string' && warning.includes('separate pieces'));
          if (typeof apart === 'string') throw new Error(`it would stand apart from ${body} (SolidCraft: "${apart.slice(0, 200)}"); give a point on a face of ${body}`);
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
        // The plate view lays the part on the face SolidCraft names (print-faces.json), as the slicer will: the face of
        // `body.print_face` alone, not one another step answers (audit W33, as printFaceWatch.ts).
        const face = sent.flatMap((step, i) => (step.command === 'body.print_face' ? [(results[i] as { face?: unknown } | undefined)?.face] : [])).find((entry) => typeof entry === 'string');
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
        // A default fit held within what the block takes goes to the log as well as to the answer (BC-16 review S2).
        const held = wall ? ('held' in wall ? wall.held : '') : block ? heldOf(block, args, fit) : '';
        if (held) log(`partbuddy_block ${String(args.block)}:${held}`);
        const said = (wall ? wall.text : block ? built(block, args, fit) + reachSaid(block, reach) + measuredSaid(block, thick, rim, fit) : '') +(block?.block === 'insertSeat' ? ` Each seat needs ${String(seatWall(block.size))} mm of plastic round it and ${String(SEAT_UNDER)} mm under it.` : '');
        return { content: [{ type: 'text', text: `${said}${stockSaid}${warnings.length > 0 ? ` SolidCraft warns: ${warnings.join(' ')}` : ''}` }] };
      } catch (cause) {
        return { content: [{ type: 'text', text: `Not built: ${(cause as Error).message}` }], isError: true };
      }
    },
  };
}

/** Added to the role prompt of every route. */
export const BLOCK_GUIDANCE = `For a screw hole, a tapped hole, the seat of a heat-set insert, a nut trap, a screw boss, a slot, text, a lid's lip or a snap hook on one body call ${BLOCK_TOOL} instead of drilling or modelling it yourself: it takes clearance, head, nut and insert sizes from the standard tables. For a part that hangs on a wall use its keyhole (hung over screws in the wall) or woodScrew (screwed on through countersunk holes) blocks, two of them level for anything wider than 60 mm. For parts held by magnets (a lid, a tool holder, a sign) use its magnet block for each pocket instead of drilling a hole of the magnet's size; it needs the magnet's diameter and height, so ask with ${ASK_TOOL} when the user has not said them. For a knob on a potentiometer, an encoder or any other shaft use its knob block, which makes the knob as a part of its own; it needs the shaft (D, knurled or round, and its diameter), so ask with ${ASK_TOOL} when the user has not said. Keyholes and wood screw holes need the wood screw's size the same way.`;

export { DEFAULT_PRINTER } from '../../shared/blocks';
