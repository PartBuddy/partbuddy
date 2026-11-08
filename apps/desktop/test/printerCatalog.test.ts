import { describe, expect, it } from 'vitest';

import { printerProfileSchema } from '../src/shared/contract';
import { PRINTER_CATALOG } from '../src/shared/printerCatalog';

describe('the printer catalog', () => {
  it.each(PRINTER_CATALOG.map((entry) => [`${entry.brand} ${entry.model}`, entry] as const))('%s is a valid printer profile', (name, entry) => {
    expect(printerProfileSchema.safeParse({ id: 'catalog', name, bed: entry.bed, nozzle: entry.nozzle, layer: entry.layer }).success).toBe(true);
    expect(new URL(entry.source).protocol).toBe('https:');
    expect(entry.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('names every printer once', () => {
    const names = PRINTER_CATALOG.map((entry) => `${entry.brand} ${entry.model}`.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
