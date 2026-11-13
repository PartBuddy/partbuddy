import { describe, expect, it } from 'vitest';

import { ActionService } from '../src/main/solidcraft/actions';
import { WindowTrials, type WindowState } from '../src/main/solidcraft/windowTrials';

const at = (revision: number, undo = 4, redo = 0, documentId = 'doc'): WindowState => ({ target: { documentId, revision }, undo, redo });

describe('the window reports what PartBuddy\'s own trials move (audit X-1 loop)', () => {
  it('holds what the window reports during a trial and passes it over when the design is as before', () => {
    const trials = new WindowTrials();
    expect(trials.changed(at(5).target)).toBe(true);
    trials.begin();
    expect(trials.changed(at(6).target)).toBe(false);
    expect(trials.changed(at(7).target)).toBe(false);
    expect(trials.end(at(5), at(7))).toBeNull();
    // A report of the trial that comes after its end is the trial's too; the user's next change is not.
    expect(trials.changed(at(7).target)).toBe(false);
    expect(trials.changed(at(8).target)).toBe(true);
    // Another design at a revision as low is a change.
    expect(trials.changed(at(3, 4, 0, 'other').target)).toBe(true);
  });

  it('mirrors at once after the trial what the user changed during it', () => {
    const trials = new WindowTrials();
    trials.begin();
    trials.changed(at(6).target);
    // The user's step added to the undo history.
    expect(trials.end(at(5), at(7, 5))).toEqual(at(7).target);
    expect(trials.changed(at(8).target)).toBe(true);
    // Undone meanwhile: the redo history moved.
    trials.begin();
    expect(trials.end(at(8, 5), at(9, 4, 1))).toEqual(at(9).target);
  });

  it('mirrors what the window reported when its state could not be read, and nothing when it reported nothing', () => {
    const trials = new WindowTrials();
    trials.begin();
    trials.changed(at(6).target);
    expect(trials.end(null, null)).toEqual(at(6).target);
    trials.begin();
    expect(trials.end(null, null)).toBeNull();
  });

  it('decides only when the last of trials inside each other ends', () => {
    const trials = new WindowTrials();
    trials.begin();
    trials.begin();
    trials.changed(at(6).target);
    expect(trials.end(at(5), at(6))).toBeNull();
    expect(trials.changed(at(7).target)).toBe(false);
    expect(trials.end(at(5), at(7))).toBeNull();
    expect(trials.changed(at(7).target)).toBe(false);
  });
});

describe('the snap-fit pose of a joint run is taken back with its undo steps', () => {
  const service = (posed: { failed?: { index: number; command: string; error: string }; results?: unknown[] }) => {
    const batches: { commands: { command: string }[]; rollback: boolean }[] = [];
    const engine = {
      request: <T>(_method: string, params: Record<string, unknown> = {}): Promise<T> => {
        const batch = params as { commands: { command: string }[]; rollback: boolean };
        batches.push(batch);
        const first = batch.commands[0]?.command;
        // Stopped 2° short of the 30° limit: a snap fit to try.
        if (first === 'joint.sweep') return Promise.resolve({ results: [{ stopped_at: 28, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [0, 0, 0] }, unit: 'deg' }] } as T);
        if (first === 'joint.list') return Promise.resolve({ results: [{ joints: [{ id: 9, values: [{ value: 0 }] }] }] } as T);
        return Promise.resolve(posed as T);
      },
    };
    return { actions: new ActionService(() => engine, 'cache'), batches };
  };
  const sweeps = [{ joint: 9, index: 0, from: 0, to: 30 }];

  it('ends the pose in the failing read, so SolidCraft takes both drives back, and reads the pose from it', async () => {
    const free = service({ failed: { index: 3, command: 'sketch.inspect', error: 'no sketch' }, results: [{}, { count: 0 }, {}] });
    expect(await free.actions.sweepJoints(sweeps)).toEqual([null]);
    const pose = free.batches[2];
    expect(pose?.rollback).toBe(true);
    expect(pose?.commands.map((step) => step.command)).toEqual(['joint.drive', 'inspect.interference', 'joint.drive', 'sketch.inspect']);
  });

  it('keeps the stop when the parts overlap at the limit or a drive was refused', async () => {
    expect(await service({ failed: { index: 3, command: 'sketch.inspect', error: 'no sketch' }, results: [{}, { count: 1 }, {}] }).actions.sweepJoints(sweeps)).toMatchObject([{ stoppedAt: 28 }]);
    const refused = await service({ failed: { index: 0, command: 'joint.drive', error: 'no' }, results: [] }).actions.sweepJoints(sweeps);
    expect(refused[0]).toMatchObject({ stoppedAt: 28 });
  });
});
