import { describe, expect, it } from 'vitest';

import { explodeOffsets, SPREAD, type Box } from '../src/renderer/src/viewer/explode';

const box = (min: [number, number, number], max: [number, number, number]): Box => ({ min, max });

describe('exploded view (F7)', () => {
  // A box 60 × 40 × 20 and its lid 60 × 40 × 4 on top.
  const boxAndLid = [box([0, 0, 0], [60, 40, 20]), box([0, 0, 20], [60, 40, 24])];

  it('leaves the parts where they are when assembled or alone', () => {
    expect(explodeOffsets(boxAndLid, 0)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(explodeOffsets([boxAndLid[0] as Box], 1)).toEqual([[0, 0, 0]]);
  });

  it('pulls a lid off its box without sinking the box below the floor', () => {
    const [base, lid] = explodeOffsets(boxAndLid, 1);
    // The middles are 12 mm apart; fully apart they are SPREAD times that further apart.
    expect((lid?.[2] ?? 0) - (base?.[2] ?? 0)).toBeCloseTo(12 * SPREAD);
    expect(base).toEqual([0, 0, 0]);
    expect(lid?.slice(0, 2)).toEqual([0, 0]);
  });

  it('spreads side by side parts sideways, in proportion to the slider', () => {
    const parts = [box([0, 0, 0], [10, 10, 10]), box([20, 0, 0], [30, 10, 10])];
    const half = explodeOffsets(parts, 0.5);
    const full = explodeOffsets(parts, 1);
    expect(full[0]?.[0]).toBeCloseTo(-10 * SPREAD);
    expect(full[1]?.[0]).toBeCloseTo(10 * SPREAD);
    expect(half[1]?.[0]).toBeCloseTo((full[1]?.[0] ?? 0) / 2);
    expect(full.every((offset) => offset[2] === 0)).toBe(true);
  });
});
