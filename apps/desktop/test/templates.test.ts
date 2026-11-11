import { describe, expect, it } from 'vitest';

import { templateRequestSchema } from '../src/shared/contract';
import { TEMPLATE_IDS, germanFeatureName, templateSteps } from '../src/shared/templates';

/** The geometry fields whose text is an expression over the design's parameters. */
const EXPRESSION_FIELDS = new Set(['length', 'width', 'height', 'diameter', 'thickness', 'depth', 'corner', 'base', 'position', 'center', 'points', 'point', 'distance', 'cs_diameter', 'radius', 'text_expression', 'offset', 'ra', 'rb']);

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
          for (const text of expressions(value)) for (const word of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) if (word !== 'mm') used.add(word);
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
      expect([joint.a.occurrence, joint.b.occurrence, joint.limits]).toEqual([box, lid, [[0, 177]]]);
      // Every knuckle sits on the rim and keeps its place from the middle of the box.
      const knuckles = steps.filter((step) => step.command === 'solid.cylinder');
      expect(knuckles).toHaveLength(12);
      // The latch follows the sizes too: nothing of it is placed by a bare number.
      for (const step of steps.filter((step) => step.command === 'solid.box' && String(step.params.name).match(/^(Latch|Verschluss|Rast)/))) expect(JSON.stringify(step.params.corner)).toMatch(/length.*width.*height/);
      for (const step of knuckles) expect(step.params.base).toEqual([expect.stringMatching(/^length \/ 2 \+ -?[\d.]+ mm$/), 0.5, 'height']);
    }
    expect(germanFeatureName('Hinge 2 ·')).toBe('Scharnier 2 ·');
  });

  it('joins the stop as a slider and couples the wheels by their radii, by name in either language', () => {
    for (const [german, base, stop, guide] of [[false, 'Base', 'Stop', 'Guide'], [true, 'Grundplatte', 'Anschlag', 'Führung']] as const) {
      const slider = templateSteps('slideStop', german).find((step) => step.command === 'joint.as_built')?.params as { a: string; b: string; at: { occurrence: string }; name: string };
      expect([slider.a, slider.b, slider.at.occurrence, slider.name]).toEqual([base, stop, base, guide]);
    }
    // The rail and its groove are as long as the base.
    expect(templateSteps('slideStop').filter((step) => step.command === 'solid.extrude').map((step) => step.params.distance)).toEqual(['length', 'length']);
    for (const [german, crank, axle] of [[false, 'Crank', 'Small axle'], [true, 'Kurbel', 'Kleine Achse']] as const) {
      const steps = templateSteps('crankWheels', german);
      expect(steps.filter((step) => step.command === 'joint.create').map((step) => step.params.name)).toEqual([crank, axle]);
      expect(steps.find((step) => step.command === 'joint.gear')?.params).toEqual({ a: crank, b: axle, ra: 'large / 2', rb: 'small / 2' });
    }
  });

  it('seats the housing\'s screws as standard parts on the lid, and words the sign from its text parameter', () => {
    // One part per hole, each body named, so the view shows all four.
    expect(templateSteps('housing').filter((step) => step.command === 'parts.insert')).toHaveLength(4);
    expect(templateSteps('housing', true).filter((step) => step.command === 'body.rename').map((step) => step.params.name)).toEqual([1, 2, 3, 4].map((n) => `M3-Schraube ${String(n)}`));
    expect(templateSteps('sign').find((step) => step.command === 'sketch.text')?.params.text_expression).toBe('label');
    expect(germanFeatureName('Hinge ●')).toBe('Scharnier ●');
  });
});
