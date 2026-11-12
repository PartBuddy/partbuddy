import { describe, expect, it } from 'vitest';

import { blockOf, knobOf, magnetOf, misplaced, shortOf, wallOf, withBlockTool } from '../src/main/agents/blockTool';
import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { KNOB, knobProblem, knobSteps, type KnobSpec } from '../src/shared/knob';
import { MAGNET, magnetPocket, magnetSteps, magnetStock } from '../src/shared/magnet';
import { describeToolCall } from '../src/shared/stepPhrases';
import { KEYHOLE, WALL, keyholeDepth, keyholeProblem, keyholeSteps, keyholeStock, woodScrewSteps, type KeyholeSpec } from '../src/shared/wallMount';

describe('the function blocks for the assistant (standards)', () => {
  it('fills a block in from the standard tables and lays over it only what the model gave', () => {
    // A socket head M3 by default: the form's own standard.
    expect(blockOf({ block: 'screwHole', body: 'Plate', point: [10, 10, 6] })).toEqual({ block: 'screwHole', body: 'Plate', point: [10, 10, 6], size: 'M3', head: 'cap', fit: 'normal' });
    expect(blockOf({ block: 'screwHole', body: 'Plate', point: [10, 10, 6], size: 'M4', head: 'countersunk', more: [[30, 10, 6]] })).toMatchObject({ size: 'M4', head: 'countersunk', more: [[30, 10, 6]] });
    // The seat of an M4 insert: 5.6 mm wide and a millimetre deeper than the insert.
    expect(blockOf({ block: 'insertSeat', body: 'Base', point: [0, 0, 20], size: 'M4' })).toMatchObject({ diameter: 5.6, depth: 9.1 });
    expect(blockOf({ block: 'nutTrap', body: 'Base', point: [0, 0, 20], normal: [0, 0, 1], size: 'M5' })).toMatchObject({ flats: 8.3, depth: 5.1 });
    expect(blockOf({ block: 'text', body: 'Base', point: [0, 0, 20], normal: [0, 0, 1], text: 'Bits', height: 8 })).toMatchObject({ text: 'Bits', height: 8, depth: 0.6, mode: 'deboss' });
  });

  it('says what is wrong in words the model can act on', () => {
    expect(blockOf({ block: 'gear', body: 'Plate', point: [0, 0, 0] })).toContain('block must be one of screwHole');
    expect(blockOf({ block: 'screwHole', body: 'Plate' })).toBe('body and point (three numbers on a flat face) are needed');
    expect(blockOf({ block: 'slot', body: 'Plate', point: [0, 0, 0] })).toBe('slot needs normal: the way out of the face, three numbers');
    expect(blockOf({ block: 'insertSeat', body: 'Plate', point: [0, 0, 0], size: 'M8' })).toBe('insertSeat has no size M8; it has M2, M2.5, M3, M4, M5, M6');
    expect(blockOf({ block: 'screwHole', body: 'Plate', point: [0, 0, 0], size: 'M2', head: 'countersunk' })).toContain('screwHole with head countersunk has no size M2');
    expect(blockOf({ block: 'text', body: 'Plate', point: [0, 0, 0], normal: [0, 0, 1], text: '' })).toContain('text');
  });

  it('builds the block through one batch, with the body\'s component active for a sketched one, and is allowed and logged', async () => {
    const batches: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string }[];
        // Round every block: the plate measured and the undo depth read, then the block with a measurement after it.
        const block = commands.filter((step) => !['inspect.measure', 'document.inspect'].includes(step.command));
        if (block.length > 0) batches.push(block.map((step) => step.command).join(' '));
        const measured = { bodies: [{ name: 'Plate', volume_mm3: commands.length > 2 ? 900 : 1000 }] };
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'component.list' ? { components: [{ id: 0, parent: null, bodies: [] }, { id: 7, parent: 0, bodies: ['Plate'], occurrences: [{ name: 'Plate:1' }] }] } : step.command === 'inspect.measure' ? measured : {})) }) }] });
      },
    };
    const tools = withBlockTool(upstream);
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['partbuddy_block']);
    const hole = await tools.callTool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: [10, 10, 6], more: [[30, 10, 6]] });
    expect(hole.content[0]).toMatchObject({ text: 'Built 2 × screwHole on Plate at [10, 10, 6]: size M3, head cap, fit normal.' });
    const key = await tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 0, 80], normal: [0, -1, 0] });
    expect(String(key.content[0]?.text)).toContain('Built 1 keyhole slot for 4 mm wood screws in Plate: entry 9 mm for the head, a slot 4.5 mm wide running 8 mm up to where the screw rests, and behind its 2 mm lip a pocket 3.5 mm deep for the head. The part must be at least 6.7 mm thick there.');
    // The holes need no sketch; the keyhole's plastic is measured on trial, then its sketches are drawn with the plate's component active.
    expect(batches).toEqual(['solid.hole solid.hole', 'component.list', 'solid.cylinder inspect.interference solid.cylinder inspect.interference sketch.inspect', 'component.activate solid.cylinder sketch.create sketch.slot.center_to_center solid.extrude sketch.create sketch.slot.center_to_center solid.extrude component.activate']);
    expect(await tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 0, 80] })).toMatchObject({ isError: true, content: [{ text: 'Not built: keyhole needs normal: the way out of the face against the wall, three numbers' }] });
    expect(decide('partbuddy_block', { block: 'screwHole' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_block', { block: 'keyhole', screw: 4.5 })).toEqual([{ key: 'keyhole', values: { screw: 4.5 } }]);
    expect(describeToolCall('partbuddy_block', { block: 'woodScrew' })).toEqual([{ key: 'woodScrewHole', values: { screw: 4 } }]);
    expect(describeToolCall('partbuddy_block', { block: 'insertSeat', body: 'Base' })).toEqual([{ key: 'blockByAssistant', values: { block: 'insertSeat', body: 'Base' } }]);
  });
});

