import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ActionService, clearanceOf, commandOf } from '../src/main/solidcraft/actions';
import type { ControlRequester } from '../src/main/solidcraft/mirror';
import { actionsFor } from '../src/renderer/src/viewer/actionKinds';
import type { BodyModel, Pick } from '../src/renderer/src/state/store';
import { designActionSchema } from '../src/shared/contract';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function engine(refuse?: string) {
  const calls: { command: string; params: Record<string, unknown> }[][] = [];
  const requester: ControlRequester = {
    request: <T>(_method: string, params: Record<string, unknown> = {}) => {
      const commands = params.commands as { command: string; params: Record<string, unknown> }[];
      calls.push(commands);
      const results: unknown[] = [];
      for (const [index, step] of commands.entries()) {
        if (step.command === refuse) return Promise.resolve({ completed: index, results, failed: { index, command: step.command, error: 'radius too large' } } as T);
        if (step.command === 'file.export') writeFileSync(String(step.params.path), 'ghost');
        if (step.command === 'sketch.inspect') return Promise.resolve({ completed: index, results, failed: { index, command: step.command, error: 'no sketch' } } as T);
        results.push(step.command === 'inspect.measure' ? { distance_mm: 40, angle_deg: 180 } : {});
      }
      return Promise.resolve({ completed: results.length, results } as T);
    },
  };
  const cache = mkdtempSync(join(tmpdir(), 'partbuddy-actions-'));
  dirs.push(cache);
  return { service: new ActionService(() => requester, cache), calls };
}

describe('actions at the selection (M1b-2)', () => {
  it('maps each action to one SolidCraft command with points and mm', () => {
    expect(commandOf({ action: 'fillet', body: 'B', points: [[40, 0, 5]], size: 2 })).toEqual({ command: 'solid.fillet', params: { edges: [[40, 0, 5]], radius: '2 mm' } });
    expect(commandOf({ action: 'chamfer', body: 'B', points: [[1, 2, 3]], size: 0.5 })).toEqual({ command: 'solid.chamfer', params: { edges: [[1, 2, 3]], distance: '0.5 mm' } });
    expect(commandOf({ action: 'extrude', body: 'B', points: [[20, 10, 10]], size: -3 })).toEqual({ command: 'solid.press_pull', params: { face: [20, 10, 10], distance: '-3 mm' } });
    expect(commandOf({ action: 'hole', body: 'B', points: [[20, 10, 10]], size: 4, depth: 6 })).toEqual({ command: 'solid.hole', params: { position: [20, 10, 10], diameter: '4 mm', depth: '6 mm' } });
    expect(commandOf({ action: 'shell', body: 'B', points: [[20, 10, 10]], size: 1.6 })).toEqual({ command: 'solid.shell', params: { faces: [[20, 10, 10]], thickness: '1.6 mm' } });
  });

  it('previews with an export and the failing read, and reports a refusal as text', async () => {
    const ok = engine();
    const preview = await ok.service.preview({ action: 'fillet', body: 'B', points: [[0, 0, 0]], size: 1 });
    expect(preview.ok && new TextDecoder().decode(preview.preview ?? new Uint8Array())).toBe('ghost');
    expect(ok.calls[0]?.map((step) => step.command)).toEqual(['solid.fillet', 'file.export', 'sketch.inspect']);
    const refused = engine('solid.fillet');
    expect(await refused.service.preview({ action: 'fillet', body: 'B', points: [[0, 0, 0]], size: 50 })).toEqual({ ok: false, error: 'radius too large' });
    await expect(refused.service.apply({ action: 'fillet', body: 'B', points: [[0, 0, 0]], size: 50 })).rejects.toThrow(/radius too large/);
  });

  it('measures distance and angle between two selections', async () => {
    const { service } = engine();
    expect(await service.measure([{ type: 'face', body: 'B', point: [0, 10, 5] }, { type: 'face', body: 'B', point: [40, 10, 5] }])).toEqual({ distance: 40, angle: 180 });
  });

  it('refuses actions the contract does not allow', () => {
    expect(designActionSchema.safeParse({ action: 'extrude', body: 'B', points: [[0, 0, 0]], size: 0 }).success).toBe(false);
    expect(designActionSchema.safeParse({ action: 'fillet', body: 'B', points: [], size: 1 }).success).toBe(false);
    expect(designActionSchema.safeParse({ action: 'hole', body: 'B', points: [[0, 0, 0], [1, 1, 1]], size: 3 }).success).toBe(false);
    expect(designActionSchema.safeParse({ action: 'delete', body: 'B', points: [[0, 0, 0]], size: 1 }).success).toBe(false);
  });

  it('offers only actions that fit everything selected', () => {
    const face = (planar: boolean) => ({ name: 'F', planeNormal: planar ? [0, 0, 1] : undefined });
    const bodies = [{ name: 'B', model: { table: { faces: [face(true), face(false)] } } }, { name: 'C', model: { table: { faces: [] } } }] as unknown as BodyModel[];
    const edge = (body = 0): Pick => ({ kind: 'edge', body, edge: 0, point: [0, 0, 0] });
    const faceAt = (index: number): Pick => ({ kind: 'face', body: 0, face: index, point: [0, 0, 0], normal: [0, 0, 1] });
    expect(actionsFor(bodies, [edge(), edge()])).toEqual(['fillet', 'chamfer']);
    expect(actionsFor(bodies, [faceAt(0)])).toEqual(['extrude', 'hole', 'shell']);
    expect(actionsFor(bodies, [faceAt(1)])).toEqual(['shell']);
    expect(actionsFor(bodies, [faceAt(0), faceAt(1)])).toEqual(['shell']);
    expect(actionsFor(bodies, [edge(), faceAt(0)])).toEqual([]);
    expect(actionsFor(bodies, [edge(0), edge(1)])).toEqual([]);
    expect(actionsFor(bodies, [{ kind: 'vertex', body: 0, vertex: 0, point: [0, 0, 0] }])).toEqual([]);
  });
});

describe('the clearance between bodies as SolidCraft measures it (F2)', () => {
  it('keeps overlaps and near pairs, and leaves out what does not fit the contract', () => {
    const measured = clearanceOf({
      overlaps: [
        { a: 'A', b: 'B', volume_mm3: 100, area_mm2: 240, bbox: { min: [9, 0, 0], max: [10, 10, 10] }, center: [9.5, 5, 5] },
        { a: 'A', b: 'B', volume_mm3: 'much', bbox: { min: [0, 0, 0], max: [1, 1, 1] } },
      ],
      near: [
        { a: 'A', b: 'C', distance_mm: 0.1, from: [0, 10, 10], to: [0, 10.1, 10] },
        { a: 'A', b: null, distance_mm: 0.1, from: [0, 0, 0], to: [0, 0, 0] },
      ],
      unchecked: [{ a: 'Mesh', b: null, reason: 'mesh body: not checked' }],
    });
    expect(measured).toEqual({
      overlaps: [{ a: 'A', b: 'B', volume: 100, box: { min: [9, 0, 0], max: [10, 10, 10] } }],
      near: [{ a: 'A', b: 'C', distance: 0.1, from: [0, 10, 10], to: [0, 10.1, 10] }],
    });
    expect(clearanceOf(null)).toEqual({ overlaps: [], near: [] });
  });
});
