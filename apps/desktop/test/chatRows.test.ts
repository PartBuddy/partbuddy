import { describe, expect, it } from 'vitest';

import { rowsOf } from '../src/renderer/src/assistant/rows';
import type { ConversationItem } from '../src/renderer/src/assistant/store';
import { clampChatWidth, DEFAULT_CHAT_WIDTH, MAX_CHAT_WIDTH, MIN_CHAT_WIDTH } from '../src/renderer/src/shell/chatWidth';

let key = 0;
const user = (text: string): ConversationItem => ({ kind: 'user', key: ++key, text });
const answer = (text: string): ConversationItem => ({ kind: 'assistant', key: ++key, text, open: false });
const query = (): ConversationItem => ({ kind: 'tool', key: ++key, id: `t${String(key)}`, name: 'inspect_design', summary: '', decision: 'allowed', ok: true });
const step = (id: string, source: 'assistant' | 'user' = 'assistant'): ConversationItem => ({
  kind: 'step',
  key: ++key,
  step: { id, source, phrases: [{ key: 'box', values: { length: 20, width: 20, height: 10 } }], documentId: 'd', revision: key, depth: key },
  state: 'applied',
  current: false,
});
const call = (stepId: string): ConversationItem => ({ kind: 'tool', key: ++key, id: `t${String(key)}`, name: 'execute', summary: '', decision: 'allowed', ok: true, step: stepId });

describe('the chat as rows (UI upgrade, chat)', () => {
  it('folds the steps of one request into one line where the work began', () => {
    const rows = rowsOf([user('Build a holder'), answer('Plan first.'), query(), step('s1'), call('s1'), answer('Now the holes.'), step('s2'), call('s2'), step('s3'), answer('Done.')]);
    expect(rows.map((row) => row.kind)).toEqual(['item', 'item', 'work', 'item', 'item']);
    const work = rows[2];
    expect(work?.kind === 'work' ? work.entries.map((entry) => entry.kind) : []).toEqual(['queries', 'step', 'step', 'step']);
    // Each step keeps the tool call that made it.
    expect(work?.kind === 'work' && work.entries[1]?.kind === 'step' ? work.entries[1].tools.map((tool) => tool.key) : []).toHaveLength(1);
  });

  it('keeps a single step as its line and a change by the user apart from the request before it', () => {
    const rows = rowsOf([user('Build a box'), step('s1'), answer('A box.'), step('s2', 'user'), step('s3', 'user')]);
    expect(rows.map((row) => row.kind)).toEqual(['item', 'step', 'item', 'step', 'step']);
  });

  it('shows only the newest answer in full; the work of the running request is live', () => {
    const rows = rowsOf([user('One'), answer('First answer.'), user('Two'), step('a'), step('b'), answer('Second answer.')], true);
    const quiet = rows.flatMap((row) => (row.kind === 'item' && row.item.kind === 'assistant' ? [row.quiet] : []));
    expect(quiet).toEqual([true, false]);
    expect(rows.find((row) => row.kind === 'work')).toMatchObject({ live: true });
  });
});

describe('chat width', () => {
  it('stays between the narrow chat and what the window leaves the view', () => {
    expect(clampChatWidth(100, 1800)).toBe(MIN_CHAT_WIDTH);
    expect(clampChatWidth(5000, 3000)).toBe(MAX_CHAT_WIDTH);
    expect(clampChatWidth(600, 1300)).toBe(580);
    expect(clampChatWidth(Number.NaN, 1800)).toBe(DEFAULT_CHAT_WIDTH);
    // A window too small for both keeps the chat usable.
    expect(clampChatWidth(500, 900)).toBe(MIN_CHAT_WIDTH);
  });
});
