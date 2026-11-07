import { describe, expect, it } from 'vitest';

import { pickBox, selectionBox, VIEW_DIRECTIONS, type PickArrays } from '../src/renderer/src/viewer/camera';

// Two triangles: face 0 spans x 0–10, face 1 spans x 20–30; one edge of two segments; two vertices.
const arrays: PickArrays = {
  positions: [0, 0, 0, 10, 0, 0, 0, 5, 0, 20, 0, 0, 30, 0, 0, 20, 5, 2],
  index: [0, 1, 2, 3, 4, 5],
  triangleFaces: [0, 1],
  edgeSegments: [0, 0, 0, 4, 0, 0, 4, 0, 0, 4, 6, 0],
  edgeRanges: [0, 2],
  vertices: [1, 2, 3, 7, 8, 9],
};

describe('pickBox', () => {
  it('spans the triangles of a picked face only', () => {
    expect(pickBox(arrays, { kind: 'face', face: 1 })).toEqual({ min: [20, 0, 0], max: [30, 5, 2] });
  });

  it('spans the segments of a picked edge', () => {
    expect(pickBox(arrays, { kind: 'edge', edge: 0 })).toEqual({ min: [0, 0, 0], max: [4, 6, 0] });
  });

  it('is the point of a picked vertex, and null for one that does not exist', () => {
    expect(pickBox(arrays, { kind: 'vertex', vertex: 1 })).toEqual({ min: [7, 8, 9], max: [7, 8, 9] });
    expect(pickBox(arrays, { kind: 'vertex', vertex: 5 })).toBeNull();
  });
});

describe('selectionBox', () => {
  it('joins the picked boxes and grows a small selection to its neighbourhood', () => {
    const box = selectionBox([{ min: [0, 0, 0], max: [4, 6, 0] }, null, { min: [7, 8, 9], max: [7, 8, 9] }], 10);
    expect(box).toEqual({ min: [-1.5, -1, -0.5], max: [8.5, 9, 9.5] });
  });

  it('is null without anything picked', () => {
    expect(selectionBox([null], 10)).toBeNull();
  });
});

describe('VIEW_DIRECTIONS', () => {
  it('pairs every side with its opposite', () => {
    expect(VIEW_DIRECTIONS.back).toEqual(VIEW_DIRECTIONS.front.map((v) => -v + 0));
    expect(VIEW_DIRECTIONS.left).toEqual(VIEW_DIRECTIONS.right.map((v) => -v + 0));
    expect(VIEW_DIRECTIONS.bottom[2]).toBe(-VIEW_DIRECTIONS.top[2]);
  });
});
