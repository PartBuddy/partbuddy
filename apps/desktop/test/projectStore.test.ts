import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { migrateDesigns, ProjectStore } from '../src/main/projects/projectStore';
import { isInside, safeDesignFileName } from '../src/main/solidcraft/headless';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folders() {
  const root = mkdtempSync(join(tmpdir(), 'partbuddy-projects-'));
  const state = mkdtempSync(join(tmpdir(), 'partbuddy-state-'));
  dirs.push(root, state);
  return { root, state, store: new ProjectStore(root, state, 'Teil') };
}

function project(root: string, name: string, files: Record<string, string> = {}): string {
  const folder = join(root, name);
  mkdirSync(folder, { recursive: true });
  const design = join(folder, `${name}.sc`);
  writeFileSync(design, 'design');
  for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);
  return design;
}

describe('projects (B2)', () => {
  it('gives a new design a project once it has content, named after it, its first real body or "Teil"', () => {
    const { root, store } = folders();
    // Empty: nothing is saved yet.
    expect(store.autosaveTarget(null, 'Untitled', [], false)).toBeNull();
    expect(store.autosaveTarget(null, 'Untitled', ['Body1', 'Körper 2'], true)).toBe(join(root, 'Teil', 'Teil.sc'));
    expect(store.autosaveTarget(null, 'Untitled', ['Body1', 'Wandhalter'], true)).toBe(join(root, 'Wandhalter', 'Wandhalter.sc'));
    expect(store.autosaveTarget(null, 'Kabelclip', ['Body1'], true)).toBe(join(root, 'Kabelclip', 'Kabelclip.sc'));
    // A project of that name exists: the next free folder.
    project(root, 'Wandhalter');
    expect(store.autosaveTarget(null, 'Untitled', ['Wandhalter'], true)).toBe(join(root, 'Wandhalter 2', 'Wandhalter 2.sc'));
    // A project's design stays in its file; names cannot lead out of the project folder.
    expect(store.autosaveTarget(join(root, 'X', 'X.sc'), 'Untitled', [], false)).toBe(join(root, 'X', 'X.sc'));
    expect(store.autosaveTarget(null, 'Untitled', ['../../evil'], true)).toBe(join(root, 'evil', 'evil.sc'));
  });

  it('remembers the last project only while its design exists, and nothing outside', () => {
    const { root, state, store } = folders();
    expect(store.last()).toBeUndefined();
    const design = project(root, 'Kabelclip');
    store.remember(design);
    expect(store.last()).toBe(design);
    expect(store.holds(design)).toBe(true);
    const elsewhere = mkdtempSync(join(tmpdir(), 'partbuddy-elsewhere-'));
    dirs.push(elsewhere);
    writeFileSync(join(elsewhere, 'fremd.sc'), 'x');
    writeFileSync(join(state, 'last.json'), JSON.stringify({ file: join(elsewhere, 'fremd.sc') }));
    expect(store.last()).toBeUndefined();
    // A note from before projects names a file in the state folder by its bare name.
    writeFileSync(join(state, 'Alt.sc'), 'x');
    writeFileSync(join(state, 'last.json'), JSON.stringify({ file: 'Alt.sc' }));
    expect(store.last()).toBe(join(state, 'Alt.sc'));
    expect(store.holds(join(state, 'Alt.sc'))).toBe(false);
    store.forget();
    expect(store.last()).toBeUndefined();
  });

  it('renames a project with its files, refuses names that exist, and duplicates it', async () => {
    const { root, store } = folders();
    const design = project(root, 'Halter', { 'Halter.chat.json': '{}', 'Halter.print.json': '{}', 'Halter.sc.bak': 'b', 'exports.txt': 'e' });
    project(root, 'Belegt');
    expect(store.usableName('Belegt', design)).toEqual({ ok: false, reason: 'exists' });
    expect(store.usableName('***', design)).toEqual({ ok: false, reason: 'empty' });
    expect(store.usableName('Halter', design)).toEqual({ ok: true, name: 'Halter' });
    expect(store.usableName('  Wand/halter ', design)).toEqual({ ok: true, name: 'Wandhalter' });

    const renamed = await store.rename(design, 'Wandhalter');
    expect(renamed).toBe(join(root, 'Wandhalter', 'Wandhalter.sc'));
    for (const file of ['Wandhalter.sc', 'Wandhalter.chat.json', 'Wandhalter.print.json', 'Wandhalter.sc.bak', 'exports.txt']) {
      expect(existsSync(join(root, 'Wandhalter', file))).toBe(true);
    }
    expect(existsSync(join(root, 'Halter'))).toBe(false);

    const copy = store.duplicate(renamed, 'Kopie');
    expect(copy).toBe(join(root, 'Wandhalter Kopie', 'Wandhalter Kopie.sc'));
    expect(readFileSync(join(root, 'Wandhalter Kopie', 'Wandhalter Kopie.chat.json'), 'utf8')).toBe('{}');
    expect(store.duplicate(renamed, 'Kopie')).toBe(join(root, 'Wandhalter Kopie 2', 'Wandhalter Kopie 2.sc'));
  });

  it('copies a design from elsewhere into a new project with its conversation, leaving the original', () => {
    const { root, store } = folders();
    const elsewhere = mkdtempSync(join(tmpdir(), 'partbuddy-import-'));
    dirs.push(elsewhere);
    writeFileSync(join(elsewhere, 'Griff.sc'), 'design');
    writeFileSync(join(elsewhere, 'Griff.chat.json'), '{"chat":1}');
    const target = store.importDesign(join(elsewhere, 'Griff.sc'));
    expect(target).toBe(join(root, 'Griff', 'Griff.sc'));
    expect(readFileSync(join(root, 'Griff', 'Griff.chat.json'), 'utf8')).toBe('{"chat":1}');
    expect(existsSync(join(elsewhere, 'Griff.sc'))).toBe(true);
  });

  it('turns the designs kept before projects into projects once, and the last one stays open', () => {
    const { root, state, store } = folders();
    writeFileSync(join(state, 'Grundplatte.sc'), 'a');
    writeFileSync(join(state, 'Grundplatte.chat.json'), '{}');
    writeFileSync(join(state, 'Grundplatte.sc.bak'), 'old');
    writeFileSync(join(state, 'Untitled.sc'), 'b');
    writeFileSync(join(state, 'last.json'), JSON.stringify({ file: 'Grundplatte.sc' }));
    const logs: string[] = [];
    expect(migrateDesigns(state, store, (line) => logs.push(line))).toBe(2);
    expect(existsSync(join(root, 'Grundplatte', 'Grundplatte.chat.json'))).toBe(true);
    expect(existsSync(join(root, 'Untitled', 'Untitled.sc'))).toBe(true);
    expect(store.last()).toBe(join(root, 'Grundplatte', 'Grundplatte.sc'));
    // The originals stay as a backup, and a second start changes nothing.
    expect(existsSync(join(state, 'Grundplatte.sc'))).toBe(true);
    expect(migrateDesigns(state, store, () => undefined)).toBe(0);
    expect(existsSync(join(root, 'Grundplatte 2'))).toBe(false);
  });

  it('checks containment after resolving the path', () => {
    const base = join(tmpdir(), 'pb-root');
    expect(isInside(base, join(base, 'a.sc'))).toBe(true);
    expect(isInside(base, join(base, '..', 'a.sc'))).toBe(false);
    expect(isInside(base, base)).toBe(false);
    expect(isInside(base, `${base}-evil${sep}a.sc`)).toBe(false);
    expect(safeDesignFileName('../x')).toBe('x');
  });
});
