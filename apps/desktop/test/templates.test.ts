import { describe, expect, it } from 'vitest';

import { templateRequestSchema } from '../src/shared/contract';
import { commentText, rangeOf } from '../src/renderer/src/shell/parameterRange';
import { TEXT_STROKE } from '../src/shared/blocks';
import { TEMPLATE_IDS, germanFeatureName, templatePrintFaces, templateSteps } from '../src/shared/templates';
import { wallSizes } from '../src/shared/wallMount';

/** The geometry fields whose text is an expression over the design's parameters. */
const EXPRESSION_FIELDS = new Set(['length', 'width', 'height', 'diameter', 'thickness', 'depth', 'corner', 'base', 'position', 'center', 'points', 'point', 'distance', 'cs_diameter', 'radius', 'text_expression', 'offset']);

function expressions(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(expressions);
  return [];
}

describe('templates (F3)', () => {
  it('declares its parameters first and sizes its geometry only with them', () => {
    for (const id of TEMPLATE_IDS) {
      const steps = templateSteps(id);
      const declared = steps.filter((step) => step.command === 'parameters.add');
      expect(declared.length, id).toBeGreaterThan(2);
      // Parameters first: the geometry after them can refer to every one.
      expect(steps.slice(0, declared.length).every((step) => step.command === 'parameters.add'), id).toBe(true);
      const names = new Set(declared.map((step) => step.params.name as string));
      for (const step of declared) expect(step.params.comment, `${id} ${String(step.params.name)}`).toEqual(expect.any(String));
      const used = new Set<string>();
      for (const step of steps.slice(declared.length)) {
        for (const [key, value] of Object.entries(step.params)) {
          if (!EXPRESSION_FIELDS.has(key)) continue;
          for (const text of expressions(value)) for (const word of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) if (!['mm', 'max', 'min'].includes(word)) used.add(word);
        }
      }
      expect([...used].filter((word) => !names.has(word)), id).toEqual([]);
      // Every parameter drives something.
      expect([...names].filter((name) => !used.has(name)), id).toEqual([]);
    }
  });

  it('cuts plain holes as cylinders, since a hole does not follow its expressions', () => {
    for (const id of TEMPLATE_IDS) {
      const holes = templateSteps(id).filter((step) => step.command === 'solid.hole');
      // Only holes at sketch points, which follow.
      expect(holes.every((step) => typeof step.params.sketch === 'string' && step.params.position === undefined), id).toBe(true);
    }
  });

  it('names every body it makes', () => {
    for (const id of TEMPLATE_IDS) {
      const bodies = templateSteps(id).flatMap((step) => (typeof step.params.body_name === 'string' ? [step.params.body_name] : []));
      expect(bodies.length, id).toBeGreaterThan(0);
    }
  });

  it('takes a known template with a name, nothing else', () => {
    expect(templateRequestSchema.safeParse({ template: 'housing', name: 'Gehäuse' }).success).toBe(true);
    expect(templateRequestSchema.safeParse({ template: 'rocket', name: 'Rocket' }).success).toBe(false);
    expect(templateRequestSchema.safeParse({ template: 'housing', name: '  ' }).success).toBe(false);
  });

  it('comments every parameter in German on request, with the same names (polish round 2)', () => {
    for (const id of TEMPLATE_IDS) {
      const english = templateSteps(id).filter((step) => step.command === 'parameters.add');
      const german = templateSteps(id, true).filter((step) => step.command === 'parameters.add');
      expect(german.map((step) => step.params.name)).toEqual(english.map((step) => step.params.name));
      german.forEach((step, index) => {
        expect(step.params.comment, `${id} ${String(step.params.name)}`).not.toBe(english[index]?.params.comment);
      });
    }
  });

  it('names the bodies in German on request, and every step that refers to a body follows (polish round 3)', () => {
    const housing = templateSteps('housing', true);
    expect(housing.flatMap((step) => (typeof step.params.body_name === 'string' ? [step.params.body_name] : []))).toEqual(['Gehäuse', 'Deckel']);
    const targets = (step: (typeof housing)[number]): unknown[] => (Array.isArray(step.params.targets) ? (step.params.targets as unknown[]) : []);
    // The screws' bodies are renamed from the names SolidCraft gave them (Body1 …), which are no bodies of the template.
    const named = housing.flatMap((step) => (step.command === 'body.rename' ? [] : [step.params.body, ...targets(step)])).filter((name) => typeof name === 'string');
    expect(new Set(named)).toEqual(new Set(['Gehäuse', 'Deckel']));
    expect(templateSteps('housing').some((step) => step.params.body_name === 'Housing')).toBe(true);
  });

  it('marks box and lid of the hinged box as printed together by their components, in both languages (review of PR 366, B1)', () => {
    for (const [german, names] of [[false, ['Box', 'Lid']], [true, ['Box', 'Deckel']]] as const) {
      const steps = templateSteps('hingedBox', german);
      // The components are made of the bodies and named after them: the marks must name those.
      expect(steps.find((step) => step.command === 'component.from_bodies')?.params.bodies).toEqual(names);
      expect(steps.filter((step) => step.command === 'component.metadata.set').map((step) => step.params.component)).toEqual(names);
    }
  });

  it('names every feature and sketch in German on request, and a sketch reference follows (audit B-03)', () => {
    for (const id of TEMPLATE_IDS) {
      const english = templateSteps(id);
      templateSteps(id, true).forEach((step, index) => {
        const name = english[index]?.params.name;
        if (step.command === 'parameters.add' || typeof name !== 'string' || name === 'Box' || name === 'Ring' || name === 'Adapter') return;
        expect(step.params.name, `${id}: ${name}`).not.toBe(name);
      });
    }
    expect(germanFeatureName('Ear slot 2 end 1')).toBe('Laschenschlitz 2 Ende 1');
    expect(germanFeatureName('Vent front 4')).toBe('Lüftung vorn 4');
    expect(germanFeatureName('Unknown')).toBe('Unknown');
    const holder = templateSteps('wallHolder', true);
    expect(holder.find((step) => step.command === 'solid.hole')?.params.sketch).toBe('Schraubpunkte');
  });
});

