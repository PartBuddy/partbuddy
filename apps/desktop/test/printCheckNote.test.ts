import { describe, expect, it } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { reportOf } from '../src/renderer/src/print/report';
import { printCheckReportSchema } from '../src/shared/contract';

describe('the ready-to-print check as the assistant reads it (M7)', () => {
  it('says what it looked at when nothing was found, and what it did not (audit R3)', () => {
    const clean = printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 1 });
    expect(clean).toContain('nothing found in what it checks (build volume, wall and floor thickness, overhang angle, area on the bed,');
    expect(clean).toContain('Not checked: strength and layer direction under load, the fits and hole allowances you chose,');
    // No verdict the model could hand on as "ready to print".
    expect(clean).not.toMatch(/ready to print[,.]/);
    // With findings the limits stand as well.
    expect(printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'open', severity: 'warn', bodies: ['A'] }] })).toContain('Not checked: strength');
  });

  it('words every finding with its numbers and quoted face names, blocking ones first', () => {
    const report = reportOf(
      {
        status: 'block',
        findings: [
          { kind: 'size', severity: 'block', body: 'Rod', size: [300, 20, 20], bed: [256, 256, 256], lying: true },
          { kind: 'thinWall', severity: 'block', floor: false, thickness: 0.3, minimum: 0.9, area: 400, places: [{ body: 'Plate', faces: ['F1:+z', 'F1:-z'] }], box: { min: [0, 0, 0], max: [20, 20, 0.3] } },
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
    expect(note).toContain('body "Rod" is 300 × 20 × 20 mm, the printer takes 256 × 256 × 256 mm; it would fit lying on another side');
    expect(note).toContain('walls down to 0.3 mm, thinner than the 0.4 mm nozzle, so they do not print (faces "F1:+z", "F1:-z" of body "Plate")');
    expect(note).toContain('120 mm² lean more than 45° from the vertical (faces "F3:-z" of body "Top"); the slicer decides whether they need support');
    expect(note).toContain('feature "Shell1" reports "thin result"');
  });

  it('tells a thin floor from a thin wall: layers, not lines', () => {
    const floor = { kind: 'thinWall' as const, floor: true, layers: 4, thickness: 0.3, minimum: 0.8, area: 900, places: [{ body: 'Box', faces: ['F1:-z'] }] };
    const warned = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ ...floor, severity: 'warn' }] });
    expect(warned).toContain('warning: floors or lids down to 0.3 mm, under the 0.8 mm a floor needs to print closed (4 layers) (faces "F1:-z" of body "Box")');
    expect(warned).not.toContain('nozzle');
    // At a 0.12 mm layer the 0.8 mm are not four layers, and the note does not say so.
    expect(printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ ...floor, layers: 6.7, severity: 'warn' }] })).toContain('print closed (6.7 layers)');
    const blocked = printCheckNote({ status: 'block', nozzle: 0.4, revision: 1, findings: [{ ...floor, thickness: 0.1, severity: 'block' }] });
    expect(blocked).toContain('blocks printing: floors or lids down to 0.1 mm, thinner than one layer, so they do not print');
  });

  it('says that an open surface does not print', () => {
    const report = reportOf({ status: 'block', findings: [{ kind: 'open', severity: 'block', bodies: ['Tube'] }] }, 0.4, 1);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(printCheckNote(report)).toContain('blocks printing: body "Tube" is an open surface, not a closed solid');
  });

  it('names the body that rests on an edge and has no face on the bed', () => {
    const note = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'contact', severity: 'warn', area: 0, bodies: 1, places: [{ body: 'Ball', faces: [] }] }] });
    expect(note).toContain('only 0 mm² lie on the bed, the part may come loose or tip over (body "Ball").');
  });

  it('says how much it leaves out: bodies of a finding, and findings of a long check', () => {
    // Fifty pins: one finding, of which the report carries 20 places and the note names 4.
    const places = Array.from({ length: 50 }, (_, i) => ({ body: 'Pin' + String(i), faces: ['F1:-z'] }));
    const report = reportOf({ status: 'warn', findings: [{ kind: 'contact', severity: 'warn', area: 16, bodies: 50, places, box: null }] }, 0.4, 1);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain('50 bodies have little on the bed, the least 16 mm²');
    expect(note).toContain('"F1:-z" of body "Pin3"; and 46 more bodies)');
    // A design of more bodies than a report names still fits the contract.
    expect(printCheckReportSchema.safeParse(reportOf({ status: 'warn', findings: [{ kind: 'contact', severity: 'warn', area: 16, bodies: 600, places, box: null }] }, 0.4, 1)).success).toBe(true);
    // Fifty findings: the report keeps 40 and counts the rest, the note lists 12 and counts the rest.
    const many = reportOf({ status: 'block', findings: Array.from({ length: 50 }, (_, i) => ({ kind: 'size' as const, severity: 'block' as const, body: 'Rod' + String(i), size: [300, 300, 300] as [number, number, number], bed: [256, 256, 256] as [number, number, number], lying: false })) }, 0.4, 1);
    expect(many).toMatchObject({ omitted: 10 });
    expect(many.findings).toHaveLength(40);
    expect(printCheckReportSchema.safeParse(many).success).toBe(true);
    expect(printCheckNote(many)).toContain('- and 38 more findings not listed here');
    expect(printCheckNote(report)).not.toContain('more findings');
  });

  it('cuts long face lists short', () => {
    const faces = Array.from({ length: 30 }, (_, i) => `F${String(i)}:+z`);
    const note = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'contact', severity: 'warn', area: 3, bodies: 1, places: [{ body: 'B', faces }] }] });
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
