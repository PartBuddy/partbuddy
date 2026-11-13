import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ActionService, clearanceOf, commandOf } from '../src/main/solidcraft/actions';
import type { ControlRequester } from '../src/main/solidcraft/mirror';
import { actionPlan, actionPrint, actionsFor, bedOf, downEdges, startSize, type ActionPrint } from '../src/renderer/src/viewer/actionKinds';
import { dimensionFor, draggedValue, handleOf } from '../src/renderer/src/viewer/dimensionOf';
import type { BodyModel, Pick } from '../src/renderer/src/state/store';
import { designActionSchema } from '../src/shared/contract';
import type { FeatureBlock } from '../src/shared/blocks';

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
  it('maps each action to one SolidCraft command with points and mm, on the picked body alone (audit G6)', () => {
    // The parameter each command takes for its body, measured with SolidCraft 0.40.1 on two boxes that share an edge and a face.
    expect(commandOf({ action: 'fillet', body: 'B', points: [[40, 0, 5]], size: 2 })).toEqual({ command: 'solid.fillet', params: { edges: [[40, 0, 5]], radius: '2 mm', body: 'B' } });
    expect(commandOf({ action: 'chamfer', body: 'B', points: [[1, 2, 3]], size: 0.5 })).toEqual({ command: 'solid.chamfer', params: { edges: [[1, 2, 3]], distance: '0.5 mm', body: 'B' } });
    expect(commandOf({ action: 'extrude', body: 'B', points: [[20, 10, 10]], size: -3 })).toEqual({
      command: 'solid.extrude',
      params: { face: [20, 10, 10], face_body: 'B', distance: '-3 mm', operation: 'cut', targets: ['B'] },
    });
    expect(commandOf({ action: 'extrude', body: 'B', points: [[20, 10, 10]], size: 2 }).params).toMatchObject({ distance: '2 mm', operation: 'join', targets: ['B'] });
    expect(commandOf({ action: 'hole', body: 'B', points: [[20, 10, 10]], size: 4, depth: 6 })).toEqual({ command: 'solid.hole', params: { position: [20, 10, 10], diameter: '4 mm', depth: '6 mm', targets: ['B'] } });
    expect(commandOf({ action: 'shell', body: 'B', points: [[20, 10, 10]], size: 1.6 })).toEqual({ command: 'solid.shell', params: { faces: [[20, 10, 10]], thickness: '1.6 mm', body: 'B' } });
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

describe('the actions of the selection follow the print rules (audit D25, S-15, S-16, D16, D26)', () => {
  type Face = { name: string; point: number[]; planeNormal?: number[] };
  const lean = (degrees: number) => [Math.cos((degrees * Math.PI) / 180), 0, -Math.sin((degrees * Math.PI) / 180)];
  // A block 20 mm high on the bed with a ledge at 10 mm reaching out over x 20–40, and two slanted faces at its side.
  const faces: Face[] = [
    { name: 'F1:-z', point: [10, 10, 0], planeNormal: [0, 0, -1] },
    { name: 'F1:+z', point: [10, 10, 20], planeNormal: [0, 0, 1] },
    { name: 'F1:+x', point: [20, 10, 5], planeNormal: [1, 0, 0] },
    { name: 'F2:-z', point: [30, 10, 10], planeNormal: [0, 0, -1] },
    { name: 'F3:46', point: [-2, 10, 12], planeNormal: lean(46) },
    { name: 'F3:44', point: [-2, 10, 12], planeNormal: lean(44) },
    { name: 'F4:round', point: [0, 0, 0] },
    { name: 'F2:+x', point: [40, 10, 15], planeNormal: [1, 0, 0] },
  ];
  // Edges as pairs of faces: bed and side (outer), top and side, ledge underside and side below it (inner), the slants,
  // the ledge's underside and its end (outer, a ceiling 10 mm over the bed).
  const edgeFaces = Uint32Array.from([0, 2, 1, 2, 2, 3, 2, 4, 2, 5, 3, 7]);
  const vertices = Float32Array.from([0, 0, 0, 20, 0, 0, 0, 20, 20, 20, 20, 20, 40, 0, 10, 40, 20, 20]);
  const bodies = [{ name: 'B', model: { table: { faces }, edgeFaces, vertices } }] as unknown as BodyModel[];
  const edge = (index: number, point: [number, number, number]): Pick => ({ kind: 'edge', body: 0, edge: index, point });
  const bedEdge = edge(0, [20, 10, 0]);
  const topEdge = edge(1, [20, 10, 20]);
  const innerEdge = edge(2, [20, 10, 10]);
  const ledgeEdge = edge(5, [40, 10, 10]);
  const face = (index: number): Pick => ({ kind: 'face', body: 0, face: index, point: [0, 0, 0], normal: [0, 0, 1] });
  const pla = (nozzle = 0.4, layer = 0.2): ActionPrint => ({ printer: { nozzle, layer }, overhang: 45, holeShrink: 0.15, material: 'PLA' });
  const bed = bedOf(bodies, 0, {});

  it('finds outer edges of faces that face down, and which of them lie on the bed, as the body lies on its print face', () => {
    expect(bed).toEqual({ down: [0, 0, -1], level: 0 });
    expect(downEdges(bodies, [bedEdge], bed, 45)).toEqual({ count: 1, onBed: 1 });
    expect(downEdges(bodies, [topEdge, innerEdge], bed, 45)).toEqual({ count: 0, onBed: 0 });
    // The ledge's underside is a ceiling: it faces down, but it is not on the bed.
    expect(downEdges(bodies, [ledgeEdge, bedEdge], bed, 45)).toEqual({ count: 2, onBed: 1 });
    // Leaning 46° from the vertical is past PLA's 45°, 44° is not; an edge of a round face is not read.
    expect(downEdges(bodies, [edge(3, [0, 10, 12])], bed, 45)).toEqual({ count: 1, onBed: 0 });
    expect(downEdges(bodies, [edge(4, [0, 10, 12])], bed, 45).count).toBe(0);
    expect(downEdges(bodies, [edge(3, [0, 10, 12])], bed, 50).count).toBe(0);
    // Turned over onto its top: the top's edges lie on the bed, the bottom's face up.
    const turned = bedOf(bodies, 0, { B: 'F1:+z' });
    expect(turned).toEqual({ down: [0, 0, 1], level: 20 });
    expect(downEdges(bodies, [topEdge], turned, 45)).toEqual({ count: 1, onBed: 1 });
    expect(downEdges(bodies, [bedEdge], turned, 45).count).toBe(0);
    // No print face, or one that is gone or round: as designed.
    expect(bedOf(bodies, 0, { B: 'F9:gone' })).toEqual(bed);
    expect(bedOf(bodies, 0, { B: 'F4:round' })).toEqual(bed);
  });

  it('lays a body printed in one piece with others on the print face of the piece, as the print check does (review of BC-08)', () => {
    const lid = { name: 'C', model: { table: { faces: [{ name: 'C1:+y', point: [5, 30, 5], planeNormal: [0, 1, 0] }] }, edgeFaces: new Uint32Array(), vertices: Float32Array.from([0, 30, 0, 10, 25, 10]) } };
    const piece = [...bodies, lid] as unknown as BodyModel[];
    // B has no print face of its own: it lies on C's, and the bed is the piece's farthest point that way (y 30).
    expect(bedOf(piece, 0, { C: 'C1:+y' }, [['B', 'C']])).toEqual({ down: [0, 1, 0], level: 30 });
    // Not in a group: B stands as designed.
    expect(bedOf(piece, 0, { C: 'C1:+y' }, [])).toEqual(bed);
  });

  it('offers the radius as a chamfer of whole layers for a fillet on edges facing down, and says nothing elsewhere', () => {
    expect(actionPlan('fillet', 1, bodies, [bedEdge, topEdge], bed, pla())).toEqual({
      size: 1,
      notes: [{ note: 'downFillet', count: 1, onBed: 1, chamfer: 1, free: true, overhang: 45, material: 'PLA' }],
    });
    // Rounded to whole layers, at least two: 0.3 → 0.4 and 0.5 → 0.6 at 0.2 mm, 0.5 → 0.48 at 0.12 mm.
    expect(actionPlan('fillet', 0.3, bodies, [ledgeEdge], bed, pla()).notes[0]).toMatchObject({ onBed: 0, chamfer: 0.4 });
    expect(actionPlan('fillet', 0.5, bodies, [ledgeEdge], bed, pla()).notes[0]).toMatchObject({ chamfer: 0.6 });
    expect(actionPlan('fillet', 0.5, bodies, [ledgeEdge], bed, pla(0.4, 0.12)).notes[0]).toMatchObject({ chamfer: 0.48 });
    // PETG takes 40°, TPU 35°: the 45° chamfer is no promise of printing without support there.
    expect(actionPlan('fillet', 1, bodies, [bedEdge], bed, { ...pla(), overhang: 40, material: 'PETG' }).notes[0]).toMatchObject({ free: false, overhang: 40, material: 'PETG' });
    expect(actionPlan('fillet', 1, bodies, [topEdge, innerEdge], bed, pla())).toEqual({ size: 1, notes: [] });
    expect(actionPlan('chamfer', 0.4, bodies, [bedEdge], bed, pla())).toEqual({ size: 0.4, notes: [] });
  });

  it('drills a hole with the material allowance and says when it lies too wide across the layers', () => {
    // A wall: the hole lies; 7.85 + 0.15 = 8.00 mm prints round (LYING_HOLE), 8.01 does not.
    expect(actionPlan('hole', 7.85, bodies, [face(2)], bed, pla())).toEqual({ size: 8, notes: [{ note: 'holeAllowance', drilled: 8, allowance: 0.15, material: 'PLA' }] });
    expect(actionPlan('hole', 7.86, bodies, [face(2)], bed, pla()).notes).toContainEqual({ note: 'lyingHole', drilled: 8.01, most: 8 });
    // Upright in the top face a wide hole stands. Drilled into a face leaning 46° from the vertical, its axis is 44° from
    // upright and its wall leans 44°: it stands; into one leaning 44°, its wall leans 46° and it lies.
    expect(actionPlan('hole', 20, bodies, [face(1)], bed, pla()).notes.map((note) => note.note)).toEqual(['holeAllowance']);
    expect(actionPlan('hole', 20, bodies, [face(4)], bed, pla()).notes.map((note) => note.note)).toEqual(['holeAllowance']);
    expect(actionPlan('hole', 20, bodies, [face(5)], bed, pla()).notes.map((note) => note.note)).toEqual(['holeAllowance', 'lyingHole']);
    // A material that does not shrink: drilled as typed, nothing to say.
    expect(actionPlan('hole', 3, bodies, [face(1)], bed, { ...pla(), holeShrink: 0 })).toEqual({ size: 3, notes: [] });
  });

  it('holds a shell wall against the narrowest line, two lines and the line grid of the nozzle in use', () => {
    // 0.4 mm nozzle: lines of 0.45, the narrowest line a slicer lays 0.42.
    expect(actionPlan('shell', 0.41, bodies, [face(1)], bed, pla())).toEqual({ size: 0.41, notes: [{ note: 'wallNoPrint', least: 0.42, better: 0.9, refuse: true }] });
    expect(actionPlan('shell', 0.42, bodies, [face(1)], bed, pla()).notes).toEqual([{ note: 'wallThin', least: 0.9, better: 0.9 }]);
    expect(actionPlan('shell', 0.89, bodies, [face(1)], bed, pla()).notes).toEqual([{ note: 'wallThin', least: 0.9, better: 0.9 }]);
    expect(actionPlan('shell', 0.9, bodies, [face(1)], bed, pla()).notes).toEqual([]);
    expect(actionPlan('shell', 1.6, bodies, [face(1)], bed, pla()).notes).toEqual([{ note: 'wallLines', line: 0.45, better: 1.8 }]);
    expect(actionPlan('shell', 1.8, bodies, [face(1)], bed, pla()).notes).toEqual([]);
    // 0.6 mm nozzle: 1.35 is two lines of 0.675; 0.62 is its narrowest line.
    expect(actionPlan('shell', 1.35, bodies, [face(1)], bed, pla(0.6, 0.3)).notes).toEqual([]);
    expect(actionPlan('shell', 0.61, bodies, [face(1)], bed, pla(0.6, 0.3)).notes[0]).toMatchObject({ note: 'wallNoPrint', least: 0.62 });
  });

  it('starts each field from the printer in use', () => {
    const at = (nozzle: number, layer: number, bed = false) => (['fillet', 'chamfer', 'extrude', 'hole', 'shell'] as const).map((kind) => startSize(kind, { nozzle, layer }, bed));
    expect(at(0.4, 0.2)).toEqual([1, 0.6, 5, 3, 1.35]);
    expect(at(0.4, 0.2, true)[1]).toBe(0.4);
    expect(at(0.25, 0.12)).toEqual([1, 0.6, 5, 3, 0.843]);
    expect(at(0.25, 0.12, true)[1]).toBe(0.24);
    expect(at(1.2, 0.6)).toEqual([1.2, 0.6, 5, 3, 4.05]);
    // Before the part's profile is known: the blocks' default printer, no allowance.
    expect(actionPrint(null)).toEqual({ printer: { nozzle: 0.4, layer: 0.2 }, overhang: 45, holeShrink: 0, material: '' });
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
      unchecked: [
        { a: 'Mesh', b: null, reason: 'mesh body: not checked' },
        { a: 'Mesh', b: 'Lid', reason: 'not checked: the time budget of 240 s ran out' },
      ],
    });
    // A mesh body is not measured: it is named, so the check can say that its clearance is unknown.
    expect(measured).toEqual({
      // Only the mesh body is named as one; the pair that was not finished makes the measure incomplete (review 4 of PR 357).
      unchecked: ['Mesh'],
      incomplete: true,
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

describe('a function block from the form: a cut through goes through the wall at its point, or says that it could not tell (audit W2)', () => {
  // The box 60 × 40 × 30 with walls of 2 mm; the trial of a cut at [0, 20, 15] leaves one piece in each side wall.
  const pieces = [58, 0].map((x, k) => ({ name: `PartBuddy through${k ? ' (1)' : ''}`, bbox: { min: [x, 18.3, 13.3], max: [x + 2, 21.7, 16.7] }, center_of_mass: [x + 1, 20, 15] }));
  function form(answer: 'pieces' | 'refused' | 'throws') {
    const sent: { commands: string[]; rollback: boolean }[] = [];
    const requester: ControlRequester = {
      request: <T>(_method: string, params: Record<string, unknown> = {}) => {
        const commands = params.commands as { command: string }[];
        sent.push({ commands: commands.map((step) => step.command), rollback: params.rollback === true });
        if (params.rollback === true && commands.some((step) => step.command === 'solid.box')) {
          if (answer === 'throws') return Promise.reject(new Error('engine gone'));
          const at = answer === 'refused' ? commands.findIndex((step) => step.command === 'solid.hole') : commands.length - 1;
          const results = commands.slice(0, at).map((step) => (step.command === 'inspect.measure' ? { bodies: pieces } : {}));
          return Promise.resolve({ results, failed: { index: at, command: commands[at]?.command, error: 'no' } } as T);
        }
        return Promise.resolve({ results: commands.map(() => ({ components: [] })) } as T);
      },
    };
    const logged: string[] = [];
    return { service: new ActionService(() => requester, tmpdir()), sent, logged, log: (line: string) => logged.push(line) };
  }
  const hole: FeatureBlock = { block: 'screwHole', body: 'Dose', point: [0, 20, 15], size: 'M3', head: 'none', fit: 'normal' };

  it('measures the reach on trial and builds that deep', async () => {
    const { service, logged, log } = form('pieces');
    expect(await service.blockSteps(hole, undefined, log)).toEqual({ steps: [{ command: 'solid.hole', params: { position: [0, 20, 15], clearance: 'M3', fit: 'normal', depth: '3 mm', targets: ['Dose'] } }], unmeasured: false });
    expect(logged).toEqual([]);
  });

  it('when SolidCraft refuses the trial or the engine fails, builds through all, logs a warning and says unmeasured for the form', async () => {
    for (const answer of ['refused', 'throws'] as const) {
      const { service, logged, log } = form(answer);
      const { steps, unmeasured } = await service.blockSteps(hole, undefined, log);
      expect(unmeasured, answer).toBe(true);
      expect(steps[0]?.params, answer).not.toHaveProperty('depth');
      expect(logged, answer).toEqual([answer === 'refused' ? 'Warning: screwHole on Dose: SolidCraft refused the trial of its reach; it goes through all of the body' : 'Warning: screwHole on Dose: the trial of its reach failed (engine gone); it goes through all of the body']);
    }
    // A point no piece holds.
    const off = form('pieces');
    expect((await off.service.blockSteps({ ...hole, point: [-1, 20, 15] }, undefined, off.log)).unmeasured).toBe(true);
    expect(off.logged[0]).toContain('no wall of the body at a point');
  });

  it('tries nothing for a block with a depth, or one asked to go through all of its body', async () => {
    const { service, sent, log } = form('pieces');
    expect((await service.blockSteps({ ...hole, through: 'body' }, undefined, log)).unmeasured).toBe(false);
    expect((await service.blockSteps({ block: 'insertSeat', body: 'Dose', point: [0, 20, 15], size: 'M3', diameter: 4, depth: 6.7 }, undefined, log)).unmeasured).toBe(false);
    expect(sent.some((batch) => batch.rollback)).toBe(false);
  });
});
