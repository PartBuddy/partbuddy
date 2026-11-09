import { describe, expect, it } from 'vitest';

import { logoAt, planLogoMove, type Run } from '../src/main/solidcraft/logoMove';
import { draggedValue } from '../src/renderer/src/viewer/dimensionOf';
import { planeAngle, rotatedPlane } from '../src/shared/drawingPlacement';

type Vec3 = [number, number, number];
const line = (name: string, start: Vec3, end: Vec3) => ({ name, start, end, mid: start.map((value, i) => (value + (end[i] ?? 0)) / 2), length: Math.hypot(...start.map((value, i) => value - (end[i] ?? 0))) });

// A 40 × 40 × 10 box with a logo 8 mm across ("SVG-Logo Badge"), its middle at (14, 20) on the top face: 6 mm left of the face's middle.
const plane = { origin: [14, 20, 10] as Vec3, x_dir: [1, 0, 0] as Vec3, y_dir: [0, 1, 0] as Vec3 };
function engine(): { run: Run; seen: string[] } {
  const seen: string[] = [];
  const answer = (command: string, params: Record<string, unknown>): unknown => {
    switch (command) {
      case 'document.inspect':
        return {
          bodies: [
            { name: 'Box', bbox: { min: [0, 0, 0], max: [40, 40, 10] } },
            { name: 'Badge 1d71b8 1', bbox: { min: [10, 16, 9.4], max: [18, 24, 10] } },
            { name: 'Other', bbox: { min: [50, 0, 0], max: [60, 10, 10] } },
          ],
          sketches: [{ id: 3, name: 'SVG-Logo Badge', plane }, { id: 4, name: 'Sketch1', plane }],
          timeline: [{ id: 1, type: 'Box' }, { id: 5, type: 'Extrude' }, { id: 6, type: 'Extrude' }],
        };
      case 'timeline.inspect':
        return params.feature === 5
          ? { inputs: [{ label: 'Distance', param: 'd5', expression: '-0.6 mm' }], definition: { sketch: 3 } }
          : { inputs: [{ label: 'Distance', param: 'd6', expression: '2 mm' }], definition: { sketch: 4 } };
      case 'parameters.list':
        return { parameters: [{ name: 'd5', expression: '-0.6 mm', value: -0.6 }, { name: 'd6', expression: '2 mm', value: 2 }] };
      case 'sketch.inspect':
        return { id: params.sketch, name: 'SVG-Logo Badge', plane, curves: [{ id: 'c1', type: 'circle', center_at: [0, 0], radius: 4 }], points: [{ id: 'origin', fixed: true, at: [0, 0] }] };
      case 'model.faces':
        return params.body === 'Box' ? { faces: [{ name: 'F1:+z', plane_normal: [0, 0, 1], point: [30, 30, 10] }] } : { faces: [] };
      case 'model.edges':
        return {
          edges: params.body === 'Box' ? [line('F1:+z|F1:-y', [0, 0, 10], [40, 0, 10]), line('F1:+x|F1:+z', [40, 0, 10], [40, 40, 10]), line('F1:+y|F1:+z', [40, 40, 10], [0, 40, 10]), line('F1:-x|F1:+z', [0, 40, 10], [0, 0, 10])] : [],
        };
      default:
        return {};
    }
  };
  return {
    seen,
    run: (commands) => {
      seen.push(...commands.map((step) => step.command));
      return Promise.resolve(commands.map((step) => answer(step.command, step.params)));
    },
  };
}

