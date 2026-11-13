/**
 * Taking back what a tool built before it failed, shared by PartBuddy's own tools. The state before is kept as a mark:
 * what `document.inspect` and `joint.list` name of the design (features, sketches, bodies, joints). Taking back undoes
 * until the design reads like the mark again.
 *
 * Not by the difference of SolidCraft's undo depth alone: that depth stops at 200 (measured on 0.40.1: 260 steps read
 * `undo: 200`), a hinge with webs costs over 50 steps, and from the fourth hinge on the difference came out too small
 * or 0, so half a hinge or all of it stayed under "Everything was taken back" (review of PR #358).
 *
 * Measured on SolidCraft 0.40.1: one command is one undo step; `component.activate` is none (it moves the revision); an
 * undo gives the volumes back to the bit; `edit.undo` with nothing left fails with "nothing to undo". A sketch is an
 * entry of the timeline (type `Sketch`) and of `sketches` alike; drawing in it changes neither (audit run of a hinge
 * with webs, `document.inspect {timeline: 'summary', bodies: 'names'}`).
 */

import { UNDO_CAP } from './workLog';

type Step = { command: string; params: Record<string, unknown> };
/** Runs SolidCraft commands in turn and gives each one's result; throws when one fails. */
export type Run = (commands: Step[]) => Promise<unknown[]>;

export interface Mark {
  /** What the design consists of, as one string to compare. */
  state: string;
  /** How many timeline entries, sketches and joints it has: undoing never goes below that, into what was there before. */
  features: number;
  /** SolidCraft's undo depth then; only a first guess at how many steps came since. */
  undo: number | null;
  /** False when `joint.list` did not answer: the design is then known without its joints, then and when taking back. */
  joints: boolean;
}

/**
 * How a take-back ended: `back` at the mark; `kept` not, and the design is all that the tool left (nothing undone, or
 * all of it redone); `partly` not, and it is not known to be either: the caller must say so.
 */
export type TakenBack = 'back' | 'kept' | 'partly';

/** More single steps than any tool builds: the search for the mark ends there. */
const MOST = 400;

const INSPECT: Step = { command: 'document.inspect', params: { timeline: 'summary', bodies: 'names' } };
const JOINTS: Step = { command: 'joint.list', params: {} };
const UNDO: Step = { command: 'edit.undo', params: {} };
const REDO: Step = { command: 'edit.redo', params: {} };
const readOf = (joints: boolean): Step[] => (joints ? [INSPECT, JOINTS] : [INSPECT]);

function markFrom(results: unknown[], joints: boolean): Mark | null {
  const [design, listed] = results as [{ timeline?: unknown; sketches?: unknown; bodies?: unknown; undo?: unknown } | undefined, { joints?: unknown } | undefined];
  // Without the timeline there is nothing to know the state by.
  if (!Array.isArray(design?.timeline)) return null;
  const ids = (list: unknown): unknown[] => (Array.isArray(list) ? (list as unknown[]).map((entry) => (entry as { id?: unknown } | null)?.id ?? entry) : []);
  const count = (list: unknown) => (Array.isArray(list) ? list.length : 0);
  return {
    features: design.timeline.length + count(design.sketches) + count(listed?.joints),
    // A sketch by its whole entry: drawing in it (`sketch.slot`) changes its curves, not its id.
    state: JSON.stringify([ids(design.timeline), design.sketches ?? null, design.bodies ?? null, ids(listed?.joints)]),
    undo: typeof design.undo === 'number' ? design.undo : null,
    joints,
  };
}

/** The design as it is now, to come back to; null when SolidCraft does not say enough to know it again. */
export async function markOf(run: Run): Promise<Mark | null> {
  try {
    return markFrom(await run(readOf(true)), true);
  } catch {
    // Where `joint.list` fails the design is still known by its timeline, sketches and bodies.
    try {
      return markFrom(await run(readOf(false)), false);
    } catch {
      return null;
    }
  }
}

/**
 * Undoes until the design is at `mark` again, and makes the design level active (activating a component is no undo
 * step: after the undos it stays active, and what is built next lands in it). When the mark is not reached (no mark,
 * nothing left to undo, more than `MOST` steps, SolidCraft refusing) what was undone is redone and the design is
 * looked at again, so that the caller can say truly what is left of what it built (review 3 of PR #357).
 */
export async function takeBack(run: Run, mark: Mark | null): Promise<TakenBack> {
  const level = async () => {
    await run([{ command: 'component.activate', params: { component: 0 } }]).catch(() => undefined);
  };
  if (!mark) {
    await level();
    return 'kept';
  }
  const read = readOf(mark.joints);
  const look = async () => markFrom(await run(read), mark.joints);
  // The design as the tool left it, and the undos that went through since (null: not known how many).
  let start: Mark | null = null;
  let undone: number | null = 0;
  try {
    let now = (start = await look());
    // Where the depth has not hit its ceiling the difference is the number of steps: all at once, then looked at.
    if (now && now.state !== mark.state && mark.undo !== null && now.undo !== null && now.undo > mark.undo) {
      const [count, depth] = [now.undo - mark.undo, now.undo];
      try {
        now = markFrom((await run([...Array.from({ length: count }, () => UNDO), ...read])).slice(-read.length), mark.joints);
        undone += count;
      } catch (error) {
        // Below the ceiling each undo takes one off the depth: what it reads now says how many went through.
        const left = (await look().catch(() => null))?.undo;
        undone = typeof left === 'number' ? undone + Math.max(0, Math.min(count, depth - left)) : null;
        throw error;
      }
    }
    // One by one from there, as long as anything built since is left: a step further would take what was there before.
    for (let step = 0; now && now.state !== mark.state && now.features > mark.features && step < MOST; step += 1) {
      await run([UNDO]);
      undone += 1;
      now = await look();
    }
    if (now?.state === mark.state) {
      await level();
      return 'back';
    }
  } catch {
    // Not back at the mark: what was undone is redone below.
  }
  const outcome = start ? await redo(run, start, undone, look) : 'kept';
  await level();
  return outcome;
}

/** Redoes `undone` undos (one at a time until the design reads as `start` when their number is not known); whether the design is as the tool left it. */
async function redo(run: Run, start: Mark, undone: number | null, look: () => Promise<Mark | null>): Promise<TakenBack> {
  if (undone === 0) return 'kept';
  try {
    if (undone === null) {
      // A step that changes nothing the design is read by (a print face) can still be missing when it reads as before: only
      // the undo depth tells, and only below its ceiling. Otherwise it is not known, and said so.
      const told = (now: Mark | null) => now?.state === start.state && now.undo === start.undo;
      let now = await look();
      for (let step = 0; now && !told(now) && step < MOST; step += 1) {
        await run([REDO]);
        now = await look();
      }
      return told(now) && start.undo !== null && start.undo < UNDO_CAP ? 'kept' : 'partly';
    }
    await run(Array.from({ length: undone }, () => REDO));
    return (await look())?.state === start.state ? 'kept' : 'partly';
  } catch {
    return 'partly';
  }
}

/** What the answer of a failed call says of the take-back, the same for every tool. */
export const TAKEN_BACK_SAID: Record<TakenBack, string> = {
  back: 'Everything was taken back.',
  kept: 'What was built could NOT be taken back and is all still there: undo it before you call again.',
  partly: 'What was built could NOT be taken back in full, and it cannot be told how much of it is left: inspect the design and undo what is left of it before you call again.',
};
