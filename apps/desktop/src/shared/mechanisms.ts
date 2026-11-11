/**
 * Mechanisms the assistant builds with one call (ADR 0027, plan step G3): proven print-in-place
 * geometry between two bodies, made of SolidCraft's own solids, so a hinge does not depend on the
 * model getting gaps and knuckles right. The joint, its limits and the check of the range follow
 * in the tool (`mechanismTool.ts`).
 */

import { CAP_HEAD, COUNTERSUNK_HEAD, HEAD_ALLOWANCE, INSERT, type BlockSize } from './screwSizes';

type Vec3 = [number, number, number];
type Step = { command: string; params: Record<string, unknown> };

export interface HingeSpec {
  /** The body that stays and carries the pin. */
  fixed: string;
  /** The body that turns. */
  moving: string;
  /** The ends of the hinge line, in the gap between the two bodies. */
  from: Vec3;
  to: Vec3;
  /** Outer diameter of the barrel in mm. */
  diameter: number;
  /** The gap between the two parts everywhere, along the axis and around the pin, in mm. */
  gap: number;
  /** How many knuckles, odd: the outer ones belong to the fixed body. */
  knuckles: number;
  /** The hinge's name, in the user's language; the features carry it. */
  name: string;
}

/** A printed wall around the pin's bore thinner than this breaks when the hinge is freed (mm). */
const MIN_BARREL_WALL = 0.8;
/** A knuckle shorter than this is too weak to hold the pin (mm). */
const MIN_KNUCKLE = 2.5;

const round = (value: number) => Math.round(value * 1000) / 1000;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The pin's diameter: half the barrel, never under 2 mm. */
export function pinDiameter(diameter: number): number {
  return round(Math.max(2, diameter / 2));
}

/** What is wrong with a hinge before anything is built, in words the model can act on; null when it can be built. */
export function hingeProblem(spec: HingeSpec): string | null {
  const length = Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0)));
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (!(spec.diameter >= 4 && spec.diameter <= 40)) return 'diameter must be 4–40 mm';
  if (!(spec.gap >= 0.2 && spec.gap <= 1)) return 'gap must be 0.2–1 mm';
  if (!Number.isInteger(spec.knuckles) || spec.knuckles < 3 || spec.knuckles > 9 || spec.knuckles % 2 === 0) return 'knuckles must be 3, 5, 7 or 9';
  const wall = (spec.diameter - pinDiameter(spec.diameter)) / 2 - spec.gap;
  if (wall < MIN_BARREL_WALL) return `the barrel wall around the pin would be ${String(round(wall))} mm; use a diameter of at least ${String(Math.ceil((MIN_BARREL_WALL + spec.gap) * 4))} mm`;
  const roof = spec.diameter / 2 - (pinDiameter(spec.diameter) / 2 + spec.gap) * ROOF_TOP;
  if (roof < 0.6) return `the barrel would be ${String(round(roof))} mm thin over the bore's roof; use a larger diameter or a smaller gap`;
  const knuckle = (length - (spec.knuckles - 1) * spec.gap) / spec.knuckles;
  if (knuckle < MIN_KNUCKLE) return `from and to are ${String(round(length))} mm apart, which leaves ${String(round(knuckle))} mm per knuckle; use fewer knuckles or a longer hinge line (at least ${String(MIN_KNUCKLE)} mm each)`;
  return null;
}

/**
 * The solids of a print-in-place hinge along the line `from`–`to`: knuckles in turn on the fixed
 * and the moving body, a pin through all of them that belongs to the fixed body, and the same gap
 * between the parts everywhere. Each knuckle first clears its room in the other body, so the two
 * plates may reach up to the hinge line.
 */
export function hingeSteps(spec: HingeSpec): Step[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const length = Math.hypot(...delta);
  const axis = delta.map((value) => round(value / length)) as Vec3;
  const at = (distance: number) => spec.from.map((value, i) => round(value + (axis[i] ?? 0) * distance)) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const knuckle = (length - (spec.knuckles - 1) * spec.gap) / spec.knuckles;
  const pin = pinDiameter(spec.diameter);
  const cylinder = (diameter: number, start: number, end: number, operation: 'cut' | 'join', target: string, name: string): Step => ({
    command: 'solid.cylinder',
    params: { diameter: mm(diameter), height: mm(end - start), base: at(start), axis, operation, targets: [target], name },
  });
  const spans = Array.from({ length: spec.knuckles }, (_, i) => {
    const start = i * (knuckle + spec.gap);
    return { start, end: start + knuckle, owner: i % 2 === 0 ? spec.fixed : spec.moving, other: i % 2 === 0 ? spec.moving : spec.fixed, label: `${spec.name} ${String(i + 1)}` };
  });
  return [
    // Room for each knuckle in the other body, a gap wider all round and at both ends: past the ends of the
    // hinge line too, where a body wider than the hinge would otherwise lie against the outer knuckles
    // (found 2026-11-10: the parts touched there, and SolidCraft's sweep ran out of its collision budget).
    ...spans.map((span) => cylinder(spec.diameter + 2 * spec.gap, span.start - spec.gap, span.end + spec.gap, 'cut', span.other, `${span.label} ·`)),
    ...spans.map((span) => cylinder(spec.diameter, span.start, span.end, 'join', span.owner, span.label)),
    // The bore through the moving knuckles, then the pin through everything.
    cylinder(pin + 2 * spec.gap, -spec.gap, length + spec.gap, 'cut', spec.moving, `${spec.name} ○`),
    ...boreRoof(spec, axis, at(-spec.gap), length + 2 * spec.gap, pin / 2 + spec.gap),
    cylinder(pin, 0, length, 'join', spec.fixed, `${spec.name} ●`),
  ];
}