describe('moving a placed logo', () => {
  it('finds the logo under a picked point and how far it sits from its face middle', async () => {
    const { run } = engine();
    // On the floor of the pocket, inside the drawing's box.
    const spot = await logoAt(run, [16, 21, 9.4]);
    expect(spot).toMatchObject({ logo: 'SVG-Logo Badge', offset: [-6, 0], plane, depth: { value: 0.6, raised: false } });
    // The circle as drawn on screen, within its tessellation.
    spot?.box.forEach((value, i) => expect(value).toBeCloseTo([-4, -4, 4, 4][i] ?? NaN, 1));
    // Beside the drawing on the same face: no logo.
    expect(await logoAt(run, [30, 30, 10])).toBeNull();
  });

  it('plans centring and an exact move as one redefine per sketch, with the bodies for the ghost', async () => {
    const { run } = engine();
    const move = await planLogoMove(run, 'Badge', { by: [0, 2], centre: 'x' });
    expect(move.by).toEqual([6, 2]);
    expect(move.origin).toEqual([20, 22, 10]);
    expect(move.steps).toEqual([{ command: 'sketch.redefine', params: { sketch: 3, plane: { ...plane, origin: [20, 22, 10] } } }]);
    expect(move.face).toBe('F1:+z of Box');
    expect(move.bodies.sort()).toEqual(['Badge 1d71b8 1', 'Box']);
    await expect(planLogoMove(run, 'Nothing', { by: [1, 0] })).rejects.toThrow('placed logos: SVG-Logo Badge');
    // Only the depth: the logo's own extrusion, cut in as before; the other sketch's stays.
    expect((await planLogoMove(run, 'SVG-Logo Badge', { depth: 1.2 })).steps).toEqual([{ command: 'parameters.change', params: { name: 'd5', expression: '-1.2 mm' } }]);
  });

  it('turns a logo about its middle and reads its turn back from the plane', async () => {
    const { run } = engine();
    const move = await planLogoMove(run, 'Badge', { rotate: 90 });
    // A quarter left looking down on the top face: x runs along +y, y along −x; the middle stays.
    expect(move.steps).toEqual([{ command: 'sketch.redefine', params: { sketch: 3, plane: { origin: [14, 20, 10], x_dir: [0, 1, 0], y_dir: [-1, 0, 0] } } }]);
    expect(move.angle).toBe(90);
    expect(planeAngle(plane)).toBe(0);
    expect(planeAngle(rotatedPlane(plane, -30))).toBe(-30);
    // On a side face (normal −y) level is +x as planeAt places it; turning there keeps the normal.
    const side = { origin: [0, 0, 0] as Vec3, x_dir: [1, 0, 0] as Vec3, y_dir: [0, 0, 1] as Vec3 };
    const turned = rotatedPlane(side, 45);
    expect(planeAngle(turned)).toBe(45);
    expect(turned.x_dir[1]).toBe(0);
    expect(turned.y_dir[1]).toBe(0);
    expect((await logoAt(run, [16, 21, 9.4]))?.angle).toBe(0);
  });

  it('scales a logo about its middle to a new width, its fixed origin left out', async () => {
    const { run } = engine();
    // The circle is 8 mm across; 12 mm is 1.5 times that (within the tessellation).
    const move = await planLogoMove(run, 'Badge', { width: 12 });
    expect(move.steps.map((step) => step.command)).toEqual(['sketch.edit', 'sketch.transform', 'sketch.finish']);
    const transform = move.steps[1]?.params as { entities: string[]; factor: number; center: number[] };
    expect(transform.entities).toEqual(['c1']);
    expect(transform.center).toEqual([0, 0]);
    expect(transform.factor).toBeCloseTo(1.5, 2);
    // Scaled first, then moved: the move keeps its own steps after the scaling.
    expect((await planLogoMove(run, 'Badge', { width: 12, by: [1, 0] })).steps.map((step) => step.command)).toEqual(['sketch.edit', 'sketch.transform', 'sketch.finish', 'sketch.redefine']);
  });

  it('lets a logo arrow go below zero', () => {
    const handle = { origin: [0, 0, 0] as Vec3, direction: [1, 0, 0] as Vec3, perMm: 1, signed: true };
    expect(draggedValue(2, handle, { x: 4, y: 0 }, { x: -40, y: 0 }, false)).toBe(-8);
    expect(draggedValue(2, handle, { x: 4, y: 0 }, { x: -8, y: 0 }, false)).toBe(0);
  });
});

describe('changing a placed text', () => {
  // "Text PB" raised 0.6 mm on the same top face, set in Georgia 5 mm high.
  const textEngine = (): Run => (commands) =>
    Promise.resolve(
      commands.map(({ command, params }) => {
        switch (command) {
          case 'document.inspect':
            return { bodies: [{ name: 'Box', bbox: { min: [0, 0, 0], max: [40, 40, 10.6] } }], sketches: [{ id: 2, name: 'Text PB', plane }], timeline: [{ id: 3, type: 'EmbossFeature' }] };
          case 'timeline.inspect':
            return { type: 'emboss', inputs: [{ label: 'Depth', param: 'd4', expression: '0.6 mm' }], definition: { sketch: 2 } };
          case 'parameters.list':
            return { parameters: [{ name: 'd4', expression: '0.6 mm', value: 0.6 }] };
          case 'sketch.inspect':
            return {
              id: params.sketch,
              name: 'Text PB',
              plane,
              curves: [{ id: 'c1', type: 'circle', center_at: [0, 0], radius: 4 }],
              points: [],
              links: [{ id: 'j1', kind: 'text', source: { text: 'PB', height: 5, font: 'Georgia', at: [0, -2.5], style: { align: 'center' } } }],
            };
          default:
            return {};
        }
      }),
    );

  it('reads its words, font and height, and that it stands out of the face', async () => {
    const spot = await logoAt(textEngine(), [14, 20, 10.3]);
    expect(spot).toMatchObject({ logo: 'Text PB', text: { words: 'PB', height: 5, font: 'Georgia', bold: false }, depth: { value: 0.6, raised: true } });
  });

  it('changes words, height and font in its sketch, the baseline half a height below the middle', async () => {
    const move = await planLogoMove(textEngine(), 'Text PB', { text: { words: 'Hallo', height: 8, font: '', bold: false } });
    expect(move.steps).toEqual([
      { command: 'sketch.edit', params: { sketch: 2 } },
      { command: 'sketch.edit_text', params: { link: 'j1', text: 'Hallo', height: 8, at: [0, -4], font: '', bold: false } },
      { command: 'sketch.finish', params: {} },
    ]);
    // Its depth is the emboss's, set positive whether raised or engraved.
    expect((await planLogoMove(textEngine(), 'Text PB', { depth: 1.2 })).steps).toEqual([{ command: 'parameters.change', params: { name: 'd4', expression: '1.2 mm' } }]);
  });
});
