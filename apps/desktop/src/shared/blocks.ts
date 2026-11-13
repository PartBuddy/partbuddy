/**
 * Function blocks (plan step F1): holes and seats for screws, nut traps, slots, text, logos, lips
 * for lids and snap fits, built at a picked flat face with SolidCraft's own commands (`solid.hole`,
 * `plastic.boss`, `solid.emboss`, `sketch.insert_svg`, `plastic.lip`, `plastic.snap_fit`, sketches
 * cut in or built up). Sizes and allowances come from standard tables;
 * everything stays editable because printers, nuts and inserts differ.
 */

import { logoBase, TEXT_PREFIX, uniqueLogoName } from './drawingPlacement';
import { drawingColours, drawingPieces, drawingSize, drawingSvg, naturalWidth, parseDrawing, shapesOverlap, shapesSvg, type DrawingProblem, type Shape } from './svgDrawing';

import { minimumWall, thinnestLine } from '@partbuddy/geometry';

import { snapSize, type FitPrinter } from './designFit';
import { LIP, TAPPED_FROM } from './mechanisms';
import { CLEARANCE, CLEARANCE_NORMAL, COUNTERSUNK_HEAD, HEAD_ALLOWANCE, INSERT, NUT, NUT_ALLOWANCE, BLOCK_SIZES, TAP_DRILL, headRoom, printedThread, screwDiameter, type BlockSize } from './screwSizes';
import { DEFAULT_PRINTER, drawnHole, fitClearance, type ToolPrinter } from './toolFit';

export { BLOCK_SIZES, HEAD_ALLOWANCE, INSERT, NUT_ALLOWANCE, type BlockSize };

type Point = [number, number, number];

/**
 * How far a cut without depth goes: through the wall at its point (the default), or through all of its body on its line,
 * both cheeks of a fork or a clevis (audit W2).
 */
export type Through = 'wall' | 'body';

export type FeatureBlock =
  | { block: 'tappedHole'; body: string; point: [number, number, number]; size: BlockSize; depth: number | null; modeled: boolean; more?: Point[] | undefined; through?: Through | undefined }
  | { block: 'screwHole'; body: string; point: [number, number, number]; size: BlockSize; head: 'none' | 'cap' | 'countersunk'; fit: 'close' | 'normal' | 'loose'; more?: Point[] | undefined; through?: Through | undefined }
  | { block: 'insertSeat'; body: string; point: [number, number, number]; size: BlockSize; diameter: number; depth: number; more?: Point[] | undefined }
  | { block: 'boss'; body: string; point: [number, number, number]; size: BlockSize; diameter: number; height: number }
  /** Text embossed onto or engraved into the face, centred on the point. */
  | { block: 'text'; body: string; point: Point; normal: Point; size: BlockSize; text: string; height: number; depth: number; mode: 'emboss' | 'deboss'; bold: boolean; /** An installed font family; none is SolidCraft's built-in Liberation Sans. */ font?: string | undefined; /** The full name of the family's bold face, for SolidCraft to try when bold with the family is refused. */ boldFace?: string | undefined }
  /** A hexagonal pocket for a nut with a clearance hole through the rest. */
  | { block: 'nutTrap'; body: string; point: Point; normal: Point; size: BlockSize; flats: number; depth: number; through?: Through | undefined }
  /** A slot for a screw, across or along the face, through or to a depth. */
  | { block: 'slot'; body: string; point: Point; normal: Point; size: BlockSize; length: number; width: number; depth: number | null; along: 'x' | 'y'; through?: Through | undefined }
  /** A lip or a groove on the rim of a shelled body, for a lid (SolidCraft's `plastic.lip`). */
  | { block: 'lip'; body: string; point: Point; size: BlockSize; type: 'lip' | 'groove'; width: number; height: number; gap: number }
  /**
   * A cantilever snap fit standing out of the face (SolidCraft's `plastic.snap_fit`); the catch
   * points along one of the face's sketch directions.
   */
  | { block: 'snapFit'; body: string; point: Point; normal: Point; size: BlockSize; length: number; thickness: number; width: number; catchDepth: number; catchLength: number; hook: HookDirection }
  /** A logo from an SVG file, engraved or built up, centred on the point; `name` is the file's name. */
  | { block: 'logo'; body: string; point: Point; normal: Point; size: BlockSize; name: string; svg: string; width: number; depth: number; mode: 'emboss' | 'deboss'; colours?: boolean | undefined; centre?: boolean | undefined };


/** The catch's direction in the face: along the sketch plane's x or y, either way. */
export const HOOK_DIRECTIONS = ['y+', 'y-', 'x+', 'x-'] as const;
export type HookDirection = (typeof HOOK_DIRECTIONS)[number];

export type BlockKind = FeatureBlock['block'];
export const BLOCK_KINDS: BlockKind[] = ['tappedHole', 'screwHole', 'insertSeat', 'nutTrap', 'boss', 'slot', 'text', 'logo', 'lip', 'snapFit'];

/** Blocks laid out in the face's own directions, which need the face's normal. */
export function needsNormal(kind: BlockKind): boolean {
  return kind === 'text' || kind === 'logo' || kind === 'nutTrap' || kind === 'slot' || kind === 'snapFit';
}

