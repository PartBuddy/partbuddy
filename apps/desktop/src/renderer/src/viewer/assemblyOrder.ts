import type { AssemblyPlan, AssemblyStep } from '../../../shared/assembly';

/**
 * The assembly order proposed from the geometry when the assistant has not set one (ADR 0026),
 * from the parts' boxes: the lowest, widest part is the base; then each part that touches what
 * is already placed, a part inside another first, from the bottom up; fasteners and other standard
 * parts last. Each step joins onto the placed part it touches most, coming down from above when it
 * sits over that part and from the side otherwise. Pure, so tests run without WebGL.
 * shortcut: boxes, not exact contact; a part that only touches through a slanted face may be
 * taken as free. Upgrade to SolidCraft's clearance check when such assemblies matter.
 */

export type Vec3 = [number, number, number];
export interface PartBox {
  name: string;
  min: Vec3;
  max: Vec3;
  /** A standard part (B7): screws, nuts, inserts go in last. */
  standard?: boolean;
}

/** Boxes closer than this (mm) count as touching. */
const CONTACT = 0.5;
/** A part whose box holds less than this share of the largest box's volume counts as a fastener. */
const FASTENER_SHARE = 0.01;
/** Share of a part's footprint that must lie over the target for it to come down from above. */
const ABOVE_SHARE = 0.6;

const volume = (box: PartBox) => Math.max(0, box.max[0] - box.min[0]) * Math.max(0, box.max[1] - box.min[1]) * Math.max(0, box.max[2] - box.min[2]);
const footprint = (box: PartBox) => Math.max(0, box.max[0] - box.min[0]) * Math.max(0, box.max[1] - box.min[1]);
const centre = (box: PartBox): Vec3 => [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];

/** Overlap of the two boxes along one axis (negative: the gap). */
const overlapOn = (a: PartBox, b: PartBox, axis: 0 | 1 | 2) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]);

function touches(a: PartBox, b: PartBox): boolean {
  return ([0, 1, 2] as const).every((axis) => overlapOn(a, b, axis) >= -CONTACT);
}

function inside(inner: PartBox, outer: PartBox): boolean {
  return ([0, 1, 2] as const).every((axis) => inner.min[axis] >= outer.min[axis] - CONTACT && inner.max[axis] <= outer.max[axis] + CONTACT);
}

/** How much two boxes have to do with each other: the overlap of the boxes grown by the contact distance. */
function contact(a: PartBox, b: PartBox): number {
  return ([0, 1, 2] as const).reduce<number>((product, axis) => product * Math.max(0, overlapOn(a, b, axis) + CONTACT * 2), 1);
}

/** The direction `part` moves to reach `target`: down when it sits over it, else straight toward it along the main axis. */
export function joiningDirection(part: PartBox, target: PartBox): Vec3 {
  const over = Math.max(0, overlapOn(part, target, 0)) * Math.max(0, overlapOn(part, target, 1));
  const partCentre = centre(part);
  const targetCentre = centre(target);
  // Over or inside the target it comes down (printed housings open upward); only a part under the target's floor comes up.
  if (footprint(part) > 0 && over / footprint(part) >= ABOVE_SHARE) return part.max[2] <= target.min[2] + CONTACT ? [0, 0, 1] : [0, 0, -1];
  const d = [targetCentre[0] - partCentre[0], targetCentre[1] - partCentre[1], targetCentre[2] - partCentre[2]];
  const axis = [0, 1, 2].reduce((best, i) => (Math.abs(d[i] ?? 0) > Math.abs(d[best] ?? 0) ? i : best), 0);
  const result: Vec3 = [0, 0, 0];
  result[axis] = Math.sign(d[axis] ?? 0) || -1;
  return result;
}

/**
 * The proposed plan for these parts; `label` names a step from its part and target (null for the
 * base), in the user's language. One part makes a plan of one step.
 */
export function suggestAssembly(parts: readonly PartBox[], label: (part: string, target: string | null) => string): AssemblyPlan | null {
  if (parts.length === 0) return null;
  const largest = Math.max(...parts.map(volume));
  const fastener = (box: PartBox) => box.standard === true || (parts.length > 2 && volume(box) < largest * FASTENER_SHARE);
  const main = parts.filter((box) => !fastener(box));
  const last = parts.filter(fastener);
  const pool = main.length > 0 ? [...main] : [...last];
  const tail = main.length > 0 ? last : [];

  // The base: the largest of the parts that stand lowest (a lid laid beside its housing stands as low).
  const lowest = Math.min(...pool.map((box) => box.min[2]));
  pool.sort((a, b) => Number(b.min[2] <= lowest + CONTACT) - Number(a.min[2] <= lowest + CONTACT) || volume(b) - volume(a) || footprint(b) - footprint(a));
  const placed: PartBox[] = [];
  const steps: AssemblyStep[] = [];
  const place = (box: PartBox) => {
    const target = placed.length === 0 ? null : placed.reduce((best, candidate) => (contact(box, candidate) > contact(box, best) ? candidate : best), placed[0] as PartBox);
    // A free part joins the nearest placed one.
    const nearest = target && contact(box, target) === 0 ? placed.reduce((best, candidate) => (distance(box, candidate) < distance(box, best) ? candidate : best), target) : target;
    steps.push({ name: label(box.name, nearest?.name ?? null), part: box.name, target: nearest?.name ?? null, direction: nearest ? joiningDirection(box, nearest) : [0, 0, -1], group: null });
    placed.push(box);
  };
  place(pool.shift() as PartBox);
  while (pool.length > 0) {
    const touching = pool.filter((box) => placed.some((other) => touches(box, other)));
    const candidates = touching.length > 0 ? touching : pool;
    candidates.sort((a, b) => {
      const aInside = placed.some((other) => inside(a, other)) ? 0 : 1;
      const bInside = placed.some((other) => inside(b, other)) ? 0 : 1;
      return aInside - bInside || a.min[2] - b.min[2] || volume(b) - volume(a);
    });
    const next = candidates[0] as PartBox;
    pool.splice(pool.indexOf(next), 1);
    place(next);
  }
  for (const box of [...tail].sort((a, b) => a.min[2] - b.min[2])) place(box);
  return { version: 1, source: 'suggested', groups: [], steps };
}

function distance(a: PartBox, b: PartBox): number {
  return Math.hypot(...([0, 1, 2] as const).map((axis) => Math.max(0, -overlapOn(a, b, axis))));
}
