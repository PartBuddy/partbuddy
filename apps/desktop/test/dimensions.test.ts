import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { candidatesFor, DimensionService, featureIds, measured, nearFirst, type Parameter } from '../src/main/solidcraft/dimensions';
import type { ControlRequester } from '../src/main/solidcraft/mirror';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The steps of a batch after the design read a try starts with (DimensionService.attempt). */
const own = (call: { commands: { command: string; params: Record<string, unknown> }[] }) =>
  call.commands[0]?.command === 'parameters.list' && call.commands[1]?.command === 'document.inspect' && call.commands.length > 2 ? call.commands.slice(2) : call.commands;

const param = (name: string, value: number, expression = String(value), unit = 'mm'): Parameter => ({ name, value, expression, unit, feature: 'Box1', input: name });

/**
 * A box in the shape SolidCraft answers: d1 length (x), d2 width (y), d3 height (z), optional
 * extra parameters. A batch whose last step reads a missing sketch fails there and undoes itself.
 */
function boxEngine(values: Record<string, number>, extra: Parameter[] = []) {
  const calls: { commands: { command: string; params: Record<string, unknown> }[]; rollback: unknown }[] = [];
  const state = { ...values };
  const suppressed: Record<string, boolean> = {};
  const edges = (v: Record<string, number>) => {
    // `sym`, when there, moves the x edge as well (a second driver, as a symmetric extrude has).
    // `opp` moves it the other way (a size subtracted, as a cut from the end has).
    const [x, y, z] = [(v.d1 ?? 0) + (v.sym ?? 20) - 20 - ((v.opp ?? 20) - 20), v.d2 ?? 0, v.d3 ?? 0];
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
            // One parameter, or several at once (`changes`: name → expression, as SolidCraft 0.40.1 takes it).
            for (const [name, expression] of Object.entries((step.params.changes as Record<string, string> | undefined) ?? { [step.params.name as string]: step.params.expression }))
              working[name] = Number.parseFloat(String(expression));
            results.push({ name: step.params.name });
            break;
          case 'model.edges':
            results.push(edges(working));
            break;
          case 'document.inspect':
            results.push({ timeline: [{ id: 1, name: 'Box1', suppressed: suppressed.Box1 === true, rolled_back: false }], marker: 1 });
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
  return { service: new DimensionService(() => requester, cache), calls, state, suppressed, requester };
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

  it('tries every parameter of the same value, the driver also when it comes tenth (audit D45)', async () => {
    // Nine sizes of 20 mm come before the length in SolidCraft's order; a cap of eight left d1 out.
    const others = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${String(i)}`, 20]));
    const { service, calls } = boxEngine({ ...others, d1: 20, d2: 5, d3: 10 });
    expect(await service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 5, 0] }, 20, 30)).toMatchObject({ mode: 'direct', parameter: 'd1' });
    // The design, five rebuilds instead of ten tries, and the preview: all ten moved a little at once (the edge moves),
    // p0–p4 (stays), so p5–p8 and d1 move: p5–p7 (stays), so p8 or d1: each tried with the value, d1 brings it to 30.
    expect(calls.map((call) => own(call)[0]?.command === 'parameters.change' ? Object.keys((own(call)[0]?.params.changes as object | undefined) ?? { [String(own(call)[0]?.params.name)]: 0 }).join(' ') : own(call)[0]?.command)).toEqual([
      'parameters.list',
      'p0 p1 p2 p3 p4 p5 p6 p7 p8 d1',
      'p0 p1 p2 p3 p4',
      'p5 p6 p7',
      'p8',
      'd1',
      'd1',
    ]);
  });

  it('tells a group apart in one rebuild, each member moved by its own step, and tries the selection\'s features first', async () => {
    const { service, calls } = boxEngine({ d1: 20, d2: 20, d3: 10 }, [{ ...param('vent', 20), feature: 'Vent' }, { name: 'wall', value: 20, expression: '20 mm', unit: 'mm', used_by: ['d9'] }, { ...param('d9', 3), feature: 'Vent' }]);
    // The edge lies on Box1 (F1): its parameters first, then the vent's and the user parameter the vent uses.
    await service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 20, 0] }, 20, 30);
    const group = own(calls[1] ?? { commands: [] })[0]?.params.changes as Record<string, string>;
    expect(Object.keys(group)).toEqual(['d1', 'd2']);
    // 20 + 0.05 · (1 + √2 / 10) and 20 + 0.05 · (1 + √3 / 10): no two steps alike.
    expect(group).toEqual({ d1: '20.057071 mm', d2: '20.05866 mm' });
    const ofVent = { parameter: { ...param('vent', 20), feature: 'Vent' }, factor: 1 as const };
    const ofOther = { parameter: { ...param('x', 20), feature: 'Other' }, factor: 1 as const };
    expect(nearFirst([ofOther, ofVent], { measure: 'radius', body: 'B', face: 'F12:side' }, [], [{ id: 12, name: 'Vent' }]).map((list) => list.map((c) => c.parameter.name))).toEqual([['vent'], [], ['x']]);
    // A user parameter counts as near when a parameter of such a feature uses it.
    const wall = { name: 'wall', value: 2, expression: '2 mm', unit: 'mm', used_by: ['d9'] };
    expect(nearFirst([{ parameter: wall, factor: 1 }], { measure: 'distance', body: 'B', faces: ['F12:+x', 'F3:-x'] }, [wall, { ...param('d9', 3), feature: 'Vent' }], [{ id: 12, name: 'Vent' }])[1]).toHaveLength(1);
    expect(featureIds({ measure: 'length', body: 'B', edge: 'F12:bore:side:0|F1:+z~2', point: [0, 0, 0] })).toEqual(new Set([12, 1]));
  });

  it('answers with the first driver and searches the rest afterwards, one step at a time, until another selection is probed', async () => {
    const steps: (() => Promise<boolean>)[] = [];
    const { calls, requester } = boxEngine({ d1: 20, d2: 20, d3: 10, sym: 20 });
    const service = new DimensionService(() => requester, tmpdir(), (step) => steps.push(step));
    const target = { measure: 'length' as const, body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 20, 0] as [number, number, number] };
    expect(await service.probe(target, 20, 30)).toMatchObject({ mode: 'direct', parameter: 'd1' });
    expect(steps).toHaveLength(1);
    // The rest: d2 and sym, a step per rebuild, as long as the step says there is more.
    const step = steps[0] as () => Promise<boolean>;
    while (await step());
    calls.length = 0;
    // The next value of the same selection knows both drivers: the user picks.
    expect(await service.probe(target, 20, 31)).toMatchObject({ mode: 'choice' });
    expect(calls).toHaveLength(1);
    // Another selection probed: the search of the first stops at its next step.
    const other = boxEngine({ d1: 20, d2: 20, d3: 10, sym: 20 });
    const later: (() => Promise<boolean>)[] = [];
    const second = new DimensionService(() => other.requester, tmpdir(), (s) => later.push(s));
    await second.probe(target, 20, 30);
    await second.probe({ ...target, edge: 'F1:+x|F1:-z' }, 20, 30);
    other.calls.length = 0;
    expect(await later[0]?.()).toBe(false);
    expect(other.calls.filter((call) => call.rollback === true)).toHaveLength(0);
  });

  it('keeps the drivers of a selection for the next value typed, until the design or its size changes (review of BC-08, S3)', async () => {
    const others = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${String(i)}`, 20]));
    const { service, calls, state, suppressed } = boxEngine({ ...others, d1: 20, d2: 5, d3: 10 });
    const target = { measure: 'length' as const, body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 5, 0] as [number, number, number] };
    expect(await service.probe(target, 20, 30)).toMatchObject({ mode: 'direct', parameter: 'd1' });
    const tries = () => calls.filter((call) => own(call)[0]?.command === 'parameters.change' && own(call)[1]?.command !== 'file.export').length;
    expect(tries()).toBe(5);
    // The next value: the design read once and the preview, no try.
    calls.length = 0;
    expect(await service.probe(target, 20, 31)).toMatchObject({ mode: 'direct', parameter: 'd1' });
    expect(tries()).toBe(0);
    expect(calls).toHaveLength(2);
    // A feature suppressed in the timeline: the design is another, all are tried again.
    suppressed.Box1 = true;
    await service.probe(target, 20, 32);
    expect(tries()).toBe(5);
    // Another size of the same selection (after a change): tried again too.
    suppressed.Box1 = false;
    state.d1 = 25;
    calls.length = 0;
    await service.probe(target, 25, 30);
    expect(tries()).toBe(1);
  });

  it('tries a candidate SolidCraft refused at one value again at the next', async () => {
    // d1 drives, but SolidCraft refuses 40 mm for it (a range of the design): first noDriver, then found at 30.
    const { service } = boxEngine({ d1: 20, d2: 5, d3: 10 });
    const refusing = service as unknown as { batch: (commands: { command: string; params: Record<string, unknown> }[], rollback: boolean) => Promise<unknown> };
    const batch = refusing.batch.bind(service);
    // As SolidCraft answers: the design read before the refused change, then the failure at the change.
    refusing.batch = async (commands, rollback) =>
      commands[2]?.command === 'parameters.change' && commands[2].params.expression === '40 mm'
        ? { results: ((await batch(commands.slice(0, 2), false)) as { results: unknown[] }).results, failed: { index: 2, command: 'parameters.change', error: 'out of range' } }
        : batch(commands, rollback);
    const target = { measure: 'length' as const, body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 5, 0] as [number, number, number] };
    expect(await service.probe(target, 20, 40)).toEqual({ mode: 'assistant', reason: 'noDriver' });
    expect(await service.probe(target, 20, 30)).toMatchObject({ mode: 'direct', parameter: 'd1' });
  });

  it('finds a driver in a group whose other member moves the edge the other way by nearly as much (review of BC-08, S1)', async () => {
    // d1 is the 10th candidate (prime 29), opp the 11th (31): moved together they shorten the edge by 0.005 · (√31 − √29) = 0.00091 mm.
    const others = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${String(i)}`, 20]));
    const { service } = boxEngine({ ...others, d1: 20, d2: 5, d3: 10, opp: 20 });
    expect(await service.probe({ measure: 'length', body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 5, 0] }, 20, 30)).toMatchObject({ mode: 'direct', parameter: 'd1' });
  });

  it('reads the design in the batch of every try and drops a search whose design another call changed (review of BC-08, S2)', async () => {
    const steps: (() => Promise<boolean>)[] = [];
    const { calls, requester, state } = boxEngine({ d1: 20, d2: 20, d3: 10, sym: 20 });
    const service = new DimensionService(() => requester, tmpdir(), (step) => steps.push(step));
    const target = { measure: 'length' as const, body: 'Body1', edge: 'F1:+y|F1:-z', point: [10, 20, 0] as [number, number, number] };
    expect(await service.probe(target, 20, 30)).toMatchObject({ mode: 'direct', parameter: 'd1' });
    // The preview, built once the driver is known, is no try.
    for (const call of calls.filter((entry) => entry.rollback === true && !entry.commands.some((step) => step.command === 'file.export'))) expect(call.commands.slice(0, 2).map((step) => step.command)).toEqual(['parameters.list', 'document.inspect']);
    // The assistant changes the design before the search goes on: the next step tries nothing it would keep, and stops.
    state.d3 = 12;
    expect(await steps[0]?.()).toBe(false);
    calls.length = 0;
    state.d3 = 10;
    // Back to the old design (an undo): the search starts again instead of trusting what the stopped one held.
    expect(await service.probe(target, 20, 31)).toMatchObject({ mode: 'direct', parameter: 'd1' });
    expect(calls.filter((call) => call.rollback === true).length).toBeGreaterThan(1);
    // Changed while the answer is still searched: no answer from a design that is gone.
    const moving = boxEngine({ d1: 20, d2: 20, d3: 10 });
    let tries = 0;
    const changing: ControlRequester = {
      request: <T>(method: string, params?: Record<string, unknown>) => {
        if (params?.rollback === true && ++tries === 2) moving.state.d3 = 11;
        return moving.requester.request<T>(method, params);
      },
    };
    await expect(new DimensionService(() => changing, tmpdir()).probe(target, 20, 30)).rejects.toThrow(/design changed/);
    // Changed just before the preview: no preview of another design as the answer (review of c367a71, S-c).
    const late = boxEngine({ d1: 20, d2: 20, d3: 10 });
    const beforePreview: ControlRequester = {
      request: <T>(method: string, params?: Record<string, unknown>) => {
        if ((params?.commands as { command: string }[] | undefined)?.some((step) => step.command === 'file.export')) late.state.d3 = 11;
        return late.requester.request<T>(method, params);
      },
    };
    await expect(new DimensionService(() => beforePreview, tmpdir()).probe(target, 20, 30)).rejects.toThrow(/design changed/);
    // SolidCraft fails to read the design: its own error, not "changed".
    const unreadable: ControlRequester = {
      request: <T>(method: string, params?: Record<string, unknown>) =>
        params?.rollback === true ? Promise.resolve({ results: [], failed: { index: 0, command: 'parameters.list', error: 'busy' } } as T) : late.requester.request<T>(method, params),
    };
    await expect(new DimensionService(() => unreadable, tmpdir()).probe(target, 20, 30)).rejects.toThrow(/could not read the design: busy/);
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
