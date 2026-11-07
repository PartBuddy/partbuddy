import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { partNoteSchema, type PartNote, type PartsState } from '../../shared/contract';

/**
 * The parts list of a project (plan step P6, decided 2026-11-07: in the structure tree): per body
 * how many copies are needed and printed, the filament and a note, in `parts.json` next to the
 * design. None of the CAD tools compared tracks this; it is what a print-first app adds. Entries of
 * bodies that are gone stay (undo or a restore brings them back); `bodies` is the list of printed
 * bodies as the structure tree last showed it, so the start page can count without SolidCraft.
 */

export const PARTS_FILE = 'parts.json';
export const MAX_PARTS = 500;

function readRaw(folder: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(folder, PARTS_FILE), 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The parts list; a project without the file, or with a broken one, has none. Bad entries are left out. */
export function readParts(folder: string): PartsState {
  const raw = readRaw(folder);
  const parts: Record<string, PartNote> = {};
  if (typeof raw.parts === 'object' && raw.parts !== null) {
    for (const [body, note] of Object.entries(raw.parts as Record<string, unknown>).slice(0, MAX_PARTS)) {
      const parsed = partNoteSchema.safeParse(note);
      if (parsed.success && body.length <= 200) parts[body] = { ...parsed.data, printed: Math.min(parsed.data.printed, parsed.data.quantity) };
    }
  }
  const bodies = Array.isArray(raw.bodies) ? raw.bodies.filter((body): body is string => typeof body === 'string' && body.length <= 200).slice(0, MAX_PARTS) : [];
  return { parts, bodies };
}

/** Keeps one body's note and the printed bodies as they are now; the file is replaced in one step. */
export function writePart(folder: string, body: string, note: PartNote, bodies: string[]): PartsState {
  const raw = readRaw(folder);
  const current = readParts(folder);
  const next = { ...raw, schema: typeof raw.schema === 'number' ? raw.schema : 1, parts: { ...current.parts, [body]: { ...note, printed: Math.min(note.printed, note.quantity) } }, bodies: bodies.slice(0, MAX_PARTS) };
  const file = join(folder, PARTS_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return readParts(folder);
}

/** Printed copies of all printed bodies, for the start page tile; null without a parts list. */
export function partsProgress(folder: string): { printed: number; total: number } | null {
  const { parts, bodies } = readParts(folder);
  if (bodies.length === 0) return null;
  let printed = 0;
  let total = 0;
  for (const body of bodies) {
    const note = parts[body];
    total += note?.quantity ?? 1;
    printed += note?.printed ?? 0;
  }
  return { printed, total };
}
