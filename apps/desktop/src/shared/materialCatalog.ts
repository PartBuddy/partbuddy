import type { MaterialProfile } from './contract';
import { LARGEST_HOLE, PRINT_UNDERSIZE, toStep } from './holePlate';

/**
 * Material types for »Add material« in the settings: starting values for the overhang without
 * support, the hole allowance on the diameter and the clearance per side of the four fits. Taken from
 * design guides of makers and print services and from filament data sheets, not from slicer
 * profiles; where no source states a value it is derived from the base type or PartBuddy's own
 * choice, and the note says so. They are a start, not measured on the user's printer; a pick is
 * copied into an ordinary profile.
 */
export interface CatalogMaterial extends Omit<MaterialProfile, 'id'> {
  /** Linear shrinkage on cooling in per cent that the hole allowance is made of (see `hole`). */
  shrink: number;
  /** The page the values come from. */
  source: string;
  /** When the values were last checked against it, YYYY-MM-DD. */
  checked: string;
  /** One sentence on where the numbers come from or how they were derived. */
  note: string;
}

/**
 * Hole allowance = PRINT_UNDERSIZE plus the shrinkage on LARGEST_HOLE, the largest hole of the hole plate, on 0.05 mm (audit T23, T55).
 * Shrinkage is Prusa's print value where it gives one (ABS 1-2 %), otherwise the middle of the range of SpecialChem's
 * moulding table (read 2026-11-13; Filament2Print quotes the same table, so it is no second source). Moulding values are
 * not measured on prints, and the middle is PartBuddy's choice: the audit's yardstick names the upper ends (PETG 1.0 %,
 * ABS 2 %, PA12 2 %), but a larger allowance is not the safe side for fits, since the clearance is added to it (BC-20
 * review S2). Fibre types without a number of their own keep their base's value, never more: fibres lower the shrinkage
 * (Bambu Lab, Prusa), by how much no source says. Above the hole plate's sizes `holeAllowance` lets the shrinkage grow
 * with the diameter (audit MG-26).
 */
const hole = (shrink: number) => toStep(PRINT_UNDERSIZE + (shrink / 100) * LARGEST_HOLE);

/**
 * Fits: turn from Prusa's 0.3 mm for moving parts, slide from Xometry's 0.2-0.3 mm; clamp and push are PartBuddy's own
 * start. Types that warp (ABS, ASA, PA, PC, PP) and PETG, which strings and sticks, 0.05 mm wider: own choice, no source
 * gives fits per material (audit MG-30, T55). Overhang: Prusa allows 45-60°, the print services 45°; the catalog keeps 45°.
 * No source gives a degree per material, so 40° for PETG and 35° for TPU, which Prusa calls poor and very bad at
 * overhangs, are own choices (audit MG-30).
 */
const PLA_FITS = { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 };
const WIDE_FITS = { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 };
const SPECIALCHEM = 'https://www.specialchem.com/plastics/guide/shrinkage';
const HUBS = 'https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/';
const CHECKED = '2026-11-13';

const entry = (name: string, overhang: number, shrink: number, clearance: MaterialProfile['clearance'], source: string, note: string): CatalogMaterial => ({
  name,
  overhang,
  holeShrink: hole(shrink),
  shrink,
  clearance: { ...clearance },
  source,
  checked: CHECKED,
  note,
});

