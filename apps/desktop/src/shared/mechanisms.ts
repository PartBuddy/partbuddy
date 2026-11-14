/**
 * Mechanisms the assistant builds with one call (ADR 0027, plan step G3): proven print-in-place
 * geometry between two bodies, made of SolidCraft's own solids, so a hinge does not depend on the
 * model getting gaps and knuckles right. The joint, its limits and the check of the range follow
 * in the tool (`mechanismTool.ts`).
 */

import { BRIDGE_SPAN, minimumFloor, minimumWall, thinnestLine } from '@partbuddy/geometry';

import { printInPlaceGap, type FitPrinter } from './designFit';
import { CAP_HEAD, CLEARANCE_NORMAL, COUNTERSUNK_HEAD, HEAD_ALLOWANCE, INSERT, type BlockSize } from './screwSizes';
import { drawnHole, type ToolMaterial } from './toolFit';

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

/** A knuckle shorter than this is too weak to hold the pin (mm). */
const MIN_KNUCKLE = 2.5;
/** The printer a hinge is checked for where none is given: a 0.4 mm nozzle and 0.2 mm layers. */
const PRINTER: FitPrinter = { nozzle: 0.4, layer: 0.2 };

const round = (value: number) => Math.round(value * 1000) / 1000;
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * The pin's diameter: half the barrel. How thin it may get follows from the walls the barrel keeps round its bore
 * (`hingeDiameter`): 3 mm at 0.4 mm lying, 2.75 mm standing; a pin under PEG.least printed standing is weak, and the
 * tool says so (audit MV-05).
 */
export function pinDiameter(diameter: number): number {
  return round(Math.max(2, diameter / 2));
}

/**
 * How a hinge prints: lying (its line level), standing (its line straight up), or null for a line at a slant, which
 * gets neither the bore's roof nor webs (audit H-07). The one test every part of the hinge goes by (audit T41: the roof
 * was checked under 1e-6 of height and built under a slant that rounded to level).
 */
export function hingeLies(spec: Pick<HingeSpec, 'from' | 'to'>): 'lying' | 'standing' | null {
  const [dx, dy, dz] = spec.to.map((value, i) => Math.abs(value - (spec.from[i] ?? 0)));
  if ((dz ?? 0) < 1e-6) return 'lying';
  return (dx ?? 0) < 1e-6 && (dy ?? 0) < 1e-6 ? 'standing' : null;
}

/**
 * The thinnest plastic round the bore, in mm: the barrel's wall beside the pin and, lying, over the bore's roof at the
 * edges of its flat, where the round top of the barrel has fallen already. Over the middle of the flat it is thicker:
 * taken from there, the roof of a barrel of 8 mm at 0.6 mm read 1.27 mm where the print check found 1.23 (audit W6).
 * Measured straight up from the flat, as the print check measures a floor along its normal: the shortest way from the
 * flat's edge to the barrel's skin is less (0.889 mm against 0.924 on the standard barrel; review of PR BC-10, 7). The
 * defaults measured clean in the print check on 0.4, 0.6 and 0.8 mm nozzles (tools/audit, bc10-hinge).
 */
export function barrelWalls(diameter: number, gap: number, lying: boolean): { wall: number; roof: number | null } {
  const bore = pinDiameter(diameter) / 2 + gap;
  const flat = bore * (Math.SQRT2 - ROOF_TOP);
  return { wall: round(diameter / 2 - bore), roof: lying ? round(Math.sqrt((diameter / 2) ** 2 - flat ** 2) - bore * ROOF_TOP) : null };
}

/**
 * The least the barrel keeps round the bore, in mm: two lines of the nozzle in use, as the print check measures walls
 * (audit MV-04, T12: 0.8 and 0.9 mm were fixed for a 0.4 mm nozzle); lying also four layers, since over the roof and
 * under the bore it is a floor to the print check.
 */
export function barrelLeast(printer: FitPrinter, lying: boolean): number {
  return lying ? Math.max(minimumWall(printer.nozzle), minimumFloor(printer.layer)) : minimumWall(printer.nozzle);
}

/** The thinnest barrel, in half millimetres from 4 to 40, that keeps `barrelLeast` round its bore with this gap; null when none does. */
export function hingeDiameter(gap: number, lying: boolean, printer: FitPrinter = PRINTER): number | null {
  const least = barrelLeast(printer, lying);
  for (let diameter = 4; diameter <= 40; diameter += 0.5) {
    const { wall, roof } = barrelWalls(diameter, gap, lying);
    if (wall >= least && (roof === null || roof >= least)) return diameter;
  }
  return null;
}

