import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { candidatesFor, DimensionService, measured, type Parameter } from '../src/main/solidcraft/dimensions';
import type { ControlRequester } from '../src/main/solidcraft/mirror';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const param = (name: string, value: number, expression = String(value), unit = 'mm'): Parameter => ({ name, value, expression, unit, feature: 'Box1', input: name });

/**
 * A box in the shape SolidCraft answers: d1 length (x), d2 width (y), d3 height (z), optional
 * extra parameters. A batch whose last step reads a missing sketch fails there and undoes itself.
 */
function boxEngine(values: Record<string, number>, extra: Parameter[] = []) {
  const calls: { commands: { command: string; params: Record<string, unknown> }[]; rollback: unknown }[] = [];
  const state = { ...values };
  const edges = (v: Record<string, number>) => {
    // `sym`, when there, moves the x edge as well (a second driver, as a symmetric extrude has).
    const [x, y, z] = [(v.d1 ?? 0) + (v.sym ?? 20) - 20, v.d2 ?? 0, v.d3 ?? 0];
    return {
      body: 'Body1',
      edges: [
        { name: 'F1:+y|F1:-z', length: x, mid: [x / 2, y, 0] },
        { name: 'F1:+x|F1:-z', length: y, mid: [x, y / 2, 0] },
        { name: 'F1:+x|F1:-y', length: z, mid: [x, 0, z / 2] },
      ],
    };
  };
  const requester: ControlRequester = {
    request: <T>(method: string, params: Record<string, unknown> = {}) => {
      if (method !== 'engine.batch') throw new Error(method);
      const commands = params.commands as { command: string; params: Record<string, unknown> }[];
      calls.push({ commands, rollback: params.rollback });
      const working = { ...state };
      const results: unknown[] = [];
      for (const [index, step] of commands.entries()) {
        switch (step.command) {
          case 'parameters.list':
            results.push({ parameters: [...Object.entries(working).map(([name, value]) => param(name, value)), ...extra] });
            break;
          case 'parameters.change':
            working[step.params.name as string] = Number.parseFloat(String(step.params.expression));
            results.push({ name: step.params.name });
            break;
          case 'model.edges':
            results.push(edges(working));
            break;
          case 'file.export':
            writeFileSync(String(step.params.path), `ghost ${JSON.stringify(working)}`);
            results.push({ path: step.params.path });
            break;
          case 'sketch.inspect':
            return Promise.resolve({ completed: index, results, failed: { index, command: step.command, error: 'no sketch' }, rolled_back: true } as T);
          default:
            throw new Error(step.command);
        }
      }
      Object.assign(state, working);
      return Promise.resolve({ completed: results.length, results } as T);
    },
  };
  const cache = mkdtempSync(join(tmpdir(), 'partbuddy-dimensions-'));
  dirs.push(cache);
  return { service: new DimensionService(() => requester, cache), calls, state };
}

