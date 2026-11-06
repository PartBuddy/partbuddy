import { describe, expect, it } from 'vitest';

import { SKETCH_NOTE } from '../src/main/agents/sketchNote';
import { userEvent } from '../src/main/agents/assistant';
import { agentEventSchema, agentMessageSchema, storedChatItemSchema } from '../src/shared/contract';

const png = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
};

describe('a rough sketch for the assistant (F4)', () => {
  it('takes a PNG picture with a message, and nothing else', () => {
    expect(agentMessageSchema.safeParse({ text: 'Make a part from my sketch.', sketch: png(50_000) }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'x', sketch: new TextEncoder().encode('<svg/> not a png at all') }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'x', sketch: png(5 * 1024 * 1024) }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'x', sketch: 'data:image/png;base64,AAAA' }).success).toBe(false);
  });

  it('marks the message in the chat, and the archive keeps the mark', () => {
    const event = userEvent('Make a part from my sketch.', undefined, undefined, 'sketch');
    expect(event).toEqual({ type: 'user', text: 'Make a part from my sketch.', sketch: true });
    expect(agentEventSchema.safeParse(event).success).toBe(true);
    expect(userEvent('Hello', undefined)).toEqual({ type: 'user', text: 'Hello' });
    expect(storedChatItemSchema.safeParse({ kind: 'user', text: 'x', sketch: true }).success).toBe(true);
  });

  it('tells the model the picture is not to scale and to ask for the sizes that matter', () => {
    expect(SKETCH_NOTE).toContain('not exact sizes');
    expect(SKETCH_NOTE).toContain('clarification card');
    expect(SKETCH_NOTE).toContain('Never read sizes off the picture');
  });
});
