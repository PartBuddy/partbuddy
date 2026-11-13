import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { asksForUnit, boxSize, checkImportFile, insertIsLast, importKindOf, importName, insertCommand } from '../src/main/projects/importFile';
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

describe('the unit of an STL or OBJ (audit D44)', () => {
  const bed: [number, number, number] = [256, 256, 256];

  it('passes a unit other than millimetres to insert_mesh', () => {
    expect(insertCommand('mesh', 'a.stl', 'in')).toEqual({ command: 'file.insert_mesh', params: { path: 'a.stl', units: 'in' } });
    expect(insertCommand('mesh', 'a.stl', 'mm')).toEqual({ command: 'file.insert_mesh', params: { path: 'a.stl' } });
  });

  it('measures the box around the inserted bodies as inspect.measure gives it', () => {
    // A cylinder of radius 5 and height 10 read in millimetres and the same file in inches (SolidCraft 0.40.1).
    const measured = {
      bodies: [
        { name: 'c10', bbox: { min: [-4.999, -4.999, 0], max: [4.999, 4.999, 10] } },
        { name: 'c10 (2)', bbox: { min: [-126.981, -126.981, 0], max: [126.981, 126.981, 254] } },
        { name: 'odd', bbox: { min: [0, 0], max: [1, 1, 1] } },
      ],
    };
    expect(boxSize(measured, ['c10'])).toEqual([9.998, 9.998, 10]);
    expect(boxSize(measured)).toEqual([253.962, 253.962, 254]);
    expect(boxSize(measured, ['odd'])).toBeNull();
    expect(boxSize(undefined)).toBeNull();
  });

  it('asks for a mesh under 5 mm or larger than the bed, on either side of each bound, and never for a 3MF', () => {
    expect(asksForUnit('cube.stl', [1, 1, 1], bed)).toBe(true);
    expect(asksForUnit('Würfel.OBJ', [4.999, 2, 2], bed)).toBe(true);
    expect(asksForUnit('clip.stl', [5, 2, 2], bed)).toBe(false);
    expect(asksForUnit('clip.stl', [256, 20, 20], bed)).toBe(false);
    expect(asksForUnit('clip.stl', [256.001, 20, 20], bed)).toBe(true);
    expect(asksForUnit('clip.3mf', [1, 1, 1], bed)).toBe(false);
    expect(asksForUnit('clip.stl', null, bed)).toBe(false);
  });
});

describe('taking back an insert for its unit (review of BC-04, S2)', () => {
  const after = { documentId: 'doc', revision: 40, undo: 12, redo: 0, marker: 9 };

  it('takes it back when nothing changed since, and not after another step or with something to redo', () => {
    expect(insertIsLast(after, { ...after })).toBe(true);
    // A save moved the revision below the cap: still the insert.
    expect(insertIsLast(after, { ...after, revision: 41 })).toBe(true);
    expect(insertIsLast(after, { ...after, undo: 13, revision: 41 })).toBe(false);
    expect(insertIsLast(after, { ...after, undo: 11, redo: 1 })).toBe(false);
    expect(insertIsLast(after, { ...after, documentId: 'other' })).toBe(false);
  });

  it('sees a step of the assistant at the undo cap of 200, where the depth stays', () => {
    const capped = { ...after, undo: 200 };
    expect(insertIsLast(capped, { ...capped })).toBe(true);
    expect(insertIsLast(capped, { ...capped, revision: 41 })).toBe(false);
    expect(insertIsLast(capped, { ...capped, marker: 10 })).toBe(false);
    expect(insertIsLast({ ...capped, undo: 199 }, { ...capped, undo: 199, revision: 41 })).toBe(true);
  });
});
