import { describe, expect, it } from 'vitest';

import { templateRequestSchema } from '../src/shared/contract';
import { TEMPLATE_IDS, germanFeatureName, templatePrintFaces, templateSteps } from '../src/shared/templates';

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
      // The closure follows the sizes too: lip, bead and rille are placed by the parameters, and nothing cuts through a wall.
      const rings = steps.filter((step) => step.command === 'sketch.rectangle.rounded');
      expect(rings).toHaveLength(4);
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

  it('seats the housing\'s screws as standard parts on the lid, and words the sign from its text parameter', () => {
    // One part per hole, each body named, so the view shows all four.
    expect(templateSteps('housing').filter((step) => step.command === 'parts.insert')).toHaveLength(4);
    expect(templateSteps('housing', true).filter((step) => step.command === 'body.rename').map((step) => step.params.name)).toEqual([1, 2, 3, 4].map((n) => `M3-Schraube ${String(n)}`));
    expect(templateSteps('sign').find((step) => step.command === 'sketch.text')?.params.text_expression).toBe('label');
    expect(germanFeatureName('Hinge ●')).toBe('Scharnier ●');
  });
});
