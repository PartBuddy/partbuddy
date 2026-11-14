import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { printNote } from '../src/main/print/printProfiles';
import { asksBeforeExport, checkNow, fitsOf, jointRuns, lateOn, reachOf, reportOf, sweepInBlocks } from '../src/renderer/src/print/report';
import type { ModelState, StudioPrintCheck } from '../src/renderer/src/state/store';
import { DESIGN_DEFAULTS, printCheckReportSchema, type PartPrint } from '../src/shared/contract';

describe('the ready-to-print check as the assistant reads it (M7)', () => {
  it('says what it looked at when nothing was found, and what it did not (audit R3)', () => {
    const clean = printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 1 });
    expect(clean).toContain('nothing found in what it checks (build volume, wall and floor thickness, overhang angle, rounded edges on the bed, holes under 2 mm, area on the bed for the height,');
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
    expect(note).toContain('walls down to 0.3 mm, thinner than the narrowest line a slicer lays (0.42 mm with the 0.4 mm nozzle), so they do not print (faces "F1:+z", "F1:-z" of body "Plate")');
    expect(note).toContain('120 mm² lean more than 45° from the vertical (faces "F3:-z" of body "Top"), so they need support');
    expect(note).toContain('feature "Shell1" reports "thin result"');
  });

  it('words a rounded bed edge as a hint to chamfer it (BC-27)', () => {
    const report = reportOf(
      {
        status: 'warn',
        findings: [
          { kind: 'roundBedEdge', severity: 'warn', area: 31, limit: 40, places: [{ body: 'Cube', faces: ['F6:blend(F5:+x|F5:-z)'] }], box: null },
        ],
      },
      0.4,
      3,
    );
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toContain('box');
    const note = printCheckNote(report);
    expect(note).toContain('prints, with warnings');
    // The chamfer leans at most the material's angle where it is under 45° (BC-19).
    expect(note).toContain('warning: 31 mm² of rounded edges on the bed lean more than 40° from the vertical just above it (faces "F6:blend(F5:+x|F5:-z)" of body "Cube"): the foot of a fillet there ends flat on the bed and curls up. Chamfer those edges instead, leaning at most 40° from the vertical');
    expect(printCheckNote({ ...report, findings: [{ kind: 'roundBedEdge', severity: 'warn', area: 31, limit: 50, places: [] }] })).toContain('leaning at most 45° from the vertical');
  });

  it('words a small hole as a hint (BC-24)', () => {
    const report = reportOf(
      {
        status: 'warn',
        findings: [
          { kind: 'smallHole', severity: 'warn', holes: 2, diameter: 1.5, minimum: 2, places: [{ body: 'Cube', faces: ['F2:side'] }], box: null },
        ],
      },
      0.4,
      3,
    );
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(JSON.stringify(report)).not.toContain('box');
    const note = printCheckNote(report);
    expect(note).toContain('prints, with warnings');
    expect(note).toContain('- warning: 2 holes under 2 mm across, the smallest 1.5 mm (faces "F2:side" of body "Cube"): holes that small close up or come out well under size.');
    expect(note).toContain('tell the user to drill them out to size after printing');
    expect(printCheckNote({ ...report, findings: [{ kind: 'smallHole', severity: 'warn', holes: 1, diameter: 1, minimum: 2, places: [] }] })).toContain('- warning: a hole under 2 mm across, the smallest 1 mm:');
  });

  it('claims no hint the user turned off (BC-24)', () => {
    const report = reportOf({ status: 'ready', findings: [] }, 0.4, 1, [], { off: ['smallHole'] });
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain('rounded edges on the bed, area on the bed');
    expect(note).toContain("Turned off in PartBuddy's print settings, so not looked for: holes under 2 mm.");
    expect(printCheckNote(reportOf({ status: 'ready', findings: [] }, 0.4, 1))).not.toContain('Turned off');
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

  it('says a print face that is gone, and how to set it again (audit H-29)', () => {
    const report = reportOf({ status: 'warn', findings: [{ kind: 'faceLost', severity: 'warn', bodies: ['Lid', 'Box'] }] }, 0.4, 1);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(printCheckNote(report)).toContain('- warning: the print faces of bodies "Lid", "Box" are no flat faces of them any more (renamed or changed since they were set), so they are not checked lying on them');
    expect(printCheckNote(report)).toContain('Set them again (body.print_face) where they should lie.');
    // One body, in the singular (review K1).
    const one = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'faceLost', severity: 'warn', bodies: ['Lid'] }] });
    expect(one).toContain('- warning: the print face of body "Lid" is no flat face of it any more (renamed or changed since it was set), so it is not checked lying on it');
    expect(one).toContain('Set it again (body.print_face) where it should lie.');
  });

  it('asks to reshape an overhang where it can, else to name its support, and never blocks for it (audit R55)', () => {
    const overhang = { kind: 'overhang' as const, area: 400, limit: 45, places: [{ body: 'Table', faces: ['F2:-z'] }] };
    const note = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ ...overhang, severity: 'warn' }] });
    expect(note).toContain('prints, with warnings.');
    expect(note).toContain('- warning: 400 mm² lean more than 45° from the vertical (faces "F2:-z" of body "Table"), so they need support: reshape them where you can (a slope within that angle, a teardrop roof, a chamfer, or another print face); where you cannot, tell the user which support they need there and why.');
    expect(note).not.toContain('the slicer decides');
  });

  it('holds the model to fix or name parts that do not go together or move, not only what blocks (audit H-12)', () => {
    const closing = 'Fix what blocks printing, and either fix or name to the user every warning about parts that overlap, are too tight, fuse or stop a joint, before you call the part done';
    const fits = [
      { kind: 'overlap' as const, severity: 'warn' as const, bodies: ['Case', 'Lid'] as [string, string], volume: 1, places: [] },
      { kind: 'tight' as const, severity: 'warn' as const, bodies: ['Case', 'Clip'] as [string, string], gap: 0.1, minimum: 0.15, places: [] },
      { kind: 'fused' as const, severity: 'warn' as const, bodies: ['Box', 'Lid'] },
      { kind: 'blocked' as const, severity: 'warn' as const, joint: 'Hinge', bodies: ['Box', 'Lid'] as [string, string], at: 40, limit: 110, unit: 'deg' as const, places: [] },
    ];
    for (const finding of fits) {
      const note = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [finding] });
      expect(note, finding.kind).toContain('prints, but its parts may not go together or move as designed.');
      expect(note, finding.kind).toContain(closing);
    }
    // Other warnings keep the plain verdict; the closing sentence stands with every finding.
    const other = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'separate', severity: 'warn', bodies: ['A', 'B'] }] });
    expect(other).toContain('prints, with warnings.');
    expect(other).toContain(closing);
  });

  it('says which features are left out of the part, not that they report something (review of PR 371, S3)', () => {
    const many = Array.from({ length: 50 }, (_, i) => 'Fillet' + String(i));
    const report = reportOf({ status: 'warn', findings: [{ kind: 'leftOut', severity: 'warn', rolledBack: false, features: ['Chamfer1'] }, { kind: 'leftOut', severity: 'warn', rolledBack: true, features: many }] }, 0.4, 1);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain('warning: feature "Chamfer1" is suppressed, so not in the part as checked and exported; a suppressed feature that failed is not fixed.');
    expect(note).toContain('warning: the timeline is rolled back: features "Fillet0", "Fillet1"');
    expect(note).toContain('and 32 more come after its marker');
    expect(note).not.toContain('reports');
  });

  it('names the body that rests on an edge and has no face on the bed', () => {
    const note = printCheckNote({ status: 'warn', nozzle: 0.4, revision: 1, findings: [{ kind: 'contact', severity: 'warn', area: 0, bodies: 1, places: [{ body: 'Ball', faces: [] }] }] });
    expect(note).toContain(`only 0 mm² lie on the bed for the part's height, it may come loose or tip over, a brim holds it (body "Ball").`);
  });

  it('says how much it leaves out: bodies of a finding, and findings of a long check', () => {
    // Fifty pins: one finding, of which the report carries 20 places and the note names 4.
    const places = Array.from({ length: 50 }, (_, i) => ({ body: 'Pin' + String(i), faces: ['F1:-z'] }));
    const report = reportOf({ status: 'warn', findings: [{ kind: 'contact', severity: 'warn', area: 16, bodies: 50, places, box: null }] }, 0.4, 1);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain('50 bodies have little on the bed for their height, the least 16 mm²');
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
    expect(note).toContain('bodies "Case" and "Clip" come within 0.1 mm of each other without touching, under the push fit of 0.15 mm per side for this nozzle (as in the print profile)');
  });

  it('says that parts printed as one piece fuse under their gap, and a joint without a limit that way (audit D10, H-04)', () => {
    const box = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
    const report = reportOf(
      {
        status: 'warn',
        findings: [
          { kind: 'tight', severity: 'warn', bodies: ['Box', 'Lid'], gap: 0.2, minimum: 0.4, inPlace: true, places: [], box },
          { kind: 'blocked', severity: 'warn', joint: 'Hinge', bodies: ['Lid', 'Box'], at: 120, limit: 190, unit: 'deg', free: true, places: [], box },
          { kind: 'blocked', severity: 'warn', joint: 'Wheel', bodies: ['Lid', 'Box'], at: -300, limit: -370, unit: 'deg', free: true, places: [], box },
        ],
      },
      0.4,
      7,
    );
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    expect(report.findings).toMatchObject([{ inPlace: true }, { free: true }, { free: true }]);
    const note = printCheckNote(report);
    expect(note).toContain('bodies "Box" and "Lid" print as one piece and move against each other, but come within 0.2 mm of each other, under the print-in-place gap of 0.4 mm for this nozzle: they fuse there in the print and do not move.');
    expect(note).toContain('joint "Hinge" has no limit that way and stops at 120 deg: bodies "Lid" and "Box" touch there. Make room where they touch, or set its limits with joint.limits if that is the stop you mean.');
    // The end of the run is no limit of the joint's, and is not named as one.
    // An angle past half a turn is said within one turn (-180° to 180°), as the joint stands then.
    expect(note).toContain('joint "Wheel" has no limit that way and stops at 60 deg');
    expect(note).not.toContain('190');
    expect(note).not.toContain('300');
  });
});

