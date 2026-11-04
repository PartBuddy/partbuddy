import { describe, expect, it } from 'vitest';

import { editOf, featureMarks, sketchMarks, type RawFeature, type RawParameter, type RawSketch } from '../src/main/solidcraft/dimensionMarks';
import { dimensionMarkSchema } from '../src/shared/contract';

// Shapes as SolidCraft 0.30.1 reported them on 2026-11-04 (headless): a 40 × 30 rectangle with
// a Ø10 circle, its width driven by the user parameter W, extruded W/4.
const sketch: RawSketch = {
  plane: { origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 1, 0] },
  curves: [
    { id: 'l1', type: 'line', start_at: [0, 0], end_at: [40, 0] },
    { id: 'l2', type: 'line', start_at: [40, 0], end_at: [40, 30] },
    { id: 'l3', type: 'line', start_at: [40, 30], end_at: [0, 30] },
    { id: 'l4', type: 'line', start_at: [0, 30], end_at: [0, 0] },
    { id: 'c1', type: 'circle', center_at: [20, 15], radius: 5 },
  ],
  points: [
    { at: [0, 0], id: 'origin', world: [0, 0, 0] },
    { at: [0, 0], id: 'p1', world: [0, 0, 0] },
    { at: [40, 0], id: 'p2', world: [40, 0, 0] },
    { at: [40, 30], id: 'p3', world: [40, 30, 0] },
    { at: [0, 30], id: 'p4', world: [0, 30, 0] },
    { at: [20, 15], id: 'c1.center', world: [20, 15, 0] },
  ],
  constraints: [
    { id: 'k1', type: 'coincident', p: 1, q: 0 },
    { expression: 'W', id: 'k6', l: 0, name: 'LinearDimension', param: 'd1', type: 'length', value: 40 },
    { expression: '30', id: 'k7', l: 1, name: 'LinearDimension', param: 'd2', type: 'length', value: 30 },
    { c: 4, expression: '10', id: 'k8', name: 'DiameterDimension', param: 'd3', type: 'diameter', value: 10 },
    { expression: '20', id: 'k9', name: 'LinearDimension', p: 5, param: 'd4', q: 0, type: 'distance_x', value: 20 },
  ],
};

const parameters: RawParameter[] = [
  { name: 'W', expression: '40', unit: 'mm', value: 40, source: 'user', used_by: ['d1', 'd5'] },
  { name: 'd1', expression: 'W', unit: 'mm', value: 40, source: 'sketch' },
  { name: 'd2', expression: '30', unit: 'mm', value: 30 },
  { name: 'd3', expression: '10', unit: 'mm', value: 10 },
  { name: 'd4', expression: '20', unit: 'mm', value: 20 },
  { name: 'd5', expression: 'W/4', unit: 'mm', value: 10 },
  { name: 'd6', expression: '2', unit: 'mm', value: 2 },
  { name: 'd8', expression: '3', unit: 'mm', value: 3 },
  { name: 'd9', expression: '5', unit: 'mm', value: 5 },
  { name: 'd10', expression: '10', unit: 'mm', value: 10 },
  { name: 'd12', expression: '5', unit: 'mm', value: 5 },
  { name: 'd14', expression: '8', unit: 'mm', value: 8 },
];

const feature = (id: number, name: string, type: string, inputs: unknown[], definition: Record<string, unknown>): RawFeature => ({ id, name, type, inputs, definition });