describe('templates with moving parts', () => {
  it('joins the hinged box by its bodies, in either language, with the hinge tied to the parameters', () => {
    for (const [german, box, lid] of [[false, 'Box', 'Lid'], [true, 'Box', 'Deckel']] as const) {
      const steps = templateSteps('hingedBox', german);
      expect(steps.find((step) => step.command === 'component.from_bodies')?.params.bodies).toEqual([box, lid]);
      const joint = steps.find((step) => step.command === 'joint.create')?.params as { a: { occurrence: string }; b: { occurrence: string }; limits: unknown };
      expect([joint.a.occurrence, joint.b.occurrence, joint.limits]).toEqual([box, lid, [[0, 180]]]);
      // Every knuckle sits on the rim and keeps its place from the middle of the box.
      const knuckles = steps.filter((step) => step.command === 'solid.cylinder' && /^(Hinge|Scharnier)/.test(String(step.params.name)));
      expect(knuckles).toHaveLength(12);
      // The closure follows the sizes too: its four rings, the room its cut at the hinge is drawn in, bead and rille are placed by the
      // parameters, and nothing cuts through a wall.
      const rings = steps.filter((step) => step.command === 'sketch.rectangle.rounded');
      expect(rings).toHaveLength(5);
      for (const step of rings) expect(JSON.stringify([step.params.p0, step.params.p1, step.params.radius])).toMatch(/wall.*length.*width.*corner/);
      // Bead and rille of the mechanism's closure, in the lid and in the box.
      const catches = steps.filter((step) => /^(Closure|Verschluss) [●○]$/.test(String(step.params.name)));
      expect(catches.map((step) => (step.params.targets as string[])[0])).toEqual([lid, box]);
      for (const step of catches) expect(JSON.stringify(step.params.corner ?? step.params.base)).toMatch(/length.*width.*height/);
      for (const step of knuckles) expect(step.params.base).toEqual([expect.stringMatching(/^length \/ 2 \+ -?[\d.]+ mm$/), 0.5, 'height']);
    }
    expect(germanFeatureName('Hinge 2 ·')).toBe('Scharnier 2 ·');
    // Audit 2026-11-12, T3: the template called the hinge without the webs of the tool, so its knuckles began 12 mm above the
    // bed in the air (189 mm² of overhang, up to 87°) under a file that promises "without support".
    const steps = templateSteps('hingedBox');
    const webs = steps.filter((step) => step.command === 'solid.extrude' && String(step.params.name).endsWith('◣'));
    expect(webs.map((step) => [step.params.name, (step.params.targets as string[])[0], step.params.distance])).toEqual([['Hinge 1 ◣', 'Box', '7.68 mm'], ['Hinge 2 ◣', 'Lid', '7.68 mm'], ['Hinge 3 ◣', 'Box', '7.68 mm'], ['Hinge 4 ◣', 'Lid', '7.68 mm'], ['Hinge 5 ◣', 'Box', '7.68 mm']]);
    // Each is drawn on the world's YZ plane at the knuckle's low end in x, from the rim down, so it follows length and height:
    // the box's from the line (y 0.5) towards -y to 0.5 mm inside its wall, the lid's towards +y.
    const drawn = (name: string) => steps.slice(steps.findIndex((step) => step.command === 'sketch.create' && step.params.name === name)).slice(0, 2).map((step) => step.params);
    expect(drawn('Hinge 1 ◣')).toEqual([{ plane: 'YZ', offset: 'length / 2 + -20 mm', project_edges: false, name: 'Hinge 1 ◣' }, { points: [['3.328 mm', 'height + 0 mm'], ['3.328 mm', 'max(height + -2.828 mm, 0 mm)'], ['0.5 mm - min(0.5 mm, height + -5.657 mm)', 'max(height + -6.157 mm, 0 mm)'], ['-0.5 mm', 'max(height + -6.157 mm, 0 mm)'], ['-0.5 mm', 'height + 0 mm']], closed: true }]);
    // Review of PR #358: "at least 8 mm" stood only in the parameter's comment, and at 5 mm the webs reached 1.16 mm below the
    // floor. A web ends on the bed at the latest; its room in the other half is a cut and may go on.
    expect(JSON.stringify(drawn('Hinge 1 ◤')[1]?.points)).not.toContain('max(');
    expect(drawn('Hinge 2 ◣')[0]).toMatchObject({ plane: 'YZ', offset: 'length / 2 + -11.92 mm' });
    // Review 2 of PR #358: with the foot only lifted to the bed the web's face leant 57° at 5 mm. The foot comes in along the face
    // (to height - 5.657 mm from the line where that is less than the 0.5 mm to the wall), so the face keeps 45°.
    expect((drawn('Hinge 2 ◣')[1]?.points as string[][])[2]).toEqual(['0.5 mm + min(0.5 mm, height + -5.657 mm)', 'max(height + -6.157 mm, 0 mm)']);
    expect(germanFeatureName('Hinge 1 ◣')).toBe('Scharnier 1 ◣');
    expect(germanFeatureName('Hinge 2 ▬')).toBe('Scharnier 2 ▬');
    // Audit T3 (63 mm² of overhang left at the lid) and N-nach-1 (0.26 mm at height 24, length 80, wall 3): the knuckles bit
    // the closure's lip and foot along the wall at the hinge. That wall keeps no lip, at every size.
    // The lid's room within a band from that wall to past the corners' arcs, cut from the foot's underside up: it follows the
    // sizes, a large corner too (review of PR #370: at a corner of 15 mm the arcs of the lip stayed where the knuckles turn).
    const cut = steps.findIndex((step) => step.params.name === 'Closure ▭');
    expect(steps.slice(cut, cut + 4).map((step) => step.params)).toEqual([
      { plane: 'XY', offset: '(height) - (min(3 mm, (height) - (wall) - 0.6 mm))', project_edges: false, name: 'Closure ▭' },
      { p0: ['(wall)', '(1 mm + wall)'], p1: ['(length - wall)', '(width + 1 mm - wall)'], radius: '(corner - wall)' },
      { p0: ['(wall) - 1 mm', '(1 mm + wall) - 1 mm'], p1: ['(length - wall) + 1 mm', '(1 mm + wall) + (max((corner - wall), 1.7 mm) + 0.5 mm)'] },
      { distance: 'min(3 mm, (height) - (wall) - 0.6 mm) + 4.1 mm', operation: 'cut', targets: ['Lid'], profiles: [{ point: [30, 4.25] }], exact_regions: true, name: 'Closure ▭' },
    ]);
    // Review of PR #370: the limits that keep the box printable and closing, measured on SolidCraft 0.40.1 (corner 8 at length
    // 54 and wall 1.6 left 7 mm² of overhang at the hinge, width 30 did not snap shut, wall 4 left a skin of 0.1 mm), stand in
    // the comments as the ranges the parameter panel reads; the starting sizes lie inside them, in both languages.
    for (const german of [false, true]) {
      const declared = templateSteps('hingedBox', german).filter((step) => step.command === 'parameters.add');
      const ranges: Record<string, ReturnType<typeof rangeOf>> = Object.fromEntries(declared.map((step) => [String(step.params.name), rangeOf(String(step.params.comment))]));
      expect(ranges).toEqual({ length: { min: 54, max: 200 }, width: { min: 32, max: 150 }, height: { min: 8, max: 60 }, wall: { min: 1.6, max: 3 }, corner: { min: 4, max: 7 } });
      for (const step of declared) {
        const range = ranges[String(step.params.name)];
        const start = Number.parseFloat(String(step.params.expression));
        expect(start >= (range?.min ?? Infinity) && start <= (range?.max ?? -Infinity), String(step.params.name)).toBe(true);
      }
    }
    expect(commentText(String(templateSteps('hingedBox').find((step) => step.params.name === 'width')?.params.comment)).trim()).toBe('Outer width of box and lid; narrower, the bead meets the rim of the box more than 6° before the lid is shut');
    // N-nach-2: at a height of 5 mm the foot ran into the lid's floor and its chamfer lost its edge; it stops short of the floor.
    expect(steps.find((step) => step.command === 'solid.extrude' && step.params.name === 'Closure ·')?.params.distance).toBe('min(3 mm, (height) - (wall) - 0.6 mm)');
    expect(germanFeatureName('Closure ▭')).toBe('Verschluss ▭');
    expect(germanFeatureName('Closure ◥')).toBe('Verschluss ◥');
    // The joint is kept on the pin's round top: underneath the pin is flat now.
    expect((steps.find((step) => step.command === 'joint.create')?.params.a as { circle: number[] }).circle.map((value) => Math.round(value * 100) / 100)).toEqual([25.46, 0.5, 18]);
  });

  it('joins the stop as a slider, by name in either language', () => {
    for (const [german, base, stop, guide] of [[false, 'Base', 'Stop', 'Guide'], [true, 'Grundplatte', 'Anschlag', 'Führung']] as const) {
      const slider = templateSteps('slideStop', german).find((step) => step.command === 'joint.as_built')?.params as { a: string; b: string; at: { occurrence: string }; name: string };
      expect([slider.a, slider.b, slider.at.occurrence, slider.name]).toEqual([base, stop, base, guide]);
    }
    // The stop prints on its top; PartBuddy keeps that face for its plate view, under the body's name in the user's language.
    expect(templatePrintFaces('slideStop')).toEqual([{ body: 'Stop', point: [60, 8, 26.4] }]);
    expect(templatePrintFaces('slideStop', true)).toEqual([{ body: 'Anschlag', point: [60, 8, 26.4] }]);
    expect(templatePrintFaces('sign')).toEqual([]);
    // The rail and its groove are as long as the base.
    expect(templateSteps('slideStop').filter((step) => step.command === 'solid.extrude').map((step) => step.params.distance)).toEqual(['length', 'length']);
  });

  it('builds its moving parts for the printer in use: gaps of its nozzle, a barrel two lines round the bore (audit T28, BC-10 open)', () => {
    const hinged = (nozzle: number, layer = 0.2) => {
      const steps = templateSteps('hingedBox', false, { nozzle, layer });
      const offset = steps.find((step) => step.command === 'joint.create')?.params.offset;
      // The barrel and the bore: the largest cylinder that is not the knuckles' room, and the pin.
      const sizes = [...new Set(steps.filter((step) => step.command === 'solid.cylinder' && String(step.params.name).startsWith('Hinge')).map((step) => step.params.diameter))];
      return { offset, sizes };
    };
    // On 0.4 mm as before: gap 0.4, barrel 8, pin 4 (the template's preview pictures stay true).
    expect(hinged(0.4)).toEqual(hinged(0.4, 0.12));
    expect(hinged(0.4).offset).toBe(-0.4);
    expect(hinged(0.4).sizes).toEqual(expect.arrayContaining(['8 mm', '4 mm']));
    // Finer nozzles take the least print-in-place gap, 0.3 mm; coarser ones their own, and a wider barrel where two lines need it.
    expect([0.2, 0.25, 0.6, 0.8].map((nozzle) => hinged(nozzle).offset)).toEqual([-0.3, -0.3, -0.6, -0.8]);
    expect(hinged(0.6).sizes).toEqual(expect.arrayContaining(['9 mm', '4.5 mm']));
    expect(hinged(0.8).sizes).toEqual(expect.arrayContaining(['12 mm', '6 mm']));
    // What the mechanism tool refuses, the template does not build: layers as high as the 0.3 mm gap close it.
    expect(() => templateSteps('hingedBox', false, { nozzle: 0.25, layer: 0.3 })).toThrow("the hinged box's hinge does not print on a 0.25 mm nozzle with 0.3 mm layers: gap must be more than a layer (0.3 mm)");
    // The closure's lip follows the nozzle as well (lipThick): 1.4 mm on 0.4, 1.85 mm on 0.8, with its 0.25 mm of clearance.
    const ring = (nozzle: number) => templateSteps('hingedBox', false, { nozzle, layer: 0.2 }).filter((step) => step.command === 'sketch.rectangle.rounded').map((step) => step.params.p0)[1];
    expect([ring(0.4), ring(0.8)]).toEqual([['(wall) + 1.65 mm', '(1 mm + wall) + 1.65 mm'], ['(wall) + 2.1 mm', '(1 mm + wall) + 2.1 mm']]);
    // The guide of the stop: its gap is the nozzle's, so the stop's print face moves up with it.
    expect([0.2, 0.4, 0.8].map((nozzle) => templatePrintFaces('slideStop', false, { nozzle, layer: 0.2 })[0]?.point)).toEqual([[60, 8, 26.3], [60, 8, 26.4], [60, 8, 26.8]]);
  });

  it('seats the housing\'s screws as standard parts on the lid, and words the sign from its text parameter', () => {
    // One part per hole, each body named, so the view shows all four.
    expect(templateSteps('housing').filter((step) => step.command === 'parts.insert')).toHaveLength(4);
    expect(templateSteps('housing', true).filter((step) => step.command === 'body.rename').map((step) => step.params.name)).toEqual([1, 2, 3, 4].map((n) => `M3-Schraube ${String(n)}`));
    expect(templateSteps('sign').find((step) => step.command === 'sketch.text')?.params.text_expression).toBe('label');
    expect(germanFeatureName('Hinge ●')).toBe('Scharnier ●');
  });

  it('lays the wall holder on its side with its inner corners as round as its wall, and takes the wood screw from the table (audit T29, T43)', () => {
    // T29: the hook rule asks for printing on its side and inner radii of at least the thickness.
    expect(templatePrintFaces('wallHolder')).toEqual([{ body: 'Wall holder', point: [0, 3, 50] }]);
    expect(templatePrintFaces('wallHolder', true)).toEqual([{ body: 'Wandhalter', point: [0, 3, 50] }]);
    const holder = templateSteps('wallHolder');
    expect(holder.find((step) => step.params.name === 'Inner radius')?.params).toEqual({ edges: [[25, 6, 6], [25, 46, 6]], radius: 'wall', name: 'Inner radius' });
    // Lying on its side, the corners that touch the bed are chamfered: a round there starts in the air.
    expect(holder.filter((step) => ['Outer corners', 'Lip corners'].includes(String(step.params.name))).map((step) => step.command)).toEqual(['solid.chamfer', 'solid.chamfer']);
    // T43: one table for both; BC-16 review S3: DIN 74's 4.5 and 8.6 mm drawn with PLA's hole allowance.
    const value = (id: 'wallHolder' | 'slideStop', name: string) => templateSteps(id).find((step) => step.command === 'parameters.add' && step.params.name === name)?.params.expression;
    expect([value('wallHolder', 'screw_hole'), value('wallHolder', 'screw_head')]).toEqual([`${String(wallSizes(4).clearance)} mm`, `${String(wallSizes(4).countersink)} mm`]);
    expect([value('wallHolder', 'screw_hole'), value('wallHolder', 'screw_head')]).toEqual(['4.65 mm', '8.75 mm']);
    expect([value('slideStop', 'screw_hole'), value('slideStop', 'screw_head')]).toEqual(['4.65 mm', '9.15 mm']);
    // In PP (0.3 mm) wider still; the insert's hole of the stop at its maker's size (S1).
    const pp = (id: 'wallHolder' | 'slideStop' | 'housing' | 'sign', name: string) => templateSteps(id, false, { nozzle: 0.4, layer: 0.2, material: { holeShrink: 0.3, clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 } } }).find((step) => step.command === 'parameters.add' && step.params.name === name)?.params.expression;
    expect([pp('wallHolder', 'screw_hole'), pp('slideStop', 'clamp_hole'), pp('housing', 'screw_hole'), pp('housing', 'insert_hole'), pp('sign', 'screw_hole')]).toEqual(['4.8 mm', '5.6 mm', '3.7 mm', '4 mm', '3.7 mm']);
    // Review of BC-07, S2: within these ranges the rounds of one wall fit floor, lip and plate (measured at both ends).
    const range = (name: string, german = false) => rangeOf(String(templateSteps('wallHolder', german).find((step) => step.command === 'parameters.add' && step.params.name === name)?.params.comment));
    expect(['plate_height', 'plate_width', 'wall', 'hook_width', 'lip_height'].map((name) => range(name))).toEqual([{ min: 60, max: 200 }, { min: 30, max: 150 }, { min: 4, max: 8 }, { min: 30, max: 120 }, { min: 20, max: 60 }]);
    expect(['plate_height', 'plate_width', 'wall', 'hook_width', 'lip_height'].map((name) => range(name, true))).toEqual(['plate_height', 'plate_width', 'wall', 'hook_width', 'lip_height'].map((name) => range(name)));
  });

  it('says how much room the sign\'s words have and how small its letters may be (audit T56)', () => {
    const comment = (name: string, german = false) => String(templateSteps('sign', german).find((step) => step.command === 'parameters.add' && step.params.name === name)?.params.comment);
    // Between the holes (6 mm in, 3.4 mm wide) and 1 mm clear of them: the length less 17.4 mm.
    expect(comment('label')).toContain('the length less 17.4 mm');
    expect(comment('label', true)).toContain('die Länge weniger 17,4 mm');
    // Review of BC-07, K1: the holes are where the comment says.
    expect(templateSteps('sign').filter((step) => String(step.params.name).startsWith('Screw hole')).map((step) => (step.params.base as string[])[0])).toEqual(['6 mm', 'length - 6 mm']);
    // From 4 mm the strokes of bold capitals are two lines of a 0.4 mm nozzle (blocks.ts, TEXT_STROKE).
    expect(Math.ceil((2 * 0.4) / TEXT_STROKE.bold)).toBe(4);
    expect(rangeOf(comment('text_height'))).toEqual({ min: 4, max: 18 });
    expect(rangeOf(comment('text_height', true))).toEqual({ min: 4, max: 18 });
  });
});
