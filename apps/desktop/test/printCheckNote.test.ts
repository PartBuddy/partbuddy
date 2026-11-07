import { describe, expect, it } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { reportOf } from '../src/renderer/src/print/report';
import { printCheckReportSchema } from '../src/shared/contract';

describe('the ready-to-print check as the assistant reads it (M7)', () => {
  it('says plainly when nothing was found', () => {
    expect(printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 1 })).toContain('ready to print, nothing found');
  });

  it('words every finding with its numbers and quoted face names, blocking ones first', () => {
    const report = reportOf(
      {
        status: 'block',
        findings: [
          { kind: 'size', severity: 'block', size: [300, 20, 20], bed: [256, 256, 256], lying: true },
          { kind: 'thinWall', severity: 'block', thickness: 0.3, minimum: 0.9, area: 400, places: [{ body: 'Plate', faces: ['F1:+z', 'F1:-z'] }], box: { min: [0, 0, 0], max: [20, 20, 0.3] } },
          { kind: 'overhang', severity: 'warn', area: 120, limit: 45, places: [{ body: 'Top', faces: ['F3:-z'] }], box: null },
          { kind: 'feature', severity: 'warn', feature: 'Shell1', message: 'thin result' },
        ],
      },
      0.4,
      7,
    );
    // The report carries no camera boxes and fits the contract.
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toContain('box');

    const note = printCheckNote(report);
    expect(note).toContain('not ready to print');
    expect(note).toContain('the part is 300 × 20 × 20 mm, the printer takes 256 × 256 × 256 mm; it would fit lying on another side');
    expect(note).toContain('walls down to 0.3 mm, thinner than the 0.4 mm nozzle, so they do not print (faces "F1:+z", "F1:-z" of body "Plate")');
    expect(note).toContain('120 mm² lean more than 45° from the vertical (faces "F3:-z" of body "Top"); the slicer decides whether they need support');
    expect(note).toContain('feature "Shell1" reports "thin result"');
  });

  it('cuts long face lists short', () => {
    const faces = Array.from({ length: 30 }, (_, i) => `F${String(i)}:+z`);
    const note = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'contact', severity: 'warn', area: 3, places: [{ body: 'B', faces }] }] });
    expect(note).toContain('and 24 more');
  });
});

describe('clearance between parts as the assistant reads it (F2)', () => {
  it('names the pair with the overlap or the gap, and the push fit it misses', () => {
    const report = reportOf(
      {
        status: 'warn',
        findings: [
          { kind: 'overlap', severity: 'warn', bodies: ['Case', 'Lid'], volume: 400, places: [], box: { min: [0, 0, 9], max: [20, 20, 10] } },
          { kind: 'tight', severity: 'warn', bodies: ['Case', 'Clip'], gap: 0.1, minimum: 0.15, places: [], box: { min: [-2, 18, -2], max: [2, 22.1, 2] } },
        ],
      },
      0.4,
      7,
    );
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toContain('box');
    const note = printCheckNote(report);
    expect(note).toContain('bodies "Case" and "Lid" overlap by 400 mm³');
    expect(note).toContain('bodies "Case" and "Clip" come within 0.1 mm of each other without touching, under the material\'s push fit of 0.15 mm per side');
  });
});
