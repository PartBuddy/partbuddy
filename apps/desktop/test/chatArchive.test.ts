import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ChatArchive, chatDigest, chatFileOf } from '../src/main/chat/chatArchive';
import type { StoredChatItem } from '../src/shared/contract';

const step = (id: string, length: number): StoredChatItem => ({
  kind: 'step',
  state: 'applied',
  step: { id, source: 'assistant', phrases: [{ key: 'box', values: { length, width: 20, height: 10 } }], documentId: 'd', revision: 1, depth: 1 },
});

const conversation: StoredChatItem[] = [
  { kind: 'user', text: 'Build a base plate 140 mm wide with a knurled edge', selected: { faces: 0, edges: 0, vertices: 0, bodies: [] } },
  step('s1', 140),
  { kind: 'assistant', text: 'The base plate is built; W sets its width.' },
  { kind: 'user', text: 'Bitte an den markierten Flächen noch eine Art Textur anbringen.', selection: 'F1:+x · Grundplatte' },
];

let folder: string | null = null;
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = null;
});

describe('the conversation kept with the design (2026-11-05)', () => {
  it('lies next to the design file', () => {
    expect(chatFileOf(join('designs', 'Grundplatte.sc'))).toBe(join('designs', 'Grundplatte.chat.json'));
  });

  it('is held until the design has a file, then written, and read back once with a summary for the model', () => {
    folder = mkdtempSync(join(tmpdir(), 'partbuddy-chat-'));
    let design: string | null = null;
    const archive = new ChatArchive({ designFile: () => design, log: () => undefined });
    archive.save(conversation);
    design = join(folder, 'Grundplatte.sc');
    archive.flush();
    const saved = JSON.parse(readFileSync(chatFileOf(design), 'utf8')) as { version: number; items: unknown[] };
    expect(saved.version).toBe(1);
    expect(saved.items).toHaveLength(4);

    const next = new ChatArchive({ designFile: () => design, log: () => undefined });
    expect(next.load()?.items).toEqual(conversation);
    const digest = next.takeDigest();
    expect(digest).toContain('The user asked: Bitte an den markierten Flächen');
    expect(digest).toContain('Your last answer: The base plate is built');
    expect(digest).toContain('1 steps were built');
    // Only once: the summary goes with the first message after the restart.
    expect(next.takeDigest()).toBeNull();
  });

  it('leaves out a file that does not match its format', () => {
    folder = mkdtempSync(join(tmpdir(), 'partbuddy-chat-'));
    const design = join(folder, 'Grundplatte.sc');
    writeFileSync(chatFileOf(design), JSON.stringify({ version: 1, savedAt: 'x', items: [{ kind: 'tool', name: 'execute' }] }));
    const logged: string[] = [];
    const archive = new ChatArchive({ designFile: () => design, log: (line) => logged.push(line) });
    expect(archive.load()).toBeNull();
    expect(logged[0]).toMatch(/does not match/);
  });

  it('keeps the summary short however long the conversation was', () => {
    const long = Array.from({ length: 50 }, (_, i): StoredChatItem => ({ kind: 'user', text: `Request ${String(i)} ${'x'.repeat(500)}` }));
    const digest = chatDigest(long) ?? '';
    expect(digest.length).toBeLessThanOrEqual(1500);
    expect(digest).toContain('Request 49');
    expect(digest).not.toContain('Request 10 ');
  });
});