/** How far above the axis the roof of a bore of radius 1 is cut flat: the bridge left is 0.43 of the radius wide. */
export const ROOF_TOP = 1.2;

/**
 * The roof of the bore when the hinge prints lying (its line level): the round top of a hole sags, and here only the
 * gap is left above the pin. Two flanks at 45° rise from the bore and a short flat closes them (a teardrop cut off),
 * so the bore prints as drawn. An upright hinge needs none.
 */
function boreRoof(spec: HingeSpec, axis: Vec3, origin: Vec3, distance: number, radius: number): Step[] {
  if (Math.abs(axis[2]) > 1e-6) return [];
  const side = radius / Math.SQRT2;
  const flat = radius * (Math.SQRT2 - ROOF_TOP);
  const points: [number, number][] = [
    [-side, side],
    [side, side],
    [flat, radius * ROOF_TOP],
    [-flat, radius * ROOF_TOP],
  ];
  const name = `${spec.name} △`;
  return [
    // Sketch x across the line, y up: x × y is the line's direction.
    { command: 'sketch.create', params: { plane: { origin: origin.map(round), x_dir: cross([0, 0, 1], axis).map(round), y_dir: [0, 0, 1] }, project_edges: false, name } },
    { command: 'sketch.line', params: { points: points.map(([x, y]) => [round(x), round(y)]), closed: true } },
    { command: 'solid.extrude', params: { distance: `${String(round(distance))} mm`, operation: 'cut', targets: [spec.moving], name } },
  ];
}

export interface SlideSpec {
  /** The body that stays and carries the rail. */
  fixed: string;
  /** The body that slides; it lies over the rail and gets the groove. */
  moving: string;
  /** The ends of the rail's middle line, on the face of the fixed body the rail stands on. */
  from: Vec3;
  to: Vec3;
  /** The way the rail stands out of that face (its normal). */
  up: Vec3;
  /** Width of the rail at its foot in mm; it widens by its height on each side (45° flanks print without support). */
  width: number;
  /** Height of the rail in mm. */
  height: number;
  /** The gap between rail and groove in mm. */
  gap: number;
  name: string;
}


/** What is wrong with a guide before anything is built; null when it can be built. */
export function slideProblem(spec: SlideSpec): string | null {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const length = Math.hypot(...delta);
  const up = Math.hypot(...spec.up);
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (length < 5) return 'from and to must be at least 5 mm apart';
  if (up < 1e-9) return 'up must not be zero';
  if (Math.abs(delta.reduce((sum, value, i) => sum + value * (spec.up[i] ?? 0), 0)) > 1e-6 * length * up) return 'up must be square to the line from–to (the normal of the face the rail stands on)';
  if (!(spec.width >= 2 && spec.width <= 60)) return 'width must be 2–60 mm';
  if (!(spec.height >= 1.5 && spec.height <= 20)) return 'height must be 1.5–20 mm';
  if (!(spec.gap >= 0.2 && spec.gap <= 1)) return 'gap must be 0.2–1 mm';
  return null;
}

/**
 * The solids of a dovetail guide along the line `from`–`to`: a rail on the fixed body that widens
 * upwards at 45°, and its groove in the moving body, a gap wider all round. Both are a sketch at
 * `from`, square to the line, extruded along it.
 */
export function slideSteps(spec: SlideSpec): Step[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const length = Math.hypot(...delta);
  const axis = delta.map((value) => value / length) as Vec3;
  const upLength = Math.hypot(...spec.up);
  const up = spec.up.map((value) => value / upLength) as Vec3;
  // Sketch x across the rail, y up: x × y is the line's direction, so a positive distance runs along it.
  const plane = { origin: spec.from.map(round), x_dir: cross(up, axis).map(round), y_dir: up.map(round) };
  const half = spec.width / 2;
  const { height, gap } = spec;
  // The flank moved out by the gap, measured square to it.
  const out = gap * Math.SQRT2;
  const profile = (points: [number, number][], operation: 'cut' | 'join', target: string, name: string): Step[] => [
    { command: 'sketch.create', params: { plane, project_edges: false, name } },
    { command: 'sketch.line', params: { points: points.map(([x, y]) => [round(x), round(y)]), closed: true } },
    { command: 'solid.extrude', params: { distance: `${String(round(length))} mm`, operation, targets: [target], name } },
  ];
  return [
    // The groove first: it also reaches a little below the face, so the moving body stands clear of the rail's foot.
    ...profile(
      [
        [-(half + out), -gap],
        [half + out, -gap],
        [half + out, 0],
        [half + out + height + gap, height + gap],
        [-(half + out + height + gap), height + gap],
        [-(half + out), 0],
      ],
      'cut',
      spec.moving,
      `${spec.name} ·`,
    ),
    ...profile(
      [
        [-half, 0],
        [half, 0],
        [half + height, height],
        [-(half + height), height],
      ],
      'join',
      spec.fixed,
      spec.name,
    ),
  ];
}

