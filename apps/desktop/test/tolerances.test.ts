import { describe, expect, it } from 'vitest';

import type { MaterialProfile } from '../src/shared/contract';
import { fitsInOrder, materialProfileSchema } from '../src/shared/contract';
import { testPieceSteps } from '../src/shared/testPieces';
import { applyReadings, FIT_STEPS, holeAllowance, HOLE_SIZES, LARGEST_HOLE, OVERHANG_STEPS, PRINT_UNDERSIZE } from '../src/shared/tolerances';

const pla: MaterialProfile = { id: 'pla', name: 'PLA', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 } };
const none = { fits: {}, holes: [null, null, null, null], overhang: null };

describe('applying the readings of the test pieces', () => {
  it('changes nothing without readings', () => {
    expect(applyReadings(pla, none)).toEqual({ material: pla, problems: [] });
  });

  it('takes the fit steps and the overhang as read and keeps the rest', () => {
    const { material, problems } = applyReadings(pla, { ...none, fits: { clamp: -0.05, push: 0.1, turn: 0.4 }, overhang: 55 });
    expect(problems).toEqual([]);
    // Read off the comb drilled with the allowance (BC-16): the profile says so, and older files without the mark still load.
    expect(material).toEqual({ ...pla, overhang: 55, clearance: { clamp: -0.05, push: 0.1, slide: 0.25, turn: 0.4 }, fitsAfterPrint: true });
    expect(materialProfileSchema.safeParse(material).success).toBe(true);
    expect(materialProfileSchema.safeParse({ ...pla, measuredNozzle: 0.4 }).success).toBe(true);
    expect(applyReadings(pla, { ...none, overhang: 50 }).material).not.toHaveProperty('fitsAfterPrint');
  });

  it('takes off each fit read what the comb was drilled wider than the plate measures now (BC-16 review S3)', () => {
    // Drilled with PLA's 0.15; the plate reads PP-like 0.3: the comb's holes came out 0.15 smaller on the diameter, so each step
    // read is 0.075 a side less room than its label. The same allowance both times changes nothing; a smaller one adds.
    const holes = (shrink: number) => HOLE_SIZES.map((size) => size - shrink);
    expect(applyReadings(pla, { ...none, fits: { push: 0.15, slide: 0.25, turn: 0.3 }, holes: holes(0.3) }).material.clearance).toMatchObject({ push: 0.075, slide: 0.175, turn: 0.225 });
    expect(applyReadings(pla, { ...none, fits: { push: 0.15 }, holes: holes(0.15) }).material.clearance.push).toBe(0.15);
    expect(applyReadings(pla, { ...none, fits: { push: 0.15 }, holes: holes(0.05) }).material.clearance.push).toBe(0.2);
    // Without the plate read, the comb's allowance stands.
    expect(applyReadings(pla, { ...none, fits: { push: 0.15 } }).material.clearance.push).toBe(0.15);
  });

  it('averages the holes given and rounds to 0.05 mm', () => {
    // Off by 0.2, 0.1 and 0.25: a mean of 0.183 becomes 0.2; the 5 mm hole was not measured.
    expect(applyReadings(pla, { ...none, holes: [2.8, null, 7.9, 9.75] }).material.holeShrink).toBe(0.2);
    expect(applyReadings(pla, { ...none, holes: [2.97, 4.96, null, null] }).material.holeShrink).toBe(0.05);
  });

  it('keeps the hole allowance within the profile: holes larger than drawn give 0 and say so (audit MG-31)', () => {
    const { material, problems } = applyReadings(pla, { ...none, holes: [3.2, 5.2, 8.1, 10.1] });
    expect(material.holeShrink).toBe(0);
    // 0.15 mm too large on average; before, nothing was said.
    expect(problems).toEqual([{ field: 'oversize', by: 0.15 }]);
    // Just over, on and just under nominal on the 0.05 mm steps: only what rounds to a step over is said.
    expect(applyReadings(pla, { ...none, holes: [3.03, null, null, null] }).problems).toEqual([{ field: 'oversize', by: 0.05 }]);
    expect(applyReadings(pla, { ...none, holes: [3.02, null, null, null] })).toEqual({ material: { ...pla, holeShrink: 0 }, problems: [] });
    expect(applyReadings(pla, { ...none, holes: [3, null, null, null] })).toEqual({ material: { ...pla, holeShrink: 0 }, problems: [] });
  });

  it('rounds a mean exactly between two steps the same way for every hole (audit T53)', () => {
    // 3 − 2.925 is 0.07500000000000018 and 10 − 9.925 is 0.07499999999999929: both are 0.075, both become 0.1.
    for (const [i, size] of HOLE_SIZES.entries()) {
      const at = (off: number) => {
        const holes: (number | null)[] = [null, null, null, null];
        holes[i] = size - off;
        return applyReadings(pla, { ...none, holes }).material.holeShrink;
      };
      expect(at(0.075), `Ø ${String(size)}`).toBe(0.1);
      expect(at(0.074), `Ø ${String(size)}`).toBe(0.05);
      expect(at(0.025), `Ø ${String(size)}`).toBe(0.05);
      expect(at(0.024), `Ø ${String(size)}`).toBe(0);
      // Over nominal by the same amounts: the same steps, said as oversize (BC-14 review K4).
      const over = (off: number) => {
        const holes: (number | null)[] = [null, null, null, null];
        holes[i] = size + off;
        return applyReadings(pla, { ...none, holes }).problems;
      };
      expect(over(0.075), `Ø ${String(size)}`).toEqual([{ field: 'oversize', by: 0.1 }]);
      expect(over(0.074), `Ø ${String(size)}`).toEqual([{ field: 'oversize', by: 0.05 }]);
      expect(over(0.025), `Ø ${String(size)}`).toEqual([{ field: 'oversize', by: 0.05 }]);
      expect(over(0.024), `Ø ${String(size)}`).toEqual([]);
    }
  });

  it('reports readings that are no step, holes far off their size and fits that shrink', () => {
    const { material, problems } = applyReadings(pla, { fits: { clamp: 0.07, push: Number.NaN }, holes: [1.5, -1, null, 10.4], overhang: 47 });
    // 10.4 on the 10 mm hole is 0.4 mm too large: said, and the allowance is 0.
    expect(problems).toEqual([{ field: 'fit', fit: 'clamp' }, { field: 'fit', fit: 'push' }, { field: 'hole', size: 3 }, { field: 'hole', size: 5 }, { field: 'oversize', by: 0.4 }, { field: 'overhang' }]);
    // The one good hole counts; the rest stays.
    expect(material).toEqual({ ...pla, holeShrink: 0 });
    expect(applyReadings(pla, { ...none, fits: { clamp: 0.2, push: 0.1 } }).problems).toEqual([{ field: 'order' }]);
  });

  it('checks the order against the whole profile, the fits not read included (audit T33)', () => {
    // Only clamp read, at 0.4: over the push 0.15 the profile keeps. Before, nothing was said.
    expect(applyReadings(pla, { ...none, fits: { clamp: 0.4 } }).problems).toEqual([{ field: 'order' }]);
    expect(applyReadings(pla, { ...none, fits: { clamp: 0.15 } }).problems).toEqual([]);
    expect(applyReadings(pla, { ...none, fits: { clamp: 0.2 } }).problems).toEqual([{ field: 'order' }]);
    expect(applyReadings(pla, { ...none, fits: { turn: 0.25 } }).problems).toEqual([]);
    expect(applyReadings(pla, { ...none, fits: { turn: 0.2 } }).problems).toEqual([{ field: 'order' }]);
    // The same rule the profile editor holds hand-entered fits to.
    expect(fitsInOrder({ clamp: 0.4, push: 0.15, slide: 0.25, turn: 0.3 })).toBe(false);
    expect(fitsInOrder(pla.clearance)).toBe(true);
  });

  it('accepts every step at the edges of the comb and the staircase', () => {
    const lowest = applyReadings(pla, { ...none, fits: { clamp: -0.1, push: -0.1, slide: -0.1, turn: -0.1 }, overhang: 20 });
    const highest = applyReadings(pla, { ...none, fits: { turn: 0.5 }, overhang: 70 });
    for (const { material, problems } of [lowest, highest]) {
      expect(problems).toEqual([]);
      expect(materialProfileSchema.safeParse(material).success).toBe(true);
    }
  });
});

