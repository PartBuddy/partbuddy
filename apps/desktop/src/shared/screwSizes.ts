/**
 * Sizes of screws, nuts and heat-set inserts from the standard tables, and the room a printed part
 * leaves around them. On their own, without the function blocks' other needs, so the mechanisms and
 * the templates can use them too. Every hole the function blocks and the screw joint drill takes its
 * size from here, not from SolidCraft's own tables (audit R7, W21).
 */

import { MATERIAL_CATALOG } from './materialCatalog';

export const BLOCK_SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10'] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

/** Socket head cap screws, ISO 4762: head diameter and height in mm. */
export const CAP_HEAD: Record<BlockSize, [number, number]> = {
  M2: [3.8, 2],
  'M2.5': [4.5, 2.5],
  M3: [5.5, 3],
  M4: [7, 4],
  M5: [8.5, 5],
  M6: [10, 6],
  M8: [13, 8],
  M10: [16, 10],
};

/**
 * Countersunk socket screws, ISO 10642: theoretical head diameter in mm, 90° (Westfield). From M3, as DIN 7991, the
 * table of the screws sold, starts (fasteners.eu); ISO 10642 also lists M2 (4.70) and M2.5 (5.88), which only one source
 * gave, so they are not offered (audit MV-25).
 */
export const COUNTERSUNK_HEAD: Partial<Record<BlockSize, number>> = { M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44, M8: 17.92, M10: 22.4 };

/**
 * Heat-set threaded inserts: hole diameter, insert length and the least wall round the hole in mm
 * (ruthex RX series, data sheet of 2022-08-15: d3, L and W min; M2.5 and M3 share one body). The
 * seat is one millimetre deeper than the insert for the displaced plastic.
 */
export const INSERT: Partial<Record<BlockSize, { diameter: number; length: number; wall: number }>> = {
  M2: { diameter: 3.2, length: 4, wall: 1.3 },
  'M2.5': { diameter: 4, length: 5.7, wall: 1.6 },
  M3: { diameter: 4, length: 5.7, wall: 1.6 },
  M4: { diameter: 5.6, length: 8.1, wall: 2.1 },
  M5: { diameter: 6.4, length: 9.5, wall: 2.6 },
  M6: { diameter: 8, length: 12.7, wall: 3.3 },
};

/** Hex nuts, ISO 4032: width across flats and height in mm. */
export const NUT: Record<BlockSize, [number, number]> = {
  M2: [4, 1.6],
  'M2.5': [5, 2],
  M3: [5.5, 2.4],
  M4: [7, 3.2],
  M5: [8, 4.7],
  M6: [10, 5.2],
  M8: [13, 6.8],
  M10: [16, 8.4],
};

/**
 * Where nuts of the older DIN tables, still sold beside ISO 4032, are wider across their flats: at M10 the old DIN 934 hex
 * nut and the DIN 562 square nut are 17 mm (fasteners.eu, DIN 562), and do not go into the ISO pocket (audit MV-09).
 */
export const NUT_DIN_FLATS: Partial<Record<BlockSize, number>> = { M10: 17 };

/** Extra room around a printed nut: across flats and depth. */
export const NUT_ALLOWANCE = { flats: 0.3, depth: 0.4 };

/**
 * Extra room around a printed screw head, in mm (audit T39, MV-20): `diameter` on each side of a cap screw's counterbore
 * (so twice on its diameter), and once on the diameter of a countersink's 90° cone, which lets the head sink 0.3 mm
 * deeper than flush; `depth` under a counterbore's floor. Holes print smaller than drawn.
 * Use {@link headRoom}.
 * shortcut: the screw joint (mechanisms.ts, track L2) still adds these itself and cuts its tapped thread at ISO size; switch it
 * to headRoom and printedThread when BC-10/BC-15 touch it.
 */
export const HEAD_ALLOWANCE = { diameter: 0.6, depth: 0.4 };

/**
 * The room a screw head sinks into, in mm: a counterbore for a cap screw (ISO 4762), a 90° countersink for a countersunk
 * one (ISO 10642). The counterbore is 0.6 mm wider than the head on each side: after the largest hole shrink of the
 * material catalogue that still leaves 0.3 mm round a knurled head (ISO 4762 dk max, knurled: up to 0.27 mm over the
 * smooth one). DIN 974-1, row 1, is a size for drilled counterbores and would leave a printed M2 0.12 mm on the diameter.
 * A countersink's depth is that of its cone down to the hole under it.
 */
