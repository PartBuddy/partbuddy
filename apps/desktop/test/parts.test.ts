import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { partsProgress, readParts, writePart } from '../src/main/projects/parts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'partbuddy-parts-'));
  dirs.push(dir);
  return dir;
}
const note = (quantity: number, printed: number, filament = '', text = '') => ({ quantity, printed, filament, note: text });

describe('parts list (P6)', () => {
  it('has none in an old project and counts nothing on the start page', () => {
    const old = folder();
    expect(readParts(old)).toEqual({ parts: {}, bodies: [] });
    expect(partsProgress(old)).toBeNull();
    writeFileSync(join(old, 'parts.json'), 'not json');
    expect(readParts(old)).toEqual({ parts: {}, bodies: [] });
  });

  it('keeps copies, filament and note per body and counts printed copies over the printed bodies', () => {
    const dir = folder();
    writePart(dir, 'Fuß', note(4, 2, 'TPU schwarz'), ['Gehäuse', 'Deckel', 'Fuß']);
    writePart(dir, 'Gehäuse', note(1, 1, 'PETG'), ['Gehäuse', 'Deckel', 'Fuß']);
    expect(readParts(dir).parts['Fuß']).toEqual(note(4, 2, 'TPU schwarz'));
    // Gehäuse 1/1, Deckel 0/1 (no entry yet), Fuß 2/4.
    expect(partsProgress(dir)).toEqual({ printed: 3, total: 6 });
  });

  it('keeps entries of bodies that are gone, unknown fields, and never more printed than needed', () => {
    const dir = folder();
    writeFileSync(join(dir, 'parts.json'), JSON.stringify({ schema: 1, owner: 'later', parts: { Alt: note(2, 1), Kaputt: { quantity: 0 } }, bodies: ['Alt'] }));
    const state = writePart(dir, 'Neu', note(2, 5), ['Neu']);
    expect(state.parts).toEqual({ Alt: note(2, 1), Neu: note(2, 2) });
    expect(state.bodies).toEqual(['Neu']);
    expect(JSON.parse(readFileSync(join(dir, 'parts.json'), 'utf8'))).toMatchObject({ owner: 'later' });
    expect(partsProgress(dir)).toEqual({ printed: 2, total: 2 });
  });
});