/** Text, logos, lips and snap fits have no screw size to choose. */
export function hasSize(kind: BlockKind): boolean {
  return kind !== 'text' && kind !== 'logo' && kind !== 'lip' && kind !== 'snapFit';
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The sizes a block offers: countersunk heads from M3, inserts up to M6. */
export function sizesOf(kind: BlockKind, head: 'none' | 'cap' | 'countersunk' = 'none'): BlockSize[] {
  if (kind === 'insertSeat' || kind === 'boss') return BLOCK_SIZES.filter((size) => INSERT[size]);
  if (kind === 'screwHole' && head === 'countersunk') return BLOCK_SIZES.filter((size) => COUNTERSUNK_HEAD[size]);
  return [...BLOCK_SIZES];
}

/** Text sunk in or standing out: 0.5 mm (Xometry Pro, FDM design tips), in whole layers; the design rules say the same (printProfiles.ts). */
export const TEXT_DEPTH = 0.5;
/** A detail that has to hold, and a stroke of text: 1 mm (Xometry Pro, FDM design tips; the UZH guideline asks 1 mm for text). */
export const STURDY = 1;
/** The 45° chamfer at the mouth of a hole, in mm (own choice; the design rules' details say the same, printProfiles.ts). */
export const ENTRY_CHAMFER = 0.5;

/** How deep text and logos go in or stand out on the printer: {@link TEXT_DEPTH} in whole layers (audit T49, S-19, R36). */
export const textDepth = (printer: FitPrinter) => snapSize('height', TEXT_DEPTH, printer);
/** The stroke text needs to read well on the printer: {@link STURDY}, and two lines at the least (the design rules' details). */
export const textStroke = (printer: FitPrinter) => Math.max(STURDY, minimumWall(printer.nozzle));

/** A block with its standard values for a size on the printer (the form starts from these). */
export function defaultBlock(kind: BlockKind, body: string, point: [number, number, number], size: BlockSize, normal: Point = [0, 0, 1], printer: ToolPrinter = DEFAULT_PRINTER): FeatureBlock {
  const insert = INSERT[size] ?? INSERT.M3 ?? { diameter: 4, length: 5.7, wall: 1.6 };
  switch (kind) {
    case 'tappedHole':
      // Modelled from M5, as a printed thread holds (mechanisms.ts); smaller ones are listed, to be tapped (audit BC-12 S2).
      return { block: kind, body, point, size, depth: null, modeled: screwDiameter(size) >= TAPPED_FROM };
    case 'screwHole':
      return { block: kind, body, point, size, head: 'cap', fit: 'normal' };
    case 'insertSeat':
      return { block: kind, body, point, size, diameter: insert.diameter, depth: round(insert.length + 1) };
    case 'boss':
      // Wall round the insert: what its maker asks for, never under 2 mm, in whole lines of the printer (audit S-14).
      return { block: kind, body, point, size, diameter: round(insert.diameter + 2 * snapSize('wall', Math.max(2, insert.wall), printer)), height: round(insert.length + 3) };
    case 'text':
      // 7 mm capitals: engraved, "PartBuddy" left 0.62 mm of plastic between letters at 5 to 6.5 mm and none under the
      // 0.9 mm of two lines at 7 and 8 (PartBuddy's print check, 0.4 mm nozzle, SolidCraft 0.40.1, 2026-11-13).
      return { block: kind, body, point, normal, size, text: 'PartBuddy', height: 7, depth: textDepth(printer), mode: 'deboss', bold: true };
    case 'nutTrap': {
      const height = NUT[size][1];
      // Room for a nut pushed in: the material's push fit on each side (PLA on 0.4 mm: 0.3 mm on the flats; audit T10), kept
      // within what blockLimit takes (the nut's flats up to under its corners), so a measured fit never refuses the standard.
      return { block: kind, body, point, normal, size, flats: nutFlats(size, printer), depth: round(height + NUT_ALLOWANCE.depth) };
    }
    case 'slot': {
      const width = CLEARANCE_NORMAL[size];
      return { block: kind, body, point, normal, size, length: 10, width, depth: null, along: 'x' };
    }
    case 'lip':
      // The closure's least lip, LIP.thick (raised to two lines where the nozzle needs it, raisedBlock), and the groove's room the
      // material's slide fit, as the closure's 0.25 is PLA's (audit T42, W36). Not the closure's lipThick: 1.4 + 0.25 left 0.75 mm of a
      // 2.4 mm rim, under two lines (BC-16 review S4); plastic.lip adds gap once beside the lip and once under it (measured, PR text).
      return { block: kind, body, point, size, type: 'lip', width: LIP.thick, height: 2, gap: Math.max(0, fitClearance('slide', printer)) };
    case 'logo':
      // No file yet: the form asks for one before anything is built.
      return { block: kind, body, point, normal, size, name: '', svg: '', width: 20, depth: textDepth(printer), mode: 'deboss' };
    case 'snapFit':
      // About 1.4 % strain when it snaps in: within what printed PLA takes.
      return { block: kind, body, point, normal, size, length: 12, thickness: 1.5, width: 5, catchDepth: 0.8, catchLength: 1.5, hook: 'y+' };
  }
}

/** How a refusal of PartBuddy's print limits starts, before the limit as JSON (main/index.ts, BlockPanel.tsx): no SolidCraft error starts so. */
export const PRINT_LIMIT = 'PartBuddy print limit: ';

/**
 * A nut pocket's flats as printed: the nut's and the material's push fit on each side, within the nut's flats and under its
 * corners (blockLimit), however the profile's fit was measured.
 */
export function nutFlats(size: BlockSize, printer: ToolPrinter): number {
  const [flats] = NUT[size];
  return round(Math.min(Math.max(flats, nutFlatsOfFit(size, printer)), nutCorners(size) - 0.01));
}

/** A nut pocket's flats from the push fit alone, before they are kept within the nut ({@link nutFlats}). */
export const nutFlatsOfFit = (size: BlockSize, printer: ToolPrinter) => round(NUT[size][0] + 2 * fitClearance('push', printer));

/** Across a nut's corners, in mm: a pocket that wide lets it turn (blockLimit). */
export const nutCorners = (size: BlockSize) => round((NUT[size][0] * 2) / Math.sqrt(3));

/** A {@link BlockLimit} as the form's refusal: the panel reads it back and says it in the interface language (refusal.ts). */
export const limitRefusal = (limit: BlockLimit) => `${PRINT_LIMIT}${JSON.stringify(limit)}`;

/** Above this strain at the arm's root, printed PLA tends to crack (PETG takes about 3 %). */
export const SNAP_STRAIN_LIMIT = 2;

/**
 * The stroke of a capital I as a share of the capital height, measured on SolidCraft 0.40.1 (2026-11-13, 10 mm capitals:
 * 2.019 mm in Arial bold, 1.356 mm in the built-in Liberation Sans): the thinnest stroke of a text of that height.
 */
export const TEXT_STROKE = { bold: 0.2019, regular: 0.1356 };

/**
 * The bending strain at the arm's root when the catch is pushed aside by its depth, for a
 * cantilever of constant section: 1.5 · thickness · deflection / lever², in per cent. SolidCraft's
 * length includes the catch, so the lever runs to the catch's middle.
 */
export function snapStrain(block: { length: number; thickness: number; catchDepth: number; catchLength: number }): number {
  const lever = Math.max(block.length - block.catchLength / 2, block.length / 4);
  return (150 * block.thickness * block.catchDepth) / lever ** 2;
}

/** The catch's direction in world coordinates. */
export function hookVector(point: Point, normal: Point, hook: HookDirection): Point {
  const plane = planeAt(point, normal);
  const axis = hook.startsWith('x') ? plane.x_dir : plane.y_dir;
  return (hook.endsWith('-') ? axis.map((value) => (value === 0 ? 0 : -value)) : axis) as Point;
}


/**
 * A sketch plane at the point, flat on the face: x runs level where it can (text reads from the
 * side), y is in the face, and the plane's normal is the face's, so a negative extrusion cuts in.
 */
export function planeAt(point: Point, normal: Point): { origin: Point; x_dir: Point; y_dir: Point } {
  const length = Math.hypot(...normal) || 1;
  const n = normal.map((value) => value / length) as Point;
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let x = cross([0, 0, 1], n);
  const size = Math.hypot(...x);
  x = size < 1e-6 ? [1, 0, 0] : (x.map((value) => value / size) as Point);
  const tidy = (v: Point) => v.map((value) => (Math.abs(value) < 1e-9 ? 0 : round6(value))) as Point;
  return { origin: point, x_dir: tidy(x), y_dir: tidy(cross(n, x)) };
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/** The family for bold text: an installed one, since the built-in font has no bold face. */
export const BOLD_FONT = 'Arial';

type Step = { command: string; params: Record<string, unknown> };

/**
 * The SolidCraft commands of a block, in one batch: one feature, or a sketch and its feature. A
 * logo's sketches are named `sketch` (default `SVG-Logo <name>`), so it can be moved later (drawingPlacement.ts).
 */
export function stepsOf(block: FeatureBlock, sketch?: string, through?: readonly (number | null)[], printer: ToolPrinter = DEFAULT_PRINTER): Step[] {
  const mm = (value: number) => `${String(round(value))} mm`;
  switch (block.block) {
    case 'text':
      return [
        // Named "Text <words>", so a pick finds it again and the dock changes it like a logo.
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false, name: sketch ?? uniqueLogoName(block.text, [], TEXT_PREFIX) } },
        // SolidCraft's built-in font has no bold face; Arial comes with every Windows.
        { command: 'sketch.text', params: { text: block.text, at: [0, round(-block.height / 2)], height: block.height, align: 'center', ...textFont(block) } },
        { command: 'solid.emboss', params: { depth: mm(block.depth), mode: block.mode, face: block.point, targets: [block.body] } },
      ];
    case 'nutTrap': {
      const length = Math.hypot(...block.normal) || 1;
      const bottom = block.point.map((value, i) => round6(value - ((block.normal[i] ?? 0) / length) * block.depth)) as Point;
      return [
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false } },
        // shortcut: the hole allowance is read on round holes; a hexagon is taken to shrink as much across its flats. Measure a pocket on the hole plate if nuts bind.
        { command: 'sketch.polygon.circumscribed', params: { center: [0, 0], radius: drawnHole(block.flats, printer.material) / 2, sides: 6 } },
        { command: 'solid.extrude', params: { distance: mm(-block.depth), operation: 'cut', targets: [block.body] } },
        { command: 'solid.hole', params: { position: bottom, diameter: mm(drawnHole(CLEARANCE_NORMAL[block.size], printer.material)), ...(through?.[0] ? { depth: mm(Math.max(through[0] - block.depth, 0.01)) } : {}), targets: [block.body] } },
      ];
    }
    case 'slot': {
      const half = round(block.length / 2);
      const [p0, p1] = block.along === 'x' ? [[-half, 0], [half, 0]] : [[0, -half], [0, half]];
      return [
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false } },
        { command: 'sketch.slot.center_to_center', params: { p0, p1, width: drawnHole(block.width, printer.material) } },
        // "Through" without a measured reach cuts far beyond any printable part.
        { command: 'solid.extrude', params: { distance: mm(-(block.depth ?? through?.[0] ?? 1000)), operation: 'cut', targets: [block.body] } },
      ];
    }
    case 'logo':
      if (colourLayers(block).length > 1) return colourSteps(block, sketch ?? uniqueLogoName(block.name, []));
      return [
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false, name: sketch ?? uniqueLogoName(block.name, []) } },
        { command: 'sketch.insert_svg', params: { text: block.svg, at: [0, 0], width: block.width, align: 'center' } },
        // An extrusion, not solid.emboss: emboss takes every region, so a ring would become a disc;
        // an extrusion keeps a loop inside a hole as material again, as the drawing shows it.
        { command: 'solid.extrude', params: { distance: mm(block.mode === 'deboss' ? -block.depth : block.depth), operation: block.mode === 'deboss' ? 'cut' : 'join' } },
      ];
    case 'snapFit':
      return [
        {
          command: 'plastic.snap_fit',
          params: {
            position: block.point,
            hook: hookVector(block.point, block.normal, block.hook),
            length: mm(block.length),
            thickness: mm(block.thickness),
            width: mm(block.width),
            catch_depth: mm(block.catchDepth),
            catch_length: mm(block.catchLength),
            body: block.body,
          },
        },
      ];
    case 'lip':
      return [{ command: 'plastic.lip', params: { face: block.point, type: block.type, width: mm(block.width), height: mm(block.height), ...(block.type === 'groove' ? { gap: mm(block.gap) } : {}), body: block.body } }];
    default:
      // A row of holes: the same hole at each further point.
      return [block.point, ...('more' in block ? (block.more ?? []) : [])].map((point, i) => stepOf({ ...block, point }, through?.[i], printer));
  }
}

