import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { activated, hingeOf, skinProblem, latchOf, lidOf, lipOf, occurrenceOf, pegOf, railTravel, screwOf, slideOf, snapOf, withMechanismTool } from '../src/main/agents/mechanismTool';
import { decide } from '../src/main/agents/policy';
import { describeToolCall } from '../src/shared/stepPhrases';
import { hingeProblem, hingeSteps, pinBridge, webFoot, lidProblem, lidSkirt, lidSteps, lidThread, lipProblem, lipSteps, screwLength, screwProblem, screwSteps, slideProblem, slideRoof, slideSteps, snapProblem, snapSteps, latchReach, latchSteps, LATCH, pegLength, pegSteps, PEG, SNAP, type HingeSpec, type LidSpec, type LipSpec, type ScrewSpec, type SlideSpec } from '../src/shared/mechanisms';

const spec: HingeSpec = { fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], diameter: 6, gap: 0.4, knuckles: 3, name: 'Hinge' };

describe('the print-in-place hinge (ADR 0027, G3)', () => {
  it('builds knuckles in turn, each clearing its room in the other body first, then bore and pin', () => {
    const all = hingeSteps(spec);
    const steps = all.filter((step) => step.command === 'solid.cylinder');
    // Lying, the bore gets a roof: flanks at 45° from the bore (radius 1.9 mm) and a flat 1.05 radii up, cut through the flap along the whole line.
    const roof = all.filter((step) => step.command !== 'solid.cylinder');
    expect(roof.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude', 'sketch.create', 'sketch.line', 'solid.extrude']);
    expect(roof[0]?.params.plane).toEqual({ origin: [42, -0.4, 3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(roof[1]?.params.points).toEqual([[-1.344, 1.344], [1.344, 1.344], [0.692, 1.995], [-0.692, 1.995]]);
    expect(roof[2]?.params).toMatchObject({ distance: '30.8 mm', operation: 'cut', targets: ['Flap'], name: 'Hinge △' });
    // Lying, the pin is flat underneath inside the flap's knuckle, where it has only the gap below it: cut off where it leans 45°
    // (1.061 mm under the axis of a 3 mm pin), from one of the base's knuckles to the other, 10.533 mm.
    expect(roof[3]?.params.plane).toEqual({ origin: [42, 9.733, 3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(roof[4]?.params.points).toEqual([[-1.5, -1.061], [1.5, -1.061], [1.5, -1.7], [-1.5, -1.7]]);
    expect(roof[5]?.params).toMatchObject({ distance: '10.533 mm', operation: 'cut', targets: ['Base'], name: 'Hinge 2 ▬' });
    expect(pinBridge(spec)).toBe(10.533);
    // Upright, a round bore prints as it is, and so does the pin.
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
    // Lying, the barrel must keep two lines over the bore's roof; an upright hinge has no roof.
    expect(hingeProblem({ ...spec, gap: 0.6 })).toContain('the barrel would be 0.795 mm thin over the bore\'s roof');
    expect(hingeProblem({ ...spec, gap: 0.6, from: [42, 0, 3], to: [42, 0, 33] })).toBeNull();
  });

  it('fills in the gap from the nozzle and the knuckles from the length', () => {
    const args = { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [0, 0, 3], to: [0, 60, 3] };
    // 60 mm of line: seven knuckles, so none is longer than 10 mm.
    expect(hingeOf(args, 0.4)).toMatchObject({ diameter: 6, gap: 0.4, knuckles: 7, name: 'Hinge' });
    // 30 mm of line: three knuckles would have the pin bridge 10.5 mm inside the middle one (9.7 mm and a gap on each side), so five.
    expect(hingeOf({ ...args, to: [0, 30, 3] }, 0.4)).toMatchObject({ knuckles: 5 });
    expect(hingeOf({ ...args, to: [0, 28, 3] }, 0.4)).toMatchObject({ knuckles: 3 });
    // Upright, the pin stands and bridges nothing: three knuckles of 9.7 mm.
    expect(hingeOf({ ...args, to: [0, 0, 33] }, 0.4)).toMatchObject({ knuckles: 3 });
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
      text: expect.stringContaining('Built the hinge "Lid hinge" between Base (stays) and Flap (turns): 5 knuckles, barrel 6 mm, pin 3 mm, gap 0.4 mm everywhere. It turns from -145° to 67° before the bodies meet') as string,
    });
    expect(batches.map((batch) => batch.map((step) => step.command).join(' '))).toEqual([
      'component.list joint.list',
      // Where the line lies, measured on trial with a rod that is taken back.
      'solid.cylinder inspect.clearance inspect.measure sketch.inspect',
      [...Array.from({ length: 11 }, () => 'solid.cylinder'), 'sketch.create', 'sketch.line', 'solid.extrude', 'solid.cylinder', ...Array.from({ length: 2 }, () => ['sketch.create', 'sketch.line', 'solid.extrude']).flat()].join(' '),
      'inspect.interference',
      'component.list',
      'component.from_bodies component.list',
      'joint.as_built',
      'joint.sweep joint.sweep',
      'joint.limits',
    ]);
    expect(batches[6]?.[0]?.params).toMatchObject({ type: 'revolute', a: 'Base:1', b: 'Flap:1', at: { occurrence: 'Base:1', point: [42, 15, 3], z: [0, 30, 0] }, name: 'Lid hinge' });
    expect(batches[8]?.[0]?.params).toEqual({ joint: 'Lid hinge', min: -145, max: 67 });

    // Webs: with the line 16 mm above the bed and 2.5 mm from either wall, every knuckle gets a profile from where the barrel leans
    // 45° on the far side (2.121 mm from the axis) at 45° down to its own wall, 0.5 mm into it; on the bed (the line a radius above it) none is needed.
    const sides = { fixed: { toward: [-1, 0, 0] as [number, number, number], distance: 2.5 }, moving: { toward: [1, 0, 0] as [number, number, number], distance: 2.5 } };
    const hung = hingeSteps({ ...spec, from: [42, 0, 16], to: [42, 30, 16], support: { bed: 0, ...sides } });
    const webs = hung.filter((step) => String(step.params.name).endsWith('◣'));
    expect(webs.map((step) => step.command)).toEqual(Array.from({ length: 3 }, () => ['sketch.create', 'solid.extrude']).flat());
    const profiles = hung.filter((step) => step.command === 'sketch.line' && (step.params.points as number[][]).length === 5);
    expect(profiles).toHaveLength(3);
    expect(profiles[0]?.params.points).toEqual([[-2.121, 0], [-2.121, -2.121], [2.5, -6.743], [3, -6.743], [3, 0]]);
    expect(webFoot(6, 2.5)).toBe(6.743);
    // Audit 2026-11-12, N-mechanik-4: a web that ended a gap before the other body left the far half of each barrel hanging
    // (90 mm² of overhang at 6 mm, 619 mm² at 40 mm). It now passes under the whole barrel, and the other body is cut back
    // for it by the same profile a gap further out, up to a gap before the knuckle's own wall and as long as the knuckle's room.
    const rooms = hung.filter((step) => String(step.params.name).endsWith('◤'));
    expect(rooms.filter((step) => step.command === 'solid.extrude').map((step) => [step.params.operation, (step.params.targets as string[])[0], step.params.distance])).toEqual([['cut', 'Flap', '10.533 mm'], ['cut', 'Base', '10.533 mm'], ['cut', 'Flap', '10.533 mm']]);
    expect(hung[hung.findIndex((step) => step.params.name === 'Hinge 1 ◤') + 1]?.params.points).toEqual([[-2.404, 0], [-2.404, -2.404], [2.1, -6.908], [2.1, 0]]);
    expect(hung.findIndex((step) => step.params.name === 'Hinge 1 ◤')).toBeLessThan(hung.findIndex((step) => step.params.name === 'Hinge 1 ◣'));
    // N-mechanik-5: a body whose wall does not reach down to the web's foot is left out of `support`, and gets neither web nor room for one.
    const half = hingeSteps({ ...spec, from: [42, 0, 16], to: [42, 30, 16], support: { bed: 0, fixed: sides.fixed } });
    expect(half.filter((step) => step.command === 'solid.extrude' && /[◣◤]$/.test(String(step.params.name))).map((step) => step.params.name)).toEqual(['Hinge 1 ◤', 'Hinge 1 ◣', 'Hinge 3 ◤', 'Hinge 3 ◣']);
    expect(webs.filter((step) => step.command === 'solid.extrude').map((step) => (step.params.targets as string[])[0])).toEqual(['Base', 'Flap', 'Base']);
    // The fixed body lies towards -x: its profile is drawn from the far end of the knuckle, so it is extruded back along the line.
    expect(webs[0]?.params.plane).toMatchObject({ x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    // The webs come before the bore, which goes through those of the flap.
    expect(hung.findIndex((step) => step.params.name === 'Hinge ○')).toBeGreaterThan(hung.findIndex((step) => step.params.name === 'Hinge 2 ◣'));
    // Near the bed the web ends on it instead of going below.
    expect(hingeSteps({ ...spec, from: [42, 0, 6], to: [42, 30, 6], support: { bed: 0, ...sides } }).find((step) => step.command === 'sketch.line' && (step.params.points as number[][]).length === 5)?.params.points).toEqual([[-2.121, 0], [-2.121, -2.121], [1.757, -6], [3, -6], [3, 0]]);
    expect(hingeSteps({ ...spec, support: { bed: 0, ...sides } }).some((step) => String(step.params.name).endsWith('◣'))).toBe(false);
    // The rooms of the knuckles: 3.4 mm about a line 2.5 mm from a face go 0.9 mm into it. A 1.8 mm wall keeps two lines, a 1.6 mm wall
    // would keep a skin of 0.7 mm and is refused with what to change; a wall the room goes through is a window, and fine.
    expect(skinProblem({ fixed: 0.9, moving: 0.9 }, { fixed: 'Box', moving: 'Lid' }, 1.8, 0.4)).toBeNull();
    expect(skinProblem({ fixed: 0.9, moving: 2.9 }, { fixed: 'Box', moving: 'Lid' }, 1.6, 0.4)).toBe(
      'the rooms of the knuckles would go 0.9 mm into the 1.6 mm wall of Box and leave a skin of 0.7 mm behind them, under two lines (0.9 mm). Make that wall at least 1.8 mm thick, or move the line 0.2 mm further from Box, or 0.7 mm closer to it so the rooms open through the wall. Nothing was built.',
    );
    expect(skinProblem({ fixed: 2.9, moving: 2.9 }, { fixed: 'Box', moving: 'Lid' }, 2.4, 0.4)).toBeNull();
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
        // Before: three steps to undo. Of the cylinders the seven knuckles (48 mm of hinge line) do not touch their body, as SolidCraft 0.40.0-rc.3 warns.
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Box' }, { name: 'Lid' }], undo: 3 }) }] });
        const commands = args.commands as { command: string; params: { operation?: string; diameter?: string } }[];
        calls.push(...commands.filter((step) => step.command === 'edit.undo').map((step) => step.command));
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
      text: 'Not built: 7 piece(s) did not touch their body and stand apart from it. Put the hinge line within 2.5 mm of both bodies (the barrel is 6 mm, so it must overlap each by at least 0.5 mm). ' +
        "PartBuddy cuts each knuckle's room in the other body itself. Everything was taken back.",
    });
    // Every step SolidCraft counted since (11 − 3) is undone in one batch, and no joint was made.
    expect(calls).toEqual(['inspect_design', 'batch', 'batch', 'batch', 'batch', 'batch', ...Array.from({ length: 8 }, () => 'edit.undo')]);
  });

  // Audit 2026-11-12, H-02: the joint was refused after the knuckles were built, the answer said "Not built" with
  // SolidCraft's JSON, and the knuckles stayed (2 → 11 features; the next call built them again).
  it('takes the knuckles back when the joint cannot be made, and passes on SolidCraft\'s reason in one sentence', async () => {
    const refused = { applied: [], completed: 0, failed: { command: 'joint.as_built', error: 'invalid parameters for `joint.create`: a joint needs two different occurrences', index: 0 }, results: [] };
    const tools = (undo: (depth: number) => unknown) => {
      const sent: string[] = [];
      let depth = 2;
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, args) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: undo(depth) }) }] });
          const commands = args.commands as { command: string; params: { operation?: string } }[];
          sent.push(commands.map((step) => step.command).join(' '));
          // As SolidCraft 0.40.1 answers a batch whose step fails: marked as an error, the reason inside its JSON.
          if (commands[0]?.command === 'joint.as_built') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(refused, null, 2) }], isError: true });
          // The probe's batch fails on purpose and SolidCraft rolls it back.
          if (!commands.some((step) => step.command === 'sketch.inspect')) depth += commands.filter((step) => step.params.operation !== undefined).length - commands.filter((step) => step.command === 'edit.undo').length;
          const results = commands.map((step) => (step.command === 'document.inspect' ? { undo: undo(depth) } : step.command === 'component.list' ? { components: [{ id: 3, parent: 0, bodies: ['Base', 'Flap'], occurrences: [{ id: 4, name: 'Both:1' }] }] } : {}));
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      return { sent, depth: () => depth, call: () => withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], knuckles: 3 }) };
    };
    const taken = tools((depth) => depth);
    expect(await taken.call()).toEqual({ isError: true, content: [{ type: 'text', text: 'Not built: SolidCraft refused joint.as_built: invalid parameters for `joint.create`: a joint needs two different occurrences. Everything was taken back.' }] });
    expect(taken.sent.at(-1)).toBe(Array.from({ length: 10 }, () => 'edit.undo').join(' '));
    expect(taken.depth()).toBe(2);
    // A second call starts from the same design: it does not build on top of the first.
    await taken.call();
    expect(taken.depth()).toBe(2);
    // Where SolidCraft's undo depth cannot be read nothing is taken back, and the answer says so instead of "as it was".
    const stuck = tools(() => undefined);
    expect((await stuck.call()).content[0]).toMatchObject({ text: expect.stringMatching(/^Not built: SolidCraft refused joint\.as_built: .* What was begun could not be taken back: undo it before you call again\.$/) as string });
    expect(stuck.sent.join(' ')).not.toContain('edit.undo');
  });

  // Audit 2026-11-12, N-mechanik-3: a second hinge with the default name answered with the first joint's limits and
  // had none itself; the same call again built a third joint between the same two parts.
  it('names a second hinge apart from the first, and refuses a second one between the same two bodies before it builds', async () => {
    const batches: { command: string; params: Record<string, unknown> }[][] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }, { name: 'Flap2' }], undo: 12 }) }] });
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        batches.push(commands);
        const results = commands.map((step) => {
          // As SolidCraft 0.40.1 lists them: a joint's sides by the ids of their occurrences.
          if (step.command === 'joint.list') return { joints: [{ name: 'Hinge', type: 'revolute', a: 15, b: 17, values: [{ value: 0 }] }] };
          if (step.command === 'component.list') return { components: [{ id: 14, parent: 0, bodies: ['Base'], occurrences: [{ id: 15, name: 'Base:1' }] }, { id: 16, parent: 0, bodies: ['Flap'], occurrences: [{ id: 17, name: 'Flap:1' }] }, { id: 31, parent: 0, bodies: ['Flap2'], occurrences: [{ id: 32, name: 'Flap2:1' }] }] };
          return step.command === 'joint.sweep' ? { stopped_at: step.params.to === 180 ? 67.4 : -145.8 } : {};
        });
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const tools = withMechanismTool(upstream, () => 0.4);
    const again = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Flap', moving: 'Base', from: [42, 0, 3], to: [42, 30, 3], name: 'Another' });
    expect(again).toEqual({ isError: true, content: [{ type: 'text', text: 'Not built: the joint "Hinge" already joins Flap and Base as a hinge, and a second hinge between the same two bodies would bind it. Change that one instead: take it back with undo, or delete its features and its joint, then call again' }] });
    expect(batches.map((batch) => batch.map((step) => step.command).join(' '))).toEqual(['component.list joint.list']);
    // Another pair of bodies: built, under a name of its own, which the joint, its sweeps and its limits all carry.
    const second = await tools.callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap2', from: [-2, 0, 3], to: [-2, 30, 3] });
    expect(second.isError).toBeUndefined();
    expect(second.content[0]).toMatchObject({ text: expect.stringContaining('Built the hinge "Hinge (2)" between Base (stays) and Flap2 (turns)') as string });
    const sent = batches.flat();
    expect(sent.find((step) => step.command === 'joint.as_built')?.params).toMatchObject({ a: 'Base:1', b: 'Flap2:1', name: 'Hinge (2)' });
    expect(sent.filter((step) => step.command === 'joint.sweep' || step.command === 'joint.limits').map((step) => step.params.joint)).toEqual(['Hinge (2)', 'Hinge (2)', 'Hinge (2)']);
    // A guide between the two bodies of the hinge is another kind of joint: it is not refused for the hinge.
    const guide = await tools.callTool('partbuddy_mechanism', { kind: 'slide', fixed: 'Base', moving: 'Flap', from: [0, 15, 4], to: [40, 15, 4] });
    expect(guide.content[0]).toMatchObject({ text: expect.not.stringContaining('already joins') as string });
  });

  // Audit 2026-11-12, N-mechanik-4 and -5: "stand on webs …, so they print without support" stood over 90 to 619 mm² of
  // overhang the print check still found, and over a web that hung 4.6 mm under a lid plate with no wall below it.
  it('gives a web only to a body whose wall reaches the web\'s foot, and says what prints without support only where it holds', async () => {
    // Two blocks 16 mm high, 5 mm apart, the line on their rims: the rod on the line is 2.45 mm from either wall.
    const answer = async (walls: string[], args: Record<string, unknown> = {}) => {
      const sent: { command: string; params: Record<string, unknown> }[] = [];
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, call) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Flap' }], undo: 2 }) }] });
          const commands = call.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(...commands);
          const rods = commands.filter((step) => step.command === 'solid.cylinder' && String(step.params.body_name).startsWith('PartBuddy probe '));
          const results = commands.map((step) => {
            if (step.command === 'inspect.measure') return { bodies: [{ bbox: { min: [0, 0, 0] } }, { bbox: { min: [45, 0, 0] } }] };
            if (step.command === 'component.list') return { components: [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ id: 6, name: 'Flap:1' }] }] };
            if (step.command !== 'inspect.clearance') return {};
            // The second trial: each rod lies in its body where that body has a wall under the web's foot (a rod 0.2 mm thick and 30 mm long is 0.942 mm³).
            if (rods.length > 0) return { overlaps: rods.flatMap((rod) => (walls.some((body) => String(rod.params.body_name).endsWith(body === 'Base' ? 'fixed' : 'moving')) ? [{ a: rod.params.body_name, b: String(rod.params.body_name).endsWith('fixed') ? 'Base' : 'Flap', volume_mm3: 0.94 }] : [])), near: [] };
            return { near: [{ a: 'PartBuddy probe', b: 'Base', distance_mm: 2.45, from: [42.5, 15, 16], to: [40, 15, 16] }, { a: 'PartBuddy probe', b: 'Flap', distance_mm: 2.45, from: [42.5, 15, 16], to: [45, 15, 16] }] };
          });
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42.5, 0, 16], to: [42.5, 30, 16], ...args });
      return { text: String(built.content[0]?.text), sent, webs: sent.filter((step) => step.command === 'solid.extrude' && String(step.params.name).endsWith('◣')).map((step) => (step.params.targets as string[])[0]) };
    };
    const both = await answer(['Base', 'Flap']);
    expect(both.webs).toEqual(['Base', 'Flap', 'Base', 'Flap', 'Base']);
    expect(both.text).toContain(' All 5 knuckles start above the bed and stand on webs at 45° that run from under the barrel down to their own wall, and the pin is flat underneath where it bridges from knuckle to knuckle, so the hinge prints as it stands, without support. ');
    // Each rod lies 0.25 mm inside its wall and 0.2 mm under the web's foot, 6.743 mm below the line: at z = 9.057.
    const rods = both.sent.filter((step) => String(step.params.body_name).startsWith('PartBuddy probe '));
    expect(rods.map((step) => (step.params.base as number[]).map((value) => Math.round(value * 1000) / 1000))).toEqual([[39.75, 0, 9.057], [45.25, 0, 9.057]]);
    // The flap's wall ends above that: no web is drawn into the air under it, and the answer names what is left.
    const one = await answer(['Base']);
    expect(one.webs).toEqual(['Base', 'Base', 'Base']);
    expect(one.text).not.toContain('without support');
    expect(one.text).toContain(' The knuckles start above the bed, and the 2 of Flap got no web: a web meets its wall 6.743 mm below the line at the most, and there is no wall there. They need support, or a wall that reaches down that far before the hinge is built. The 3 knuckles of Base stand on webs at 45° that run from under the barrel down to their own wall. ');
    const none = await answer([]);
    expect(none.webs).toEqual([]);
    expect(none.text).toContain('the 3 of Base and the 2 of Flap got no web');
    // Three knuckles asked for on 30 mm: the pin bridges 10.5 mm inside the middle one, and the answer does not call that clean.
    const wide = await answer(['Base', 'Flap'], { knuckles: 3 });
    expect(wide.text).not.toContain('without support');
    expect(wide.text).toContain('where it bridges from knuckle to knuckle. The pin bridges 10.5 mm inside each knuckle of Flap, more than prints clean (10 mm): use more knuckles.');
  });

  it('builds onto a body that is a component with that component active, so the knuckles move with it', () => {
    // The flap is a component already (a second mechanism, or the assistant made components first); the base is not.
    const listing = { active: 0, components: [{ id: 0, parent: null, bodies: ['Base'] }, { id: 5, parent: 0, bodies: ['Flap'], occurrences: [{ name: 'Flap:1' }] }] };
    const steps = activated(hingeSteps(spec), listing);
    const target = (step: { command: string; params: Record<string, unknown> }) => (step.command === 'component.activate' ? `activate ${String(step.params.component)}` : ((step.params.targets as string[] | undefined)?.[0] ?? step.command));
    // The roof's sketch is drawn with the flap active, as the bore before it and the cut after it.
    expect(steps.map(target)).toEqual(['activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'activate 0', 'Base', 'activate 5', 'Flap', 'sketch.create', 'sketch.line', 'Flap', 'activate 0', 'Base', 'sketch.create', 'sketch.line', 'Base']);
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

/** The tool's description, as the model reads it. */
const withMechanismDescription = async (): Promise<string> => {
  const tools = await withMechanismTool({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [] }) }, () => 0.4).listTools();
  return String(tools[0]?.description);
};

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

  // Audit 2026-11-12, T5: that roof is a level ceiling 13.9 mm wide (102 mm at the largest rail), a gap over the rail's
  // head, and the tool called the guide "printed in one piece without support".
  it('puts a roof at 45° with a 5 mm ridge over the groove where the moving body is high enough, and says how the parts print', async () => {
    expect(slideRoof(guide)).toEqual({ ceiling: 13.931, ridge: 5, top: 7.866 });
    expect(slideRoof({ width: 60, height: 20, gap: 0.4 })).toMatchObject({ ceiling: 101.931, top: 68.866 });
    // From both edges of the old ceiling (±6.966 at 3.4) up at 45° to the ridge: 4.466 mm in, 4.466 mm up.
    const roofed = slideSteps({ ...guide, roof: true });
    expect(roofed[1]?.params.points).toEqual([[-3.566, -0.4], [3.566, -0.4], [3.566, 0], [6.966, 3.4], [2.5, 7.866], [-2.5, 7.866], [-6.966, 3.4], [-3.566, 0]]);
    // The rail is the same.
    expect(roofed.slice(3)).toEqual(slideSteps(guide).slice(3));
    // The tool measures the moving body first: its top lies `top` over the base's face at z = 4.
    const answer = async (top: number, args: Record<string, unknown> = {}) => {
      const sent: { command: string; params: Record<string, unknown> }[] = [];
      const upstream: UpstreamTools = {
        instructions: () => undefined,
        listTools: () => Promise.resolve([]),
        callTool: (name, call) => {
          if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Base' }, { name: 'Carriage' }], undo: 2 }) }] });
          const commands = call.commands as { command: string; params: Record<string, unknown> }[];
          sent.push(...commands);
          const results = commands.map((step) => (step.command === 'inspect.measure' ? { bodies: [{ name: 'Carriage', bbox: { min: [20, 0, 4.4], max: [40, 30, 4 + top] } }] } : step.command === 'component.list' ? { components: [{ id: 3, parent: 0, bodies: ['Base'], occurrences: [{ id: 4, name: 'Base:1' }] }, { id: 5, parent: 0, bodies: ['Carriage'], occurrences: [{ id: 6, name: 'Carriage:1' }] }] } : {}));
          return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
        },
      };
      const built = await withMechanismTool(upstream, () => 0.4).callTool('partbuddy_mechanism', { kind: 'slide', fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4], ...args });
      return { text: String(built.content[0]?.text), groove: sent.find((step) => step.command === 'sketch.line')?.params.points as number[][], sent: sent.map((step) => step.command) };
    };
    // 7.866 mm of roof and two lines over its ridge: 8.8 mm.
    const high = await answer(8.8);
    expect(high.groove).toHaveLength(8);
    expect(high.text).toContain("The two print apart, each with up pointing up, and Carriage is then pushed onto the rail from an end. Neither needs support: the rail's flanks and the roof over the groove lean 45°, and the roof's ridge is a bridge of 5 mm.");
    // The body is measured before the first step is built.
    expect(high.sent.indexOf('inspect.measure')).toBeLessThan(high.sent.indexOf('sketch.create'));
    // Lower than that the ceiling stays flat, and the answer says what that means instead of "without support".
    const low = await answer(8.7);
    expect(low.groove).toHaveLength(6);
    expect(low.text).not.toContain('Neither needs support');
    expect(low.text).toContain("The groove's ceiling is flat and 13.9 mm wide, more than prints as a bridge (10 mm): a roof at 45° over it needs Carriage to stand 8.8 mm high over the face the rail is on, and it stands 8.7 mm. Print Carriage turned over instead, lying on its top with the groove open upwards (set that face as its print face), or make it higher and build this again.");
    // The dovetail to plug together is the same groove: the same roof, the same words.
    const plug = await answer(12, { kind: 'plug', shape: 'dovetail' });
    expect(plug.groove).toHaveLength(8);
    expect(plug.text).toContain('nothing stops it. The two print apart, each with up pointing up');
    expect(await withMechanismDescription()).not.toContain('printed in one piece without support');
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
      ['solid.cylinder', 'Closure ◠'],
      ['solid.box', 'Closure ●'],
      ['solid.chamfer', 'Closure ◆'],
      ['solid.cylinder', 'Closure ○'],
    ]);
    // The notch is cut before the bead is built: its cylinder (16 mm wide, from the wall's plane outwards, 2.5 mm into the lid
    // above the rim) also covers the bead's height below the rim, and would take the 0.25 mm of bead past that plane with it.
    expect(steps[9]?.params).toMatchObject({ diameter: '16 mm', base: ['(2 mm + 58 mm) / 2', '2 mm - 2 mm', '20 mm - 5.5 mm'], axis: 'Y', operation: 'cut', targets: ['Lid'] });
    const [notch, bead] = [steps.findIndex((step) => step.params.name === 'Closure ◠'), steps.findIndex((step) => step.params.name === 'Closure ●')];
    expect(notch).toBeLessThan(bead);
    // The foot lies above the rim in the lid, 0.2 mm into its wall; the lip hangs 4 mm below the rim, 0.25 mm clear, 1.2 mm thick.
    expect(steps[0]?.params.offset).toBe('20 mm');
    expect(steps[1]?.params).toEqual({ p0: ['2 mm - 0.2 mm', '2 mm - 0.2 mm'], p1: ['58 mm + 0.2 mm', '38 mm + 0.2 mm'] });
    expect(steps[4]?.params.offset).toBe('20 mm - 4 mm');
    expect(steps[5]?.params).toEqual({ p0: ['2 mm + 0.25 mm', '2 mm + 0.25 mm'], p1: ['58 mm - 0.25 mm', '38 mm - 0.25 mm'] });
    expect(steps[6]?.params).toEqual({ p0: ['2 mm + 1.45 mm', '2 mm + 1.45 mm'], p1: ['58 mm - 1.45 mm', '38 mm - 1.45 mm'] });
    // Only the rille is cut from the box; everything else belongs to the lid.
    expect(steps.filter((step) => JSON.stringify(step.params.targets ?? step.params.body ?? '').includes('Box')).map((step) => step.params.name)).toEqual(['Closure ○']);
    // The bead stands 0.25 mm past the wall's face (0.5 mm proud of the lip), 14 mm long in the wall's middle; its rille sits where it lands.
    expect(steps[10]?.params).toMatchObject({ length: '14 mm', width: '0.5 mm', height: '1 mm', corner: ['(2 mm + 58 mm) / 2 - 7 mm', '2 mm - 0.25 mm', '20 mm - 3 mm'] });
    expect(steps[12]?.params).toMatchObject({ diameter: '1.4 mm', axis: 'X', base: ['(2 mm + 58 mm) / 2 - 7.5 mm', '2 mm + 0.25 mm', '20 mm - 2.5 mm'] });
    // A flat plate as the lid gets the lip alone on its face: no foot that would come out of its top, no notch in a wall it does not have.
    expect(lipSteps({ ...lid, flat: true }).map((step) => step.params.name ?? '').filter(Boolean)).toEqual(['Closure', 'Closure', 'Closure ●', 'Closure ◆', 'Closure ○']);
    expect(lipOf({ fixed: 'Box', moving: 'Lid', from: [2, 2, 20], to: [58, 38, 20], side: 'y-', flat: true })).toMatchObject({ flat: true });
    // Rounded rooms get rounded rings, each radius less its inset.
    expect(lipSteps({ ...lid, radius: 4 })[5]?.params).toMatchObject({ radius: '4 mm - 0.25 mm' });
  });

  it('puts the rille where the bead lands when the lid is built open and closes on a hinge, and follows a template\'s parameters', () => {
    const open = lipSteps({ ...lid, up: 1, side: 'y+', rim: { at: 16, expr: 'height' }, hinge: { along: 'x', across: 0.5, z: { at: 16, expr: 'height' } } });
    expect(open[12]?.params.base).toEqual(['(2 mm + 58 mm) / 2 - 7.5 mm', '2 * 0.5 mm - (38 mm - 0.25 mm)', '2 * (height) - ((height) + 2.5 mm)']);
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

describe('the screw lid (standards)', () => {
  // A jar 60 mm wide whose rim is at 50 mm, centred at (10, 20).
  const lid: LidSpec = { fixed: 'Jar', moving: 'Lid', centre: [10, 20, 50], diameter: 60, starts: 1, gap: 0.3, name: 'Thread' };

  it('sizes the thread by the neck: pitch and depth from the diameter, 1.75 turns, three quarters of a turn per start at least', () => {
    expect(lidThread({ diameter: 20, starts: 1 })).toMatchObject({ pitch: 3, depth: 1.1, lead: 3, turns: 1.75, length: 5.25 });
    // Flat crest and root with flanks at 45°: the crest is half a pitch less the depth, the foot half a pitch more.
    expect(lidThread({ diameter: 60, starts: 1 })).toEqual({ pitch: 4, depth: 1.2, lead: 4, turns: 1.75, length: 7, crest: 0.8, foot: 3.2 });
    expect(lidThread({ diameter: 100, starts: 2 })).toMatchObject({ pitch: 5, depth: 1.5, lead: 10, turns: 0.875 });
    expect(lidThread({ diameter: 40, starts: 3 })).toMatchObject({ lead: 12, turns: 0.75, length: 9 });
    // Plain neck, thread, half a pitch for the lid's thread and its mouth: what the lid covers of the neck.
    expect(lidSkirt({ diameter: 60, starts: 1 })).toBe(14.2);
  });

  it('coils the thread onto the neck, makes the lid with the same thread half a pitch lower and the gap further out, and lays the lid on its top', () => {
    const steps = lidSteps(lid);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['sketch.create', 'Thread 1'],
      ['sketch.line', ''],
      ['solid.coil', 'Thread 1'],
      ['solid.cylinder', 'Lid'],
      ['solid.cone', 'Thread ◢'],
      ['solid.cylinder', 'Thread ○'],
      ['sketch.create', 'Thread · 1'],
      ['sketch.line', ''],
      ['solid.coil', 'Thread · 1'],
      ['solid.cylinder', 'Thread ◆'],
      ['solid.pattern.circular', ''],
      ['body.print_face', ''],
    ]);
    // The neck's thread: from 30 mm of radius to 31.2 mm, its middle 9.6 mm below the rim at the start, 7 mm of coil.
    expect(steps[0]?.params.plane).toEqual({ origin: [10, 20, 40.4], x_dir: [1, 0, 0], y_dir: [0, 0, 1] });
    expect(steps[1]?.params.points).toEqual([[29.8, -1.8], [31.2, -0.4], [31.2, 0.4], [29.8, 1.8]]);
    expect(steps[2]?.params).toMatchObject({ pitch: '4 mm', height: '7 mm', base: [10, 20, 40.4], operation: 'join', targets: ['Jar'] });
    // The lid: its bore 0.3 mm clear of the neck's crests, its thread 2 mm lower and reaching to 0.3 mm from the neck.
    expect(steps[3]?.params).toMatchObject({ diameter: '67.8 mm', base: [10, 20, 35.8], operation: 'new', body_name: 'Lid' });
    expect(steps[5]?.params).toMatchObject({ diameter: '63 mm', height: '14.2 mm', operation: 'cut', targets: ['Lid'] });
    expect(steps[6]?.params.plane).toMatchObject({ origin: [10, 20, 38.4] });
    expect(steps[7]?.params.points).toEqual([[31.7, -1.8], [30.3, -0.4], [30.3, 0.4], [31.7, 1.8]]);
    expect(steps[10]?.params).toMatchObject({ features: ['Thread ◆'], count: 30 });
    expect(steps[11]?.params).toEqual({ body: 'Lid', point: [10, 20, 52.4] });
    // Two starts: each thread twice, the second half a turn on.
    const two = lidSteps({ ...lid, starts: 2 });
    expect(two.filter((step) => step.command === 'solid.coil').map((step) => step.params.name)).toEqual(['Thread 1', 'Thread 2', 'Thread · 1', 'Thread · 2']);
    expect(two[3]?.params.plane).toMatchObject({ x_dir: [-1, 0, 0] });
    // A narrow neck: the section stops short of the next turn.
    expect(lidSteps({ ...lid, diameter: 20 })[1]?.params.points).toEqual([[9.8, -1.45], [11.1, -0.2], [11.1, 0.2], [9.8, 1.45]]);
  });

  it('says what is wrong before anything is built, and takes its defaults from the nozzle', () => {
    expect(lidProblem(lid)).toBeNull();
    expect(lidProblem({ ...lid, moving: 'Jar' })).toContain('moving is the name of the lid to make');
    expect(lidProblem({ ...lid, diameter: 10 })).toContain('diameter must be 16–200 mm');
    expect(lidProblem({ ...lid, starts: 4 })).toBe('starts must be 1, 2 or 3');
    const args = { kind: 'lid', fixed: 'Jar', moving: 'Lid', from: [10, 20, 50], diameter: 60 };
    expect(lidOf(args, 0.4)).toMatchObject({ centre: [10, 20, 50], starts: 1, gap: 0.3, name: 'Thread' });
    expect(lidOf(args, 0.6)).toMatchObject({ gap: 0.45 });
    expect(lidOf({ ...args, diameter: undefined }, 0.4)).toContain('are needed');
    expect(describeToolCall('partbuddy_mechanism', { kind: 'lid', moving: 'Jar lid' })).toEqual([{ key: 'screwLid', values: { name: 'Jar lid' } }]);
  });

  it('is built by the tool with one call that makes the lid, and refuses a name that is taken', async () => {
    const upstream = (bodies: string[]): UpstreamTools => ({
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: bodies.map((body) => ({ name: body })) }) }] });
        const commands = args.commands as { command: string }[];
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : {})) }) }] });
      },
    });
    const args = { kind: 'lid', fixed: 'Jar', moving: 'Lid', from: [10, 20, 50], diameter: 60 };
    const built = await withMechanismTool(upstream(['Jar']), () => 0.4).callTool('partbuddy_mechanism', args);
    expect(built.isError).toBeUndefined();
    const text = String(built.content[0]?.text);
    expect(text).toContain('Built the screw lid "Lid" for Jar: a thread with 45° flanks on the neck, pitch 4 mm, 1.2 mm deep, 1 start, and the same inside the lid, 0.3 mm clear; it closes in 1.75 turns and stops with its inner top on the rim.');
    expect(text).toContain('The lid is 67.8 mm wide and covers the top 14.2 mm of the neck');
    const taken = await withMechanismTool(upstream(['Jar', 'Lid']), () => 0.4).callTool('partbuddy_mechanism', args);
    expect(taken).toMatchObject({ isError: true, content: [{ text: 'Not built: a body "Lid" exists already; give the lid another name, or delete that body first' }] });
  });
});

