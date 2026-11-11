import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { activated, hingeOf, lipOf, occurrenceOf, railTravel, screwOf, slideOf, withMechanismTool } from '../src/main/agents/mechanismTool';
import { decide } from '../src/main/agents/policy';
import { describeToolCall } from '../src/shared/stepPhrases';
import { hingeProblem, hingeSteps, lipProblem, lipSteps, screwLength, screwProblem, screwSteps, slideProblem, slideSteps, type HingeSpec, type LipSpec, type ScrewSpec, type SlideSpec } from '../src/shared/mechanisms';

const spec: HingeSpec = { fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], diameter: 6, gap: 0.4, knuckles: 3, name: 'Hinge' };

describe('the print-in-place hinge (ADR 0027, G3)', () => {
  it('builds knuckles in turn, each clearing its room in the other body first, then bore and pin', () => {
    const all = hingeSteps(spec);
    const steps = all.filter((step) => step.command === 'solid.cylinder');
    // Lying, the bore gets a roof: flanks at 45° from the bore (radius 1.9 mm) and a flat 1.2 radii up, cut through the flap along the whole line.
    const roof = all.filter((step) => step.command !== 'solid.cylinder');
    expect(roof.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude']);
    expect(roof[0]?.params.plane).toEqual({ origin: [42, -0.4, 3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(roof[1]?.params.points).toEqual([[-1.344, 1.344], [1.344, 1.344], [0.407, 2.28], [-0.407, 2.28]]);
    expect(roof[2]?.params).toMatchObject({ distance: '30.8 mm', operation: 'cut', targets: ['Flap'], name: 'Hinge △' });
    // Upright, a round bore prints as it is.
    expect(hingeSteps({ ...spec, from: [0, 0, 0], to: [0, 0, 30] }).every((step) => step.command === 'solid.cylinder')).toBe(true);
    expect(steps.map((step) => [step.params.operation, (step.params.targets as string[])[0], step.params.diameter, step.params.height])).toEqual([
      // Room for the knuckles: a gap wider all round and a gap longer at both ends, past the ends of the hinge line too.
      ['cut', 'Flap', '6.8 mm', '10.533 mm'],
      ['cut', 'Base', '6.8 mm', '10.533 mm'],
      ['cut', 'Flap', '6.8 mm', '10.533 mm'],
      ['join', 'Base', '6 mm', '9.733 mm'],
      ['join', 'Flap', '6 mm', '9.733 mm'],
      ['join', 'Base', '6 mm', '9.733 mm'],
      ['cut', 'Flap', '3.8 mm', '30.8 mm'],
      ['join', 'Base', '3 mm', '30 mm'],
    ]);
    expect(steps.every((step) => JSON.stringify(step.params.axis) === '[0,1,0]')).toBe(true);
    // The middle knuckle starts a gap after the first one ends.
    expect(steps[4]?.params.base).toEqual([42, 10.133, 3]);
    // A body wider than the hinge must not lie against the outer knuckles: their room and the bore start a gap before the line.
    expect(steps[0]?.params.base).toEqual([42, -0.4, 3]);
    expect(steps[6]?.params.base).toEqual([42, -0.4, 3]);
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
    // 60 mm of line: seven knuckles, so none is longer than 10 mm.
    expect(hingeOf(args, 0.4)).toMatchObject({ diameter: 6, gap: 0.4, knuckles: 7, name: 'Hinge' });
    expect(hingeOf({ ...args, to: [0, 30, 3] }, 0.4)).toMatchObject({ knuckles: 3 });
    expect(hingeOf({ ...args, to: [0, 200, 3] }, 0.4)).toMatchObject({ knuckles: 9 });
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
      'component.list joint.list',
      [...Array.from({ length: 7 }, () => 'solid.cylinder'), 'sketch.create', 'sketch.line', 'solid.extrude', 'solid.cylinder'].join(' '),
      'document.inspect inspect.interference',
      'component.list',
      'component.from_bodies component.list',
      'joint.as_built',
      'joint.sweep joint.sweep',
      'joint.limits',
    ]);
    expect(batches[5]?.[0]?.params).toMatchObject({ type: 'revolute', a: 'Base:1', b: 'Flap:1', at: { occurrence: 'Base:1', point: [42, 15, 3], z: [0, 30, 0] }, name: 'Lid hinge' });
    expect(batches[7]?.[0]?.params).toEqual({ joint: 'Lid hinge', min: -145, max: 67 });

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
    expect(calls).toEqual(['inspect_design', 'batch', 'batch', 'batch', ...Array.from({ length: 8 }, () => 'undo')]);
  });

  it('builds onto a body that is a component with that component active, so the knuckles move with it', () => {
    // The flap is a component already (a second mechanism, or the assistant made components first); the base is not.
    const listing = { active: 0, components: [{ id: 0, parent: null, bodies: ['Base'] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] };
    const steps = activated(hingeSteps(spec), listing);
    const target = (step: { command: string; params: Record<string, unknown> }) => (step.command === 'component.activate' ? `activate ${String(step.params.component)}` : ((step.params.targets as string[] | undefined)?.[0] ?? step.command));
    // The roof's sketch is drawn with the flap active, as the bore before it and the cut after it.
    expect(steps.map(target)).toEqual(['activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'sketch.create', 'sketch.line', 'Flap', 'activate 0', 'Base']);
    // Nothing is a component: the steps as they are.
    expect(activated(hingeSteps(spec), { components: [{ id: 0, parent: null, bodies: ['Base', 'Flap'] }] })).toEqual(hingeSteps(spec));
    // A guide's sketch belongs to the component of the extrusion that uses it, and the design level is active again at the end.
    const guide = activated(slideSteps({ fixed: 'Base', moving: 'Flap', from: [0, 15, 4], to: [60, 15, 4], up: [0, 0, 1], width: 6, height: 3, gap: 0.4, name: 'Guide' }), listing);
    expect(guide.map((step) => step.command)).toEqual(['component.activate', 'sketch.create', 'sketch.line', 'solid.extrude', 'component.activate', 'sketch.create', 'sketch.line', 'solid.extrude']);
  });

  it('asks for the joints at 0 before it builds', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 3 }) }] });
        const commands = args.commands as { command: string }[];
        const results = commands.map((step) => (step.command === 'joint.list' ? { joints: [{ name: 'Lid hinge', values: [{ unit: 'deg', value: 90 }] }] } : {}));
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    expect(built).toMatchObject({ isError: true, content: [{ text: 'Not built: the joint(s) "Lid hinge" stand away from 0; drive them back with joint.drive first, so the bodies are where they were designed' }] });
  });

  it('keeps the joint when SolidCraft cannot run the sweep, and says so', async () => {
    let components = false;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 0 }) }] });
        const commands = args.commands as { command: string }[];
        // As SolidCraft 0.40.0-rc.3 answers when parts lie against each other along the way.
        if (commands.some((step) => step.command === 'joint.sweep')) {
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: [], failed: { command: 'joint.sweep', error: 'motion exceeds contact sweep collision budget; simplify the contact set or use smaller increments' } }) }] });
        }
        const results = commands.map((step) => {
          if (step.command === 'component.from_bodies') components = true;
          if (step.command === 'component.list') return { components: components ? [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] : [] };
          return step.command === 'document.inspect' ? { bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 8 } : {};
        });
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    expect(built.isError).toBeUndefined();
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining('SolidCraft could not run it through its range (motion exceeds contact sweep collision budget') as string });
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining('no limits are set') as string });
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

