import { describe, expect, it } from 'vitest';

import { materialProfileSchema } from '../src/shared/contract';
import { MATERIAL_CATALOG } from '../src/shared/materialCatalog';
import { LARGEST_HOLE, PRINT_UNDERSIZE } from '../src/shared/tolerances';

describe('the material catalog', () => {
  it.each(MATERIAL_CATALOG.map((entry) => [entry.name, entry] as const))('%s is a valid material profile', (_name, entry) => {
    // shrink is what holeShrink is made of, not a field of the profile.
    const { source, checked, note, shrink, ...profile } = entry;
    expect(shrink).toBeGreaterThanOrEqual(0);
    expect(materialProfileSchema.safeParse({ id: 'catalog', ...profile }).success).toBe(true);
    expect(new URL(source).protocol).toBe('https:');
    expect(checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(note.trim()).not.toBe('');
  });

  it('makes every hole allowance of the printing share and the shrinkage on the largest measured hole (audit T23, T55, MG-27)', () => {
    for (const entry of MATERIAL_CATALOG) {
      const exact = PRINT_UNDERSIZE + (entry.shrink / 100) * LARGEST_HOLE;
      // On 0.05 mm, so never more than half a step off the formula.
      expect(Math.abs(entry.holeShrink - exact)).toBeLessThanOrEqual(0.025 + 1e-9);
      expect(Math.round(entry.holeShrink * 20) / 20).toBe(entry.holeShrink);
    }
    const hole = (name: string) => MATERIAL_CATALOG.find((entry) => entry.name === name)?.holeShrink;
    // Changed by the sources read on 2026-11-13 (audit MG-28; the Raise3D data sheets speak of annealing, not cooling).
    expect([hole('PA (Nylon)'), hole('PA-CF'), hole('PA12-CF'), hole('PET-CF'), hole('PLA-CF'), hole('PETG-CF')]).toEqual([0.25, 0.2, 0.2, 0.15, 0.15, 0.15]);
    // Unchanged where the sources hold the old value.
    expect([hole('PLA'), hole('PETG'), hole('ABS'), hole('ABS-GF'), hole('ASA'), hole('PC'), hole('HIPS'), hole('TPU 95A'), hole('PP')]).toEqual([0.15, 0.15, 0.25, 0.15, 0.15, 0.2, 0.15, 0.1, 0.3]);
    // Fibre types never shrink more than their base (BC-20 review S3).
    for (const [fibre, base] of [['PLA-CF', 'PLA'], ['PETG-CF', 'PETG'], ['ABS-GF', 'ABS'], ['PA-CF', 'PA (Nylon)'], ['PA12-CF', 'PA (Nylon)']] as const) expect(hole(fibre)).toBeLessThanOrEqual(hole(base) ?? 0);
  });

  it('says in every note where a number has no source', () => {
    for (const entry of MATERIAL_CATALOG) expect(entry.note).toMatch(/Prusa|SpecialChem|Filament2Print|Bambu Lab|Hubs|Derived|own choice/);
  });

  it('names every material once', () => {
    const names = MATERIAL_CATALOG.map((entry) => entry.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
