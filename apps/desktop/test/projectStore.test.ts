import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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
    // The plan's name beats a body name like "Base", which names a case badly.
    expect(store.autosaveTarget(null, 'Untitled', ['Base', 'Lid'], true, 'Pi 4 case')).toBe(join(root, 'Pi 4 case', 'Pi 4 case.sc'));
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

describe('the start page (B3)', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('picture')]);

  function project(root: string, name: string, modified: number): string {
    const design = ProjectStore.designIn(join(root, name));
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(design, 'design');
    utimesSync(design, modified / 1000, modified / 1000);
    return design;
  }

  it('lists the project folders newest first and leaves out folders without their design', () => {
    const { root, store } = folders();
    project(root, 'Alt', 1_700_000_000_000);
    project(root, 'Neu', 1_800_000_000_000);
    mkdirSync(join(root, 'Fremd'));
    writeFileSync(join(root, 'Fremd', 'other.sc'), 'x');
    writeFileSync(join(root, 'lose.sc'), 'x');
    const list = store.list();
    expect(list.map((entry) => entry.name)).toEqual(['Neu', 'Alt']);
    expect(list[0]).toMatchObject({ folder: join(root, 'Neu'), preview: null, check: null });
    expect(list[0]?.modified).toBe(1_800_000_000_000);
  });

  it('writes the preview and the light into the project and reads them back', () => {
    const { root, store } = folders();
    const design = project(root, 'Halter', Date.now());
    expect(store.writePreview(design, png, 'warn')).toBe(true);
    const [entry] = store.list();
    expect(entry?.check).toBe('warn');
    expect(entry?.preview).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(readFileSync(join(root, 'Halter', 'preview.png'))).toEqual(png);
  });

  it('refuses a picture that is no PNG, too large, or outside the project folder', () => {
    const { root, store } = folders();
    const design = project(root, 'Halter', Date.now());
    expect(store.writePreview(design, Buffer.from('<svg/>'), null)).toBe(false);
    expect(store.writePreview(design, Buffer.concat([png, Buffer.alloc(1024 * 1024)]), null)).toBe(false);
    const elsewhere = mkdtempSync(join(tmpdir(), 'partbuddy-else-'));
    dirs.push(elsewhere);
    const outside = join(elsewhere, 'X.sc');
    writeFileSync(outside, 'design');
    expect(store.writePreview(outside, png, null)).toBe(false);
    expect(existsSync(join(root, 'Halter', 'preview.png'))).toBe(false);
  });

  it('opens only project folders directly in the project folder', () => {
    const { root, store } = folders();
    const design = project(root, 'Halter', Date.now());
    expect(store.designOfFolder(join(root, 'Halter'))).toBe(design);
    expect(store.designOfFolder(join(root, 'Halter', '..', 'Halter'))).toBe(design);
    expect(store.designOfFolder(join(root, 'Fehlt'))).toBeNull();
    expect(store.designOfFolder(root)).toBeNull();
    expect(store.designOfFolder(join(root, '..'))).toBeNull();
    expect(store.designOfFolder('Halter')).toBeNull();
  });

  it('a renamed or duplicated project keeps its preview', async () => {
    const { root, store } = folders();
    const design = project(root, 'Halter', Date.now());
    store.writePreview(design, png, 'ready');
    const renamed = await store.rename(design, 'Wandhalter');
    const copy = store.duplicate(renamed, 'Kopie');
    const list = store.list().map((entry) => [entry.name, entry.check]);
    expect(list).toHaveLength(2);
    expect(list).toEqual(expect.arrayContaining([['Wandhalter', 'ready'], ['Wandhalter Kopie', 'ready']]));
    expect(existsSync(join(ProjectStore.folderOf(copy), 'preview.png'))).toBe(true);
  });
});

describe('a version as a project (P4)', () => {
  it('copies the version and the print settings into a new project, leaving the source as it was', () => {
    const { root, store } = folders();
    const design = project(root, 'Halter', { 'Halter.print.json': '{"layer":0.2}', 'Halter.chat.json': '[1]' });
    const version = join(root, 'Halter', 'versions', 'v-1', 'design.sc');
    mkdirSync(join(version, '..'), { recursive: true });
    writeFileSync(version, 'old design');
    const copy = store.fromVersion(design, version, 'vor dem Deckel');
    expect(copy).toBe(join(root, 'Halter vor dem Deckel', 'Halter vor dem Deckel.sc'));
    expect(readFileSync(copy, 'utf8')).toBe('old design');
    expect(readFileSync(join(root, 'Halter vor dem Deckel', 'Halter vor dem Deckel.print.json'), 'utf8')).toBe('{"layer":0.2}');
    expect(existsSync(join(root, 'Halter vor dem Deckel', 'Halter vor dem Deckel.chat.json'))).toBe(false);
    expect(readFileSync(design, 'utf8')).toBe('design');
  });
});