describe('dimension field: direct where unambiguous (M1b)', () => {
  it('takes only plain lengths as candidates, and a diameter for a radius', () => {
    const parameters = [param('d1', 10), param('d2', 10, 'w / 2'), param('d3', 10, '10', 'deg'), param('d4', 20), param('d5', 10, '10 mm')];
    expect(candidatesFor(parameters, 10, 'length').map((c) => c.parameter.name)).toEqual(['d1', 'd5']);
    expect(candidatesFor(parameters, 10, 'radius').map((c) => [c.parameter.name, c.factor])).toEqual([
      ['d1', 1],
      ['d4', 2],
      ['d5', 1],
    ]);
  });

  it('finds the one parameter that moves the edge, previews it and changes nothing', async () => {
    // Length and width are both 20: only trying tells which one drives the x edge.
    const { service, calls, state } = boxEngine({ d1: 20, d2: 20, d3: 10 });
    const result = await service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 20, 0] }, 20, 30);
    expect(result).toMatchObject({ mode: 'direct', parameter: 'd1', factor: 1, label: 'Box1 · d1' });
    expect(new TextDecoder().decode((result as { preview: Uint8Array }).preview)).toContain('"d1":30');
    expect(state).toEqual({ d1: 20, d2: 20, d3: 10 });
    // Every try ends with the failing read that makes SolidCraft undo the batch.
    for (const call of calls.slice(1)) {
      expect(call.commands.at(-1)?.command).toBe('sketch.inspect');
      expect(call.rollback).toBe(true);
    }
  });

  it('lets the user pick when several parameters each move the edge', async () => {
    const { service, state } = boxEngine({ d1: 20, d2: 20, d3: 10, sym: 20 });
    expect(await service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 20, 0] }, 20, 30)).toEqual({
      mode: 'choice',
      options: [
        { parameter: 'd1', factor: 1, label: 'Box1 · d1' },
        { parameter: 'sym', factor: 1, label: 'Box1 · sym' },
      ],
    });
    expect(state).toEqual({ d1: 20, d2: 20, d3: 10, sym: 20 });
  });

  it('leaves it to the assistant when no parameter drives the edge', async () => {
    const none = boxEngine({ d1: 40, d2: 20, d3: 10 });
    expect(await none.service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+y|F1:-z', point: [0, 0, 0] }, 33, 35)).toEqual({ mode: 'assistant', reason: 'noDriver' });
    // A formula drives the height: PartBuddy does not overwrite the designer's intent.
    const formula = boxEngine({ d1: 40, d2: 20 }, [param('d3', 10, 'd2 / 2')]);
    expect(await formula.service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+x|F1:-y', point: [40, 0, 5] }, 10, 12)).toEqual({ mode: 'assistant', reason: 'noDriver' });
  });

  it('applies only a plain length parameter, with the factor of a diameter', async () => {
    const { service, state } = boxEngine({ d1: 40, d2: 20, d3: 10 }, [param('w', 8, 'd1 / 5')]);
    await service.apply('d3', 12.5, 1);
    expect(state.d3).toBe(12.5);
    await service.apply('d2', 11, 2);
    expect(state.d2).toBe(22);
    await expect(service.apply('w', 9, 1)).rejects.toThrow(/not a plain length/);
    await expect(service.apply('missing', 9, 1)).rejects.toThrow(/not a plain length/);
    await expect(service.apply('d1', -1, 1)).rejects.toThrow(/positive/);
  });

  it('makes a snapped size the user\'s when the user sets it; a refit keeps the mark (2026-11-07)', async () => {
    const { service, calls } = boxEngine({ d1: 40, d2: 20, d3: 10 }, [{ ...param('wall', 1.35), comment: 'Wall [auto 3×line]' }]);
    await service.apply('wall', 2, 1);
    expect(calls.at(-1)?.commands).toEqual([{ command: 'parameters.change', params: { name: 'wall', expression: '2 mm', comment: 'Wall' } }]);
    await service.apply('wall', 2.025, 1, true);
    expect(calls.at(-1)?.commands).toEqual([{ command: 'parameters.change', params: { name: 'wall', expression: '2.025 mm' } }]);
    // A size without the mark keeps its comment untouched.
    await service.apply('d1', 41, 1);
    expect(calls.at(-1)?.commands[0]?.params).not.toHaveProperty('comment');
  });

  it('measures the edge nearest the pick when two faces meet more than once', () => {
    const result = {
      edges: [
        { name: 'F2:side|F2:top', length: 5, mid: [0, 0, 0] },
        { name: 'F2:side|F2:top~1', length: 7, mid: [10, 0, 0] },
      ],
    };
    expect(measured({ measure: 'length', body: 'B', edge: 'F2:side|F2:top', point: [9, 0, 0] }, result)).toBe(7);
    expect(measured({ measure: 'radius', body: 'B', face: 'F3:hole' }, { faces: [{ name: 'F3:hole', cylinder: { radius: 2.5 } }] })).toBe(2.5);
    expect(measured({ measure: 'radius', body: 'B', face: 'F3:hole' }, { faces: [{ name: 'F3:hole', cylinder: null }] })).toBeNull();
    const wall = { measure: 'distance' as const, body: 'B', faces: ['F1:+x', 'F4:-x'] as [string, string] };
    const faces = (normal: number[]) => ({
      faces: [
        { name: 'F1:+x', point: [20, 3, 4], plane_normal: [1, 0, 0] },
        { name: 'F4:-x', point: [17.5, 9, 1], plane_normal: normal },
      ],
    });
    expect(measured(wall, faces([-1, 0, 0]))).toBeCloseTo(2.5);
    // Faces that tilt apart have no single distance.
    expect(measured(wall, faces([-0.99, 0.141, 0]))).toBeNull();
    expect(measured(wall, { faces: [{ name: 'F1:+x', point: [20, 3, 4], plane_normal: [1, 0, 0] }] })).toBeNull();
  });
});

describe('parameter panel (UI upgrade step 6)', () => {
  const user = (name: string, expression: string, value: number, extra: Record<string, unknown> = {}) =>
    ({ name, expression, value, unit: 'mm', source: 'user', comment: '', favorite: false, error: null, used_by: [], ...extra }) as unknown as Parameter;

  it('lists only user parameters, favourites first, and marks plain lengths as editable', async () => {
    const { service } = boxEngine({ d1: 40 }, [
      user('wand', 'breite / 10', 4, { used_by: ['d3'] }),
      user('breite', '40 mm', 40, { favorite: true, comment: 'Plate width [30..60]', used_by: ['d1', 'wand'] }),
      user('winkel', '30 deg', 30, { unit: 'deg' }),
      user('bad name', '1', 1),
    ]);
    const list = await service.userParameters();
    expect(list.map((entry) => entry.name)).toEqual(['breite', 'wand', 'winkel']);
    expect(list[0]).toMatchObject({ favorite: true, comment: 'Plate width [30..60]', usedBy: 2, editable: true, error: null });
    expect(list[1]).toMatchObject({ expression: 'breite / 10', editable: false });
    expect(list[2]).toMatchObject({ unit: 'deg', editable: false });
  });
});
