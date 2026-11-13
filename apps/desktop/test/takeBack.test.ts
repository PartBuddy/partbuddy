import { describe, expect, it } from 'vitest';

import { markOf, takeBack, type Run } from '../src/main/agents/takeBack';

type Kind = 'feature' | 'sketch' | 'draw' | 'joint';

interface Options {
  timeline?: boolean;
  /** Every undo after this many is refused. */
  failUndoAfter?: number;
  /** Every redo is refused. */
  failRedo?: boolean;
  /** `joint.list` fails. */
  noJoints?: boolean;
  /** After an undo has been refused, this many reads fail too. */
  blindAfterRefusal?: number;
  /** A sketch is listed in `sketches` only, not in the timeline (SolidCraft 0.40.1 lists it in both). */
  sketchOutOfTimeline?: boolean;
}

/**
 * A design as SolidCraft 0.40.1 answers for it: every built step is an undo step; a feature and a sketch are timeline
 * entries, a sketch is listed in `sketches` as well, drawing in a sketch changes neither, a joint is no timeline entry;
 * the undo depth stops at 200, and activating a component is not undone.
 */
function design(features: number, options: Options = {}) {
  const { timeline = true, failUndoAfter = Infinity, failRedo = false, noJoints = false, sketchOutOfTimeline = false } = options;
  let blind = 0;
  const steps: { kind: Kind; id: number }[] = Array.from({ length: features }, (_, i) => ({ kind: 'feature', id: i + 1 }));
  const undone: { kind: Kind; id: number }[] = [];
  let undos = 0;
  let next = features + 1;
  const sent: string[][] = [];
  let active = 0;
  const listed = () => ({
    timeline: steps.filter((step) => step.kind === 'feature' || (step.kind === 'sketch' && !sketchOutOfTimeline)).map((step) => ({ id: step.id, type: step.kind === 'sketch' ? 'Sketch' : 'Feature' })),
    sketches: steps.filter((step) => step.kind === 'sketch').map((step) => ({ id: step.id })),
    joints: steps.filter((step) => step.kind === 'joint').map((step) => ({ id: step.id })),
  });
  const run: Run = (commands) => {
    sent.push(commands.map((step) => step.command));
    return Promise.resolve(
      commands.map((step) => {
        if (step.command === 'edit.undo') {
          if (undos++ >= failUndoAfter) {
            blind = options.blindAfterRefusal ?? 0;
            throw new Error('SolidCraft refused edit.undo: lost');
          }
          const last = steps.pop();
          if (last === undefined) throw new Error('nothing to undo');
          undone.push(last);
          return {};
        }
        if (step.command === 'edit.redo') {
          const back = undone.pop();
          if (failRedo || !back) throw new Error('nothing to redo');
          steps.push(back);
          return {};
        }
        if (step.command === 'component.activate') active = step.params.component as number;
        if (step.command === 'document.inspect') {
          if (blind > 0) {
            blind -= 1;
            throw new Error('SolidCraft gave no answer');
          }
          const { timeline: entries, sketches } = listed();
          return { ...(timeline ? { timeline: entries } : {}), sketches, bodies: ['Base', 'Flap'], undo: Math.min(steps.length, 200) };
        }
        if (step.command === 'joint.list') {
          if (noJoints) throw new Error('SolidCraft refused joint.list');
          return { joints: listed().joints };
        }
        return {};
      }),
    );
  };
  return {
    run,
    sent,
    build: (count: number, joint = false) => {
      for (let i = 0; i < count; i += 1) steps.push({ kind: 'feature', id: next++ });
      if (joint) steps.push({ kind: 'joint', id: next++ });
      active = 5;
    },
    /** A sketched block as `partbuddy_block` builds a slot: the sketch, the slot drawn in it, the cut. */
    sketched: (count: number) => {
      for (let i = 0; i < count; i += 1) steps.push({ kind: 'sketch', id: next++ }, { kind: 'draw', id: 0 }, { kind: 'feature', id: next++ });
      active = 5;
    },
    state: () => ({ features: listed().timeline.length, sketches: listed().sketches.length, joints: listed().joints.length, active }),
    undos: () => sent.flat().filter((command) => command === 'edit.undo').length,
    redos: () => sent.flat().filter((command) => command === 'edit.redo').length,
  };
}

