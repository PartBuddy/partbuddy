import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { hingeOf, occurrenceOf, railTravel, slideOf, withMechanismTool } from '../src/main/agents/mechanismTool';
import { decide } from '../src/main/agents/policy';
import { describeToolCall } from '../src/shared/stepPhrases';
import { hingeProblem, hingeSteps, slideProblem, slideSteps, type HingeSpec, type SlideSpec } from '../src/shared/mechanisms';

const spec: HingeSpec = { fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], diameter: 6, gap: 0.4, knuckles: 3, name: 'Hinge' };

describe('the print-in-place hinge (ADR 0027, G3)', () => {
  it('builds knuckles in turn, each clearing its room in the other body first, then bore and pin', () => {
    const steps = hingeSteps(spec);
    expect(steps.map((step) => [step.params.operation, (step.params.targets as string[])[0], step.params.diameter, step.params.height])).toEqual([
      // Room for the knuckles: a gap wider all round, and a gap longer at the ends inside the hinge.
      ['cut', 'Flap', '6.8 mm', '10.133 mm'],
      ['cut', 'Base', '6.8 mm', '10.533 mm'],
      ['cut', 'Flap', '6.8 mm', '10.133 mm'],
      ['join', 'Base', '6 mm', '9.733 mm'],
      ['join', 'Flap', '6 mm', '9.733 mm'],
      ['join', 'Base', '6 mm', '9.733 mm'],
      ['cut', 'Flap', '3.8 mm', '30 mm'],
      ['join', 'Base', '3 mm', '30 mm'],
    ]);
    expect(steps.every((step) => step.command === 'solid.cylinder' && JSON.stringify(step.params.axis) === '[0,1,0]')).toBe(true);
    // The middle knuckle starts a gap after the first one ends.
    expect(steps[4]?.params.base).toEqual([42, 10.133, 3]);
  });

  it('says what is wrong before anything is built', () => {
    expect(hingeProblem(spec)).toBeNull();
    expect(hingeProblem({ ...spec, moving: 'Base' })).toBe('fixed and moving must be two bodies');
    expect(hingeProblem({ ...spec, knuckles: 4 })).toBe('knuckles must be 3, 5, 7 or 9');
    expect(hingeProblem({ ...spec, diameter: 4, gap: 0.5 })).toContain('the barrel wall around the pin would be 0.5 mm');
    expect(hingeProblem({ ...spec, to: [42, 6, 3] })).toContain('use fewer knuckles or a longer hinge line');
  });

  it('fills in the gap from the nozzle and the knuckles from the length', () => {
    const args = { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [0, 0, 3], to: [0, 60, 3] };
    expect(hingeOf(args, 0.4)).toMatchObject({ diameter: 6, gap: 0.4, knuckles: 5, name: 'Hinge' });
    expect(hingeOf(args, 0.2)).toMatchObject({ gap: 0.3 });
    expect(hingeOf({ ...args, to: [0, 0, 3] }, 0.4)).toBe('from and to must be two points');
    expect(hingeOf({ ...args, fixed: '' }, 0.4)).toBe('fixed, moving, from and to are needed');
  });

  it('finds the occurrence of a body once it is a component', () => {
    const listing = {
      components: [
        { id: 0, parent: null, bodies: ['Flap'], occurrences: [] },
        { id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] },
      ],
    };
    expect(occurrenceOf(listing, 'Base')).toBe('Base:1');
    expect(occurrenceOf(listing, 'Flap')).toBeNull();
  });

  it('builds, makes components, joins, sweeps and sets the limits clear of the contact', async () => {
    const batches: { command: string; params: Record<string, unknown> }[][] = [];
    let components = false;
    const answer = (step: { command: string; params: Record<string, unknown> }): unknown => {
      switch (step.command) {
        case 'document.inspect':
          return { bodies: [{ name: 'Base' }, { name: 'Flap' }] };
        case 'inspect.interference':
          return { count: 0, interferences: [] };
        case 'component.from_bodies':
          components = true;
          return {};
        case 'component.list':
          return { components: components ? [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] : [{ id: 0, parent: null, bodies: ['Base', 'Flap'] }] };
        case 'joint.sweep':
          return step.params.to === 180 ? { stopped_at: 67.375, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [40, 0, 0] } } : { stopped_at: -145.789, stopped_by: { a: 'Flap:1', b: 'Base:1', at: [38, 0, 4] } };
        default:
          return {};
      }
    };
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }] }) }] });
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        batches.push(commands);
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map(answer) }) }] });
      },
    };
    const tools = withMechanismTool(upstream, () => 0.4);
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['partbuddy_mechanism']);
    const built = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], name: 'Lid hinge' });
    expect(built.isError).toBeUndefined();
    expect(built.content[0]).toMatchObject({
      text: expect.stringContaining('Built the hinge "Lid hinge" between Base (stays) and Flap (turns): 3 knuckles, barrel 6 mm, pin 3 mm, gap 0.4 mm everywhere. It turns from -145° to 67° before the bodies meet') as string,
    });
    expect(batches.map((batch) => batch.map((step) => step.command).join(' '))).toEqual([
      Array.from({ length: 8 }, () => 'solid.cylinder').join(' '),
      'document.inspect inspect.interference',
      'component.list',
      'component.from_bodies component.list',
      'joint.as_built joint.sweep joint.sweep',
      'joint.limits',
    ]);
    expect(batches[4]?.[0]?.params).toMatchObject({ type: 'revolute', a: 'Base:1', b: 'Flap:1', at: { occurrence: 'Base:1', point: [42, 15, 3], z: [0, 30, 0] }, name: 'Lid hinge' });
    expect(batches[5]?.[0]?.params).toEqual({ joint: 'Lid hinge', min: -145, max: 67 });

    // A body that does not exist is named with the ones that do; nothing is built.
    const before = batches.length;
    const missing = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Lid', from: [42, 0, 3], to: [42, 30, 3] });
    expect(missing).toMatchObject({ isError: true, content: [{ text: 'Not built: no body "Lid"; the bodies are "Base", "Flap"' }] });
    expect(batches).toHaveLength(before);
  });

  it('takes everything back when a knuckle does not touch its body, and says where the line goes', async () => {
    const calls: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        calls.push(name);
        // Before: three steps to undo. Of the cylinders the five knuckles (48 mm of hinge line) do not touch their body, as SolidCraft 0.40.0-rc.3 warns.
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Box' }, { name: 'Lid' }], undo: 3 }) }] });
        if (name === 'undo') return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
        const commands = args.commands as { command: string; params: { operation?: string; diameter?: string } }[];
        const results = commands.map((step) =>
          step.command === 'document.inspect'
            ? { bodies: [{ name: 'Box' }, { name: 'Lid' }], undo: 11 }
            : step.params.operation === 'join' && step.params.diameter === '6 mm'
              ? { warning: "the joined piece doesn't touch `Box`, so `Box` is now in 2 separate pieces (New Body makes it a body of its own)" }
              : { count: 0, warning: null },
        );
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', from: [0, 43.4, 3], to: [48, 43.4, 3] });
    expect(built.isError).toBe(true);
    expect(built.content[0]).toMatchObject({
      text: 'Not built: 5 piece(s) did not touch their body and stand apart from it. Put the hinge line within 2.5 mm of both bodies (the barrel is 6 mm, so it must overlap each by at least 0.5 mm). ' +
        "It needs no distance from their walls: PartBuddy cuts each knuckle's room in the other body itself. Everything was taken back; call again with the line moved.",
    });
    // Every step SolidCraft counted since (11 − 3) is undone, and no joint was made.
    expect(calls).toEqual(['inspect_design', 'batch', 'batch', ...Array.from({ length: 8 }, () => 'undo')]);
  });

  it('is one line in the work log, by its kind', () => {
    expect(describeToolCall('partbuddy_mechanism', { kind: 'hinge', name: 'Lid hinge' })).toEqual([{ key: 'hinge', values: { name: 'Lid hinge' } }]);
    expect(describeToolCall('partbuddy_mechanism', { kind: 'slide' })).toEqual([{ key: 'guide', values: { name: 'Guide' } }]);
  });

  it('is a tool the policy lets through', () => {
    expect(decide('partbuddy_mechanism', { kind: 'hinge' })).toEqual({ allow: true });
  });
});

