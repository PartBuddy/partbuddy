import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { builtHinges, changesParameters, hingesAgain, expressionOf, givenFollow, hingeFollow, numericPlaces, pinFaces, placeExpressions, withMechanismTool, type Bounds, type Moves } from '../src/main/agents/mechanismTool';
import { followed, followSteps, hingeSteps, type HingeSpec } from '../src/shared/mechanisms';

type Step = { command: string; params: Record<string, unknown> };

// #446: "Make the box 10 mm taller" took hinge and closure back and built them again; now they follow the parameters.
describe('mechanisms that follow the parameters', () => {
  const bare: HingeSpec = { fixed: 'Box', moving: 'Lid', from: [0, 60.4, 20], to: [26.4, 60.4, 20], diameter: 6, gap: 0.4, knuckles: 3, name: 'Hinge' };
  const hinge: HingeSpec = { fixed: 'Box', moving: 'Lid', from: [0, 60.4, 20], to: [26.4, 60.4, 20], diameter: 6, gap: 0.4, knuckles: 3, name: 'Hinge', support: { bed: 0, fixed: { toward: [0, -1, 0], distance: 0.4 }, moving: { toward: [0, 1, 0], distance: 0.4 } } };
  const follow = [undefined, { expr: 'w + g / 2', at: 60.4 }, { expr: 'h', at: 20 }];

  it('writes a coordinate as an expression that keeps its distance', () => {
    expect(followed(undefined, 3)).toBe(3);
    expect(followed({ expr: 'h', at: 20 }, 20)).toBe('(h)');
    expect(followed({ expr: 'h', at: 20 }, 23.5)).toBe('(h) + 3.5 mm');
    expect(followed({ expr: 'h', at: 20 }, 17)).toBe('(h) - 3 mm');
  });

  it('builds a hinge lying along x with every place across it and in height by the expressions, and its profiles on the YZ plane', () => {
    const { steps, fixed } = followSteps(hingeSteps(hinge), follow);
    expect(fixed).toBe(0);
    const cylinders = steps.filter((step) => step.command === 'solid.cylinder');
    expect(cylinders.length).toBeGreaterThan(0);
    for (const step of cylinders) {
      const [x, y, z] = step.params.base as unknown[];
      expect(typeof x).toBe('number');
      expect(String(y)).toMatch(/^\(w \+ g \/ 2\)/);
      expect(String(z)).toMatch(/^\(h\)/);
    }
    const sketches = steps.filter((step) => step.command === 'sketch.create');
    expect(sketches.length).toBeGreaterThan(0);
    for (const step of sketches) expect(step.params.plane).toBe('YZ');
    // The bore's roof starts a gap before the line, along +x: offset at its start.
    expect(steps.find((step) => step.command === 'sketch.create' && step.params.name === 'Hinge △')?.params.offset).toBe('-0.4 mm');
    for (const step of steps.filter((entry) => entry.command === 'sketch.line')) for (const [u, v] of step.params.points as unknown[][]) expect([String(u), String(v)]).toEqual([expect.stringMatching(/^\(w \+ g \/ 2\)/), expect.stringMatching(/^\(h\)/)]);
  });

  it('draws a profile that looks back along the axis where its extrusion ends, and one along y on the XZ plane with z turned', () => {
    const back = followSteps(hingeSteps({ ...hinge, from: [26.4, 60.4, 20], to: [0, 60.4, 20] }), follow).steps;
    const roof = back.findIndex((step) => step.params.name === 'Hinge △');
    // From 26.8 back along -x by 27.2 mm: drawn at -0.4, extruded up +x.
    expect(back[roof]?.params.offset).toBe('-0.4 mm');
    expect(back[roof + 2]?.params.distance).toBe('27.2 mm');
    const alongY = followSteps(hingeSteps({ ...bare, from: [40, 0, 20], to: [40, 26.4, 20] }), [{ expr: 'x0', at: 40 }, undefined, { expr: 'h', at: 20 }]).steps;
    const sketch = alongY.findIndex((step) => step.command === 'sketch.create');
    expect(alongY[sketch]?.params.plane).toBe('XZ');
    const [[u, v]] = alongY[sketch + 1]?.params.points as unknown[][] as [[unknown, unknown]];
    expect(String(u)).toMatch(/^\(x0\)/);
    expect(String(v)).toMatch(/^-\(\(h\)/);
  });

  it('keeps nothing of a hinge at a slant: its profiles cannot be drawn on a principal plane', () => {
    expect(followSteps(hingeSteps({ ...bare, from: [0, 0, 20], to: [20, 20, 20] }), follow).fixed).toBeGreaterThan(0);
  });

  // The hinged box of the run: Box from y 0 to 60, Lid from 60.8 to 120.8, both 20 mm high, on width, hinge_gap and both heights.
  const box = (width: number, gap: number, high: number, lid: number): Bounds[] => [
    { min: [0, 0, 0], max: [80, width, high] },
    { min: [0, width + gap, 0], max: [80, 2 * width + gap, lid] },
  ];
  const moves: Moves = {
    base: box(60, 0.8, 20, 20),
    moves: [
      { name: 'width', value: 60, bounds: box(61, 0.8, 20, 20) },
      { name: 'hinge_gap', value: 0.8, bounds: box(60, 1.8, 20, 20) },
      { name: 'box_height', value: 20, bounds: box(60, 0.8, 21, 20) },
      { name: 'lid_height', value: 20, bounds: box(60, 0.8, 20, 21) },
      { name: 'length', value: 80, bounds: box(60, 0.8, 20, 20).map((entry) => ({ ...entry, max: [81, entry.max[1], entry.max[2]] })) },
    ],
  };

  it('finds the expression a measure of the boxes moves by', () => {
    expect(expressionOf((bounds) => bounds[1]?.min[1] ?? 0, moves)).toEqual({ expr: 'width + hinge_gap', at: 60.8 });
    expect(expressionOf((bounds) => (bounds[1]?.max[2] ?? 0) - 3, moves)).toEqual({ expr: 'lid_height - 3 mm', at: 17 });
    expect(expressionOf((bounds) => bounds[0]?.min[0] ?? 0, moves)).toBeUndefined();
  });

  it('lets the line PartBuddy found follow the middle of the gap and the rims, not along itself', () => {
    expect(hingeFollow({ from: [0, 60.4, 20], to: [80, 60.4, 20] }, 6, moves)).toEqual([undefined, { expr: 'width + 0.5 * hinge_gap', at: 60.4 }, { expr: '0.5 * box_height + 0.5 * lid_height', at: 20 }]);
  });

  it('takes the expressions a line was given by, across it and in height', () => {
    const given = { from: [0, 'w / 2', 'h'], to: ['length', 'w / 2', 20] };
    const values = new Map([['w / 2', 30], ['h', 20], ['length', 80]]);
    expect(placeExpressions({ ...given, hinge_from: [' h ', 1, 2] })).toEqual(['w / 2', 'h', 'length']);
    const numeric = numericPlaces(given, values);
    expect(numeric).toEqual({ from: [0, 30, 20], to: [80, 30, 20] });
    expect(givenFollow(given, numeric as Pick<HingeSpec, 'from' | 'to'>, values)).toEqual([undefined, { expr: 'w / 2', at: 30 }, { expr: 'h', at: 20 }]);
  });

  it('keeps the joint on the round faces of pin and bore inside the first knuckle of the moving body', () => {
    // Knuckles of 8.533 mm: the first moving one from 8.933 to 17.466, its middle at 13.2.
    expect(pinFaces(hinge)).toEqual({ fixed: [13.2, 60.4, 21.5], moving: [13.2, 60.4, 18.1], x: [0, 0, 1] });
  });

  it('reads a following hinge from its pin, by the values of its expressions, and makes its part in the lid again to follow them', async () => {
    const definitions: Record<number, Record<string, unknown>> = {
      1: { axis: [1, 0, 0], base: [-0.4, '(w + g / 2)', '(h)'], height: '9.333 mm', participants: ['Lid'], radius: '(6.8 mm) / 2' },
      4: { axis: [1, 0, 0], base: [0, '(w + g / 2)', '(h)'], height: '8.533 mm', participants: ['Box'], radius: '(6 mm) / 2' },
      5: { axis: [1, 0, 0], base: [0, '(w + g / 2)', '(h)'], height: '26.4 mm', participants: ['Box'], radius: '(3 mm) / 2' },
    };
    const names = ['Hinge 1 ·', 'Hinge 2 ·', 'Hinge 3 ·', 'Hinge 1', 'Hinge ●'];
    const run = (commands: Step[]) => Promise.resolve(commands.map((step) => (step.command === 'document.inspect' ? { timeline: names.map((name, i) => ({ id: i + 1, name })) } : { suppressed: false, definition: definitions[Number(step.params.feature)] })));
    const [found] = await builtHinges(run, 'Lid', (expressions) => Promise.resolve(new Map(expressions.map((expression) => [expression, expression === '(h)' ? 20 : 60.4]))));
    expect(found).toMatchObject({ name: 'Hinge', from: [0, 60.4, 20], to: [26.4, 60.4, 20], keep: { side: 'b', circle: [13.2, 60.4, 18.1] } });
    expect(found?.follow).toEqual([undefined, { expr: '(w + g / 2)', at: 60.4 }, { expr: '(h)', at: 20 }]);
    expect(found?.steps.filter((step) => step.command === 'solid.cylinder').every((step) => String((step.params.base as unknown[])[2]).startsWith('((h))'))).toBe(true);
  });

  it('builds a closure given by expressions with its room and rim by them, and says so', async () => {
    const values: Record<string, number> = { wall: 2, 'length - wall': 58, 'width - wall': 38, lid_h: 20 };
    const sent: Step[][] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Box' }, { name: 'Lid' }] }) }] });
        const commands = args.commands as Step[];
        sent.push(commands);
        const answer = (step: Step) => (step.command === 'parameters.add' ? { value: values[String(step.params.expression)] } : step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {});
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map(answer) }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'closure', fixed: 'Box', moving: 'Lid', from: ['wall', 'wall', 'lid_h'], to: ['length - wall', 'width - wall', 'lid_h'], up: [0, 0, -1], side: 'y-' });
    expect(built.isError).toBeUndefined();
    expect(String(built.content[0]?.text)).toContain('It follows the parameters, its room, its rim with them');
    const steps = sent.flat();
    const lip = steps.find((step) => step.command === 'sketch.create' && step.params.name === 'Closure');
    expect(String(lip?.params.offset)).toContain('lid_h');
    expect(steps.some((step) => step.command === 'sketch.rectangle.two_point' && JSON.stringify(step.params).includes('length - wall'))).toBe(true);
    // No parameter was nudged: the expressions given say what it follows.
    expect(steps.some((step) => step.command === 'parameters.change')).toBe(false);
  });

  it('refuses a place whose expression comes to no length', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: (args.commands as Step[]).map(() => ({})), failed: { index: 0, error: 'unknown parameter nope' } }) }] }),
    };
    const refused = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [0, 'nope', 20], to: [40, 'nope', 20] });
    expect(refused.isError).toBe(true);
    expect(String(refused.content[0]?.text)).toContain('the place "nope" is no length over the design\'s parameters');
  });

  it('runs the hinges that follow the parameters through again after a change, and sets their limits', async () => {
    expect(changesParameters('set_parameter', {})).toBe(true);
    expect(changesParameters('batch', { commands: [{ command: 'parameters.change' }] })).toBe(true);
    expect(changesParameters('execute', { command: 'solid.box' })).toBe(false);
    const sent: Step[] = [];
    const run = (commands: Step[]) => {
      sent.push(...commands);
      return Promise.resolve(
        commands.map((step) => {
          if (step.command === 'document.inspect') return { timeline: [{ id: 5, name: 'Hinge ●' }, { id: 9, name: 'Fixed ●' }] };
          if (step.command === 'timeline.inspect') return { definition: { base: step.params.feature === 5 ? [0, '(w)', '(h)'] : [0, 1, 2] } };
          if (step.command === 'joint.list') return { joints: [{ name: 'Hinge', type: 'revolute', values: [{ value: 0 }] }, { name: 'Fixed', type: 'revolute', values: [{ value: 0 }] }] };
          if (step.command === 'joint.sweep') return { stopped_at: step.params.to === -180 ? -9.4 : 177.3 };
          return {};
        }),
      );
    };
    expect(await hingesAgain(run)).toContain('"Hinge" now turns from -9° to 177°');
    // The hinge built at numbers stays as it was.
    expect(sent.filter((step) => step.command === 'joint.limits')).toEqual([{ command: 'joint.limits', params: { joint: 'Hinge', min: -9, max: 177 } }]);
  });
});
