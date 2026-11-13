import type { VersionComparison } from '../../shared/contract';

/** At most this many differing regions per body; the rest are counted in the total volume only. */
const MAX_REGIONS = 20;
/**
 * A body whose volume stays within this share and whose centre and box both move by the same vector, longer than
 * MOVED_MM, was moved. A hole moved inside the body moves the centre but not the box (5 mm moved the centre of a
 * 40 × 20 plate 0.18 mm, SolidCraft 0.40.1): that body changed (audit D31).
 */
const SAME_VOLUME_PERCENT = 0.01;
const MOVED_MM = 0.05;
/** How far the moves of centre and box corners may differ and still be one move: SolidCraft's tolerance of `inspect.compare`. */
const SAME_MOVE_MM = 0.01;

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function point(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value.map(num);
  return x === null || x === undefined || y === null || y === undefined || z === null || z === undefined ? null : [x, y, z];
}

interface RawCompare {
  identical?: unknown;
  a?: { volume_mm3?: unknown };
  b?: { volume_mm3?: unknown };
  difference?: { volume_percent?: unknown; center_of_mass_distance_mm?: unknown; center_of_mass?: unknown; bbox_min?: unknown; bbox_max?: unknown };
  only_in_a?: { volume_mm3?: unknown };
  only_in_b?: { volume_mm3?: unknown };
  regions?: unknown;
}

/**
 * What changed between a version and the open design (B5), from SolidCraft's `inspect.compare`
 * per pair of bodies (a: the version, b: now). Material only in the version was removed since,
 * material only now was added; a body that keeps its volume and moved as a whole, its box with its centre, was moved.
 */
export function summarizeComparison(raw: { pairs: { body: string; result: unknown }[]; onlyInVersion: string[]; onlyNow: string[] }): VersionComparison {
  const bodies: VersionComparison['bodies'] = [];
  for (const { body, result } of raw.pairs) {
    const compare = (typeof result === 'object' && result !== null ? result : {}) as RawCompare;
    const removed = num(compare.only_in_a?.volume_mm3) ?? 0;
    const added = num(compare.only_in_b?.volume_mm3) ?? 0;
    const moved = num(compare.difference?.center_of_mass_distance_mm) ?? 0;
    const percent = Math.abs(num(compare.difference?.volume_percent) ?? 0);
    const regions = (Array.isArray(compare.regions) ? (compare.regions as Record<string, unknown>[]) : [])
      .filter((region) => region.side === 'only_in_a' || region.side === 'only_in_b')
      .slice(0, MAX_REGIONS)
      .map((region) => ({ side: region.side === 'only_in_a' ? ('removed' as const) : ('added' as const), volume: num(region.volume_mm3), center: point(region.center) }));
    const shift = point(compare.difference?.center_of_mass);
    const whole = shift !== null && [point(compare.difference?.bbox_min), point(compare.difference?.bbox_max)].every((corner) => corner !== null && corner.every((value, i) => Math.abs(value - (shift[i] ?? 0)) <= SAME_MOVE_MM));
    const status = compare.identical === true ? 'same' : percent < SAME_VOLUME_PERCENT && moved > MOVED_MM && whole ? 'moved' : 'changed';
    bodies.push({
      body: body.slice(0, 200),
      status,
      volumeBefore: num(compare.a?.volume_mm3),
      volumeAfter: num(compare.b?.volume_mm3),
      addedMm3: added,
      removedMm3: removed,
      movedMm: status === 'moved' ? moved : 0,
      regions: status === 'changed' ? regions : [],
    });
  }
  const without = { volumeBefore: null, volumeAfter: null, addedMm3: 0, removedMm3: 0, movedMm: 0, regions: [] };
  for (const name of raw.onlyInVersion) bodies.push({ body: name.replace(/ \(\d+\)$/, '').slice(0, 200), status: 'removed', ...without });
  for (const name of raw.onlyNow) bodies.push({ body: name.slice(0, 200), status: 'added', ...without });
  return { bodies: bodies.slice(0, 500) };
}