export function headRoom(size: BlockSize, head: 'cap' | 'countersunk', hole: number = CLEARANCE_NORMAL[size]): { diameter: number; depth: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  if (head === 'cap') return { diameter: round(CAP_HEAD[size][0] + 2 * HEAD_ALLOWANCE.diameter), depth: round(CAP_HEAD[size][1] + HEAD_ALLOWANCE.depth) };
  const diameter = round((COUNTERSUNK_HEAD[size] ?? CAP_HEAD[size][0]) + HEAD_ALLOWANCE.diameter);
  return { diameter, depth: round((diameter - hole) / 2) };
}

export const FITS = ['close', 'normal', 'loose'] as const;
export type Fit = (typeof FITS)[number];

/** Clearance holes, ISO 273 (DIN EN 20273) fine, medium and coarse series, in mm (Wikipedia „Durchgangsbohrung“, Ifanger). */
export const CLEARANCE: Record<Fit, Record<BlockSize, number>> = {
  close: { M2: 2.2, 'M2.5': 2.7, M3: 3.2, M4: 4.3, M5: 5.3, M6: 6.4, M8: 8.4, M10: 10.5 },
  normal: { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11 },
  loose: { M2: 2.6, 'M2.5': 3.1, M3: 3.6, M4: 4.8, M5: 5.8, M6: 7, M8: 10, M10: 12 },
};

/** Normal clearance holes, ISO 273 medium series, in mm. */
export const CLEARANCE_NORMAL: Record<BlockSize, number> = CLEARANCE.normal;

/**
 * In mm on the diameter: the most a printed hole comes out smaller than drawn, the largest hole allowance of the material
 * catalogue (PP). A clearance hole must leave more than this over its screw, or the screw may not pass (audit T31).
 * shortcut: the block does not know the material (BC-16 brings the profile); take the profile's allowance then.
 */
export const HOLE_SHRINK_MOST = Math.max(...MATERIAL_CATALOG.map((material) => material.holeShrink));

/** The screw's own diameter, M3 → 3. */
export const screwDiameter = (size: BlockSize) => Number(size.slice(1));

/** Whether a printed clearance hole of the fit still lets the screw pass after the largest hole shrink: ISO 273 fine leaves 0.2 to 0.3 mm up to M5. */
export const clearancePasses = (size: BlockSize, fit: Fit) => CLEARANCE[fit][size] - screwDiameter(size) > HOLE_SHRINK_MOST + 1e-9;

/** Tap drills of the coarse threads, ISO 2306 (Optimas), in mm: what SolidCraft drills a listed thread with. */
export const TAP_DRILL: Record<BlockSize, number> = { M2: 1.6, 'M2.5': 2.05, M3: 2.5, M4: 3.3, M5: 4.2, M6: 5, M8: 6.8, M10: 8.5 };

/** Coarse thread pitch, ISO 261, in mm. */
export const THREAD_PITCH: Record<BlockSize, number> = { M2: 0.4, 'M2.5': 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1, M8: 1.25, M10: 1.5 };

/**
 * In mm on the diameter: the room a printed internal thread gets, 0.15 mm per side, the middle of the 0.10 to 0.20 mm that
 * Sovol and SelfCAD name for printed threads (audit S-09, N-bloecke-9). Not printed here yet.
 */
export const THREAD_ALLOWANCE = 0.3;

/**
 * A printed internal thread as SolidCraft's custom metric size: the ISO profile and pitch, every diameter
 * {@link THREAD_ALLOWANCE} larger, drilled at major minus pitch as SolidCraft drills a custom size (M5 → "M5.3x0.8", 4.5 mm).
 */
export function printedThread(size: BlockSize): { designation: string; major: number; drill: number } {
  const major = Math.round((screwDiameter(size) + THREAD_ALLOWANCE) * 100) / 100;
  return { designation: `M${String(major)}x${String(THREAD_PITCH[size])}`, major, drill: Math.round((major - THREAD_PITCH[size]) * 100) / 100 };
}

/** A pilot hole for a screw cut into plastic is this many times its diameter (Machine Design); standards.ts says the same. */
export const PILOT_FACTOR = 0.8;

/**
 * The pilot hole a screw cuts its own thread in, in mm: 0.8 times its diameter (Machine Design), plus the hole allowance
 * of PLA, the material of the default print profile, as standards.ts tells the assistant to add the profile's (audit MV-26).
 * shortcut: PLA's allowance, as the block does not know the material; take the profile's once BC-16 brings it.
 */
export const pilotHole = (diameter: number) => Math.round((PILOT_FACTOR * diameter + (MATERIAL_CATALOG.find((material) => material.name === 'PLA')?.holeShrink ?? 0.15)) * 100) / 100;
