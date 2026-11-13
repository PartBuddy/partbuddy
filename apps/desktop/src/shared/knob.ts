/**
 * A knob for a shaft (standards of 2026-11-11): a potentiometer's or encoder's D shaft, a split
 * knurled shaft, or a round shaft held by a set screw. The shafts are those of the data sheets
 * (Bourns PEC11R, Alps RK09: 6 mm, flat at 4.5 mm; the flat 7 mm long on the PEC11R, 6 mm on the RK09 with a 15 mm
 * shaft: audit MV-15); the rest is what makers of printed knobs publish, none of it printed here yet.
 */

import { pilotHole } from './screwSizes';
import { DEFAULT_PRINTER, fitClearance, holeRoom, type ToolPrinter } from './toolFit';

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

export const KNOB_SHAFTS = ['d', 'round', 'knurl'] as const;
export type KnobShaft = (typeof KNOB_SHAFTS)[number];

/**
 * In mm: the plastic over the shaft's end, the wall left round the bore under the flutes, how far
 * the shaft goes in at the most, how much of that is flat on a D shaft (the shortest flat sold),
 * the flutes (as a screw lid's), the plain band and its chamfer at the top, the chamfer at the bore's
 * mouth, the pointer's groove,
 * and the pilot hole an M3 set screw cuts its own thread in (screwSizes.ts, as standards.ts: audit MV-26).
 */
export const KNOB = { roof: 3, wall: 2.4, insert: 11, flat: 6, flute: 3, band: 2, chamfer: 0.6, mouth: 0.5, pointer: { width: 1.2, depth: 0.6 }, setScrew: pilotHole(3) };

/** In mm: the M3 set screw holds in plastic at least twice its diameter long (TR Fastenings: engagement ≥ 2 d; audit MV-26). */
export const SET_SCREW_HOLD = 6;

/**
 * The room added to the shaft's diameter as printed: a D and a round shaft go in snugly, the material's clamp fit on each
 * side (audit W16, T10: 0.2 mm fixed, which PP's hole allowance of 0.3 mm took); a split knurled shaft springs into a
 * plain bore of its own size.
 */
export const knobClearance = (shaft: KnobShaft, printer: ToolPrinter) => (shaft === 'knurl' ? 0 : round(Math.min(KNOB_CLEARANCE_MOST, Math.max(0, 2 * fitClearance('clamp', printer)))));

/** The most clearance a knob takes (knobProblem); a measured clamp fit is kept within 0 and this. */
const KNOB_CLEARANCE_MOST = 0.6;

