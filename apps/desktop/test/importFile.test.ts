import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkImportFile, importKindOf, importName, insertCommand } from '../src/main/projects/importFile';
import { describeCommands, describeUserAction } from '../src/shared/stepPhrases';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('import files (B4)', () => {
  it('knows designs, STEP and IGES, and meshes by their extension', () => {
    expect(importKindOf('Teile\\Teil.SC')).toBe('design');
    expect(['x.step', 'x.STP', 'x.iges', 'x.igs'].map(importKindOf)).toEqual(['step', 'step', 'step', 'step']);
    expect(['x.stl', 'x.3mf', 'x.OBJ'].map(importKindOf)).toEqual(['mesh', 'mesh', 'mesh']);
    expect(importKindOf('x.exe')).toBeNull();
    expect(importKindOf('step')).toBeNull();
    expect(importName('Platinen/Platine v2.step')).toBe('Platine v2');
  });

  it('checks a picked or dropped file before SolidCraft reads it', () => {
    const folder = mkdtempSync(join(tmpdir(), 'partbuddy-import-'));
    folders.push(folder);
    const stl = join(folder, 'Halter.stl');
    writeFileSync(stl, 'solid x\nendsolid x\n');
    writeFileSync(join(folder, 'notes.txt'), 'x');
    expect(checkImportFile(stl)).toBe('mesh');
    expect(() => checkImportFile('Halter.stl')).toThrow('absolute');
    expect(() => checkImportFile(join(folder, 'notes.txt'))).toThrow('cannot import');
    expect(() => checkImportFile(join(folder, 'missing.step'))).toThrow('does not exist');
    expect(() => checkImportFile(join(folder))).toThrow('cannot import');
  });

  it('inserts STEP with insert_step and meshes with insert_mesh, and says so in the work log', () => {
    expect(insertCommand('step', 'Teile\\a.step')).toEqual({ command: 'file.insert_step', params: { path: 'Teile\\a.step' } });
    expect(insertCommand('mesh', 'Teile\\a.stl').command).toBe('file.insert_mesh');
    expect(describeCommands([{ command: 'file.insert_mesh', params: { path: 'Teile\\Platine.stl' } }])).toEqual([{ key: 'insertFile', values: { name: 'Platine.stl' } }]);
    expect(describeCommands([{ command: 'mesh.convert', params: { body: 'Platine' } }])).toEqual([{ key: 'convertMesh', values: { name: 'Platine' } }]);
    expect(describeUserAction({ kind: 'repairBody', body: 'Gehäuse' })).toEqual({ key: 'repairBody', values: { name: 'Gehäuse' } });
  });
});