/** The font of a text: the chosen family, or Arial for bold since the built-in font has no bold face. */
function textFont(block: { bold: boolean; font?: string | undefined }): { font?: string; bold?: boolean } {
  const font = block.font ?? (block.bold ? BOLD_FONT : undefined);
  return { ...(font ? { font } : {}), ...(block.bold ? { bold: true } : {}) };
}

/** The 45° chamfer at a hole's mouth (audit R36), as SolidCraft's countersink on the hole: {@link ENTRY_CHAMFER} wider on each side. */
const chamfered = (hole: number) => ({ type: 'countersink', cs_diameter: `${String(round(hole + 2 * ENTRY_CHAMFER))} mm`, cs_angle: '90 deg' });

/** The hole a tapped hole is drilled with: a modelled thread's from its print size, a listed one with ISO's tap drill, to be tapped. */
export const tapDrill = (block: { size: BlockSize; modeled: boolean }) => (block.modeled ? printedThread(block.size).drill : TAP_DRILL[block.size]);

/** A boss's fillet at its foot (audit S-14): half its wall, and at least 1 mm and two nozzle widths (the design rules' inner corners). */
export const bossFillet = (block: { size: BlockSize; diameter: number }, printer: FitPrinter) => round(Math.max((block.diameter - (INSERT[block.size]?.diameter ?? 4)) / 4, STURDY, 2 * printer.nozzle));

