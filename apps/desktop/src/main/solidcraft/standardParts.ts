import type { PartFamily, PartsLibrary } from '../../shared/contract';

/**
 * Standard parts (plan step B7): screws, nuts, washers, pins and bearings from SolidCraft's library
 * (`parts.insert`), seated in a hole as counterparts. They are not printed: PartBuddy keeps their
 * body names in the design's metadata, and export and the ready-to-print light leave them out.
 */
export const STANDARD_PARTS_KEY = 'io.github.manuelstaggl.partbuddy.standard-parts';

/** The metric families PartBuddy offers, in the order of the menu. */
export const PART_FAMILIES: PartFamily[] = ['socket_head_cap_screw', 'button_head_cap_screw', 'hex_bolt', 'set_screw', 'hex_nut', 'washer', 'dowel_pin', 'bearing'];

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

/** The body names of standard parts kept in the design's metadata. */
export function standardPartsOf(metadata: unknown): string[] {
  const entry = (metadata as Record<string, unknown> | null)?.[STANDARD_PARTS_KEY] as { bodies?: unknown } | undefined;
  return Array.isArray(entry?.bodies) ? entry.bodies.filter((name): name is string => typeof name === 'string' && name.length <= 200).slice(0, 500) : [];
}

/** What `parts.insert` writes after the size of a part that has a length: "x8", "x7.5", " x 3/4". */
const LENGTH = /^ ?x ?\d[\d ./-]*$/;

/**
 * Whether a component's description (`component.metadata`) is one `parts.insert` gave it: the name
 * of a family, one of its sizes and, where the part has one, its length ("Button head cap screw
 * M3x8", "Deep groove ball bearing (envelope) 608"). SolidCraft keeps it when the part or its body
 * is renamed. Names and sizes are those `parts.library` answers with now, so a family SolidCraft
 * adds is known without a change here, and a text that only begins like one ("Hex nut holder") is
 * no part.
 */
export function isLibraryPart(description: unknown, library: unknown): boolean {
  const families = (library as { families?: unknown } | null)?.families;
  if (typeof description !== 'string' || !Array.isArray(families)) return false;
  return (families as ({ name?: unknown; sizes?: unknown } | null)[]).some((family) => {
    const name = family?.name;
    if (typeof name !== 'string' || name === '' || !Array.isArray(family?.sizes) || !description.startsWith(`${name} `)) return false;
    const rest = description.slice(name.length + 1);
    return (family.sizes as ({ size?: unknown } | null)[]).some((entry) => {
      const size = entry?.size;
      return typeof size === 'string' && size !== '' && rest.startsWith(size) && (rest.length === size.length || LENGTH.test(rest.slice(size.length)));
    });
  });
}

/** A body name that is not taken yet: `SHCS M3x12`, `SHCS M3x12 (2)` … */
export function freeBodyName(wanted: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  const base = wanted.trim().slice(0, 180) || 'Part';
  if (!names.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!names.has(`${base} (${String(n)})`)) return `${base} (${String(n)})`;
  return `${base} ${String(Date.now())}`;
}
