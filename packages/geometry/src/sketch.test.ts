/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { curvePolyline, sketchFromInspect, SKETCH_STYLE, tessellateSketch, type Vec2 } from './sketch';

const fixture = new URL('../fixtures/', import.meta.url);
const inspect = JSON.parse(readFileSync(new URL('sketch-curves.inspect.json', fixture), 'utf8')) as Record<string, unknown>;
const dxf = readFileSync(new URL('sketch-curves.dxf', fixture), 'utf8');

type Segment = [Vec2, Vec2];

/** LINE, CIRCLE and ARC entities of SolidCraft's DXF, as segments in sketch coordinates. */
function dxfSegments(text: string): Segment[] {
  const lines = text.split(/\r?\n/);
  const segments: Segment[] = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i] !== '0' || !['LINE', 'CIRCLE', 'ARC'].includes(lines[i + 1] ?? '')) continue;
    const kind = lines[i + 1];
    const values = new Map<string, number>();
    let j = i + 2;
    while (j < lines.length - 1 && lines[j] !== '0') {
      values.set((lines[j] ?? '').trim(), Number(lines[j + 1]));
      j += 2;
    }
    const v = (code: string) => values.get(code) ?? Number.NaN;
    if (kind === 'LINE') {
      segments.push([
        [v('10'), v('20')],
        [v('11'), v('21')],
      ]);
    } else {
      const from = kind === 'ARC' ? (v('50') * Math.PI) / 180 : 0;
      let to = kind === 'ARC' ? (v('51') * Math.PI) / 180 : 2 * Math.PI;
      if (to <= from) to += 2 * Math.PI;
      const n = 720;
      for (let k = 0; k < n; k += 1) {
        const a = from + ((to - from) * k) / n;
        const b = from + ((to - from) * (k + 1)) / n;
        segments.push([
          [v('10') + v('40') * Math.cos(a), v('20') + v('40') * Math.sin(a)],
          [v('10') + v('40') * Math.cos(b), v('20') + v('40') * Math.sin(b)],
        ]);
      }
    }
    i = j - 1;
  }
  return segments;
}

function distanceToSegment(p: Vec2, [a, b]: Segment): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function farthest(points: Vec2[], segments: Segment[]): number {
  let worst = 0;
  for (const p of points) {
    let best = Number.POSITIVE_INFINITY;
    for (const segment of segments) best = Math.min(best, distanceToSegment(p, segment));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('sketch curves', () => {
  const sketch = sketchFromInspect(inspect);

  it('reads every curve of the fixture sketch', () => {
    expect(sketch.name).toBe('Curves');
    expect(sketch.skipped).toBe(0);
    expect(sketch.curves.length).toBe((inspect.curves as unknown[]).length);
    const kinds = new Set(sketch.curves.map((curve) => curve.kind));
    expect([...kinds].sort()).toEqual(['arc', 'circle', 'conic', 'ellipse', 'line', 'spline']);
    // The construction line, and the circle the inscribed polygon is drawn in.
    expect(sketch.curves.filter((curve) => curve.construction).map((curve) => curve.kind).sort()).toEqual(['circle', 'line']);
  });

  it('matches SolidCraft’s own DXF of the sketch within 0.01 mm, in both directions', () => {
    const reference = dxfSegments(dxf);
    expect(reference.length).toBeGreaterThan(600);
    const ours: Segment[] = [];
    const ourPoints: Vec2[] = [];
    // The DXF leaves construction geometry out.
    for (const curve of sketch.curves.filter((entry) => !entry.construction)) {
      const points = curvePolyline(curve);
      ourPoints.push(...points);
      for (let i = 1; i < points.length; i += 1) ours.push([points[i - 1] as Vec2, points[i] as Vec2]);
    }
    const referencePoints = reference.flatMap((segment) => segment);
    expect(farthest(referencePoints, ours)).toBeLessThan(0.01);
    expect(farthest(ourPoints, reference)).toBeLessThan(0.01);
  });

  it('places the sketch on its plane in world coordinates', () => {
    // The fixture sketches on XZ, offset 5 mm: sketch x is world +X, sketch y is world -Z.
    const lines = tessellateSketch(sketch);
    const corner = lines.curves.find((curve) => curve.id === 'l2');
    expect(corner).toBeDefined();
    const at = (corner!.first * 2 + 1) * 3;
    expect([...lines.positions.slice(at, at + 3)]).toEqual([40, 5, -20]);
    for (let i = 1; i < lines.positions.length; i += 3) expect(lines.positions[i]).toBeCloseTo(5, 5);
  });

  it('styles segments by construction and constraint state and keeps curve ranges', () => {
    const lines = tessellateSketch(sketch);
    expect(lines.styles.length * 6).toBe(lines.positions.length);
    const construction = sketch.curves.find((curve) => curve.construction)!;
    const range = lines.curves.find((curve) => curve.id === construction.id)!;
    expect([...lines.styles.slice(range.first, range.first + range.count)].every((s) => s === SKETCH_STYLE.construction)).toBe(true);
    // Text outlines are fixed in SolidCraft, so they count as fully constrained.
    expect(lines.styles.includes(SKETCH_STYLE.constrained)).toBe(true);
    expect(lines.styles.includes(SKETCH_STYLE.free)).toBe(true);
    let next = 0;
    for (const curve of lines.curves) {
      expect(curve.first).toBe(next);
      next += curve.count;
    }
    expect(next).toBe(lines.styles.length);
  });

  it('keeps arcs exact at their ends and bounds the segment count', () => {
    const points = curvePolyline({ kind: 'arc', center: [0, 0], radius: 1000, start: [1000, 0], end: [0, 1000] }, { maxSegments: 64 });
    expect(points[0]).toEqual([1000, 0]);
    expect(points.at(-1)).toEqual([0, 1000]);
    expect(points.length - 1).toBeLessThanOrEqual(64);
  });

  it('skips curves it cannot read and refuses a sketch without a plane', () => {
    const odd = sketchFromInspect({
      ...inspect,
      curves: [
        { id: 'x1', type: 'nurbs3d' },
        { id: 'l1', type: 'line', start_at: [0, 0], end_at: [1, Number.NaN] },
        { id: 'l2', type: 'line', start_at: [0, 0], end_at: [1, 1] },
        'garbage',
      ],
    });
    expect(odd.curves.map((curve) => curve.id)).toEqual(['l2']);
    expect(odd.skipped).toBe(3);
    expect(() => sketchFromInspect({ ...inspect, plane: null })).toThrow(/plane/);
    expect(() => sketchFromInspect(null)).toThrow();
  });
});
