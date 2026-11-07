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

describe('section aligned to a face (viewport CAD round)', () => {
  it('cuts away what lies in front of a slanted face, starting at the face', async () => {
    const { faceSection } = await import('../src/renderer/src/viewer/section');
    const n = Math.SQRT1_2;
    const section = faceSection([50, 20, 10], [n, 0, n], box);
    const plane = sectionPlane(section, box);
    expect(keeps(plane, [40, 20, 10])).toBe(true);
    expect(keeps(plane, [60, 20, 10])).toBe(false);
    // The cut starts a hair behind the face, so the face itself goes and the cut face shows.
    expect(keeps(plane, [50 - 0.05 * n, 20, 10 - 0.05 * n])).toBe(true);
    expect(keeps(plane, [50, 20, 10])).toBe(false);
    // Flipped, the front stays.
    expect(keeps(sectionPlane({ ...section, flip: true }, box), [60, 20, 10])).toBe(true);
  });

  it('moves along the face normal with the position', async () => {
    const { faceSection, sectionSpan } = await import('../src/renderer/src/viewer/section');
    const section = faceSection([0, 0, 15], [0, 0, 1], box);
    expect(section.position).toBeCloseTo(0.75);
    const { min, max } = sectionSpan(section, box);
    expect([min, max]).toEqual([0, 20]);
    expect(keeps(sectionPlane({ ...section, position: 0.25 }, box), [0, 0, 6])).toBe(false);
  });
});
