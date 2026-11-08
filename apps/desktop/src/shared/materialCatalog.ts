import type { MaterialProfile } from './contract';

/**
 * Material types for »Add material« in the settings: starting values for the overhang without
 * support, the hole allowance on the diameter and the clearance per side of the four fits. Taken from
 * design guides of makers and print services and from filament data sheets, not from slicer
 * profiles; where no source states a value it is derived from the base type, and the note says so.
 * They are a start, not measured on the user's printer; a pick is copied into an ordinary profile.
 */
export interface CatalogMaterial extends Omit<MaterialProfile, 'id'> {
  /** The page the values come from. */
  source: string;
  /** When the values were last checked against it, YYYY-MM-DD. */
  checked: string;
  /** One sentence on where the numbers come from or how they were derived. */
  note: string;
}

/**
 * Hole allowance = 0.10 mm from printing (an M6 hole prints 5.9 mm, Bambu Lab wiki) plus the
 * shrinkage on a 10 mm hole; shrinkage is the middle of the injection moulding range where no print
 * value exists. Fits: turn from Prusa's 0.3 mm for moving parts, slide from Xometry's 0.2-0.3 mm,
 * clamp and push from PartBuddy's earlier start; warping types 0.05 mm wider, fibre types like
 * their base. Prusa allows 45-60° of overhang, the print services 45°; the catalog keeps 45°.
 */
export const MATERIAL_CATALOG: readonly CatalogMaterial[] = [
  { name: 'PLA', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 }, source: 'https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/', checked: '2026-11-08', note: 'Overhang 45° as in the Hubs guide; hole: 0.10 mm from printing plus PLA mould shrinkage 0.3-0.5 % on 10 mm; fits from Prusa (0.3) and Xometry (0.2-0.3).' },
  { name: 'PLA Matte', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 }, source: 'https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/', checked: '2026-11-08', note: 'Derived: no source for the matte type, so the values of PLA.' },
  { name: 'PLA Silk', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 }, source: 'https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/', checked: '2026-11-08', note: 'Derived: no source for the silk type, so the values of PLA.' },
  { name: 'PLA-CF', overhang: 45, holeShrink: 0.1, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 }, source: 'https://wiki.bambulab.com/en/knowledge-sharing/3d-prints-shrinkage', checked: '2026-11-08', note: 'Derived: fibres limit the shrinkage of the base polymer (Bambu Lab), so PLA without its shrinkage share.' },
  { name: 'PETG', overhang: 40, holeShrink: 0.15, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://help.prusa3d.com/article/petg_2059', checked: '2026-11-08', note: 'Derived: Prusa names poor overhangs and no shrinking, so 40° and 0.10 mm plus 0.5 % mould shrinkage on 10 mm.' },
  { name: 'PETG-CF', overhang: 40, holeShrink: 0.1, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://cdn.shopify.com/s/files/1/0765/4369/files/Raise3D-Industrial-PET-CF_TDS_V2.pdf', checked: '2026-11-08', note: 'Derived: the PET-CF data sheet states no significant XY shrinkage, so PETG without its shrinkage share.' },
  { name: 'PET-CF', overhang: 40, holeShrink: 0.1, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://cdn.shopify.com/s/files/1/0765/4369/files/Raise3D-Industrial-PET-CF_TDS_V2.pdf', checked: '2026-11-08', note: 'Hole from the data sheet (no significant XY shrinkage); overhang and fits as PETG.' },
  { name: 'ABS', overhang: 45, holeShrink: 0.25, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://help.prusa3d.com/article/abs_2058', checked: '2026-11-08', note: 'Prusa states 1-2 % shrinkage: hole 0.10 mm plus 1.5 % on 10 mm; fits 0.05 mm wider than PLA for warping.' },
  { name: 'ABS-GF', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://help.prusa3d.com/article/composite-materials-filled-with-carbon-kevlar-or-glass_167387', checked: '2026-11-08', note: 'Derived: glass fibres keep the size more stable (Prusa); 20 % GF mould shrinkage 0.2-0.3 %.' },
  { name: 'ASA', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://www.specialchem.com/plastics/guide/shrinkage', checked: '2026-11-08', note: 'Derived: ASA mould shrinkage 0.4-0.7 % and less warping than ABS; fits as ABS.' },
  { name: 'TPU 95A', overhang: 35, holeShrink: 0.1, clearance: { clamp: 0, push: 0.1, slide: 0.3, turn: 0.4 }, source: 'https://help.prusa3d.com/article/flexible-materials_2057', checked: '2026-11-08', note: 'Derived: Prusa names very bad overhangs and little to no shrinking; fits keep the earlier PartBuddy start.' },
  { name: 'PA (Nylon)', overhang: 45, holeShrink: 0.2, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://www.specialchem.com/plastics/guide/shrinkage', checked: '2026-11-08', note: 'Derived: PA6 mould shrinkage 0.5-1.5 % gives the hole; fits as ABS for warping.' },
  { name: 'PA-CF', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://help.prusa3d.com/article/polyamide-nylon_167188', checked: '2026-11-08', note: 'Derived: carbon-filled PA warps much less (Prusa); PA66 30 % CF mould shrinkage 0.3 %.' },
  { name: 'PA12-CF', overhang: 45, holeShrink: 0.1, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://cdn.shopify.com/s/files/1/0380/5149/files/Raise3D-Industrial-PA12-CF_TDS_V2.pdf', checked: '2026-11-08', note: 'Derived: the data sheet states no significant XY shrinkage, so only the 0.10 mm from printing.' },
  { name: 'PC', overhang: 45, holeShrink: 0.2, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://help.prusa3d.com/article/polycarbonate-pc_165812', checked: '2026-11-08', note: 'Derived: high warping (Prusa) and 0.7-1.0 % mould shrinkage of high-heat PC give the hole.' },
  { name: 'HIPS', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 }, source: 'https://help.prusa3d.com/article/hips_167118', checked: '2026-11-08', note: 'Derived: Prusa says HIPS shrinks much less than ABS; mould shrinkage 0.2-0.8 %, fits as PLA.' },
  { name: 'PP', overhang: 45, holeShrink: 0.3, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, source: 'https://www.specialchem.com/plastics/guide/shrinkage', checked: '2026-11-08', note: 'Derived: PP mould shrinkage 1.0-3.0 % and high warping give the largest hole allowance.' },
];
