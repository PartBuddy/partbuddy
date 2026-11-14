/**
 * Wall mounting for printed parts (standards of 2026-11-11): a keyhole slot to hang a part over a
 * screw in the wall, and a countersunk hole for a wood screw. Sizes by the screw, from the head
 * tables of the screws sold (DIN 7996, DIN 7997, SPAX, which are the largest) and DIN 74 for the
 * countersink, with what designers of printed keyholes publish for the rest.
 */

import { BRIDGE_SPAN } from '@partbuddy/geometry';

import { drawnHole, type ToolMaterial } from './toolFit';

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

export const WOOD_SCREWS = [3.5, 4, 4.5, 5] as const;
export type WoodScrew = (typeof WOOD_SCREWS)[number];

/**
 * Per wood screw, in mm: the keyhole's entry hole (head plus 0.5 mm per side) and slot (thread plus
 * 0.25 mm per side), the depth of the pocket for the head (DIN 7996's pan head, 2.35 / 2.8 / 3.1 / 3.5 mm high, plus 0.65
 * to 0.7 mm: audit MV-21), and the countersunk hole of DIN 74 form A. Holes as they come out of the printer: {@link wallSizes}
 * draws them wider by the material's hole allowance (BC-16 review S3; before, a fixed 0.2 mm on the DIN 74 hole and countersink).
 */
export const WALL: Record<WoodScrew, { entry: number; slot: number; pocket: number; clearance: number; countersink: number }> = {
  3.5: { entry: 8, slot: 4, pocket: 3, clearance: 3.9, countersink: 7.6 },
  4: { entry: 9, slot: 4.5, pocket: 3.5, clearance: 4.5, countersink: 8.6 },
  4.5: { entry: 10, slot: 5, pocket: 3.8, clearance: 5, countersink: 9.5 },
  5: { entry: 11, slot: 5.5, pocket: 4.2, clearance: 5.5, countersink: 10.4 },
};

/** A wood screw's sizes as drawn for the material: entry, slot, hole and countersink the hole allowance wider, the pocket's depth as it is. */
export function wallSizes(screw: WoodScrew, material?: ToolMaterial): (typeof WALL)[WoodScrew] {
  const size = WALL[screw];
  return { ...size, entry: drawnHole(size.entry, material), slot: drawnHole(size.slot, material), clearance: drawnHole(size.clearance, material), countersink: drawnHole(size.countersink, material) };
}

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
/** A direction to SolidCraft at full precision (audit T40: rounded to 0.001, a skew one was off its line); only a hair from zero is zero. */
const direction = (vector: Vec3) => vector.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)) as Vec3;
const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as Vec3;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * How far the sides of a keyhole's pocket lean in above it, {@link ROOF_LEAN} from upright, so that its flat roof, a bridge
 * with the face on the bed, spans no more than the print check bridges ({@link BRIDGE_SPAN}; audit MV-13); to a hundredth,
 * up. None where the entry is no wider. At 45° the print check took the slopes into the bridge and found it 11 mm wide
 * (SolidCraft 0.40.1, 2026-11-13).
 */
export function keyholeRoof(screw: WoodScrew, material?: ToolMaterial): number {
  return Math.ceil(Math.max(0, (wallSizes(screw, material).entry - BRIDGE_SPAN) / 2 / Math.tan((ROOF_LEAN * Math.PI) / 180)) * 100 - 1e-6) / 100;
}

/** How far from upright the sides under a keyhole's roof lean: under the 35° the least steep material of the catalogue takes (TPU). */
export const ROOF_LEAN = 30;

/** How thick the part must be at a keyhole: lip, pocket, its roof and what stays behind the head. */
export function keyholeDepth(screw: WoodScrew, material?: ToolMaterial): number {
  return round(KEYHOLE.lip + WALL[screw].pocket + keyholeRoof(screw, material) + KEYHOLE.behind);
}

/**
 * The plastic each keyhole needs: as thick as {@link keyholeDepth} behind the entry and behind where the screw
 * rests, as cylinders that start `from` mm under the face.
 */
export function keyholeStock(spec: KeyholeSpec, from: number, material?: ToolMaterial): { at: Vec3; base: Vec3; axis: Vec3; diameter: number; depth: number; from: number }[] {
  const [n, up] = [unit(spec.normal), unit(spec.up)];
  const axis = direction(n.map((value) => -value) as Vec3);
  const room = { axis, diameter: wallSizes(spec.screw, material).entry, depth: round(keyholeDepth(spec.screw, material) - from), from };
  const behind = (point: Vec3) => ({ at: point, base: point.map((value, k) => round(value + (axis[k] ?? 0) * from)) as Vec3, ...room });
  return [spec.point, ...spec.more].flatMap((rest) => [behind(rest), behind(rest.map((value, k) => round(value - (up[k] ?? 0) * KEYHOLE.travel)) as Vec3)]);
}

/** In mm: the clearance hole that must stay under a countersink for the screw to hold the plate (three layers of 0.2 mm; our own choice). */
export const WOOD_SCREW_UNDER = 0.6;

/** How deep the 90° countersink of a wood screw goes. */
export function countersinkDepth(screw: WoodScrew, material?: ToolMaterial): number {
  const size = wallSizes(screw, material);
  return round((size.countersink - size.clearance) / 2);
}

