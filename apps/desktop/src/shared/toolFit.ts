/**
 * The part's material in PartBuddy's blocks and mechanisms (audit BC-16: W16, S-10, T10, MV-17). A size a tool states for
 * a hole, a pocket or a seat is the size the print comes out at: the tool draws it wider by the material's hole allowance
 * (`holeAllowance`, holePlate.ts). The room a fit leaves is the material profile's clearance of its kind (per side),
 * scaled to the nozzle as the design rules scale it (`scaleClearance`, designFit.ts).
 */
import type { FitKind, MaterialProfile } from './contract';
import { CLEARANCE_NOZZLE, scaleClearance, type FitPrinter } from './designFit';
import { holeAllowance } from './holePlate';
import { MATERIAL_CATALOG } from './materialCatalog';

export type ToolMaterial = Pick<MaterialProfile, 'holeShrink' | 'clearance'> & { measuredNozzle?: number | undefined; fitsAfterPrint?: true | undefined; overhang?: number | undefined };

/** The printer in use with the part's material; a tool given none reckons with {@link DEFAULT_MATERIAL}. */
export interface ToolPrinter extends FitPrinter {
  material?: ToolMaterial | undefined;
}

const pla = MATERIAL_CATALOG.find((entry) => entry.name === 'PLA');
if (!pla) throw new Error('PLA is not in the material catalog');
/** The catalogue's PLA, the material of the default print profile (printProfiles.ts). */
export const DEFAULT_MATERIAL: ToolMaterial = { holeShrink: pla.holeShrink, clearance: { ...pla.clearance }, overhang: pla.overhang };
/** How far PLA leans without support, degrees: the overhang a tool reckons with when it is given no material. */
export const DEFAULT_OVERHANG = pla.overhang;
/** The printer a tool reckons with when it is given none: the 0.4 mm nozzle the clearances stand for, 0.2 mm layers, PLA. */
export const DEFAULT_PRINTER: ToolPrinter = { nozzle: CLEARANCE_NOZZLE, layer: 0.2 };

/**
 * Where a profile's fits come from: read off the comb drilled with the hole allowance (`fitsAfterPrint`), read off the older comb
 * without it (`measuredNozzle` alone: the shrink is in them, and the tools add it again), or not read with this version's
 * pieces at all (catalogue values, or fits read before the nozzle was kept).
 */
export const fitsSource = (material: ToolMaterial | undefined): 'read' | 'olderComb' | 'unread' =>
  material?.fitsAfterPrint ? 'read' : material?.measuredNozzle !== undefined ? 'olderComb' : 'unread';

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The room per side a fit of this kind leaves on the printer, in mm (clamp, push, slide, turn). */
export const fitClearance = (kind: FitKind, printer: ToolPrinter) => {
  const material = printer.material ?? DEFAULT_MATERIAL;
  return scaleClearance(material.clearance[kind], printer, material.measuredNozzle ?? CLEARANCE_NOZZLE);
};

/** How much wider than it comes out a hole of `diameter` mm is drawn, on the diameter. */
export const holeRoom = (diameter: number, material: ToolMaterial = DEFAULT_MATERIAL) => holeAllowance(material.holeShrink, diameter);

/** A hole that shall come out `diameter` mm wide, as drawn. */
export const drawnHole = (diameter: number, material?: ToolMaterial) => round(diameter + holeRoom(diameter, material));

/** What an answer adds to a fit taken from the profile (BC-16 review): nothing for fits read off this version's comb. */
export function unmeasuredSaid(printer: ToolPrinter): string {
  const source = fitsSource(printer.material);
  if (source === 'read') return '';
  if (source === 'olderComb')
    return " The profile's fits were read off the older fit comb, drilled without the hole allowance, so the allowance is counted twice here: read the fits again with the tolerance pieces (Settings › Print profiles) and build it again.";
  return " The fit is the profile's, not read off this version's tolerance pieces: if it binds or rattles, read them (Settings › Print profiles) and build it again.";
}

/**
 * A default fit from the profile kept within what a block takes, said when it was held (BC-16 review S2): the profile's value,
 * the range and what was used; empty when the value was taken as it is.
 */
export const heldSaid = (what: string, fit: string, value: number, used: number, range: string) =>
  Math.abs(value - used) < 1e-9 ? '' : ` The profile's ${fit} fit makes it ${String(round(value))} mm, outside what ${what} takes (${range}); ${String(round(used))} mm used.`;