/** What is wrong with a hinge before anything is built, in words the model can act on; null when it can be built. */
export function hingeProblem(spec: HingeSpec, printer: FitPrinter = PRINTER): string | null {
  const length = Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0)));
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  const lies = hingeLies(spec);
  if (!lies) return 'the hinge line must be level (from and to at one height: the hinge prints lying) or straight up (only z differs: it prints standing). A line at a slant gets no roof over its bore and no webs, and its knuckles would hang in the air';
  if (!(spec.diameter >= 4 && spec.diameter <= 40)) return 'diameter must be 4–40 mm';
  // Parts printed in place fuse under a nozzle's width, as the print check measures them (designFit.ts, audit MV-03, W10).
  const [fewest, most] = [printInPlaceGap(printer), Math.max(1, printInPlaceGap(printer))];
  if (!(spec.gap >= fewest - 1e-9 && spec.gap <= most + 1e-9)) return `gap must be ${String(fewest)}–${String(most)} mm with a ${String(printer.nozzle)} mm nozzle: closer, parts printed in place fuse`;
  if (spec.gap <= printer.layer) return `gap must be more than a layer (${String(printer.layer)} mm): the slicer closes a gap of one layer`;
  if (!Number.isInteger(spec.knuckles) || spec.knuckles < 3 || spec.knuckles > 9 || spec.knuckles % 2 === 0) return 'knuckles must be 3, 5, 7 or 9';
  const lying = lies === 'lying';
  const least = barrelLeast(printer, lying);
  // Named by the rule that sets it: two lines, four layers, or the floor's own least where four layers are less (review of PR BC-10, 4).
  const lines = least === minimumWall(printer.nozzle) ? `two lines of the ${String(printer.nozzle)} mm nozzle` : least > printer.layer * 4 + 1e-9 ? `a floor of at least ${String(least)} mm` : `four layers of ${String(printer.layer)} mm`;
  const { wall, roof } = barrelWalls(spec.diameter, spec.gap, lying);
  const fits = hingeDiameter(spec.gap, lying, printer);
  // The diameter that passes every check, so the advice does not lead into the next refusal (audit W5, R20), never a gap under the nozzle (W4).
  const instead = fits === null ? `no barrel up to 40 mm keeps that round a bore with a gap of ${String(spec.gap)} mm` : `use a diameter of at least ${String(fits)} mm`;
  if (wall < least) return `the barrel wall around the pin would be ${String(wall)} mm, under the ${String(least)} mm that print solid (${lines}); ${instead}`;
  if (roof !== null && roof < least) return `the barrel would be ${String(roof)} mm thin over the bore's roof, under the ${String(least)} mm that print solid (${lines}); ${instead}`;
  const knuckle = (length - (spec.knuckles - 1) * spec.gap) / spec.knuckles;
  if (knuckle < MIN_KNUCKLE) return `from and to are ${String(round(length))} mm apart, which leaves ${String(round(knuckle))} mm per knuckle; use fewer knuckles or a longer hinge line (at least ${String(MIN_KNUCKLE)} mm each)`;
  // Lying, the pin bridges each knuckle of the moving body; past BRIDGE_SPAN that sags (audit W11, N-passung-texte-3).
  if (lying && pinBridge(spec) > BRIDGE_SPAN) {
    const enough = [3, 5, 7, 9].find((count) => pinBridge({ ...spec, knuckles: count }) <= BRIDGE_SPAN && (length - (count - 1) * spec.gap) / count >= MIN_KNUCKLE);
    const longest = Math.floor((9 * BRIDGE_SPAN - 10 * spec.gap) * 10) / 10;
    return `with ${String(spec.knuckles)} knuckles the pin would bridge ${String(pinBridge(spec))} mm inside each knuckle of ${spec.moving}, more than prints clean (${String(BRIDGE_SPAN)} mm); ${enough ? `use ${String(enough)} knuckles` : `the line is longer than one hinge prints clean: build two or more hinges on the same line, each at most ${String(longest)} mm long, which turn about one joint`}`;
  }
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
  // The direction in full and the points to a micrometre: rounded to 0.001, a slanted direction put the last knuckles of
  // a 200 mm hinge 0.1 mm off (audit T40).
  const axis = delta.map((value) => value / length + 0) as Vec3;
  const at = (distance: number) => spec.from.map((value, i) => Math.round((value + (axis[i] ?? 0) * distance) * 1e6) / 1e6 + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  // Whole micrometres down, so knuckles and gaps are what they say: rounded each on its own, a gap of 0.2 came out
  // 0.199 mm (audit N-mechanik-15). The last knuckle ends at most 9 µm before `to`.
  const knuckle = Math.floor(((length - (spec.knuckles - 1) * spec.gap) / spec.knuckles) * 1000 + 1e-6) / 1000;
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
  if (hingeLies(spec) !== 'lying') return [];
  const top = -radius / Math.SQRT2;
  // Down to inside the bore's gap: below the pin the fixed body has nothing there.
  const points: [number, number][] = [[-radius, top], [radius, top], [radius, -radius - spec.gap / 2], [-radius, -radius - spec.gap / 2]];
  const name = `${span.label} ▬`;
  return [
    { command: 'sketch.create', params: { plane: { origin: at(span.start - spec.gap), x_dir: cross([0, 0, 1], axis).map((value) => value + 0), y_dir: [0, 0, 1] }, project_edges: false, name } },
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
  return hingeLies(spec) === 'lying' && spec.from[2] - spec.diameter / 2 - bed >= WEB.least;
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
    { command: 'sketch.create', params: { plane: { origin: at(forward ? start : end), x_dir: own.toward.map((value) => value + 0), y_dir: [0, 0, 1] }, project_edges: false, name } },
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
  if (hingeLies(spec) !== 'lying') return [];
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
    { command: 'sketch.create', params: { plane: { origin, x_dir: cross([0, 0, 1], axis).map((value) => value + 0), y_dir: [0, 0, 1] }, project_edges: false, name } },
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
  /**
   * The gap over the rail's head in mm, where it is more than `gap`: with the rail upright it is a gap in Z, and that
   * goes to whole layers (F13; audit W14: 0.3 mm were 1.5 layers of 0.2 mm). See {@link slideOver}.
   */
  over?: number;
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
export function slideRoof(spec: Pick<SlideSpec, 'width' | 'height' | 'gap' | 'over'>): { ceiling: number; ridge: number; top: number } {
  const over = spec.over ?? spec.gap;
  const half = spec.width / 2 + spec.gap * Math.SQRT2 + spec.height + over;
  return { ceiling: round(2 * half), ridge: RIDGE, top: round(spec.height + over + half - RIDGE / 2) };
}

/**
 * The gap over a rail's head: `gap` up to whole layers where the rail stands upright (`up` along ±Z), so that the
 * groove's ceiling starts on a layer of its own; undefined where that is `gap` already, or the rail lies on its side.
 * shortcut: a rail on a side wall keeps `gap` over its head, and its flanks' gaps in Z are not laid to layers either; lay them when such guides turn up.
 */
export function slideOver(spec: Pick<SlideSpec, 'gap' | 'up'>, layer: number): number | undefined {
  const size = Math.hypot(...spec.up);
  if (!(layer > 0) || Math.abs(Math.abs(spec.up[2]) - size) > 1e-6 * size) return undefined;
  const over = round(Math.ceil(spec.gap / layer - 1e-6) * layer);
  return over > spec.gap + 1e-9 ? over : undefined;
}

/**
 * What is wrong with a guide before anything is built; null when it can be built. `least` is the smallest gap: 0.2 for a
 * guide that slides, 0.1 for a dovetail pressed together (audit W25: the plug refused the 0.1 its description offered).
 */
export function slideProblem(spec: SlideSpec, least = 0.2): string | null {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const length = Math.hypot(...delta);
  const up = Math.hypot(...spec.up);
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (length < 5) return 'from and to must be at least 5 mm apart';
  if (up < 1e-9) return 'up must not be zero';
  if (Math.abs(delta.reduce((sum, value, i) => sum + value * (spec.up[i] ?? 0), 0)) > 1e-6 * length * up) return 'up must be square to the line from–to (the normal of the face the rail stands on)';
  if (!(spec.width >= 2 && spec.width <= 60)) return 'width must be 2–60 mm';
  if (!(spec.height >= 1.5 && spec.height <= 20)) return 'height must be 1.5–20 mm';
  // Audit T16: a 2 mm foot under 20 mm of height had a head 42 mm wide on a 2 mm neck. Own choice: the head at most three times the neck.
  if (spec.height > spec.width) return `height must be at most width (${String(spec.width)} mm): the rail widens by its height on each side, and its head may be at most three times as wide as its foot`;
  if (!(spec.gap >= least && spec.gap <= 1)) return `gap must be ${String(least)}–1 mm`;
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
  const plane = { origin: spec.from.map(round), x_dir: cross(up, axis).map((value) => value + 0), y_dir: up.map((value) => value + 0) };
  const half = spec.width / 2;
  const { height, gap } = spec;
  const over = spec.over ?? gap;
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
        [half + out + height + over, height + over],
        ...(spec.roof ? ([[roof.ridge / 2, roof.top], [-roof.ridge / 2, roof.top]] as [number, number][]) : []),
        [-(half + out + height + over), height + over],
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
 * whole number of lines on a 0.4 mm nozzle and under two on a 0.6 mm one), and 0.05 mm over them, since the print check
 * reads the round corners of a ring from its mesh and found 1.34 mm in a lip of 1.35 (review of PR #370). 1.4 mm on 0.4
 * and on 0.6, 1.85 mm on 0.8: the snap keeps about the same spring.
 */
export function lipThick(nozzle = 0.4): number {
  const line = round(nozzle * 1.125);
  return round(Math.max(2, Math.ceil(LIP.thick / line - 1e-9)) * line + 0.05);
}

/** How far the lip's tip is bevelled on its outside, a lead-in that swings clear of the box's rim as the lid closes (mm). */
export const LEAD_IN = 0.8;

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
  // Audit W17: a corner wider than half the room is no room of rounded corners any more; and every wall keeps a straight
  // stretch of at least 1 mm, along which the lip is tried (review 2 of PR #370: at 17.5 mm in a room 36 mm wide the trial
  // had no stretch to measure and said the box's wall was missing).
  if (at(spec.radius) > short / 2 - 1) return `radius must be at most ${String(round(short / 2 - 1))} mm: every wall of the room needs a straight stretch of at least 2 mm between its corners`;
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
  // A room with round corners gets round rings, however small the radius: a sharp ring in a round room ran its slope into
  // the corner's round and SolidCraft refused the chamfer (review of PR #370: radius 1). Each outline's radius is the
  // room's less its inset, never under 0.5 mm, and the lip's outside never under the lead-in and 0.2 mm, which SolidCraft
  // cannot roll round a smaller corner; a rounder corner only stands further from the walls.
  const round_ = at(spec.radius) > 0;
  const ringRadius = (inset: number) => {
    const least = inset === LIP.clear ? LEAD_IN + 0.2 : 0.5;
    return typeof spec.radius === 'number' ? mm(Math.max(spec.radius - inset, least)) : `max(${by(spec.radius, -inset)}, ${mm(least)})`;
  };
  // A ring between two outlines of the lid's room, each moved in by an inset, from the height `z` upwards.
  const ring = (label: string, z: string, outside: number, distance: string): Step[] => [
    { command: 'sketch.create', params: { plane: 'XY', offset: z, project_edges: false, name: label } },
    ...[outside, inner].map((inset) => ({
      command: round_ ? 'sketch.rectangle.rounded' : 'sketch.rectangle.two_point',
      params: { p0: [by(x0, inset), by(y0, inset)], p1: [by(x1, -inset), by(y1, -inset)], ...(round_ ? { radius: ringRadius(inset) } : {}) },
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
  // The lead-in on the outside of the lip's tip, all round: with a narrow lid the tip swung through the box's rim on the
  // way shut (review of PR #370: width 30 stopped at 171.6°). A round ring is one chain, a sharp one four edges.
  const tip = at(spec.rim) + up * LIP.high;
  const tipEdges: [number, number, number][] = round_
    ? [xyz(middleAt, at(wallAt) + face, tip)]
    : [[(at(x0) + at(x1)) / 2, at(y0) + LIP.clear, tip], [(at(x0) + at(x1)) / 2, at(y1) - LIP.clear, tip], [at(x0) + LIP.clear, (at(y0) + at(y1)) / 2, tip], [at(x1) - LIP.clear, (at(y0) + at(y1)) / 2, tip]];
  // With a hinge, its wall keeps no lip: the hinge holds the lid on that side, and the knuckles turning there bit the lip
  // and the foot into faces that hung (audit 2026-11-12, T3: 63 mm² at the template; N-nach-1: 0.26 mm left at other sizes).
  // Cut after the slopes were set on the whole ring: the lid's room near that wall, out to past the corners' arcs, so the
  // rings' arcs go too (review of PR #370: at a corner of 15 mm they stayed where the knuckles turn, and a cut through
  // them left wedges of no thickness) and the side lips end square; no wall is touched. The region is picked by a point
  // and kept by its curves, so it follows the sizes.
  const hingeWall = alongX ? (out > 0 ? y0 : y1) : out > 0 ? x0 : x1;
  const reach = round(inner + 0.05);
  const inward = out;
  const past = typeof spec.radius === 'number' ? mm(Math.max(spec.radius, reach) + 0.5) : `(max(${ex(spec.radius)}, ${mm(reach)}) + 0.5 mm)`;
  const band = [by(hingeWall, -inward), `${ex(hingeWall)} ${inward > 0 ? '+' : '-'} ${past}`];
  const flat2 = (point: [string, string, string]) => [point[0], point[1]];
  const unhinged: Step[] = spec.hinge && !spec.flat
    ? [
        { command: 'sketch.create', params: { plane: 'XY', offset: up > 0 ? footZ : by(spec.rim, -LIP.high - 0.1), project_edges: false, name: `${name} ▭` } },
        { command: round_ ? 'sketch.rectangle.rounded' : 'sketch.rectangle.two_point', params: { p0: [ex(x0), ex(y0)], p1: [ex(x1), ex(y1)], ...(round_ ? { radius: ex(spec.radius) } : {}) } },
        { command: 'sketch.rectangle.two_point', params: { p0: flat2(xyz(by(a0, -1), band[0] ?? '', '')), p1: flat2(xyz(by(a1, 1), band[1] ?? '', '')) } },
        {
          command: 'solid.extrude',
          params: {
            distance: `${foot} + ${mm(LIP.high + 0.1)}`,
            operation: 'cut',
            targets: [spec.moving],
            profiles: [{ point: xyz(middleAt, round(at(hingeWall) + (inward * reach) / 2), 0).slice(0, 2) }],
            exact_regions: true,
            name: `${name} ▭`,
          },
        },
      ]
    : [];
  return [
    ...(spec.flat ? [] : ring(`${name} ·`, footZ, -0.2, foot)),
    ...ring(name, by(spec.rim, up > 0 ? 0 : -LIP.high), LIP.clear, mm(LIP.high)),
    ...(spec.flat ? [] : [{ command: 'solid.chamfer', params: { edges: footEdges, distance: mm(inner - 0.05), body: spec.moving, name: `${name} ◢` } }]),
    { command: 'solid.chamfer', params: { edges: tipEdges, distance: mm(LEAD_IN), body: spec.moving, name: `${name} ◥` } },
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

/** How many further screws, snap hooks and pegs one call may place (`more`): the tool's schema takes the largest, and each kind refuses past its own (audit R51). */
export const SCREWS_MORE = 40;
export const HOOKS_MORE = 20;
export const PEGS_MORE = 20;

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
  /** The nozzle the plastic under the head is sized for (mm); default 0.4. */
  nozzle?: number;
  /** The part's material: the clearance hole is drawn wider by its hole allowance (audit S-10), the insert's seat not (S1); default PLA. */
  material?: ToolMaterial;
  name: string;
}

/**
 * The lengths screws are made in, in mm, per size from the standards' tables (audit T17, MV-08: one list for every size
 * named M2×80 and M10×4 and lacked 55 and 65). Socket head cap screws ISO 4762 (fasteners.eu, table ISO 4762: a size
 * runs to the last length its shank is listed for); countersunk ones from DIN 7991, which ISO 10642 replaced, without 45,
 * 55 and 65 (fasteners.eu, page ISO 10642). Checked 2026-11-13.
 */
const SCREW_LENGTHS: Record<'cap' | 'countersunk', { series: number[]; range: Partial<Record<BlockSize, [number, number]>> }> = {
  cap: {
    series: [3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100],
    range: { M2: [3, 20], 'M2.5': [4, 25], M3: [5, 30], M4: [6, 40], M5: [8, 50], M6: [10, 60], M8: [12, 80], M10: [16, 100] },
  },
  countersunk: {
    series: [8, 10, 12, 16, 20, 25, 30, 35, 40, 50, 60, 70],
    range: { M3: [8, 30], M4: [8, 40], M5: [8, 50], M6: [8, 50], M8: [10, 60], M10: [12, 70] },
  },
};
/** A modelled thread holds from about M5 in print; smaller ones strip. */
export const TAPPED_FROM = 5;

const grip = (spec: ScrewSpec) => Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0)));
const metric = (size: BlockSize) => Number(size.slice(1));
/**
 * Plastic left under a sunk head, in mm: at least 1.2 (six layers of 0.2 mm, our own choice) and the print check's least
 * wall, two lines of the nozzle, so a 0.6 mm nozzle gets 1.35 (audit N-mechanik-18, T61: 1.2 was fixed and said "three
 * layers").
 */
export const underHead = (nozzle = 0.4) => Math.max(1.2, minimumWall(nozzle));
/**
 * How deep the head sits in the moving body, without any sink: the counterbore, or the countersink's 90° cone from its
 * width at the face (head and allowance) down to the clearance hole, as it is cut (audit T7, MV-07, W19: 0.6 · d was
 * 0.13 to 0.16 mm less than the cone, so 1.04 mm were left where 1.2 were checked).
 */
const headDepth = (spec: ScrewSpec) =>
  spec.head === 'cap' ? CAP_HEAD[spec.size][1] + HEAD_ALLOWANCE.depth : spec.head === 'countersunk' ? round(((COUNTERSUNK_HEAD[spec.size] ?? 0) + HEAD_ALLOWANCE.diameter - CLEARANCE_NORMAL[spec.size]) / 2) : 0;
/** How deep the screw may reach into the fixed body: the insert, or 2.5 diameters of thread. */
const hold = (spec: ScrewSpec) => (spec.thread === 'insert' ? (INSERT[spec.size]?.length ?? 0) : metric(spec.size) * 2.5);
/** How deep it must reach at least: two thirds of the insert, or two diameters of a printed thread (MV-28: plastic wants at least 2 d). */
const engage = (spec: ScrewSpec) => (spec.thread === 'insert' ? ((INSERT[spec.size]?.length ?? 0) * 2) / 3 : metric(spec.size) * 2);

/** The lengths the screw of a joint is made in, shortest first. */
export function screwLengths(spec: Pick<ScrewSpec, 'size' | 'head'>): number[] {
  const table = SCREW_LENGTHS[spec.head === 'countersunk' ? 'countersunk' : 'cap'];
  const [least, most] = table.range[spec.size] ?? [0, -1];
  return table.series.filter((length) => length >= least && length <= most);
}

/**
 * Where the screw reaches into the fixed body, from the face the two meet at: from the least to the most it may, for a
 * head not sunk deeper. A socket head's length counts from under the head, a countersunk one's from its top.
 */
export function screwWindow(spec: ScrewSpec): { least: number; most: number; through: number } {
  const through = grip(spec) - (spec.head === 'cap' ? headDepth(spec) : 0);
  return { least: round(through + engage(spec)), most: round(through + hold(spec)), through: round(through) };
}

/**
 * The screw to buy and how much deeper its head sits than the counterbore or countersink would put it (audit T17, W20:
 * at many thicknesses no standard length ended in the insert, and no screw went in). The longest standard length that
 * ends inside the insert or thread and holds at least `engage` of it; where none does, the next shorter one, with the
 * head sunk deeper by what it lacks (`screwSink`), at most `sinkMost` and as long as the plastic under the head stays.
 * Null when neither fits: a head lying on the face cannot sink.
 */
export function screwFit(spec: ScrewSpec): { length: number; sink: number } | null {
  const { least, most } = screwWindow(spec);
  const fits = screwLengths(spec).filter((length) => length >= least - 1e-9 && length <= most + 1e-9);
  const longest = fits.at(-1);
  if (longest !== undefined) return { length: longest, sink: 0 };
  const sunk = spec.head === 'none' ? null : screwSink(spec);
  if (!sunk || sunk.sink > sinkMost(spec.size) + 1e-9) return null;
  return round(grip(spec) - headDepth(spec) - sunk.sink) >= underHead(spec.nozzle) ? sunk : null;
}

/**
 * How much deeper a head may sink for a standard length: one diameter, so a counterbore stays within twice the head's
 * height (ISO 4762: k = d) and the key still reaches the head (review of BC-07: M2 through 60 mm sank 40.27 mm).
 */
export const sinkMost = (size: BlockSize) => metric(size);

/** The next standard length shorter than the screw must reach, and how much deeper the head must sink for it; null where there is none. */
export function screwSink(spec: ScrewSpec): { length: number; sink: number } | null {
  const { least } = screwWindow(spec);
  const shorter = screwLengths(spec).filter((length) => length < least).at(-1);
  return shorter === undefined ? null : { length: shorter, sink: Math.ceil((least - shorter) * 100 - 1e-6) / 100 };
}

/** What is wrong with a screw joint before anything is built; null when it can be built. */
export function screwProblem(spec: ScrewSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (grip(spec) < 1) return 'from and to must be at least 1 mm apart: from where the screw goes in, to where it passes into the fixed body';
  if (spec.thread === 'insert' && !INSERT[spec.size]) return `there is no heat-set insert for ${spec.size} in the table (M2 to M6); use thread tapped or another size`;
  if (spec.thread === 'tapped' && metric(spec.size) < TAPPED_FROM) return `a printed ${spec.size} thread strips; use thread insert, or M${String(TAPPED_FROM)} and larger`;
  if (spec.head === 'countersunk' && metric(spec.size) < 3) return 'countersunk screws start at M3';
  // Rounded as it is said, so a thickness that leaves just enough is not refused by a float (audit N-bloecke-7).
  const [left, under] = [round(grip(spec) - headDepth(spec)), underHead(spec.nozzle)];
  if (spec.head !== 'none' && left < under) return `the moving body is ${String(round(grip(spec)))} mm thick there, which leaves ${String(left)} mm under the ${spec.head === 'cap' ? 'counterbore' : 'countersink'}; make it at least ${String(round(headDepth(spec) + under))} mm thick, or use head none`;
  if (spec.more.length > SCREWS_MORE) return `at most ${String(SCREWS_MORE)} further screws`;
  return null;
}

/**
 * The holes of a screw joint, one set per screw: in the moving body a clearance hole of ISO 273, normal, from our own
 * table (audit W21: SolidCraft's was taken unseen and its size never said) with the room for the head, drilled only as
 * deep as that body is thick; a head that must sink deeper for a standard length (`screwFit`) gets a counterbore that
 * much deeper, a countersink a cylinder as wide as its mouth over it. In the fixed body, on the same line, the seat of a
 * heat-set insert (a millimetre deeper than the insert, for the plastic it pushes down) or a modelled thread. With
 * `screws` the screws themselves follow as standard parts, each seated in its hole.
 */
export function screwSteps(spec: ScrewSpec): Step[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const direction = delta.map((value) => value / grip(spec) + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const insert = INSERT[spec.size];
  const fit = screwFit(spec);
  const sink = fit?.sink ?? 0;
  const room = headRecess(spec);
  const family = spec.head === 'countersunk' ? 'countersunk_socket_screw' : 'socket_head_cap_screw';
  const entries = [spec.from, ...spec.more].map((entry) => entry.map(round) as Vec3);
  const along = (entry: Vec3, distance: number) => entry.map((value, k) => round(value + (direction[k] ?? 0) * distance)) as Vec3;
  const holes = entries.flatMap((entry, i): Step[] => {
    const meet = entry.map((value, k) => round(value + (delta[k] ?? 0))) as Vec3;
    const label = `${spec.name} ${String(i + 1)}`;
    // A countersink sunk deeper starts on the floor of a cylinder as wide as its mouth.
    const sunk = spec.head === 'countersunk' && sink > 0 && room;
    const hole = { diameter: mm(drawnHole(CLEARANCE_NORMAL[spec.size], spec.material)), direction, targets: [spec.moving], name: label };
    return [
      ...(sunk ? [{ command: 'solid.cylinder', params: { diameter: mm(room.diameter), height: mm(sink), base: entry, axis: direction, operation: 'cut', targets: [spec.moving], name: `${label} ◎` } }] : []),
      sunk
        ? { command: 'solid.hole', params: { position: along(entry, sink), ...hole, type: 'countersink', cs_diameter: mm(room.diameter), cs_angle: '90 deg', depth: mm(grip(spec) - sink) } }
        : { command: 'solid.hole', params: { position: entry, ...hole, ...headRoom(spec), depth: mm(grip(spec)) } },
      {
        command: 'solid.hole',
        params:
          spec.thread === 'insert' && insert
            ? { position: meet, direction, diameter: mm(insert.diameter), depth: mm(insert.length + 1), targets: [spec.fixed], name: `${label} ○` }
            : { position: meet, direction, thread: spec.size, modeled: true, depth: mm(hold(spec) + 1), targets: [spec.fixed], name: `${label} ○` },
      },
    ];
  });
  if (!spec.screws || fit === null) return holes;
  // Each put where it sits, head outwards: a socket head on the floor of its counterbore, a countersunk head flush with
  // the face or as deep as it is sunk. (Seated by a pick on the hole, SolidCraft 0.40.0-rc.4 turns the screw in from the
  // far side.) The screws come after every hole, so they belong to the design and not to a body's component.
  // Plus zero: no negative zero in what goes to SolidCraft.
  const outwards = direction.map((value) => round(-value) + 0);
  return [
    ...holes,
    ...entries.map((entry) => ({
      command: 'parts.insert',
      params: { family, size: spec.size, length: fit.length, point: along(entry, spec.head === 'cap' ? (room?.depth ?? 0) : sink), direction: outwards },
    })),
  ];
}

/** The room for the head in the moving body: its width at the face and how deep the head sits, sunk deeper where `screwFit` says; null for a head lying on the face. */
export function headRecess(spec: ScrewSpec): { diameter: number; depth: number } | null {
  if (spec.head === 'none') return null;
  const sink = screwFit(spec)?.sink ?? 0;
  if (spec.head === 'cap') return { diameter: CAP_HEAD[spec.size][0] + 2 * HEAD_ALLOWANCE.diameter, depth: round(headDepth(spec) + sink) };
  return { diameter: (COUNTERSUNK_HEAD[spec.size] ?? CAP_HEAD[spec.size][0]) + HEAD_ALLOWANCE.diameter, depth: round(headDepth(spec) + sink) };
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
  /** The room between the two threads, radially; all of it on the lid. Square to the 45° flanks it is gap / √2 (audit T58). */
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
  // The section reaches 0.2 mm into its body, along its flanks, but never to the next turn; where that cuts it short (pitch
  // 3) it reaches in radially as far as it does along the axis, so the flanks keep 45° (audit T6: 46.1° there).
  const into = Math.min(thread.foot / 2 + 0.2, thread.pitch / 2 - 0.05);
  const overlap = round(into - thread.crest / 2 - thread.depth);
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
    ...Array.from({ length: spec.starts }, (_, k) => coil(spec.name, spec.fixed, start, radius - overlap, radius + thread.depth, k)).flat(),
    // The lid's top edge lies on the bed when it prints, so its last 0.6 mm are a cone, not a chamfer: SolidCraft
    // 0.40.0-rc.4 refuses to chamfer the top edge of a cylinder from about 60 mm of diameter.
    { command: 'solid.cylinder', params: { diameter: mm(2 * outer), height: mm(rim + LID.top - 0.6 - mouth), base: [cx, cy, round(mouth)], operation: 'new', body_name: spec.moving, name: spec.moving } },
    { command: 'solid.cone', params: { diameter: mm(2 * outer), top_diameter: mm(2 * outer - 1.2), height: '0.6 mm', base: [cx, cy, round(rim + LID.top - 0.6)], operation: 'join', targets: [spec.moving], name: `${spec.name} ◢` } },
    { command: 'solid.cylinder', params: { diameter: mm(2 * bore), height: mm(rim - mouth), base: [cx, cy, round(mouth)], operation: 'cut', targets: [spec.moving], name: `${spec.name} ○` } },
    ...Array.from({ length: spec.starts }, (_, k) => coil(`${spec.name} ·`, spec.moving, lidStart, bore + overlap, radius + spec.gap, k)).flat(),
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
  /** The hook's sizes on the printer and in the material ({@link snapHook}). */
  hook: SnapHook;
  name: string;
}

/**
 * The one table of PartBuddy's cantilever hook, for the snap block (blocks.ts) and the snap mechanism (audit G9: the
 * block kept its own copy), in mm: an arm 12 long, 1.5 thick and 5 wide (Hubs: no narrower) with a catch 0.8 deep on its
 * last 1.5. The arm stands `gap` off the wall, so the catch reaches `catch − gap` (0.6) over the window's edge, and that
 * is also how far the arm bends as it snaps in ({@link snapHold}; audit T58, W23: 0.8 was said). The window is `side`
 * wider on each side, its edge lies `seat` under the catch and it leaves `air` over the tip ({@link snapWindow}).
 * Clearances are those of guides for printed parts, which run from 0.1 to 0.5. These are the sizes for a 0.4 mm nozzle;
 * {@link snapHook} raises them to the nozzle and the material.
 */
export const SNAP = { length: 12, thickness: 1.5, width: 5, catch: 0.8, catchLength: 1.5, gap: 0.2, side: 0.3, seat: 0.2, air: 0.5 };
export type SnapHook = typeof SNAP;

/** The radius at an arm's root as a share of its thickness: Bayer's optimum R/h 0.6 (Snap-Fit Joints for Plastics, p. 8); Hubs asks at least 0.5, Sovol 0.5 to 1 (audit MV-10). */
export const SNAP_ROOT = 0.6;

/**
 * How far an arm may bend at its root for one snap-in, as a share of the yield strain: amorphous plastics up to about 70 %
 * (Bayer, Snap-Fit Joints for Plastics, p. 11; partly crystalline ones nearly to the yield point, so 70 % is the safe side
 * for both). For parts taken apart often Bayer takes about 60 % of that (table 2).
 * shortcut: the 60 % has one source and is said in the answers, not checked; check it when a second source turns up.
 */
export const SNAP_ONCE = 0.7;
export const SNAP_OFTEN = 0.6;

/**
 * The yield strain of printed test bars in per cent, flat and on their side, the lower of two makers' data sheets per
 * material (audit MV-12, S-13, T18; read 2026-11-14), and a cap where a guide gives a lower allowed strain:
 * PLA: Ultimaker PLA TDS v2.00 (2022-04-20) 3.4 % flat and on its side; Prusament PLA TDS v1.1 (2022-07-27) 2.9 % horizontal,
 * 3.2 % vertical xz. PETG: Ultimaker PETG TDS v1.00 (2022-04-29) 5.9 / 6.0 %; Prusament PETG TDS (2020) 5.1 / 5.1 %.
 * PC: Ultimaker PC TDS v2.00 (2022-04-20) 6.1 / 5.9 % (70 % of it 4.1); Bayer's table 2 allows moulded PC 4 % once.
 * Other materials have no two sources here (Ultimaker alone: ABS 4.1 %, nylon 6.1 %; fibre-filled types yield less) and are
 * held to PLA's, the lowest.
 * shortcut: ABS, ASA, PA, PP, TPU and the fibre-filled types take PLA's value; add each with a second data sheet.
 */
const SNAP_YIELD: Record<string, { yield: number; cap?: number }> = { PLA: { yield: 2.9 }, PETG: { yield: 5.1 }, PC: { yield: 5.9, cap: 4 } };
/** The material whose allowed strain stands in for one without sources: the lowest. */
const SNAP_FALLBACK = 'PLA';

/** The allowed strain of a material type in the table, rounded down to 0.1 %. */
const allowedOf = (type: string) => {
  const entry = SNAP_YIELD[type] ?? SNAP_YIELD[SNAP_FALLBACK] ?? { yield: 2.9 };
  return Math.floor(Math.min(SNAP_ONCE * entry.yield, entry.cap ?? Infinity) * 10 + 1e-6) / 10;
};

/**
 * Bars printed upright, pulled across their layers, broke without yielding at 1.7 to 2 % (Ultimaker data sheets 2022: PLA
 * 2.0, PETG 1.8, ABS 2.0, PC 2.0, nylon 1.7); Prusament PETG's upright bars yield at 2.5 % against 5.1 % flat. An arm that
 * bends across its layers therefore takes far less than the table says (audit R31, H-21: "about half" had no source).
 */
export const UPRIGHT_BREAK = { least: 1.7, most: 2 };

/** What an answer says of an arm that bends across its layers (audit R31, H-21: "at about half the strain" had no source); `then` follows as its own sentence. */
export const uprightSaid = (arm: string, then: string) =>
  `Printed standing, ${arm} bends across its layers, and upright test bars broke at ${String(UPRIGHT_BREAK.least)} to ${String(UPRIGHT_BREAK.most)} % without yielding (makers' data sheets). ${then}`;

/**
 * How far a snap arm may bend at its root in the profile's material, per cent, and which entry that is: a word of the
 * material's name that is a type in the table (`PLA`, `PLA Matte`, `Prusament PETG`); the lowest when several are, and
 * PLA's, the lowest of all, when none is (`known` false; `PLA-CF`, `ABS`).
 */
export function snapLimit(material?: { name?: string | undefined }): { strain: number; often: number; type: string; known: boolean; name: string } {
  // No material is PLA, as with every tool (toolFit.ts DEFAULT_MATERIAL).
  const name = material?.name?.trim() || SNAP_FALLBACK;
  const types = name.toUpperCase().split(/\s+/).filter((word) => word in SNAP_YIELD);
  const type = types.sort((a, b) => allowedOf(a) - allowedOf(b))[0];
  const strain = allowedOf(type ?? SNAP_FALLBACK);
  return { strain, often: Math.floor(strain * SNAP_OFTEN * 10 + 1e-6) / 10, type: type ?? SNAP_FALLBACK, known: type !== undefined, name };
}

/** What an answer says of the allowed strain: the material's, or that none is known and PLA's is taken. */
export function limitWords(limit: ReturnType<typeof snapLimit>): string {
  return limit.known
    ? `${String(limit.strain)} %, what printed ${limit.type} takes for one snap-in (${String(Math.round(SNAP_ONCE * 100))} % of its yield strain)`
    : `${String(limit.strain)} %: no allowed strain is known for ${limit.name}, so PartBuddy holds it to ${limit.type}'s, the lowest it knows`;
}

/**
 * The bending strain at the arm's root when the catch is pushed aside by its depth, for a cantilever of constant section:
 * 1.5 · thickness · deflection / lever², in per cent (Bayer, p. 9). SolidCraft's length includes the catch, so the lever
 * runs to the catch's middle.
 */
export function snapStrain(block: { length: number; thickness: number; catchDepth: number; catchLength: number }): number {
  const lever = Math.max(block.length - block.catchLength / 2, block.length / 4);
  return (150 * block.thickness * block.catchDepth) / lever ** 2;
}

/** The least length, to 0.1 mm, at which an arm `thickness` thick bends at most `strain` per cent as its catch is pushed `bend` aside ({@link snapStrain} turned round). */
export function snapLength(thickness: number, bend: number, catchLength: number, strain: number): number {
  return Math.ceil((Math.sqrt((150 * thickness * bend) / strain) + catchLength / 2) * 10 - 1e-6) / 10;
}

/**
 * The hook on the printer in the material (audit W15 rest, BC-16: refused on coarse nozzles before): the arm at least two
 * lines, the catch at least the narrowest line a slicer lays, the arm standing that much further off the wall so that it
 * still bends {@link snapHold}, and long enough to bend within what the material takes ({@link snapLimit}).
 */
export function snapHook(printer: FitPrinter, material?: { name?: string | undefined }): SnapHook {
  const thickness = Math.max(SNAP.thickness, minimumWall(printer.nozzle));
  const depth = Math.max(SNAP.catch, thinnestLine(printer.nozzle));
  const length = Math.max(SNAP.length, snapLength(thickness, snapHold(), SNAP.catchLength, snapLimit(material).strain));
  return { ...SNAP, length, thickness, catch: depth, gap: round(depth - snapHold()) };
}

/** How far a hook's catch reaches over its window's edge, and how far the arm bends to pass the wall: the catch less the room between arm and wall (mm), the same for every hook {@link snapHook} sizes. */
export const snapHold = () => round(SNAP.catch - SNAP.gap);

/** A hook's window in its wall: from `from` to `to` mm above the hook's foot, `half` to each side of the hook's middle. */
export function snapWindow(hook: SnapHook = SNAP): { from: number; to: number; half: number } {
  const from = round(hook.length - hook.catchLength - hook.seat);
  return { from, to: round(from + hook.catchLength + hook.seat + hook.air), half: round(hook.width / 2 + hook.side) };
}

/**
 * Whether a part stands upright along `up` as it is designed: within 45° of Z.
 * shortcut: the design's lay, not the print face (audit S-13 asks the print check, lane L1, to report an arm across its layers).
 */
export const standsUpright = (up: Vec3) => Math.abs(up[2]) / (Math.hypot(...up) || 1) >= Math.SQRT1_2;

/** `up` of length 1 and `way` square to it, of length 1, and `across` = up × way: the frame of a snap hook and of a latch (one code; BC-11 review). */
function frameOf(upward: Vec3, way: Vec3): { up: Vec3; way: Vec3; across: Vec3 } {
  const up = upward.map((value) => value / Math.hypot(...upward)) as Vec3;
  const along = way.reduce((sum, value, i) => sum + value * (up[i] ?? 0), 0);
  const flat = way.map((value, i) => value - along * (up[i] ?? 0)) as Vec3;
  const square = flat.map((value) => value / Math.hypot(...flat)) as Vec3;
  return { up, way: square, across: cross(up, square) };
}

/** The ways of a snap hook, each of length 1: `up` as it stands, `toward` the wall square to it, `across` the hook. */
export function snapFrame(spec: Pick<SnapSpec, 'up' | 'toward'>): { up: Vec3; toward: Vec3; across: Vec3 } {
  const { up, way, across } = frameOf(spec.up, spec.toward);
  return { up, toward: way, across };
}

/** What is wrong with a snap hook before anything is built; null when it can be built. */
export function snapProblem(spec: SnapSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  if (Math.hypot(...spec.up) < 1e-9) return 'up must not be zero';
  const up = spec.up.map((value) => value / Math.hypot(...spec.up)) as Vec3;
  if (Math.hypot(...cross(up, spec.toward)) < 1e-6) return 'to must lie beside from, in the wall the catch goes into: not straight along up';
  if (!(spec.wall >= 1.6 && spec.wall <= 10)) return 'wall must be 1.6–10 mm';
  if (spec.more.length > HOOKS_MORE) return `at most ${String(HOOKS_MORE)} further hooks`;
  return null;
}

/**
 * shortcut: no radius at the hooks' roots (audit MV-10): on the side towards the wall, where the arm is pulled, one would run
 * into the wall `gap` away; the snapFit block has it. Set the hook off the wall by the radius if a root cracks.
 *
 * A snap hook on the fixed body and its window in the wall of the other: the catch's flat underside lies over the
 * window's edge and holds against pulling the parts apart; pressed back through the window it lets go. The window is
 * cut first and the hook built last, each with its own body's component active.
 */
export function snapSteps(spec: SnapSpec): Step[] {
  const { up, toward, across } = snapFrame(spec);
  const tidy = (vector: Vec3) => vector.map((value) => round(value) + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const feet = [spec.from, ...spec.more];
  const hook = spec.hook;
  const { from, to, half } = snapWindow(hook);
  const high = round(to - from);
  const windows = feet.flatMap((foot, i): Step[] => {
    const name = `${spec.name} ${String(i + 1)} □`;
    return [
      // Sketch x across the hook, y up it: x × y points into the wall, so a positive distance cuts. The cut starts at the
      // arm's face, `gap` before the wall, so a round wall keeps no wedge at the window's sides (practice run BC-11: a
      // wall of 28 mm radius kept 0.14 mm there, a thin wall to the print check).
      { command: 'sketch.create', params: { plane: { origin: foot.map((value, k) => round(value + (up[k] ?? 0) * from - (toward[k] ?? 0) * hook.gap)), x_dir: tidy(across), y_dir: tidy(up) }, project_edges: false, name } },
      { command: 'sketch.line', params: { points: [[-half, 0], [half, 0], [half, high], [-half, high]], closed: true } },
      { command: 'solid.extrude', params: { distance: mm(spec.wall + hook.gap), operation: 'cut', targets: [spec.moving], name } },
    ];
  });
  const hooks = feet.map((foot): Step => ({
    command: 'plastic.snap_fit',
    params: {
      position: foot.map((value, k) => round(value - (toward[k] ?? 0) * hook.gap)),
      direction: tidy(up),
      hook: tidy(toward),
      length: mm(hook.length),
      thickness: mm(hook.thickness),
      width: mm(hook.width),
      catch_depth: mm(hook.catch),
      catch_length: mm(hook.catchLength),
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
  /** The room round the peg in its pocket, per side, in mm, as printed. */
  gap: number;
  /** The part's material: the pocket is drawn wider by its hole allowance (audit S-10, W16); default PLA. */
  material?: ToolMaterial;
  name: string;
}

/**
 * A peg, in mm: one and a half diameters long (what makers of split prints publish: 1.5 to 2), its pocket `deeper` for
 * air and glue, and `chamfer` at 45° on the peg's tip and the pocket's mouth so they find each other. Under 5 mm a
 * standing peg is perimeters only and weak (Hubs). Round each pocket the moving body keeps `wall`, as round a screw boss
 * or an insert's seat (seatWall in blockTool.ts), and under it {@link pegFloor} (audit W24: an unclear "max(2·Ø, 4) mm
 * round the axis" stood in the answer, and nothing was measured).
 */
export const PEG = { ratio: 1.5, deeper: 1, chamfer: 0.5, root: 0.5, least: 5, wall: 2 };

/**
 * The plastic under a pocket, in mm: what the print check takes for a floor, four layers and at least 0.8 mm, or for a
 * wall, two lines, as the pocket stands (0.6 mm, three layers, was a thin floor to the check).
 */
export const pegFloor = (nozzle = 0.4, layer = 0.2) => Math.max(minimumFloor(layer), minimumWall(nozzle));

/** A peg's pocket as drawn: the peg, its gap on both sides, and the material's hole allowance. */
export const pegBore = (spec: Pick<PegSpec, 'diameter' | 'gap' | 'material'>) => drawnHole(spec.diameter + 2 * spec.gap, spec.material);

/** How far a peg stands out of its face. */
export function pegLength(diameter: number): number {
  return round(diameter * PEG.ratio);
}

/** What is wrong with a peg before anything is built; null when it can be built. */
export function pegProblem(spec: PegSpec): string | null {
  if (spec.fixed === spec.moving) return 'fixed and moving must be two bodies';
  // pegSteps takes the way from from to to (audit T59).
  if (Math.hypot(...spec.to.map((value, i) => value - (spec.from[i] ?? 0))) < 1e-6) return 'from and to must be two points: to lies further into the moving body';
  if (!(spec.diameter >= 3 && spec.diameter <= 20)) return 'diameter must be 3–20 mm';
  if (!(spec.gap >= 0.05 && spec.gap <= 0.5)) return 'gap must be 0.05–0.5 mm';
  if (spec.more.length > PEGS_MORE) return `at most ${String(PEGS_MORE)} further pegs`;
  return null;
}

/**
 * Pegs on the fixed body and their pockets in the moving one, along the line `from`–`to`: each pocket with its
 * chamfered mouth first, then the peg, rooted in its body, with a chamfered tip.
 */
export function pegSteps(spec: PegSpec): Step[] {
  const delta = spec.to.map((value, i) => value - (spec.from[i] ?? 0)) as Vec3;
  const axis = delta.map((value) => value / Math.hypot(...delta) + 0) as Vec3;
  const mm = (value: number) => `${String(round(value))} mm`;
  const long = pegLength(spec.diameter);
  const bore = pegBore(spec);
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
  /** The latch's sizes on the printer and in the material ({@link latchArm}). */
  arm: LatchArm;
  name: string;
}

/**
 * A snap latch outside a box, in mm (decided 2026-11-11: one arm that bends, not a latch turning on a pin of its own,
 * whose play would be larger than any catch; audit H-24). An arm
 * `thick` stands `off` the wall, rooted in the lid between `foot` and `head` above the joint, where a 45° slope
 * carries it, and meets the root's underside in a radius `root`, half its thickness (Bayer, BASF: at least half the
 * arm's thickness at the root; audit MV-11: a sharp inner corner); `lever` below its root a hook reaches to `clear` off the wall, under a bead that stands `bead` out of
 * the box, the two 45° faces `seat` apart: none, so the closed lid cannot lift before the hook holds (at 0.2 it rattled,
 * practice run 2026-11-11), and a print that comes out fuller only seats the hook a little further out on its slope.
 * Lid and box print apart, so the faces need no room: a lid on a print-in-place hinge prints with its box, and there
 * they would fuse (audit R40), so the tool refuses it. `tab` of arm below the hook is for the finger. `into` of each
 * profile lies in its wall, which the tool measures ({@link latchStrain} for the bend).
 */
export const LATCH = { thick: 1.6, off: 1.5, foot: 1, head: 5, lever: 12, bead: 1.2, clear: 0.4, seat: 0, tab: 2, into: 0.5, beside: 1, root: 0.8 };
export type LatchArm = typeof LATCH;

/** How much flat wall the latch needs: on the lid above the joint, and on the box below it. */
export function latchReach(arm: LatchArm = LATCH): { above: number; below: number } {
  const hook = arm.off - arm.clear;
  return { above: round(arm.head + arm.off + arm.thick), below: round(arm.lever - arm.foot + hook + arm.tab) };
}

/**
 * The strain at the arm's root as the hook passes the bead, in per cent: 1.5 · thick · (bead − clear) / lever², the
 * lever taken from where the root's radius starts, which is the shorter and the stricter (1.3 % from its flat underside).
 */
export function latchStrain(arm: LatchArm = LATCH): number {
  return (150 * arm.thick * (arm.bead - arm.clear)) / (arm.lever - arm.root) ** 2;
}

/**
 * The latch on the printer in the material (audit W15 rest, BC-16: refused on coarse nozzles before): the arm at least two
 * lines thick, its root's radius half of that, and its lever long enough to bend within what the material takes
 * ({@link snapLimit}), measured from where the radius starts as {@link latchStrain} does.
 * shortcut: held to the strain of bars printed flat, though the arm prints upright and bends across its layers (1.5 % against
 * the 1.7 to 2 % at which upright bars broke, UPRIGHT_BREAK); the answer says so. Lengthen the lever when a print cracks.
 */
export function latchArm(printer: FitPrinter, material?: { name?: string | undefined }): LatchArm {
  const thick = Math.max(LATCH.thick, minimumWall(printer.nozzle));
  const root = round(thick / 2);
  const lever = Math.max(LATCH.lever, round(root + snapLength(thick, LATCH.bead - LATCH.clear, 0, snapLimit(material).strain)));
  // The root's radius keeps the standard's distance above the joint, so a wider one does not reach into the box.
  return { ...LATCH, thick, root, lever, foot: round(Math.max(LATCH.foot, root + LATCH.foot - LATCH.root)) };
}

/** The ways of a latch, each of length 1: `up` from box to lid, `out` of the wall square to it, `run` along the wall, the way its profiles are extruded. */
export function latchFrame(spec: Pick<LatchSpec, 'up' | 'out'>): { up: Vec3; out: Vec3; run: Vec3 } {
  const { up, way, across } = frameOf(spec.up, spec.out);
  // x × y of the sketch, out × up: the profiles are extruded this way along the wall.
  return { up, out: way, run: across.map((value) => -value + 0) as Vec3 };
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
  const { up, out, run } = latchFrame(spec);
  const tidy = (vector: Vec3) => vector.map((value) => round(value) + 0) as Vec3;
  const { thick, off, foot, head, lever, bead, clear, seat, tab, into, beside, root } = spec.arm;
  const hook = off - clear;
  const crest = foot - lever;
  const outer = off + thick;
  // The bead's crest lies above the hook's so that their faces are `seat` apart, measured upright.
  const ridge = crest + bead - clear + seat;
  const at = (points: [number, number][]) => points.map(([x, y]) => [round(x), round(y)]);
  const profile = (curves: Step[], half: number, target: string, name: string): Step[] => [
    { command: 'sketch.create', params: { plane: { origin: spec.from.map((value, i) => round(value - (run[i] ?? 0) * half)), x_dir: tidy(out), y_dir: tidy(up) }, project_edges: false, name } },
    ...curves,
    { command: 'solid.extrude', params: { distance: `${String(round(2 * half))} mm`, operation: 'join', targets: [target], name } },
  ];
  return [
    ...profile(
      [
        {
          command: 'sketch.line',
          params: {
            points: at([
              [-into, ridge + bead],
              [0, ridge + bead],
              [bead, ridge],
              [0, ridge - bead],
              [-into, ridge - bead],
            ]),
            closed: true,
          },
        },
      ],
      spec.width / 2 + beside,
      spec.fixed,
      `${spec.name} ◁`,
    ),
    // The arm's outline down to its root's radius, the radius counter-clockwise, and back along the root's underside:
    // each curve starts where the last ended, so SolidCraft joins them into one closed profile.
    ...profile(
      [
        {
          command: 'sketch.line',
          params: {
            points: at([
              [-into, head + outer],
              [0, head + outer],
              [outer, head],
              [outer, crest - hook - tab],
              [off, crest - hook - tab],
              [off, crest - hook],
              [clear, crest],
              [off, crest + hook],
              [off, foot - root],
            ]),
          },
        },
        { command: 'sketch.arc.center_point', params: { center: at([[off - root, foot - root]])[0], start: at([[off, foot - root]])[0], end: at([[off - root, foot]])[0] } },
        {
          command: 'sketch.line',
          params: {
            points: at([
              [off - root, foot],
              [-into, foot],
              [-into, head + outer],
            ]),
          },
        },
      ],
      spec.width / 2,
      spec.moving,
      spec.name,
    ),
  ];
}
