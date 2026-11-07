import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

import { exportPackage, importPackage, readPackage } from '../src/main/projects/projectPackage';
import { ProjectStore } from '../src/main/projects/projectStore';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'partbuddy-package-'));
  const state = mkdtempSync(join(tmpdir(), 'partbuddy-state-'));
  const out = mkdtempSync(join(tmpdir(), 'partbuddy-out-'));
  dirs.push(root, state, out);
  return { root, out, store: new ProjectStore(root, state) };
}

function project(root: string, name: string): string {
  const folder = join(root, name);
  mkdirSync(join(folder, 'versions', 'v-1'), { recursive: true });
  mkdirSync(join(folder, 'exports'), { recursive: true });
  const design = join(folder, `${name}.sc`);
  writeFileSync(design, 'design');
  writeFileSync(join(folder, `${name}.chat.json`), '[]');
  writeFileSync(join(folder, 'versions', 'v-1', 'design.sc'), 'old');
  writeFileSync(join(folder, 'exports', 'part.3mf'), 'export');
  writeFileSync(join(folder, 'preview.png.123.tmp'), 'half');
  return design;
}

const manifest = { 'partbuddy-package.json': strToU8('{"schema":1}') };

describe('project package (P3)', () => {
  it('exports without exports and half-written files, and imports as a new project', async () => {
    const { root, out, store } = setup();
    const file = join(out, 'Halter.partbuddy');
    exportPackage(project(root, 'Halter'), file, '0.1.0');
    const { name, files } = readPackage(readFileSync(file));
    expect(name).toBe('Halter');
    expect([...files.keys()].sort()).toEqual(['Halter.chat.json', 'Halter.sc', 'versions/v-1/design.sc']);

    // The original is still there, so the import gets the next free name.
    const design = await importPackage(file, store);
    expect(design).toBe(join(root, 'Halter 2', 'Halter 2.sc'));
    expect(readFileSync(join(root, 'Halter 2', 'Halter 2.chat.json'), 'utf8')).toBe('[]');
    expect(readFileSync(join(root, 'Halter 2', 'versions', 'v-1', 'design.sc'), 'utf8')).toBe('old');
    expect(store.list().map((entry) => entry.name).sort()).toEqual(['Halter', 'Halter 2']);
    expect(readdirSync(root).filter((entry) => entry.startsWith('.import'))).toEqual([]);
  });

  it('refuses paths that leave the project, several projects, and packages without a design', () => {
    const pack = (files: Record<string, Uint8Array>) => zipSync({ ...manifest, ...files });
    const design = strToU8('design');
    expect(() => readPackage(pack({ 'A/A.sc': design, 'A/../../evil.txt': design }))).toThrow(/unsafe path/);
    expect(() => readPackage(pack({ 'A/A.sc': design, 'A/C:evil': design }))).toThrow(/unsafe path/);
    expect(() => readPackage(pack({ 'A/A.sc': design, 'A\\..\\evil': design }))).toThrow(/unsafe path/);
    expect(() => readPackage(pack({ 'A/A.sc': design, 'A/a\u0001b': design }))).toThrow(/unsafe path/);
    expect(() => readPackage(pack({ 'A/A.sc': design, 'B/B.sc': design }))).toThrow(/more than one/);
    expect(() => readPackage(pack({ 'A/notes.txt': design }))).toThrow(/no design/);
    expect(() => readPackage(zipSync({ 'A/A.sc': design }))).toThrow(/not a PartBuddy/);
    expect(() => readPackage(strToU8('not a zip'))).toThrow();
  });

  it('leaves nothing behind when an import fails', async () => {
    const { root, out, store } = setup();
    const file = join(out, 'broken.partbuddy');
    writeFileSync(file, zipSync({ ...manifest, 'A/notes.txt': strToU8('x') }));
    await expect(importPackage(file, store)).rejects.toThrow(/no design/);
    expect(readdirSync(root)).toEqual([]);
    expect(existsSync(join(root, 'A'))).toBe(false);
  });
});
