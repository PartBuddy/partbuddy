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
    // Room for each knuckle in the other body, a gap wider all round and at both ends.
    ...spans.map((span) => cylinder(spec.diameter + 2 * spec.gap, Math.max(0, span.start - spec.gap), Math.min(length, span.end + spec.gap), 'cut', span.other, `${span.label} ·`)),
    ...spans.map((span) => cylinder(spec.diameter, span.start, span.end, 'join', span.owner, span.label)),
    // The bore through the moving knuckles, then the pin through everything.
    cylinder(pin + 2 * spec.gap, 0, length, 'cut', spec.moving, `${spec.name} ○`),
    cylinder(pin, 0, length, 'join', spec.fixed, `${spec.name} ●`),
  ];
}