export interface KnobSpec {
  /** The new body's name. */
  body: string;
  /** The centre of the knob's underside, where the shaft goes in. */
  point: Vec3;
  /** The way the shaft points: from the underside to the top. */
  axis: Vec3;
  /** The way the pointer points, across the axis; what of it runs along the axis is dropped. */
  toward: Vec3;
  shaft: KnobShaft;
  shaftDiameter: number;
  /** A D shaft's thickness at its flat, measured through the middle. */
  flat: number;
  diameter: number;
  height: number;
  /** Added to the shaft's diameter and to its flat, as printed; the bore is drawn wider by the material's hole allowance. */
  clearance: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
/** A direction to SolidCraft at full precision (audit T40: rounded to 0.001, a skew one was off its line); only a hair from zero is zero. */
const direction = (vector: Vec3) => vector.map((value) => (Math.abs(value) < 1e-12 ? 0 : value)) as Vec3;
const unit = (vector: Vec3): Vec3 => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as Vec3;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The flat of a D shaft where the data sheets agree on one; elsewhere it must be measured. */
export function knobFlat(shaftDiameter: number): number | null {
  return shaftDiameter === 6 ? 4.5 : null;
}

/** How far the shaft goes into the knob. */
export function knobInsert(spec: Pick<KnobSpec, 'height'>): number {
  return round(Math.min(KNOB.insert, spec.height - KNOB.roof));
}

/**
 * How many flutes go round a knob: one about every 7 mm, as round a screw lid, and an even number, so none lies opposite
 * the pointer, where the set screw comes in (audit T46).
 */
export function knobFlutes(diameter: number): number {
  return Math.max(8, 2 * Math.round((Math.PI * diameter) / 14));
}

/** What is wrong with a knob before anything is built; null when it can be built. */
export function knobProblem(spec: KnobSpec): string | null {
  if (Math.hypot(...spec.axis) < 1e-9) return 'normal must not be zero';
  const axis = unit(spec.axis);
  if (Math.hypot(...cross(axis, spec.toward)) < 1e-6) return 'up (the way the pointer points) must not run along normal (the shaft)';
  if (!(spec.shaftDiameter >= 3 && spec.shaftDiameter <= 10)) return 'shaftDiameter must be 3–10 mm';
  if (!(spec.clearance >= 0 && spec.clearance <= KNOB_CLEARANCE_MOST)) return `clearance must be 0–${String(KNOB_CLEARANCE_MOST)} mm`;
  if (spec.shaft === 'd' && !(spec.flat > spec.shaftDiameter / 2 && spec.flat < spec.shaftDiameter)) return `flat must be the D shaft's thickness at its flat, between ${String(spec.shaftDiameter / 2)} and ${String(spec.shaftDiameter)} mm (4.5 on a 6 mm shaft)`;
  const least = Math.ceil(spec.shaftDiameter + spec.clearance + 2 * KNOB.wall + KNOB.flute / 2);
  if (!(spec.diameter >= least && spec.diameter <= 80)) return `diameter must be ${String(least)}–80 mm for a ${String(spec.shaftDiameter)} mm shaft`;
  const held = Math.ceil(spec.shaftDiameter + spec.clearance + 2 * SET_SCREW_HOLD);
  if (spec.shaft === 'round' && spec.diameter < held) return `diameter must be ${String(held)}–80 mm for a round ${String(spec.shaftDiameter)} mm shaft: the M3 set screw holds in at least ${String(SET_SCREW_HOLD)} mm of plastic beside the bore (twice its diameter)`;
  if (!(spec.height >= 6 + KNOB.roof && spec.height <= 60)) return `height must be ${String(6 + KNOB.roof)}–60 mm: the shaft goes in 6 mm at the least, under ${String(KNOB.roof)} mm of roof`;
  return null;
}

/**
 * The solids of a knob standing on its underside at `point`: a cylinder with a chamfered plain band
 * at the top, flutes round it for the fingers, a bore for the shaft from below, in it the flat of a
 * D shaft or beside it the pilot hole of a set screw, and a groove on the top as the pointer. It
 * prints on its top, the bore open upwards, without support; the print face is set so.
 */
export function knobSteps(spec: KnobSpec, printer: ToolPrinter = DEFAULT_PRINTER): Step[] {
  const axis = unit(spec.axis);
  const along = dot(spec.toward, axis);
  const toward = unit(spec.toward.map((value, i) => value - along * (axis[i] ?? 0)) as Vec3);
  const side = cross(axis, toward);
  const mm = (value: number) => `${String(round(value))} mm`;
  const tidy = direction;
  /** A point `up` above the underside, `out` towards the pointer and `across` square to both. */
  const at = (up: number, out = 0, across = 0) => spec.point.map((value, i) => round(value + (axis[i] ?? 0) * up + (toward[i] ?? 0) * out + (side[i] ?? 0) * across)) as Vec3;
  const radius = spec.diameter / 2;
  // The bore as it comes out, drawn wider by the material's hole allowance (audit S-10); the flat moves out by half of it.
  const allowance = holeRoom(spec.shaftDiameter + spec.clearance, printer.material);
  const bore = spec.shaftDiameter + spec.clearance + allowance;
  const insert = knobInsert(spec);
  const flutes = knobFlutes(spec.diameter);
  const half = Math.PI / flutes;
  const name = spec.body;
  const steps: Step[] = [
    { command: 'solid.cylinder', params: { diameter: mm(spec.diameter), height: mm(spec.height - KNOB.chamfer), base: at(0), axis: tidy(axis), operation: 'new', body_name: name, name } },
    { command: 'solid.cone', params: { diameter: mm(spec.diameter), top_diameter: mm(spec.diameter - 2 * KNOB.chamfer), height: mm(KNOB.chamfer), base: at(spec.height - KNOB.chamfer), axis: tidy(axis), operation: 'join', targets: [name], name: `${name} ◢` } },
    // The flutes stop under the plain band, and the pointer lies between two of them.
    { command: 'solid.cylinder', params: { diameter: mm(KNOB.flute), height: mm(spec.height - KNOB.band), base: at(0, (radius + KNOB.flute / 4) * Math.cos(half), (radius + KNOB.flute / 4) * Math.sin(half)), axis: tidy(axis), operation: 'cut', targets: [name], name: `${name} ◆` } },
    { command: 'solid.pattern.circular', params: { features: [`${name} ◆`], axis: { origin: at(0), dir: tidy(axis) }, count: flutes } },
    { command: 'solid.cylinder', params: { diameter: mm(bore), height: mm(insert), base: at(0), axis: tidy(axis), operation: 'cut', targets: [name], name: `${name} ○` } },
    // The shaft finds its way in; printed on its top, the mouth is the last layer and needs no support.
    { command: 'solid.cone', params: { diameter: mm(bore + 2 * KNOB.mouth), top_diameter: mm(bore), height: mm(KNOB.mouth), base: at(0), axis: tidy(axis), operation: 'cut', targets: [name], name: `${name} ◣` } },
  ];
  if (spec.shaft === 'd') {
    // The flat fills the bore's end again, on the side away from the pointer; the entry stays round, as the shaft is below its flat.
    const length = Math.min(KNOB.flat, insert);
    const edge = spec.flat - spec.shaftDiameter / 2 + (spec.clearance + allowance) / 2;
    const [near, far, wide] = [round(-edge), round(-(bore / 2 + 0.5)), round(bore / 2)];
    steps.push(
      // Sketch x towards the pointer, y across: x × y is the shaft's direction, so the flat grows into the bore.
      { command: 'sketch.create', params: { plane: { origin: at(insert - length), x_dir: tidy(toward), y_dir: tidy(side) }, project_edges: false, name: `${name} ▬` } },
      { command: 'sketch.line', params: { points: [[near, -wide], [near, wide], [far, wide], [far, -wide]], closed: true } },
      { command: 'solid.extrude', params: { distance: mm(length), operation: 'join', targets: [name], name: `${name} ▬` } },
    );
  }
  if (spec.shaft === 'round') {
    // The set screw comes in from the side away from the pointer, half way up the bore.
    steps.push({ command: 'solid.cylinder', params: { diameter: mm(pilotHole(3, printer.material)), height: mm(radius + 1), base: at(insert / 2, -(radius + 1)), axis: tidy(toward), operation: 'cut', targets: [name], name: `${name} ⊙` } });
  }
  steps.push(
    // Sketch x across, y towards the pointer: x × y points down into the knob, so a positive distance cuts.
    { command: 'sketch.create', params: { plane: { origin: at(spec.height), x_dir: tidy(side), y_dir: tidy(toward) }, project_edges: false, name: `${name} ▸` } },
    { command: 'sketch.slot.center_to_center', params: { p0: [0, round(radius * 0.35)], p1: [0, round(radius)], width: KNOB.pointer.width } },
    { command: 'solid.extrude', params: { distance: mm(KNOB.pointer.depth), operation: 'cut', targets: [name], name: `${name} ▸` } },
    { command: 'body.print_face', params: { body: name, point: at(spec.height) } },
  );
  return steps;
}
