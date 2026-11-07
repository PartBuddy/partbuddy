import { describe, expect, it } from 'vitest';

import { cellDirection, FACE_ORDER, faceTransform, viewRotation, type Mat3 } from '../src/renderer/src/viewer/navCube';

const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('view cube cells', () => {
  it('looks at each face from outside: Z up, front -Y', () => {
    expect(cellDirection('front', 0, 0)).toEqual([0, -1, 0]);
    expect(cellDirection('back', 0, 0)).toEqual([0, 1, 0]);
    expect(cellDirection('right', 0, 0)).toEqual([1, 0, 0]);
    expect(cellDirection('left', 0, 0)).toEqual([-1, 0, 0]);
    expect(cellDirection('top', 0, 0)).toEqual([0, 0, 1]);
    expect(cellDirection('bottom', 0, 0)).toEqual([0, 0, -1]);
  });

  it('puts the edges and corners of the front face where they are seen', () => {
    // Top edge of the front face: between front and top; its right end: front, top and right.
    expect(cellDirection('front', 0, -1)).toEqual([0, -1, 1]);
    expect(cellDirection('front', 1, -1)).toEqual([1, -1, 1]);
    expect(cellDirection('front', -1, 0)).toEqual([-1, -1, 0]);
    // Seen from the front, the top face's lower edge meets the front face.
    expect(cellDirection('top', 0, 1)).toEqual([0, -1, 1]);
  });

  it('reaches all 26 directions, each from every face it touches', () => {
    const all = new Set<string>();
    for (const face of FACE_ORDER) for (const column of [-1, 0, 1] as const) for (const row of [-1, 0, 1] as const) all.add(cellDirection(face, column, row).join(','));
    expect(all.size).toBe(26);
  });
});

describe('view cube transform', () => {
  it('lays the faces out as a cube for a view from the top', () => {
    expect(faceTransform(I, 'top', 32)).toBe('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)');
    expect(faceTransform(I, 'front', 32)).toContain('matrix3d(');
  });

  it('reads the view rotation from a camera world matrix', () => {
    expect(viewRotation([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 5, 5, 5, 1])).toEqual([1, 0, 0, 0, 0, -1, 0, 1, 0]);
  });
});
