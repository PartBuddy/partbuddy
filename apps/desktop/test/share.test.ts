import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shareDescription, type ShareFacts } from '../src/main/share/description';
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
    expect(text).toContain('- Material: PLA\n- Layer height: 0.2 mm\n- Nozzle: 0.4 mm\n- Supports: none needed, it prints as designed\n- Parts: 2 parts');
    expect(text).toContain('- Housing: 80 × 60 × 30 mm\n- Lid\n');
    expect(text).toContain('- `length` = 80 mm – Outer length of housing and lid\n- `count` = 4\n');
    expect(text).toContain('- `Housing.3mf` – ready for the slicer');
    expect(text).toContain('`Housing-iso.png`, `Housing-front.png` – pictures');
  });

  it('says where supports may be needed, or that the check has not run, and speaks German', () => {
    expect(shareDescription({ ...facts, check: { status: 'warn', overhang: true } })).toContain('check them in the slicer');
    expect(shareDescription({ ...facts, check: null })).toContain('Supports: not checked');
    expect(shareDescription(facts)).not.toContain('Hardware');
    expect(shareDescription({ ...facts, hardware: [{ count: 2, name: 'Socket head cap screw M3x12', standard: 'ISO 4762 M3x12' }] })).toContain(
      '## Hardware\n\n- 2 × Socket head cap screw M3x12 (ISO 4762 M3x12)',
    );
    const german = shareDescription({ ...facts, language: 'de', bodies: [{ name: 'Gehäuse', size: [80.5, 60, 30] }], parameters: [] });
    expect(german).toContain('- Schichthöhe: 0,2 mm');
    expect(german).toContain('- Gehäuse: 80,5 × 60 × 30 mm');
    expect(german).toContain('- Teile: 1 Teil');
    expect(german).not.toContain('## Parameter');
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
