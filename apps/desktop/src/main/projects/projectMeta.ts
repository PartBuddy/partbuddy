import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What the user notes about a project for the start page (plan step P5, decided 2026-11-07: tags
 * and favourites instead of folders): `project.json` in the project folder, written on the first
 * change only. A missing or broken file means no favourite and no tags; fields PartBuddy does not
 * know are kept when it writes, so a later version's notes survive an older one.
 */

export const META_FILE = 'project.json';
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

export interface ProjectMeta {
  favorite: boolean;
  tags: string[];
}

/** Tags as the user typed them: trimmed, inner spaces single, case-insensitively unique, bounded. */
export function normalTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const text = tag.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length === MAX_TAGS) break;
  }
  return result;
}

function readRaw(folder: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(folder, META_FILE), 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readMeta(folder: string): ProjectMeta {
  const raw = readRaw(folder);
  return { favorite: raw.favorite === true, tags: normalTags(raw.tags) };
}

/** Changes the favourite or the tags of a project; the file is replaced in one step. */
export function writeMeta(folder: string, change: Partial<ProjectMeta>): ProjectMeta {
  const raw = readRaw(folder);
  const next = { ...raw, schema: typeof raw.schema === 'number' ? raw.schema : 1, favorite: change.favorite ?? raw.favorite === true, tags: normalTags(change.tags ?? raw.tags) };
  const file = join(folder, META_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return { favorite: next.favorite, tags: next.tags };
}
