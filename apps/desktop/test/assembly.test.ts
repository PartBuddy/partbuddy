import { describe, expect, it } from 'vitest';

import { assemblyPlanSchema, playbackOrder, type AssemblyPlan } from '../src/shared/assembly';
import { joiningDirection, suggestAssembly, type PartBox } from '../src/renderer/src/viewer/assemblyOrder';

const label = (part: string, target: string | null) => (target ? `${part} onto ${target}` : part);

// A housing with a board inside, a lid on top and four screws.
const housing: PartBox = { name: 'Housing', min: [0, 0, 0], max: [80, 50, 30] };
const board: PartBox = { name: 'Board', min: [10, 10, 2], max: [60, 40, 4] };
const lid: PartBox = { name: 'Lid', min: [0, 0, 30], max: [80, 50, 33] };
const screws: PartBox[] = [0, 1, 2, 3].map((i) => ({ name: `Screw ${String(i + 1)}`, min: [4 + i * 20, 4, 25], max: [7 + i * 20, 7, 34], standard: true }));

describe('suggestAssembly', () => {
  it('starts with the base, puts a part inside before the one on top, and fasteners last', () => {
    const plan = suggestAssembly([lid, ...screws, board, housing], label);
    expect(plan?.source).toBe('suggested');
    expect(plan?.steps.map((step) => step.part)).toEqual(['Housing', 'Board', 'Lid', 'Screw 1', 'Screw 2', 'Screw 3', 'Screw 4']);
    expect(plan?.steps[0]).toMatchObject({ target: null });
    expect(plan?.steps[1]).toMatchObject({ target: 'Housing', direction: [0, 0, -1], name: 'Board onto Housing' });
    expect(plan?.steps[2]).toMatchObject({ target: 'Housing', direction: [0, 0, -1] });
    expect(() => assemblyPlanSchema.parse(plan)).not.toThrow();
  });

  it('counts very small parts as fasteners even when they are not standard parts', () => {
    const pin: PartBox = { name: 'Pin', min: [40, 25, 0], max: [41, 26, 5] };
    const plan = suggestAssembly([pin, board, housing], label);
    expect(plan?.steps.at(-1)?.part).toBe('Pin');
  });

  it('joins a part lying beside the others from the side, toward the nearest part', () => {
    const beside: PartBox = { name: 'Lid', min: [100, 0, 0], max: [180, 50, 3] };
    const plan = suggestAssembly([housing, beside], label);
    expect(plan?.steps[1]).toMatchObject({ part: 'Lid', target: 'Housing', direction: [-1, 0, 0] });
  });

  it('makes a plan of one step for one part, and none for nothing', () => {
    expect(suggestAssembly([housing], label)?.steps).toHaveLength(1);
    expect(suggestAssembly([], label)).toBeNull();
  });
});

describe('joiningDirection', () => {
  it('comes down onto a part from above and up into a part from below', () => {
    expect(joiningDirection(lid, housing)).toEqual([0, 0, -1]);
    expect(joiningDirection({ name: 'Foot', min: [10, 10, -5], max: [20, 20, 0] }, housing)).toEqual([0, 0, 1]);
  });
});

