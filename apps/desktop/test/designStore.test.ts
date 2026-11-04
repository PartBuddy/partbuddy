import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DesignStore, isInside, safeDesignFileName } from '../src/main/solidcraft/headless';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function store(): { dir: string; designs: DesignStore } {
  const dir = mkdtempSync(join(tmpdir(), 'partbuddy-designs-'));
  dirs.push(dir);
  return { dir, designs: new DesignStore(dir) };
}

describe('headless design store (ADR 0016)', () => {
  it('names the file after the design and keeps it inside the designs folder', () => {
    const { dir, designs } = store();
    expect(designs.fileFor('Kabelclip groß')).toBe(join(dir, 'Kabelclip groß.sc'));
    expect(designs.fileFor('../../Windows/evil')).toBe(join(dir, 'Windowsevil.sc'));
    expect(designs.fileFor('parts\\temp\\x:y*?|<>')).toBe(join(dir, 'partstempxy.sc'));
    expect(designs.fileFor('')).toBe(join(dir, 'Untitled.sc'));
    expect(designs.fileFor('...')).toBe(join(dir, 'Untitled.sc'));
  });

  it('remembers the last design only while its file exists', () => {
    const { designs } = store();
    expect(designs.last()).toBeUndefined();
    const file = designs.fileFor('Untitled');
    designs.remember(file);
    expect(designs.last()).toBeUndefined();
    writeFileSync(file, 'design');
    expect(designs.last()).toBe(file);
    designs.forget();
    expect(designs.last()).toBeUndefined();
  });

  it('ignores a note that points outside the designs folder', () => {
    const { dir, designs } = store();
    writeFileSync(join(dir, 'last.json'), JSON.stringify({ file: '..\\..\\secret.sc' }));
    writeFileSync(join(dir, '....secret.sc'), 'x');
    // Separators are dropped, so the note can only name a file directly in the folder.
    expect(designs.last()).toBe(join(dir, '....secret.sc'));
  });

  it('remembers a design in the project folder after "Open in SolidCraft", and nothing outside', () => {
    const { dir } = store();
    const projects = mkdtempSync(join(tmpdir(), 'partbuddy-projects-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'partbuddy-elsewhere-'));
    dirs.push(projects, elsewhere);
    const designs = new DesignStore(dir, [projects]);

    const own = join(projects, 'Kabelclip.sc');
    writeFileSync(own, 'design');
    designs.remember(own);
    expect(designs.last()).toBe(own);

    const outside = join(elsewhere, 'fremd.sc');
    writeFileSync(outside, 'design');
    writeFileSync(join(dir, 'last.json'), JSON.stringify({ file: outside }));
    expect(designs.last()).toBeUndefined();
    writeFileSync(join(dir, 'last.json'), JSON.stringify({ file: join(projects, '..', elsewhere.split(/[\\/]/).pop() ?? '', 'fremd.sc') }));
    expect(designs.last()).toBeUndefined();

    const notADesign = join(projects, 'notes.txt');
    writeFileSync(notADesign, 'x');
    writeFileSync(join(dir, 'last.json'), JSON.stringify({ file: notADesign }));
    expect(designs.last()).toBeUndefined();
  });

  it('checks containment after resolving the path', () => {
    const base = join(tmpdir(), 'pb-root');
    expect(isInside(base, join(base, 'a.sc'))).toBe(true);
    expect(isInside(base, join(base, '..', 'a.sc'))).toBe(false);
    expect(isInside(base, base)).toBe(false);
    expect(isInside(base, join(base, '....x.sc'))).toBe(true);
    expect(isInside(base, `${base}-evil${sep}a.sc`)).toBe(false);
    expect(safeDesignFileName('../x')).toBe('x');
  });
});
