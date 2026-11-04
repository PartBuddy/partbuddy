import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { NoteAnchor } from '@partbuddy/geometry';
import { z } from 'zod';

/**
 * A note as stored in the design file (ADR 0020): one `document.metadata` key per note, because
 * SolidCraft limits a key to 64 KiB. The value carries the text, the anchor as set (ADR 0006), the
 * creation time and an HMAC with PartBuddy's local key; a note without a valid HMAC is foreign.
 */

/** PartBuddy's reverse-DNS key in SolidCraft's metadata; every note key starts with it. */
export const METADATA_PREFIX = 'io.github.manuelstaggl.partbuddy';
export const NOTE_KEY_PREFIX = `${METADATA_PREFIX}.note.`;
export const MAX_NOTE_TEXT = 1000;
export const MAX_NOTES = 500;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const name = z.string().min(1).max(410);
const signatureSchema = z
  .object({
    surface: z.enum(['plane', 'cylinder', 'other']),
    area: z.number(),
    centroid: vec3,
    normal: vec3.optional(),
    axis: vec3.optional(),
    radius: z.number().optional(),
  })
  .strict();
const localSchema = z.discriminatedUnion('frame', [
  z.object({ frame: z.literal('offset'), offset: vec3 }).strict(),
  z.object({ frame: z.literal('cylinder'), height: z.number(), radial: vec3 }).strict(),
]);
export const anchorSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('face'), body: name, face: name, exact: z.boolean(), local: localSchema, signature: signatureSchema, world: vec3, normal: vec3 })
    .strict(),
  z.object({ kind: z.literal('edge'), body: name, faces: z.tuple([name, name]), centroids: z.tuple([vec3, vec3]), world: vec3 }).strict(),
  z.object({ kind: z.literal('point'), body: name, world: vec3 }).strict(),
]);

export const noteIdSchema = z.string().regex(/^[a-z0-9]{6,16}$/);

export const storedNoteSchema = z
  .object({
    v: z.literal(1),
    id: noteIdSchema,
    text: z.string().min(1).max(MAX_NOTE_TEXT),
    anchor: anchorSchema,
    created: z.string().max(40),
    sig: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  })
  .strict();

export type StoredNote = z.infer<typeof storedNoteSchema>;

export function noteKey(id: string): string {
  return `${NOTE_KEY_PREFIX}${id}`;
}

export function newNoteId(): string {
  return randomBytes(6).toString('hex');
}

/**
 * The user's text as PartBuddy keeps it: NFC, no control characters except line breaks, trimmed,
 * at most 1000 characters.
 */
export function cleanText(text: string): string {
  return (
    text
      .normalize('NFC')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, MAX_NOTE_TEXT)
  );
}

/** JSON with sorted keys, so the same note always gives the same bytes to sign. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function mac(key: Buffer, note: Omit<StoredNote, 'sig'>): Buffer {
  const { v, id, text, anchor, created } = note;
  return createHmac('sha256', key).update(canonical({ v, id, text, anchor, created })).digest();
}

/** The note without its signature, to change and sign again. */
export function unsigned(note: StoredNote): Omit<StoredNote, 'sig'> {
  return { v: note.v, id: note.id, text: note.text, anchor: note.anchor, created: note.created };
}

/** The note with PartBuddy's HMAC over id, text, anchor and creation time. */
export function signNote(key: Buffer, note: Omit<StoredNote, 'sig'>): StoredNote {
  const { v, id, text, anchor, created } = note;
  return { v, id, text, anchor, created, sig: mac(key, note).toString('hex') };
}

/** True when this installation wrote the note and nobody changed it since. */
export function isOwnNote(key: Buffer, note: StoredNote): boolean {
  if (!note.sig) return false;
  const expected = mac(key, note);
  const given = Buffer.from(note.sig, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createNote(key: Buffer, id: string, text: string, anchor: NoteAnchor, created = new Date()): StoredNote {
  return signNote(key, { v: 1, id, text: cleanText(text), anchor, created: created.toISOString() });
}

/** PartBuddy's notes in a `document.metadata` object; entries that do not parse are counted, not shown. */
export function notesFromMetadata(metadata: unknown): { notes: StoredNote[]; unreadable: number } {
  const notes: StoredNote[] = [];
  let unreadable = 0;
  if (typeof metadata !== 'object' || metadata === null) return { notes, unreadable };
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (!key.startsWith(NOTE_KEY_PREFIX)) continue;
    const parsed = storedNoteSchema.safeParse(value);
    if (!parsed.success || noteKey(parsed.data.id) !== key || cleanText(parsed.data.text) !== parsed.data.text) {
      unreadable += 1;
      continue;
    }
    notes.push(parsed.data);
    if (notes.length >= MAX_NOTES) break;
  }
  notes.sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : 1));
  return { notes, unreadable };
}

/**
 * The note text for the model: between « », on one line, without the characters PartBuddy's own
 * notes use (`[`, `]`, guillemets), so a note cannot pose as a PartBuddy note.
 */
export function quoteForModel(text: string, max = MAX_NOTE_TEXT): string {
  const flat = text
    .replace(/\n+/g, ' / ')
    .replace(/[[\]]/g, (bracket) => (bracket === '[' ? '(' : ')'))
    .replace(/[«»‹›]/g, '"');
  return `«${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}»`;
}

/** Name of the PartBuddy credential that holds the 32-byte note key (hex). */
export const NOTE_KEY_SECRET = 'notes/key';

export interface KeyStore {
  read(name: string): string | null;
  write(name: string, value: string): void;
}

/** PartBuddy's note key: made on first use, kept in the credential store, never written to a file. */
export function loadNoteKey(store: KeyStore): Buffer {
  const existing = store.read(NOTE_KEY_SECRET);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return Buffer.from(existing, 'hex');
  const key = randomBytes(32);
  store.write(NOTE_KEY_SECRET, key.toString('hex'));
  return key;
}
