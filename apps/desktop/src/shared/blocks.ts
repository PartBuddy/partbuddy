/**
 * Function blocks (plan step F1): holes and seats for screws, nut traps, slots, text, lips for
 * lids and snap fits, built at a picked flat face with SolidCraft's own commands (`solid.hole`,
 * `plastic.boss`, `solid.emboss`, `plastic.lip`, `plastic.snap_fit`, sketches cut in). Sizes and allowances come from standard tables;
 * everything stays editable because printers, nuts and inserts differ.
 */

export const BLOCK_SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10'] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

/** Socket head cap screws, ISO 4762: head diameter and height in mm. */
const CAP_HEAD: Record<BlockSize, [number, number]> = {
  M2: [3.8, 2],
  'M2.5': [4.5, 2.5],
  M3: [5.5, 3],
  M4: [7, 4],
  M5: [8.5, 5],
  M6: [10, 6],
  M8: [13, 8],
  M10: [16, 10],
};

/** Countersunk screws, ISO 10642 (from M3): theoretical head diameter in mm, 90°. */
const COUNTERSUNK_HEAD: Partial<Record<BlockSize, number>> = { M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44, M8: 17.92, M10: 22.4 };

/**
 * Heat-set threaded inserts: typical hole diameter and insert length in mm (values of the common
 * ruthex inserts). The seat is one millimetre deeper than the insert for the displaced plastic.
 */
export const INSERT: Partial<Record<BlockSize, { diameter: number; length: number }>> = {
  M2: { diameter: 3.2, length: 4 },
  'M2.5': { diameter: 3.6, length: 5.7 },
  M3: { diameter: 4, length: 5.7 },
  M4: { diameter: 5.6, length: 8.1 },
  M5: { diameter: 6.4, length: 9.5 },
  M6: { diameter: 8, length: 12.7 },
};

/** Hex nuts, ISO 4032: width across flats and height in mm. */
const NUT: Record<BlockSize, [number, number]> = {
  M2: [4, 1.6],
  'M2.5': [5, 2],
  M3: [5.5, 2.4],
  M4: [7, 3.2],
  M5: [8, 4.7],
  M6: [10, 5.2],
  M8: [13, 6.8],
  M10: [16, 8.4],
};

/** Extra room around a printed nut: across flats and depth. */
export const NUT_ALLOWANCE = { flats: 0.3, depth: 0.4 };

/** Extra room around a printed screw head: holes print smaller than drawn. */
export const HEAD_ALLOWANCE = { diameter: 0.6, depth: 0.4 };

type Point = [number, number, number];

export type FeatureBlock =
  | { block: 'tappedHole'; body: string; point: [number, number, number]; size: BlockSize; depth: number | null; modeled: boolean }
  | { block: 'screwHole'; body: string; point: [number, number, number]; size: BlockSize; head: 'none' | 'cap' | 'countersunk'; fit: 'close' | 'normal' | 'loose' }
  | { block: 'insertSeat'; body: string; point: [number, number, number]; size: BlockSize; diameter: number; depth: number }
  | { block: 'boss'; body: string; point: [number, number, number]; size: BlockSize; diameter: number; height: number }
  /** Text embossed onto or engraved into the face, centred on the point. */
  | { block: 'text'; body: string; point: Point; normal: Point; size: BlockSize; text: string; height: number; depth: number; mode: 'emboss' | 'deboss'; bold: boolean }
  /** A hexagonal pocket for a nut with a clearance hole through the rest. */
  | { block: 'nutTrap'; body: string; point: Point; normal: Point; size: BlockSize; flats: number; depth: number }
  /** A slot for a screw, across or along the face, through or to a depth. */
  | { block: 'slot'; body: string; point: Point; normal: Point; size: BlockSize; length: number; width: number; depth: number | null; along: 'x' | 'y' }
  /** A lip or a groove on the rim of a shelled body, for a lid (SolidCraft's `plastic.lip`). */
  | { block: 'lip'; body: string; point: Point; size: BlockSize; type: 'lip' | 'groove'; width: number; height: number; gap: number }
  /**
   * A cantilever snap fit standing out of the face (SolidCraft's `plastic.snap_fit`); the catch
   * points along one of the face's sketch directions.
   */
  | { block: 'snapFit'; body: string; point: Point; normal: Point; size: BlockSize; length: number; thickness: number; width: number; catchDepth: number; catchLength: number; hook: HookDirection };

