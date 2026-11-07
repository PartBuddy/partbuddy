import { describe, expect, it } from 'vitest';

import { convexHull, nest, placedOutline, polygonArea, separation, type NestOptions, type NestPart, type Vec2 } from '../src/renderer/src/viewer/nesting';

const rect = (id: string, w: number, d: number, height = 10): NestPart => ({ id, points: [[0, 0], [w, 0], [w, d], [0, d], [w / 2, d / 2]], height });
const options: NestOptions = { bed: [220, 220, 250], spacing: 4, margin: 5, rotations: 24 };

/** Every placed part inside the bed margins and at least `spacing` from every other on its plate. */
function check(parts: NestPart[], result: ReturnType<typeof nest>, opts = options) {
  const outlines = result.placements.map((placement) => {
    const part = parts.find((entry) => entry.id === placement.id) as NestPart;
    return { placement, outline: placedOutline(part.points, placement) };
  });
  const misfit = new Set(result.misfits.filter((entry) => entry.reason === 'size').map((entry) => entry.id));
  for (const { placement, outline } of outlines) {
    if (misfit.has(placement.id)) continue;
    for (const [x, y] of outline) {
      expect(x).toBeGreaterThanOrEqual(opts.margin - 1e-6);
      expect(y).toBeGreaterThanOrEqual(opts.margin - 1e-6);
      expect(x).toBeLessThanOrEqual(opts.bed[0] - opts.margin + 1e-6);
      expect(y).toBeLessThanOrEqual(opts.bed[1] - opts.margin + 1e-6);
    }
  }
  for (let i = 0; i < outlines.length; i += 1) {
    for (let j = i + 1; j < outlines.length; j += 1) {
      const a = outlines[i];
      const b = outlines[j];
      if (!a || !b || a.placement.plate !== b.placement.plate) continue;
      expect(separation(a.outline, b.outline)).toBeGreaterThanOrEqual(opts.spacing - 1e-6);
    }
  }
}

describe('convexHull', () => {
  it('keeps only the outer points, counter-clockwise', () => {
    const hull = convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0.5]]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(4);
  });
});

describe('separation', () => {
  it('is the gap between apart polygons and negative for overlapping ones', () => {
    const a: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(separation(a, a.map(([x, y]) => [x + 15, y]))).toBeCloseTo(5);
    expect(separation(a, a.map(([x, y]) => [x + 5, y + 5]))).toBeLessThan(0);
  });
});

describe('nest', () => {
  it('puts parts that fit onto one plate without overlap, inside the margins', () => {
    const parts = [rect('A', 100, 60), rect('B', 80, 80), rect('C', 50, 30), rect('D', 40, 40)];
    const result = nest(parts, options);
    expect(result.plates).toBe(1);
    expect(result.misfits).toEqual([]);
    expect(result.placements).toHaveLength(4);
    check(parts, result);
  });

  it('starts a second plate when the first is full', () => {
    const parts = [rect('A', 200, 100), rect('B', 200, 100), rect('C', 200, 100)];
    const result = nest(parts, options);
    expect(result.plates).toBe(2);
    expect(new Set(result.placements.map((placement) => placement.plate))).toEqual(new Set([0, 1]));
    check(parts, result);
  });

  it('lays a long part that just fits along one side of the bed', () => {
    const parts = [rect('Rail', 30, 205)];
    const result = nest(parts, { ...options, bed: [220, 220, 250] });
    expect(result.misfits).toEqual([]);
    check(parts, result);
  });

  it('marks a part larger than the bed and one taller than it', () => {
    const parts = [rect('Huge', 300, 300), rect('Tall', 20, 20, 400)];
    const result = nest(parts, options);
    expect(result.misfits).toContainEqual({ id: 'Huge', reason: 'size' });
    expect(result.misfits).toContainEqual({ id: 'Tall', reason: 'height' });
    expect(result.placements.find((placement) => placement.id === 'Huge')?.plate).not.toBe(result.placements.find((placement) => placement.id === 'Tall')?.plate);
  });

  it('places nothing for no parts', () => {
    expect(nest([], options)).toEqual({ plates: 0, placements: [], misfits: [] });
  });
});

describe('nest centring', () => {
  it('moves the layout of a plate to the middle of the bed', () => {
    const parts = [rect('A', 40, 20)];
    const result = nest(parts, options);
    const outline = placedOutline(parts[0]?.points ?? [], result.placements[0] ?? { id: 'A', plate: 0, angle: 0, x: 0, y: 0 });
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(110, 3);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(110, 3);
  });
});
