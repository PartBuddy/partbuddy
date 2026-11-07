import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { partsProgress, readParts } from '../src/main/projects/parts';
import { readMeta } from '../src/main/projects/projectMeta';
import { ProjectStore } from '../src/main/projects/projectStore';
import { ProjectTrash } from '../src/main/projects/trash';
import { VersionStore } from '../src/main/projects/versionStore';

/**
 * Plan step P7: a project folder as PartBuddy wrote it before the project management steps (B2–B5,
 * F10, F12) opens with every new reader, and none of them writes a single byte into it.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Every file below `folder` with its SHA-256 and time of change. */
function snapshot(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(folder, path)] = `${createHash('sha256').update(readFileSync(path)).digest('hex')}:${String(statSync(path).mtimeMs)}`;
    }
  };
  walk(folder);
  return files;
}

describe('projects from before project management 2027 (P7)', () => {
  it('open with every new reader and stay byte for byte as they were', () => {
    const root = mkdtempSync(join(tmpdir(), 'partbuddy-compat-'));
    const state = mkdtempSync(join(tmpdir(), 'partbuddy-state-'));
    dirs.push(root, state);
    const folder = join(root, 'Wandhalter');
    mkdirSync(join(folder, 'versions', 'v-mhabc12'), { recursive: true });
    mkdirSync(join(folder, 'sketches'), { recursive: true });
    mkdirSync(join(folder, 'exports'), { recursive: true });
    writeFileSync(join(folder, 'Wandhalter.sc'), 'design');
    writeFileSync(join(folder, 'Wandhalter.sc.bak'), 'backup');
    writeFileSync(join(folder, 'Wandhalter.chat.json'), '[{"role":"user","text":"Haken"}]');
    writeFileSync(join(folder, 'Wandhalter.print.json'), '{"layer":0.2}');
    writeFileSync(join(folder, 'preview.png'), PNG);
    writeFileSync(join(folder, 'preview.json'), '{"check":"ready"}');
    writeFileSync(join(folder, 'assembly.json'), '{}');
    writeFileSync(join(folder, 'print-faces.json'), '{}');
    writeFileSync(join(folder, 'sketches', 'sketch-20261106-152000.json'), '{}');
    writeFileSync(join(folder, 'exports', 'Wandhalter.3mf'), '3mf');
    writeFileSync(join(folder, 'versions', 'v-mhabc12', 'design.sc'), 'old');
    writeFileSync(join(folder, 'versions', 'v-mhabc12', 'version.json'), JSON.stringify({ created: 1_762_400_000_000, reason: 'export', label: 'Wandhalter.3mf', hash: 'abc' }));
    const before = snapshot(root);

    const store = new ProjectStore(root, state);
    const [entry] = store.list();
    expect(entry).toMatchObject({ name: 'Wandhalter', check: 'ready', favorite: false, tags: [], progress: null });
    expect(entry?.preview).toMatch(/^data:image\/png;base64,/);
    const design = join(folder, 'Wandhalter.sc');
    expect(new VersionStore().list(design)).toMatchObject([{ id: 'v-mhabc12', reason: 'export', label: 'Wandhalter.3mf' }]);
    expect(readMeta(folder)).toEqual({ favorite: false, tags: [] });
    expect(readParts(folder)).toEqual({ parts: {}, bodies: [] });
    expect(partsProgress(folder)).toBeNull();
    expect(new ProjectTrash(store, () => Promise.resolve()).list()).toEqual([]);
    expect(store.designOfFolder(folder)).toBe(design);

    expect(snapshot(root)).toEqual(before);
  });
});
