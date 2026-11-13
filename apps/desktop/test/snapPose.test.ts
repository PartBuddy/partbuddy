import { describe, expect, it } from 'vitest';

import { ActionService, overlapDepth, SNAP_CATCH, snapPoses } from '../src/main/solidcraft/actions';

/** An `inspect.interference` answer as SolidCraft 0.40.1 gives it: one overlap whose box is `thin` deep, or none. */
const overlap = (thin: number | null) =>
  thin === null ? { count: 0, interferences: [] } : { count: 1, interferences: [{ a: 'Box', b: 'Lid', volume_mm3: 1.7, bbox: { min: [23, -37.8, 14], max: [37, -37.8 + thin, 18] } }] };

describe('the snap-fit poses of a joint run are taken back with their undo step', () => {
  const service = (posed: { failed?: { index: number; command: string; error: string }; results?: unknown[] }, unit = 'deg', stoppedAt = 28) => {
    const batches: { commands: { command: string; params: Record<string, unknown> }[]; rollback: boolean }[] = [];
    const engine = {
      request: <T>(_method: string, params: Record<string, unknown> = {}): Promise<T> => {
        const batch = params as (typeof batches)[number];
        batches.push(batch);
        // Stopped short of the limit of 30: a snap fit to try.
        if (batch.commands[0]?.command === 'joint.sweep') return Promise.resolve({ results: [{ stopped_at: stoppedAt, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [0, 0, 0] }, unit }] } as T);
        return Promise.resolve(posed as T);
      },
    };
    const logged: string[] = [];
    return { actions: new ActionService(() => engine, 'cache'), batches, logged, log: (line: string) => logged.push(line) };
  };
  const sweeps = [{ joint: 9, index: 1, from: 0, to: 30 }];
  /** The pose batch's answer: an overlap per pose (the limit last), then the failing read. */
  const answered = (...thin: (number | null)[]) => ({
    failed: { index: thin.length * 2, command: 'sketch.inspect', error: 'no sketch' },
    results: thin.flatMap((depth) => [{}, overlap(depth)]),
  });

  it('drives the joint value through its last stretch and to the limit in one batch that ends in the failing read', async () => {
    const free = service(answered(0.29, 0.33, 0.32, 0.29, null));
    expect(await free.actions.sweepJoints(sweeps, free.log)).toEqual([null]);
    const pose = free.batches[1];
    expect(pose?.rollback).toBe(true);
    expect(pose?.commands.map((step) => step.command)).toEqual([...Array.from({ length: 5 }, () => ['joint.drive', 'inspect.interference']).flat(), 'sketch.inspect']);
    // Every value of the joint is tried, not only the first (audit D11), at the poses of snapPoses.
    expect(pose?.commands.filter((step) => step.command === 'joint.drive').map((step) => [step.params.index, step.params.value])).toEqual(snapPoses(28, 30, 'deg').map((value) => [1, value]));
    expect(free.logged).toEqual([]);
  });

  it('keeps the stop when a part deeper than a catch is passed on the way, though the limit is free (audit D11)', async () => {
    // The slider of 2026-11-13: a pin 1.5 mm long through a web 1.5 mm thick, stopped at 17.0 of 20.5 mm, measured 1.25 mm deep.
    const web = service(answered(0.1, 0.875, 1.25, 0.375, null), 'mm', 27);
    expect(await web.actions.sweepJoints(sweeps, web.log)).toMatchObject([{ stoppedAt: 27 }]);
    // Just over and just at the catch.
    expect(await service(answered(0.2, SNAP_CATCH + 0.001, 0.2, 0.2, null)).actions.sweepJoints(sweeps)).toMatchObject([{ stoppedAt: 28 }]);
    expect(await service(answered(0.2, SNAP_CATCH, 0.2, 0.2, null)).actions.sweepJoints(sweeps)).toEqual([null]);
    // No pose on the way saw the parts overlap: nothing tells it is a snap fit.
    expect(await service(answered(null, null, null, null, null)).actions.sweepJoints(sweeps)).toMatchObject([{ stoppedAt: 28 }]);
  });

  it('keeps the stop when the parts overlap at the limit', async () => {
    expect(await service(answered(0.2, 0.2, 0.2, 0.2, 0.2)).actions.sweepJoints(sweeps)).toMatchObject([{ stoppedAt: 28 }]);
  });

  it('keeps and logs the stop when a drive or a read fails on the way, or an answer cannot be read (audit G4)', async () => {
    const refused = service({ failed: { index: 4, command: 'joint.drive', error: 'held' }, results: [] });
    expect(await refused.actions.sweepJoints(sweeps, refused.log)).toMatchObject([{ stoppedAt: 28 }]);
    expect(refused.logged).toEqual(['Warning: joint 9 value 1: Flap:1 meets Base:1 at 28 on the way to 30: the snap fit could not be tried (joint.drive: held); the stop is reported']);
    const unfailed = service({ results: [] });
    expect(await unfailed.actions.sweepJoints(sweeps, unfailed.log)).toMatchObject([{ stoppedAt: 28 }]);
    expect(unfailed.logged[0]).toContain('the batch did not end in its failing read');
    const odd = answered(0.2, 0.2, 0.2, 0.2, null);
    odd.results[3] = { count: 1, interferences: [{ a: 'Box', b: 'Lid' }] };
    const unread = service(odd);
    expect(await unread.actions.sweepJoints(sweeps, unread.log)).toMatchObject([{ stoppedAt: 28 }]);
    expect(unread.logged[0]).toContain("SolidCraft's interference on the way could not be read");
  });

  it('reads the depth of an overlap from its box, and the poses from the contact to the limit', () => {
    expect(overlapDepth({ count: 0, interferences: [] })).toBe(0);
    expect(overlapDepth(overlap(0.333))).toBeCloseTo(0.333, 9);
    // The deepest of several.
    expect(overlapDepth({ count: 2, interferences: [overlap(0.2).interferences[0], overlap(1.25).interferences[0]] })).toBeCloseTo(1.25, 9);
    expect(overlapDepth({ count: 1 })).toBeNull();
    expect(overlapDepth({ count: 1, interferences: [{ bbox: { min: [0, 0], max: [1, 1, 1] } }] })).toBeNull();
    expect(overlapDepth(undefined)).toBeNull();
    expect(snapPoses(175.6171875, 180, 'deg')).toEqual([176.117188, 176.712891, 177.808594, 178.904297, 180]);
    expect(snapPoses(-3, -6, 'mm')).toEqual([-3.1, -3.75, -4.5, -5.25, -6]);
  });
});
