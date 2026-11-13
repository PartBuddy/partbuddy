import { describe, expect, it } from 'vitest';

import { markOf, takeBack, type Run } from '../src/main/agents/takeBack';

/**
 * A design as SolidCraft 0.40.1 answers for it: every built step is a feature and an undo step, a joint is an undo
 * step that is no feature, the undo depth stops at 200, and activating a component is not undone.
 */
function design(features: number, { timeline = true, failUndoAfter = Infinity } = {}) {
  const steps: ('feature' | 'joint')[] = Array.from({ length: features }, () => 'feature');
  const undone: { step: 'feature' | 'joint'; id: number }[] = [];
  let undos = 0;
  let next = features + 1;
  const ids = Array.from({ length: features }, (_, i) => i + 1);
  const joints: number[] = [];
  const sent: string[][] = [];
  let active = 0;
  const run: Run = (commands) => {
    sent.push(commands.map((step) => step.command));
    return Promise.resolve(
      commands.map((step) => {
        if (step.command === 'edit.undo') {
          if (undos++ >= failUndoAfter) throw new Error('SolidCraft refused edit.undo: lost');
          const last = steps.pop();
          if (last === undefined) throw new Error('nothing to undo');
          undone.push({ step: last, id: (last === 'feature' ? ids.pop() : joints.pop()) ?? 0 });
          return { undone: last };
        }
        if (step.command === 'edit.redo') {
          const back = undone.pop();
          if (!back) throw new Error('nothing to redo');
          steps.push(back.step);
          (back.step === 'feature' ? ids : joints).push(back.id);
          return { redone: back.step };
        }
        if (step.command === 'component.activate') active = step.params.component as number;
        if (step.command === 'document.inspect') return { ...(timeline ? { timeline: ids.map((id) => ({ id })) } : {}), sketches: [], bodies: ['Base', 'Flap'], undo: Math.min(steps.length, 200) };
        if (step.command === 'joint.list') return { joints: joints.map((id) => ({ id })) };
        return {};
      }),
    );
  };
  return {
    run,
    sent,
    build: (count: number, joint = false) => {
      for (let i = 0; i < count; i += 1) {
        steps.push('feature');
        ids.push(next++);
      }
      if (joint) {
        steps.push('joint');
        joints.push(next++);
      }
      active = 5;
    },
    state: () => ({ features: ids.length, joints: joints.length, active }),
    undos: () => sent.flat().filter((command) => command === 'edit.undo').length,
    redos: () => sent.flat().filter((command) => command === 'edit.redo').length,
  };
}

describe('taking back what a tool built before it failed', () => {
  it('undoes every step since the mark and leaves the design level active', async () => {
    const d = design(12);
    const mark = await markOf(d.run);
    d.build(54, true);
    expect(await takeBack(d.run, mark)).toBe(true);
    expect(d.state()).toEqual({ features: 12, joints: 0, active: 0 });
    // Below the ceiling of the undo depth the difference is the number of steps: one batch, looked at afterwards.
    expect(d.undos()).toBe(55);
    expect(d.sent.at(-2)?.filter((command) => command === 'edit.undo')).toHaveLength(55);
    expect(d.sent.at(-1)).toEqual(['component.activate']);
  });

  // Review of PR #358, measured on SolidCraft 0.40.1: 260 steps read `undo: 200`. With the depth at 200 before and
  // after, the difference was 0 and nothing was undone; at 170 before, 30 of 54 steps were, and half a hinge stayed.
  it('goes on past the ceiling of the undo depth until the design is as it was', async () => {
    for (const before of [170, 200, 240]) {
      const d = design(before);
      const mark = await markOf(d.run);
      expect(mark?.undo).toBe(Math.min(before, 200));
      d.build(54, true);
      expect(await takeBack(d.run, mark), String(before)).toBe(true);
      expect(d.state(), String(before)).toEqual({ features: before, joints: 0, active: 0 });
      expect(d.undos(), String(before)).toBe(55);
    }
  });

  it('undoes nothing where nothing was built, and still leaves the design level active', async () => {
    const d = design(7);
    const mark = await markOf(d.run);
    d.build(0);
    expect(await takeBack(d.run, mark)).toBe(true);
    expect(d.undos()).toBe(0);
    expect(d.state().active).toBe(0);
  });

  it('says so when the design cannot be known again, and takes nothing that was there before', async () => {
    // No timeline in SolidCraft's answer: no mark, nothing undone.
    const blind = design(5, { timeline: false });
    expect(await markOf(blind.run)).toBeNull();
    blind.build(9);
    expect(await takeBack(blind.run, null)).toBe(false);
    expect(blind.undos()).toBe(0);
    expect(blind.state().active).toBe(0);
  });

  // Review 3 of PR #357: a take-back that fails must leave the design as the tool left it, so that "could not be taken
  // back: undo it" holds, and must never undo a step from before the mark.
  it('undoes nothing from before the mark when the design never comes back to it, and redoes what it undid', async () => {
    const other = design(5);
    const mark = await markOf(other.run);
    other.build(3);
    // The undos work, but the design never reads like the mark (another feature in its place).
    expect(await takeBack(other.run, mark ? { ...mark, state: '[]', undo: 200 } : null)).toBe(false);
    expect(other.undos()).toBe(3);
    expect(other.redos()).toBe(3);
    expect(other.state()).toEqual({ features: 8, joints: 0, active: 0 });
  });

  it('redoes the undos that went through when edit.undo throws, below the ceiling and past it', async () => {
    for (const before of [12, 240]) {
      const d = design(before, { failUndoAfter: 20 });
      const mark = await markOf(d.run);
      d.build(54, true);
      expect(await takeBack(d.run, mark), String(before)).toBe(false);
      // Below the ceiling the batch of 55 undos stops at the 21st; past it the 21st single undo throws.
      expect(d.redos(), String(before)).toBe(20);
      expect(d.state(), String(before)).toEqual({ features: before + 54, joints: 1, active: 0 });
    }
    // With nothing left to undo SolidCraft answers "nothing to undo": nothing to redo either.
    const empty = design(0);
    const mark = await markOf(empty.run);
    expect(await takeBack(empty.run, mark ? { ...mark, state: '[]', features: -1 } : null)).toBe(false);
    expect(empty.redos()).toBe(0);
    expect(empty.state().active).toBe(0);
  });
});
