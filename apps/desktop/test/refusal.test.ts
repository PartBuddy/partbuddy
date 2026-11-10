import { describe, expect, it } from 'vitest';

import { refusalKind } from '../src/renderer/src/viewer/refusal';

describe('SolidCraft refusals in words (audit B-01)', () => {
  it('sorts known kernel messages into kinds with a sentence of their own', () => {
    expect(refusalKind('SMLib shell: operation: SMLib failed (status 1001)')).toBe('shell');
    expect(refusalKind('fillet failed: radius too large')).toBe('fillet');
    expect(refusalKind('Chamfer distance exceeds edge')).toBe('chamfer');
    expect(refusalKind('boolean subtract produced no solid')).toBe('boolean');
    expect(refusalKind('unknown')).toBe('other');
    // The kernel's check names curve values like offset=; it is not about wall thickness (colour logo, 2026-11-10).
    expect(refusalKind("body `fox 4`: the operation failed: SMLib: SMLib's check refuses the result: 8 failed tests: SmBSplineCurve::Test #14 Bad CurveCusp (offset=2.4e-07)")).toBe('check');
  });
});