describe('the test pieces', () => {
  const texts = (steps: ReturnType<typeof testPieceSteps>) => steps.filter((step) => step.command === 'sketch.text').map((step) => step.params.text);

  it('engrave the value of every step', () => {
    expect(texts(testPieceSteps({ nozzle: 0.4, layer: 0.2 }))).toEqual([...FIT_STEPS, ...HOLE_SIZES, ...OVERHANG_STEPS].map(String));
  });

  it('make heights whole layers and the engraving at least 0.5 mm in whole layers', () => {
    const steps = testPieceSteps({ nozzle: 0.6, layer: 0.28 });
    const comb = steps.find((step) => step.params.body_name === 'Fit comb');
    expect(comb?.params.height).toBeCloseTo(4.2);
    const engraving = steps.find((step) => step.params.name === 'Fit comb values');
    expect(engraving?.params.distance).toBeCloseTo(0.56);
    expect(steps.filter((step) => step.params.operation === 'new').map((step) => step.params.body_name)).toEqual(['Fit comb', 'Fit pin', 'Hole plate', 'Overhang']);
  });

  it('drill the fit comb with the hole allowance of the material measured, so the fit read is the room after printing (BC-16 review B1, N-nach-6)', async () => {
    const { PIN, combHole } = await import('../src/shared/testPieces');
    const { magnetPocket } = await import('../src/shared/magnet');
    const { pegBore } = await import('../src/shared/mechanisms');
    const hole = (holeShrink?: number) => testPieceSteps({ nozzle: 0.4, layer: 0.2, holeShrink }).find((step) => step.params.name === 'Fit 0.15')?.params.diameter;
    // Pin 6 and 0.15 a side: 6.3 as it comes out, drawn 6.45 in PLA (0.15), 6.6 in PP (0.3), 6.3 with no allowance; PLA's without one given.
    expect([hole(0.15), hole(0.3), hole(0), hole()]).toEqual([6.45, 6.6, 6.3, 6.45]);
    expect(combHole(-0.05, 0.3)).toBe(6.2);
    // The hole plate is drawn at its nominal sizes: it measures the allowance.
    expect(testPieceSteps({ nozzle: 0.4, layer: 0.2, holeShrink: 0.3 }).find((step) => step.params.name === 'Hole 10')?.params.diameter).toBe(10);
    // No double count: a hole that shrinks by the allowance drawn into it comes out at pin + 2 × the step read off the comb, and a
    // tool given that reading as the profile's push fit draws its pocket so it comes out at the part + 2 × the same room.
    const shrink = 0.3;
    const read = 0.15;
    expect(Math.round((combHole(read, shrink) - shrink) * 1000) / 1000).toBe(PIN + 2 * read);
    const measured = { holeShrink: shrink, clearance: { clamp: 0.05, push: read, slide: 0.25, turn: 0.3 }, measuredNozzle: 0.4 };
    expect(Math.round((magnetPocket({ diameter: 6, height: 2, hold: 'glue' }, { nozzle: 0.4, layer: 0.2, material: measured }).drawn - shrink) * 1000) / 1000).toBe(6 + 2 * read);
    expect(Math.round((pegBore({ diameter: 5, gap: read, material: measured }) - shrink) * 1000) / 1000).toBe(5 + 2 * read);
  });
});