/** The catch's direction in the face: along the sketch plane's x or y, either way. */
export const HOOK_DIRECTIONS = ['y+', 'y-', 'x+', 'x-'] as const;
export type HookDirection = (typeof HOOK_DIRECTIONS)[number];

export type BlockKind = FeatureBlock['block'];
export const BLOCK_KINDS: BlockKind[] = ['tappedHole', 'screwHole', 'insertSeat', 'nutTrap', 'boss', 'slot', 'text', 'lip', 'snapFit'];

/** Blocks laid out in the face's own directions, which need the face's normal. */
export function needsNormal(kind: BlockKind): boolean {
  return kind === 'text' || kind === 'nutTrap' || kind === 'slot' || kind === 'snapFit';
}

/** Text, lips and snap fits have no screw size to choose. */
export function hasSize(kind: BlockKind): boolean {
  return kind !== 'text' && kind !== 'lip' && kind !== 'snapFit';
}

const round = (value: number) => Math.round(value * 100) / 100;

/** The sizes a block offers: countersunk heads from M3, inserts up to M6. */
export function sizesOf(kind: BlockKind, head: 'none' | 'cap' | 'countersunk' = 'none'): BlockSize[] {
  if (kind === 'insertSeat' || kind === 'boss') return BLOCK_SIZES.filter((size) => INSERT[size]);
  if (kind === 'screwHole' && head === 'countersunk') return BLOCK_SIZES.filter((size) => COUNTERSUNK_HEAD[size]);
  return [...BLOCK_SIZES];
}

/** A block with its standard values for a size (the form starts from these). */
export function defaultBlock(kind: BlockKind, body: string, point: [number, number, number], size: BlockSize, normal: Point = [0, 0, 1]): FeatureBlock {
  const insert = INSERT[size] ?? INSERT.M3 ?? { diameter: 4, length: 5.7 };
  switch (kind) {
    case 'tappedHole':
      return { block: kind, body, point, size, depth: null, modeled: true };
    case 'screwHole':
      return { block: kind, body, point, size, head: 'cap', fit: 'normal' };
    case 'insertSeat':
      return { block: kind, body, point, size, diameter: insert.diameter, depth: round(insert.length + 1) };
    case 'boss':
      // Wall around the insert of at least 2 mm, as usual for FDM.
      return { block: kind, body, point, size, diameter: round(insert.diameter + 4), height: round(insert.length + 3) };
    case 'text':
      return { block: kind, body, point, normal, size, text: 'PartBuddy', height: 5, depth: 0.6, mode: 'deboss', bold: true };
    case 'nutTrap': {
      const [flats, height] = NUT[size];
      return { block: kind, body, point, normal, size, flats: round(flats + NUT_ALLOWANCE.flats), depth: round(height + NUT_ALLOWANCE.depth) };
    }
    case 'slot': {
      const width = CLEARANCE_NORMAL[size];
      return { block: kind, body, point, normal, size, length: 10, width, depth: null, along: 'x' };
    }
    case 'lip':
      return { block: kind, body, point, size, type: 'lip', width: 1.2, height: 2, gap: 0.2 };
    case 'snapFit':
      // About 1.4 % strain when it snaps in: within what printed PLA takes.
      return { block: kind, body, point, normal, size, length: 12, thickness: 1.5, width: 5, catchDepth: 0.8, catchLength: 1.5, hook: 'y+' };
  }
}

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

/** Normal clearance holes, ISO 273 medium series, in mm. */
const CLEARANCE_NORMAL: Record<BlockSize, number> = { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11 };

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

