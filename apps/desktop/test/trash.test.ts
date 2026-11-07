import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectStore } from '../src/main/projects/projectStore';
import { ProjectTrash, TRASH_DAYS, TRASH_FOLDER } from '../src/main/projects/trash';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup(start = 1_000_000) {
  const root = mkdtempSync(join(tmpdir(), 'partbuddy-trash-'));
  const state = mkdtempSync(join(tmpdir(), 'partbuddy-state-'));
  dirs.push(root, state);
  const store = new ProjectStore(root, state);
  const discarded: string[] = [];
  let now = start;
  const trash = new ProjectTrash(
    store,
    (folder) => {
      discarded.push(folder);
      rmSync(folder, { recursive: true, force: true });
      return Promise.resolve();
    },
    () => now,
  );
  return { root, store, trash, discarded, later: (ms: number) => (now += ms) };
}

/** A project as B2–B5 wrote it: design, companions, preview and a version. */
function project(root: string, name: string): string {
  const folder = join(root, name);
  mkdirSync(join(folder, 'versions', 'v-1'), { recursive: true });
  const design = join(folder, `${name}.sc`);
  writeFileSync(design, 'design');
  writeFileSync(join(folder, `${name}.chat.json`), '[]');
  writeFileSync(join(folder, `${name}.print.json`), '{}');
  writeFileSync(join(folder, 'versions', 'v-1', 'design.sc'), 'old');
  return design;
}

describe('recycle bin (P2)', () => {
  it('moves a project whole, hides it from the list and restores it with everything', async () => {
    const { root, store, trash } = setup();
    const design = project(root, 'Halter');
    const id = await trash.put(design);
    expect(existsSync(join(root, 'Halter'))).toBe(false);
    expect(store.list()).toEqual([]);
    expect(trash.list()).toMatchObject([{ id, name: 'Halter', trashed: 1_000_000, preview: null }]);

    const back = await trash.restore(id);
    expect(back).toBe(join(root, 'Halter', 'Halter.sc'));
    expect(readFileSync(join(root, 'Halter', 'Halter.chat.json'), 'utf8')).toBe('[]');
    expect(readFileSync(join(root, 'Halter', 'versions', 'v-1', 'design.sc'), 'utf8')).toBe('old');
    expect(trash.list()).toEqual([]);
    expect(existsSync(join(root, TRASH_FOLDER, id))).toBe(false);
  });

  it('restores under the next free name when the old one is taken again', async () => {
    const { root, trash } = setup();
    const id = await trash.put(project(root, 'Halter'));
    project(root, 'Halter');
    const back = await trash.restore(id);
    expect(back).toBe(join(root, 'Halter 2', 'Halter 2.sc'));
    expect(existsSync(join(root, 'Halter 2', 'Halter 2.chat.json'))).toBe(true);
  });

  it('hands only entries older than 30 days on, or all when emptied', async () => {
    const { root, trash, discarded, later } = setup();
    const old = await trash.put(project(root, 'Alt'));
    later(TRASH_DAYS * 24 * 60 * 60 * 1000);
    const fresh = await trash.put(project(root, 'Neu'));
    expect(await trash.empty(true)).toBe(1);
    expect(discarded).toEqual([join(root, TRASH_FOLDER, old)]);
    expect(trash.list().map((entry) => entry.id)).toEqual([fresh]);
    expect(await trash.empty()).toBe(1);
    expect(trash.list()).toEqual([]);
  });

  it('refuses ids, notes and designs that are not its own', async () => {
    const { root, trash } = setup();
    await expect(trash.restore('../Halter')).rejects.toThrow();
    await expect(trash.put(join(tmpdir(), 'elsewhere', 'x.sc'))).rejects.toThrow();
    // A note whose name tries to leave its slot.
    mkdirSync(join(root, TRASH_FOLDER, 't-1'), { recursive: true });
    writeFileSync(join(root, TRASH_FOLDER, 't-1', 'trashed.json'), JSON.stringify({ name: '..', trashed: 1 }));
    writeFileSync(join(root, TRASH_FOLDER, 't-2'), 'not a folder');
    expect(trash.list()).toEqual([]);
    await expect(trash.restore('t-1')).rejects.toThrow();
  });
});
