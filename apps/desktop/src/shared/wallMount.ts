/**
 * Wall mounting for printed parts (standards of 2026-11-11): a keyhole slot to hang a part over a
 * screw in the wall, and a countersunk hole for a wood screw. Sizes by the screw, from the head
 * tables of the screws sold (DIN 7996, DIN 7997, SPAX, which are the largest) and DIN 74 for the
 * countersink, with what designers of printed keyholes publish for the rest.
 */

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

export const WOOD_SCREWS = [3.5, 4, 4.5, 5] as const;
export type WoodScrew = (typeof WOOD_SCREWS)[number];

/**
 * Per wood screw, in mm: the keyhole's entry hole (head plus 0.5 mm per side) and slot (thread plus
 * 0.25 mm per side), the depth of the pocket for the head (a pan head's height plus 0.6 mm), and
 * the countersunk hole of DIN 74 form A with 0.2 mm more for print.
 */
export const WALL: Record<WoodScrew, { entry: number; slot: number; pocket: number; clearance: number; countersink: number }> = {
  3.5: { entry: 8, slot: 4, pocket: 3, clearance: 4.1, countersink: 7.8 },
  4: { entry: 9, slot: 4.5, pocket: 3.5, clearance: 4.7, countersink: 8.8 },
  4.5: { entry: 10, slot: 5, pocket: 3.8, clearance: 5.2, countersink: 9.7 },
  5: { entry: 11, slot: 5.5, pocket: 4.2, clearance: 5.7, countersink: 10.6 },
};

/**
 * How far the screw travels up the slot, and the lip of the slot in front of the head. The lip has
 * no published rule; 2 mm are ten layers, which the head pulls on across their bonds.
 */
export const KEYHOLE = { travel: 8, lip: 2, behind: 1.2 };

export interface KeyholeSpec {
  body: string;
  /** Where the screw rests when the part hangs: the upper end of the slot, on the face against the wall. */
  point: Vec3;
  /** Out of that face, towards the wall. */
  normal: Vec3;
  /** Up, as the part hangs; square to the normal. */
  up: Vec3;
  screw: WoodScrew;
  /** Further keyholes: where each screw rests. */
  more: Vec3[];
  name: string;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as Vec3;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** How thick the part must be at a keyhole: lip, pocket and what stays behind the head. */
export function keyholeDepth(screw: WoodScrew): number {
  return round(KEYHOLE.lip + WALL[screw].pocket + KEYHOLE.behind);
}

/** What is wrong with a keyhole before anything is built; null when it can be built. */
export function keyholeProblem(spec: KeyholeSpec): string | null {
  if (Math.hypot(...spec.normal) < 1e-9 || Math.hypot(...spec.up) < 1e-9) return 'normal and up must not be zero';
  const [n, u] = [unit(spec.normal), unit(spec.up)];
  if (Math.abs(n[0] * u[0] + n[1] * u[1] + n[2] * u[2]) > 1e-6) return 'up must be square to normal: the way up along the face against the wall';
  if (spec.more.length > 20) return 'at most 20 further keyholes';
  return null;
}

/**
 * The cuts of a keyhole slot in the face against the wall: the entry hole for the head, a slot of
 * the thread's width above it through the lip, and behind the lip a pocket as wide as the entry,
 * in which the head travels up. Printed with that face on the bed the pocket's roof is a bridge of
 * the entry's width, and nothing needs support.
 */
export function keyholeSteps(spec: KeyholeSpec): Step[] {
  const size = WALL[spec.screw];
  const [n, up] = [unit(spec.normal), unit(spec.up)];
  const into = n.map((value) => round(-value) + 0) as Vec3;
  // Sketch x across the slot and y up, so that x × y points into the part: a positive distance cuts.
  const across = cross(n, up).map((value) => round(value) + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  return [spec.point, ...spec.more].flatMap((rest, i): Step[] => {
    const label = `${spec.name} ${String(i + 1)}`;
    const entry = rest.map((value, k) => round(value - (up[k] ?? 0) * KEYHOLE.travel)) as Vec3;
    const slot = (name: string, depthFrom: number, width: number, distance: number): Step[] => [
      { command: 'sketch.create', params: { plane: { origin: rest.map((value, k) => round(value - (n[k] ?? 0) * depthFrom)), x_dir: across, y_dir: up.map((value) => round(value) + 0) }, project_edges: false, name } },
      { command: 'sketch.slot.center_to_center', params: { p0: [0, -KEYHOLE.travel], p1: [0, 0], width } },
      { command: 'solid.extrude', params: { distance: mm(distance), operation: 'cut', targets: [spec.body], name } },
    ];
    return [
      { command: 'solid.cylinder', params: { diameter: mm(size.entry), height: mm(KEYHOLE.lip + size.pocket), base: entry, axis: into, operation: 'cut', targets: [spec.body], name: label } },
      ...slot(`${label} ·`, 0, size.slot, KEYHOLE.lip),
      ...slot(`${label} ○`, KEYHOLE.lip, size.entry, size.pocket),
    ];
  });
}

export interface WoodScrewSpec {
  body: string;
  /** Where the screw goes in, on the face away from the wall. */
  point: Vec3;
  more: Vec3[];
  screw: WoodScrew;
  name: string;
}

/** Countersunk holes for wood screws: clearance and a 90° countersink the head lies flush in (DIN 74 form A). */
export function woodScrewSteps(spec: WoodScrewSpec): Step[] {
  const size = WALL[spec.screw];
  return [spec.point, ...spec.more].map((point, i) => ({
    command: 'solid.hole',
    params: { position: point.map(round), diameter: `${String(size.clearance)} mm`, type: 'countersink', cs_diameter: `${String(size.countersink)} mm`, cs_angle: '90 deg', targets: [spec.body], name: `${spec.name} ${String(i + 1)}` },
  }));
}