/** The SolidCraft commands of a block, in one batch: one feature, or a sketch and its feature. */
export function stepsOf(block: FeatureBlock): Step[] {
  const mm = (value: number) => `${String(round(value))} mm`;
  switch (block.block) {
    case 'text':
      return [
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false } },
        // SolidCraft's built-in font has no bold face; Arial comes with every Windows.
        { command: 'sketch.text', params: { text: block.text, at: [0, round(-block.height / 2)], height: block.height, align: 'center', ...(block.bold ? { font: BOLD_FONT, bold: true } : {}) } },
        { command: 'solid.emboss', params: { depth: mm(block.depth), mode: block.mode, face: block.point } },
      ];
    case 'nutTrap': {
      const length = Math.hypot(...block.normal) || 1;
      const bottom = block.point.map((value, i) => round6(value - ((block.normal[i] ?? 0) / length) * block.depth)) as Point;
      return [
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false } },
        { command: 'sketch.polygon.circumscribed', params: { center: [0, 0], radius: round(block.flats / 2), sides: 6 } },
        { command: 'solid.extrude', params: { distance: mm(-block.depth), operation: 'cut' } },
        { command: 'solid.hole', params: { position: bottom, clearance: block.size, fit: 'normal' } },
      ];
    }
    case 'slot': {
      const half = round(block.length / 2);
      const [p0, p1] = block.along === 'x' ? [[-half, 0], [half, 0]] : [[0, -half], [0, half]];
      return [
        { command: 'sketch.create', params: { plane: planeAt(block.point, block.normal), project_edges: false } },
        { command: 'sketch.slot.center_to_center', params: { p0, p1, width: block.width } },
        // "Through" cuts far beyond any printable part.
        { command: 'solid.extrude', params: { distance: mm(-(block.depth ?? 1000)), operation: 'cut' } },
      ];
    }
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
          },
        },
      ];
    case 'lip':
      return [{ command: 'plastic.lip', params: { face: block.point, type: block.type, width: mm(block.width), height: mm(block.height), ...(block.type === 'groove' ? { gap: mm(block.gap) } : {}) } }];
    default:
      return [stepOf(block)];
  }
}

/** The SolidCraft command of a block that is one feature. */
export function stepOf(block: Exclude<FeatureBlock, { block: 'text' | 'nutTrap' | 'slot' | 'lip' | 'snapFit' }>): Step {
  const mm = (value: number) => `${String(round(value))} mm`;
  switch (block.block) {
    case 'tappedHole':
      return { command: 'solid.hole', params: { position: block.point, thread: block.size, modeled: block.modeled, ...(block.depth ? { depth: mm(block.depth) } : {}) } };
    case 'screwHole': {
      const base = { position: block.point, clearance: block.size, fit: block.fit };
      if (block.head === 'cap') {
        const [diameter, height] = CAP_HEAD[block.size];
        return { command: 'solid.hole', params: { ...base, type: 'counterbore', cb_diameter: mm(diameter + 2 * HEAD_ALLOWANCE.diameter), cb_depth: mm(height + HEAD_ALLOWANCE.depth) } };
      }
      if (block.head === 'countersunk') {
        const diameter = COUNTERSUNK_HEAD[block.size] ?? CAP_HEAD[block.size][0];
        return { command: 'solid.hole', params: { ...base, type: 'countersink', cs_diameter: mm(diameter + HEAD_ALLOWANCE.diameter), cs_angle: '90 deg' } };
      }
      return { command: 'solid.hole', params: base };
    }
    case 'insertSeat':
      return { command: 'solid.hole', params: { position: block.point, diameter: mm(block.diameter), depth: mm(block.depth) } };
    case 'boss': {
      const insert = INSERT[block.size] ?? { diameter: 4, length: 5.7 };
      return {
        command: 'plastic.boss',
        params: { position: block.point, diameter: mm(block.diameter), height: mm(block.height), hole_diameter: mm(insert.diameter), hole_depth: mm(insert.length + 1) },
      };
    }
  }
}