describe('dimensions in the view (M2b-3)', () => {
  it('places sketch dimensions on their curves and points, outside the sketch', () => {
    const marks = sketchMarks(sketch, { id: 1, name: 'Sketch1' }, parameters, 'Body1');
    expect(marks.map((mark) => mark.parameter)).toEqual(['d1', 'd2', 'd3', 'd4']);
    for (const mark of marks) expect(dimensionMarkSchema.safeParse(mark).success, mark.parameter).toBe(true);
    const [width, height, diameter, offset] = marks;
    // The bottom edge, with its dimension line below the rectangle.
    expect(width?.geometry).toMatchObject({ from: [0, 0, 0], to: [40, 0, 0] });
    expect(width?.geometry?.offset[1]).toBeLessThan(0);
    // The right edge, dimensioned to the right.
    expect(height?.geometry?.offset[0]).toBeGreaterThan(0);
    expect(diameter).toMatchObject({ kind: 'diameter', value: 10 });
    expect(Math.hypot(...(diameter?.geometry?.from ?? [0, 0, 0]).map((v, i) => v - (diameter?.geometry?.to[i] ?? 0)))).toBeCloseTo(10, 2);
    // distance_x from the circle centre to the origin: only the X part.
    expect(offset?.geometry).toMatchObject({ from: [20, 15, 0], to: [0, 15, 0] });
  });

  it('places feature inputs: extrusion along the normal, fillet at its edge, hole, box and cylinder', () => {
    const extrude = featureMarks(
      feature(2, 'Platte', 'ExtrudeFeature', [{ expression: 'W/4', label: 'Distance', param: 'd5', unit: 'mm' }], {
        extent: { convention: 'total_distance', direction: 'positive', distance: 'W/4' },
        profiles: { loops: [['l1', 'l2', 'l3', 'l4']], type: 'curves' },
        sketch: 1,
      }),
      parameters,
      sketch,
      'Body1',
    );
    expect(extrude[0]?.geometry).toMatchObject({ from: [0, 0, 0], to: [0, 0, 10] });
    const fillet = featureMarks(feature(3, 'Fillet1', 'FilletFeature', [{ expression: '2', label: 'Radius', param: 'd6', unit: 'mm' }], { edges: [[40, 15, 10]] }), parameters, null, 'Body1');
    expect(fillet[0]).toMatchObject({ kind: 'radius', geometry: { anchor: [40, 15, 10] } });
    const hole = featureMarks(
      feature(5, 'Hole1', 'HoleFeature', [{ expression: '3', label: 'Diameter', param: 'd8', unit: 'mm' }, { expression: '5', label: 'Depth', param: 'd9', unit: 'mm' }], {
        position: [8, 8, 10],
        direction: [0, 0, -1],
      }),
      parameters,
      null,
      'Body1',
    );
    expect(hole[0]?.kind).toBe('diameter');
    expect(hole[1]?.geometry).toMatchObject({ from: [8, 8, 10], to: [8, 8, 5] });
    const box = featureMarks(
      feature(6, 'Box1', 'BoxFeature', [{ expression: '10', label: 'Length', param: 'd10', unit: 'mm' }, { expression: '5', label: 'Height', param: 'd12', unit: 'mm' }], { corner: [0, 0, 0] }),
      parameters,
      null,
      'Body2',
    );
    expect(box.map((mark) => mark.geometry?.to)).toEqual([[10, 0, 0], [0, 0, 5]]);
    const cylinder = featureMarks(
      feature(7, 'Cylinder1', 'CylinderFeature', [{ expression: '8', label: 'Height', param: 'd14', unit: 'mm' }], { base: [0, 0, 0], axis: [0, 0, 1], radius: '3' }),
      parameters,
      null,
      'Body3',
    );
    expect(cylinder[0]?.geometry).toMatchObject({ from: [0, 0, 0], to: [0, 0, 8] });
    const pattern = featureMarks(feature(9, 'Pattern1', 'PatternFeature', [{ expression: '4', label: 'Count', param: 'd20', unit: '' }], {}), parameters, null, null);
    expect(pattern[0]?.geometry).toBeNull();
  });

  it('never offers to overwrite a formula: plain numbers direct, one parameter through it, the rest to the assistant', () => {
    expect(editOf('30', parameters, 'd2')).toEqual({ mode: 'direct' });
    expect(editOf('12.5 mm', parameters, 'd2')).toEqual({ mode: 'direct' });
    expect(editOf('W', parameters, 'd1')).toEqual({ mode: 'parameter', name: 'W', others: 1 });
    expect(editOf('W/4', parameters, 'd5')).toEqual({ mode: 'assistant' });
    expect(editOf('d5', parameters, 'd7')).toEqual({ mode: 'assistant' });
  });
});