describe('the gaps the check holds the parts to (audit D9, D10)', () => {
  const pla = { id: 'pla', name: 'PLA', overhang: 45, holeShrink: 0.2, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 } };
  const printer = (nozzle: number, layer = 0.2): PartPrint => ({ printer: { id: 'p', name: 'P', bed: [256, 256, 256], nozzle, layer }, material: pla, chosen: true, design: DESIGN_DEFAULTS });

  it('takes the push fit scaled to the nozzle, the number the print profile gives the assistant', () => {
    // A finer nozzle keeps the 0.4 mm value (BC-14, audit MG-12: before 0.075 and 0.094).
    for (const [nozzle, push] of [
      [0.2, 0.15],
      [0.25, 0.15],
      [0.4, 0.15],
      [0.6, 0.225],
      [0.8, 0.3],
    ] as const) {
      expect(fitsOf(printer(nozzle), {}).push).toBe(push);
      // The same number, to the thousandth, in the profile and in the check's words (review of BC-06, B1).
      expect(printNote(printer(nozzle))).toContain(`push ${String(push)} mm`);
      const tight = reportOf({ status: 'warn', findings: [{ kind: 'tight', severity: 'warn', bodies: ['A', 'B'], gap: 0.05, minimum: fitsOf(printer(nozzle), {}).push, places: [], box: { min: [0, 0, 0], max: [1, 1, 1] } }] }, nozzle, 1);
      expect(printCheckNote(tight)).toContain(`under the push fit of ${String(push)} mm per side for this nozzle (as in the print profile)`);
    }
    // Read off tolerance pieces printed with a 0.6 mm nozzle, the fit holds as read on that nozzle.
    expect(fitsOf({ ...printer(0.6), material: { ...pla, measuredNozzle: 0.6 } }, {}).push).toBe(0.15);
    // The layer height has no part in it.
    expect(fitsOf(printer(0.4, 0.12), {}).push).toBe(0.15);
  });

  it('holds bodies of one print group that a joint moves against each other to max(0.3, nozzle)', () => {
    const structure = { printGroups: [['Box', 'Lid', 'Lip']], joints: [{ bodies: ['Lid', 'Lip'] }, {}] };
    expect(fitsOf(printer(0.4), {}).inPlace).toBeUndefined();
    for (const [nozzle, gap] of [
      [0.2, 0.3],
      [0.25, 0.3],
      [0.4, 0.4],
      [0.6, 0.6],
      [0.8, 0.8],
    ] as const)
      expect(fitsOf(printer(nozzle), structure).inPlace?.gap).toBe(gap);
    const { pair } = fitsOf(printer(0.4), structure).inPlace ?? { pair: () => false };
    expect(pair('Box', 'Lid')).toBe(true);
    expect(pair('Lip', 'Box')).toBe(true);
    // The lid and its lip move together: no gap needed between them.
    expect(pair('Lid', 'Lip')).toBe(false);
    expect(pair('Box', 'Clip')).toBe(false);
    // No joint says which bodies it moves: any two of a group are taken to move.
    const unknown = fitsOf(printer(0.4), { printGroups: [['Box', 'Lid']], joints: [{}] }).inPlace;
    expect(unknown?.pair('Lid', 'Box')).toBe(true);
  });
});