/**
 * The SolidCraft command of a block that is one feature; it names its body, so a point where two bodies meet cuts only that one.
 * Every hole takes its size from PartBuddy's tables (screwSizes.ts), none from SolidCraft's (audit R7, W21, S-09).
 */
export function stepOf(block: Exclude<FeatureBlock, { block: 'text' | 'logo' | 'nutTrap' | 'slot' | 'lip' | 'snapFit' }>, through?: number | null, printer: ToolPrinter = DEFAULT_PRINTER): Step {
  const mm = (value: number) => `${String(round(value))} mm`;
  switch (block.block) {
    case 'tappedHole': {
      const depth = block.depth ?? through;
      // A modelled thread gets room for printing; a listed one stays the size it will be tapped to.
      const thread = block.modeled ? printedThread(block.size).designation : block.size;
      return { command: 'solid.hole', params: { position: block.point, thread, modeled: block.modeled, ...(depth ? { depth: mm(depth) } : {}), ...chamfered(tapDrill(block)), targets: [block.body] } };
    }
    case 'screwHole': {
      // ISO 273's hole as it comes out of the printer: drawn wider by the material's hole allowance (audit S-10).
      const hole = drawnHole(CLEARANCE[block.fit][block.size], printer.material);
      const base = { position: block.point, diameter: mm(hole), ...(through ? { depth: mm(through) } : {}), targets: [block.body] };
      if (block.head === 'cap') {
        const room = headRoom(block.size, 'cap');
        // SolidCraft refuses a counterbore as deep as its hole (0.40.1): in a wall thinner than the head, the hole ends just past it.
        const depth = through ? { depth: mm(Math.max(through, room.depth + 0.01)) } : {};
        // Two bridge layers under its floor (a slot, then a square): facing the bed, the floor prints without support (audit S-11).
        return { command: 'solid.hole', params: { ...base, ...depth, type: 'counterbore', cb_diameter: mm(room.diameter), cb_depth: mm(room.depth), bridge: mm(printer.layer) } };
      }
      if (block.head === 'countersunk') return { command: 'solid.hole', params: { ...base, type: 'countersink', cs_diameter: mm(headRoom(block.size, 'countersunk', hole).diameter), cs_angle: '90 deg' } };
      return { command: 'solid.hole', params: { ...base, ...chamfered(hole) } };
    }
    case 'insertSeat':
      // No chamfer: the insert's tip is narrower than its hole and starts it (ruthex RX: d2 3.9 in 4.0), and a chamfer on a curved
      // face would hide a rim that breaks into an edge from the seat's measure (blockTool.ts; review of BC-12).
      // Drawn as given, without the hole allowance: the maker's hole is the size to model in the printed part (ruthex RX data
      // sheet, d3), and the insert melts into it as an interference (BC-16 review S1).
      return { command: 'solid.hole', params: { position: block.point, diameter: mm(block.diameter), depth: mm(block.depth), targets: [block.body] } };
    case 'boss': {
      const insert = INSERT[block.size] ?? { diameter: 4, length: 5.7 };
      return {
        command: 'plastic.boss',
        params: { position: block.point, diameter: mm(block.diameter), height: mm(block.height), hole_diameter: mm(insert.diameter), hole_depth: mm(insert.length + 1), draft: '0 deg', fillet: mm(bossFillet(block, printer)), body: block.body },
      };
    }
  }
}

