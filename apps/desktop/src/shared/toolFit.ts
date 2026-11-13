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

export type ToolMaterial = Pick<MaterialProfile, 'holeShrink' | 'clearance'> & { measuredNozzle?: number | undefined };

/** The printer in use with the part's material; a tool given none reckons with {@link DEFAULT_MATERIAL}. */
export interface ToolPrinter extends FitPrinter {
  material?: ToolMaterial | undefined;
}

const pla = MATERIAL_CATALOG.find((entry) => entry.name === 'PLA');
if (!pla) throw new Error('PLA is not in the material catalog');
/** The catalogue's PLA, the material of the default print profile (printProfiles.ts). */
export const DEFAULT_MATERIAL: ToolMaterial = { holeShrink: pla.holeShrink, clearance: { ...pla.clearance } };

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
