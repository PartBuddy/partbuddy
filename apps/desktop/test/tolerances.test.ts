import { describe, expect, it } from 'vitest';

import type { MaterialProfile } from '../src/shared/contract';
import { materialProfileSchema } from '../src/shared/contract';
import { testPieceSteps } from '../src/shared/testPieces';
import { applyReadings, FIT_STEPS, HOLE_SIZES, OVERHANG_STEPS } from '../src/shared/tolerances';

const pla: MaterialProfile = { id: 'pla', name: 'PLA', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 } };
const none = { fits: {}, holes: [null, null, null, null], overhang: null };

describe('applying the readings of the test pieces', () => {
  it('changes nothing without readings', () => {
    expect(applyReadings(pla, none)).toEqual({ material: pla, problems: [] });
  });

  it('takes the fit steps and the overhang as read and keeps the rest', () => {
    const { material, problems } = applyReadings(pla, { ...none, fits: { clamp: -0.05, push: 0.1, turn: 0.4 }, overhang: 55 });
    expect(problems).toEqual([]);
    expect(material).toEqual({ ...pla, overhang: 55, clearance: { clamp: -0.05, push: 0.1, slide: 0.25, turn: 0.4 } });
    expect(materialProfileSchema.safeParse(material).success).toBe(true);
  });

  it('averages the holes given and rounds to 0.05 mm', () => {
    // Off by 0.2, 0.1 and 0.25: a mean of 0.183 becomes 0.2; the 5 mm hole was not measured.
    expect(applyReadings(pla, { ...none, holes: [2.8, null, 7.9, 9.75] }).material.holeShrink).toBe(0.2);
    expect(applyReadings(pla, { ...none, holes: [2.97, 4.96, null, null] }).material.holeShrink).toBe(0.05);
  });

  it('keeps the hole allowance within the profile: holes larger than drawn give 0', () => {
    expect(applyReadings(pla, { ...none, holes: [3.2, 5.2, 8.1, 10.1] }).material.holeShrink).toBe(0);
  });

  it('reports readings that are no step, holes far off their size and fits that shrink', () => {
    const { material, problems } = applyReadings(pla, { fits: { clamp: 0.07, push: Number.NaN }, holes: [1.5, -1, null, 10.4], overhang: 47 });
    expect(problems).toEqual([{ field: 'fit', fit: 'clamp' }, { field: 'fit', fit: 'push' }, { field: 'hole', size: 3 }, { field: 'hole', size: 5 }, { field: 'overhang' }]);
    // The one good hole counts; the rest stays.
    expect(material).toEqual({ ...pla, holeShrink: 0 });
    expect(applyReadings(pla, { ...none, fits: { clamp: 0.2, push: 0.1 } }).problems).toEqual([{ field: 'order' }]);
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

  it('make heights whole layers and the engraving two layers deep', () => {
    const steps = testPieceSteps({ nozzle: 0.6, layer: 0.28 });
    const comb = steps.find((step) => step.params.body_name === 'Fit comb');
    expect(comb?.params.height).toBeCloseTo(4.2);
    const engraving = steps.find((step) => step.params.name === 'Fit comb values');
    expect(engraving?.params.distance).toBeCloseTo(0.56);
    expect(steps.filter((step) => step.params.operation === 'new').map((step) => step.params.body_name)).toEqual(['Fit comb', 'Fit pin', 'Hole plate', 'Overhang']);
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

  it('brings the fits that were not read over to the nozzle of the reading', () => {
    const { material } = applyReadings(pla, { ...none, fits: { slide: 0.3 } }, 0.6);
    // 0.05, 0.15 and 0.3 for 0.4 mm are 0.075, 0.225 and 0.45 on 0.6 mm; the slide is as read.
    expect(material.clearance).toEqual({ clamp: 0.075, push: 0.225, slide: 0.3, turn: 0.45 });
    // Readings of holes and overhang alone leave the fits and their nozzle alone.
    expect(applyReadings(pla, { ...none, overhang: 55 }, 0.6).material).toEqual({ ...pla, overhang: 55 });
  });
});
