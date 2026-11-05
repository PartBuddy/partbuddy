/**
 * Function blocks (plan step F1, first part): holes and seats for screws, built at a picked flat
 * face with SolidCraft's own commands (`solid.hole`, `plastic.boss`). Sizes and allowances come
 * from standard tables; everything stays editable because printers and inserts differ.
 */

export const BLOCK_SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10'] as const;
export type BlockSize = (typeof BLOCK_SIZES)[number];

/** Socket head cap screws, ISO 4762: head diameter and height in mm. */
const CAP_HEAD: Record<BlockSize, [number, number]> = {
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
const COUNTERSUNK_HEAD: Partial<Record<BlockSize, number>> = { M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44, M8: 17.92, M10: 22.4 };

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

/** Extra room around a printed screw head: holes print smaller than drawn. */
export const HEAD_ALLOWANCE = { diameter: 0.6, depth: 0.4 };

export type FeatureBlock =
  | { block: 'tappedHole'; body: string; point: [number, number, number]; size: BlockSize; depth: number | null; modeled: boolean }
  | { block: 'screwHole'; body: string; point: [number, number, number]; size: BlockSize; head: 'none' | 'cap' | 'countersunk'; fit: 'close' | 'normal' | 'loose' }
  | { block: 'insertSeat'; body: string; point: [number, number, number]; size: BlockSize; diameter: number; depth: number }
  | { block: 'boss'; body: string; point: [number, number, number]; size: BlockSize; diameter: number; height: number };

export type BlockKind = FeatureBlock['block'];
export const BLOCK_KINDS: BlockKind[] = ['tappedHole', 'screwHole', 'insertSeat', 'boss'];

const round = (value: number) => Math.round(value * 100) / 100;

/** The sizes a block offers: countersunk heads from M3, inserts up to M6. */
export function sizesOf(kind: BlockKind, head: 'none' | 'cap' | 'countersunk' = 'none'): BlockSize[] {
  if (kind === 'insertSeat' || kind === 'boss') return BLOCK_SIZES.filter((size) => INSERT[size]);
  if (kind === 'screwHole' && head === 'countersunk') return BLOCK_SIZES.filter((size) => COUNTERSUNK_HEAD[size]);
  return [...BLOCK_SIZES];
}

/** A block with its standard values for a size (the form starts from these). */
export function defaultBlock(kind: BlockKind, body: string, point: [number, number, number], size: BlockSize): FeatureBlock {
  const insert = INSERT[size] ?? INSERT.M3 ?? { diameter: 4, length: 5.7 };
  switch (kind) {
    case 'tappedHole':
      return { block: kind, body, point, size, depth: null, modeled: true };
    case 'screwHole':
      return { block: kind, body, point, size, head: 'cap', fit: 'normal' };
    case 'insertSeat':
      return { block: kind, body, point, size, diameter: insert.diameter, depth: round(insert.length + 1) };
    case 'boss':
      // Wall around the insert of at least 2 mm, as usual for FDM.
      return { block: kind, body, point, size, diameter: round(insert.diameter + 4), height: round(insert.length + 3) };
  }
}

/** The SolidCraft command of a block. */
export function stepOf(block: FeatureBlock): { command: string; params: Record<string, unknown> } {
  const mm = (value: number) => `${String(round(value))} mm`;
  switch (block.block) {
    case 'tappedHole':
      return { command: 'solid.hole', params: { position: block.point, thread: block.size, modeled: block.modeled, ...(block.depth ? { depth: mm(block.depth) } : {}) } };
    case 'screwHole': {
      const base = { position: block.point, clearance: block.size, fit: block.fit };
      if (block.head === 'cap') {
        const [diameter, height] = CAP_HEAD[block.size];
        return { command: 'solid.hole', params: { ...base, type: 'counterbore', cb_diameter: mm(diameter + 2 * HEAD_ALLOWANCE.diameter), cb_depth: mm(height + HEAD_ALLOWANCE.depth) } };
      }
      if (block.head === 'countersunk') {
        const diameter = COUNTERSUNK_HEAD[block.size] ?? CAP_HEAD[block.size][0];
        return { command: 'solid.hole', params: { ...base, type: 'countersink', cs_diameter: mm(diameter + HEAD_ALLOWANCE.diameter), cs_angle: '90 deg' } };
      }
      return { command: 'solid.hole', params: base };
    }
    case 'insertSeat':
      return { command: 'solid.hole', params: { position: block.point, diameter: mm(block.diameter), depth: mm(block.depth) } };
    case 'boss': {
      const insert = INSERT[block.size] ?? { diameter: 4, length: 5.7 };
      return {
        command: 'plastic.boss',
        params: { position: block.point, diameter: mm(block.diameter), height: mm(block.height), hole_diameter: mm(insert.diameter), hole_depth: mm(insert.length + 1) },
      };
    }
  }
}
