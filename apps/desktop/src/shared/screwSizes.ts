/**
 * Sizes of screws, nuts and heat-set inserts from the standard tables, and the room a printed part
 * leaves around them. On their own, without the function blocks' other needs, so the mechanisms and
 * the templates can use them too.
 */

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

/** Countersunk screws, ISO 10642 (from M3): theoretical head diameter in mm, 90°. */
export const COUNTERSUNK_HEAD: Partial<Record<BlockSize, number>> = { M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44, M8: 17.92, M10: 22.4 };

/**
 * Heat-set threaded inserts: typical hole diameter and insert length in mm (values of the common
 * ruthex inserts). The seat is one millimetre deeper than the insert for the displaced plastic.
 */
export const INSERT: Partial<Record<BlockSize, { diameter: number; length: number }>> = {
  M2: { diameter: 3.2, length: 4 },
  'M2.5': { diameter: 3.6, length: 5.7 },
  M3: { diameter: 4, length: 5.7 },
  M4: { diameter: 5.6, length: 8.1 },
  M5: { diameter: 6.4, length: 9.5 },
  M6: { diameter: 8, length: 12.7 },
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

/** Extra room around a printed nut: across flats and depth. */
export const NUT_ALLOWANCE = { flats: 0.3, depth: 0.4 };

/** Extra room around a printed screw head: holes print smaller than drawn. */
export const HEAD_ALLOWANCE = { diameter: 0.6, depth: 0.4 };

/** Normal clearance holes, ISO 273 medium series, in mm. */
export const CLEARANCE_NORMAL: Record<BlockSize, number> = { M2: 2.4, 'M2.5': 2.9, M3: 3.4, M4: 4.5, M5: 5.5, M6: 6.6, M8: 9, M10: 11 };