describe('fits read on another nozzle than 0.4 mm (audit T2)', () => {
  const wide = { nozzle: 0.6, layer: 0.3 };

  it('uses a fit on the nozzle it was read on as read, and scales it only for another nozzle', async () => {
    const { scaleClearance } = await import('../src/shared/designFit');
    const { material } = applyReadings(pla, { ...none, fits: { clamp: 0.05, push: 0.15, slide: 0.3, turn: 0.35 } }, 0.6);
    expect(material).toMatchObject({ measuredNozzle: 0.6, clearance: { clamp: 0.05, push: 0.15, slide: 0.3, turn: 0.35 } });
    expect(materialProfileSchema.parse(material)).toEqual(material);
    // Before, 0.30 mm read on a 0.6 mm nozzle reached the assistant as 0.45 mm.
    expect(scaleClearance(material.clearance.slide, wide, material.measuredNozzle)).toBe(0.3);
    expect(scaleClearance(material.clearance.slide, { nozzle: 0.4, layer: 0.2 }, material.measuredNozzle)).toBe(0.2);
    // A profile nobody measured still holds starting values for 0.4 mm.
    expect(scaleClearance(pla.clearance.slide, wide, pla.measuredNozzle)).toBe(0.375);
  });

  it('never takes a clearance under its 0.4 mm value on a finer nozzle, and never scales an interference (audit MG-12, T20)', async () => {
    const { scaleClearance } = await import('../src/shared/designFit');
    // Before: 0.25 became 0.125 on a 0.2 mm nozzle and the clamp 0.05 became 0.025.
    for (const nozzle of [0.1, 0.2, 0.25, 0.39, 0.4]) {
      expect(scaleClearance(0.25, { nozzle, layer: 0.1 })).toBe(0.25);
      expect(scaleClearance(0.05, { nozzle, layer: 0.1 })).toBe(0.05);
    }
    expect(scaleClearance(0.25, { nozzle: 0.41, layer: 0.2 })).toBe(0.256);
    expect(scaleClearance(0.3, { nozzle: 0.8, layer: 0.4 })).toBe(0.6);
    // A press fit stays as read; a wider nozzle does not press harder.
    expect(scaleClearance(-0.05, { nozzle: 0.8, layer: 0.4 })).toBe(-0.05);
    expect(scaleClearance(-0.05, { nozzle: 0.2, layer: 0.1 })).toBe(-0.05);
    expect(scaleClearance(0, { nozzle: 0.8, layer: 0.4 })).toBe(0);
    // Read on a 0.2 mm nozzle: the same on 0.4, and the 0.4 values do not shrink when brought to 0.2.
    expect(scaleClearance(0.15, { nozzle: 0.4, layer: 0.2 }, 0.2)).toBe(0.15);
    expect(scaleClearance(0.15, { nozzle: 0.6, layer: 0.3 }, 0.2)).toBe(0.225);
    expect(applyReadings(pla, { ...none, fits: { slide: 0.25 } }, 0.2).material.clearance).toEqual(pla.clearance);
  });

  it('brings the fits that were not read over to the nozzle of the reading', () => {
    const { material } = applyReadings(pla, { ...none, fits: { slide: 0.3 } }, 0.6);
    // 0.05, 0.15 and 0.3 for 0.4 mm are 0.075, 0.225 and 0.45 on 0.6 mm; the slide is as read.
    expect(material.clearance).toEqual({ clamp: 0.075, push: 0.225, slide: 0.3, turn: 0.45 });
    // Readings of holes and overhang alone leave the fits and their nozzle alone.
    expect(applyReadings(pla, { ...none, overhang: 55 }, 0.6).material).toEqual({ ...pla, overhang: 55 });
  });
});