/** A length as it is at the start and, where the caller has parameters (a template), the expression it follows; a plain number stays as it is. */
export type Size = number | { at: number; expr: string };
const at = (size: Size): number => (typeof size === 'number' ? size : size.at);
const ex = (size: Size): string => (typeof size === 'number' ? `${String(round(size))} mm` : `(${size.expr})`);

export interface LipSpec {
  /** The box: its wall gets the rille the bead snaps into. */
  fixed: string;
  /** The lid: it gets the lip, the bead and the notch. */
  moving: string;
  /** The lid's inner room at its rim, as built: opposite corners in x and y. */
  min: [Size, Size];
  max: [Size, Size];
  /** The height (z) of the lid's rim. */
  rim: Size;
  /** The way the lip stands out of that rim: 1 up (the lid lies open side up), -1 down (the lid sits on the box). */
  up: 1 | -1;
  /** The radius of the room's corners; under 2 mm the lip gets sharp corners. */
  radius: Size;
  /** The lid's wall thickness, which the notch goes through. */
  wall: Size;
  /** The wall with the catch and the notch; opposite the hinge, where there is one. */
  side: 'x-' | 'x+' | 'y-' | 'y+';
  /**
   * The hinge line the lid turns half a turn about to close, along x or along y: the other coordinate of
   * the line and its height. Without it the lid is built where it closes.
   */
  hinge?: { along: 'x' | 'y'; across: Size; z: Size };
  name: string;
}

/**
 * The snap closure of a printed lid, by the usual sizes for a 0.4 mm nozzle: the lip 1.2 mm thick and 4 mm high,
 * 0.25 mm clear of the box's wall; the bead 0.5 mm proud, so 0.25 mm of catch, with 45° flanks, 14 mm long in the
 * middle of a wall (never in a corner, which cannot give way); the rille 0.2 mm deeper than the bead reaches.
 */
export const LIP = { thick: 1.2, high: 4, clear: 0.25, foot: 3, bead: 0.5, beadLong: 14, notch: 16 };

/** What is wrong with a closure before anything is built; null when it can be built. */
export function lipProblem(spec: LipSpec): string | null {
  const span = spec.side.startsWith('y') ? at(spec.max[0]) - at(spec.min[0]) : at(spec.max[1]) - at(spec.min[1]);
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (!(at(spec.max[0]) - at(spec.min[0]) >= 12 && at(spec.max[1]) - at(spec.min[1]) >= 12)) return 'from and to must be opposite corners of the lid\'s inner room, at least 12 mm apart in x and in y';
  if (span < LIP.beadLong + 2 * Math.max(at(spec.radius), 2) + 2) return `the wall with the catch is ${String(round(span))} mm long inside; the bead needs ${String(LIP.beadLong + 2 * Math.max(at(spec.radius), 2) + 2)} mm between the corners. Put the catch on a longer wall`;
  if (!(at(spec.wall) >= 1.6 && at(spec.wall) <= 10)) return 'wall must be 1.6–10 mm (the lid\'s wall thickness)';
  if (at(spec.radius) < 0) return 'radius must not be negative';
  return null;
}

/**
 * The solids of a snap closure between a lid and its box. A lip ring stands inside the lid: below the rim it lies
 * on the lid's wall, with a 45° slope underneath so it prints without support; beyond the rim it steps in by the
 * clearance and goes into the box along its wall, which centres the lid. A bead on the lip snaps into a rille of
 * the box's wall, and a notch in the lid's rim takes a fingernail. Nothing stands out of the box.
 */