describe('a knob for a shaft (standards)', () => {
  const knob: KnobSpec = { body: 'Knob', point: [0, 0, 0], axis: [0, 0, 1], toward: [0, 1, 0], shaft: 'd', shaftDiameter: 6, flat: 4.5, diameter: 25, height: 16, clearance: 0.2 };

  it('builds the fluted body, the bore with the flat of a D shaft away from the pointer, the pointer and the print face', () => {
    const steps = knobSteps(knob);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['solid.cylinder', 'Knob'],
      ['solid.cone', 'Knob ◢'],
      ['solid.cylinder', 'Knob ◆'],
      ['solid.pattern.circular', ''],
      ['solid.cylinder', 'Knob ○'],
      ['solid.cone', 'Knob ◣'],
      ['sketch.create', 'Knob ▬'],
      ['sketch.line', ''],
      ['solid.extrude', 'Knob ▬'],
      ['sketch.create', 'Knob ▸'],
      ['sketch.slot.center_to_center', ''],
      ['solid.extrude', 'Knob ▸'],
      ['body.print_face', ''],
    ]);
    expect(steps[0]?.params).toMatchObject({ diameter: '25 mm', height: '15.4 mm', operation: 'new', body_name: 'Knob' });
    // Eleven flutes, one every 7 mm, stopping 2 mm under the top.
    expect(steps[2]?.params).toMatchObject({ diameter: '3 mm', height: '14 mm', operation: 'cut' });
    expect(steps[3]?.params).toMatchObject({ count: 11, axis: { origin: [0, 0, 0], dir: [0, 0, 1] } });
    // The bore: the shaft and 0.2 mm, 11 mm deep under 5 mm of roof.
    expect(steps[4]?.params).toMatchObject({ diameter: '6.2 mm', height: '11 mm', base: [0, 0, 0], operation: 'cut' });
    // The flat over the bore's last 7 mm: sketch x runs to the pointer (+Y), and the flat lies at x = −(4.5 − 3 + 0.1).
    // Its mouth opens by 0.5 mm, so the shaft finds its way in.
    expect(steps[5]?.params).toMatchObject({ diameter: '7.2 mm', top_diameter: '6.2 mm', height: '0.5 mm', base: [0, 0, 0], operation: 'cut' });
    expect(steps[6]?.params.plane).toEqual({ origin: [0, 0, 4], x_dir: [0, 1, 0], y_dir: [-1, 0, 0] });
    expect(steps[7]?.params).toEqual({ points: [[-1.6, -3.1], [-1.6, 3.1], [-3.6, 3.1], [-3.6, -3.1]], closed: true });
    expect(steps[8]?.params).toMatchObject({ distance: '7 mm', operation: 'join' });
    // The pointer: a groove on the top from a third of the radius to the rim, towards +Y.
    expect(steps[9]?.params.plane).toEqual({ origin: [0, 0, 16], x_dir: [-1, 0, 0], y_dir: [0, 1, 0] });
    expect(steps[10]?.params).toEqual({ p0: [0, 4.375], p1: [0, 12.5], width: 1.2 });
    expect(steps[11]?.params).toMatchObject({ distance: '0.6 mm', operation: 'cut' });
    expect(steps[12]?.params).toEqual({ body: 'Knob', point: [0, 0, 16] });
    expect(KNOB).toMatchObject({ roof: 3, wall: 2.4, insert: 11, flat: 7, mouth: 0.5, setScrew: 2.6 });
  });

  it('gives a round shaft a set screw from the side away from the pointer, and a knurled one a plain bore', () => {
    // A shaft along +X, the pointer up: the screw's hole starts outside the knob below it and runs up to the bore.
    const round = knobSteps({ ...knob, point: [10, 5, 3], axis: [1, 0, 0], toward: [0, 0, 1], shaft: 'round', diameter: 20, height: 14 });
    expect(round.map((step) => step.params.name ?? '')).toContain('Knob ⊙');
    expect(round.find((step) => step.params.name === 'Knob ⊙')?.params).toMatchObject({ diameter: '2.6 mm', height: '11 mm', base: [15.5, 5, -8], axis: [0, 0, 1], operation: 'cut' });
    const knurl = knobSteps({ ...knob, shaft: 'knurl', clearance: 0 });
    expect(knurl.map((step) => step.command)).not.toContain('sketch.line');
    expect(knurl[4]?.params).toMatchObject({ diameter: '6 mm' });
    expect(knurl[5]?.params).toMatchObject({ diameter: '7 mm', top_diameter: '6 mm' });
  });

  it('fills a knob in from the standard and refuses what cannot hold a shaft', () => {
    const built = knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0] });
    expect(built).toMatchObject({ body: 'Volume', fresh: true });
    expect((built as { text: string }).text).toContain('Built the knob "Volume" for a 6 mm D shaft (flat at 4.5 mm): the bore is 6.2 mm wide and 11 mm deep, flat over its last 7 mm on the side away from the pointer, with a chamfered mouth, to push on. It is 25 mm wide and 16 mm high, with 11 flutes to grip');
    expect((knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], shaft: 'knurl' }) as { text: string }).text).toContain('a plain bore 6 mm wide and 11 mm deep');
    // A shaft along Y takes its pointer up.
    expect((knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], normal: [0, 1, 0] }) as { steps: { params: { plane?: { y_dir: number[] } } }[] }).steps[9]?.params.plane?.y_dir).toEqual([0, 0, 1]);
    expect(knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], shaftDiameter: 6.35 })).toBe("a D shaft of 6.35 mm has no one flat: give flat, the shaft's thickness there, as measured");
    expect(knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], shaftDiameter: 6.35, flat: 5.54 })).toMatchObject({ body: 'Volume' });
    expect(knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], diameter: 10 })).toBe('diameter must be 13–80 mm for a 6 mm shaft');
    expect(knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], height: 6 })).toContain('height must be 9–60 mm');
    expect(knobProblem({ ...knob, toward: [0, 0, 2] })).toContain('must not run along normal');
    expect(knobProblem({ ...knob, flat: 2 })).toContain('flat must be');
    expect(knobOf({ block: 'keyhole', body: 'Plate', point: [0, 0, 0] })).toBeNull();
  });

  it('builds the knob as a new body, keeps its print face for the plate and refuses a name that is taken', async () => {
    const kept: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string }[];
        const reply = (step: { command: string }) => (step.command === 'component.list' ? { components: [{ id: 0, parent: null, bodies: ['Panel'] }] } : step.command === 'body.print_face' ? { body: 'Volume', face: 'face-7' } : {});
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map(reply) }) }] });
      },
    };
    const tools = withBlockTool(upstream, (body, face) => kept.push(`${body}:${face}`));
    expect(String((await tools.callTool('partbuddy_block', { block: 'knob', body: 'Volume', point: [0, 0, 0] })).content[0]?.text)).toContain('Built the knob "Volume"');
    expect(kept).toEqual(['Volume:face-7']);
    expect(await tools.callTool('partbuddy_block', { block: 'knob', body: 'Panel', point: [0, 0, 0] })).toMatchObject({ isError: true, content: [{ text: 'Not built: there is a body named Panel already; give the knob another name' }] });
    expect(describeToolCall('partbuddy_block', { block: 'knob', body: 'Volume' })).toEqual([{ key: 'knob', values: { name: 'Volume' } }]);
  });
});