/**
 * Audit W2: a block that cuts "through" (a screw hole, a nut trap's hole, a slot or a tapped hole without depth) goes
 * through the wall it enters and no further, not on through the far wall of a hollow part. How far that is, is found on
 * trial: {@link throughTrial} cuts the block through all into a copy of the body and leaves what the cut takes as bodies
 * of their own, one for each wall it passes (SolidCraft 0.40.1, 2026-11-13: a slot through both walls of a box gave two
 * bodies of 86.158 mm³); {@link throughReach} reads from them how deep each cut must go.
 */
export function cutsThrough(block: FeatureBlock): boolean {
  if ('through' in block && block.through === 'body') return false;
  return block.block === 'screwHole' || block.block === 'nutTrap' || ((block.block === 'slot' || block.block === 'tappedHole') && !block.depth);
}

/** The trial bodies that hold what a through cut takes; they are never kept. */
const THROUGH = 'PartBuddy through';
/** In mm: past the far side of its wall a cut goes on this far, or half way to the next wall where that is nearer. */
const PAST = 1;
/** In mm: how far a block's point may lie off the face it is on (a point rounded to two places is 0.005 off). */
export const ON_FACE = 0.05;

/** How far the copy stands aside while the block is cut, in mm along Z: beyond the box it was cut from. */
const ASIDE = 30000;

/** The steps that find the reach of a block that cuts through, to run on trial: they end with `inspect.measure`. */
export function throughTrial(block: FeatureBlock): Step[] {
  // A modelled thread is not needed to find the walls (and one on trial breaks the same thread built after it, blockTool.ts).
  // A nut trap's wall is found by its hole alone from the face: a pocket deeper than the wall left its hole on no face
  // and failed the trial (audit N-bloecke-6).
  const plain: FeatureBlock =
    block.block === 'tappedHole' ? { ...block, modeled: false } : block.block === 'nutTrap' ? { block: 'screwHole', body: block.body, point: block.point, size: block.size, head: 'none', fit: 'normal' } : block;
  return [
    // A copy of the body under a name of PartBuddy's: all of it within 10 m of the origin.
    { command: 'solid.box', params: { length: 20000, width: 20000, height: 20000, corner: [-10000, -10000, -10000], operation: 'new', body_name: THROUGH } },
    { command: 'solid.combine', params: { target: THROUGH, tools: [block.body], operation: 'intersect', keep_tools: true } },
    // Out of the way while the block is cut: with the copy on the body, every `solid.hole` failed ("the reference `F1:+z`
    // no longer exists as it was picked", SolidCraft 0.40.1, review of PR #365); a sketched slot did not.
    { command: 'solid.move', params: { bodies: [THROUGH], translate: [0, 0, ASIDE] } },
    ...stepsOf(plain),
    { command: 'solid.move', params: { bodies: [THROUGH], translate: [0, 0, -ASIDE] } },
    { command: 'solid.combine', params: { target: THROUGH, tools: [block.body], operation: 'cut', keep_tools: true } },
    { command: 'inspect.measure', params: {} },
  ];
}

/**
 * How deep each cut of a block that cuts through must go, in mm from its point (for a nut trap from the face, its pocket
 * included), from the `inspect.measure` at the end of {@link throughTrial}: through the piece of plastic the point lies
 * on, along the way from the point to that piece's centre, and {@link PAST} on. Null for a point no piece holds within
 * {@link ON_FACE} of it.
 * shortcut: the pieces are measured by their boxes, exact for walls square to the axes; askew a box reaches further and
 * the cut with it, never less far. Measure along the axis if a skew cut must stop short of a near wall.
 */
export function throughReach(block: FeatureBlock, measured: unknown): (number | null)[] {
  return throughSpans(block, measured).map((span) => span && Math.ceil((span.exit + Math.min(PAST, Math.max(0, span.next - span.exit) / 2)) * 100 - 1e-6) / 100);
}

/** How thick the wall is at each point of a block, along the way its cut goes, in mm, as {@link throughReach} finds it; null where no piece holds the point. */
export function throughWall(block: FeatureBlock, measured: unknown): (number | null)[] {
  return throughSpans(block, measured).map((span) => span && Math.round(span.exit * 1000) / 1000);
}

