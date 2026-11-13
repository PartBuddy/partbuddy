import { describe, expect, it } from 'vitest';

import { refusalKind } from '../src/renderer/src/viewer/refusal';
import { PRINT_LIMIT } from '../src/shared/blocks';

describe('SolidCraft refusals in words (audit B-01)', () => {
  it('sorts known kernel messages into kinds with a sentence of their own', () => {
    expect(refusalKind('SMLib shell: operation: SMLib failed (status 1001)')).toBe('shell');
    expect(refusalKind('fillet failed: radius too large')).toBe('fillet');
    expect(refusalKind('Chamfer distance exceeds edge')).toBe('chamfer');
    expect(refusalKind('boolean subtract produced no solid')).toBe('boolean');
    expect(refusalKind('unknown')).toBe('other');
    // PartBuddy's own print limit of a form block (main/index.ts) has its own sentence, though its reason says cut or thickness.
    expect(refusalKind(`${PRINT_LIMIT}thickness 1.5: an arm under 1.8 mm (two lines on a 0.8 mm nozzle) does not print solid`)).toBe('limit');
    // The kernel's check names curve values like offset=; it is not about wall thickness (colour logo, 2026-11-10).
    expect(refusalKind("body `fox 4`: the operation failed: SMLib: SMLib's check refuses the result: 8 failed tests: SmBSplineCurve::Test #14 Bad CurveCusp (offset=2.4e-07)")).toBe('check');
  });
});
