import { describe, expect, it } from 'vitest';

import { templateRequestSchema } from '../src/shared/contract';
import { TEMPLATE_IDS, templateSteps } from '../src/shared/templates';

/** The geometry fields whose text is an expression over the design's parameters. */
const EXPRESSION_FIELDS = new Set(['length', 'width', 'height', 'diameter', 'thickness', 'depth', 'corner', 'base', 'position', 'center', 'points', 'point', 'distance', 'cs_diameter']);

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
});
