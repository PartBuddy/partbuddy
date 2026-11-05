import { describe, expect, it } from 'vitest';

import { printFixSchema } from '../src/shared/contract';
import { PrintFixService, edgesOfFaces, filletOf } from '../src/main/solidcraft/printFixes';

/** A control channel that answers `timeline.inspect` with a fillet and records every batch. */
function fakeEngine(definition: Record<string, unknown>) {
  const batches: { commands: { command: string; params: Record<string, unknown> }[]; rollback: boolean }[] = [];
  const engine = {
    request: <T>(method: string, params: unknown): Promise<T> => {
      if (method !== 'engine.batch') throw new Error(method);
      const batch = params as (typeof batches)[number];
      batches.push(batch);
      const results = batch.commands.map((step) => (step.command === 'timeline.inspect' ? { type: 'fillet', definition } : {}));
      return Promise.resolve({ results } as T);
    },
  };
  return { engine, batches };
}

describe('fixes for support at the light (M7f)', () => {
  it('finds the fillet edges whose faces face the bed', () => {
    // A 40 × 30 × 10 box filleted on two bottom edges and two top edges; the faces sit next to their edge.
    const edges: [number, number, number][] = [[20, 0, 0], [20, 30, 0], [0, 15, 10], [40, 15, 10]];
    // Long thin triangles with corners only at the ends, as a straight fillet is tessellated.
    type T = [[number, number, number], [number, number, number], [number, number, number]];
    const front: T[] = [[[0, 0, 3], [40, 0, 3], [40, 3, 0]], [[0, 0, 3], [40, 3, 0], [0, 3, 0]]];
    const back: T[] = [[[0, 30, 3], [0, 27, 0], [40, 27, 0]], [[0, 30, 3], [40, 27, 0], [40, 30, 3]]];
    expect([...edgesOfFaces(edges, [front, back])].sort()).toEqual([0, 1]);
  });

  it('reads only fillets with one radius, given as points', () => {
    expect(filletOf({ type: 'fillet', definition: { edges: [[1, 2, 3]], radius: 'R_edge' } })).toEqual({ edges: [[1, 2, 3]], radius: 'R_edge' });
    expect(filletOf({ type: 'fillet', definition: { edges: [[1, 2, 3]], radius: 3 } }).radius).toBe('3 mm');
    expect(() => filletOf({ type: 'chamfer', definition: {} })).toThrow('no fillet');
    expect(() => filletOf({ type: 'fillet', definition: { edges: [{ body: 'B', index: 3 }], radius: '3' } })).toThrow('cannot follow');
    expect(() => filletOf({ type: 'fillet', definition: { type: 'variable', edges: [[1, 2, 3]], radius: '3' } })).toThrow('one radius');
  });

  it('keeps the other edges in the fillet and chamfers the ones facing the bed with its radius', async () => {
    const { engine, batches } = fakeEngine({ edges: [[20, 0, 0], [20, 30, 0], [0, 15, 10], [40, 15, 10]], radius: 'R_edge' });
    const service = new PrintFixService(() => engine, 'cache');
    const fix = printFixSchema.parse({ fix: 'chamfer', body: 'Plate', fillets: [{ feature: 2, faces: [[[[0, 0, 3], [40, 0, 3], [40, 3, 0]]], [[[0, 30, 3], [0, 27, 0], [40, 27, 0]]]] }] });
    await service.apply(fix);
    expect(batches[1]).toEqual({
      rollback: true,
      allow_paths: ['cache'],
      commands: [
        { command: 'timeline.edit', params: { feature: 2, set: { edges: [[0, 15, 10], [40, 15, 10]] } } },
        { command: 'solid.chamfer', params: { edges: [[20, 0, 0], [20, 30, 0]], distance: 'R_edge', body: 'Plate' } },
      ],
    });
    // All edges facing the bed: the fillet goes.
    const all = fakeEngine({ edges: [[20, 0, 0]], radius: '3' });
    await new PrintFixService(() => all.engine, 'cache').apply(printFixSchema.parse({ fix: 'chamfer', body: 'Plate', fillets: [{ feature: 4, faces: [[[[0, 0, 3], [40, 0, 3], [40, 3, 0]]]] }] }));
    expect(all.batches[1]?.commands[0]).toEqual({ command: 'timeline.delete', params: { feature: 4 } });
  });

  it('cuts a roof along a lying hole from a sketch at its start', async () => {
    const { engine, batches } = fakeEngine({});
    const roof = { origin: [0, 0, 14], xDir: [0, 1, 0], yDir: [0, 0, 1], points: [[0, 0], [5.6569, 5.6569], [3.3137, 8], [-3.3137, 8], [-5.6569, 5.6569]], length: 10 };
    await new PrintFixService(() => engine, 'cache').apply(printFixSchema.parse({ fix: 'roof', body: 'Holder', roofs: [roof] }));
    expect(batches[0]?.commands).toEqual([
      { command: 'sketch.create', params: { plane: { origin: [0, 0, 14], x_dir: [0, 1, 0], y_dir: [0, 0, 1] }, name: 'Print roof' } },
      { command: 'sketch.line', params: { points: roof.points, closed: true } },
      { command: 'solid.extrude', params: { distance: '10 mm', operation: 'cut', targets: ['Holder'], name: 'Print roof' } },
    ]);
    // The contract refuses what is no plane or no outline.
    expect(printFixSchema.safeParse({ fix: 'roof', body: 'Holder', roofs: [{ ...roof, xDir: [0, 2, 0] }] }).success).toBe(false);
    expect(printFixSchema.safeParse({ fix: 'roof', body: 'Holder', roofs: [{ ...roof, points: [[0, 0], [1, 1]] }] }).success).toBe(false);
  });
});