describe('pockets for disc magnets (standards)', () => {
  it('cuts each pocket into the face with a chamfered mouth, sized by the magnet and how it is held', () => {
    const steps = magnetSteps({ body: 'Lid', point: [10, 10, 0], normal: [0, 0, -2], more: [[30, 10, 0]], diameter: 6, height: 2, hold: 'glue', name: 'Magnet' });
    expect(steps.map((step) => [step.command, step.params.name])).toEqual([
      ['solid.cylinder', 'Magnet 1'],
      ['solid.cone', 'Magnet 1 ◣'],
      ['solid.cylinder', 'Magnet 2'],
      ['solid.cone', 'Magnet 2 ◣'],
    ]);
    // On the underside: the pocket goes up into the part, 0.3 mm wider than the magnet and 0.2 mm deeper.
    expect(steps[0]?.params).toEqual({ diameter: '6.3 mm', height: '2.2 mm', base: [10, 10, 0], axis: [0, 0, 1], operation: 'cut', targets: ['Lid'], name: 'Magnet 1' });
    expect(steps[1]?.params).toMatchObject({ diameter: '7.1 mm', top_diameter: '6.3 mm', height: '0.4 mm', base: [10, 10, 0], axis: [0, 0, 1], operation: 'cut' });
    expect(steps[2]?.params).toMatchObject({ base: [30, 10, 0] });
    expect(magnetPocket({ diameter: 10, height: 3, hold: 'press' })).toEqual({ diameter: 10.1, depth: 3.2 });
    expect(MAGNET).toEqual({ room: { glue: 0.3, press: 0.1 }, sunk: 0.2, chamfer: 0.4, around: 1.2, under: 0.6 });
  });

  it('fills a pocket in from the standard, says how the magnet is held and refuses what is no magnet', () => {
    const glued = magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, -1], more: [[30, 10, 0]] });
    expect((glued as { text: string }).text).toContain('Built 2 pockets for 6 × 2 mm disc magnets in Lid: 6.3 mm wide and 2.2 mm deep, so the magnet lies 0.2 mm under the face, with a chamfered mouth. The magnet drops in and is held by a drop of superglue.');
    expect((magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, -1], diameter: 8, height: 3, hold: 'press' }) as { text: string }).text).toContain('8.1 mm wide and 3.2 mm deep');
    expect(magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0] })).toBe('magnet needs normal: the way out of the face the pocket opens in, three numbers');
    expect(magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, 1], diameter: 1 })).toBe('diameter must be 2–40 mm (the magnet)');
    expect(magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, 1], hold: 'tape' })).toBe('hold must be one of glue, press');
    expect(magnetOf({ block: 'knob', body: 'Lid', point: [0, 0, 0] })).toBeNull();
    expect(describeToolCall('partbuddy_block', { block: 'magnet', diameter: 8, height: 3 })).toEqual([{ key: 'magnetPocket', values: { diameter: 8, height: 3 } }]);
  });
});

