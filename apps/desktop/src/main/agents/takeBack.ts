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
 * undo gives the volumes back to the bit; `edit.undo` with nothing left fails with "nothing to undo".
 */

type Step = { command: string; params: Record<string, unknown> };
/** Runs SolidCraft commands in turn and gives each one's result; throws when one fails. */
export type Run = (commands: Step[]) => Promise<unknown[]>;

export interface Mark {
  /** What the design consists of, as one string to compare. */
  state: string;
  /** How many features, sketches and joints it has: undoing never goes below that, into what was there before. */
  features: number;
  /** SolidCraft's undo depth then; only a first guess at how many steps came since. */
  undo: number | null;
}

/** More single steps than any tool builds: the search for the mark ends there. */
const MOST = 400;

const READ: Step[] = [
  { command: 'document.inspect', params: { timeline: 'summary', bodies: 'names' } },
  { command: 'joint.list', params: {} },
];

function markFrom(results: unknown[]): Mark | null {
  const [design, joints] = results as [{ timeline?: unknown; sketches?: unknown; bodies?: unknown; undo?: unknown } | undefined, { joints?: unknown } | undefined];
  // Without the timeline there is nothing to know the state by.
  if (!Array.isArray(design?.timeline)) return null;
  const ids = (list: unknown): unknown[] => (Array.isArray(list) ? (list as unknown[]).map((entry) => (entry as { id?: unknown } | null)?.id ?? entry) : []);
  const count = (list: unknown) => (Array.isArray(list) ? list.length : 0);
  return { features: design.timeline.length + count(design.sketches) + count(joints?.joints), state: JSON.stringify([ids(design.timeline), ids(design.sketches), design.bodies ?? null, ids(joints?.joints)]), undo: typeof design.undo === 'number' ? design.undo : null };
}

/** The design as it is now, to come back to; null when SolidCraft does not say enough to know it again. */
export async function markOf(run: Run): Promise<Mark | null> {
  try {
    return markFrom(await run(READ));
  } catch {
    return null;
  }
}

/**
 * Undoes until the design is at `mark` again, and makes the design level active (activating a component is no undo
 * step: after the undos it stays active, and what is built next lands in it). True only when the mark was reached;
 * false when it could not be (no mark, nothing left to undo, more than `MOST` steps), and the caller must say so: then
 * what was undone is redone, so the design is all that the tool left, not some of it (review 3 of PR #357).
 */
export async function takeBack(run: Run, mark: Mark | null): Promise<boolean> {
  const level = async () => {
    await run([{ command: 'component.activate', params: { component: 0 } }]).catch(() => undefined);
  };
  if (!mark) {
    await level();
    return false;
  }
  const UNDO = { command: 'edit.undo', params: {} };
  // The undos that went through, to be redone when the mark is not reached.
  let undone = 0;
  try {
    let now = markFrom(await run(READ));
    // Where the depth has not hit its ceiling the difference is the number of steps: all at once, then looked at.
    if (now && now.state !== mark.state && mark.undo !== null && now.undo !== null && now.undo > mark.undo) {
      const [count, depth] = [now.undo - mark.undo, now.undo];
      try {
        now = markFrom((await run([...Array.from({ length: count }, () => UNDO), ...READ])).slice(-READ.length));
        undone += count;
      } catch (error) {
        // Below the ceiling each undo takes one off the depth: what it reads now says how many went through.
        const left = markFrom(await run(READ).catch(() => []))?.undo;
        undone += typeof left === 'number' ? Math.max(0, Math.min(count, depth - left)) : 0;
        throw error;
      }
    }
    // One by one from there, as long as anything built since is left: a step further would take what was there before.
    for (let step = 0; now && now.state !== mark.state && now.features > mark.features && step < MOST; step += 1) {
      await run([UNDO]);
      undone += 1;
      now = markFrom(await run(READ));
    }
    if (now?.state === mark.state) {
      await level();
      return true;
    }
  } catch {
    // Not back at the mark: what was undone is redone below.
  }
  if (undone > 0) await run(Array.from({ length: undone }, () => ({ command: 'edit.redo', params: {} }))).catch(() => undefined);
  await level();
  return false;
}
