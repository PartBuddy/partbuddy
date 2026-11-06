import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { sketchStateSchema, type KeptSketch, type SketchState } from '../../shared/sketch';

/**
 * Sketches kept in the project (F10): every sketch that goes to the assistant is written to the
 * project's "sketches" folder as JSON with its picture next to it, so it can be opened, changed
 * and sent again after a restart. Reading checks the file against the sketch schema.
 */

export const SKETCHES_FOLDER = 'sketches';
const ID = /^sketch-\d{8}-\d{6}$/;
/** A listing shows the newest; older files stay on disk. */
const LISTED = 50;

/** The name of a sketch kept at `when`, e.g. sketch-20261106-152000. */
export function sketchId(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `sketch-${String(when.getFullYear())}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
}

const count = (state: SketchState) => Object.values(state.sheets).reduce((sum, items) => sum + items.length, 0);

/** Writes the sketch and its picture; a second sketch in the same second replaces the first. */
export function keepSketch(project: string, state: SketchState, png: Uint8Array, when = new Date()): string {
  const folder = join(project, SKETCHES_FOLDER);
  mkdirSync(folder, { recursive: true });
  const id = sketchId(when);
  writeFileSync(join(folder, `${id}.json`), JSON.stringify(state));
  writeFileSync(join(folder, `${id}.png`), png);
  return id;
}

/** The kept sketches, newest first; unreadable files are left out. */
export function listSketches(project: string, log: (message: string) => void = () => undefined): KeptSketch[] {
  const folder = join(project, SKETCHES_FOLDER);
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json') && ID.test(name.slice(0, -5)))
    .sort()
    .reverse()
    .slice(0, LISTED)
    .flatMap((name) => {
      const id = name.slice(0, -5);
      const state = loadSketch(project, id, log);
      if (!state) return [];
      return [{ id, savedAt: statSync(join(folder, name)).mtime.toISOString(), elements: count(state) }];
    });
}

/** One kept sketch, or null when the name is not a sketch's or the file does not hold one. */
export function loadSketch(project: string, id: string, log: (message: string) => void = () => undefined): SketchState | null {
  if (!ID.test(id)) return null;
  try {
    const parsed = sketchStateSchema.safeParse(JSON.parse(readFileSync(join(project, SKETCHES_FOLDER, `${id}.json`), 'utf8')));
    if (parsed.success) return parsed.data;
    log(`sketch ${id} is not readable: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
  } catch (error) {
    log(`sketch ${id} could not be read: ${(error as Error).message}`);
  }
  return null;
}