describe('the dovetail guide (ADR 0027, G3)', () => {
  const guide: SlideSpec = { fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4], up: [0, 0, 1], width: 6, height: 3, gap: 0.4, name: 'Guide' };

  it('cuts the groove a gap wider all round, then builds the rail, both sketched square to the line and extruded along it', () => {
    const steps = slideSteps(guide);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude', 'sketch.create', 'sketch.line', 'solid.extrude']);
    // Sketch x across the rail, y up: the extrusion runs from "from" towards "to".
    expect(steps[0]?.params.plane).toEqual({ origin: [0, 15, 4], x_dir: [0, 1, 0], y_dir: [0, 0, 1] });
    expect(steps[2]?.params).toMatchObject({ distance: '60 mm', operation: 'cut', targets: ['Carriage'] });
    expect(steps[5]?.params).toMatchObject({ distance: '60 mm', operation: 'join', targets: ['Base'] });
    // The rail: 6 mm at its foot, 3 mm high, 45° flanks.
    expect(steps[4]?.params.points).toEqual([[-3, 0], [3, 0], [6, 3], [-6, 3]]);
    // The groove: the flanks 0.4 mm away measured square to them, its roof 0.4 mm above the rail.
    expect(steps[1]?.params.points).toEqual([[-3.566, -0.4], [3.566, -0.4], [3.566, 0], [6.966, 3.4], [-6.966, 3.4], [-3.566, 0]]);
  });

  it('says what is wrong before anything is built, and fills in the defaults', () => {
    expect(slideProblem(guide)).toBeNull();
    expect(slideProblem({ ...guide, up: [1, 0, 0] })).toContain('up must be square to the line');
    expect(slideProblem({ ...guide, to: [3, 15, 4] })).toBe('from and to must be at least 5 mm apart');
    expect(slideOf({ kind: 'slide', fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4] }, 0.6)).toMatchObject({ up: [0, 0, 1], width: 6, height: 3, gap: 0.6, name: 'Guide' });
  });

  it('lets the moving body travel as far as it stays on the rail', () => {
    // inspect.measure as SolidCraft 0.40.0-rc.3 answers: the carriage lies over x 20 to 40 of a rail from 0 to 60.
    const measure = { bodies: [{ name: 'Carriage', bbox: { min: [20, 0, 4.4], max: [40, 30, 10.4] } }] };
    expect(railTravel(measure, [0, 15, 4], [60, 15, 4])).toEqual([-20, 20]);
    // Seen from the other end of a shorter rail the same body, turned round.
    expect(railTravel(measure, [60, 15, 4], [10, 15, 4])).toEqual([-20, 10]);
    // A body longer than the rail has nowhere to go.
    expect(railTravel({ bodies: [{ bbox: { min: [-5, 0, 4.4], max: [70, 30, 10.4] } }] }, [0, 15, 4], [60, 15, 4])).toEqual([0, 0]);
    expect(railTravel({}, [0, 15, 4], [60, 15, 4])).toBeNull();
  });
});
