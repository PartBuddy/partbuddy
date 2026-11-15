import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { CLEARED_RESULT, KEPT_RESULTS, withEarlierResultsCleared } from '../src/main/agents/loop';

const result = (id: string, value: string): ModelMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: id, toolName: 'measure', output: { type: 'text', value } }],
});
const valueOf = (message: ModelMessage | undefined) => (message?.role === 'tool' && message.content[0]?.type === 'tool-result' && message.content[0].output.type === 'text' ? message.content[0].output.value : null);

describe('earlier tool results (issue 446)', () => {
  it('replaces long results of earlier turns, keeps the newest and the short ones', () => {
    const long = 'x'.repeat(2000);
    const history: ModelMessage[] = [
      { role: 'user', content: 'Build it' },
      result('a', long),
      result('b', 'short'),
      ...Array.from({ length: KEPT_RESULTS }, (_, index) => result(`n${String(index)}`, long)),
    ];
    const cleared = withEarlierResultsCleared(history);
    expect(valueOf(cleared[1])).toBe(CLEARED_RESULT);
    expect(valueOf(cleared[2])).toBe('short');
    expect(cleared.slice(3).map(valueOf)).toEqual(Array.from({ length: KEPT_RESULTS }, () => long));
    expect(cleared[0]).toBe(history[0]);
    // The history itself is not changed.
    expect(valueOf(history[1])).toBe(long);
  });
});
