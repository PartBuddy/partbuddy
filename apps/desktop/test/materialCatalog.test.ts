import { describe, expect, it } from 'vitest';

import { materialProfileSchema } from '../src/shared/contract';
import { MATERIAL_CATALOG } from '../src/shared/materialCatalog';

describe('the material catalog', () => {
  it.each(MATERIAL_CATALOG.map((entry) => [entry.name, entry] as const))('%s is a valid material profile', (_name, entry) => {
    const { source, checked, note, ...profile } = entry;
    expect(materialProfileSchema.safeParse({ id: 'catalog', ...profile }).success).toBe(true);
    expect(new URL(source).protocol).toBe('https:');
    expect(checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(note.trim()).not.toBe('');
  });

  it('names every material once', () => {
    const names = MATERIAL_CATALOG.map((entry) => entry.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
