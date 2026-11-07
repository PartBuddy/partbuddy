import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MAX_TAGS, normalTags, readMeta, writeMeta } from '../src/main/projects/projectMeta';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'partbuddy-meta-'));
  dirs.push(dir);
  return dir;
}

describe('favourites and tags (P5)', () => {
  it('reads an old project without the file, and a broken file, as no favourite and no tags', () => {
    const old = folder();
    expect(readMeta(old)).toEqual({ favorite: false, tags: [] });
    writeFileSync(join(old, 'project.json'), '{ broken');
    expect(readMeta(old)).toEqual({ favorite: false, tags: [] });
    writeFileSync(join(old, 'project.json'), '[1, 2]');
    expect(readMeta(old)).toEqual({ favorite: false, tags: [] });
  });

  it('normalises tags: trimmed, single spaces, unique without case, at most 20 of 40 characters', () => {
    expect(normalTags(['  Garage ', 'garage', 'Drucker   zubehör', '', 7, 'x'.repeat(50)])).toEqual(['Garage', 'Drucker zubehör', 'x'.repeat(40)]);
    expect(normalTags(Array.from({ length: 30 }, (_, n) => `t${String(n)}`))).toHaveLength(MAX_TAGS);
    expect(normalTags('Garage')).toEqual([]);
  });

  it('keeps fields it does not know and changes only what is asked', () => {
    const dir = folder();
    writeFileSync(join(dir, 'project.json'), JSON.stringify({ schema: 2, colour: 'blue', tags: ['Alt'] }));
    expect(writeMeta(dir, { favorite: true })).toEqual({ favorite: true, tags: ['Alt'] });
    expect(writeMeta(dir, { tags: ['Neu', 'neu'] })).toEqual({ favorite: true, tags: ['Neu'] });
    expect(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'))).toEqual({ schema: 2, colour: 'blue', favorite: true, tags: ['Neu'] });
  });
});