describe('the snap closure of a lid (G3)', () => {
  // A lid sitting on its box: the room inside both is 56 × 36 mm, the rim at 20 mm, the lip goes down.
  const lid: LipSpec = { fixed: 'Box', moving: 'Lid', min: [2, 2], max: [58, 38], rim: 20, up: -1, radius: 0, wall: 2, side: 'y-', name: 'Closure' };

  it('builds a lip ring on a foot inside the lid, a bead on it, its rille in the box and a notch, nothing outside', () => {
    const steps = lipSteps(lid);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['sketch.create', 'Closure ·'],
      ['sketch.rectangle.two_point', ''],
      ['sketch.rectangle.two_point', ''],
      ['solid.extrude', 'Closure ·'],
      ['sketch.create', 'Closure'],
      ['sketch.rectangle.two_point', ''],
      ['sketch.rectangle.two_point', ''],
      ['solid.extrude', 'Closure'],
      ['solid.chamfer', 'Closure ◢'],
      ['solid.box', 'Closure ●'],
      ['solid.chamfer', 'Closure ◆'],
      ['solid.cylinder', 'Closure ○'],
      ['solid.cylinder', 'Closure ◠'],
    ]);
    // The foot lies above the rim in the lid, 0.2 mm into its wall; the lip hangs 4 mm below the rim, 0.25 mm clear, 1.2 mm thick.
    expect(steps[0]?.params.offset).toBe('20 mm');
    expect(steps[1]?.params).toEqual({ p0: ['2 mm - 0.2 mm', '2 mm - 0.2 mm'], p1: ['58 mm + 0.2 mm', '38 mm + 0.2 mm'] });
    expect(steps[4]?.params.offset).toBe('20 mm - 4 mm');
    expect(steps[5]?.params).toEqual({ p0: ['2 mm + 0.25 mm', '2 mm + 0.25 mm'], p1: ['58 mm - 0.25 mm', '38 mm - 0.25 mm'] });
    expect(steps[6]?.params).toEqual({ p0: ['2 mm + 1.45 mm', '2 mm + 1.45 mm'], p1: ['58 mm - 1.45 mm', '38 mm - 1.45 mm'] });
    // Only the rille is cut from the box; everything else belongs to the lid.
    expect(steps.filter((step) => JSON.stringify(step.params.targets ?? step.params.body ?? '').includes('Box')).map((step) => step.params.name)).toEqual(['Closure ○']);
    // The bead stands 0.25 mm past the wall's face (0.5 mm proud of the lip), 14 mm long in the wall's middle; its rille sits where it lands.
    expect(steps[9]?.params).toMatchObject({ length: '14 mm', width: '0.5 mm', height: '1 mm', corner: ['(2 mm + 58 mm) / 2 - 7 mm', '2 mm - 0.25 mm', '20 mm - 3 mm'] });
    expect(steps[11]?.params).toMatchObject({ diameter: '1.4 mm', axis: 'X', base: ['(2 mm + 58 mm) / 2 - 7.5 mm', '2 mm + 0.25 mm', '20 mm - 2.5 mm'] });
    // Rounded rooms get rounded rings, each radius less its inset.
    expect(lipSteps({ ...lid, radius: 4 })[5]?.params).toMatchObject({ radius: '4 mm - 0.25 mm' });
  });

  it('puts the rille where the bead lands when the lid is built open and closes on a hinge, and follows a template\'s parameters', () => {
    const open = lipSteps({ ...lid, up: 1, side: 'y+', rim: { at: 16, expr: 'height' }, hinge: { along: 'x', across: 0.5, z: { at: 16, expr: 'height' } } });
    expect(open[11]?.params.base).toEqual(['(2 mm + 58 mm) / 2 - 7.5 mm', '2 * 0.5 mm - (38 mm - 0.25 mm)', '2 * (height) - ((height) + 2.5 mm)']);
    expect(open[0]?.params.offset).toBe('(height) - 3 mm');
  });

  it('says what is wrong before anything is built', () => {
    expect(lipProblem(lid)).toBeNull();
    expect(lipProblem({ ...lid, moving: 'Box' })).toBe('fixed and moving must be two bodies');
    expect(lipProblem({ ...lid, side: 'x-', max: [58, 20] })).toContain('Put the catch on a longer wall');
    expect(lipProblem({ ...lid, wall: 1 })).toContain('wall must be 1.6–10 mm');
    const args = { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [58, 2, 20], to: [2, 38, 20], up: [0, 0, -1], side: 'y-' };
    expect(lipOf(args)).toMatchObject({ min: [2, 2], max: [58, 38], rim: 20, up: -1, wall: 2, radius: 0, name: 'Closure' });
    expect(lipOf({ ...args, to: [2, 38, 25] })).toBe("from and to must both lie at the height of the lid's rim");
    expect(lipOf({ ...args, up: [1, 0, 0] })).toContain('up must be +Z');
    expect(lipOf({ ...args, side: 'front' })).toContain('side must be x-, x+, y- or y+');
    expect(lipOf({ ...args, hinge_from: [0, 0, 20], hinge_to: [60, 0, 20] })).toMatchObject({ hinge: { along: 'x', across: 0, z: 20 } });
    expect(lipOf({ ...args, hinge_from: [0, 0, 20], hinge_to: [60, 10, 20] })).toBe('the hinge line must run level, along X or along Y');
  });

  it('is one line of the work log, and the tool builds it without a joint', async () => {
    expect(describeToolCall('partbuddy_mechanism', { kind: 'closure', name: 'Lid closure' })).toEqual([{ key: 'closure', values: { name: 'Lid closure' } }]);
    const batches: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Box' }, { name: 'Lid' }] }) }] });
        const commands = args.commands as { command: string }[];
        batches.push(commands.map((step) => step.command).join(' '));
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [2, 2, 20], to: [58, 38, 20], up: [0, 0, -1], side: 'y-' });
    expect(built.isError).toBeUndefined();
    expect(built.content[0]).toMatchObject({ text: expect.stringContaining('Built the closure "Closure" between Box (the box) and Lid (the lid): a lip 1.2 mm thick and 4 mm high inside the lid, 0.25 mm clear') as string });
    expect(batches).toHaveLength(3);
    expect(batches.join(' ')).not.toContain('joint.as_built');
  });
});