export function lipSteps(spec: LipSpec): Step[] {
  const { up, name } = spec;
  const [x0, y0, x1, y1] = [spec.min[0], spec.min[1], spec.max[0], spec.max[1]];
  const mm = (value: number) => `${String(round(Math.abs(value)))} mm`;
  // An expression moved by a number of mm.
  const by = (size: Size, value: number) => (value === 0 ? ex(size) : `${ex(size)} ${value < 0 ? '-' : '+'} ${mm(value)}`);
  const inner = LIP.clear + LIP.thick;
  const round_ = at(spec.radius) >= 2;
  // A ring between two outlines of the lid's room, each moved in by an inset, from the height `z` upwards.
  const ring = (label: string, z: string, outside: number, distance: number): Step[] => [
    { command: 'sketch.create', params: { plane: 'XY', offset: z, project_edges: false, name: label } },
    ...[outside, inner].map((inset) => ({
      command: round_ ? 'sketch.rectangle.rounded' : 'sketch.rectangle.two_point',
      params: { p0: [by(x0, inset), by(y0, inset)], p1: [by(x1, -inset), by(y1, -inset)], ...(round_ ? { radius: by(spec.radius, -inset) } : {}) },
    })),
    { command: 'solid.extrude', params: { distance: mm(distance), operation: 'join', targets: [spec.moving], name: label } },
  ];
  // The wall with the catch: across it runs `n` (out of the room), along it the bead.
  const alongX = spec.side.startsWith('y');
  const out = spec.side.endsWith('+') ? 1 : -1;
  const wallAt = alongX ? (out > 0 ? y1 : y0) : out > 0 ? x1 : x0;
  const [a0, a1] = alongX ? [x0, x1] : [y0, y1];
  const middle = `(${ex(a0)} + ${ex(a1)}) / 2`;
  const middleAt = (at(a0) + at(a1)) / 2;
  // A point given along the wall, across it and in height, in x, y, z.
  const xyz = <T,>(along: T, across: T, z: T): [T, T, T] => (alongX ? [along, across, z] : [across, along, z]);
  const size = (along: string, across: string, height: string) => (alongX ? { length: along, width: across, height } : { length: across, width: along, height });
  // The lip's outside on that wall, and where the bead's crest stands.
  const face = -out * LIP.clear;
  const crest = face + out * LIP.bead;
  const beadFrom = up > 0 ? 2 : -3;
  // Where the closed lid has a point of the open one: half a turn about the hinge line.
  const closed = (point: [string, string, string]): [string, string, string] => {
    const hinge = spec.hinge;
    if (!hinge) return point;
    const turned = (value: string, about: Size) => `2 * ${ex(about)} - (${value})`;
    return hinge.along === 'x' ? [point[0], turned(point[1], hinge.across), turned(point[2], hinge.z)] : [turned(point[0], hinge.across), point[1], turned(point[2], hinge.z)];
  };
  return [
    ...ring(`${name} ·`, by(spec.rim, up > 0 ? -LIP.foot : 0), -0.2, LIP.foot),
    ...ring(name, by(spec.rim, up > 0 ? 0 : -LIP.high), LIP.clear, LIP.high),
    { command: 'solid.chamfer', params: { edges: [xyz(middleAt, at(wallAt) - out * inner, at(spec.rim) - up * LIP.foot)], distance: mm(inner - 0.05), body: spec.moving, name: `${name} ◢` } },
    {
      command: 'solid.box',
      params: {
        ...size(mm(LIP.beadLong), mm(LIP.bead), '1 mm'),
        corner: xyz(`${middle} - ${mm(LIP.beadLong / 2)}`, by(wallAt, Math.min(face, crest)), by(spec.rim, beadFrom)),
        operation: 'join',
        targets: [spec.moving],
        name: `${name} ●`,
      },
    },
    { command: 'solid.chamfer', params: { edges: [2, 3].map((high) => xyz(middleAt, at(wallAt) + crest, at(spec.rim) + up * high)), distance: mm(LIP.bead - 0.05), body: spec.moving, name: `${name} ◆` } },
    {
      command: 'solid.cylinder',
      params: {
        diameter: '1.4 mm',
        height: mm(LIP.beadLong + 1),
        base: closed(xyz(`${middle} - ${mm(LIP.beadLong / 2 + 0.5)}`, by(wallAt, -out * 0.25), by(spec.rim, up * 2.5))),
        axis: alongX ? 'X' : 'Y',
        operation: 'cut',
        targets: [spec.fixed],
        name: `${name} ○`,
      },
    },
    {
      command: 'solid.cylinder',
      params: {
        diameter: mm(LIP.notch),
        height: ex(spec.wall),
        base: xyz(middle, out > 0 ? ex(wallAt) : `${ex(wallAt)} - ${ex(spec.wall)}`, by(spec.rim, up * (LIP.notch / 2 - 2.5))),
        axis: alongX ? 'Y' : 'X',
        operation: 'cut',
        targets: [spec.moving],
        name: `${name} ◠`,
      },
    },
  ];
}

export interface ScrewSpec {
  /** The body the screw is screwed into: it gets the seat for the insert, or the thread. */
  fixed: string;
  /** The body the screw holds down: it gets the clearance hole and the room for the head. */
  moving: string;
  /** Where the screw goes in: on the outer face of the moving body. */
  from: Vec3;
  /** Where its line passes from the moving body into the fixed one: on the face the two meet at. */
  to: Vec3;
  /** Further screws like this one: where each goes in. They run the same way and hold the same thickness. */
  more: Vec3[];
  size: BlockSize;
  /** The head: sunk in a counterbore (socket head), in a countersink, or lying on the face. */
  head: 'cap' | 'countersunk' | 'none';
  /** What holds the screw: a heat-set insert (the usual for printed parts), or a thread modelled into the plastic. */
  thread: 'insert' | 'tapped';
  /** Whether the screws go in as standard parts, for the parts list and the assembly. */
  screws: boolean;
  name: string;
}

/** Lengths screws are sold in, ISO 4762 and ISO 10642, in mm. */
const SCREW_LENGTHS = [4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80];
/** A modelled thread holds from about M5 in print; smaller ones strip. */
const TAPPED_FROM = 5;
/** Plastic left under a sunk head, in mm: three layers and more. */
const UNDER_HEAD = 1.2;