/** Where the cut at each point leaves the wall it entered, and where it would enter the next, in mm from the point. */
function throughSpans(block: FeatureBlock, measured: unknown): ({ exit: number; next: number } | null)[] {
  const vector = (value: unknown) => (Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as Point) : null);
  const bodies = ((measured ?? {}) as { bodies?: { name?: unknown; bbox?: { min?: unknown; max?: unknown }; center_of_mass?: unknown }[] }).bodies ?? [];
  const pieces = bodies.flatMap((body) => {
    const [min, max, centre] = [vector(body.bbox?.min), vector(body.bbox?.max), vector(body.center_of_mass)];
    return typeof body.name === 'string' && (body.name === THROUGH || body.name.startsWith(`${THROUGH} (`)) && min && max && centre ? [{ min, max, centre }] : [];
  });
  type Piece = (typeof pieces)[number];
  return [block.point, ...('more' in block ? (block.more ?? []) : [])].map((point) => {
    const distance = (piece: Piece) => Math.hypot(...piece.centre.map((value, k) => value - (point[k] ?? 0)));
    const first = pieces.filter((piece) => point.every((value, k) => value >= (piece.min[k] ?? 0) - ON_FACE && value <= (piece.max[k] ?? 0) + ON_FACE)).sort((a, b) => distance(a) - distance(b))[0];
    if (!first || distance(first) < 1e-6) return null;
    const axis = first.centre.map((value, k) => (value - (point[k] ?? 0)) / distance(first));
    // Where the line from the point along the axis enters and leaves a piece's box.
    const span = (piece: Piece): [number, number] | null => {
      let [from, to] = [-Infinity, Infinity];
      for (let k = 0; k < 3; k += 1) {
        const [o, d, low, high] = [point[k] ?? 0, axis[k] ?? 0, piece.min[k] ?? 0, piece.max[k] ?? 0];
        if (Math.abs(d) < 1e-9) {
          if (o < low - 1e-3 || o > high + 1e-3) return null;
          continue;
        }
        [from, to] = [Math.max(from, Math.min((low - o) / d, (high - o) / d)), Math.min(to, Math.max((low - o) / d, (high - o) / d))];
      }
      return from <= to ? [from, to] : null;
    };
    const exit = span(first)?.[1] ?? 0;
    const next = Math.min(...pieces.flatMap((piece) => (piece === first ? [] : [span(piece)])).flatMap((range) => (range && range[1] > exit ? [range[0]] : [])));
    return { exit, next };
  });
}

type LogoBlock = Extract<FeatureBlock, { block: 'logo' }>;

/** The pieces of a logo built in colours, each its own body named after the logo, its fill and its number. */
export function colourLayers(block: LogoBlock): { fill: string; body: string; piece: Shape }[] {
  if (!block.colours) return [];
  const read = parseDrawing(block.svg);
  if (!read.ok || drawingColours(read.drawing).length < 2) return [];
  const base = logoBase(block.name);
  const counts = new Map<string, number>();
  return drawingPieces(read.drawing).map((piece) => {
    const n = (counts.get(piece.fill) ?? 0) + 1;
    counts.set(piece.fill, n);
    return { fill: piece.fill, body: `${base} ${piece.fill.slice(1)} ${String(n)}`, piece };
  });
}

/**
 * Colours for the pieces a cut split off a logo's colour bodies: SolidCraft names them "<body> (2)"
 * and so on, without the colour the body had. `inspect` is a `document.inspect` result.
 */
export function splitPieceSteps(layers: readonly { body: string; fill: string }[], inspect: unknown): Step[] {
  const bodies = ((inspect ?? {}) as { bodies?: { name?: unknown }[] }).bodies ?? [];
  return layers.flatMap((layer) => {
    const split = bodies.flatMap((body) => (typeof body.name === 'string' && body.name.startsWith(`${layer.body} (`) && /^ \(\d+\)$/.test(body.name.slice(layer.body.length)) ? [body.name] : []));
    return split.length > 0 ? [{ command: 'appearance.assign', params: { bodies: split, color: layer.fill } }] : [];
  });
}

/** The bodies a block changes or makes, for the ghost: the part, and a logo's colour bodies. */
export function blockBodies(block: FeatureBlock): string[] {
  if (block.block !== 'logo') return [block.body];
  const layers = colourLayers(block);
  // Inlaid, the pieces of a fill are joined into its first one (colourSteps).
  const kept = block.mode === 'deboss' ? layers.filter((layer, i) => layers.findIndex((other) => other.fill === layer.fill) === i) : layers;
  return [block.body, ...kept.map((layer) => layer.body)];
}

/**
 * A logo in colours for a multi-colour printer: each piece of each fill becomes its own body,
 * coloured like the fill, so the slicer gives each its filament. SolidCraft would split a fill of
 * several pieces into bodies named "(2)" without its colour, so every piece goes in on its own.
 * Built up, the bodies stand on the face; inlaid, they fill a pocket of their shape flush with the
 * face. Where a later piece of another fill covers an earlier one (painting order), it is cut out
 * of the earlier body. Every piece goes in by the drawing's top left corner, so all keep its frame.
 */
