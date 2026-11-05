import { describeToolCall, type StepPhrase } from '../../../shared/stepPhrases';
import type { ConversationItem } from '../assistant/store';

/** What the assistant is doing in the current turn, for the view (UI upgrade step 7). */
export interface BuildActivity {
  /** The summary of the plan the user approved, when the turn carries one out. */
  plan: string | null;
  /** The latest tool call as a work-log phrase; null while thinking or for a call without one. */
  phrase: StepPhrase | null;
  /** The latest tool call still runs. */
  running: boolean;
  /** Tool calls in this turn, read-only queries included. */
  calls: number;
  /** Steps that changed the design in this turn. */
  steps: number;
}

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

/** The tool call as the work log would phrase it; null for calls that only read or have no phrase. */
function phraseOf(tool: ToolItem): StepPhrase | null {
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(tool.summary);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    args = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const phrases = describeToolCall(tool.name, args).filter((phrase) => phrase.key !== 'command');
  // A batch often sets parameters first and builds after: the last building phrase says most.
  return phrases.findLast((phrase) => phrase.key !== 'parameter') ?? phrases[0] ?? null;
}

/** Folds the conversation into what the view shows while the assistant builds (pure, unit-testable). */
export function buildActivity(items: readonly ConversationItem[]): BuildActivity {
  const turnStart = items.findLastIndex((item) => item.kind === 'user');
  const turn = items.slice(turnStart + 1);
  const tools = turn.filter((item): item is ToolItem => item.kind === 'tool' && item.decision === 'allowed');
  const last = tools.at(-1);
  // A plan is approved with "Go" by the next message, so it stands before this turn.
  const question = items.slice(0, turnStart + 1).findLast((item) => item.kind === 'question');
  const plan = question?.kind === 'question' && question.question.kind === 'plan' && question.choice === 'go' ? question.question.summary : null;
  return {
    plan,
    phrase: last ? phraseOf(last) : null,
    running: last !== undefined && last.ok === undefined,
    calls: tools.length,
    steps: turn.filter((item) => item.kind === 'step').length,
  };
}
