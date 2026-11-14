import { describe, expect, it } from 'vitest';

import { limitOf, refusalKind, refusalText } from '../src/renderer/src/viewer/refusal';
import de from '../src/renderer/src/i18n/de.json';
import en from '../src/renderer/src/i18n/en.json';
import { PRINT_LIMIT, blockLimit, limitRefusal, type FeatureBlock } from '../src/shared/blocks';

describe('SolidCraft refusals in words (audit B-01)', () => {
  it('sorts known kernel messages into kinds with a sentence of their own', () => {
    expect(refusalKind('SMLib shell: operation: SMLib failed (status 1001)')).toBe('shell');
    expect(refusalKind('fillet failed: radius too large')).toBe('fillet');
    expect(refusalKind('Chamfer distance exceeds edge')).toBe('chamfer');
    expect(refusalKind('boolean subtract produced no solid')).toBe('boolean');
    expect(refusalKind('unknown')).toBe('other');
    // PartBuddy's own print limit of a form block (main/index.ts) has its own sentence, though its reason says cut or thickness.
    expect(refusalKind(`${PRINT_LIMIT}{}`)).toBe('limit');
    // The kernel's check names curve values like offset=; it is not about wall thickness (colour logo, 2026-11-10).
    expect(refusalKind("body `fox 4`: the operation failed: SMLib: SMLib's check refuses the result: 8 failed tests: SmBSplineCurve::Test #14 Bad CurveCusp (offset=2.4e-07)")).toBe('check');
  });
});

describe('a print limit of a form block in the interface language (third review of PR 369, K10)', () => {
  const ui = { block: 'text', body: 'Body1', point: [10, 0, 5], normal: [0, -1, 0], size: 'M3', text: 'UI', height: 3, depth: 0.6, mode: 'deboss', bold: true } as FeatureBlock;

  it('carries the limit as data and says size, why and what to give, without the internal prefix', () => {
    const limit = blockLimit(ui, { nozzle: 0.4, layer: 0.2 });
    expect(limit).toEqual({ key: 'height', value: 3, nozzle: 0.4, reason: 'strokeBold', least: 4, needed: 0.8, stroke: 0.61 });
    if (!limit) return;
    const raw = limitRefusal(limit);
    expect(limitOf(raw)).toEqual(limit);
    expect(limitOf(`${PRINT_LIMIT}not json`)).toBeNull();
    // A stand-in for i18next: the key with the values it fills in.
    const t = ((key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values ?? {})}`) as unknown as Parameters<typeof refusalText>[0];
    expect(refusalText(t, raw)).toBe(`blocks.limit.strokeBold ${JSON.stringify(limit)}`);
  });

  it('has a sentence for every reason in both languages, with the same placeholders', () => {
    const reasons = ['stroke', 'strokeBold', 'lipWall', 'grooveWall', 'armWall', 'catch', 'layer', 'screw', 'nutFlats', 'nutCorners', 'nutHeight', 'strain'];
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
    for (const reason of reasons) {
      const [english, german] = [(en.blocks.limit as Record<string, string>)[reason] ?? '', (de.blocks.limit as Record<string, string>)[reason] ?? ''];
      expect(english, reason).not.toBe('');
      expect(placeholders(german), reason).toEqual(placeholders(english));
    }
    expect(de.blocks.strokeUnchecked).toContain('Arial');
  });
});
