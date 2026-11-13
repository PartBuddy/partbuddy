/**
 * Pockets for disc magnets (standards of 2026-11-11). Magnets are made to ±0.1 mm (K&J, supermagnete);
 * the room round them is what makers of printed pockets publish, which runs from none to 0.5 mm on
 * the diameter (Gridfinity's plain hole), none of it printed here yet.
 */

import { DEFAULT_PRINTER, drawnHole, fitClearance, type ToolPrinter } from './toolFit';

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

export const MAGNET_HOLDS = ['glue', 'press'] as const;
export type MagnetHold = (typeof MAGNET_HOLDS)[number];

/**
 * In mm: how far the magnet lies under the face so nothing stands proud, the chamfer at the pocket's mouth, and the
 * plastic that must stay round a pocket (about three lines of a 0.4 mm nozzle). What must stay under it is the printer's
 * least floor or wall, which the block tool gives (audit H-22: 0.6 mm was under the print check's 0.8 mm floor).
 */
export const MAGNET = { sunk: 0.2, chamfer: 0.4, around: 1.2 };

/**
 * A pressed magnet's interference on the diameter, in mm: the pocket comes out this much under the magnet, the middle of
 * the 0.05 to 0.15 mm a press fit takes (audit MV-17), on every nozzle and material. The profile's clamp fit is room, not
 * interference (PLA 0.05 mm a side), and grows with the nozzle: a pocket of it held nothing (BC-16 review B2).
 */
export const PRESS_INTERFERENCE = 0.1;

/**
 * The room on the diameter the pocket leaves round the magnet as printed, in mm (audit MV-17, W16): dropped in on glue, the
 * material's push fit on both sides; pressed in, less than none, {@link PRESS_INTERFERENCE} under the magnet.
 */
export const magnetRoom = (hold: MagnetHold, printer: ToolPrinter) => (hold === 'press' ? -PRESS_INTERFERENCE : round(2 * fitClearance('push', printer)));

export interface MagnetSpec {
  body: string;
  /** The middle of the pocket, on the face it opens in. */
  point: Vec3;
  /** Out of that face. */
  normal: Vec3;
  more: Vec3[];
  /** The magnet: a disc of this diameter and height, in mm. */
  diameter: number;
  height: number;
  hold: MagnetHold;
  name: string;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
/** A direction to SolidCraft at full precision (audit T40: rounded to 0.001, a skew one was off its line); only a hair from zero is zero. */
const direction = (vector: Vec3) => vector.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)) as Vec3;

/** The pocket's diameter as it comes out of the printer, as it is drawn (the material's hole allowance wider), and its depth. */
export function magnetPocket(spec: Pick<MagnetSpec, 'diameter' | 'height' | 'hold'>, printer: ToolPrinter = DEFAULT_PRINTER): { diameter: number; drawn: number; depth: number } {
  const diameter = round(spec.diameter + magnetRoom(spec.hold, printer));
  return { diameter, drawn: drawnHole(diameter, printer.material), depth: round(spec.height + MAGNET.sunk) };
}

/**
 * The plastic each pocket needs: itself with what must stay round it and `under` it, as a cylinder into the face that
 * starts `from` mm under the point (a face may fall away that far, as a curved one does).
 */
export function magnetStock(spec: MagnetSpec, from: number, under: number, printer: ToolPrinter = DEFAULT_PRINTER): { at: Vec3; base: Vec3; axis: Vec3; diameter: number; depth: number; from: number }[] {
  const length = Math.hypot(...spec.normal);
  const axis = direction(spec.normal.map((value) => -value / length) as Vec3);
  const pocket = magnetPocket(spec, printer);
  return [spec.point, ...spec.more].map((point) => ({ at: point, base: point.map((value, k) => round(value + (axis[k] ?? 0) * from)) as Vec3, axis, diameter: round(pocket.drawn + 2 * MAGNET.around), depth: round(pocket.depth - from + under), from }));
}

/** How many pockets one call may add beside the first. */
export const MAGNET_MORE = 40;

/** What is wrong with a magnet pocket before anything is built; null when it can be built. */
export function magnetProblem(spec: MagnetSpec): string | null {
  if (Math.hypot(...spec.normal) < 1e-9) return 'normal must not be zero';
  if (!(spec.diameter >= 2 && spec.diameter <= 40)) return 'diameter must be 2–40 mm (the magnet)';
  if (!(spec.height >= 1 && spec.height <= 20)) return 'height must be 1–20 mm (the magnet)';
  if (spec.more.length > MAGNET_MORE) return `at most ${String(MAGNET_MORE)} further pockets`;
  return null;
}

/** The cuts of each pocket: the hole into the face, and a chamfer at its mouth to start the magnet. */
export function magnetSteps(spec: MagnetSpec, printer: ToolPrinter = DEFAULT_PRINTER): Step[] {
  const length = Math.hypot(...spec.normal);
  const into = direction(spec.normal.map((value) => -value / length) as Vec3);
  const { drawn, depth } = magnetPocket(spec, printer);
  const mm = (value: number) => `${String(round(value))} mm`;
  return [spec.point, ...spec.more].flatMap((point, i): Step[] => {
    const label = `${spec.name} ${String(i + 1)}`;
    return [
      { command: 'solid.cylinder', params: { diameter: mm(drawn), height: mm(depth), base: point.map(round), axis: into, operation: 'cut', targets: [spec.body], name: label } },
      { command: 'solid.cone', params: { diameter: mm(drawn + 2 * MAGNET.chamfer), top_diameter: mm(drawn), height: mm(MAGNET.chamfer), base: point.map(round), axis: into, operation: 'cut', targets: [spec.body], name: `${label} ◣` } },
    ];
  });
}
