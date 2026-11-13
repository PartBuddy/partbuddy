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
  /**
   * Where a lying hinge hangs: the height (z) of the bed, and for each body whose wall can carry a web (it reaches down
   * to `webFoot`, or the web ends on the bed) the level way from the line to that wall and how far that is. With it
   * every knuckle of such a body that starts in the air gets a web at 45° down to its own wall.
   */
  support?: { bed: number; fixed?: HingeSide; moving?: HingeSide };
}

export interface HingeSide {
  /** Level, of length 1: from the hinge line to the body's wall. */
  toward: Vec3;
  /** From the line to that wall's face in mm. */
  distance: number;
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
  // Only a lying hinge has the roof; under two lines of a 0.4 mm nozzle the print check would warn about it.
  const level = Math.abs(spec.to[2] - spec.from[2]) < 1e-6;
  const roof = spec.diameter / 2 - (pinDiameter(spec.diameter) / 2 + spec.gap) * ROOF_TOP;
  if (level && roof < 0.9) return `the barrel would be ${String(round(roof))} mm thin over the bore's roof; use a larger diameter or a smaller gap`;
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
    // Before the bore, which then goes through the webs of the moving body as through its knuckles.
    ...spans.flatMap((span) => web(spec, axis, at, span)),
    // The bore through the moving knuckles, then the pin through everything.
    cylinder(pin + 2 * spec.gap, -spec.gap, length + spec.gap, 'cut', spec.moving, `${spec.name} ○`),
    ...boreRoof(spec, axis, at(-spec.gap), length + 2 * spec.gap, pin / 2 + spec.gap),
    cylinder(pin, 0, length, 'join', spec.fixed, `${spec.name} ●`),
    ...spans.flatMap((span) => (span.owner === spec.moving ? pinFlat(spec, axis, at, span, pin / 2) : [])),
  ];
}

/** How far the pin of a lying hinge bridges inside a knuckle of the moving body, from one fixed knuckle to the next (mm). */
export function pinBridge(spec: Pick<HingeSpec, 'from' | 'to' | 'gap' | 'knuckles'>): number {
  const length = Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0)));
  return round((length + (spec.knuckles + 1) * spec.gap) / spec.knuckles);
}

/**
 * The flat under the pin of a lying hinge, inside one knuckle of the moving body: there the pin has nothing below it
 * but the gap, and its round underside starts in the air (audit 2026-11-12: 25 mm² of overhang per knuckle left on every
 * hinge). Cut off where it leans 45°, what is left below is a level strip from one fixed knuckle to the next, a bridge.
 */
function pinFlat(spec: HingeSpec, axis: Vec3, at: (distance: number) => Vec3, span: { start: number; end: number; label: string }, radius: number): Step[] {
  if (Math.abs(axis[2]) > 1e-6) return [];
  const top = -radius / Math.SQRT2;
  // Down to inside the bore's gap: below the pin the fixed body has nothing there.
  const points: [number, number][] = [[-radius, top], [radius, top], [radius, -radius - spec.gap / 2], [-radius, -radius - spec.gap / 2]];
  const name = `${span.label} ▬`;
  return [
    { command: 'sketch.create', params: { plane: { origin: at(span.start - spec.gap), x_dir: cross([0, 0, 1], axis).map(round), y_dir: [0, 0, 1] }, project_edges: false, name } },
    { command: 'sketch.line', params: { points: points.map(([x, y]) => [round(x), round(y)]), closed: true } },
    { command: 'solid.extrude', params: { distance: `${String(round(span.end - span.start + 2 * spec.gap))} mm`, operation: 'cut', targets: [spec.fixed], name } },
  ];
}

/** A web stands this far in its wall, and one lower than this is left out (mm). */
export const WEB = { into: 0.5, least: 0.3 };

/** How far below the hinge line the web of a knuckle meets its wall, `distance` from the line (mm): the wall must reach down there. */
export function webFoot(diameter: number, distance: number): number {
  return round((diameter / 2) * Math.SQRT2 + distance);
}

