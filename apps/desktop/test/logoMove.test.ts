import { describe, expect, it } from 'vitest';

import { logoAt, planLogoMove, type Run } from '../src/main/solidcraft/logoMove';
import { draggedValue } from '../src/renderer/src/viewer/dimensionOf';

type Vec3 = [number, number, number];
const line = (name: string, start: Vec3, end: Vec3) => ({ name, start, end, mid: start.map((value, i) => (value + (end[i] ?? 0)) / 2), length: Math.hypot(...start.map((value, i) => value - (end[i] ?? 0))) });

// A 40 × 40 × 10 box with a logo 8 mm across ("Logo Badge"), its middle at (14, 20) on the top face: 6 mm left of the face's middle.
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
          sketches: [{ id: 3, name: 'Logo Badge', plane }, { id: 4, name: 'Sketch1', plane }],
        };
      case 'sketch.inspect':
        return { id: params.sketch, name: 'Logo Badge', plane, curves: [{ id: 'c1', type: 'circle', center_at: [0, 0], radius: 4 }] };
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
    expect(spot).toMatchObject({ logo: 'Logo Badge', offset: [-6, 0], plane });
    // The circle as drawn on screen, within its tessellation.
    spot?.box.forEach((value, i) => expect(value).toBeCloseTo([-4, -4, 4, 4][i] ?? NaN, 1));
    // Beside the drawing on the same face: no logo.
    expect(await logoAt(run, [30, 30, 10])).toBeNull();
  });

  it('plans centring and an exact move as one redefine per sketch, with the bodies for the ghost', async () => {
    const { run } = engine();
    const move = await planLogoMove(run, 'Badge', [0, 2], 'x');
    expect(move.by).toEqual([6, 2]);
    expect(move.origin).toEqual([20, 22, 10]);
    expect(move.steps).toEqual([{ command: 'sketch.redefine', params: { sketch: 3, plane: { ...plane, origin: [20, 22, 10] } } }]);
    expect(move.face).toBe('F1:+z of Box');
    expect(move.bodies.sort()).toEqual(['Badge 1d71b8 1', 'Box']);
    await expect(planLogoMove(run, 'Nothing', [1, 0], null)).rejects.toThrow('placed logos: Logo Badge');
  });

  it('lets a logo arrow go below zero', () => {
    const handle = { origin: [0, 0, 0] as Vec3, direction: [1, 0, 0] as Vec3, perMm: 1, signed: true };
    expect(draggedValue(2, handle, { x: 4, y: 0 }, { x: -40, y: 0 }, false)).toBe(-8);
    expect(draggedValue(2, handle, { x: 4, y: 0 }, { x: -8, y: 0 }, false)).toBe(0);
  });
});