/**
 * The plastic one countersunk hole needs: the screw's diameter of plastic round its clearance hole (so the
 * countersink keeps about 2 mm, and a 15 mm tab takes a 4 mm screw), and the plate thicker than the countersink is
 * deep. `axis` is the way the hole went into the part, `from` how far under the face the cylinder starts; the hole
 * itself is taken off.
 */
export function woodScrewStock(screw: WoodScrew, point: Vec3, axis: Vec3, from: number, material?: ToolMaterial): { at: Vec3; base: Vec3; axis: Vec3; diameter: number; depth: number; from: number; hole: number; core: number; slack: number } {
  const size = wallSizes(screw, material);
  const cone = Math.max(0, countersinkDepth(screw, material) - from);
  // The 90° cone is as much wider than the clearance hole as it still has to go down.
  const [wide, narrow] = [size.clearance / 2 + cone, size.clearance / 2];
  const hole = (Math.PI * cone * (wide ** 2 + wide * narrow + narrow ** 2)) / 3 + Math.PI * narrow ** 2 * WOOD_SCREW_UNDER;
  // On a curved face the hole does not end where it ends on a flat one: 0.3 mm of its depth are allowed for that, inside
  // the widest the hole is (`core`, a hair wider so that no face of the probe lies on the hole's) alone; the wall round it is measured without.
  return { at: point, base: point.map((value, k) => round(value + (axis[k] ?? 0) * from)) as Vec3, axis, diameter: round(size.clearance + 2 * screw), depth: round(cone + WOOD_SCREW_UNDER), from, hole, core: round(wide * 2 + 0.02), slack: Math.PI * narrow ** 2 * 0.3 };
}

/** How many keyholes or wood screw holes one call may add beside the first. */
export const WALL_MORE = 20;

/** What is wrong with a keyhole before anything is built; null when it can be built. */
export function keyholeProblem(spec: KeyholeSpec): string | null {
  if (Math.hypot(...spec.normal) < 1e-9 || Math.hypot(...spec.up) < 1e-9) return 'normal and up must not be zero';
  const [n, u] = [unit(spec.normal), unit(spec.up)];
  if (Math.abs(n[0] * u[0] + n[1] * u[1] + n[2] * u[2]) > 1e-6) return 'up must be square to normal: the way up along the face against the wall';
  if (spec.more.length > WALL_MORE) return `at most ${String(WALL_MORE)} further keyholes`;
  return null;
}

/**
 * The cuts of a keyhole slot in the face against the wall: the entry hole for the head, a slot of
 * the thread's width above it through the lip, and behind the lip a pocket as wide as the entry,
 * in which the head travels up. Printed with that face on the bed the pocket's roof is a bridge of
 * the entry's width, at most {@link BRIDGE_SPAN} where the pocket's sides lean in above it ({@link keyholeRoof}),
 * and nothing needs support.
 */
export function keyholeSteps(spec: KeyholeSpec, material?: ToolMaterial): Step[] {
  const size = wallSizes(spec.screw, material);
  const [n, up] = [unit(spec.normal), unit(spec.up)];
  const into = direction(n.map((value) => -value) as Vec3);
  // Sketch x across the slot and y up, so that x × y points into the part: a positive distance cuts.
  const across = direction(cross(n, up));
  const roof = keyholeRoof(spec.screw, material);
  const mm = (value: number) => `${String(round(value))} mm`;
  return [spec.point, ...spec.more].flatMap((rest, i): Step[] => {
    const label = `${spec.name} ${String(i + 1)}`;
    const entry = rest.map((value, k) => round(value - (up[k] ?? 0) * KEYHOLE.travel)) as Vec3;
    const slot = (name: string, depthFrom: number, width: number, distance: number, taper?: string): Step[] => [
      { command: 'sketch.create', params: { plane: { origin: rest.map((value, k) => round(value - (n[k] ?? 0) * depthFrom)), x_dir: across, y_dir: direction(up) }, project_edges: false, name } },
      { command: 'sketch.slot.center_to_center', params: { p0: [0, -KEYHOLE.travel], p1: [0, 0], width } },
      { command: 'solid.extrude', params: { distance: mm(distance), ...(taper ? { taper } : {}), operation: 'cut', targets: [spec.body], name } },
    ];
    return [
      { command: 'solid.cylinder', params: { diameter: mm(size.entry), height: mm(KEYHOLE.lip + size.pocket), base: entry, axis: into, operation: 'cut', targets: [spec.body], name: label } },
      ...slot(`${label} ·`, 0, size.slot, KEYHOLE.lip),
      ...slot(`${label} ○`, KEYHOLE.lip, size.entry, size.pocket),
      // Its sides lean in above the pocket, so the flat of its roof is a bridge the print check passes.
      ...(roof > 0 ? slot(`${label} ⌂`, KEYHOLE.lip + size.pocket, size.entry, roof, `-${String(ROOF_LEAN)} deg`) : []),
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
export function woodScrewSteps(spec: WoodScrewSpec, material?: ToolMaterial): Step[] {
  const size = wallSizes(spec.screw, material);
  return [spec.point, ...spec.more].map((point, i) => ({
    command: 'solid.hole',
    params: { position: point.map(round), diameter: `${String(size.clearance)} mm`, type: 'countersink', cs_diameter: `${String(size.countersink)} mm`, cs_angle: '90 deg', targets: [spec.body], name: `${spec.name} ${String(i + 1)}` },
  }));
}