describe('snap hooks with their windows (standards)', () => {
  // A base with a cover over it: the cover's wall stands from y = 20 to y = 22, the hooks stand on the base's top at z = 4.
  const args = { kind: 'snap', fixed: 'Base', moving: 'Cover', from: [20, 20, 4], to: [20, 22, 4], more: [[32, 20, 4]] };

  it('cuts each window through the wall first and stands each hook a gap off it, the catch over the window\'s edge', () => {
    const spec = snapOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(spec).toMatchObject({ up: [0, 0, 1], toward: [0, 2, 0], wall: 2, name: 'Snap hook' });
    const steps = snapSteps(spec);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.line', 'solid.extrude', 'sketch.create', 'sketch.line', 'solid.extrude', 'plastic.snap_fit', 'plastic.snap_fit']);
    // The window's lower edge lies 0.2 mm under the catch (12 − 1.5 above the face); x × y points into the wall.
    expect(steps[0]?.params.plane).toEqual({ origin: [20, 20, 14.3], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(steps[1]?.params).toEqual({ points: [[-2.8, 0], [2.8, 0], [2.8, 2.2], [-2.8, 2.2]], closed: true });
    expect(steps[2]?.params).toMatchObject({ distance: '2 mm', operation: 'cut', targets: ['Cover'], name: 'Snap hook 1 □' });
    expect(steps[3]?.params.plane).toMatchObject({ origin: [32, 20, 14.3] });
    expect(steps[6]?.params).toEqual({ position: [20, 19.8, 4], direction: [0, 0, 1], hook: [0, 1, 0], length: '12 mm', thickness: '1.5 mm', width: '5 mm', catch_depth: '0.8 mm', catch_length: '1.5 mm', body: 'Base' });
    expect(steps[7]?.params).toMatchObject({ position: [32, 19.8, 4] });
    expect(SNAP).toEqual({ length: 12, thickness: 1.5, width: 5, catch: 0.8, catchLength: 1.5, gap: 0.2, side: 0.3, seat: 0.2, air: 0.5 });
  });

  it('refuses what cannot catch, and builds the hook with its own body\'s component active', () => {
    expect(snapOf({ ...args, to: [20, 20, 9] })).toContain('to must lie beside from');
    expect(snapOf({ ...args, wall: 1 })).toBe('wall must be 1.6–10 mm');
    expect(snapOf({ ...args, moving: 'Base' })).toBe('fixed and moving must be two bodies');
    const spec = snapOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(snapProblem(spec)).toBeNull();
    // A to that also runs up the hook only names the wall's side.
    expect(snapSteps({ ...spec, toward: [0, 1, 5] })[6]?.params).toMatchObject({ hook: [0, 1, 0] });
    const listing = { components: [{ id: 0, parent: null, bodies: [] }, { id: 3, parent: 0, bodies: ['Base'], occurrences: [{ name: 'Base:1' }] }, { id: 4, parent: 0, bodies: ['Cover'], occurrences: [{ name: 'Cover:1' }] }] };
    expect(activated(snapSteps({ ...spec, more: [] }), listing).map((step) => (step.command === 'component.activate' ? `activate ${String(step.params.component)}` : step.command))).toEqual(['activate 4', 'sketch.create', 'sketch.line', 'solid.extrude', 'activate 3', 'plastic.snap_fit', 'activate 0']);
    expect(decide('partbuddy_mechanism', { kind: 'snap' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_mechanism', { kind: 'snap', name: 'Cover clips' })).toEqual([{ key: 'snapHooks', values: { name: 'Cover clips' } }]);
  });
});

describe('a plugged connection (standards)', () => {
  // Two halves of a block meet at x = 30; the pegs grow out of the left half into the right one.
  const args = { kind: 'plug', fixed: 'Left', moving: 'Right', from: [30, 10, 10], to: [35, 10, 10], more: [[30, 20, 10]] };
  const upstream = (calls: string[][]): UpstreamTools => ({
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, input) => {
      if (name === 'inspect_design') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ bodies: [{ name: 'Left' }, { name: 'Right' }] }) }] });
      const commands = input.commands as { command: string }[];
      calls.push(commands.map((step) => step.command));
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'inspect.interference' ? { count: 0 } : step.command === 'component.list' ? { components: [] } : step.command === 'inspect.measure' ? { bodies: [{ bbox: { min: [0, 0, 4.2], max: [40, 30, 16] } }] } : {})) }) }] });
    },
  });

  it('cuts each pocket with its chamfered mouth, then grows the peg out of its body with a chamfered tip', () => {
    const spec = pegOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(spec).toMatchObject({ diameter: 5, gap: 0.2, name: 'Peg' });
    const steps = pegSteps(spec);
    expect(steps.map((step) => [step.command, step.params.operation, (step.params.targets as string[])[0], step.params.name])).toEqual([
      ['solid.cylinder', 'cut', 'Right', 'Peg 1 ○'],
      ['solid.cone', 'cut', 'Right', 'Peg 1 ◣'],
      ['solid.cylinder', 'join', 'Left', 'Peg 1'],
      ['solid.cone', 'join', 'Left', 'Peg 1 ◢'],
      ['solid.cylinder', 'cut', 'Right', 'Peg 2 ○'],
      ['solid.cone', 'cut', 'Right', 'Peg 2 ◣'],
      ['solid.cylinder', 'join', 'Left', 'Peg 2'],
      ['solid.cone', 'join', 'Left', 'Peg 2 ◢'],
    ]);
    // The pocket: 0.2 mm of room per side and 1 mm deeper than the peg is long (7.5 mm); its mouth opens by 0.5 mm.
    expect(steps[0]?.params).toMatchObject({ diameter: '5.4 mm', height: '8.5 mm', base: [30, 10, 10], axis: [1, 0, 0] });
    expect(steps[1]?.params).toMatchObject({ diameter: '6.4 mm', top_diameter: '5.4 mm', height: '0.5 mm', base: [30, 10, 10] });
    // The peg is rooted 0.5 mm in its body and ends in a tip chamfered by 0.5 mm.
    expect(steps[2]?.params).toMatchObject({ diameter: '5 mm', height: '7.5 mm', base: [29.5, 10, 10] });
    expect(steps[3]?.params).toMatchObject({ diameter: '5 mm', top_diameter: '4 mm', height: '0.5 mm', base: [37, 10, 10] });
    expect(steps[6]?.params).toMatchObject({ base: [29.5, 20, 10] });
    expect(pegLength(8)).toBe(12);
    expect(PEG).toEqual({ ratio: 1.5, deeper: 1, chamfer: 0.5, root: 0.5, least: 5 });
  });

  it('refuses what cannot be plugged and warns of a single or a thin peg', async () => {
    expect(pegOf({ ...args, diameter: 2 })).toBe('diameter must be 3–20 mm');
    expect(pegOf({ ...args, gap: 0.8 })).toBe('gap must be 0.05–0.5 mm');
    expect(pegOf({ ...args, moving: 'Left' })).toBe('fixed and moving must be two bodies');
    const tools = withMechanismTool(upstream([]), () => 0.4);
    const two = String((await tools.callTool('partbuddy_mechanism', args)).content[0]?.text);
    expect(two).toContain('Built 2 pegs "Peg" on Left with their pockets in Right: 5 mm thick and 7.5 mm long, 0.2 mm clear per side, the pocket 1 mm deeper for air and glue, tip and mouth chamfered. It makes no joint.');
    expect(two).not.toContain('lets the parts turn');
    const one = String((await tools.callTool('partbuddy_mechanism', { ...args, more: undefined, diameter: 4, gap: 0.1 })).content[0]?.text);
    expect(one).toContain('One round peg lets the parts turn about it');
    expect(one).toContain('A peg under 5 mm printed standing is weak.');
    expect(await tools.callTool('partbuddy_mechanism', { ...args, shape: 'star' })).toMatchObject({ isError: true, content: [{ text: 'Not built: shape must be peg or dovetail' }] });
    expect(describeToolCall('partbuddy_mechanism', { kind: 'plug' })).toEqual([{ key: 'plug', values: { name: 'Peg' } }]);
    expect(describeToolCall('partbuddy_mechanism', { kind: 'plug', shape: 'dovetail' })).toEqual([{ key: 'plug', values: { name: 'Dovetail' } }]);
  });

  it('builds a dovetail as the guide\'s rail and groove with a close fit, and makes no joint', async () => {
    const calls: string[][] = [];
    const built = await withMechanismTool(upstream(calls), () => 0.4).callTool('partbuddy_mechanism', { kind: 'plug', shape: 'dovetail', fixed: 'Left', moving: 'Right', from: [0, 15, 4], to: [40, 15, 4] });
    expect(String(built.content[0]?.text)).toContain('Built the dovetail "Dovetail" between Left (carries the rail) and Right (has the groove): 6 mm wide at its foot and 3 mm high with 45° flanks, 0.2 mm clear all round. It makes no joint');
    expect(calls.flat()).not.toContain('joint.as_built');
    expect(calls.flat().filter((command) => command === 'solid.extrude')).toHaveLength(2);
  });
});

