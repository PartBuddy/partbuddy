import { describe, expect, it } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { reportOf } from '../src/renderer/src/print/usePrintCheck';
import { printCheckReportSchema } from '../src/shared/contract';

describe('the ready-to-print check as the assistant reads it (M7)', () => {
  it('says plainly when nothing was found', () => {
    expect(printCheckNote({ status: 'ready', findings: [], nozzle: 0.4 })).toContain('ready to print, nothing found');
  });

  it('words every finding with its numbers and quoted face names, blocking ones first', () => {
    const report = reportOf(
      {
        status: 'block',
        findings: [
          { kind: 'size', severity: 'block', size: [300, 20, 20], bed: [256, 256, 256], lying: true },
          { kind: 'thinWall', severity: 'block', thickness: 0.3, minimum: 0.9, area: 400, places: [{ body: 'Plate', faces: ['F1:+z', 'F1:-z'] }], box: { min: [0, 0, 0], max: [20, 20, 0.3] } },
          { kind: 'support', severity: 'warn', area: 120, limit: 45, places: [{ body: 'Top', faces: ['F3:-z'] }], box: null },
          { kind: 'feature', severity: 'warn', feature: 'Shell1', message: 'thin result' },
        ],
      },
      0.4,
    );
    // The report carries no camera boxes and fits the contract.
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toContain('box');

    const note = printCheckNote(report);
    expect(note).toContain('not ready to print');
    expect(note).toContain('the part is 300 × 20 × 20 mm, the printer takes 256 × 256 × 256 mm; it would fit lying on another side');
    expect(note).toContain('walls down to 0.3 mm, thinner than the 0.4 mm nozzle, so they do not print (faces "F1:+z", "F1:-z" of body "Plate")');
    expect(note).toContain('120 mm² lean more than 45° from the vertical and need support');
    expect(note).toContain('feature "Shell1" reports "thin result"');
  });

  it('cuts long face lists short', () => {
    const faces = Array.from({ length: 30 }, (_, i) => `F${String(i)}:+z`);
    const note = printCheckNote({ status: 'warn', nozzle: 0.4, findings: [{ kind: 'contact', severity: 'warn', area: 3, places: [{ body: 'B', faces }] }] });
    expect(note).toContain('and 24 more');
  });
});