/**
 * Parts printed as one piece (audit 2026-11-12, G1: a print-in-place hinge): each of their components carries a key of
 * PartBuddy's (`METADATA_PREFIX` of notes/noteRecord.ts, which the assistant may not write) with the same label, and
 * the mirror groups the bodies of components that share one (`printGroups`), so print check and plate view stand them
 * on one bed and the 3MF export and "send to slicer" write them as one object (main/print/pieces3mf.ts). One key per
 * label: a component in two hinges keeps both, and nothing is read before it is written. The marks are part of the
 * design, so they come back with undo, redo and a design opened again.
 */
export const TOGETHER_KEY = 'io.github.manuelstaggl.partbuddy.together.';

export function printTogether(components: readonly (string | number)[], label: string, joint: string): Step[] {
  return components.map((component) => ({ command: 'component.metadata.set', params: { component, values: { [`${TOGETHER_KEY}${label}`]: { joint } } } }));
}

/** Whether the knuckles of a lying hinge start above the bed, so that each needs a web under it. */
export function hangs(spec: Pick<HingeSpec, 'from' | 'to' | 'diameter'>, bed: number): boolean {
  return Math.abs(spec.to[2] - spec.from[2]) < 1e-6 && spec.from[2] - spec.diameter / 2 - bed >= WEB.least;
}

/**
 * The web under one knuckle of a lying hinge that starts above the bed: the round underside of a barrel begins in the
 * air (practice runs 2026-11-11 and -12: the assistant added such webs by hand every time). In the plane square to
 * the line, x towards the knuckle's own wall and y up from the axis: from where the barrel leans 45° on the far side,
 * over the other body, a face at 45° runs down under the barrel to the knuckle's own wall, or to the bed where that
 * comes first. So nothing of the round is left hanging: a web that ended a gap before the other body left the far half
 * of every knuckle as an overhang of up to 89° (audit 2026-11-12, N-mechanik-4). Where the web passes through the
 * other body, that body is cut back by the same profile a gap further out, as it is for the barrel itself.
 * shortcut: a wall that ends above the web's foot gets no web at all, though a shorter one from further under the
 * barrel would carry most of it; add that when hinges on shallow walls turn up.
 */
function web(spec: HingeSpec, axis: Vec3, at: (distance: number) => Vec3, span: { start: number; end: number; owner: string; other: string; label: string }): Step[] {
  const support = spec.support;
  const own = span.owner === spec.fixed ? support?.fixed : support?.moving;
  if (!support || !own || !hangs(spec, support.bed)) return [];
  const bed = support.bed - spec.from[2];
  const wall = own.distance + WEB.into;
  const room = Math.max(0, own.distance - spec.gap);
  // The face at 45° that touches a barrel of this radius, from where it touches down to x.
  const slope = (radius: number, x: number): [number, number][] => [[-radius / Math.SQRT2, 0], [-radius / Math.SQRT2, -radius / Math.SQRT2], [x, -radius * Math.SQRT2 - x]];
  const radius = spec.diameter / 2;
  const foot = -webFoot(spec.diameter, own.distance);
  const points: [number, number][] = foot < bed ? [...slope(radius, -radius * Math.SQRT2 - bed), [wall, bed], [wall, 0]] : [...slope(radius, own.distance), [wall, foot], [wall, 0]];
  // x × y of the sketch is the way the profile is extruded: start at the end of the knuckle from which that runs along it.
  const forward = cross(own.toward, [0, 0, 1]).reduce((sum, value, i) => sum + value * (axis[i] ?? 0), 0) > 0;
  const profile = (outline: [number, number][], start: number, end: number, operation: 'cut' | 'join', target: string, name: string): Step[] => [
    { command: 'sketch.create', params: { plane: { origin: at(forward ? start : end), x_dir: own.toward.map((value) => round(value) + 0), y_dir: [0, 0, 1] }, project_edges: false, name } },
    { command: 'sketch.line', params: { points: outline.map(([x, y]) => [round(x), round(y)]), closed: true } },
    { command: 'solid.extrude', params: { distance: `${String(round(end - start))} mm`, operation, targets: [target], name } },
  ];
  return [
    // As long as the knuckle's room, and up to a gap before the knuckle's own wall: a line that lies inside the other
    // body's wall has that wall on both sides of it.
    ...profile([...slope(radius + spec.gap, room), [room, 0]], span.start - spec.gap, span.end + spec.gap, 'cut', span.other, `${span.label} ◤`),
    ...profile(points, span.start, span.end, 'join', span.owner, `${span.label} ◣`),
  ];
}