function colourSteps(block: LogoBlock, sketch: string): Step[] {
  const layers = colourLayers(block);
  const read = parseDrawing(block.svg);
  if (!read.ok) return [];
  const size = drawingSize(read.drawing);
  const height = (size.height / (size.width || 1)) * block.width;
  const plane = planeAt(block.point, block.normal);
  const inlay = block.mode === 'deboss';
  const steps: Step[] = layers.flatMap((layer) => [
    { command: 'sketch.create', params: { plane, project_edges: false, name: sketch } },
    { command: 'sketch.insert_svg', params: { text: shapesSvg(read.drawing, block.width, [layer.piece]), at: [round(-block.width / 2), round(height / 2)], align: 'origin' } },
    { command: 'solid.extrude', params: { distance: `${String(round(inlay ? -block.depth : block.depth))} mm`, operation: 'new', body_name: layer.body } },
    // Coloured at once, so a piece a later cut splits keeps its colour in both parts.
    { command: 'appearance.assign', params: { bodies: [layer.body], color: layer.fill } },
  ]);
  if (inlay) {
    // Inlaid, the pieces of one fill become one body first, then the pocket is cut a fill at a time:
    // pieces of one fill that touch along an edge make the pocket's walls meet, and SolidCraft's boolean
    // fails on that (make_faceuse status 1001, colour fox 2026-11-10). A fill keeps its colour as one body.
    const fills = [...new Set(layers.map((layer) => layer.fill))].map((fill) => layers.filter((layer) => layer.fill === fill));
    const bodyOf = new Map(fills.flatMap((group) => group.map((layer) => [layer.body, group[0]?.body ?? layer.body] as const)));
    for (const [first, ...rest] of fills) {
      if (first && rest.length > 0) steps.push({ command: 'solid.combine', params: { target: first.body, tools: rest.map((layer) => layer.body), operation: 'join', touching: 'one_body' } });
    }
    for (const [first] of fills) if (first) steps.push({ command: 'solid.combine', params: { target: block.body, tools: [first.body], operation: 'cut', keep_tools: true } });
    // Where a later piece of another fill covers an earlier one, the earlier fill gives way, once per pair of fills.
    const cut = new Set<string>();
    layers.forEach((layer, i) => {
      for (const later of layers.slice(i + 1)) {
        const [target, tool] = [bodyOf.get(layer.body) ?? layer.body, bodyOf.get(later.body) ?? later.body];
        if (target === tool || cut.has(`${target}|${tool}`) || cut.has(`${tool}|${target}`) || !shapesOverlap(read.drawing, [layer.piece], [later.piece])) continue;
        cut.add(`${target}|${tool}`);
        steps.push({ command: 'solid.combine', params: { target, tools: [tool], operation: 'cut', keep_tools: true } });
      }
    });
    return steps;
  }
  layers.forEach((layer, i) => {
    // Only later pieces of another fill that cover part of this one: a cut by a body that does not meet it fails.
    const above = layers
      .slice(i + 1)
      .filter((later) => later.fill !== layer.fill && shapesOverlap(read.drawing, [layer.piece], [later.piece]))
      .map((later) => later.body);
    if (above.length > 0) steps.push({ command: 'solid.combine', params: { target: layer.body, tools: above, operation: 'cut', keep_tools: true } });
  });
  return steps;
}

/**
 * An SVG file as a logo: the clean drawing SolidCraft gets (svgDrawing.ts) and its width from the
 * file when it states one, or why the file cannot be one.
 */
export function logoFrom(text: string): { svg: string; width: number | null; backgrounds: number } | { problem: DrawingProblem } {
  const result = parseDrawing(text);
  if (!result.ok) return { problem: result.problem };
  const width = naturalWidth(result.drawing);
  return { svg: drawingSvg(result.drawing, width ?? 100), width, backgrounds: result.drawing.skipped.backgrounds };
}

export { DEFAULT_PRINTER };

/**
 * Why a size of a block does not print or does not do its work, as data: the assistant is told it in English
 * ({@link limitSaid}), the form in the interface language (`blocks.limit.<reason>`, with these values as placeholders).
 */
export type BlockLimit = { key: string; value: number; nozzle: number } & (
  | { reason: 'stroke' | 'strokeBold'; least: number; stroke: number; needed: number }
  | { reason: 'lipWall' | 'grooveWall' | 'armWall' | 'catch' | 'layer'; least: number }
  | { reason: 'screw'; size: string; thread: number; standard: number }
  | { reason: 'nutFlats' | 'nutHeight'; size: string; least: number; standard: number }
  | { reason: 'nutCorners'; size: string; most: number }
  | { reason: 'printedThread'; size: string; from: number }
);

/** Whether the strokes of a text's font are known: measured for Arial bold and the built-in Liberation Sans alone (TEXT_STROKE). */
export const strokesKnown = (block: { font?: string | undefined }) => block.font === undefined || block.font === BOLD_FONT;

/**
 * The least each size of a block must be to print on the printer, from the code's own rules: two nozzle widths a stroke of
 * text (printProfiles.ts), two lines of wall, the narrowest line a slicer lays for a detail (`thinnestLine`), one layer
 * (designFit.ts, printCheck.ts).
 */
export function leastOf(block: FeatureBlock, printer: FitPrinter): { key: string; least: number; reason: BlockLimit['reason'] }[] {
  const wall = minimumWall(printer.nozzle);
  switch (block.block) {
    case 'text':
      // Another font than those measured is not checked; the form says so (blocks.strokeUnchecked).
      if (!strokesKnown(block)) return [];
      return [{ key: 'height', least: Math.ceil(((2 * printer.nozzle) / (block.bold ? TEXT_STROKE.bold : TEXT_STROKE.regular)) * 10 - 1e-6) / 10, reason: block.bold ? 'strokeBold' : 'stroke' }];
    case 'lip':
      return [
        { key: 'width', least: wall, reason: block.type === 'groove' ? 'grooveWall' : 'lipWall' },
        { key: 'height', least: printer.layer, reason: 'layer' },
      ];
    case 'snapFit':
      return [
        { key: 'thickness', least: wall, reason: 'armWall' },
        { key: 'width', least: wall, reason: 'armWall' },
        { key: 'catchDepth', least: thinnestLine(printer.nozzle), reason: 'catch' },
      ];
    default:
      return [];
  }
}