const grip = (spec: ScrewSpec) => Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0)));
const metric = (size: BlockSize) => Number(size.slice(1));
/** How deep the head sits in the moving body. */
const headDepth = (spec: ScrewSpec) => (spec.head === 'cap' ? CAP_HEAD[spec.size][1] + HEAD_ALLOWANCE.depth : spec.head === 'countersunk' ? metric(spec.size) * 0.6 : 0);
/** How deep the screw may reach into the fixed body: the insert, or 2.5 diameters of thread. */
const hold = (spec: ScrewSpec) => (spec.thread === 'insert' ? (INSERT[spec.size]?.length ?? 0) : metric(spec.size) * 2.5);

/** The screw to buy: the longest standard length that ends inside the insert or thread, and holds at least two thirds of it. */
export function screwLength(spec: ScrewSpec): number | null {
  // A socket head's length counts from under the head, a countersunk one's from its top.
  const through = grip(spec) - (spec.head === 'cap' ? headDepth(spec) : 0);
  const fits = SCREW_LENGTHS.filter((length) => length <= through + hold(spec) && length >= through + (hold(spec) * 2) / 3);
  return fits.at(-1) ?? null;
}

/** What is wrong with a screw joint before anything is built; null when it can be built. */
export function screwProblem(spec: ScrewSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (grip(spec) < 1) return 'from and to must be at least 1 mm apart: from where the screw goes in, to where it passes into the fixed body';
  if (spec.thread === 'insert' && !INSERT[spec.size]) return `there is no heat-set insert for ${spec.size} in the table (M2 to M6); use thread tapped or another size`;
  if (spec.thread === 'tapped' && metric(spec.size) < TAPPED_FROM) return `a printed ${spec.size} thread strips; use thread insert, or M${String(TAPPED_FROM)} and larger`;
  if (spec.head === 'countersunk' && metric(spec.size) < 3) return 'countersunk screws start at M3';
  const left = grip(spec) - headDepth(spec);
  if (left < UNDER_HEAD) return `the moving body is ${String(round(grip(spec)))} mm thick there, which leaves ${String(round(left))} mm under the ${spec.head === 'cap' ? 'counterbore' : 'countersink'}; make it at least ${String(round(headDepth(spec) + UNDER_HEAD))} mm thick, or use head none`;
  if (spec.more.length > 40) return 'at most 40 further screws';
  return null;
}

/**
 * The holes of a screw joint, one set per screw: in the moving body a clearance hole (ISO 273, normal) with the
 * room for the head, drilled only as deep as that body is thick; in the fixed body, on the same line, the seat of a
 * heat-set insert (a millimetre deeper than the insert, for the plastic it pushes down) or a modelled thread. With
 * `screws` the screws themselves follow as standard parts, each seated in its hole.
 */
export function screwSteps(spec: ScrewSpec): Step[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const direction = delta.map((value) => round(value / grip(spec))) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const insert = INSERT[spec.size];
  const length = screwLength(spec);
  const family = spec.head === 'countersunk' ? 'countersunk_socket_screw' : 'socket_head_cap_screw';
  const entries = [spec.from, ...spec.more].map((entry) => entry.map(round) as Vec3);
  const holes = entries.flatMap((entry, i): Step[] => {
    const meet = entry.map((value, k) => round(value + (delta[k] ?? 0))) as Vec3;
    const label = `${spec.name} ${String(i + 1)}`;
    return [
      { command: 'solid.hole', params: { position: entry, clearance: spec.size, fit: 'normal', ...headRoom(spec), direction, depth: mm(grip(spec)), targets: [spec.moving], name: label } },
      {
        command: 'solid.hole',
        params:
          spec.thread === 'insert' && insert
            ? { position: meet, direction, diameter: mm(insert.diameter), depth: mm(insert.length + 1), targets: [spec.fixed], name: `${label} ○` }
            : { position: meet, direction, thread: spec.size, modeled: true, depth: mm(hold(spec) + 1), targets: [spec.fixed], name: `${label} ○` },
      },
    ];
  });
  if (!spec.screws || length === null) return holes;
  // Each put where it sits, head outwards: a socket head on the floor of its counterbore, a countersunk head flush with
  // the face. (Seated by a pick on the hole, SolidCraft 0.40.0-rc.4 turns the screw in from the far side.) The screws
  // come after every hole, so they belong to the design and not to a body's component.
  // Plus zero: no negative zero in what goes to SolidCraft.
  const outwards = direction.map((value) => round(-value) + 0);
  return [
    ...holes,
    ...entries.map((entry) => ({
      command: 'parts.insert',
      params: { family, size: spec.size, length, point: entry.map((value, k) => round(value + (direction[k] ?? 0) * (spec.head === 'cap' ? headDepth(spec) : 0))), direction: outwards },
    })),
  ];
}

