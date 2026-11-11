/**
 * Mechanisms the assistant builds with one call (ADR 0027, plan step G3): proven print-in-place
 * geometry between two bodies, made of SolidCraft's own solids, so a hinge does not depend on the
 * model getting gaps and knuckles right. The joint, its limits and the check of the range follow
 * in the tool (`mechanismTool.ts`).
 */

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
