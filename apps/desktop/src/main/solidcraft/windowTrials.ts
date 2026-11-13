import type { RevisionTarget } from './mirror';

/** Where the window's design stands: its revision, and the undo history a user's change would add to. */
export interface WindowState {
  target: RevisionTarget;
  undo: number;
  redo: number;
}

/**
 * PartBuddy's own trials in the SolidCraft window (measures, probes, previews taken back) move its revision although the
 * design stays as it was, and the window reports each move with design.changed. Mirrored, the new model is checked
 * again, the check's measures move the revision again: an endless loop (contract test "stays quiet", 2026-11-13). The
 * headless engine records such revisions quietly (`HeadlessEngine.unchanged`); this does the same for the window: what
 * the window reports while a trial runs is held, and when the design is as before the trial (the same undo history),
 * the revision it left is PartBuddy's own and its reports are passed over. A user's change meanwhile adds to the undo
 * history, and is mirrored at once after the trial.
 * shortcut: a change that leaves the undo history alone (hiding a body) made during a trial waits for the next change; compare more of the design if that bites.
 */
export class WindowTrials {
  private running = 0;
  private held: RevisionTarget | null = null;
  private own: RevisionTarget | null = null;

  begin(): void {
    this.running += 1;
  }

  /** A design.changed of the window: whether to mirror it now. */
  changed(target: RevisionTarget): boolean {
    if (this.running > 0) {
      this.held = target;
      return false;
    }
    // A report of the trial that comes after its end.
    return !(this.own?.documentId === target.documentId && target.revision <= this.own.revision);
  }

  /**
   * The trial ended; `before` and `after` are the window's state around it (null when it could not be read). Returns
   * what to mirror now: nothing when the design is as before, else the newest the window reported or stands at.
   */
  end(before: WindowState | null, after: WindowState | null): RevisionTarget | null {
    this.running = Math.max(0, this.running - 1);
    const held = this.held;
    if (this.running > 0) return null;
    this.held = null;
    if (before && after && before.target.documentId === after.target.documentId && before.undo === after.undo && before.redo === after.redo) {
      this.own = after.target;
      return null;
    }
    return after?.target ?? held;
  }

  /** A new connection: nothing of the last one holds. */
  reset(): void {
    this.running = 0;
    this.held = null;
    this.own = null;
  }
}
