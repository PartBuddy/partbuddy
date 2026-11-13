import { describe, expect, it } from 'vitest';

import { goneFaces } from './printFaceChanges';

describe('a print face that is gone is said (audit D20)', () => {
  it('names a shown body that lost its face, not one renamed, hidden or given another face', () => {
    const before = { Lid: 'F1:+z', Knob: 'F2:+z', Old: 'F1:-z', Hidden: 'F1:+z', Box: 'F1:-z' };
    const now = { Knob: 'F2:+z', New: 'F1:-z', Box: 'F3:-z' };
    expect(goneFaces(before, now, ['Lid', 'Knob', 'New', 'Box'])).toEqual(['Lid']);
    expect(goneFaces({}, now, ['Lid'])).toEqual([]);
  });
});