describe('the hole allowance by diameter (audit MG-26, T23)', () => {
  it('holds the measured value up to the largest hole of the plate and lets the shrinkage grow above it', () => {
    // ABS 0.25 mm: 0.10 from printing and 0.15 shrinkage on 10 mm; 50 mm takes 0.10 + 0.75 (before: 0.25 for every size).
    expect(holeAllowance(0.25, 3)).toBe(0.25);
    expect(holeAllowance(0.25, LARGEST_HOLE)).toBe(0.25);
    expect(holeAllowance(0.25, LARGEST_HOLE + 0.001)).toBe(0.25);
    expect(holeAllowance(0.25, LARGEST_HOLE + 1)).toBe(0.265);
    expect(holeAllowance(0.25, 50)).toBe(0.85);
    // PLA 0.15: 0.35 on 50 mm.
    expect(holeAllowance(0.15, 50)).toBe(0.35);
  });

  it('grows nothing that is no shrinkage, and takes nonsense diameters as the measured value', () => {
    expect(holeAllowance(PRINT_UNDERSIZE, 50)).toBe(PRINT_UNDERSIZE);
    expect(holeAllowance(0.05, 50)).toBe(0.05);
    expect(holeAllowance(0, 50)).toBe(0);
    for (const diameter of [Number.NaN, 0, -5]) expect(holeAllowance(0.25, diameter)).toBe(0.25);
  });
});