describe('wall mounting (standards)', () => {
  // The back of a plate, against the wall, is its face y = 0; the part hangs along +Z.
  const key: KeyholeSpec = { body: 'Plate', point: [20, 0, 80], normal: [0, -1, 0], up: [0, 0, 1], screw: 4, more: [[60, 0, 80]], name: 'Keyhole' };

  it('cuts the entry for the head, the slot through the lip above it and the pocket behind the lip', () => {
    const steps = keyholeSteps(key);
    expect(steps.map((step) => [step.command, step.params.name ?? ''])).toEqual([
      ['solid.cylinder', 'Keyhole 1'],
      ['sketch.create', 'Keyhole 1 ·'],
      ['sketch.slot.center_to_center', ''],
      ['solid.extrude', 'Keyhole 1 ·'],
      ['sketch.create', 'Keyhole 1 ○'],
      ['sketch.slot.center_to_center', ''],
      ['solid.extrude', 'Keyhole 1 ○'],
      ['solid.cylinder', 'Keyhole 2'],
      ['sketch.create', 'Keyhole 2 ·'],
      ['sketch.slot.center_to_center', ''],
      ['solid.extrude', 'Keyhole 2 ·'],
      ['sketch.create', 'Keyhole 2 ○'],
      ['sketch.slot.center_to_center', ''],
      ['solid.extrude', 'Keyhole 2 ○'],
    ]);
    // The entry lies 8 mm below where the screw rests and goes through lip and pocket, into the part.
    expect(steps[0]?.params).toMatchObject({ diameter: '9 mm', height: '5.5 mm', base: [20, 0, 72], axis: [0, 1, 0], operation: 'cut', targets: ['Plate'] });
    // The slot: 4.5 mm wide through the 2 mm lip; the pocket: as wide as the entry, 3.5 mm deep, starting behind the lip.
    // Sketch x runs so that x × y points into the part, and a positive distance cuts.
    expect(steps[1]?.params.plane).toEqual({ origin: [20, 0, 80], x_dir: [-1, 0, 0], y_dir: [0, 0, 1] });
    expect(steps[2]?.params).toEqual({ p0: [0, -8], p1: [0, 0], width: 4.5 });
    expect(steps[3]?.params).toMatchObject({ distance: '2 mm', operation: 'cut' });
    expect(steps[4]?.params.plane).toMatchObject({ origin: [20, 2, 80] });
    expect(steps[5]?.params).toMatchObject({ width: 9 });
    expect(steps[6]?.params).toMatchObject({ distance: '3.5 mm' });
    expect(keyholeDepth(4)).toBe(6.7);
    expect(KEYHOLE).toEqual({ travel: 8, lip: 2, behind: 1.2 });
  });

  it('sizes keyhole and countersink by the wood screw, and refuses what cannot hang', () => {
    expect(WALL[3.5]).toEqual({ entry: 8, slot: 4, pocket: 3, clearance: 4.1, countersink: 7.8 });
    expect(WALL[5]).toMatchObject({ entry: 11, slot: 5.5, clearance: 5.7, countersink: 10.6 });
    expect(keyholeProblem(key)).toBeNull();
    expect(keyholeProblem({ ...key, up: [0, -1, 0] })).toContain('up must be square to normal');
    expect(woodScrewSteps({ body: 'Plate', point: [20, 8, 30], more: [[60, 8, 30]], screw: 4, name: 'Wall screw' }).map((step) => step.params)).toEqual([
      { position: [20, 8, 30], diameter: '4.7 mm', type: 'countersink', cs_diameter: '8.8 mm', cs_angle: '90 deg', targets: ['Plate'], name: 'Wall screw 1' },
      { position: [60, 8, 30], diameter: '4.7 mm', type: 'countersink', cs_diameter: '8.8 mm', cs_angle: '90 deg', targets: ['Plate'], name: 'Wall screw 2' },
    ]);
    expect(wallOf({ block: 'woodScrew', body: 'Plate', point: [20, 8, 30], screw: 6 })).toBe('screw must be one of 3.5, 4, 4.5, 5 (mm, a wood screw)');
    expect(wallOf({ block: 'screwHole', body: 'Plate', point: [0, 0, 0] })).toBeNull();
  });
});

