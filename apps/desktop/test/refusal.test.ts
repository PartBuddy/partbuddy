import { describe, expect, it } from 'vitest';

import { refusalKind } from '../src/renderer/src/viewer/refusal';

describe('SolidCraft refusals in words (audit B-01)', () => {
  it('sorts known kernel messages into kinds with a sentence of their own', () => {
    expect(refusalKind('SMLib shell: operation: SMLib failed (status 1001)')).toBe('shell');
    expect(refusalKind('fillet failed: radius too large')).toBe('fillet');
    expect(refusalKind('Chamfer distance exceeds edge')).toBe('chamfer');
    expect(refusalKind('boolean subtract produced no solid')).toBe('boolean');
    expect(refusalKind('unknown')).toBe('other');
  });
});