describe('a snap latch outside a box (standards)', () => {
  // A box 20 mm high with its lid on it; their front walls lie in the plane y = 0, which faces −Y.
  const args = { kind: 'latch', fixed: 'Box', moving: 'Lid', from: [20, 0, 20], to: [20, -5, 20] };

  it('grows the bead out of the box and the arm with its hook out of the lid, 45° faces a seat apart', () => {
    const spec = latchOf(args);
    if (typeof spec === 'string') throw new Error(spec);
    expect(spec).toMatchObject({ up: [0, 0, 1], out: [0, -5, 0], width: 10, name: 'Latch' });
    const steps = latchSteps(spec);
    expect(steps.map((step) => [step.command, step.params.name ?? '', (step.params.targets as string[] | undefined)?.[0] ?? ''])).toEqual([
      ['sketch.create', 'Latch ◁', ''],
      ['sketch.line', '', ''],
      ['solid.extrude', 'Latch ◁', 'Box'],
      ['sketch.create', 'Latch', ''],
      ['sketch.line', '', ''],
      ['solid.extrude', 'Latch', 'Lid'],
    ]);
    // Sketch x runs out of the wall and y up; the profiles run along the wall from one edge of the latch to the other.
    expect(steps[0]?.params.plane).toEqual({ origin: [26, 0, 20], x_dir: [0, -1, 0], y_dir: [0, 0, 1] });
    expect(steps[2]?.params).toMatchObject({ distance: '12 mm', operation: 'join' });
    // The bead: a ridge 1.2 mm high with 45° faces, its crest 10.2 mm under the joint, rooted 0.5 mm in the wall.
    expect(steps[1]?.params.points).toEqual([[-0.5, -9], [0, -9], [1.2, -10.2], [0, -11.4], [-0.5, -11.4]]);
    expect(steps[3]?.params.plane).toMatchObject({ origin: [25, 0, 20] });
    expect(steps[5]?.params).toMatchObject({ distance: '10 mm', operation: 'join' });
    // The arm: a 45° slope out of the lid's wall, 1.6 mm thick and 1.5 mm off the wall, the hook's crest 0.4 mm off it
    // and 0.8 mm under the bead's, so its upper face lies on the bead's lower one without play, then 2 mm of tab.
    expect(steps[4]?.params.points).toEqual([[-0.5, 8.1], [0, 8.1], [3.1, 5], [3.1, -14.1], [1.5, -14.1], [1.5, -12.1], [0.4, -11], [1.5, -9.9], [1.5, 1], [-0.5, 1]]);
    expect(latchReach()).toEqual({ above: 8.1, below: 14.1 });
    // The strain at the root as the hook passes the bead: 1.5 · thickness · overlap / lever².
    expect((150 * LATCH.thick * (LATCH.bead - LATCH.clear)) / LATCH.lever ** 2).toBeCloseTo(1.33, 2);
  });

  it('refuses what is no wall, and is allowed and named in the work log', () => {
    expect(latchOf({ ...args, to: [20, 0, 25] })).toContain('to must lie straight out of the wall');
    expect(latchOf({ ...args, width: 3 })).toBe('width must be 5–40 mm');
    expect(latchOf({ ...args, moving: 'Box' })).toBe('fixed and moving must be two bodies');
    // On a side wall, and with a point that also lies higher: only the way out of the wall counts.
    const side = latchOf({ ...args, from: [40, 15, 20], to: [45, 15, 23] });
    if (typeof side === 'string') throw new Error(side);
    expect(latchSteps(side)[0]?.params.plane).toEqual({ origin: [40, 21, 20], x_dir: [1, 0, 0], y_dir: [0, 0, 1] });
    expect(decide('partbuddy_mechanism', { kind: 'latch' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_mechanism', { kind: 'latch', name: 'Front latch' })).toEqual([{ key: 'latch', values: { name: 'Front latch' } }]);
  });
});
