import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { userEvent } from '../src/main/agents/assistant';
import { photoFile, photoNote } from '../src/main/agents/photoNote';
import { decide } from '../src/main/agents/policy';
import { agentEventSchema, agentMessageSchema, storedChatItemSchema } from '../src/shared/contract';

const png = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
};

describe('a photo for the assistant (F6)', () => {
  it('takes a photo as a PNG with a message, but not together with a sketch', () => {
    expect(agentMessageSchema.safeParse({ text: 'A holder for this', photo: png(2_000_000) }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'x', photo: png(100), sketch: png(100) }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'x', photo: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]) }).success).toBe(false);
  });

  it('marks the message in the chat, and the archive keeps the mark', () => {
    const event = userEvent('A holder for this', undefined, undefined, 'photo');
    expect(event).toEqual({ type: 'user', text: 'A holder for this', photo: true });
    expect(agentEventSchema.safeParse(event).success).toBe(true);
    expect(storedChatItemSchema.safeParse({ kind: 'user', text: 'x', photo: true }).success).toBe(true);
  });

  it('keeps the photo in the project with a name the policy knows', () => {
    const project = join(tmpdir(), 'PartBuddy', 'Holder');
    const file = photoFile(project, new Date(2026, 10, 6, 9, 5, 7));
    expect(file).toBe(join(project, 'photos', 'photo-20261106-090507.png'));
    expect(decide('execute', { command: 'canvas.insert', params: { path: file, plane: 'XY', width: 120 } })).toEqual({ allow: true });
    expect(decide('batch', { commands: [{ command: 'canvas.insert', params: { path: file } }] })).toEqual({ allow: true });
  });

  it('refuses any other file for a canvas', () => {
    const base = join(tmpdir(), 'Docs');
    // The ".." one is put together by hand: join() would resolve it away.
    const climbing = [base, 'photos', '..', 'secret', 'photos', 'photo-20261106-090507.png'].join(sep);
    for (const path of [climbing, join(base, 'photos', 'holiday.png'), join(base, 'notes.txt')]) {
      expect(decide('execute', { command: 'canvas.insert', params: { path } }).allow).toBe(false);
    }
    const file = photoFile(base, new Date(2026, 0, 1));
    expect(decide('execute', { command: 'canvas.decal', params: { path: file } }).allow).toBe(false);
  });

  it('tells the model the photo has no scale, and how to use the saved photo', () => {
    const file = photoFile(join(tmpdir(), 'P'), new Date(2026, 10, 6, 9, 5, 7));
    const forward = file.replaceAll('\\', '/');
    const note = photoNote(file);
    expect(note).toContain('never read sizes off its pixels');
    expect(note).toContain('clarification card');
    // Forward slashes, as the model copies them into canvas.insert; the policy takes them too.
    expect(note).toContain(`\`${forward}\``);
    expect(decide('execute', { command: 'canvas.insert', params: { path: forward } })).toEqual({ allow: true });
    expect(note).toContain('canvas.calibrate');
    expect(note).toContain('compare_picture');
    expect(photoNote(null)).not.toContain('canvas.insert');
  });
});