describe('a block lands on the body it names (audit W1)', () => {
  const before = new Map([['A', 16000], ['B', 48000]]);

  it('refuses a body there is not, a point on another body and a point that changes nothing', () => {
    expect(misplaced('Ghost', before, before)).toBe('there is no body named Ghost; the design has A, B');
    expect(misplaced('A', before, new Map([['A', 16000], ['B', 47818.416]]))).toContain('it would change B, not only A');
    expect(misplaced('A', before, new Map([['A', 15909.208], ['B', 47909.208]]))).toContain('it would change B, not only A');
    expect(misplaced('A', before, before)).toBe('it would change nothing on A: the point is not on a face of A');
  });

  it('lets a block through that changes the named body alone, and a body whose volume SolidCraft cannot give', () => {
    expect(misplaced('A', before, new Map([['A', 15818.416], ['B', 48000]]))).toBeNull();
    expect(misplaced('Open', new Map([['Open', NaN]]), new Map([['Open', NaN]]))).toBeNull();
  });
});

describe('a block that lands on another body is taken back (audit W1)', () => {
  it('undoes every step the block added and says where it would have landed', async () => {
    const batches: string[] = [];
    let built = false;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string }[];
        batches.push(commands.map((step) => step.command).join(' '));
        if (commands.some((step) => step.command === 'solid.hole')) built = true;
        if (commands.some((step) => step.command === 'edit.undo')) built = false;
        const reply = (step: { command: string }) =>
          step.command === 'inspect.measure' ? { bodies: [{ name: 'A', volume_mm3: 16000 }, { name: 'B', volume_mm3: built ? 47818 : 48000 }] } : step.command === 'document.inspect' ? { undo: built ? 4 : 2 } : {};
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map(reply) }) }] });
      },
    };
    const answer = await withBlockTool(upstream).callTool('partbuddy_block', { block: 'screwHole', body: 'A', point: [30, 10, 20], more: [[40, 10, 20]] });
    expect(answer).toMatchObject({ isError: true, content: [{ text: 'Not built: at this point it would change B, not only A; give a point on a face of A alone, away from other bodies' }] });
    expect(batches).toEqual(['inspect.measure document.inspect', 'solid.hole solid.hole inspect.measure', 'document.inspect', 'edit.undo edit.undo']);
    expect(String((await withBlockTool(upstream).callTool('partbuddy_block', { block: 'screwHole', body: 'Ghost', point: [30, 10, 20] })).content[0]?.text)).toBe('Not built: there is no body named Ghost; the design has A, B');
  });
});