export const MATERIAL_CATALOG: readonly CatalogMaterial[] = [
  entry('PLA', 45, 0.4, PLA_FITS, HUBS, 'Overhang 45° as in the Hubs guide; shrinkage 0.3-0.5 % (SpecialChem, PLA injection moulding); fits from Prusa (0.3) and Xometry (0.2-0.3).'),
  entry('PLA Matte', 45, 0.4, PLA_FITS, HUBS, 'Derived: no source for the matte type, so the values of PLA.'),
  entry('PLA Silk', 45, 0.4, PLA_FITS, HUBS, 'Derived: no source for the silk type, so the values of PLA.'),
  entry('PLA-CF', 45, 0.4, PLA_FITS, 'https://wiki.bambulab.com/en/knowledge-sharing/3d-prints-shrinkage', 'Derived: fibres limit the shrinkage of the base polymer (Bambu Lab), by how much no source says, so the values of PLA.'),
  entry('PETG', 40, 0.6, WIDE_FITS, 'https://help.prusa3d.com/article/petg_2059', 'Shrinkage 0.2-1.0 % (SpecialChem, the middle); Prusa: "does not shrink or warp", no number. Prusa calls its overhangs poor, 40° own choice.'),
  entry('PETG-CF', 40, 0.6, WIDE_FITS, 'https://wiki.bambulab.com/en/knowledge-sharing/3d-prints-shrinkage', 'Derived: fibres limit the shrinkage (Bambu Lab), by how much no source says, so the values of PETG.'),
  // The Raise3D PET-CF data sheet's "no significant dimensional shrinkage along the XY-axes" is after annealing, not on cooling.
  entry('PET-CF', 40, 0.6, WIDE_FITS, SPECIALCHEM, 'Shrinkage of PET with 30 % glass fibre 0.2-1.0 % (SpecialChem; none for carbon fibre); overhang and fits as PETG.'),
  entry('ABS', 45, 1.5, WIDE_FITS, 'https://help.prusa3d.com/article/abs_2058', 'Shrinkage 1-2 % on prints (Prusa, the middle; SpecialChem\'s moulding range is 0.7-1.6 %); fits wider for warping.'),
  entry('ABS-GF', 45, 0.25, WIDE_FITS, 'https://help.prusa3d.com/article/composite-materials-filled-with-carbon-kevlar-or-glass_167387', 'No number for ABS-GF: the nearest is ABS/PC with 20 % glass fibre, 0.2-0.3 % (SpecialChem, the middle); glass fibres keep the size stable (Prusa).'),
  entry('ASA', 45, 0.55, WIDE_FITS, 'https://help.prusa3d.com/article/asa_1809', 'Shrinkage 0.4-0.7 % (SpecialChem); Prusa: ASA warps less than ABS, but its main disadvantage is still significant warping, so fits as ABS.'),
  entry('TPU 95A', 35, 0, { clamp: 0, push: 0.1, slide: 0.3, turn: 0.4 }, 'https://help.prusa3d.com/article/flexible-materials_2057', 'Prusa: little to no shrinking and very bad overhangs, no numbers; shrinkage 0, overhang 35° and fits are own choices.'),
  entry('PA (Nylon)', 45, 1.25, WIDE_FITS, SPECIALCHEM, 'Nylon filaments are PA6, PA12 or blends: PA6 0.5-1.5 % and PA12 0.7-2.0 % (SpecialChem), the middle of 0.5-2.0 %; warping is its main disadvantage (Prusa).'),
  entry('PA-CF', 45, 0.75, WIDE_FITS, 'https://filament2print.com/en/blog/contrazioni-warping-stampa-3d', 'Fibre-reinforced nylon 0.5-1.0 % (SpecialChem\'s table as Filament2Print quotes it, the middle); carbon-filled PA warps much less (Prusa).'),
  // The Raise3D PA12-CF data sheet's "no significant dimensional shrinkage in XY-axis" is after annealing, not on cooling.
  entry('PA12-CF', 45, 0.75, WIDE_FITS, 'https://filament2print.com/en/blog/contrazioni-warping-stampa-3d', 'As PA-CF: fibre-reinforced nylon 0.5-1.0 %, the middle. SpecialChem lists fibre-reinforced PA12 at 0.7-2.0 %, the range of plain PA12.'),
  entry('PC', 45, 0.85, WIDE_FITS, 'https://help.prusa3d.com/article/polycarbonate-pc_165812', 'Shrinkage of high-heat PC 0.7-1.0 % (SpecialChem, none for plain PC); high warping (Prusa), fits as ABS.'),
  entry('HIPS', 45, 0.5, PLA_FITS, 'https://help.prusa3d.com/article/hips_167118', 'Shrinkage 0.2-0.8 % (SpecialChem); Prusa says HIPS shrinks much less than ABS; fits as PLA.'),
  entry('PP', 45, 2, WIDE_FITS, SPECIALCHEM, 'Shrinkage of PP 1.0-3.0 % (SpecialChem, homopolymer; copolymer 2.0-3.0 %), the middle; high warping, the largest allowance.'),
];