describe('the screw joint (standards)', () => {
  // A plate 6 mm thick on a block: the screws go in from above at z 26 and pass into the block at z 20.
  const joint: ScrewSpec = { fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20], more: [[50, 30, 26]], size: 'M3', head: 'cap', thread: 'insert', screws: true, name: 'Screw' };

  it('drills the clearance hole with its counterbore only through the plate, seats the insert on the same line, and puts the screws in last', () => {
    const steps = screwSteps(joint);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['solid.hole', 'Screw 1'],
      ['solid.hole', 'Screw 1 ○'],
      ['solid.hole', 'Screw 2'],
      ['solid.hole', 'Screw 2 ○'],
      ['parts.insert', ''],
      ['parts.insert', ''],
    ]);
    expect(steps[0]?.params).toEqual({ position: [10, 10, 26], clearance: 'M3', fit: 'normal', type: 'counterbore', cb_diameter: '6.7 mm', cb_depth: '3.4 mm', direction: [0, 0, -1], depth: '6 mm', targets: ['Plate'], name: 'Screw 1' });
    // The seat is a millimetre deeper than the 5.7 mm insert.
    expect(steps[1]?.params).toEqual({ position: [10, 10, 20], direction: [0, 0, -1], diameter: '4 mm', depth: '6.7 mm', targets: ['Block'], name: 'Screw 1 ○' });
    expect(steps[3]?.params.position).toEqual([50, 30, 20]);
    // M3×8: 2.6 mm of plate under the head and 5.4 mm of the 5.7 mm insert. It sits on the counterbore's floor, head up.
    expect(screwLength(joint)).toBe(8);
    expect(steps[4]?.params).toEqual({ family: 'socket_head_cap_screw', size: 'M3', length: 8, point: [10, 10, 22.6], direction: [0, 0, 1] });
    // A countersunk screw is measured from its top, which lies flush; a thread from M5 is modelled.
    const sunk = screwSteps({ ...joint, head: 'countersunk', size: 'M4', more: [] });
    expect(sunk[0]?.params).toMatchObject({ type: 'countersink', cs_diameter: '9.56 mm', cs_angle: '90 deg' });
    expect(sunk[2]?.params).toMatchObject({ family: 'countersunk_socket_screw', length: 12, point: [10, 10, 26] });
    expect(screwSteps({ ...joint, size: 'M6', thread: 'tapped', head: 'none', more: [] })[1]?.params).toMatchObject({ thread: 'M6', modeled: true, depth: '16 mm' });
    expect(screwSteps({ ...joint, screws: false })).toHaveLength(4);
  });

  it('says what is wrong before anything is built', () => {
    expect(screwProblem(joint)).toBeNull();
    expect(screwProblem({ ...joint, size: 'M8' })).toContain('there is no heat-set insert for M8');
    expect(screwProblem({ ...joint, thread: 'tapped' })).toContain('a printed M3 thread strips');
    expect(screwProblem({ ...joint, to: [10, 10, 23] })).toContain('make it at least 4.6 mm thick, or use head none');
    expect(screwProblem({ ...joint, head: 'countersunk', size: 'M2' })).toBe('countersunk screws start at M3');
    const args = { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20] };
    expect(screwOf(args)).toMatchObject({ size: 'M3', head: 'cap', thread: 'insert', more: [], screws: true, name: 'Screw' });
    expect(screwOf({ ...args, size: 'M7' })).toContain('size must be one of M2');
    expect(screwOf({ ...args, more: [[1, 2]] })).toBe('more must be a list of points, each three numbers');
    expect(describeToolCall('partbuddy_mechanism', { kind: 'screw', name: 'Lid screws' })).toEqual([{ key: 'screwJoint', values: { name: 'Lid screws' } }]);
  });

  it('is built by the tool with one call, which says what to buy', async () => {
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Block' }, { name: 'Plate' }] }) }] });
        const commands = args.commands as { command: string }[];
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    };
    const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20], more: [[50, 30, 26]], name: 'Plate screws' });
    expect(built.isError).toBeUndefined();
    const text = String(built.content[0]?.text);
    expect(text).toContain('Built 2 screw joints "Plate screws" that hold Plate on Block: in Plate a clearance hole for M3 (ISO 273, normal) with a counterbore for the head, in Block the seat of a heat-set insert (4 mm wide, 6.7 mm deep).');
    expect(text).toContain('To buy: 2 × M3×8 socket head cap screws (ISO 4762) and 2 M3 heat-set inserts 5.7 mm long; the screws are in the design as standard parts.');
  });
});
