import { describe, expect, it } from 'vitest';

import type { ConversationItem } from '../src/renderer/src/assistant/store';
import { buildActivity } from '../src/renderer/src/viewer/buildActivity';

let key = 0;
const user = (text: string): ConversationItem => ({ kind: 'user', key: ++key, text });
const tool = (id: string, name: string, args: unknown, ok?: boolean): ConversationItem => ({
  kind: 'tool',
  key: ++key,
  id,
  name,
  summary: JSON.stringify(args),
  decision: 'allowed',
  ok,
});
const plan = (choice: string | null): ConversationItem => ({
  kind: 'question',
  key: ++key,
  question: { id: 'q1', kind: 'plan', summary: 'Wall holder with a hook', steps: ['Plate', 'Hook'] },
  answered: choice !== null,
  choice,
});

describe('build in the view (UI upgrade step 7)', () => {
  it('is thinking before the first tool call of the turn', () => {
    expect(buildActivity([user('a plate')])).toEqual({ plan: null, phrase: null, running: false, calls: 0, steps: 0 });
  });

  it('phrases a running change like the work log, and counts only this turn', () => {
    const items = [
      user('first'),
      tool('t0', 'execute', { command: 'solid.box', params: { length: 1, width: 1, height: 1 } }, true),
      user('second'),
      tool('t1', 'execute', { command: 'solid.extrude', params: { distance: 5 } }),
    ];
    const activity = buildActivity(items);
    expect(activity).toMatchObject({ running: true, calls: 1, steps: 0, plan: null });
    expect(activity.phrase).toEqual({ key: 'extrude', values: { distance: 5 } });
  });

  it('names the building command of a batch that sets parameters first', () => {
    const batch = {
      commands: [
        { command: 'parameters.change', params: { name: 'wand', expression: '6 mm' } },
        { command: 'solid.extrude', params: { distance: 12 } },
      ],
    };
    expect(buildActivity([user('go'), tool('t1', 'batch', batch, true)]).phrase).toEqual({ key: 'extrude', values: { distance: 12 } });
    expect(buildActivity([user('go'), tool('t2', 'set_parameter', { name: 'wand', value: '6 mm' }, true)]).phrase?.key).toBe('parameter');
  });

  it('has no phrase for a read-only call or unreadable arguments', () => {
    expect(buildActivity([user('look'), tool('t1', 'inspect_design', {}, true)]).phrase).toBeNull();
    expect(buildActivity([user('look'), { ...(tool('t2', 'execute', {}) as Extract<ConversationItem, { kind: 'tool' }>), summary: 'not json' }]).phrase).toBeNull();
  });

  it('names the plan the user approved with Go, not one still open or cancelled', () => {
    expect(buildActivity([user('holder'), plan('go'), user('Go')]).plan).toBe('Wall holder with a hook');
    expect(buildActivity([user('holder'), plan('cancel'), user('Cancel')]).plan).toBeNull();
    expect(buildActivity([user('holder'), plan(null)]).plan).toBeNull();
  });
});
