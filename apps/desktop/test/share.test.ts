import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shareCheck, shareDescription, type ShareFacts } from '../src/main/share/description';
import { freeFolder } from '../src/main/share/freeFolder';

const facts: ShareFacts = {
  name: 'Housing',
  language: 'en',
  bodies: [
    { name: 'Housing', size: [80, 60, 30] },
    { name: 'Lid', size: null },
  ],
  parameters: [
    { name: 'length', value: 80, unit: 'mm', comment: 'Outer length of housing and lid' },
    { name: 'count', value: 4, unit: '', comment: null },
  ],
  hardware: [],
  material: 'PLA',
  layer: 0.2,
  nozzle: 0.4,
  check: { status: 'ready', overhang: false },
  files: { model: 'Housing.3mf', step: 'Housing.step', pictures: ['Housing-iso.png', 'Housing-front.png'] },
};

describe('the sharing package (F5)', () => {
  it('describes parts, sizes, parameters and how it prints, and leaves the purpose to the user', () => {
    const text = shareDescription(facts);
    expect(text.startsWith('# Housing\n\n<!-- What is it')).toBe(true);
    expect(text).toContain('- Material: PLA\n- Layer height: 0.2 mm\n- Nozzle: 0.4 mm\n- Supports: the print check found no face that needs them; the slicer decides\n- Parts: 2 parts');
    expect(text).toContain('- Housing: 80 × 60 × 30 mm\n- Lid\n');
    expect(text).toContain('- `length` = 80 mm – Outer length of housing and lid\n- `count` = 4\n');
    expect(text).toContain('- `Housing.3mf` – each part on its print face where one is set, ready for the slicer');
    expect(text).toContain('`Housing-iso.png`, `Housing-front.png` – pictures');
  });

  it('reads an overhang made red by "Design without support" as faces to check, not as a part that does not print (audit R55)', () => {
    const overhang = { kind: 'overhang', severity: 'block' as const };
    expect(shareCheck({ status: 'block', findings: [overhang] })).toEqual({ status: 'warn', overhang: true });
    expect(shareDescription({ ...facts, check: shareCheck({ status: 'block', findings: [overhang] }) })).toContain('check them in the slicer');
    // Anything else that blocks still blocks, and so does a report that leaves findings out (review K2).
    expect(shareCheck({ status: 'block', findings: [overhang], omitted: 2 })).toEqual({ status: 'block', overhang: true });
    expect(shareCheck({ status: 'block', findings: [{ kind: 'size', severity: 'block' }, overhang] })).toEqual({ status: 'block', overhang: true });
    expect(shareCheck({ status: 'warn', findings: [{ kind: 'overhang', severity: 'warn' }] })).toEqual({ status: 'warn', overhang: true });
    expect(shareCheck({ status: 'ready', findings: [] })).toEqual({ status: 'ready', overhang: false });
  });

  it('says where supports may be needed, or that the check has not run, and speaks German', () => {
    expect(shareDescription({ ...facts, check: { status: 'warn', overhang: true } })).toContain('check them in the slicer');
    expect(shareDescription({ ...facts, check: null })).toContain('Supports: not checked');
    // A part the check blocks is never called printable without supports (audit D5).
    expect(shareDescription({ ...facts, check: { status: 'block', overhang: false } })).toContain("Supports: not settled: the print check found problems that keep the part from printing");
    expect(shareDescription({ ...facts, language: 'de', check: { status: 'block', overhang: false } })).toContain('Stützen: offen: die Prüfung von PartBuddy fand Probleme, die den Druck verhindern');
    expect(shareDescription(facts)).not.toContain('Hardware');
    expect(shareDescription({ ...facts, hardware: [{ count: 2, name: 'Socket head cap screw M3x12', standard: 'ISO 4762 M3x12' }] })).toContain(
      '## Hardware\n\n- 2 × Socket head cap screw M3x12 (ISO 4762 M3x12)',
    );
    const german = shareDescription({ ...facts, language: 'de', bodies: [{ name: 'Gehäuse', size: [80.5, 60, 30] }], parameters: [] });
    expect(german).toContain('- Schichthöhe: 0,2 mm');
    expect(german).toContain('- Gehäuse: 80,5 × 60 × 30 mm');
    expect(german).toContain('- Teile: 1 Teil');
    expect(german).not.toContain('## Parameter');
    // Copies and filament from the parts list (P6).
    expect(shareDescription({ ...facts, bodies: [{ name: 'Foot', size: [10, 10, 5], quantity: 4, filament: 'TPU black' }] })).toContain('- 4 × Foot: 10 × 10 × 5 mm (TPU black)');
  });

  it('keeps names from the design on one line and without markup', () => {
    const text = shareDescription({ ...facts, name: 'Box <script>\nalert(1)', bodies: [{ name: 'A\nB', size: null }] });
    expect(text).toContain('# Box script alert(1)');
    expect(text).toContain('- A B\n');
  });

  it('never overwrites an earlier package', () => {
    const taken = new Set([join('E', 'Housing share'), join('E', 'Housing share (2)')]);
    expect(freeFolder('E', 'Housing share', (path) => taken.has(path))).toBe(join('E', 'Housing share (3)'));
    expect(freeFolder('E', 'Lid share', (path) => taken.has(path))).toBe(join('E', 'Lid share'));
  });
});
