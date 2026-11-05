import { describe, expect, it } from 'vitest';

import { checkPrint } from './printCheck';
import { counterboresOf, filletFeatureOf, holeRoof, steppedBridge, supportCause } from './printFixes';
import { lyingTube, revolvedBody } from './testShapes';

const PLA = { bed: [256, 256, 256] as const, nozzle: 0.4, overhang: 45 };

describe('causes and fixes of support (M7f)', () => {
  it('reads the fillet feature from a SolidCraft face name', () => {
    expect(filletFeatureOf('F2:blend:F1:-y|F1:-z')).toBe(2);
    expect(filletFeatureOf('F12:blend:F3:+x|F1:+z')).toBe(12);
    expect(filletFeatureOf('F5:side#1')).toBeNull();
  });

  it('names a lying hole too wide to bridge as the cause, apart from the tube outside', () => {
    const tube = lyingTube('Tube', 14, 8, 10);
    const result = checkPrint([tube], PLA);
    const byCause = Object.fromEntries(result.findings.flatMap((f) => (f.kind === 'support' ? [[f.cause, f.places]] : [])));
    expect(byCause.hole).toEqual([{ body: 'Tube', faces: ['F1:hole'] }]);
    expect(byCause.other).toEqual([{ body: 'Tube', faces: ['F1:outer'] }]);
    expect(supportCause(tube.model, 1, [0, 0, -1])).toBe('hole');
    // Stood on its end, the hole runs along the layers: no lying hole.
    expect(supportCause(tube.model, 1, [-1, 0, 0])).toBe('other');
  });

  it('puts a flat roof on a hole up to about Ø24 and a pointed one above', () => {
    const roof = holeRoof(lyingTube('Tube', 14, 8, 10).model, 1, [0, 0, -1]);
    expect(roof).toMatchObject({ origin: [0, 0, 14], xDir: [0, 1, 0], yDir: [0, 0, 1], length: 10, pointed: false, radius: 8 });
    // Centre, the two 45° points on the circle, and a flat top 2 × 8 × (√2 − 1) = 6.6 mm wide at the circle's top.
    expect(roof?.points).toEqual([[0, 0], [5.6569, 5.6569], [3.3137, 8], [-3.3137, 8], [-5.6569, 5.6569]]);
    const wide = holeRoof(lyingTube('Pipe', 20, 15, 10).model, 1, [0, 0, -1]);
    expect(wide).toMatchObject({ pointed: true, points: [[0, 0], [10.6066, 10.6066], [0, 21.2132], [-10.6066, 10.6066]] });
    // The outside of the tube is no hole.
    expect(holeRoof(lyingTube('Tube', 14, 8, 10).model, 0, [0, 0, -1])).toBeNull();
  });
});

describe('counterbores facing the bed (M7f step 3)', () => {
  // A sleeve standing on the bed: bore Ø8 from below up to 3 mm, then a hole Ø4.5 up to 10 mm.
  const sleeve = () => revolvedBody('Sleeve', [[4, 0], [8, 0], [8, 10], [2.25, 10], [2.25, 3], [4, 3]]);

  it('finds the step that faces the bed and names it as the cause', () => {
    const body = sleeve();
    expect(counterboresOf(body.model, [0, 0, -1])).toEqual([{ step: 4, origin: [0, 0, 3], hole: 2.25, bore: 4, area: expect.closeTo(34.36, 2) as number }]);
    const result = checkPrint([body], PLA);
    expect(result.findings).toEqual([expect.objectContaining({ kind: 'support', cause: 'counterbore', area: 34, places: [{ body: 'Sleeve', faces: ['F1:p4'] }] })]);
    // Upside down the step faces up: nothing to bridge.
    expect(counterboresOf(body.model, [0, 0, 1])).toEqual([]);
    // Two sleeves in one body, their steps at the same height: each step belongs to its own bore.
    const pair = revolvedBody('Pair', [[4, 0], [8, 0], [8, 10], [2.25, 10], [2.25, 3], [4, 3]], 48, [[0, 0], [30, 0]]);
    expect(counterboresOf(pair.model, [0, 0, -1]).map((item) => [item.step, item.origin])).toEqual([[4, [0, 0, 3]], [10, [30, 0, 3]]]);
    // A step of at most 1.5 mm grows from the bore's wall.
    expect(counterboresOf(revolvedBody('Narrow', [[3.5, 0], [8, 0], [8, 10], [2.25, 10], [2.25, 3], [3.5, 3]]).model, [0, 0, -1])).toEqual([]);
  });

  it('cuts a slot as wide as the hole across the bore for the first layer, and a square for two', () => {
    const [counterbore] = counterboresOf(sleeve().model, [0, 0, -1]);
    if (!counterbore) throw new Error('no counterbore');
    // The slot's ends stay 0.05 mm off the bore: √(4² − 2.25²) − 0.05 = 3.2572.
    expect(steppedBridge(counterbore, [0, 0, -1], 0.2)).toEqual({
      // 0.01 mm below the step, so the cuts never start in its plane.
      origin: [0, 0, 2.99],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      slot: [[-3.2572, -2.25], [3.2572, -2.25], [3.2572, 2.25], [-3.2572, 2.25]],
      square: [[-2.25, -2.25], [2.25, -2.25], [2.25, 2.25], [-2.25, 2.25]],
      slotDepth: 0.21,
      squareDepth: 0.41,
    });
  });
});
