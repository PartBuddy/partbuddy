import { describe, expect, it } from 'vitest';

import { parseLength, stepLength } from '../src/renderer/src/viewer/lengthInput';
import { segmentCandidates, vertexCandidates, type Project } from '../src/renderer/src/viewer/picking';

// Looking down -Z: 1 mm is 10 px, x to the right, y down the screen.
const topView: Project = (x, y, z) => ({ x: x * 10, y: -y * 10, depth: 1 - z / 100 });

describe('screen-space picking of edges and vertices', () => {
  it('finds the vertex within the pick radius, nearest first', () => {
    const vertices = Float32Array.from([0, 0, 0, 10, 0, 0, 0.5, 0, 0]);
    const found = vertexCandidates(vertices, topView, { x: 3, y: 0 }, 8);
    expect(found.map((c) => c.index)).toEqual([2, 0]);
    expect(found[0]?.pixels).toBeCloseTo(2);
    expect(vertexCandidates(vertices, topView, { x: 50, y: 30 }, 8)).toEqual([]);
  });

  it('measures the distance to the segment, not to its ends, and returns the point on it', () => {
    // One segment from (0,0,0) to (10,0,0) and one far away.
    const segments = Float32Array.from([0, 0, 0, 10, 0, 0, 0, 20, 0, 10, 20, 0]);
    const [hit] = segmentCandidates(segments, topView, { x: 50, y: 4 }, 6);
    expect(hit?.index).toBe(0);
    expect(hit?.pixels).toBeCloseTo(4);
    expect(hit?.point[0]).toBeCloseTo(5);
    // Beyond the end the distance is to the end point.
    expect(segmentCandidates(segments, topView, { x: 104, y: 0 }, 6)[0]?.pixels).toBeCloseTo(4);
    expect(segmentCandidates(segments, topView, { x: 110, y: 0 }, 6)).toEqual([]);
  });

  it('skips points the projection cannot place (behind the camera)', () => {
    const behind: Project = () => null;
    expect(vertexCandidates(Float32Array.from([0, 0, 0]), behind, { x: 0, y: 0 }, 8)).toEqual([]);
    expect(segmentCandidates(Float32Array.from([0, 0, 0, 1, 0, 0]), behind, { x: 0, y: 0 }, 8)).toEqual([]);
  });
});

describe('length typed into the dimension field', () => {
  it('reads a point or a comma and refuses anything else', () => {
    expect(parseLength('32')).toBe(32);
    expect(parseLength('12,5')).toBe(12.5);
    expect(parseLength(' 7.25 mm ')).toBe(7.25);
    expect(parseLength('.5')).toBe(0.5);
    expect(parseLength('1e3')).toBeNaN();
    expect(parseLength('-4')).toBeNaN();
    expect(parseLength('')).toBeNaN();
  });

  it('steps with the arrow keys: 1, 10 with Shift, 0.1 with Alt, never to zero', () => {
    const none = { shiftKey: false, altKey: false };
    expect(stepLength('20', 'ArrowUp', none, '.')).toBe('21');
    expect(stepLength('20', 'ArrowDown', { shiftKey: true, altKey: false }, '.')).toBe('10');
    expect(stepLength('12,5', 'ArrowUp', { shiftKey: false, altKey: true }, ',')).toBe('12,6');
    expect(stepLength('0.3', 'ArrowDown', { shiftKey: false, altKey: true }, '.')).toBe('0.2');
    expect(stepLength('1', 'ArrowDown', none, '.')).toBeNull();
    expect(stepLength('abc', 'ArrowUp', none, '.')).toBeNull();
    expect(stepLength('20', 'Enter', none, '.')).toBeNull();
  });
});
