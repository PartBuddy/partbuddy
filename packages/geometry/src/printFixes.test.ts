import { describe, expect, it } from 'vitest';

import { checkPrint } from './printCheck';
import { filletFeatureOf, holeRoof, supportCause } from './printFixes';
import { lyingTube } from './testShapes';

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
