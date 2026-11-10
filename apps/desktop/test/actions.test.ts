import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ActionService, clearanceOf, commandOf } from '../src/main/solidcraft/actions';
import type { ControlRequester } from '../src/main/solidcraft/mirror';
import { actionsFor } from '../src/renderer/src/viewer/actionKinds';
import { dimensionFor, draggedValue, handleOf } from '../src/renderer/src/viewer/dimensionOf';
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

describe('the distance of two parallel faces in the dimension field', () => {
  it('measures along the normal and leaves out tilted faces, other bodies and the same face', () => {
    const face = (name: string, point: number[], planeNormal?: number[]) => ({ name, point, planeNormal });
    const faces = [face('F1:+z', [0, 0, 10], [0, 0, 1]), face('F2:-z', [5, 5, 4], [0, 0, -1]), face('F3:tilt', [0, 0, 0], [0, 0.6, 0.8]), face('F4:round', [0, 0, 0])];
    const bodies = [{ name: 'B', model: { table: { faces } } }, { name: 'C', model: { table: { faces } } }] as unknown as BodyModel[];
    const at = (index: number, body = 0): Pick => ({ kind: 'face', body, face: index, point: [0, 0, 0], normal: [0, 0, 1] });
    expect(dimensionFor(bodies, [at(0), at(1)])).toEqual({ shown: 'spacing', value: 6, target: { measure: 'distance', body: 'B', faces: ['F1:+z', 'F2:-z'] }, scale: 1 });
    expect(dimensionFor(bodies, [at(0), at(2)])).toBeNull();
    expect(dimensionFor(bodies, [at(0), at(3)])).toBeNull();
    expect(dimensionFor(bodies, [at(0), at(1, 1)])).toBeNull();
    expect(dimensionFor(bodies, [at(0), at(0)])).toBeNull();
  });
});

describe('the drag arrow of the dimension field', () => {
  it('points along the edge, out of a cylinder and away from the first face', () => {
    // Segments out of order: the arrow still goes to the far end.
    const edgeModel = { edgeRanges: Uint32Array.from([0, 3]), edgeSegments: Float32Array.from([0, 0, 0, 5, 0, 0, 12, 0, 0, 20, 0, 0, 5, 0, 0, 12, 0, 0]), table: { faces: [] } };
    const length = { shown: 'length' as const, value: 20, target: { measure: 'length' as const, body: 'B', edge: 'E', point: [10, 0, 0] as [number, number, number] }, scale: 1 };
    const edgePick: Pick = { kind: 'edge', body: 0, edge: 0, point: [10, 0, 0] };
    expect(handleOf([{ name: 'B', model: edgeModel }] as unknown as BodyModel[], [edgePick], length)).toEqual({ origin: [20, 0, 0], direction: [1, 0, 0], perMm: 1 });

    const hole = { name: 'F2:hole', point: [0, 0, 0], cylinder: { origin: [0, 0, 0], axis: [0, 0, 1], radius: 3 } };
    const holeBodies = [{ name: 'B', model: { table: { faces: [hole] } } }] as unknown as BodyModel[];
    const diameter = { shown: 'diameter' as const, value: 6, target: { measure: 'radius' as const, body: 'B', face: 'F2:hole' }, scale: 0.5 };
    const facePick: Pick = { kind: 'face', body: 0, face: 0, point: [0, 3, 7], normal: [0, -1, 0] };
    expect(handleOf(holeBodies, [facePick], diameter)).toEqual({ origin: [0, 3, 7], direction: [0, 1, 0], perMm: 2 });

    const faces = [
      { name: 'F1:+z', point: [0, 0, 10], planeNormal: [0, 0, 1] },
      { name: 'F1:-z', point: [0, 0, 0], planeNormal: [0, 0, -1] },
    ];
    const wallBodies = [{ name: 'B', model: { table: { faces } } }] as unknown as BodyModel[];
    const at = (face: number, z: number): Pick => ({ kind: 'face', body: 0, face, point: [1, 1, z], normal: [0, 0, 1] });
    const spacing = dimensionFor(wallBodies, [at(1, 0), at(0, 10)]);
    expect(spacing && handleOf(wallBodies, [at(1, 0), at(0, 10)], spacing)).toEqual({ origin: [1, 1, 10], direction: [0, 0, 1], perMm: 1 });
  });

  it('turns screen movement along the arrow into whole millimetres, or tenths', () => {
    const handle = { origin: [0, 0, 0] as [number, number, number], direction: [1, 0, 0] as [number, number, number], perMm: 1 };
    // 1 mm along the arrow is 4 px to the right on screen.
    expect(draggedValue(20, handle, { x: 4, y: 0 }, { x: 22, y: 30 }, false)).toBe(26);
    expect(draggedValue(20, handle, { x: 4, y: 0 }, { x: 22, y: 0 }, true)).toBe(25.5);
    expect(draggedValue(20, { ...handle, perMm: 2 }, { x: 4, y: 0 }, { x: -8, y: 0 }, false)).toBe(16);
    expect(draggedValue(2, handle, { x: 4, y: 0 }, { x: -40, y: 0 }, false)).toBeNull();
    expect(draggedValue(20, handle, { x: 0.1, y: 0.1 }, { x: 5, y: 5 }, false)).toBeNull();
  });
});

describe('function blocks on a body that moves with a joint (ADR 0027)', () => {
  const slot = [
    { command: 'sketch.create', params: { plane: { origin: [62, 15, 4], x_dir: [1, 0, 0], y_dir: [0, 1, 0] }, project_edges: false } },
    { command: 'sketch.slot.center_to_center', params: { p0: [-5, 0], p1: [5, 0], width: 4 } },
    { command: 'solid.extrude', params: { distance: '-1000 mm', operation: 'cut' } },
  ];
  // component.list as SolidCraft 0.40.0-rc.3 answers once a hinge joined the two plates.
  const listing = { components: [{ id: 0, parent: null, bodies: [] }, { id: 3, parent: 0, bodies: ['Base'] }, { id: 5, parent: 0, bodies: ['Flap'] }] };
  const service = (answer: unknown) => {
    const asked: string[] = [];
    const requester: ControlRequester = {
      request: <T>(_method: string, params: Record<string, unknown> = {}) => {
        const commands = params.commands as { command: string }[];
        asked.push(...commands.map((step) => step.command));
        return Promise.resolve({ completed: commands.length, results: commands.map(() => answer) } as T);
      },
    };
    return { actions: new ActionService(() => requester, tmpdir()), asked };
  };

  it('sketches with the body\'s component active, and goes back to the design level', async () => {
    const { actions } = service(listing);
    expect((await actions.inComponentOf('Flap', slot)).map((step) => (step.command === 'component.activate' ? `activate ${String(step.params.component)}` : step.command))).toEqual([
      'activate 5',
      'sketch.create',
      'sketch.slot.center_to_center',
      'solid.extrude',
      'activate 0',
    ]);
  });

  it('leaves the steps as they are for a body in the design itself, and does not ask for steps that pick by a point', async () => {
    const plain = service({ components: [{ id: 0, parent: null, bodies: ['Flap'] }] });
    expect(await plain.actions.inComponentOf('Flap', slot)).toEqual(slot);
    const picked = service(listing);
    const hole = [{ command: 'solid.hole', params: { position: [62, 15, 4], diameter: '3 mm' } }];
    expect(await picked.actions.inComponentOf('Flap', hole)).toEqual(hole);
    expect(picked.asked).toEqual([]);
  });
});