/**
 * How far above the axis the roof of a bore of radius 1 is cut flat: the bridge left is 0.73 of the radius wide
 * (1.4 mm at the standard hinge). At 1.2 the standard barrel of 6 mm kept 0.72 mm over the roof, under two lines
 * (practice run 2026-11-11: a thin-wall warning on every standard hinge).
 */
export const ROOF_TOP = 1.05;

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
  /** The moving body is high enough over the rail's face for the roof over the groove (`slideRoof`); without it the groove's ceiling is flat. */
  roof?: boolean;
  name: string;
}

/** The flat ridge of the roof over a groove, in mm: a bridge that short does not sag (Protolabs Network, Xometry Pro; overhang.ts). */
const RIDGE = 5;

/**
 * The ceiling of a guide's groove and the roof that takes its place, in mm. The ceiling is flat, as wide as the rail's
 * head and a gap more on each side, and lies only a gap over the head: 13.9 mm at the defaults and up to 102 mm, where
 * a bridge prints up to 10 mm (audit 2026-11-12, T5). The roof rises at 45° from both edges of the ceiling to a ridge
 * `ridge` wide, `top` above the face the rail stands on.
 */
export function slideRoof(spec: Pick<SlideSpec, 'width' | 'height' | 'gap'>): { ceiling: number; ridge: number; top: number } {
  const half = spec.width / 2 + spec.gap * Math.SQRT2 + spec.height + spec.gap;
  return { ceiling: round(2 * half), ridge: RIDGE, top: round(spec.height + spec.gap + half - RIDGE / 2) };
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
 * upwards at 45°, and its groove in the moving body, a gap wider all round, with a roof instead of
 * a flat ceiling where the body is high enough. Both are a sketch at `from`, square to the line,
 * extruded along it.
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
  const roof = slideRoof(spec);
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
        ...(spec.roof ? ([[roof.ridge / 2, roof.top], [-roof.ridge / 2, roof.top]] as [number, number][]) : []),
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
  /**
   * The lid is a flat plate without walls: the lip stands on its face, with no foot in the lid and no notch.
   * The foot is 3 mm high and came out of the top of a thinner plate (practice run 2026-11-11).
   */
  flat?: boolean;
  /**
   * The height (z) of the lid's floor inside, where the caller knows it (a template): the foot then stops 0.6 mm short
   * of it however shallow the lid is made, so its chamfer keeps its edge (audit 2026-11-13, N-nach-2: at a height of 5 mm
   * the foot ran into the floor and the chamfer lost its reference).
   */
  floor?: Size;
  /** The nozzle the lip is sized for (mm); default 0.4. */
  nozzle?: number;
  name: string;
}

/**
 * The snap closure of a printed lid: the lip at least 1.2 mm thick (`lipThick`) and 4 mm high, 0.25 mm clear of the box's
 * wall; the bead 0.5 mm proud, so 0.25 mm of catch, with 45° flanks, 14 mm long in the middle of a wall (never in a
 * corner, which cannot give way); the rille 0.2 mm deeper than the bead reaches. The bead is a bump of the lip's outline,
 * no wall of its own, so it needs no line width: the slicer's outer line follows it with any nozzle.
 */
export const LIP = { thick: 1.2, high: 4, clear: 0.25, foot: 3, bead: 0.5, beadLong: 14, notch: 16, rille: 1.4 };

/**
 * The lip's thickness: whole extrusion lines, as many as reach 1.2 mm, at least two (audit T13, MV-19: 1.2 mm is no
 * whole number of lines on a 0.4 mm nozzle and under two on a 0.6 mm one). 1.35 mm on 0.4 and on 0.6, 1.8 mm on 0.8: the
 * snap keeps about the same spring.
 */
export function lipThick(nozzle = 0.4): number {
  const line = round(nozzle * 1.125);
  return round(Math.max(2, Math.ceil(LIP.thick / line - 1e-9)) * line);
}

/** How far the rille goes into the box's wall past the lid's inner room: its axis stands 0.25 mm in front of that plane. */
export const RILLE_DEPTH = round(LIP.rille / 2 - LIP.clear);

