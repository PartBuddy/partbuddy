import { partFamilySchema, type PartFamily, type PartsLibrary } from '../../shared/contract';

/**
 * Standard parts (plan step B7): screws, nuts, washers, pins and bearings from SolidCraft's library
 * (`parts.insert`), seated in a hole as counterparts. They are not printed: the mirror tells them by
 * what SolidCraft itself says of them (mirror.ts), and export and the ready-to-print light leave
 * them out.
 */

/** The metric families PartBuddy offers, in the order of the menu: the schema's, so menu and requests know the same (audit S-30, T48). */
export const PART_FAMILIES: readonly PartFamily[] = partFamilySchema.options;

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * The library as `parts.library` lists it, reduced to what the menu needs: per size the diameter
 * that goes into the hole (a screw's or pin's thread, a bearing's outside) and the default length.
 */
export function libraryOf(raw: unknown): PartsLibrary {
  const families = (raw as { families?: unknown } | null)?.families;
  if (!Array.isArray(families)) return [];
  const library: PartsLibrary = [];
  for (const id of PART_FAMILIES) {
    const entry = families.find((family) => (family as { family?: unknown }).family === id) as Record<string, unknown> | undefined;
    if (!entry || !Array.isArray(entry.sizes)) continue;
    const sizes = (entry.sizes as Record<string, unknown>[])
      .filter((size) => typeof size.size === 'string')
      .slice(0, 100)
      .map((size) => ({
        size: (size.size as string).slice(0, 40),
        diameter: id === 'bearing' ? num(size.outer) : num(size.d),
        defaultLength: num(size.default_length),
      }));
    const lengths = Array.isArray(entry.lengths) ? (entry.lengths as unknown[]).map(num).filter((value): value is number => value !== null).slice(0, 100) : null;
    library.push({ family: id, name: typeof entry.name === 'string' ? entry.name.slice(0, 200) : id, lengths: lengths && lengths.length > 0 ? lengths : null, sizes });
  }
  return library;
}

/** A part of the library, as `parts.insert` takes it; the length in mm, null for a part without one. */
export interface LibraryPart {
  family: string;
  size: string;
  length: number | null;
}

/**
 * The length `parts.insert` writes after the size, in mm: "x8" and "x7.5" are millimetres (an inch
 * part at a length off its list too), " x 3/4", " x 1-1/4" and " x 8" are inches. Undefined for
 * any other text.
 */
function lengthOf(text: string): number | null | undefined {
  if (text === '') return null;
  const metric = /^x(\d+(?:\.\d+)?)$/.exec(text);
  if (metric) return Number(metric[1]);
  const inch = /^ x (?:(\d+)|(?:(\d+)-)?(\d+)\/(\d+))$/.exec(text);
  if (!inch) return undefined;
  const inches = inch[1] !== undefined ? Number(inch[1]) : Number(inch[2] ?? 0) + Number(inch[3]) / Number(inch[4]);
  return Number.isFinite(inches) ? inches * 25.4 : undefined;
}

/**
 * The library part a component's description (`component.metadata`) names, as `parts.insert` wrote
 * it: the name of a family, one of its sizes and, where the part has one, its length ("Button head
 * cap screw M3x8", "Deep groove ball bearing (envelope) 608"). SolidCraft keeps it when the part or
 * its body is renamed. Names and sizes are those `parts.library` answers with now, so a family
 * SolidCraft adds is known without a change here, and a text that only begins like one ("Hex nut
 * holder") names no part. The description alone proves nothing: the mirror holds the body against it.
 */
export function libraryPartOf(description: unknown, library: unknown): LibraryPart | null {
  const families = (library as { families?: unknown } | null)?.families;
  if (typeof description !== 'string' || !Array.isArray(families)) return null;
  for (const family of families as ({ family?: unknown; name?: unknown; sizes?: unknown } | null)[]) {
    const name = family?.name;
    if (typeof family?.family !== 'string' || typeof name !== 'string' || name === '' || !Array.isArray(family.sizes) || !description.startsWith(`${name} `)) continue;
    const rest = description.slice(name.length + 1);
    for (const entry of family.sizes as ({ size?: unknown } | null)[]) {
      const size = entry?.size;
      if (typeof size !== 'string' || size === '' || !rest.startsWith(size)) continue;
      const length = lengthOf(rest.slice(size.length));
      if (length !== undefined) return { family: family.family, size, length };
    }
  }
  return null;
}

/** Whether a description is one `parts.insert` writes for a part of the library. */
export function isLibraryPart(description: unknown, library: unknown): boolean {
  return libraryPartOf(description, library) !== null;
}

/** A body name that is not taken yet: `SHCS M3x12`, `SHCS M3x12 (2)` … */
export function freeBodyName(wanted: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  const base = wanted.trim().slice(0, 180) || 'Part';
  if (!names.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!names.has(`${base} (${String(n)})`)) return `${base} (${String(n)})`;
  return `${base} ${String(Date.now())}`;
}