/** The room for the head, as the function block for a screw hole makes it: a counterbore or a countersink with the allowance of a printed hole. */
function headRoom(spec: ScrewSpec): Record<string, unknown> {
  const mm = (value: number) => `${String(round(value))} mm`;
  if (spec.head === 'cap') return { type: 'counterbore', cb_diameter: mm(CAP_HEAD[spec.size][0] + 2 * HEAD_ALLOWANCE.diameter), cb_depth: mm(CAP_HEAD[spec.size][1] + HEAD_ALLOWANCE.depth) };
  if (spec.head === 'countersunk') return { type: 'countersink', cs_diameter: mm((COUNTERSUNK_HEAD[spec.size] ?? CAP_HEAD[spec.size][0]) + HEAD_ALLOWANCE.diameter), cs_angle: '90 deg' };
  return {};
}


export interface LidSpec {
  /** The container: its round neck gets the thread. */
  fixed: string;
  /** The lid, which is made: no body of that name may exist. */
  moving: string;
  /** The centre of the container's rim, at the rim's height; the neck stands upright (along Z). */
  centre: Vec3;
  /** The neck's outer diameter at the rim, in mm. */
  diameter: number;
  /** How many threads run side by side: 1, or 2 to 3 for a lid that closes in less than a turn. */
  starts: number;
  /** The room between the two threads, radially; all of it on the lid. */
  gap: number;
  name: string;
}

/**
 * The thread of a printed screw lid, after the neck finishes of bottles and the usual printed jars: flat crests
 * and roots with flanks at 45°, which print without support on the neck standing and in the lid lying on its top;
 * pitch and depth by the neck's diameter; the threads engage over 1.75 turns of one start (at least three quarters
 * of a turn each with several).
 */
export function lidThread(spec: Pick<LidSpec, 'diameter' | 'starts'>): { pitch: number; depth: number; lead: number; turns: number; length: number; crest: number; foot: number } {
  const [pitch, depth] = spec.diameter <= 24 ? [3, 1.1] : spec.diameter <= 77 ? [4, 1.2] : [5, 1.5];
  const lead = pitch * spec.starts;
  const turns = Math.max(0.75, 1.75 / spec.starts);
  return { pitch, depth, lead, turns, length: round(turns * lead), crest: round(pitch / 2 - depth), foot: round(pitch / 2 + depth) };
}

/** Plain neck above the thread, the lid's wall and top, and the room below the lid's thread, in mm. */
export const LID = { plain: 1, wall: 2.4, top: 2.4, mouth: 1, flute: 3 };

/** How far below the rim the neck must be a plain cylinder of the given diameter: the lid's skirt covers it. */
export function lidSkirt(spec: Pick<LidSpec, 'diameter' | 'starts'>): number {
  const thread = lidThread(spec);
  return round(LID.plain + thread.foot / 2 + thread.length + thread.pitch / 2 + thread.foot / 2 + LID.mouth);
}

/** What is wrong with a screw lid before anything is built; null when it can be built. */
export function lidProblem(spec: LidSpec): string | null {
  if (spec.fixed === spec.moving) return 'moving is the name of the lid to make, not the container';
  if (!(spec.diameter >= 16 && spec.diameter <= 200)) return 'diameter must be 16–200 mm: the outer diameter of the neck';
  if (!Number.isInteger(spec.starts) || spec.starts < 1 || spec.starts > 3) return 'starts must be 1, 2 or 3';
  if (!(spec.gap >= 0.2 && spec.gap <= 0.6)) return 'gap must be 0.2–0.6 mm';
  return null;
}

/**
 * The solids of a screw lid on a round neck: the thread coiled onto the neck, and a lid made for it, a cap whose
 * inner top lands on the rim, with the same thread inside, half a pitch lower and the gap further out, so the two
 * mesh as they are built; flutes round the lid for the fingers; the lid's print face is its top.
 */