// Review 4 of PR #357: what the check leaves out is said, with a way the assistant can take.
describe('what the check could not measure', () => {
  it('names mesh bodies left out of the clearance and says how to have them measured', () => {
    const report = reportOf({ status: 'ready', findings: [] }, 0.4, 7, [], { unchecked: ['Scan'] });
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain('NOT measured for overlaps and gaps: "Scan", mesh body SolidCraft does not measure. Convert it to faces (mesh.convert, closed meshes only) to have it measured; until then judge its fit yourself.');
    expect(note).not.toContain('Measure it yourself (inspect.clearance)');
  });

  it('measures 200 joint runs at most and says when there were more', () => {
    const joint = (id: number) => ({ id, name: `J${String(id)}`, values: [{ unit: 'deg' as const, value: 0, limits: [-90, 90] as [number, number], index: 0 }] });
    expect(jointRuns(Array.from({ length: 100 }, (_, i) => joint(i)))).toMatchObject({ more: false });
    const many = jointRuns(Array.from({ length: 101 }, (_, i) => joint(i)));
    expect(many.sweeps).toHaveLength(200);
    expect(many.more).toBe(true);
    expect(many.sweeps[0]).toEqual({ joint: 0, name: 'J0', unit: 'deg', index: 0, from: 0, to: -90 });
    // A limit where the value stands already is no run; a distance without a limit is none either while nothing says how far the parts reach.
    expect(jointRuns([{ id: 1, name: 'J', values: [{ unit: 'mm', value: 5, limits: [5, null], index: 2 }] }]).sweeps).toEqual([]);
  });

  it('runs a joint without limits too, as far as anything can stop it (audit H-04)', () => {
    const run = (unit: 'deg' | 'mm', value: number, limits: [number | null, number | null] | null, reach = 0) => jointRuns([{ id: 1, name: 'J', values: [{ unit, value, limits, index: 0 }] }], reach).sweeps.map(({ from, to, free }) => ({ from, to, ...(free ? { free } : {}) }));
    // No limits at all: half a turn and 10° each way, so the two runs overlap past the snap-fit span.
    expect(run('deg', 0, null)).toEqual([{ from: 0, to: -190, free: true }, { from: 0, to: 190, free: true }]);
    expect(run('deg', 30, [null, null])).toEqual([{ from: 30, to: -160, free: true }, { from: 30, to: 220, free: true }]);
    // A limit on one side: to it, and a whole turn and 10° the other way.
    expect(run('deg', 0, [null, 90])).toEqual([{ from: 0, to: -370, free: true }, { from: 0, to: 90 }]);
    expect(run('deg', 0, [0, null])).toEqual([{ from: 0, to: 370, free: true }]);
    // A distance as far as the parts reach.
    expect(run('mm', 5, [5, null], 121)).toEqual([{ from: 5, to: 126, free: true }]);
    expect(run('mm', 0, null, 121)).toEqual([{ from: 0, to: -121, free: true }, { from: 0, to: 121, free: true }]);
    // Both limits set: as before, no free run.
    expect(run('deg', 0, [-90, 90])).toEqual([{ from: 0, to: -90 }, { from: 0, to: 90 }]);
  });

  it('takes the reach of a slide from the diagonal of all bodies', () => {
    const body = (min: [number, number, number], max: [number, number, number]) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array([...min, ...max, ...min]), 3));
      return { model: { geometry } };
    };
    expect(reachOf([])).toBe(0);
    // 0..30 × 0..40 × 0..0: a diagonal of 50 mm, and 5 mm more.
    expect(reachOf([body([0, 0, 0], [30, 0, 0]), body([0, 40, 0], [0, 40, 0])])).toBe(55);
    // A body without positions adds nothing.
    expect(reachOf([{ model: { geometry: new BufferGeometry() } }, body([0, 0, 0], [3, 4, 0])])).toBe(10);
  });

  it('asks before an export while the light is red, still measuring, of another revision or project, or a measure failed (audit X-1)', () => {
    const model = { status: 'ready', documentId: 'doc-a', revision: 3, designName: 'A', bodies: [], sketches: [], structure: { features: [] } } as unknown as ModelState;
    const idle = { state: 'connected', mirror: 'idle' } as const;
    const light = (status: 'ready' | 'warn' | 'block', more: Partial<StudioPrintCheck> = {}): StudioPrintCheck => ({ documentId: 'doc-a', revision: 3, result: { status, findings: [] }, ...more });
    expect(asksBeforeExport(null, model, idle)).toBe(false);
    expect(asksBeforeExport(light('ready'), model, idle)).toBe(false);
    expect(asksBeforeExport(light('warn'), model, idle)).toBe(false);
    expect(asksBeforeExport(light('ready', { unmeasured: [], unchecked: ['Mesh'] }), model, idle)).toBe(false);
    expect(asksBeforeExport(light('block'), model, idle)).toBe(true);
    // Green from the mesh check alone is no green yet: an overlap or a blocked joint may follow.
    expect(asksBeforeExport(light('ready', { measuring: true }), model, idle)).toBe(true);
    expect(asksBeforeExport(light('warn', { unmeasured: ['joints'] }), model, idle)).toBe(true);
    // Green of the revision before, or of another project at the same revision, is no green for this one.
    expect(asksBeforeExport(light('ready', { revision: 2 }), model, idle)).toBe(true);
    expect(asksBeforeExport(light('ready', { documentId: 'doc-b' }), model, idle)).toBe(true);
    expect(checkNow(light('ready', { documentId: 'doc-b' }), model, idle)?.measuring).toBe(true);
    expect(checkNow(light('ready'), model, idle)?.measuring).toBeUndefined();
    // While the main process mirrors a newer revision; once it ended, failed or not, the light holds again.
    expect(asksBeforeExport(light('ready'), model, { state: 'connected', mirror: 'rebuilding' })).toBe(true);
    expect(asksBeforeExport(light('ready'), model, idle)).toBe(false);
    // A mirror that failed leaves SolidCraft further on than the check: not measured, so it asks.
    expect(asksBeforeExport(light('ready'), model, { state: 'connected', mirror: 'failed' })).toBe(true);
    expect(checkNow(light('ready', { unmeasured: ['joints'] }), model, { state: 'connected', mirror: 'failed' })?.unmeasured).toEqual(['joints', 'mirror']);
    // A mirror of the revision on screen once more that failed: SolidCraft is not further on, nothing lacks.
    expect(asksBeforeExport(light('ready'), model, { state: 'connected', mirror: 'failed', documentId: 'doc-a', revision: 3 })).toBe(false);
    expect(asksBeforeExport(light('ready'), model, { state: 'connected', mirror: 'failed', documentId: 'doc-a', revision: 4 })).toBe(true);
  });

  it('shows a passing state only once it lasted, and its end at once', () => {
    vi.useFakeTimers();
    try {
      const shown: boolean[] = [];
      const follow = lateOn(500, (on) => shown.push(on));
      // A step checked within the time never shows "checking".
      follow(true);
      vi.advanceTimersByTime(400);
      follow(false);
      vi.advanceTimersByTime(1000);
      expect(shown).toEqual([false]);
      // One that lasts does, and its end shows at once.
      follow(true);
      vi.advanceTimersByTime(500);
      expect(shown).toEqual([false, true]);
      follow(false);
      expect(shown).toEqual([false, true, false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sweeps the joints in blocks of 40, one after the other, and counts a failed block as not measured', async () => {
    const calls: number[][] = [];
    let failures = 0;
    const stops = await sweepInBlocks(
      Array.from({ length: 95 }, (_, i) => i),
      (block) => {
        calls.push(block);
        return block[0] === 40 ? Promise.reject(new Error('busy')) : Promise.resolve(block.map((run) => (run === 3 ? 'stop' : null)));
      },
      () => (failures += 1),
    );
    expect(calls.map((block) => [block[0], block.length])).toEqual([[0, 40], [40, 40], [80, 15]]);
    expect(stops).toHaveLength(95);
    expect(stops[3]).toBe('stop');
    expect(failures).toBe(1);
  });
});
