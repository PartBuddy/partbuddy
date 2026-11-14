import { describe, expect, it } from 'vitest';

import { DEFAULT_PRINT_SETTINGS } from '../src/main/print/printProfiles';
import { withProfiles, withSwitch } from '../src/renderer/src/print/settingsMerge';

describe('switches and the profile editor save onto the settings as stored (BC-24 review)', () => {
  const stored = { ...DEFAULT_PRINT_SETTINGS, printers: [{ id: 'mk4', name: 'Prusa MK4', bed: [250, 210, 220] as [number, number, number], nozzle: 0.4, layer: 0.2 }], printer: 'mk4' };

  it('a switch changes only its own value, not the printers the editor saved meanwhile', () => {
    const next = withSwitch(stored, 'hints', 'smallHole', false);
    expect(next.printers).toEqual(stored.printers);
    expect(next.hints).toEqual({ smallHole: false, narrowGap: true, sharpEdge: true });
    expect(withSwitch(stored, 'design', 'rounding', false).design).toEqual({ ...stored.design, rounding: false });
  });

  it('the editor keeps the switches as stored, not as it loaded them', () => {
    const switched = withSwitch(withSwitch(stored, 'hints', 'narrowGap', false), 'design', 'snap', false);
    const edited = { ...DEFAULT_PRINT_SETTINGS, material: 'petg' };
    const next = withProfiles(edited, switched);
    expect(next.material).toBe('petg');
    expect(next.printers).toEqual(DEFAULT_PRINT_SETTINGS.printers);
    expect(next.hints.narrowGap).toBe(false);
    expect(next.design.snap).toBe(false);
  });
});