/** The block with each size below what the printer prints raised to it, except those in `kept` (sizes someone gave), and which were raised. */
export function raisedBlock(block: FeatureBlock, printer: FitPrinter, kept: readonly string[] = []): { block: FeatureBlock; raised: string[] } {
  const sizes = block as unknown as Record<string, unknown>;
  const raised = leastOf(block, printer).filter(({ key, least }) => !kept.includes(key) && typeof sizes[key] === 'number' && (sizes[key]) < least - 1e-9);
  return { block: { ...block, ...Object.fromEntries(raised.map(({ key, least }) => [key, least])) }, raised: raised.map(({ key }) => key) };
}

/** The first size of a block that does not print or does not do its work on the printer; null when all do. */
export function blockLimit(block: FeatureBlock, printer: FitPrinter): BlockLimit | null {
  const sizes = block as unknown as Record<string, unknown>;
  const { nozzle } = printer;
  for (const { key, least, reason } of leastOf(block, printer)) {
    const value = sizes[key];
    if (typeof value !== 'number' || value >= least - 1e-9) continue;
    if (reason === 'stroke' || reason === 'strokeBold') return { key, value, nozzle, reason, least, needed: round(2 * nozzle), stroke: round(value * (reason === 'strokeBold' ? TEXT_STROKE.bold : TEXT_STROKE.regular)) };
    return { key, value, nozzle, reason: reason as 'lipWall', least };
  }
  // A printed thread under M5 strips, in the form as with the assistant (blockTool.ts, mechanisms.ts).
  if (block.block === 'tappedHole' && block.modeled && screwDiameter(block.size) < TAPPED_FROM)
    return { key: 'modeled', value: screwDiameter(block.size), nozzle, reason: 'printedThread', size: block.size, from: TAPPED_FROM };
  if (block.block === 'slot') {
    const thread = Number(block.size.slice(1));
    if (block.width < thread) return { key: 'width', value: block.width, nozzle, reason: 'screw', size: block.size, thread, standard: CLEARANCE_NORMAL[block.size] };
  }
  if (block.block === 'nutTrap') {
    const [flats, high] = NUT[block.size];
    const standard = defaultBlock('nutTrap', '', [0, 0, 0], block.size) as Extract<FeatureBlock, { block: 'nutTrap' }>;
    if (block.flats < flats) return { key: 'flats', value: block.flats, nozzle, reason: 'nutFlats', size: block.size, least: flats, standard: standard.flats };
    if (block.flats >= (flats * 2) / Math.sqrt(3)) return { key: 'flats', value: block.flats, nozzle, reason: 'nutCorners', size: block.size, most: round((flats * 2) / Math.sqrt(3)) };
    if (block.depth < high) return { key: 'depth', value: block.depth, nozzle, reason: 'nutHeight', size: block.size, least: high, standard: standard.depth };
  }
  // Nothing else of a block prints under one layer; a gap may be none.
  const thin = Object.entries(block).find(([key, value]) => typeof value === 'number' && key !== 'gap' && value < printer.layer - 1e-9);
  return thin ? { key: thin[0], value: thin[1] as number, nozzle, reason: 'layer', least: printer.layer } : null;
}

/** A {@link BlockLimit} in English, for the assistant: the size, why it does not print, and what to give. */
export function limitSaid(limit: BlockLimit): string {
  const on = `on a ${String(limit.nozzle)} mm nozzle`;
  const why = (() => {
    switch (limit.reason) {
      case 'stroke':
      case 'strokeBold':
        return `the strokes of ${limit.reason === 'strokeBold' ? 'bold ' : ''}capitals ${String(limit.value)} mm high are ${String(limit.stroke)} mm wide, under the ${String(limit.needed)} mm (two nozzle widths) a stroke needs ${on}; give height ${String(limit.least)} or more`;
      case 'lipWall':
        return `a lip narrower than ${String(limit.least)} mm (two lines ${on}) does not print solid`;
      case 'grooveWall':
        return `a groove narrower than ${String(limit.least)} mm takes no lip that prints solid (two lines ${on})`;
      case 'armWall':
        return `an arm under ${String(limit.least)} mm (two lines ${on}) does not print solid`;
      case 'catch':
        return `a catch under ${String(limit.least)} mm (the narrowest line a slicer lays ${on}) does not print and holds nothing`;
      case 'layer':
        return `under one layer (${String(limit.least)} mm) nothing prints`;
      case 'screw':
        return `an ${limit.size} screw is ${String(limit.thread)} mm thick and would not pass; the standard is ${String(limit.standard)} mm`;
      case 'nutFlats':
        return `an ${limit.size} nut is ${String(limit.least)} mm across its flats and would not go in; the standard pocket is ${String(limit.standard)}`;
      case 'nutCorners':
        return `an ${limit.size} nut is ${String(limit.most)} mm across its corners and would turn in the pocket; give less than that`;
      case 'nutHeight':
        return `an ${limit.size} nut is ${String(limit.least)} mm high and would stand out of the pocket; the standard is ${String(limit.standard)}`;
      case 'printedThread':
        return `modeled: a printed ${limit.size} thread strips; give modeled false to drill it for tapping after printing, use insertSeat (a heat-set insert), or a thread from M${String(limit.from)}`;
    }
  })();
  return limit.reason === 'printedThread' ? why : `${limit.key} ${String(limit.value)}: ${why}`;
}