/** What is wrong with a closure before anything is built; null when it can be built. */
export function lipProblem(spec: LipSpec): string | null {
  const span = spec.side.startsWith('y') ? at(spec.max[0]) - at(spec.min[0]) : at(spec.max[1]) - at(spec.min[1]);
  const short = Math.min(at(spec.max[0]) - at(spec.min[0]), at(spec.max[1]) - at(spec.min[1]));
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (!(at(spec.max[0]) - at(spec.min[0]) >= 12 && at(spec.max[1]) - at(spec.min[1]) >= 12)) return 'from and to must be opposite corners of the lid\'s inner room, at least 12 mm apart in x and in y';
  if (span < LIP.beadLong + 2 * Math.max(at(spec.radius), 2) + 2) return `the wall with the catch is ${String(round(span))} mm long inside; the bead needs ${String(LIP.beadLong + 2 * Math.max(at(spec.radius), 2) + 2)} mm between the corners. Put the catch on a longer wall`;
  if (!(at(spec.wall) >= 1.6 && at(spec.wall) <= 10)) return 'wall must be 1.6–10 mm (the lid\'s wall thickness)';
  if (at(spec.radius) < 0) return 'radius must not be negative';
  // Audit W17: a corner wider than half the room is no room of rounded corners any more.
  if (at(spec.radius) > short / 2) return `radius must be at most half the room's shorter side (${String(round(short / 2))} mm)`;
  // The rille is placed by turning the catch about the hinge, and the hinge's wall keeps no lip: both need the catch opposite.
  const hinge = spec.hinge;
  if (hinge) {
    const [lo, hi] = hinge.along === 'x' ? [spec.min[1], spec.max[1]] : [spec.min[0], spec.max[0]];
    const far = `${hinge.along === 'x' ? 'y' : 'x'}${Math.abs(at(hi) - at(hinge.across)) > Math.abs(at(lo) - at(hinge.across)) ? '+' : '-'}`;
    if (spec.side !== far) return `with a hinge the catch goes on the wall opposite it: side ${far}`;
  }
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
  const inner = round(LIP.clear + lipThick(spec.nozzle));
  const round_ = at(spec.radius) >= 2;
  // A ring between two outlines of the lid's room, each moved in by an inset, from the height `z` upwards.
  const ring = (label: string, z: string, outside: number, distance: string): Step[] => [
    { command: 'sketch.create', params: { plane: 'XY', offset: z, project_edges: false, name: label } },
    ...[outside, inner].map((inset) => ({
      command: round_ ? 'sketch.rectangle.rounded' : 'sketch.rectangle.two_point',
      params: { p0: [by(x0, inset), by(y0, inset)], p1: [by(x1, -inset), by(y1, -inset)], ...(round_ ? { radius: by(spec.radius, -inset) } : {}) },
    })),
    { command: 'solid.extrude', params: { distance, operation: 'join', targets: [spec.moving], name: label } },
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
  // The foot's height: 3 mm, or less where the lid's floor comes closer than that and 0.6 mm.
  const floor = spec.floor;
  const footAt = floor === undefined ? LIP.foot : Math.min(LIP.foot, round(up * (at(spec.rim) - at(floor)) - 0.6));
  const foot = floor === undefined ? mm(LIP.foot) : `min(${mm(LIP.foot)}, ${up > 0 ? `${ex(spec.rim)} - ${ex(floor)}` : `${ex(floor)} - ${ex(spec.rim)}`} - 0.6 mm)`;
  const footZ = up > 0 ? `${ex(spec.rim)} - ${floor === undefined ? mm(LIP.foot) : `(${foot})`}` : ex(spec.rim);
  const footEdge = at(spec.rim) - up * footAt;
  // The 45° slope under the foot, on every inner edge of its underside: a rounded ring is one chain from any point of
  // it, a sharp one four edges, and three of them stayed a level step of 184 mm² (audit T15, N-mechanik-14).
  const footEdges: [number, number, number][] = round_
    ? [xyz(middleAt, at(wallAt) - out * inner, footEdge)]
    : [[(at(x0) + at(x1)) / 2, at(y0) + inner, footEdge], [(at(x0) + at(x1)) / 2, at(y1) - inner, footEdge], [at(x0) + inner, (at(y0) + at(y1)) / 2, footEdge], [at(x1) - inner, (at(y0) + at(y1)) / 2, footEdge]];
  // With a hinge, its wall keeps no lip: the hinge holds the lid on that side, and the knuckles turning there bit the lip
  // and the foot into faces that hung (audit 2026-11-12, T3: 63 mm² at the template; N-nach-1: 0.26 mm left at other sizes).
  // Taken off along the straight stretch, from the wall's face into the room, after the slope was set on the whole ring.
  const hingeWall = alongX ? (out > 0 ? y0 : y1) : out > 0 ? x0 : x1;
  const reach = round(inner + 0.05);
  const unhinged: Step[] = spec.hinge && !spec.flat
    ? [{
        command: 'solid.box',
        params: {
          ...size(`${ex(a1)} - ${ex(a0)} - 2 * ${ex(spec.radius)}`, mm(reach), `${foot} + ${mm(LIP.high + 0.2)}`),
          corner: xyz(`${ex(a0)} + ${ex(spec.radius)}`, out > 0 ? ex(hingeWall) : by(hingeWall, -reach), up > 0 ? `${footZ} - 0.1 mm` : by(spec.rim, -LIP.high - 0.1)),
          operation: 'cut',
          targets: [spec.moving],
          name: `${name} ▭`,
        },
      }]
    : [];
  return [
    ...(spec.flat ? [] : ring(`${name} ·`, footZ, -0.2, foot)),
    ...ring(name, by(spec.rim, up > 0 ? 0 : -LIP.high), LIP.clear, mm(LIP.high)),
    ...(spec.flat ? [] : [{ command: 'solid.chamfer', params: { edges: footEdges, distance: mm(inner - 0.05), body: spec.moving, name: `${name} ◢` } }]),
    ...unhinged,
    // The notch before the bead: it reaches below the rim, where the bead stands past the wall's plane, and cut after
    // it took that part away, so the bead ended on the plane and caught nothing (audit 2026-11-12, N-mechanik-2).
    ...(spec.flat ? [] : [{
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
    }]),
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
        diameter: mm(LIP.rille),
        height: mm(LIP.beadLong + 1),
        base: closed(xyz(`${middle} - ${mm(LIP.beadLong / 2 + 0.5)}`, by(wallAt, -out * 0.25), by(spec.rim, up * 2.5))),
        axis: alongX ? 'X' : 'Y',
        operation: 'cut',
        targets: [spec.fixed],
        name: `${name} ○`,
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
export const TAPPED_FROM = 5;
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

/** The room for the head in the moving body: its width at the face and how deep the head sits; null for a head lying on the face. */
export function headRecess(spec: ScrewSpec): { diameter: number; depth: number } | null {
  if (spec.head === 'cap') return { diameter: CAP_HEAD[spec.size][0] + 2 * HEAD_ALLOWANCE.diameter, depth: headDepth(spec) };
  if (spec.head === 'countersunk') return { diameter: (COUNTERSUNK_HEAD[spec.size] ?? CAP_HEAD[spec.size][0]) + HEAD_ALLOWANCE.diameter, depth: headDepth(spec) };
  return null;
}

/** The room for the head, as the function block for a screw hole makes it: a counterbore or a countersink with the allowance of a printed hole. */
function headRoom(spec: ScrewSpec): Record<string, unknown> {
  const mm = (value: number) => `${String(round(value))} mm`;
  const room = headRecess(spec);
  if (!room) return {};
  return spec.head === 'cap' ? { type: 'counterbore', cb_diameter: mm(room.diameter), cb_depth: mm(room.depth) } : { type: 'countersink', cs_diameter: mm(room.diameter), cs_angle: '90 deg' };
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

export interface LatchSpec {
  /** The box: it gets the bead. */
  fixed: string;
  /** The lid: the latch grows out of its outer wall. */
  moving: string;
  /** The middle of the latch, on the line where lid and box meet, on their outer wall. */
  from: Vec3;
  /** The way from the box to the lid. */
  up: Vec3;
  /** The way out of the wall; what of it runs along `up` is dropped. */
  out: Vec3;
  /** The latch's width along the wall in mm. */
  width: number;
  name: string;
}

/**
 * A snap latch outside a box, in mm (decided 2026-11-11: no hinge, whose play is larger than any catch). An arm
 * `thick` stands `off` the wall, rooted in the lid between `foot` and `head` above the joint, where a 45° slope
 * carries it; `lever` below its root a hook reaches to `clear` off the wall, under a bead that stands `bead` out of
 * the box, the two 45° faces `seat` apart: none, so the closed lid cannot lift before the hook holds (at 0.2 it rattled,
 * practice run 2026-11-11), and a print that comes out fuller only seats the hook a little further out on its slope.
 * Lid and box print apart, so the faces need no room. `tab` of arm below the hook is for the finger. Snapping over the bead bends
 * the root by 1.5 · thick · (bead − clear) / lever² = 1.3 %.
 */
export const LATCH = { thick: 1.6, off: 1.5, foot: 1, head: 5, lever: 12, bead: 1.2, clear: 0.4, seat: 0, tab: 2, into: 0.5, beside: 1 };

/** How much flat wall the latch needs: on the lid above the joint, and on the box below it. */
export function latchReach(): { above: number; below: number } {
  const hook = LATCH.off - LATCH.clear;
  return { above: round(LATCH.head + LATCH.off + LATCH.thick), below: round(LATCH.lever - LATCH.foot + hook + LATCH.tab) };
}

/** What is wrong with a latch before anything is built; null when it can be built. */
export function latchProblem(spec: LatchSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (Math.hypot(...spec.up) < 1e-9) return 'up must not be zero';
  const up = spec.up.map((value) => value / Math.hypot(...spec.up)) as Vec3;
  if (Math.hypot(...cross(up, spec.out)) < 1e-6) return 'to must lie straight out of the wall from from: not along up';
  if (!(spec.width >= 5 && spec.width <= 40)) return 'width must be 5–40 mm';
  return null;
}

/**
 * The latch on the lid and its bead on the box, each one profile in the plane square to the wall, extruded along the
 * wall. Sketch x runs out of the wall and y up, from the joint. With the lid printed on its top the arm grows out of
 * it without support, and so does the bead with the box standing.
 */
export function latchSteps(spec: LatchSpec): Step[] {
  const length = Math.hypot(...spec.up);
  const up = spec.up.map((value) => value / length) as Vec3;
  const along = spec.out.reduce((sum, value, i) => sum + value * (up[i] ?? 0), 0);
  const flat = spec.out.map((value, i) => value - along * (up[i] ?? 0)) as Vec3;
  const out = flat.map((value) => value / Math.hypot(...flat)) as Vec3;
  // x × y of the sketch: the profiles are extruded this way along the wall.
  const run = cross(out, up);
  const tidy = (vector: Vec3) => vector.map((value) => round(value) + 0) as Vec3;
  const { thick, off, foot, head, lever, bead, clear, seat, tab, into, beside } = LATCH;
  const hook = off - clear;
  const crest = foot - lever;
  const outer = off + thick;
  // The bead's crest lies above the hook's so that their faces are `seat` apart, measured upright.
  const ridge = crest + bead - clear + seat;
  const profile = (points: [number, number][], half: number, target: string, name: string): Step[] => [
    { command: 'sketch.create', params: { plane: { origin: spec.from.map((value, i) => round(value - (run[i] ?? 0) * half)), x_dir: tidy(out), y_dir: tidy(up) }, project_edges: false, name } },
    { command: 'sketch.line', params: { points: points.map(([x, y]) => [round(x), round(y)]), closed: true } },
    { command: 'solid.extrude', params: { distance: `${String(round(2 * half))} mm`, operation: 'join', targets: [target], name } },
  ];
  return [
    ...profile(
      [
        [-into, ridge + bead],
        [0, ridge + bead],
        [bead, ridge],
        [0, ridge - bead],
        [-into, ridge - bead],
      ],
      spec.width / 2 + beside,
      spec.fixed,
      `${spec.name} ◁`,
    ),
    ...profile(
      [
        [-into, head + outer],
        [0, head + outer],
        [outer, head],
        [outer, crest - hook - tab],
        [off, crest - hook - tab],
        [off, crest - hook],
        [clear, crest],
        [off, crest + hook],
        [off, foot],
        [-into, foot],
      ],
      spec.width / 2,
      spec.moving,
      spec.name,
    ),
  ];
}
