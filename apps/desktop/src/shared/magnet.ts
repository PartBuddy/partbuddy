/**
 * Pockets for disc magnets (standards of 2026-11-11). Magnets are made to ±0.1 mm (K&J, supermagnete);
 * the room round them is what makers of printed pockets publish, which runs from none to 0.5 mm on
 * the diameter (Gridfinity's plain hole), none of it printed here yet.
 */

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

export const MAGNET_HOLDS = ['glue', 'press'] as const;
export type MagnetHold = (typeof MAGNET_HOLDS)[number];

/**
 * In mm: what is added to the magnet's diameter (to drop it in on a drop of glue, or to press it in),
 * how far it lies under the face so nothing stands proud, the chamfer at the pocket's mouth, and the
 * plastic that must stay round a pocket (about three lines of a 0.4 mm nozzle). What must stay under it is the printer's
 * least floor or wall, which the block tool gives (audit H-22: 0.6 mm was under the print check's 0.8 mm floor).
 */
export const MAGNET = { room: { glue: 0.3, press: 0.1 }, sunk: 0.2, chamfer: 0.4, around: 1.2 };

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

/** The pocket's diameter and depth. */
export function magnetPocket(spec: Pick<MagnetSpec, 'diameter' | 'height' | 'hold'>): { diameter: number; depth: number } {
  return { diameter: round(spec.diameter + MAGNET.room[spec.hold]), depth: round(spec.height + MAGNET.sunk) };
}

/**
 * The plastic each pocket needs: itself with what must stay round it and `under` it, as a cylinder into the face that
 * starts `from` mm under the point (a face may fall away that far, as a curved one does).
 */
export function magnetStock(spec: MagnetSpec, from: number, under: number): { at: Vec3; base: Vec3; axis: Vec3; diameter: number; depth: number; from: number }[] {
  const length = Math.hypot(...spec.normal);
  const axis = direction(spec.normal.map((value) => -value / length) as Vec3);
  const pocket = magnetPocket(spec);
  return [spec.point, ...spec.more].map((point) => ({ at: point, base: point.map((value, k) => round(value + (axis[k] ?? 0) * from)) as Vec3, axis, diameter: round(pocket.diameter + 2 * MAGNET.around), depth: round(pocket.depth - from + under), from }));
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
export function magnetSteps(spec: MagnetSpec): Step[] {
  const length = Math.hypot(...spec.normal);
  const into = direction(spec.normal.map((value) => -value / length) as Vec3);
  const pocket = magnetPocket(spec);
  const mm = (value: number) => `${String(round(value))} mm`;
  return [spec.point, ...spec.more].flatMap((point, i): Step[] => {
    const label = `${spec.name} ${String(i + 1)}`;
    return [
      { command: 'solid.cylinder', params: { diameter: mm(pocket.diameter), height: mm(pocket.depth), base: point.map(round), axis: into, operation: 'cut', targets: [spec.body], name: label } },
      { command: 'solid.cone', params: { diameter: mm(pocket.diameter + 2 * MAGNET.chamfer), top_diameter: mm(pocket.diameter), height: mm(MAGNET.chamfer), base: point.map(round), axis: into, operation: 'cut', targets: [spec.body], name: `${label} ◣` } },
    ];
  });
}
