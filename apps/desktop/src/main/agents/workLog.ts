import { IntlMessageFormat } from 'intl-messageformat';

import type { AgentEvent, WorkStep, WorkStepState } from '../../shared/contract';
import { describeToolCall, stepMessages, type StepPhrase } from '../../shared/stepPhrases';
import type { ToolResult, UpstreamTools } from './gateProxy';

/** Where SolidCraft's undo history stands: its depth is how a step is found again (M2a). */
export interface DesignHistory {
  documentId: string;
  revision: number;
  undo: number;
  redo: number;
}

export interface WorkLogOptions {
  /** Reads the design's revision and undo history right now. */
  history(): Promise<DesignHistory>;
  /** Runs Undo or Redo `count` times as one request. */
  travel(command: 'edit.undo' | 'edit.redo', count: number): Promise<void>;
  emit(event: AgentEvent): void;
}

/** Tools that may change the design; every other tool only reads and is not tracked. */
const CHANGING_TOOLS = new Set(['execute', 'batch', 'set_parameter', 'undo', 'redo']);
/** Tools that move through the history instead of adding to it. */
const HISTORY_TOOLS = new Set(['undo', 'redo']);

/** Enough for a long session; older steps leave the log (their cards stay, without "go back"). */
const MAX_STEPS = 500;

interface Entry extends WorkStep {
  discarded: boolean;
}

/** English text of the phrases, for notes to the model. */
export function phrasesText(phrases: StepPhrase[]): string {
  return phrases.map((phrase) => new IntlMessageFormat(stepMessages.en[phrase.key], 'en').format(phrase.values) as string).join('; ');
}

/**
 * The work log of the conversation (M2a): every change of the design, by the assistant or by the
 * user, becomes a step with the undo depth it left behind. "Go back to this state" undoes or
 * redoes to that depth; SolidCraft's checkpoints cannot do that, because restoring one drops all
 * later checkpoints and the redo history (checked with SolidCraft 0.30.1). The log also writes the
 * note that tells the model what the user changed or undid since its last turn.
 */
export class WorkLog {
  private readonly entries: Entry[] = [];
  private sequence = 0;
  private last: DesignHistory | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private notes: string[] = [];
  private shown = '';

  constructor(private readonly options: WorkLogOptions) {}

  /**
   * SolidCraft's tools with every changing call tracked: one call at a time, the history read
   * before and after, and a step when the call added to the history.
   */
  tools(upstream: UpstreamTools): UpstreamTools {
    return {
      instructions: () => upstream.instructions(),
      listTools: () => upstream.listTools(),
      callTool: (name, args, callId) => {
        if (!CHANGING_TOOLS.has(name)) return upstream.callTool(name, args, callId);
        return this.serial(async () => {
          const before = await this.readHistory();
          const result: ToolResult = await upstream.callTool(name, args, callId);
          const after = await this.readHistory();
          if (before && after && !HISTORY_TOOLS.has(name) && addedToHistory(before, after)) {
            this.add({ source: 'assistant', phrases: describeToolCall(name, args), ...(callId ? { toolId: callId } : {}) }, after);
          } else {
            this.publish();
          }
          return result;
        });
      },
    };
  }

  /** One change of the user's own (dimension field, actions, timeline), recorded as a step. */
  recordUser(phrase: StepPhrase, work: () => Promise<void>): Promise<void> {
    return this.serial(async () => {
      const before = await this.readHistory();
      await work();
      const after = await this.readHistory();
      if (before && after && addedToHistory(before, after)) {
        this.add({ source: 'user', phrases: [phrase] }, after);
        this.notes.push(`the user changed the design: ${phrasesText([phrase])}`);
      } else {
        this.publish();
      }
    });
  }

  /** The user's Undo or Redo; the model learns about it with the next message. */
  userHistory(command: 'undo' | 'redo', work: () => Promise<void>): Promise<void> {
    return this.serial(async () => {
      await work();
      await this.readHistory();
      this.notes.push(command === 'undo' ? 'the user undid the last change' : 'the user redid the last undone change');
      this.publish();
    });
  }