describe('assemblyPlanSchema', () => {
  const plan: AssemblyPlan = {
    version: 1,
    source: 'assistant',
    groups: [{ name: 'Hinge', parent: null }],
    steps: [
      { name: 'Base', part: 'Base', direction: [0, 0, -1] },
      { name: 'Pin into the leaf', part: 'Pin', target: 'Leaf', direction: [1, 0, 0], group: 'Hinge' },
      { name: 'Leaf', part: 'Leaf', direction: [0, 0, -1], group: 'Hinge' },
      { name: 'Hinge onto the base', part: 'Hinge', target: 'Base', direction: [0, 0, -1] },
    ],
  };

  it('accepts a plan with a sub-assembly and refuses a zero direction, an unknown group and a loop', () => {
    expect(assemblyPlanSchema.safeParse(plan).success).toBe(true);
    expect(assemblyPlanSchema.safeParse({ ...plan, steps: [{ name: 'X', part: 'X', direction: [0, 0, 0] }] }).success).toBe(false);
    expect(assemblyPlanSchema.safeParse({ ...plan, steps: [{ name: 'X', part: 'X', direction: [0, 0, 1], group: 'Nope' }] }).success).toBe(false);
    expect(assemblyPlanSchema.safeParse({ ...plan, groups: [{ name: 'A', parent: 'B' }, { name: 'B', parent: 'A' }] }).success).toBe(false);
    expect(assemblyPlanSchema.safeParse({ ...plan, extra: 1 }).success).toBe(false);
  });

  it('plays the sub-assembly first, then moves it into the main assembly as one piece', () => {
    const order = playbackOrder(plan);
    expect(order.map((step) => step.name)).toEqual(['Pin into the leaf', 'Leaf', 'Base', 'Hinge onto the base']);
    expect(order[3]?.bodies).toEqual(['Pin', 'Leaf']);
    expect(order[0]?.group).toBe('Hinge');
  });

  it('adds a sub-assembly that no step of its parent names at the end of the parent', () => {
    const order = playbackOrder({ ...plan, steps: plan.steps.slice(0, 3) });
    expect(order.at(-1)).toMatchObject({ name: 'Hinge', bodies: ['Pin', 'Leaf'], direction: [0, 0, -1] });
  });
});

describe('assembly.json in the project', () => {
  it('reads back what was written, and nothing from a missing or broken file', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { readAssembly, writeAssembly, ASSEMBLY_FILE } = await import('../src/main/projects/assembly');
    const folder = mkdtempSync(join(tmpdir(), 'partbuddy-assembly-'));
    try {
      expect(readAssembly(folder)).toBeNull();
      const plan: AssemblyPlan = { version: 1, source: 'assistant', groups: [], steps: [{ name: 'Base', part: 'Base', direction: [0, 0, -1] }] };
      writeAssembly(folder, plan);
      expect(readAssembly(folder)).toEqual(plan);
      const logged: string[] = [];
      writeFileSync(join(folder, ASSEMBLY_FILE), '{"version": 2}');
      expect(readAssembly(folder, (message) => logged.push(message))).toBeNull();
      expect(logged[0]).toMatch(/assembly order not read/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('partbuddy_assembly', () => {
  it('keeps a valid order and refuses unknown bodies with the names it knows', async () => {
    const { withAssemblyTool, ASSEMBLY_TOOL } = await import('../src/main/agents/assemblyTool');
    const saved: AssemblyPlan[] = [];
    const upstream = { instructions: () => '', listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [] }) };
    const tools = withAssemblyTool(upstream, () => ['Housing', 'Lid'], (plan) => saved.push(plan));
    expect((await tools.listTools()).map((tool) => tool.name)).toContain(ASSEMBLY_TOOL);
    const ok = await tools.callTool(ASSEMBLY_TOOL, { steps: [{ name: 'Housing', part: 'Housing', direction: [0, 0, -1] }, { name: 'Lid on', part: 'Lid', target: 'Housing', direction: [0, 0, -1] }] });
    expect(ok.isError).toBeUndefined();
    expect(saved[0]?.source).toBe('assistant');
    const refused = await tools.callTool(ASSEMBLY_TOOL, { steps: [{ name: 'Knob', part: 'Knob', direction: [0, 0, -1] }] });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toMatch(/unknown bodies or groups: Knob.*Housing, Lid/);
    expect(saved).toHaveLength(1);
  });
});

describe('the base of the proposal', () => {
  it('is the largest of the parts standing lowest, not a thin lid laid beside it', () => {
    const lidBeside: PartBox = { name: 'Lid', min: [100, 0, 0], max: [182, 52, 3] };
    expect(suggestAssembly([lidBeside, housing], label)?.steps[0]?.part).toBe('Housing');
  });
});