describe('taking back what a tool built before it failed', () => {
  it('undoes every step since the mark and leaves the design level active', async () => {
    const d = design(12);
    const mark = await markOf(d.run);
    d.build(54, true);
    expect(await takeBack(d.run, mark)).toBe('back');
    expect(d.state()).toEqual({ features: 12, sketches: 0, joints: 0, active: 0 });
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
      expect(await takeBack(d.run, mark), String(before)).toBe('back');
      expect(d.state(), String(before)).toEqual({ features: before, sketches: 0, joints: 0, active: 0 });
      expect(d.undos(), String(before)).toBe(55);
    }
  });

  // Review 4 of PR #357: past the ceiling a step drawn in a sketch changes no count and no id, and must still be undone.
  it('undoes sketched steps past the ceiling to the first, whether a sketch is a timeline entry or listed apart', async () => {
    for (const sketchOutOfTimeline of [false, true]) {
      const d = design(260, { sketchOutOfTimeline });
      const mark = await markOf(d.run);
      d.sketched(2);
      expect(await takeBack(d.run, mark), String(sketchOutOfTimeline)).toBe('back');
      expect(d.undos(), String(sketchOutOfTimeline)).toBe(6);
      expect(d.state(), String(sketchOutOfTimeline)).toEqual({ features: 260, sketches: 0, joints: 0, active: 0 });
    }
  });

  it('undoes nothing where nothing was built, and still leaves the design level active', async () => {
    const d = design(7);
    const mark = await markOf(d.run);
    d.build(0);
    expect(await takeBack(d.run, mark)).toBe('back');
    expect(d.undos()).toBe(0);
    expect(d.state().active).toBe(0);
  });

  it('says so when the design cannot be known again, and takes nothing that was there before', async () => {
    // No timeline in SolidCraft's answer: no mark, nothing undone.
    const blind = design(5, { timeline: false });
    expect(await markOf(blind.run)).toBeNull();
    blind.build(9);
    expect(await takeBack(blind.run, null)).toBe('kept');
    expect(blind.undos()).toBe(0);
    expect(blind.state().active).toBe(0);
  });

  // Review 4 of PR #357: with `joint.list` failing there was no mark, and a failed block stayed.
  it('takes back by timeline, sketches and bodies alone when joint.list fails', async () => {
    const d = design(12, { noJoints: true });
    const mark = await markOf(d.run);
    expect(mark?.joints).toBe(false);
    d.sketched(1);
    expect(await takeBack(d.run, mark)).toBe('back');
    expect(d.state()).toEqual({ features: 12, sketches: 0, joints: 0, active: 0 });
  });

  // Review 3 of PR #357: a take-back that fails must leave the design as the tool left it, so that "could not be taken
  // back: undo it" holds, and must never undo a step from before the mark.
  it('undoes nothing from before the mark when the design never comes back to it, and redoes what it undid', async () => {
    const other = design(5);
    const mark = await markOf(other.run);
    other.build(3);
    // The undos work, but the design never reads like the mark (another feature in its place).
    expect(await takeBack(other.run, mark ? { ...mark, state: '[]', undo: 200 } : null)).toBe('kept');
    expect(other.undos()).toBe(3);
    expect(other.redos()).toBe(3);
    expect(other.state()).toEqual({ features: 8, sketches: 0, joints: 0, active: 0 });
  });

  it('redoes the undos that went through when edit.undo throws, below the ceiling and past it', async () => {
    for (const before of [12, 240]) {
      const d = design(before, { failUndoAfter: 20 });
      const mark = await markOf(d.run);
      d.build(54, true);
      expect(await takeBack(d.run, mark), String(before)).toBe('kept');
      // Below the ceiling the batch of 55 undos stops at the 21st; past it the 21st single undo throws.
      expect(d.redos(), String(before)).toBe(20);
      expect(d.state(), String(before)).toEqual({ features: before + 54, sketches: 0, joints: 1, active: 0 });
    }
    // With nothing left to undo SolidCraft answers "nothing to undo": nothing to redo either.
    const empty = design(0);
    const mark = await markOf(empty.run);
    expect(await takeBack(empty.run, mark ? { ...mark, state: '[]', features: -1 } : null)).toBe('kept');
    expect(empty.redos()).toBe(0);
    expect(empty.state().active).toBe(0);
  });

  // Review 4 of PR #357: when the batch of undos fails and the design cannot be read right after, how many went through
  // is not known; redoing one at a time until the design reads as the tool left it still brings all of it back.
  it('redoes one at a time when it cannot tell how many undos went through', async () => {
    const d = design(12, { failUndoAfter: 20, blindAfterRefusal: 1 });
    const mark = await markOf(d.run);
    d.build(54, true);
    expect(await takeBack(d.run, mark)).toBe('kept');
    expect(d.redos()).toBe(20);
    expect(d.state()).toEqual({ features: 66, sketches: 0, joints: 1, active: 0 });
  });

  it('says that only part is left when what it undid cannot be redone', async () => {
    const d = design(12, { failUndoAfter: 20, failRedo: true });
    const mark = await markOf(d.run);
    d.build(54, true);
    expect(await takeBack(d.run, mark)).toBe('partly');
    expect(d.state().active).toBe(0);
  });
});
