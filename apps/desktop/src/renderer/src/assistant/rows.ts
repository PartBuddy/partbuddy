import type { ConversationItem } from './store';

type StepItem = Extract<ConversationItem, { kind: 'step' }>;
type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

/** A step with the tool call that made it, or reading tool calls folded into one line. */
export type WorkEntry = { kind: 'step'; item: StepItem; tools: ToolItem[] } | { kind: 'queries'; tools: ToolItem[] };

export type Row =
  /** `quiet`: an answer that is no longer the newest, shown shortened until the user opens it. */
  | { kind: 'item'; item: ConversationItem; quiet: boolean }
  | WorkEntry
  /** Every step and query of one request, as one line that opens to the steps. */
  | { kind: 'work'; key: string; entries: WorkEntry[]; live: boolean };

/** The same items in the same order: rows are rebuilt for every token, their items mostly are not. */
export function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

/** The same work entries: each the same step or queries with the same tool calls. */
export function sameEntries(a: readonly WorkEntry[], b: readonly WorkEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => {
      const other = b[i];
      if (!other || other.kind !== entry.kind || !sameList(entry.tools, other.tools)) return false;
      return entry.kind !== 'step' || (other.kind === 'step' && entry.item === other.item);
    })
  );
}

/** Steps a request needs before they fold into one line. */
const GROUP_FROM = 2;

/**
 * The conversation as rows (M2a, tidied in the UI upgrade): a step holds the tool call that made
 * it, tool calls that only read fold into one line, refused calls stay visible on their own. All
 * the work of one request becomes one line where it began, so a part built in twenty steps takes
 * one line and not twenty cards. Every answer but the newest is quiet. A change the user made
 * (a dimension, an action in the view) is its own row.
 */
export function rowsOf(items: readonly ConversationItem[], busy = false): Row[] {
  // Segments: a request with everything up to the next one; a step the user made stands alone.
  const segments: ConversationItem[][] = [];
  for (const item of items) {
    const alone = item.kind === 'step' && item.step.source === 'user';
    if (item.kind === 'user' || alone || segments.length === 0) segments.push([]);
    segments.at(-1)?.push(item);
    if (alone) segments.push([]);
  }
  const lastText = items.findLastIndex((item) => item.kind === 'assistant');

  const rows: Row[] = [];
  segments.forEach((segment, index) => {
    const entries: WorkEntry[] = [];
    let at = -1;
    const own: Row[] = [];
    for (const item of segment) {
      let entry: WorkEntry | null = null;
      if (item.kind === 'step') {
        const tools = items.filter((candidate): candidate is ToolItem => candidate.kind === 'tool' && candidate.step === item.step.id);
        entry = { kind: 'step', item, tools };
      } else if (item.kind === 'tool' && item.step) {
        continue;
      } else if (item.kind === 'tool' && (item.name === 'partbuddy_ask' || item.name === 'partbuddy_plan') && item.ok !== false) {
        // A question or plan shows as its own card; its tool call adds nothing unless it failed.
        continue;
      } else if (item.kind === 'tool' && item.decision === 'allowed') {
        const last = entries.at(-1);
        if (last?.kind === 'queries') {
          last.tools.push(item);
          continue;
        }
        entry = { kind: 'queries', tools: [item] };
      }
      if (entry) {
        if (at < 0) at = own.length;
        entries.push(entry);
        continue;
      }
      own.push({ kind: 'item', item, quiet: item.kind === 'assistant' && items.indexOf(item) !== lastText });
    }
    const steps = entries.filter((entry) => entry.kind === 'step').length;
    const work: Row[] =
      steps >= GROUP_FROM
        ? [{ kind: 'work', key: `work-${entries[0]?.kind === 'step' ? entries[0].item.key : (entries[0]?.tools[0]?.key ?? String(index))}`, entries, live: busy && index === segments.length - 1 }]
        : entries;
    if (at < 0) rows.push(...own);
    else rows.push(...own.slice(0, at), ...work, ...own.slice(at));
  });
  return rows;
}

/** The `done` detail of a turn that used all its tool rounds (main/agents/loop.ts ROUNDS_DETAIL). */
export const ROUNDS = 'rounds';

/**
 * What "send again" sends after a failed turn: the last request once more, but after the round limit (audit R57)
 * `onward` ("continue"), since the request again would build the half-built part a second time.
 */
export function retryMessage(failed: ConversationItem | undefined, request: string, onward: string): string {
  return failed?.kind === 'stopped' && failed.detail === ROUNDS ? onward : request;
}
