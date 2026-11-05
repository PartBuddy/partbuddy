import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PRINT_SETTINGS } from '../src/main/print/printProfiles';
import { Measurements } from '../src/main/print/measurements';
import { suggestionsFor } from '../src/shared/calibration';
import type { Measurement, StoredMeasurement } from '../src/shared/contract';

const petg = DEFAULT_PRINT_SETTINGS.materials.find((item) => item.id === 'petg');
if (!petg) throw new Error('starting values changed');

let serial = 0;
const entry = (measurement: Measurement, material = 'petg'): StoredMeasurement => {
  serial += 1;
  return { ...measurement, id: `m-${String(serial)}`, material, at: '2026-11-05T12:00:00.000Z' };
};

let folder: string | null = null;
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = null;
});

describe('measure after printing (M7)', () => {
  it('suggests the hole allowance from the median of drawn minus measured, not swayed by one odd print', () => {
    const measured = [
      entry({ kind: 'hole', drawn: 6.8, measured: 6.55 }),
      entry({ kind: 'hole', drawn: 8.4, measured: 8.16 }),
      entry({ kind: 'hole', drawn: 3.4, measured: 2.6 }),
      // Another material's hole does not count.
      entry({ kind: 'hole', drawn: 5, measured: 4.5 }, 'pla'),
    ];
    expect(suggestionsFor(petg, measured).holeShrink).toEqual({ value: 0.25, count: 3 });
  });

  it('suggests the outer growth from outer sizes', () => {
    const measured = [entry({ kind: 'outer', drawn: 6, measured: 6.1 }), entry({ kind: 'outer', drawn: 20, measured: 20.14 })];
    expect(suggestionsFor(petg, measured).outerGrowth).toEqual({ value: 0.12, count: 2 });
  });

  it('moves a clearance one step from what it was printed with, after the latest feedback', () => {
    const measured = [
      entry({ kind: 'fit', fit: 'slide', verdict: 'loose', clearance: 0.3 }),
      entry({ kind: 'fit', fit: 'slide', verdict: 'tight', clearance: 0.3 }),
      entry({ kind: 'fit', fit: 'clamp', verdict: 'loose', clearance: 0.1 }),
      entry({ kind: 'fit', fit: 'push', verdict: 'ok', clearance: 0.2 }),
    ];
    const { clearance } = suggestionsFor(petg, measured);
    expect(clearance.slide).toEqual({ value: 0.35, count: 2 });
    expect(clearance.clamp).toEqual({ value: 0.05, count: 1 });
    // "Fits" with the current value suggests nothing.
    expect(clearance.push).toBeUndefined();
  });

  it('suggests nothing when the material already has the measured values', () => {
    const measured = [entry({ kind: 'hole', drawn: 6.8, measured: 6.6 })];
    expect(suggestionsFor(petg, measured)).toEqual({ holeShrink: null, outerGrowth: null, clearance: {} });
  });

  it('keeps measurements in a file, removes them by id, and starts empty from a damaged file', () => {
    folder = mkdtempSync(join(tmpdir(), 'partbuddy-measure-'));
    const file = join(folder, 'print-measurements.json');
    const store = new Measurements(file, () => undefined);
    const [first] = store.add('petg', { kind: 'hole', drawn: 6.8, measured: 6.55 });
    store.add('petg', { kind: 'fit', fit: 'slide', verdict: 'tight', clearance: 0.3 });
    expect(new Measurements(file, () => undefined).all()).toHaveLength(2);
    expect(store.remove(first?.id ?? '')).toHaveLength(1);
    writeFileSync(file, '[{"kind":"hole"}]');
    const logged: string[] = [];
    expect(new Measurements(file, (line) => logged.push(line)).all()).toEqual([]);
    expect(logged.join('\n')).toContain('do not match their format');
  });
});