export function lidSteps(spec: LidSpec): Step[] {
  const thread = lidThread(spec);
  const [cx, cy, rim] = spec.centre.map(round) as Vec3;
  const radius = spec.diameter / 2;
  const mm = (value: number) => `${String(round(value))} mm`;
  // The middle of the neck's thread at its lower end, the lid's half a pitch below, and the lid's mouth.
  const start = rim - LID.plain - thread.foot / 2 - thread.length;
  const lidStart = start - thread.pitch / 2;
  const mouth = rim - lidSkirt(spec);
  const bore = radius + thread.depth + spec.gap;
  const outer = bore + LID.wall;
  // The section reaches 0.2 mm into its body, along its flanks, but never to the next turn.
  const into = Math.min(thread.foot / 2 + 0.2, thread.pitch / 2 - 0.05);
  const coil = (label: string, target: string, z: number, foot: number, crest: number, k: number): Step[] => {
    const angle = (2 * Math.PI * k) / spec.starts;
    const name = `${label} ${String(k + 1)}`;
    return [
      // The section's plane holds the axis, turned by the start: both threads begin at the same angles.
      { command: 'sketch.create', params: { plane: { origin: [cx, cy, round(z)], x_dir: [round(Math.cos(angle)), round(Math.sin(angle)), 0], y_dir: [0, 0, 1] }, project_edges: false, name } },
      { command: 'sketch.line', params: { points: [[foot, -into], [crest, -thread.crest / 2], [crest, thread.crest / 2], [foot, into]].map(([x, y]) => [round(x ?? 0), round(y ?? 0)]), closed: true } },
      { command: 'solid.coil', params: { sketch: name, pitch: mm(thread.lead), height: mm(thread.length), base: [cx, cy, round(z)], axis: 'Z', operation: 'join', targets: [target], name } },
    ];
  };
  const flutes = Math.max(8, Math.round((2 * Math.PI * outer) / 7));
  return [
    ...Array.from({ length: spec.starts }, (_, k) => coil(spec.name, spec.fixed, start, radius - 0.2, radius + thread.depth, k)).flat(),
    // The lid's top edge lies on the bed when it prints, so its last 0.6 mm are a cone, not a chamfer: SolidCraft
    // 0.40.0-rc.4 refuses to chamfer the top edge of a cylinder from about 60 mm of diameter.
    { command: 'solid.cylinder', params: { diameter: mm(2 * outer), height: mm(rim + LID.top - 0.6 - mouth), base: [cx, cy, round(mouth)], operation: 'new', body_name: spec.moving, name: spec.moving } },
    { command: 'solid.cone', params: { diameter: mm(2 * outer), top_diameter: mm(2 * outer - 1.2), height: '0.6 mm', base: [cx, cy, round(rim + LID.top - 0.6)], operation: 'join', targets: [spec.moving], name: `${spec.name} ◢` } },
    { command: 'solid.cylinder', params: { diameter: mm(2 * bore), height: mm(rim - mouth), base: [cx, cy, round(mouth)], operation: 'cut', targets: [spec.moving], name: `${spec.name} ○` } },
    ...Array.from({ length: spec.starts }, (_, k) => coil(`${spec.name} ·`, spec.moving, lidStart, bore + 0.2, radius + spec.gap, k)).flat(),
    // Flutes for the fingers, ending below the top so its edge stays whole for the bed.
    { command: 'solid.cylinder', params: { diameter: mm(LID.flute), height: mm(rim - mouth), base: [round(cx + outer + LID.flute / 4), cy, round(mouth)], operation: 'cut', targets: [spec.moving], name: `${spec.name} ◆` } },
    { command: 'solid.pattern.circular', params: { features: [`${spec.name} ◆`], axis: { origin: [cx, cy, 0], dir: [0, 0, 1] }, count: flutes } },
    { command: 'body.print_face', params: { body: spec.moving, point: [cx, cy, round(rim + LID.top)] } },
  ];
}

export interface SnapSpec {
  /** The body the hook stands on. */
  fixed: string;
  /** The body whose wall the hook catches in; it gets the window. */
  moving: string;
  /** The foot of the hook: on the face of the fixed body, at the inner face of the other body's wall. */
  from: Vec3;
  /** The way the hook stands out of that face, which is the way the two parts come apart. */
  up: Vec3;
  /** The way the catch points: from the foot into the wall; what of it runs along `up` is dropped. */
  toward: Vec3;
  /** Further hooks catching the same way: the foot of each. */
  more: Vec3[];
  /** The wall's thickness in mm: the window goes that deep, so through it. */
  wall: number;
  name: string;
}

/**
 * One cantilever hook, in mm: an arm 12 long, 1.5 thick and 5 wide (Hubs: no narrower) with a catch of 0.8 on its last
 * 1.5, which bends the root by 1.4 % as it snaps in (Bayer's and BASF's 0.67 · strain · length² / thickness, turned
 * round). The arm stands `gap` off the wall, the window is `side` wider on each side, its edge lies `seat` under the
 * catch and it leaves `air` over the tip. Clearances are those of guides for printed parts, which run from 0.1 to 0.5.
 */
export const SNAP = { length: 12, thickness: 1.5, width: 5, catch: 0.8, catchLength: 1.5, gap: 0.2, side: 0.3, seat: 0.2, air: 0.5 };

/** What is wrong with a snap hook before anything is built; null when it can be built. */
export function snapProblem(spec: SnapSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (Math.hypot(...spec.up) < 1e-9) return 'up must not be zero';
  const up = spec.up.map((value) => value / Math.hypot(...spec.up)) as Vec3;
  if (Math.hypot(...cross(up, spec.toward)) < 1e-6) return 'to must lie beside from, in the wall the catch goes into: not straight along up';
  if (!(spec.wall >= 1.6 && spec.wall <= 10)) return 'wall must be 1.6–10 mm';
  if (spec.more.length > 20) return 'at most 20 further hooks';
  return null;
}

/**
 * A snap hook on the fixed body and its window in the wall of the other: the catch's flat underside lies over the
 * window's edge and holds against pulling the parts apart; pressed back through the window it lets go. The window is
 * cut first and the hook built last, each with its own body's component active.
 */