  /** The history of each mirrored revision, so the cards follow undo and redo from anywhere. */
  observe(history: DesignHistory): void {
    // A mirrored revision can arrive after PartBuddy read a newer history itself.
    if (this.last?.documentId === history.documentId && history.revision < this.last.revision) return;
    this.last = history;
    this.publish();
  }

  /** "Go back to this state": undoes or redoes to the step's depth. */
  goTo(id: string): Promise<void> {
    return this.serial(async () => {
      const entry = this.entries.find((candidate) => candidate.id === id);
      if (!entry) throw new Error('this step is no longer in the work log');
      const now = await this.options.history();
      this.last = now;
      if (entry.discarded || entry.documentId !== now.documentId) throw new Error('this step was replaced by later changes');
      const difference = entry.depth - now.undo;
      if (difference > now.redo) throw new Error('this step was replaced by later changes');
      if (difference < 0) await this.options.travel('edit.undo', -difference);
      if (difference > 0) await this.options.travel('edit.redo', difference);
      await this.readHistory();
      const later = this.entries.filter((candidate) => !candidate.discarded && candidate.documentId === entry.documentId && candidate.depth > entry.depth).length;
      this.notes.push(
        `the user moved the design back to the state after the step "${phrasesText(entry.phrases)}" in PartBuddy's work log; ` +
          `${later === 0 ? 'no later steps are' : later === 1 ? 'the 1 later step is' : `the ${later} later steps are`} undone (Redo brings them back)`,
      );
      this.publish();
    });
  }

  /** The note for the next message to the model, once: what happened outside its turns. */
  takeNote(): string | null {
    if (this.notes.length === 0) return null;
    const note = `[PartBuddy: since your last turn ${this.notes.join('; then ')}. Inspect the design before you change it.]`;
    this.notes = [];
    return note;
  }

  private add(step: Pick<WorkStep, 'source' | 'phrases' | 'toolId'>, after: DesignHistory): void {
    // A new change after Undo replaces everything that Redo could have brought back.
    for (const entry of this.entries) {
      if (entry.documentId === after.documentId && entry.depth >= after.undo) entry.discarded = true;
    }
    this.sequence += 1;
    const entry: Entry = {
      id: `step-${this.sequence}`,
      source: step.source,
      phrases: step.phrases,
      ...(step.toolId ? { toolId: step.toolId } : {}),
      documentId: after.documentId,
      revision: after.revision,
      depth: after.undo,
      discarded: false,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_STEPS) this.entries.shift();
    const card: WorkStep = { id: entry.id, source: entry.source, phrases: entry.phrases, documentId: entry.documentId, revision: entry.revision, depth: entry.depth };
    if (entry.toolId) card.toolId = entry.toolId;
    this.options.emit({ type: 'step', step: card });
    this.publish();
  }

  private async readHistory(): Promise<DesignHistory | null> {
    try {
      this.last = await this.options.history();
      return this.last;
    } catch {
      return null;
    }
  }

  /** Sends the state of every step when it changed. */
  private publish(): void {
    const history = this.last;
    const states: { id: string; state: WorkStepState }[] = this.entries.map((entry) => {
      if (!history || entry.discarded) return { id: entry.id, state: entry.discarded ? 'discarded' : 'applied' };
      if (entry.documentId !== history.documentId || entry.depth > history.undo + history.redo) {
        // Another design, or the redo history no longer reaches the step: it cannot come back.
        entry.discarded = true;
        return { id: entry.id, state: 'discarded' };
      }
      return { id: entry.id, state: entry.depth <= history.undo ? 'applied' : 'undone' };
    });
    const applied = this.entries.filter((entry, i) => states[i]?.state === 'applied');
    const current = applied.length > 0 ? applied.reduce((a, b) => (b.depth >= a.depth ? b : a)).id : null;
    const key = JSON.stringify([states, current]);
    if (key === this.shown) return;
    this.shown = key;
    this.options.emit({ type: 'steps', states, current });
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** True when the history grew or a new change replaced what Redo could have brought back. */
export function addedToHistory(before: DesignHistory, after: DesignHistory): boolean {
  if (before.documentId !== after.documentId || before.revision === after.revision) return false;
  return after.undo > before.undo || (before.redo > 0 && after.redo === 0 && after.undo >= before.undo);
}