describe('a block is built only where the part has the plastic for it (audit R54)', () => {
  /** A plate `thick` mm thick, as SolidCraft 0.40.1 answers: the probe's share in the plate, each loose piece a body of its own. */
  function plate(thick: number, split = false) {
    const batches: string[] = [];
    let built = 0;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string; params: { diameter?: string; height?: string } }[];
        batches.push(commands.map((step) => step.command).join(' '));
        const trial = args.rollback === true;
        let probe = { diameter: 0, height: 0 };
        const results = commands.map((step) => {
          if (trial && step.command === 'solid.cylinder') probe = { diameter: parseFloat(step.params.diameter ?? ''), height: parseFloat(step.params.height ?? '') };
          if (step.command === 'inspect.interference') return { interferences: [{ a: 'Plate', b: 'PartBuddy probe 0', volume_mm3: ((Math.PI * probe.diameter ** 2) / 4) * Math.min(probe.height, thick) }] };
          if (!trial && (step.command === 'solid.hole' || step.command === 'solid.cylinder')) built += 1;
          if (step.command === 'edit.undo') built -= 1;
          // A blind hole of 4 mm takes what plastic there is, the plate's thickness at most.
          if (step.command === 'inspect.measure') return { bodies: [{ name: 'Plate', volume_mm3: 4800 - built * 4 * Math.PI * Math.min(6.7, thick) }, ...(split && built > 0 ? [{ name: 'Plate (1)', volume_mm3: 100 }] : [])] };
          if (step.command === 'document.inspect') return { undo: 1 + built };
          return {};
        });
        // The trial ends on a step that must fail; SolidCraft answers it as an error that carries the results before it.
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(trial ? { results: results.slice(0, -1), failed: { command: 'sketch.inspect' } } : { results }) }], ...(trial ? { isError: true } : {}) });
      },
    };
    return { tools: withBlockTool(upstream), upstream, batches };
  }
  const text = async (answer: Promise<ToolResult>) => String((await answer).content[0]?.text);

  it('names the plastic a keyhole and a magnet pocket need: as deep as the cut with what must stay behind it', () => {
    const key: KeyholeSpec = { body: 'Plate', point: [20, 30, 0], normal: [0, 0, -1], up: [0, 1, 0], screw: 4, more: [], name: 'Keyhole' };
    // Behind where the screw rests and behind the entry 8 mm below it.
    expect(keyholeStock(key)).toEqual([
      { at: [20, 30, 0], base: [20, 30, 0], axis: [0, 0, 1], diameter: 9, depth: 6.7 },
      { at: [20, 30, 0], base: [20, 22, 0], axis: [0, 0, 1], diameter: 9, depth: 6.7 },
    ]);
    // A 6 × 2 mm magnet: 6.3 + 2 × 1.2 wide, 2.2 + 0.6 deep.
    expect(magnetStock({ body: 'Plate', point: [10, 10, 3], normal: [0, 0, 2], more: [[30, 10, 3]], diameter: 6, height: 2, hold: 'glue', name: 'Magnet' })).toEqual([
      { at: [10, 10, 3], base: [10, 10, 3], axis: [0, 0, -1], diameter: 8.7, depth: 2.8 },
      { at: [30, 10, 3], base: [30, 10, 3], axis: [0, 0, -1], diameter: 8.7, depth: 2.8 },
    ]);
  });

  it('builds no keyhole in a 3 mm plate and no magnet pocket through it, and says what it measured', async () => {
    const { tools, batches } = plate(3);
    expect(await text(tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 30, 0], normal: [0, 0, -1], up: [0, 1, 0] }))).toBe(
      'Not built: at [20, 30, 0] Plate has 3 mm of plastic where 6.7 mm are needed (the mean over a width of 9 mm; the far side, an edge or another cut takes the rest); a keyhole needs the part 6.7 mm thick behind its entry and its slot. Thicken the part there, move the keyhole away from edges and other cuts, or use woodScrew.',
    );
    expect(await text(tools.callTool('partbuddy_block', { block: 'magnet', body: 'Plate', point: [20, 10, 3], normal: [0, 0, 1], height: 3 }))).toContain(
      'Not built: at [20, 10, 3] Plate has 3 mm of plastic where 3.8 mm are needed (the mean over a width of 8.7 mm',
    );
    // Nothing but trials reached SolidCraft: no cut, so nothing to undo.
    expect(batches.filter((batch) => batch.includes('solid.cylinder')).every((batch) => batch.endsWith('sketch.inspect'))).toBe(true);
    expect(batches.join(' ')).not.toContain('solid.extrude');
  });

  it('builds them where the plastic is, and says that it measured', async () => {
    const { tools } = plate(10);
    expect(await text(tools.callTool('partbuddy_block', { block: 'magnet', body: 'Plate', point: [20, 10, 10], normal: [0, 0, 1] }))).toMatch(/^Built 1 pocket .* PartBuddy measured that plastic before building: it is there\.$/);
  });

  it('says so when the plastic could not be measured, instead of passing it over', async () => {
    const silent: UpstreamTools = { instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [{ type: 'text', text: 'no' }], isError: true }) };
    expect(await shortOf(silent, 'Plate', [{ at: [0, 0, 0], base: [0, 0, 0], axis: [0, 0, 1], diameter: 9, depth: 6.7 }], undefined)).toBeUndefined();
  });

  it('takes back the seat of an insert that comes out of the far side', async () => {
    const thin = plate(3);
    expect(await text(thin.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [10, 10, 3] }))).toBe(
      'Not built: the seat would cut 37.7 mm³ of plastic where a blind hole 6.7 mm deep takes 84.2 mm³: it comes out of the far side or of an edge (3 mm of plastic at the point). Thicken the part there, or use a boss',
    );
    expect(thin.batches.at(-1)).toBe('edit.undo');
    const thick = plate(10);
    expect(await text(thick.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [10, 10, 10] }))).toBe(
      'Built insertSeat on Plate at [10, 10, 10]: size M3, diameter 4, depth 6.7. Measured: the seat is a blind hole cut out of solid plastic. Not checked: the plastic left round and under it.',
    );
  });

  it('takes back a block that cuts the body into pieces', async () => {
    expect(misplaced('Strip', new Map([['Strip', 720]]), new Map([['Strip', 300], ['Strip (1)', 300]]))).toBe(
      'it would leave 2 bodies where Strip was one (Strip (1)): the cut goes right through the part there. Give a point with more plastic round it, or a smaller size',
    );
    const { tools, batches } = plate(10, true);
    expect(await text(tools.callTool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: [10, 10, 10], head: 'none' }))).toContain('Not built: it would leave 2 bodies where Plate was one (Plate (1))');
    expect(batches.at(-1)).toBe('edit.undo');
  });
});