export function snapSteps(spec: SnapSpec): Step[] {
  const length = Math.hypot(...spec.up);
  const up = spec.up.map((value) => value / length) as Vec3;
  const along = spec.toward.reduce((sum, value, i) => sum + value * (up[i] ?? 0), 0);
  const flat = spec.toward.map((value, i) => value - along * (up[i] ?? 0)) as Vec3;
  const toward = flat.map((value) => value / Math.hypot(...flat)) as Vec3;
  const tidy = (vector: Vec3) => vector.map((value) => round(value) + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const feet = [spec.from, ...spec.more];
  const half = round(SNAP.width / 2 + SNAP.side);
  const high = round(SNAP.catchLength + SNAP.seat + SNAP.air);
  const windows = feet.flatMap((foot, i): Step[] => {
    const name = `${spec.name} ${String(i + 1)} □`;
    return [
      // Sketch x across the hook, y up it: x × y points into the wall, so a positive distance cuts.
      { command: 'sketch.create', params: { plane: { origin: foot.map((value, k) => round(value + (up[k] ?? 0) * (SNAP.length - SNAP.catchLength - SNAP.seat))), x_dir: tidy(cross(up, toward)), y_dir: tidy(up) }, project_edges: false, name } },
      { command: 'sketch.line', params: { points: [[-half, 0], [half, 0], [half, high], [-half, high]], closed: true } },
      { command: 'solid.extrude', params: { distance: mm(spec.wall), operation: 'cut', targets: [spec.moving], name } },
    ];
  });
  const hooks = feet.map((foot): Step => ({
    command: 'plastic.snap_fit',
    params: {
      position: foot.map((value, k) => round(value - (toward[k] ?? 0) * SNAP.gap)),
      direction: tidy(up),
      hook: tidy(toward),
      length: mm(SNAP.length),
      thickness: mm(SNAP.thickness),
      width: mm(SNAP.width),
      catch_depth: mm(SNAP.catch),
      catch_length: mm(SNAP.catchLength),
      body: spec.fixed,
    },
  }));
  return [...windows, ...hooks];
}

export interface PegSpec {
  /** The body the peg grows out of. */
  fixed: string;
  /** The body that gets the pocket. */
  moving: string;
  /** The foot of the peg, on the face the two bodies meet at. */
  from: Vec3;
  /** A point further into the moving body: the way the peg points. */
  to: Vec3;
  /** Further pegs pointing the same way: the foot of each. */
  more: Vec3[];
  /** The peg's diameter in mm. */
  diameter: number;
  /** The room round the peg in its pocket, per side, in mm. */
  gap: number;
  name: string;
}

/**
 * A peg, in mm: one and a half diameters long (what makers of split prints publish: 1.5 to 2), its pocket `deeper` for
 * air and glue, and `chamfer` at 45° on the peg's tip and the pocket's mouth so they find each other. Under 5 mm a
 * standing peg is perimeters only and weak (Hubs).
 */
export const PEG = { ratio: 1.5, deeper: 1, chamfer: 0.5, root: 0.5, least: 5 };

/** How far a peg stands out of its face. */
export function pegLength(diameter: number): number {
  return round(diameter * PEG.ratio);
}

/** What is wrong with a peg before anything is built; null when it can be built. */
export function pegProblem(spec: PegSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (!(spec.diameter >= 3 && spec.diameter <= 20)) return 'diameter must be 3–20 mm';
  if (!(spec.gap >= 0.05 && spec.gap <= 0.5)) return 'gap must be 0.05–0.5 mm';
  if (spec.more.length > 20) return 'at most 20 further pegs';
  return null;
}

/**
 * Pegs on the fixed body and their pockets in the moving one, along the line `from`–`to`: each pocket with its
 * chamfered mouth first, then the peg, rooted in its body, with a chamfered tip.
 */
export function pegSteps(spec: PegSpec): Step[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const axis = delta.map((value) => round(value / Math.hypot(...delta)) + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const long = pegLength(spec.diameter);
  const bore = spec.diameter + 2 * spec.gap;
  return [spec.from, ...spec.more].flatMap((foot, i): Step[] => {
    const at = (distance: number) => foot.map((value, k) => round(value + (axis[k] ?? 0) * distance)) as Vec3;
    const label = `${spec.name} ${String(i + 1)}`;
    return [
      { command: 'solid.cylinder', params: { diameter: mm(bore), height: mm(long + PEG.deeper), base: at(0), axis, operation: 'cut', targets: [spec.moving], name: `${label} ○` } },
      { command: 'solid.cone', params: { diameter: mm(bore + 2 * PEG.chamfer), top_diameter: mm(bore), height: mm(PEG.chamfer), base: at(0), axis, operation: 'cut', targets: [spec.moving], name: `${label} ◣` } },
      { command: 'solid.cylinder', params: { diameter: mm(spec.diameter), height: mm(long - PEG.chamfer + PEG.root), base: at(-PEG.root), axis, operation: 'join', targets: [spec.fixed], name: label } },
      { command: 'solid.cone', params: { diameter: mm(spec.diameter), top_diameter: mm(spec.diameter - 2 * PEG.chamfer), height: mm(PEG.chamfer), base: at(long - PEG.chamfer), axis, operation: 'join', targets: [spec.fixed], name: `${label} ◢` } },
    ];
  });
}
