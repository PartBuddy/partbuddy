import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { keeps, sectionPlane } from '../src/renderer/src/viewer/section';

const box = new Box3(new Vector3(0, 0, 0), new Vector3(100, 40, 20));

describe('section through the design (UI upgrade step 9)', () => {
  it('keeps the side below the cut, or above it when flipped', () => {
    const below = sectionPlane({ axis: 'z', position: 0.5, flip: false }, box);
    expect(keeps(below, [50, 20, 5])).toBe(true);
    expect(keeps(below, [50, 20, 15])).toBe(false);
    expect(keeps(below, [50, 20, 10])).toBe(true);

    const above = sectionPlane({ axis: 'z', position: 0.5, flip: true }, box);
    expect(keeps(above, [50, 20, 5])).toBe(false);
    expect(keeps(above, [50, 20, 15])).toBe(true);
  });

  it('cuts across the chosen axis within the box, clamping the position', () => {
    const x = sectionPlane({ axis: 'x', position: 0.25, flip: false }, box);
    expect(keeps(x, [24, 0, 0])).toBe(true);
    expect(keeps(x, [26, 0, 0])).toBe(false);
    const beyond = sectionPlane({ axis: 'y', position: 7, flip: false }, box);
    expect(keeps(beyond, [0, 39, 0])).toBe(true);
  });

  it('keeps everything without a section or without bodies', () => {
    expect(sectionPlane(null, box)).toBeNull();
    expect(sectionPlane({ axis: 'z', position: 0.5, flip: false }, new Box3())).toBeNull();
    expect(keeps(null, [1, 2, 3])).toBe(true);
  });
});
