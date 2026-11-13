import { describe, expect, it } from 'vitest';

import { ActionService } from '../src/main/solidcraft/actions';

describe('the snap-fit pose of a joint run is taken back with its undo step', () => {
  const service = (posed: { failed?: { index: number; command: string; error: string }; results?: unknown[] }) => {
    const batches: { commands: { command: string }[]; rollback: boolean }[] = [];
    const engine = {
      request: <T>(_method: string, params: Record<string, unknown> = {}): Promise<T> => {
        const batch = params as { commands: { command: string }[]; rollback: boolean };
        batches.push(batch);
        const first = batch.commands[0]?.command;
        // Stopped 2° short of the 30° limit: a snap fit to try.
        if (first === 'joint.sweep') return Promise.resolve({ results: [{ stopped_at: 28, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [0, 0, 0] }, unit: 'deg' }] } as T);
        return Promise.resolve(posed as T);
      },
    };
    return { actions: new ActionService(() => engine, 'cache'), batches };
  };
  const sweeps = [{ joint: 9, index: 0, from: 0, to: 30 }];

  it('ends the pose in the failing read, so SolidCraft takes the drive back, and reads the pose from it', async () => {
    const free = service({ failed: { index: 2, command: 'sketch.inspect', error: 'no sketch' }, results: [{}, { count: 0 }] });
    expect(await free.actions.sweepJoints(sweeps)).toEqual([null]);
    const pose = free.batches[1];
    expect(pose?.rollback).toBe(true);
    expect(pose?.commands.map((step) => step.command)).toEqual(['joint.drive', 'inspect.interference', 'sketch.inspect']);
  });

  it('keeps the stop when the parts overlap at the limit or a drive was refused', async () => {
    expect(await service({ failed: { index: 2, command: 'sketch.inspect', error: 'no sketch' }, results: [{}, { count: 1 }] }).actions.sweepJoints(sweeps)).toMatchObject([{ stoppedAt: 28 }]);
    const refused = await service({ failed: { index: 0, command: 'joint.drive', error: 'no' }, results: [] }).actions.sweepJoints(sweeps);
    expect(refused[0]).toMatchObject({ stoppedAt: 28 });
  });
});