describe('the test pieces keep the rules they measure for (audit T27, MV-16, T57)', () => {
  const nozzles = [0.2, 0.25, 0.4, 0.6, 0.8];
  const layersFor = (nozzle: number) => [0.12, 0.2].filter((layer) => layer <= nozzle);

  it('chamfer every measured hole at the bed by at least two layers and the elephant foot', () => {
    for (const nozzle of nozzles)
      for (const layer of layersFor(nozzle)) {
        const steps = testPieceSteps({ nozzle, layer });
        const holes = steps.filter((step) => step.command === 'solid.cylinder' && step.params.operation === 'cut');
        expect(holes).toHaveLength(FIT_STEPS.length + HOLE_SIZES.length);
        for (const hole of holes) {
          const cone = steps.find((step) => step.command === 'solid.cone' && step.params.name === `${String(hole.params.name)} chamfer`);
          const chamfer = Number(cone?.params.height);
          expect(cone?.params).toMatchObject({ base: hole.params.base, operation: 'cut', targets: hole.params.targets, top_diameter: hole.params.diameter });
          expect((hole.params.base as number[])[2]).toBe(0);
          expect(Number(cone?.params.diameter)).toBeCloseTo(Number(hole.params.diameter) + 2 * chamfer, 6);
          // 0.4 at 0.2 mm layers, 0.36 (three layers) at 0.12, where two would be 0.24 under the elephant foot.
          expect(chamfer).toBeCloseTo(layer === 0.2 ? 0.4 : 0.36, 6);
        }
      }
  });

  it('engrave bold digits two nozzles wide, as the block check asks, and as deep as the rule text asks', async () => {
    const { BOLD_FONT } = await import('../src/shared/blocks');
    const { DIGIT_STROKE } = await import('../src/shared/testPieces');
    const expected = { 0.2: 3, 0.25: 4, 0.4: 6, 0.6: 9, 0.8: 12 } as Record<number, number>;
    for (const nozzle of nozzles)
      for (const layer of layersFor(nozzle)) {
        const steps = testPieceSteps({ nozzle, layer });
        const letters = steps.filter((step) => step.command === 'sketch.text');
        for (const text of letters) {
          expect(text.params).toMatchObject({ font: BOLD_FONT, bold: true, height: expected[nozzle] });
          // Before: 3 mm in the built-in regular font at every nozzle, digit strokes of about 0.3 mm.
          expect(Number(text.params.height) * DIGIT_STROKE).toBeGreaterThanOrEqual(2 * nozzle - 1e-9);
        }
        for (const cut of steps.filter((step) => String(step.params.name).endsWith(' values'))) {
          const depth = Number(cut.params.distance);
          expect(depth).toBeGreaterThanOrEqual(0.5);
          expect(Math.abs(depth / layer - Math.round(depth / layer))).toBeLessThan(1e-6);
        }
      }
  });

  it('make each piece fit the smallest bed of the catalog up to a 0.4 mm nozzle, and common beds above', async () => {
    const { testPieceSizes } = await import('../src/shared/testPieces');
    const largest = (nozzle: number) => Math.max(...Object.values(testPieceSizes({ nozzle, layer: 0.2 })).flat());
    expect(Object.keys(testPieceSizes({ nozzle: 0.4, layer: 0.2 }))).toEqual(['Fit comb', 'Fit pin', 'Hole plate', 'Overhang']);
    // Voron 0.2, 120 × 120 mm, the smallest bed of the printer catalog; MINI+ and A1 mini 180; most others 256.
    for (const nozzle of [0.2, 0.25, 0.4]) expect(largest(nozzle)).toBeLessThanOrEqual(120);
    expect(largest(0.6)).toBeLessThanOrEqual(180);
    expect(largest(0.8)).toBeLessThanOrEqual(256);
    // On 0.8 the pieces outgrow a 180 mm bed, which the tolerance assistant says (tolerance-too-large).
    expect(largest(0.8)).toBeGreaterThan(180);
  });
});
