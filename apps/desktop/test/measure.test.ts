import { describe, expect, it } from 'vitest';

import { circleOf, edgePoints, lineDirection, localMeasure, type Vec3 } from '../src/renderer/src/viewer/measure';

/** Points of an arc of radius r around (cx, cy) at height z, from a0 to a1 (radians). */
const arc = (r: number, cx: number, cy: number, z: number, a0: number, a1: number, n = 12): Vec3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
  });

describe('circleOf', () => {
  it('finds the radius and centre of an arc', () => {
    const circle = circleOf(arc(3, 10, 5, 2, 0, Math.PI / 2));
    expect(circle?.radius).toBeCloseTo(3, 6);
    expect(circle?.center[0]).toBeCloseTo(10, 6);
    expect(circle?.center[1]).toBeCloseTo(5, 6);
    expect(Math.abs(circle?.normal[2] ?? 0)).toBeCloseTo(1, 6);
  });

  it('finds a full circle', () => {
    expect(circleOf(arc(4, 0, 0, 0, 0, Math.PI * 2, 24))?.radius).toBeCloseTo(4, 6);
  });

  it('refuses a straight edge and a free curve', () => {
    expect(circleOf([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])).toBeNull();
    expect(circleOf([[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 3, 0], [4, 0, 0]])).toBeNull();
  });
});

describe('edgePoints and lineDirection', () => {
  it('lists the points of an edge in order and tells a straight edge its direction', () => {
    const segments = [9, 9, 9, 9, 9, 9, 0, 0, 0, 2, 0, 0, 2, 0, 0, 4, 0, 0];
    const points = edgePoints(segments, [0, 1, 1, 2], 1);
    expect(points).toEqual([[0, 0, 0], [2, 0, 0], [4, 0, 0]]);
    expect(lineDirection(points)).toEqual([1, 0, 0]);
    expect(lineDirection(arc(3, 0, 0, 0, 0, 1))).toBeUndefined();
  });
});

describe('localMeasure', () => {
  it('measures parallel faces plane to plane, with angle 0', () => {
    const result = localMeasure({ point: [0, 0, 0], normal: [0, 0, 1] }, { point: [5, 7, 3], normal: [0, 0, -1] });
    expect(result).toEqual({ distance: 3, angle: 0 });
  });

  it('measures the angle between faces, between edges and between a face and an edge', () => {
    expect(localMeasure({ point: [0, 0, 0], normal: [0, 0, 1] }, { point: [1, 0, 0], normal: [1, 0, 0] }).angle).toBe(90);
    expect(localMeasure({ point: [0, 0, 0], direction: [1, 0, 0] }, { point: [0, 1, 0], direction: [Math.SQRT1_2, Math.SQRT1_2, 0] }).angle).toBe(45);
    // An edge lying in a face is at 0° to it; one along the face normal at 90°.
    expect(localMeasure({ point: [0, 0, 0], normal: [0, 0, 1] }, { point: [0, 0, 0], direction: [1, 0, 0] }).angle).toBe(0);
    expect(localMeasure({ point: [0, 0, 0], normal: [0, 0, 1] }, { point: [0, 0, 0], direction: [0, 0, 1] }).angle).toBe(90);
  });

  it('measures point to point without an angle for vertices', () => {
    expect(localMeasure({ point: [0, 0, 0] }, { point: [3, 4, 0] })).toEqual({ distance: 5, angle: null });
  });
});
