import { describe, expect, it } from 'vitest';

import { BLOCK_GUIDANCE, FACE_DROP, jointsMoving, printLimit, STOCK_FULL, blockOf, cutAxis, knobOf, magnetOf, misplaced, named, rimNarrowest, seatStock, shortOf, wallOf, withBlockTool, type Stock } from '../src/main/agents/blockTool';
import { INSERT, blockLimit, defaultBlock, raisedBlock, stepsOf, type FeatureBlock } from '../src/shared/blocks';
import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { KNOB, knobFlutes, knobProblem, knobSteps, type KnobSpec } from '../src/shared/knob';
import { MAGNET, magnetPocket, magnetSteps, magnetStock } from '../src/shared/magnet';
import { describeToolCall } from '../src/shared/stepPhrases';
import { KEYHOLE, WALL, keyholeDepth, keyholeProblem, keyholeSteps, keyholeStock, woodScrewSteps, woodScrewStock, type KeyholeSpec } from '../src/shared/wallMount';

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
    expect(blockOf({ block: 'slot', body: 'Plate', point: [0, 0, 0] })).toBe('slot needs normal: the way out of the face, three numbers, not all zero');
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
        // Round every block: the plate measured and the design marked, then the block with a measurement after it.
        const block = commands.filter((step) => !['inspect.measure', 'document.inspect', 'joint.list'].includes(step.command));
        if (block.length > 0) batches.push(block.map((step) => step.command).join(' '));
        const measured = { bodies: [{ name: 'Plate', volume_mm3: commands.length > 2 ? 900 : 1000 }] };
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'component.list' ? { components: [{ id: 0, parent: null, bodies: [] }, { id: 7, parent: 0, bodies: ['Plate'], occurrences: [{ name: 'Plate:1' }] }] } : step.command === 'inspect.measure' ? measured : {})) }) }] });
      },
    };
    const tools = withBlockTool(upstream);
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['partbuddy_block']);
    const hole = await tools.callTool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: [10, 10, 6], more: [[30, 10, 6]] });
    // The double answers no trial: the holes go through all, and the answer says so.
    expect(hole.content[0]).toMatchObject({ text: 'Built 2 × screwHole on Plate at [10, 10, 6]: size M3, head cap, fit normal. The hole is 3.4 mm (ISO 273 medium, PartBuddy\'s table): 0.4 mm over the screw, more than the 0.3 mm a printed hole loses at the most, under a counterbore 6.7 mm wide and 3.4 mm deep with two bridge layers of 0.2 mm under its floor (a slot, then a square), so that floor prints facing the bed without support. SolidCraft could not run the trial that measures the wall: it went through all of Plate on its line, far walls too; check it, and give depth where it must stop sooner.' });
    const key = await tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 0, 80], normal: [0, -1, 0], screw: 4 });
    expect(String(key.content[0]?.text)).toContain('Built 1 keyhole slot for 4 mm wood screws in Plate: entry 9 mm for the head, a slot 4.5 mm wide running 8 mm up to where the screw rests, and behind its 2 mm lip a pocket 3.5 mm deep for the head. The part must be at least 6.7 mm thick there.');
    // The holes need no sketch; the keyhole's plastic is measured on trial, then its sketches are drawn with the plate's component active.
    expect(batches).toEqual(['solid.box solid.combine solid.move solid.hole solid.hole solid.move solid.combine sketch.inspect', 'solid.hole solid.hole', 'component.list', 'solid.cylinder inspect.interference solid.cylinder inspect.interference sketch.inspect', 'component.activate solid.cylinder sketch.create sketch.slot.center_to_center solid.extrude sketch.create sketch.slot.center_to_center solid.extrude component.activate']);
    expect(await tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 0, 80], screw: 4 })).toMatchObject({ isError: true, content: [{ text: 'Not built: keyhole needs normal: the way out of the face against the wall, three numbers' }] });
    expect(decide('partbuddy_block', { block: 'screwHole' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_block', { block: 'keyhole', screw: 4.5 })).toEqual([{ key: 'keyhole', values: { screw: 4.5 } }]);
    // A call without the screw is refused: the work log names no size it did not have (review of PR #369, K4).
    expect(describeToolCall('partbuddy_block', { block: 'woodScrew' })).toEqual([{ key: 'blockByAssistant', values: { block: 'woodScrew', body: '' } }]);
    expect(describeToolCall('partbuddy_block', { block: 'woodScrew', screw: 4 })).toEqual([{ key: 'woodScrewHole', values: { screw: 4 } }]);
    expect(describeToolCall('partbuddy_block', { block: 'insertSeat', body: 'Base' })).toEqual([{ key: 'blockByAssistant', values: { block: 'insertSeat', body: 'Base' } }]);
  });
});

describe('a knob for a shaft (standards)', () => {
  const shaft6 = { body: 'Volume', point: [0, 0, 0], shaft: 'd', shaftDiameter: 6 };
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
    // Twelve flutes, about one every 7 mm and an even number (audit T46), stopping 2 mm under the top.
    expect(steps[2]?.params).toMatchObject({ diameter: '3 mm', height: '14 mm', operation: 'cut' });
    expect(steps[3]?.params).toMatchObject({ count: 12, axis: { origin: [0, 0, 0], dir: [0, 0, 1] } });
    // The bore: the shaft and 0.2 mm, 11 mm deep under 5 mm of roof.
    expect(steps[4]?.params).toMatchObject({ diameter: '6.2 mm', height: '11 mm', base: [0, 0, 0], operation: 'cut' });
    // The flat over the bore's last 7 mm: sketch x runs to the pointer (+Y), and the flat lies at x = −(4.5 − 3 + 0.1).
    // Its mouth opens by 0.5 mm, so the shaft finds its way in.
    expect(steps[5]?.params).toMatchObject({ diameter: '7.2 mm', top_diameter: '6.2 mm', height: '0.5 mm', base: [0, 0, 0], operation: 'cut' });
    expect(steps[6]?.params.plane).toEqual({ origin: [0, 0, 5], x_dir: [0, 1, 0], y_dir: [-1, 0, 0] });
    expect(steps[7]?.params).toEqual({ points: [[-1.6, -3.1], [-1.6, 3.1], [-3.6, 3.1], [-3.6, -3.1]], closed: true });
    expect(steps[8]?.params).toMatchObject({ distance: '6 mm', operation: 'join' });
    // The pointer: a groove on the top from a third of the radius to the rim, towards +Y.
    expect(steps[9]?.params.plane).toEqual({ origin: [0, 0, 16], x_dir: [-1, 0, 0], y_dir: [0, 1, 0] });
    expect(steps[10]?.params).toEqual({ p0: [0, 4.375], p1: [0, 12.5], width: 1.2 });
    expect(steps[11]?.params).toMatchObject({ distance: '0.6 mm', operation: 'cut' });
    expect(steps[12]?.params).toEqual({ body: 'Knob', point: [0, 0, 16] });
    // The flat 6 mm long, the shortest sold (Alps RK09, audit MV-15); the set screw's pilot 0.8 × 3 + PLA's 0.15 (audit MV-26).
    expect(KNOB).toMatchObject({ roof: 3, wall: 2.4, insert: 11, flat: 6, mouth: 0.5, setScrew: 2.55 });
  });

  it('gives a round shaft a set screw from the side away from the pointer, and a knurled one a plain bore', () => {
    // A shaft along +X, the pointer up: the screw's hole starts outside the knob below it and runs up to the bore.
    const round = knobSteps({ ...knob, point: [10, 5, 3], axis: [1, 0, 0], toward: [0, 0, 1], shaft: 'round', diameter: 20, height: 14 });
    expect(round.map((step) => step.params.name ?? '')).toContain('Knob ⊙');
    expect(round.find((step) => step.params.name === 'Knob ⊙')?.params).toMatchObject({ diameter: '2.55 mm', height: '11 mm', base: [15.5, 5, -8], axis: [0, 0, 1], operation: 'cut' });
    const knurl = knobSteps({ ...knob, shaft: 'knurl', clearance: 0 });
    expect(knurl.map((step) => step.command)).not.toContain('sketch.line');
    expect(knurl[4]?.params).toMatchObject({ diameter: '6 mm' });
    expect(knurl[5]?.params).toMatchObject({ diameter: '7 mm', top_diameter: '6 mm' });
  });

  it('fills a knob in from the standard and refuses what cannot hold a shaft', () => {
    const built = knobOf({ block: 'knob', ...shaft6 });
    expect(built).toMatchObject({ body: 'Volume', fresh: true });
    expect((built as { text: string }).text).toContain('Built the knob "Volume" for a 6 mm D shaft (flat at 4.5 mm): the bore is 6.2 mm wide and 11 mm deep, flat over its last 6 mm on the side away from the pointer, with a chamfered mouth, to push on. It is 25 mm wide and 16 mm high, with 12 flutes to grip');
    expect((knobOf({ block: 'knob', ...shaft6, shaft: 'knurl' }) as { text: string }).text).toContain('a plain bore 6 mm wide and 11 mm deep');
    // A shaft along Y takes its pointer up.
    expect((knobOf({ block: 'knob', ...shaft6, normal: [0, 1, 0] }) as { steps: { params: { plane?: { y_dir: number[] } } }[] }).steps[9]?.params.plane?.y_dir).toEqual([0, 0, 1]);
    expect(knobOf({ block: 'knob', ...shaft6, shaftDiameter: 6.35 })).toBe("a D shaft of 6.35 mm has no one flat: give flat, the shaft's thickness there, as measured");
    expect(knobOf({ block: 'knob', ...shaft6, shaftDiameter: 6.35, flat: 5.54 })).toMatchObject({ body: 'Volume' });
    expect(knobOf({ block: 'knob', ...shaft6, diameter: 10 })).toBe('diameter must be 13–80 mm for a 6 mm shaft');
    expect(knobOf({ block: 'knob', ...shaft6, height: 6 })).toContain('height must be 9–60 mm');
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
    expect(String((await tools.callTool('partbuddy_block', { block: 'knob', ...shaft6 })).content[0]?.text)).toContain('Built the knob "Volume"');
    expect(kept).toEqual(['Volume:face-7']);
    expect(await tools.callTool('partbuddy_block', { block: 'knob', ...shaft6, body: 'Panel' })).toMatchObject({ isError: true, content: [{ text: 'Not built: there is a body named Panel already; give the knob another name' }] });
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
    expect(MAGNET).toEqual({ room: { glue: 0.3, press: 0.1 }, sunk: 0.2, chamfer: 0.4, around: 1.2 });
  });

  it('fills a pocket in from the standard, says how the magnet is held and refuses what is no magnet', () => {
    const glued = magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, -1], more: [[30, 10, 0]], diameter: 6, height: 2 });
    expect((glued as { text: string }).text).toContain('Built 2 pockets for 6 × 2 mm disc magnets in Lid: 6.3 mm wide and 2.2 mm deep, so the magnet lies 0.2 mm under the face, with a chamfered mouth. The magnet drops in and is held by a drop of superglue.');
    expect((magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, -1], diameter: 8, height: 3, hold: 'press' }) as { text: string }).text).toContain('8.1 mm wide and 3.2 mm deep');
    expect(magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0] })).toBe('magnet needs normal: the way out of the face the pocket opens in, three numbers');
    expect(magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, 1], diameter: 1, height: 2 })).toBe('diameter must be 2–40 mm (the magnet)');
    expect(magnetOf({ block: 'magnet', body: 'Lid', point: [10, 10, 0], normal: [0, 0, 1], hold: 'tape', diameter: 6, height: 2 })).toBe('hold must be one of glue, press');
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

describe('a cut through goes through the wall at its point alone (audit W2, T4, N-bloecke-1)', () => {
  /**
   * The box 60 × 40 × 30 with walls of 2 mm, open at the top, as SolidCraft 0.40.1 answers for it (2026-11-13): a trial cut
   * through all at [0, 20, 15] into the wall x = 0 leaves one piece in each side wall, as wide as the cut; a `solid.hole`
   * while the copy of the body lies on it fails ("the reference `F1:+z` no longer exists as it was picked"), as it did.
   */
  function box(options: { aside?: boolean; wall?: number } = {}) {
    const sent: { commands: { command: string; params: Record<string, unknown> }[]; rollback: boolean }[] = [];
    let volume = 15552;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        const rollback = args.rollback === true;
        sent.push({ commands, rollback });
        let onBody = false;
        let half: [number, number] = [0, 0];
        const results: unknown[] = [];
        for (const [i, step] of commands.entries()) {
          if (step.command === 'solid.combine' && step.params.operation === 'intersect') onBody = true;
          if (step.command === 'solid.move') onBody = ((step.params.translate as number[])[2] ?? 0) < 0 || options.aside === false;
          if (rollback && onBody && step.command === 'solid.hole') {
            const failed = { index: i, command: 'solid.hole', error: 'Hole1: the reference `F1:+z` no longer exists as it was picked; reselect it' };
            return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results, failed }) }], isError: true });
          }
          if (step.command === 'solid.hole') half = String(step.params.thread) === 'M5' ? [2.1, 2.1] : [1.7, 1.7];
          if (step.command === 'sketch.slot.center_to_center') half = [5 + Number(step.params.width) / 2, Number(step.params.width) / 2];
          if (!rollback && (step.command === 'solid.hole' || step.command === 'solid.extrude' || step.command === 'solid.emboss')) volume -= 80;
          const [w, h, t] = [...half, options.wall ?? 2];
          const pieces = [60 - t, 0].map((x, k) => ({ name: `PartBuddy through${k ? ' (1)' : ''}`, bbox: { min: [x, 20 - w, 15 - h], max: [x + t, 20 + w, 15 + h] }, center_of_mass: [x + t / 2, 20, 15] }));
          results.push(step.command === 'inspect.measure' ? { bodies: [{ name: 'Dose', volume_mm3: volume }, ...(rollback ? pieces : [])] } : step.command === 'document.inspect' ? { undo: 1, timeline: [], sketches: [] } : {});
        }
        const reply = rollback ? { results: results.slice(0, -1), failed: { index: commands.length - 1, command: 'sketch.inspect', error: 'no sketch' } } : { results };
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(reply) }], ...(rollback ? { isError: true } : {}) });
      },
    };
    const built = (command: string) => sent.filter((batch) => !batch.rollback).flatMap((batch) => batch.commands).filter((step) => step.command === command).map((step) => step.params);
    return { tools: withBlockTool(upstream), sent, built };
  }
  const side = { body: 'Dose', point: [0, 20, 15] };

  it('finds the reach on trial and builds the slot, the screw hole and the tapped hole that deep, and says so', async () => {
    const { tools, sent, built } = box();
    const slot = await tools.callTool('partbuddy_block', { block: 'slot', ...side, normal: [-1, 0, 0] });
    expect(sent.find((batch) => batch.rollback)?.commands.map((step) => step.command)).toEqual(['solid.box', 'solid.combine', 'solid.move', 'sketch.create', 'sketch.slot.center_to_center', 'solid.extrude', 'solid.move', 'solid.combine', 'inspect.measure', 'sketch.inspect']);
    expect(built('solid.extrude')).toEqual([{ distance: '-3 mm', operation: 'cut', targets: ['Dose'] }]);
    expect(String(slot.content[0]?.text)).toContain('It goes through the wall at the point and up to a millimetre past it, as measured on trial (3 mm from the face), not on through a far wall; give through body to go through all of Dose.');
    await tools.callTool('partbuddy_block', { block: 'screwHole', ...side, head: 'none' });
    await tools.callTool('partbuddy_block', { block: 'tappedHole', ...side, size: 'M5' });
    expect(built('solid.hole').map((params) => params.depth)).toEqual(['3 mm', '3 mm']);
    // A depth given is kept, and needs no trial.
    const trials = sent.filter((batch) => batch.rollback).length;
    await tools.callTool('partbuddy_block', { block: 'slot', ...side, normal: [-1, 0, 0], depth: 1.5 });
    expect(sent.filter((batch) => batch.rollback).length).toBe(trials);
    expect(built('solid.extrude').at(-1)).toMatchObject({ distance: '-1.5 mm' });
  });

  it('notices when the trial cannot drill: then the hole goes through all and the answer says that it was not measured', async () => {
    // The copy left on the body, as before the review of PR #365: the hole of the trial fails.
    const { tools, built } = box({ aside: false });
    const hole = await tools.callTool('partbuddy_block', { block: 'screwHole', ...side, head: 'none' });
    expect(built('solid.hole')[0]).not.toHaveProperty('depth');
    expect(String(hole.content[0]?.text)).toContain('SolidCraft could not run the trial that measures the wall: it went through all of Dose on its line, far walls too');
    // A point off every face of the body: the trial runs, and no piece holds the point.
    const off = await box().tools.callTool('partbuddy_block', { block: 'screwHole', body: 'Dose', point: [-0.5, 20, 15], head: 'none' });
    expect(String(off.content[0]?.text)).toContain('No plastic of Dose lies within 0.05 mm of the point, so its wall could not be measured: it went through all of Dose on its line');
  });

  it('drills through both cheeks of a fork when asked to go through the body, without a trial', async () => {
    const { tools, sent, built } = box();
    const fork = await tools.callTool('partbuddy_block', { block: 'screwHole', ...side, head: 'none', through: 'body' });
    expect(sent.some((batch) => batch.rollback)).toBe(false);
    expect(built('solid.hole')[0]).not.toHaveProperty('depth');
    expect(String(fork.content[0]?.text)).toContain("through body. The hole is 3.4 mm (ISO 273 medium, PartBuddy's table): 0.4 mm over the screw, more than the 0.3 mm a printed hole loses at the most, its mouth chamfered 0.5 mm at 45°. It goes through all of Dose on its line.");
    // With a depth, it goes that deep and the answer says nothing of going through.
    const deep = await tools.callTool('partbuddy_block', { block: 'slot', ...side, normal: [-1, 0, 0], depth: 1.5, through: 'body' });
    expect(String(deep.content[0]?.text)).not.toContain('through all');
    expect(blockOf({ block: 'insertSeat', ...side, through: 'body' })).toBe('insertSeat takes no through; it takes size, diameter, depth, normal, more, name. Leave out what it does not take');
    expect(blockOf({ block: 'slot', ...side, normal: [-1, 0, 0], through: 'all' })).toContain('through');
  });

  it('measures the wall under a nut trap and engraved text on the same trial, and builds neither through it (audit N-bloecke-6, W31, T30)', async () => {
    const thin = box();
    // An M3 nut trap's pocket is 2.8 mm deep: in the 2 mm wall its hole was left on no face and SolidCraft refused it.
    const trap = await thin.tools.callTool('partbuddy_block', { block: 'nutTrap', ...side, normal: [-1, 0, 0] });
    expect(trap).toMatchObject({ isError: true, content: [{ text: 'Not built: at [0, 20, 15] Dose is 2 mm thick (measured on trial); the pocket of an M3 nut trap is 2.8 mm deep and needs 0.9 mm of plastic under it (two lines or four layers on a 0.4 mm nozzle, as the part may lie either way), 3.7 mm in all. Put it where the part is thicker, or thicken the part there.' }] });
    // In a 3.2 mm wall the M3 pocket does not fit, an M2 one does: the answer names it (review of PR #369, K6).
    expect(String((await box({ wall: 3.2 }).tools.callTool('partbuddy_block', { block: 'nutTrap', ...side, normal: [-1, 0, 0] })).content[0]?.text)).toContain('3.7 mm in all. Put it where the part is thicker, or thicken the part there. An M2 nut trap (pocket 2 mm deep) fits there; it takes an M2 screw instead of the M3.');
    // The trial drills the hole alone, so a pocket deeper than the wall cannot fail it.
    expect(thin.sent.find((batch) => batch.rollback)?.commands.map((step) => step.command)).toEqual(['solid.box', 'solid.combine', 'solid.move', 'solid.hole', 'solid.move', 'solid.combine', 'inspect.measure', 'sketch.inspect']);
    expect(thin.built('solid.extrude')).toEqual([]);
    const deep = await thin.tools.callTool('partbuddy_block', { block: 'text', ...side, normal: [-1, 0, 0], text: 'Hi', depth: 1.5 });
    expect(String(deep.content[0]?.text)).toContain('Not built: at [0, 20, 15] Dose is 2 mm thick (measured on trial); text engraved 1.5 mm deep and needs 0.9 mm');
    const engraved = await thin.tools.callTool('partbuddy_block', { block: 'text', ...side, normal: [-1, 0, 0], text: 'Hi' });
    expect(String(engraved.content[0]?.text)).toContain('Its strokes are about 1.41 mm wide; the gaps between the letters were not measured: the print check shows them. The part is 2 mm thick at the middle of the text, as measured on trial: 1.4 mm stay under the letters there.');
    const thick = box({ wall: 4 });
    const fits = await thick.tools.callTool('partbuddy_block', { block: 'nutTrap', ...side, normal: [-1, 0, 0] });
    expect(thick.built('solid.hole')).toEqual([expect.objectContaining({ position: [2.8, 20, 15], depth: '2.2 mm' })]);
    expect(String(fits.content[0]?.text)).toContain("The wall is 4 mm thick there, as measured on trial: 1.2 mm of it stay under the nut. Lying open downwards, the pocket's roof is a bridge with the hole in it, and lying on its side its top is an overhang: PartBuddy did not check either");
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
        if (args.rollback !== true && commands.some((step) => step.command === 'solid.hole')) built = true;
        if (commands.some((step) => step.command === 'edit.undo')) built = false;
        const reply = (step: { command: string }) =>
          step.command === 'inspect.measure' ? { bodies: [{ name: 'A', volume_mm3: 16000 }, { name: 'B', volume_mm3: built ? 47818 : 48000 }] } : step.command === 'document.inspect' ? { undo: built ? 4 : 2, timeline: built ? [1, 2, 3, 4] : [1, 2], sketches: [] } : {};
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map(reply) }) }] });
      },
    };
    const answer = await withBlockTool(upstream).callTool('partbuddy_block', { block: 'screwHole', body: 'A', point: [30, 10, 20], more: [[40, 10, 20]] });
    expect(answer).toMatchObject({ isError: true, content: [{ text: 'Not built: at this point it would change B, not only A; give a point on a face of A alone, away from other bodies' }] });
    // The design marked before, the two steps since undone in one batch and looked at; then the top component is made active.
    expect(batches).toEqual(['inspect.measure joint.list', 'solid.box solid.combine solid.move solid.hole solid.hole solid.move solid.combine inspect.measure sketch.inspect', 'document.inspect joint.list', 'solid.hole solid.hole inspect.measure', 'document.inspect joint.list', 'edit.undo edit.undo document.inspect joint.list', 'component.activate']);
    expect(String((await withBlockTool(upstream).callTool('partbuddy_block', { block: 'screwHole', body: 'Ghost', point: [30, 10, 20] })).content[0]?.text)).toBe('Not built: there is no body named Ghost; the design has A, B');
  });
});

describe('a block is built only where the part has the plastic for it (audit R54)', () => {
  interface PlateOptions {
    /** The plate is this thick from x = 30 on: a step. */
    thin?: number;
    split?: boolean;
    /** The share of its cylinder a hole takes: under 1 where its rim breaks out of the face. */
    rim?: number;
    /** SolidCraft's cap on the depth of the undo history, and how many steps the design already has. */
    cap?: number;
    steps?: number;
    /** Undo does nothing: a block cannot be taken back. */
    stuck?: boolean;
  }
  /**
   * A plate lying on z = 0, `thick` mm thick (`thin` from x = 30 on), as SolidCraft 0.40.1 answers: the share of a probe
   * cylinder along Z that lies in it, holes drilled down from their point, each loose piece a body of its own, the undo
   * depth capped. A probe that does not run along Z finds no plastic: a wrong axis shows as a refusal.
   */
  function plate(thick: number, { thin = thick, split = false, rim = 1, cap = 200, steps = 1, stuck = false }: PlateOptions = {}) {
    const batches: string[] = [];
    const holes: { x: number; y: number; top: number; diameter: number; depth: number; mouth: number }[] = [];
    const num = (value: unknown) => parseFloat(String(value));
    const area = (diameter: number) => (Math.PI * diameter ** 2) / 4;
    const topAt = (x: number) => (x < 30 ? thick : thin);
    const reach = (hole: { top: number; depth: number }) => Math.min(hole.depth, hole.top);
    let active = 0;
    const measured = () => {
      const [solid, centre] = [100_000, [50, 20, 3]];
      const taken = holes.map((hole) => ({ volume: (area(hole.diameter) * reach(hole) + hole.mouth) * rim, at: [hole.x, hole.y, hole.top - reach(hole) / 2] }));
      const volume = solid - taken.reduce((sum, hole) => sum + hole.volume, 0);
      const com = centre.map((value, k) => (solid * value - taken.reduce((sum, hole) => sum + hole.volume * (hole.at[k] ?? 0), 0)) / volume);
      return { bodies: [{ name: 'Plate', volume_mm3: volume, center_of_mass: com }, ...(split && holes.length > 0 ? [{ name: 'Plate (1)', volume_mm3: 100, center_of_mass: [0, 0, 0] }] : [])] };
    };
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        batches.push(commands.map((step) => step.command).join(' '));
        const trial = args.rollback === true;
        let probe = { x: 0, y: 0, diameter: 0, top: 0, bottom: 0, alongZ: true };
        const results = commands.map((step) => {
          if (step.command === 'component.activate') active = step.params.component as number;
          if (trial && step.command === 'solid.cylinder') {
            const [base, axis, height] = [step.params.base as number[], step.params.axis as number[], num(step.params.height)];
            const [z, way] = [base[2] ?? 0, axis[2] ?? 0];
            probe = { x: base[0] ?? 0, y: base[1] ?? 0, diameter: num(step.params.diameter), top: Math.max(z, z + way * height), bottom: Math.min(z, z + way * height), alongZ: Math.abs(Math.abs(way) - 1) < 1e-3 };
          }
          if (step.command === 'inspect.interference') {
            const within = (top: number, bottom: number) => Math.max(0, Math.min(top, probe.top) - Math.max(bottom, probe.bottom));
            const cut = holes.filter((hole) => Math.hypot(hole.x - probe.x, hole.y - probe.y) < 1e-6).reduce((sum, hole) => sum + area(hole.diameter) * within(hole.top, hole.top - reach(hole)), 0);
            return { interferences: [{ a: 'Plate', b: 'PartBuddy probe 0', volume_mm3: probe.alongZ ? area(probe.diameter) * within(topAt(probe.x), 0) - cut : 0 }] };
          }
          if (!trial && (step.command === 'solid.hole' || step.command === 'solid.cylinder')) {
            const at = (step.params.position ?? step.params.base) as number[];
            const diameter = num(step.params.diameter ?? '3.4');
            // A countersink at the mouth takes its cone beyond the hole too, as SolidCraft cuts it.
            const [wide, h] = [num(step.params.cs_diameter ?? diameter) / 2, (num(step.params.cs_diameter ?? diameter) - diameter) / 2];
            const mouth = (Math.PI * h * (wide ** 2 + wide * (diameter / 2) + (diameter / 2) ** 2)) / 3 - area(diameter) * h;
            holes.push({ x: at[0] ?? 0, y: at[1] ?? 0, top: at[2] ?? 0, diameter, depth: num(step.params.depth ?? step.params.height ?? '1000'), mouth });
          }
          if (step.command === 'edit.undo' && !stuck) holes.pop();
          if (step.command === 'inspect.measure') return measured();
          if (step.command === 'document.inspect') return { undo: Math.min(cap, steps + holes.length), timeline: Array.from({ length: steps + holes.length }), sketches: [] };
          return {};
        });
        // The trial ends on a step that must fail; SolidCraft answers it as an error that carries the results before it.
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(trial ? { results: results.slice(0, -1), failed: { command: 'sketch.inspect' } } : { results }) }], ...(trial ? { isError: true } : {}) });
      },
    };
    const logged: string[] = [];
    return { tools: withBlockTool(upstream, () => undefined, (line) => logged.push(line)), upstream, batches, holes, logged, active: () => active };
  }
  const text = async (answer: Promise<ToolResult>) => String((await answer).content[0]?.text);
  const pilot = "If a hole is there already at that point (a pilot hole), it counts as missing plastic too: delete that hole's feature and build the seat in its place.";
  const seatNeed = 'the seat of an M3 insert needs 2 mm of plastic round it and 0.6 mm under it. Thicken the part there, move the seat away from edges and other cuts, or use a boss.';

  it('names the plastic each block needs, measured from half a millimetre under the face on', () => {
    const key: KeyholeSpec = { body: 'Plate', point: [20, 30, 0], normal: [0, 0, -1], up: [0, 1, 0], screw: 4, more: [], name: 'Keyhole' };
    // Down to 6.7 mm, where the screw rests and at the entry 8 mm below it.
    expect(keyholeStock(key, FACE_DROP)).toEqual([
      { at: [20, 30, 0], base: [20, 30, 0.5], axis: [0, 0, 1], diameter: 9, depth: 6.2, from: 0.5 },
      { at: [20, 22, 0], base: [20, 22, 0.5], axis: [0, 0, 1], diameter: 9, depth: 6.2, from: 0.5 },
    ]);
    // A 6 × 2 mm magnet: 6.3 + 2 × 1.2 wide, down to 0.9 mm (two lines of 0.4 mm, more than four 0.2 mm layers) under its 2.2 mm pocket (audit H-22).
    expect(magnetStock({ body: 'Plate', point: [10, 10, 3], normal: [0, 0, 2], more: [[30, 10, 3]], diameter: 6, height: 2, hold: 'glue', name: 'Magnet' }, FACE_DROP, 0.9)).toEqual([
      { at: [10, 10, 3], base: [10, 10, 2.5], axis: [0, 0, -1], diameter: 8.7, depth: 2.6, from: 0.5 },
      { at: [30, 10, 3], base: [30, 10, 2.5], axis: [0, 0, -1], diameter: 8.7, depth: 2.6, from: 0.5 },
    ]);
    // The seat of an M3 insert: 4 + 2 × 2 wide, down to 0.6 mm under its 6.7 mm, less the seat itself.
    const seat = seatStock({ block: 'insertSeat', body: 'Plate', point: [10, 10, 10], size: 'M3', diameter: 4, depth: 6.7 }, [10, 10, 10], [0, 0, -1]);
    expect(seat).toMatchObject({ at: [10, 10, 10], base: [10, 10, 9.5], diameter: 8, depth: 6.8, from: 0.5 });
    expect(seat.hole).toBeCloseTo(Math.PI * 4 * 6.2, 6);
    // A 4 mm wood screw: 4 mm of plastic round its 4.7 mm hole (so a 15 mm tab takes it), down to 0.6 mm of that hole under the 2.05 mm countersink.
    const screw = woodScrewStock(4, [10, 10, 10], [0, 0, -1], FACE_DROP);
    expect(screw).toMatchObject({ base: [10, 10, 9.5], diameter: 12.7, depth: 2.15, from: 0.5 });
    expect(screw.diameter).toBeLessThan(15);
    // What the hole itself takes of that cylinder: the cone from 7.8 mm at its start down to 4.7 mm, then the hole.
    expect(screw.hole).toBeCloseTo((Math.PI * 1.55 * (3.9 ** 2 + 3.9 * 2.35 + 2.35 ** 2)) / 3 + Math.PI * 2.35 ** 2 * 0.6, 6);
  });

  it('reads the way a hole went in from what it took out of the body, one hole at a time', () => {
    const before = { bodies: [{ name: 'Plate', volume_mm3: 16000, center_of_mass: [20, 20, 5] }] };
    // A hole of 100 mm³ whose middle lies at [10, 10, 7], drilled from [10, 10, 10].
    const after = { bodies: [{ name: 'Plate', volume_mm3: 15900, center_of_mass: [(16000 * 20 - 100 * 10) / 15900, (16000 * 20 - 100 * 10) / 15900, (16000 * 5 - 100 * 7) / 15900] }] };
    expect(cutAxis('Plate', before, after, [10, 10, 10])).toEqual([0, 0, -1]);
    expect(cutAxis('Plate', before, before, [10, 10, 10])).toBeNull();
    expect(cutAxis('Ghost', before, after, [10, 10, 10])).toBeNull();
    // A centre of mass nearer to the point than a tenth of a millimetre tells no direction.
    expect(cutAxis('Plate', before, after, [10, 10, 7.05])).toBeNull();
  });

  it('measures each of several holes along its own way in: two wood screws on a stepped plate (review 2 of PR 357)', async () => {
    // 8 mm thick at x = 10, 4 mm at x = 50: the holes take unequal amounts, and their common centre lies askew under the middle.
    const stepped = plate(8, { thin: 4 });
    expect(await text(stepped.tools.callTool('partbuddy_block', { block: 'woodScrew', body: 'Plate', point: [10, 20, 8], more: [[50, 20, 4]], screw: 4 }))).toMatch(
      /^Built 2 countersunk holes .* PartBuddy measured that plastic, from 0\.5 mm under the face on: it is there\. Right under the hole it allows 5\.2 mm³ less plastic, 0\.3 mm of the hole's depth, as a curved face may take; it cannot tell that from a cut of that size there\. The wall round the hole is measured in full\.$/,
    );
    // Each hole is cut and measured by itself, then both are probed in one trial.
    expect(stepped.batches).toContain('solid.hole inspect.measure solid.hole inspect.measure');
    expect(stepped.holes).toHaveLength(2);
    // Two seats, one of them over a pocket that takes its lower half: only that one is short.
    const pocket = plate(10, { thin: 5 });
    expect(await text(pocket.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [10, 20, 10], more: [[50, 20, 5]] }))).toContain('Not built: at [50, 20, 5] the seat would cut');
    expect(pocket.holes).toEqual([]);
    // Three seats, the bad one in the middle (review 3 of PR 357): none of them stays.
    const middle = plate(10, { thin: 5 });
    expect(await text(middle.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [10, 20, 10], more: [[50, 20, 5], [20, 20, 10]] }))).toContain('Not built: at [50, 20, 5] the seat would cut');
    expect(middle.holes).toEqual([]);
  });

  it('builds no keyhole in a 3 mm plate and no magnet pocket through it, and says what it measured', async () => {
    const { tools, batches } = plate(3);
    expect(await text(tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 30, 3], normal: [0, 0, 1], up: [0, 1, 0], screw: 4 }))).toBe(
      'Not built: at [20, 30, 3] Plate has 3 mm of plastic where 6.7 mm are needed (the mean over a width of 9 mm; the far side, an edge or another cut takes the rest); a keyhole needs the part 6.7 mm thick behind its entry and its slot. Thicken the part there, move the keyhole away from edges and other cuts, or use woodScrew.',
    );
    expect(await text(tools.callTool('partbuddy_block', { block: 'magnet', body: 'Plate', point: [20, 10, 3], normal: [0, 0, 1], diameter: 6, height: 3 }))).toContain(
      'Not built: at [20, 10, 3] Plate has 3 mm of plastic where 4.1 mm are needed (the mean over a width of 8.7 mm',
    );
    // Nothing but trials reached SolidCraft: no cut, so nothing to undo.
    expect(batches.filter((batch) => batch.includes('solid.cylinder')).every((batch) => batch.endsWith('sketch.inspect'))).toBe(true);
    expect(batches.join(' ')).not.toContain('solid.extrude');
  });

  it('says where the plastic is missing: at the entry of a keyhole, not where the screw rests', async () => {
    let probes = 0;
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string }[];
        // The first probe (where the screw rests) is all plastic, the second (the entry) is half in the air.
        const results = commands.map((step) => (step.command === 'inspect.interference' ? { interferences: [{ volume_mm3: ((Math.PI * 81) / 4) * 6.2 * (probes++ === 0 ? 1 : 0.5) }] } : {}));
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }], isError: true });
      },
    };
    const stock = keyholeStock({ body: 'Plate', point: [20, 5, 0], normal: [0, 0, -1], up: [0, 1, 0], screw: 4, more: [], name: 'Keyhole' }, FACE_DROP);
    expect(await shortOf(upstream, 'Plate', stock, undefined)).toContain('at [20, -3, 0] Plate has 3.6 mm of plastic where 6.7 mm are needed');
  });

  it('builds them where the plastic is, and says what it measured and from where', async () => {
    const { tools } = plate(10);
    expect(await text(tools.callTool('partbuddy_block', { block: 'magnet', body: 'Plate', point: [20, 10, 10], normal: [0, 0, 1], diameter: 6, height: 2 }))).toMatch(
      /^Built 1 pocket .* PartBuddy measured that plastic before building, from 0\.5 mm under the face on: it is there\.$/,
    );
  });

  // Review 4 of PR #357: a seat 5 mm from an edge with a 3 mm chamfer missed about 4.0 mm³ of its stock, the slack of a
  // curved face and the tolerance together, and passed with 0.5 mm of wall at the top. The slack counts under the seat alone.
  it('never lets the slack of a curved face pass a wall that is too thin round a seat', async () => {
    const seat = seatStock({ block: 'insertSeat', body: 'Plate', point: [10, 10, 10], size: 'M3', diameter: 4, depth: 6.7 }, [10, 10, 10], [0, 0, -1], true);
    const area = (width: number) => (Math.PI * width ** 2) / 4;
    const [core, ring] = [area(seat.core ?? 0) * seat.depth - (seat.hole ?? 0), (area(8) - area(seat.core ?? 0)) * seat.depth];
    const probed = (missing: { ring: number; core: number }): UpstreamTools => ({
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string; params: { bodies?: string[] } }[];
        const results = commands.map((step) => {
          if (step.command !== 'inspect.interference') return {};
          const inner = String(step.params.bodies?.[1]).endsWith('core');
          return { interferences: [{ volume_mm3: inner ? core - missing.core : core - missing.core + ring - missing.ring }] };
        });
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: results.slice(0, -1), failed: { command: 'sketch.inspect' } }) }], isError: true });
      },
    });
    expect(await shortOf(probed({ ring: 4, core: 0 }), 'Plate', [seat], undefined)).toBe(
      'at [10, 10, 10] Plate has 7.19 mm of plastic where 7.3 mm are needed (the mean over a ring from 4.02 to 8 mm wide; the far side, an edge, a face that falls away to one side or another cut takes the rest)',
    );
    // As much missing right under the seat as a curved face takes passes; the answer says so (the stepped wood screws above).
    expect(await shortOf(probed({ ring: 0, core: 3.5 }), 'Plate', [seat], undefined)).toBeNull();
    expect(await shortOf(probed({ ring: 0, core: 4.5 }), 'Plate', [seat], undefined)).toContain('(the mean over a width of 4.02 mm, under the hole;');
  });

  it('says so when the plastic could not be measured, instead of passing it over', async () => {
    const silent: UpstreamTools = { instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [{ type: 'text', text: 'no' }], isError: true }) };
    expect(await shortOf(silent, 'Plate', [{ at: [0, 0, 0], base: [0, 0, 0], axis: [0, 0, 1], diameter: 9, depth: 6.7, from: 0 }], undefined)).toBeUndefined();
  });

  it('takes back the seat of an insert that comes out of the far side, and one that leaves no floor', async () => {
    const thin = plate(3);
    expect(await text(thin.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [20, 20, 3] }))).toBe(
      `Not built: at [20, 20, 3] the seat would cut 39.4 mm³ of plastic where its cylinder and the chamfer at its mouth are 85.9 mm³: its rim breaks out of the face, into an edge, a chamfer, the far side or another cut; ${seatNeed} ${pilot}`,
    );
    expect(thin.holes).toEqual([]);
    // A plate just as thick as the seat is deep: the hole is whole, and has no floor (review of PR 357).
    const flush = plate(6.7);
    expect(await text(flush.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [20, 20, 6.7] }))).toBe(
      `Not built: at [20, 20, 6.7] Plate has 6.7 mm of plastic where 7.3 mm are needed (the mean over a ring from 4.02 to 8 mm wide; the far side, an edge, a face that falls away to one side or another cut takes the rest); ${seatNeed}`,
    );
    expect(flush.holes).toEqual([]);
    const thick = plate(10);
    expect(await text(thick.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [20, 20, 10] }))).toBe(
      'Built insertSeat on Plate at [20, 20, 10]: size M3, diameter 4, depth 6.7. Its mouth is chamfered 0.5 mm at 45° to start the insert. Each seat needs 2 mm of plastic round it and 0.6 mm under it. PartBuddy measured that plastic, from 0.5 mm under the face on, and that each seat cut its whole cylinder and the chamfer at its mouth: it is there.',
    );
  });

  it('takes back a seat whose rim breaks into a chamfer or an edge: it cuts less than its cylinder (review 2 of PR 357)', async () => {
    // At a 3 mm chamfer the seat of an M3 insert took 1.3 % less than its cylinder; the plastic lower down is all there.
    const chamfer = plate(20, { rim: 0.987 });
    expect(await text(chamfer.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [20, 20, 20] }))).toContain(
      'Not built: at [20, 20, 20] the seat would cut 84.8 mm³ of plastic where its cylinder and the chamfer at its mouth are 85.9 mm³: its rim breaks out of the face, into an edge, a chamfer, the far side or another cut',
    );
    expect(chamfer.holes).toEqual([]);
    // A curved face takes a little off the rim as well, and passes: 0.03 % on a rod of 20 mm radius, as measured. Only
    // there is the slack of a curved face allowed, and the answer says what that slack lets through (review 3 of PR 357).
    const rod = plate(20, { rim: 0.9997 });
    expect(await text(rod.tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [20, 20, 20] }))).toMatch(/^Built insertSeat .*: it is there\. Right under the hole it allows 3\.8 mm³ less plastic/);
    const seat = { block: 'insertSeat' as const, body: 'Plate', point: [0, 0, 0] as [number, number, number], size: 'M3' as const, diameter: 4, depth: 6.7 };
    expect(seatStock(seat, [0, 0, 0], [0, 0, -1]).slack).toBeUndefined();
    expect(seatStock(seat, [0, 0, 0], [0, 0, -1], true).slack).toBeCloseTo(Math.PI * 4 * 0.3, 6);
    expect(await text(plate(20).tools.callTool('partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [20, 20, 20] }))).toMatch(/: it is there.$/);
  });

  it('takes back a countersunk hole in a plate thinner than the countersink with its hole under it', async () => {
    const thin = plate(2);
    // (The double drills a plain hole, so the figure it "has" is not the engine's; that one is in the audit harness.)
    expect(await text(thin.tools.callTool('partbuddy_block', { block: 'woodScrew', body: 'Plate', point: [20, 20, 2], screw: 4 }))).toMatch(
      /^Not built: at \[20, 20, 2\] Plate has [\d.]+ mm of plastic where 2\.65 mm are needed \(the mean over a ring from 7\.82 to 12\.7 mm wide; the far side, an edge, a face that falls away to one side or another cut takes the rest\); a countersunk hole for a 4 mm wood screw needs 4 mm of plastic round its 4\.7 mm hole and a plate at least 2\.65 mm thick\. Thicken the plate, or move the hole away from edges and other cuts\.$/,
    );
    expect(thin.holes).toEqual([]);
  });

  it('takes back a block that cuts the body into pieces', async () => {
    expect(misplaced('Strip', new Map([['Strip', 720]]), new Map([['Strip', 300], ['Strip (1)', 300]]))).toBe(
      'it would leave 2 bodies where Strip was one (Strip (1)): the cut goes right through the part there. Give a point with more plastic round it, or a smaller size',
    );
    const { tools, holes } = plate(10, { split: true });
    expect(await text(tools.callTool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: [10, 10, 10], head: 'none' }))).toContain('Not built: it would leave 2 bodies where Plate was one (Plate (1))');
    expect(holes).toEqual([]);
  });
});

describe('a block is taken back by what the design measures, not by the depth of the undo history (review 2 and 3 of PR 357)', () => {
  /**
   * A design as SolidCraft 0.40.1 answers for it: every built command is one undo step and one feature, activating a
   * component is none, the undo depth stops at `cap`, Undo and Redo work on the steps. Every block lands on body B as
   * well, so it must not stay. `undo: 'throws'` refuses every Undo; `'foreign'` leaves a body renamed that no Undo
   * brings back, so the design never reads as before.
   */
  function design(steps: number, { cap = 200, undo = 'works' }: { cap?: number; undo?: 'works' | 'throws' | 'foreign' } = {}) {
    const batches: string[] = [];
    const built: string[] = [];
    const redo: string[] = [];
    let base = steps;
    let renamed = false;
    let active = 7;
    const reads = new Set(['inspect.measure', 'document.inspect', 'joint.list', 'component.list', 'component.activate', 'edit.undo', 'edit.redo']);
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        const commands = args.commands as { command: string; params: Record<string, unknown> }[];
        batches.push(commands.map((step) => step.command).join(' '));
        // A trial SolidCraft takes back (the reach of a cut through, blocks.ts): refused here, so the block is built as asked.
        if (args.rollback === true) return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: [], failed: { index: 0, command: 'solid.box', error: 'refused' } }) }], isError: true });
        const results: unknown[] = [];
        for (const step of commands) {
          if (step.command === 'edit.undo') {
            if (undo === 'throws') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results, failed: { command: 'edit.undo', error: 'nothing to undo' } }) }], isError: true });
            const last = built.pop();
            if (last) redo.push(last);
            else base -= 1;
          }
          if (step.command === 'edit.redo') built.push(redo.pop() ?? '?');
          if (step.command === 'component.activate') active = step.params.component as number;
          if (!reads.has(step.command)) {
            built.push(step.command);
            redo.length = 0;
            if (undo === 'foreign') renamed = true;
          }
          const n = built.length;
          results.push(
            step.command === 'inspect.measure'
              ? { bodies: [{ name: 'A', volume_mm3: 16000 - n * 50 }, { name: 'B', volume_mm3: 48000 - n * 50 }] }
              : step.command === 'document.inspect'
                ? { undo: Math.min(cap, base + n), timeline: Array.from({ length: base + n }, (_, i) => ({ id: i + 1 })), sketches: [], bodies: renamed ? ['A', 'B2'] : ['A', 'B'] }
                : step.command === 'component.list'
                  ? { components: [{ id: 0, parent: null, bodies: [] }, { id: 7, parent: 0, bodies: ['A'] }] }
                  : {},
          );
        }
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results }) }] });
      },
    };
    const logged: string[] = [];
    const count = (command: string) => batches.join(' ').split(' ').filter((entry) => entry === command).length;
    return { tools: withBlockTool(upstream, () => undefined, (line) => logged.push(line)), batches, logged, built, base: () => base, active: () => active, undos: () => count('edit.undo'), redos: () => count('edit.redo') };
  }
  const landsOnB = 'Not built: at this point it would change B, not only A; give a point on a face of A alone, away from other bodies';
  const notBack = `${landsOnB}. What was built could NOT be taken back and is all still there: undo it before you call again.`;
  const slot = { block: 'slot', body: 'A', point: [30, 10, 20], normal: [0, 0, 1] };

  it('undoes exactly the steps of the block, not the component activations around it, below the cap and past it', async () => {
    for (const steps of [10, 260]) {
      const d = design(steps);
      // A sketched slot in the component of A: activate, three steps, activate (the old take-back counted five and tried four more).
      expect(await d.tools.callTool('partbuddy_block', slot), String(steps)).toMatchObject({ isError: true, content: [{ text: landsOnB }] });
      expect(d.built, String(steps)).toEqual([]);
      expect(d.undos(), String(steps)).toBe(3);
      expect(d.base(), String(steps)).toBe(steps);
      expect(d.active(), String(steps)).toBe(0);
      expect(d.batches.at(-1), String(steps)).toBe('component.activate');
      expect(d.logged, String(steps)).toEqual([]);
    }
  });

  it('undoes both holes of a block though the depth reads 200 before and after', async () => {
    const d = design(260);
    expect(await d.tools.callTool('partbuddy_block', { block: 'screwHole', body: 'A', point: [30, 10, 20], more: [[40, 10, 20]] })).toMatchObject({ isError: true, content: [{ text: landsOnB }] });
    expect(d.built).toEqual([]);
    expect(d.undos()).toBe(2);
    expect(d.base()).toBe(260);
  });

  it('when the design never reads as before, undoes nothing older than the block, redoes what it undid and says that all of it is there', async () => {
    for (const steps of [10, 260]) {
      const d = design(steps, { undo: 'foreign' });
      expect(String((await d.tools.callTool('partbuddy_block', slot)).content[0]?.text), String(steps)).toBe(notBack);
      expect(d.undos(), String(steps)).toBe(3);
      expect(d.redos(), String(steps)).toBe(3);
      expect(d.built, String(steps)).toEqual(['sketch.create', 'sketch.slot.center_to_center', 'solid.extrude']);
      expect(d.base(), String(steps)).toBe(steps);
      expect(d.active(), String(steps)).toBe(0);
      expect(d.logged, String(steps)).toEqual([`partbuddy_block slot on A could not be taken back (kept) after: ${landsOnB.slice('Not built: '.length)}`]);
    }
  });

  it('when edit.undo throws, leaves the block as it was and says so', async () => {
    const d = design(260, { undo: 'throws' });
    expect(String((await d.tools.callTool('partbuddy_block', { block: 'screwHole', body: 'A', point: [30, 10, 20] })).content[0]?.text)).toBe(notBack);
    expect(d.built).toEqual(['solid.hole']);
    expect(d.redos()).toBe(0);
    expect(d.active()).toBe(0);
  });
});

describe('what the assistant may ask of a block (audit W3, S-02, N-bloecke-4)', () => {
  const at = { body: 'Cube', point: [10, 10, 20] };

  it('refuses text without words, a printed thread under M5 and a seat far off the insert', () => {
    expect(blockOf({ block: 'text', ...at, normal: [0, 0, 1] })).toBe('text needs text: the words to write');
    expect(blockOf({ block: 'text', ...at, normal: [0, 0, 1], text: 'Cube' })).toMatchObject({ text: 'Cube' });
    expect(blockOf({ block: 'tappedHole', ...at, size: 'M4' })).toBe('a printed M4 thread strips; use insertSeat (a heat-set insert) for M4, or tappedHole from M5');
    expect(blockOf({ block: 'tappedHole', ...at, size: 'M5' })).toMatchObject({ size: 'M5', modeled: true });
    expect(blockOf({ block: 'insertSeat', ...at, diameter: 500, depth: 500 })).toBe('the hole for an M3 insert is 4 mm wide; diameter may differ by a tenth of that (3.6 to 4.4 mm)');
    expect(blockOf({ block: 'insertSeat', ...at, diameter: 0.01, depth: 0.01 })).toContain('the hole for an M3 insert is 4 mm wide');
    expect(blockOf({ block: 'insertSeat', ...at, depth: 3 })).toBe('the seat of an M3 insert is 6.7 mm deep (the insert is 5.7 mm long); depth may be 5.7 to 17.1 mm');
    expect(blockOf({ block: 'insertSeat', ...at, diameter: 4.2, depth: 8 })).toMatchObject({ diameter: 4.2, depth: 8 });
    expect(blockOf({ block: 'boss', ...at, size: 'M5', diameter: 8 })).toBe('a boss for an M5 insert is at least 11.6 mm wide: the 6.4 mm hole and 2.6 mm of wall round it');
  });
});

// Review 5 of PR #357: the ring of a seat's wall had no slack at all, and a face curved like a handle of 40 mm or a rod
// of 60 mm took more of its top than the tolerance: M5 and M6 seats there were refused. This double reckons what a rod,
// a ball or a chamfer takes of each probe, column by column.
describe('the wall round a hole on a curved face and at an edge (review 5 of PR 357)', () => {
  type Drop = (x: number, y: number) => number;
  const rod = (radius: number): Drop => (x) => (Math.abs(x) < radius ? radius - Math.sqrt(radius ** 2 - x ** 2) : Infinity);
  const ball = (radius: number): Drop => (x, y) => (Math.hypot(x, y) < radius ? radius - Math.sqrt(radius ** 2 - x ** 2 - y ** 2) : Infinity);
  /** A flat top with an edge `edge` mm from the point along +x, chamfered `chamfer` mm at 45°. */
  const edged = (edge: number, chamfer: number): Drop => (x) => (x <= edge - chamfer ? 0 : x <= edge ? x - (edge - chamfer) : Infinity);
  /** Plastic of a probe along -z from FACE_DROP under the point, in a part under `drop` with a hole that takes depths 0 to `hole(ρ)`; summed over a polar grid split at `breaks`. */
  function probe(width: number, depth: number, drop: Drop, hole: (r: number) => number, breaks: number[]) {
    const edges = [0, ...breaks.filter((b) => b > 0 && b < width / 2), width / 2];
    const [n, m] = [60, 180];
    let [volume, cx, cy, cz] = [0, 0, 0, 0];
    for (let s = 0; s + 1 < edges.length; s += 1) {
      const [from, to] = [edges[s] ?? 0, edges[s + 1] ?? 0];
      for (let i = 0; i < n; i += 1) {
        const r = from + ((i + 0.5) * (to - from)) / n;
        for (let j = 0; j < m; j += 1) {
          const t = ((j + 0.5) * 2 * Math.PI) / m;
          const [x, y] = [r * Math.cos(t), r * Math.sin(t)];
          const [start, end] = [Math.max(FACE_DROP, drop(x, y), hole(r)), FACE_DROP + depth];
          if (start >= end) continue;
          const v = (end - start) * r * ((to - from) / n) * ((2 * Math.PI) / m);
          [volume, cx, cy, cz] = [volume + v, cx + v * x, cy + v * y, cz - (v * (start + end)) / 2];
        }
      }
    }
    return { volume_mm3: volume, center: volume > 0 ? [cx / volume, cy / volume, cz / volume] : [0, 0, 0] };
  }
  /** SolidCraft for `shortOf`: each probe cylinder in the part under `drop`, with the hole cut. */
  function part(drop: Drop, hole: (r: number) => number, breaks: number[]): UpstreamTools {
    return {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        let made = { width: 0, depth: 0 };
        const results = (args.commands as { command: string; params: Record<string, unknown> }[]).map((step) => {
          if (step.command === 'solid.cylinder') made = { width: parseFloat(String(step.params.diameter)), depth: parseFloat(String(step.params.height)) };
          return step.command === 'inspect.interference' ? { interferences: [probe(made.width, made.depth, drop, hole, breaks)] } : {};
        });
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: results.slice(0, -1), failed: { command: 'sketch.inspect' } }) }], isError: true });
      },
    };
  }
  const area = (width: number) => (Math.PI * width ** 2) / 4;
  /** The check before review 3: the whole cylinder against the slack of a curved face. */
  const before = (stock: Stock, drop: Drop, hole: (r: number) => number, breaks: number[]) => {
    const full = area(stock.diameter) * stock.depth - (stock.hole ?? 0);
    return probe(stock.diameter, stock.depth, drop, hole, breaks).volume_mm3 >= full * STOCK_FULL - (stock.slack ?? 0);
  };
  const seat = (size: 'M2' | 'M3' | 'M4' | 'M5' | 'M6') => {
    const insert = INSERT[size] ?? { diameter: 0, length: 0 };
    const block = { block: 'insertSeat' as const, body: 'Part', point: [0, 0, 0] as [number, number, number], size, diameter: insert.diameter, depth: insert.length + 1 };
    return { stock: seatStock(block, [0, 0, 0], [0, 0, -1], true), hole: (r: number) => (r < block.diameter / 2 ? block.depth : 0), breaks: [block.diameter / 2] };
  };
  const screw = (size: 3.5 | 4 | 5) => {
    const { clearance, countersink } = WALL[size];
    const stock = woodScrewStock(size, [0, 0, 0], [0, 0, -1], FACE_DROP);
    return { stock, hole: (r: number) => (r < clearance / 2 ? Infinity : r < countersink / 2 ? countersink / 2 - r : 0), breaks: [clearance / 2, countersink / 2 - FACE_DROP, countersink / 2] };
  };

  // About 2 s here, and over the 5 s default on a loaded CI runner: its own timeout. The 60 × 180 grid of the double is kept;
  // 30 × 90 halved the time, but whether it keeps the radii at which the old check passed was not shown, so it stays.
  it('lets through on a rod or a ball every seat and wood screw the slack of a curved face let through before', { timeout: 60_000 }, async () => {
    // The smallest radius at which each passed before, by the reviewer's reckoning; around it in steps of 1 mm.
    const cases = [
      ...(['M2', 'M3', 'M4', 'M5', 'M6'] as const).map((size, i) => ({ name: `rod ${size}`, ...seat(size), shape: rod, near: [6, 7, 9, 12.5, 19.5][i] ?? 0 })),
      ...(['M3', 'M5', 'M6'] as const).map((size, i) => ({ name: `ball ${size}`, ...seat(size), shape: ball, near: [10, 18.5, 29][i] ?? 0 })),
      ...([3.5, 4, 5] as const).map((size, i) => ({ name: `rod wood screw ${String(size)}`, ...screw(size), shape: rod, near: [15, 19.5, 30][i] ?? 0 })),
    ];
    for (const { name, stock, hole, breaks, shape, near } of cases) {
      let passed = 0;
      for (let radius = near - 3; radius <= near + 6; radius += 1) {
        const drop = shape(radius);
        const fell: number[] = [];
        const now = await shortOf(part(drop, hole, breaks), 'Part', [stock], undefined, (mm3) => fell.push(mm3));
        if (before(stock, drop, hole, breaks)) {
          expect(now, `${name} at ${String(radius)} mm`).toBeNull();
          passed += 1;
        }
        if (now === null && fell.length > 0) expect(fell[0], name).toBeGreaterThan(0);
      }
      expect(passed, name).toBeGreaterThan(0);
    }
    // The M5 seat in a handle of 40 mm and the M6 seat in a rod of 60 mm of the review.
    expect(await shortOf(part(rod(20), seat('M5').hole, seat('M5').breaks), 'Part', [seat('M5').stock], undefined)).toBeNull();
    expect(await shortOf(part(rod(30), seat('M6').hole, seat('M6').breaks), 'Part', [seat('M6').stock], undefined)).toBeNull();
  });

  // Review 6 of PR #357: on a cone what is missing leans towards the apex, on a torus away from its middle: the centre
  // left the axis by more than a tenth of the stock, and seats main built there were refused.
  it('lets through on a cone and off the middle of a torus what the slack of a curved face let through before', async () => {
    /** A cone of half angle `angle` whose face at the point is curved with `radius`, its apex towards -y (the reviewer's model). */
    const cone = (radius: number, angle: number): Drop => (x, y) => {
      const r = radius * (1 + (y * Math.tan(angle)) / radius);
      return r <= 0 || Math.abs(x) >= r ? Infinity : r - Math.sqrt(r ** 2 - x ** 2);
    };
    /** A torus round the z axis, its tube `tube` mm thick round a circle of `ring` mm, the point `at` radians up the tube from its outer middle. */
    const torus = (ring: number, tube: number, at: number): Drop => {
      const [n, along] = [[Math.cos(at), 0, Math.sin(at)], [-Math.sin(at), 0, Math.cos(at)]];
      const p = [ring + tube * Math.cos(at), 0, tube * Math.sin(at)];
      const inside = (q: number[]) => (Math.hypot(q[0] ?? 0, q[1] ?? 0) - ring) ** 2 + (q[2] ?? 0) ** 2 <= tube ** 2;
      return (x, y) => {
        const at0 = [0, 1, 2].map((i) => (p[i] ?? 0) + x * (along[i] ?? 0) + (i === 1 ? y : 0));
        const down = (s: number) => at0.map((value, i) => value - s * (n[i] ?? 0));
        if (inside(down(0))) return 0;
        let [low, high] = [0, 2 * tube];
        if (!inside(down(high)) && !inside(down(tube))) return Infinity;
        if (!inside(down(high))) high = tube;
        for (let step = 0; step < 40; step += 1) {
          const mid = (low + high) / 2;
          if (inside(down(mid))) high = mid;
          else low = mid;
        }
        return high;
      };
    };
    const cases = [
      ...([['M3', 10], ['M5', 20], ['M6', 30]] as const).flatMap(([size, radius]) => [45, 60].map((degrees) => ({ name: `${size} cone R${String(radius)} ${String(degrees)}°`, ...seat(size), drop: cone(radius, (degrees * Math.PI) / 180) }))),
      // The M5 seat in a conical knob of 28 mm at 45° of the review, built on main.
      { name: 'M5 knob 28 mm 45°', ...seat('M5'), drop: cone(14, Math.PI / 4) },
      ...([['M3', 10], ['M5', 15]] as const).map(([size, tube]) => ({ name: `${size} torus off its middle`, ...seat(size), drop: torus(40, tube, Math.PI / 5) })),
      { name: 'wood screw 4 cone R25 45°', ...screw(4), drop: cone(25, Math.PI / 4) },
    ];
    for (const { name, stock, hole, breaks, drop } of cases) {
      expect(before(stock, drop, hole, breaks), name).toBe(true);
      expect(await shortOf(part(drop, hole, breaks), 'Part', [stock], undefined), name).toBeNull();
    }
  });

  // Review 7 of PR #357: a curve and a gentle chamfer to one side, just past the hole's rim. The even part of the loss
  // pulled the centre towards the axis and the chamfer went through (main let both through as well).
  it('refuses a curved face with a chamfer to one side just past the rim', async () => {
    const rod8: Drop = (x) => (Math.abs(x) < 8 ? 8 - Math.sqrt(64 - x ** 2) : Infinity);
    const rod30: Drop = (x) => (Math.abs(x) < 30 ? 30 - Math.sqrt(900 - x ** 2) : Infinity);
    const side = (from: number) => (v: number) => (v <= from ? 0 : (v - from) * 0.3);
    const [m3, m6] = [seat('M3'), seat('M6')];
    // M3 on a rod of 8 mm with a slope of 0.3 from 0.1 mm past the rim: 0.47 mm of wall at the top, the reviewer reckoned.
    const chamfered: Drop = (x, y) => rod8(x, y) + side(2.1)(x);
    expect(before(m3.stock, chamfered, m3.hole, m3.breaks)).toBe(true);
    expect(String(await shortOf(part(chamfered, m3.hole, m3.breaks), 'Part', [m3.stock], undefined))).toContain('a face that falls away to one side');
    // M6 on a rod of 30 mm with such a slope on two sides, a corner.
    const corner: Drop = (x, y) => rod30(x, y) + side(4.1)(x) + side(4.1)(y);
    expect(before(m6.stock, corner, m6.hole, m6.breaks)).toBe(true);
    expect(String(await shortOf(part(corner, m6.hole, m6.breaks), 'Part', [m6.stock], undefined))).toContain('a face that falls away to one side');
  });

  it('still refuses a wall that an edge or a chamfer takes to one side, slack or not', async () => {
    // The seat 5 mm from an edge with a 3 mm chamfer: before, it passed with 0.5 mm of wall at the top.
    const m3 = seat('M3');
    const chamfer = edged(5, 3);
    expect(before(m3.stock, chamfer, m3.hole, m3.breaks)).toBe(true);
    expect(String(await shortOf(part(chamfer, m3.hole, m3.breaks), "Part", [m3.stock], undefined))).toContain('(the mean over a ring from 4.02 to 8 mm wide;');
    // A wood screw 5.7 mm from a square edge, and 7 mm from one with a 2 mm chamfer: the slack let both through before.
    const wood = screw(4);
    for (const drop of [edged(5.7, 0), edged(7, 2)]) {
      expect(before(wood.stock, drop, wood.hole, wood.breaks)).toBe(true);
      expect(String(await shortOf(part(drop, wood.hole, wood.breaks), "Part", [wood.stock], undefined))).toContain('(the mean over a ring from 7.82 to 12.7 mm wide;');
    }
    // An edge rounded with 3 mm, 4.5 mm from the seat's point: one side, refused.
    const rounded: Drop = (x) => (x <= 1.5 ? 0 : x <= 4.5 ? 3 - Math.sqrt(9 - (x - 1.5) ** 2) : Infinity);
    expect(before(m3.stock, rounded, m3.hole, m3.breaks)).toBe(true);
    expect(String(await shortOf(part(rounded, m3.hole, m3.breaks), 'Part', [m3.stock], undefined))).toContain('a face that falls away to one side');
    // A rib too narrow on both sides takes the wall all the way down, not at the top: refused though it is even.
    const rib: Drop = (x) => (Math.abs(x) <= 3.95 ? 0 : Infinity);
    expect(String(await shortOf(part(rib, m3.hole, m3.breaks), "Part", [m3.stock], undefined))).toContain('a ring from 4.02 to 8 mm wide');
    // On a flat face the wall is measured in full.
    expect(await shortOf(part(() => 0, m3.hole, m3.breaks), 'Part', [m3.stock], undefined)).toBeNull();
  });
});

/**
 * A plate of 8000 mm³ as SolidCraft answers for it: every step that builds takes 10 mm³, a trial fails at its last step as
 * a batch with rollback does, and `answer` may answer a step itself (after it took its 10 mm³).
 */
function plate(answer: (step: { command: string; params: Record<string, unknown> }) => unknown = () => undefined, printer?: { nozzle: number; layer: number }) {
  const sent: { commands: { command: string; params: Record<string, unknown> }[]; rollback: boolean }[] = [];
  let volume = 8000;
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (_name, args) => {
      const commands = args.commands as { command: string; params: Record<string, unknown> }[];
      const rollback = args.rollback === true;
      sent.push({ commands, rollback });
      const results = commands.map((step) => {
        if (!rollback && ['solid.hole', 'solid.extrude', 'solid.emboss', 'plastic.lip', 'plastic.boss', 'plastic.snap_fit'].includes(step.command)) volume -= 10;
        const own = answer(step);
        if (own !== undefined) return own;
        return step.command === 'inspect.measure' && !step.params.items ? { bodies: [{ name: 'Plate', volume_mm3: volume }] } : step.command === 'document.inspect' ? { undo: 1, timeline: [], sketches: [] } : {};
      });
      const reply = rollback ? { results: results.slice(0, -1), failed: { index: commands.length - 1, command: 'sketch.inspect', error: 'no sketch' } } : { results };
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(reply) }], ...(rollback ? { isError: true } : {}) });
    },
  };
  const faces: [string, string][] = [];
  const built = (command: string) => sent.filter((batch) => !batch.rollback).flatMap((batch) => batch.commands).filter((step) => step.command === command).map((step) => step.params);
  return { tools: withBlockTool(upstream, (body, face) => faces.push([body, face]), undefined, printer && (() => printer)), sent, faces, built };
}
const said = async (call: Promise<ToolResult>) => String((await call).content[0]?.text);

describe('what a block takes and the sizes it builds (audit BC-03)', () => {
  const at = { body: 'Plate', point: [10, 10, 6] };
  const up = { ...at, normal: [0, 0, 1] };

  it("refuses sizes that do not print on a 0.4 mm nozzle or do not do their work, from the code's own rules and tables (W31, R6)", () => {
    // Two nozzle widths a stroke (printProfiles.ts); a bold stroke is 0.2019 of the capital height, a regular one 0.1356 (measured).
    expect(blockOf({ block: 'text', ...up, text: 'Hi', height: 0.5 })).toBe('height 0.5: the strokes of bold capitals 0.5 mm high are 0.1 mm wide, under the 0.8 mm (two nozzle widths) a stroke needs on a 0.4 mm nozzle; give height 4 or more');
    expect(blockOf({ block: 'text', ...up, text: 'Hi', height: 4 })).toMatchObject({ height: 4 });
    expect(blockOf({ block: 'text', ...up, text: 'Hi', height: 5, bold: false })).toContain('give height 5.9 or more');
    // The default text itself prints: 7 mm capitals left no gap under two lines (N-bloecke-11).
    expect(blockOf({ block: 'text', ...up, text: 'PartBuddy' })).toMatchObject({ height: 7, bold: true });
    expect(blockOf({ block: 'slot', ...up, width: 0.05, length: 0.05 })).toBe('width 0.05: an M3 screw is 3 mm thick and would not pass; the standard is 3.4 mm');
    expect(blockOf({ block: 'nutTrap', ...up, flats: 0.1 })).toBe('flats 0.1: an M3 nut is 5.5 mm across its flats and would not go in; the standard pocket is 5.8');
    expect(blockOf({ block: 'nutTrap', ...up, flats: 6.4 })).toBe('flats 6.4: an M3 nut is 6.35 mm across its corners and would turn in the pocket; give less than that');
    expect(blockOf({ block: 'nutTrap', ...up, depth: 2 })).toBe('depth 2: an M3 nut is 2.4 mm high and would stand out of the pocket; the standard is 2.8');
    expect(blockOf({ block: 'lip', ...at, width: 0.5 })).toBe('width 0.5: a lip narrower than 0.9 mm (two lines on a 0.4 mm nozzle) does not print solid');
    // The arm of 3 mm bent 35.6 % (measured rc.4): the form's own limit, now in the tool too.
    // The material is not known for sure: a strain above PLA's is said, not refused (review of PR #369, S3).
    expect(blockOf({ block: 'snapFit', ...up, length: 3 })).toMatchObject({ length: 3 });
    expect(blockOf({ block: 'snapFit', ...up })).toMatchObject({ length: 12 });
    expect(blockOf({ block: 'snapFit', ...up, thickness: 0.5 })).toContain('thickness 0.5: an arm under 0.9 mm');
    expect(blockOf({ block: 'tappedHole', ...at, size: 'M5', depth: 0.1 })).toBe('depth 0.1: under one layer (0.2 mm) nothing prints');
  });

  it('refuses what a block does not take, a normal of nothing and a block it does not know, and names every block (W30, R28, W32, R48)', () => {
    expect(blockOf({ block: 'screwHole', ...at, depth: 3 })).toBe('screwHole takes no depth; it takes size, head, fit, normal, more, through, name. Leave out what it does not take');
    expect(blockOf({ block: 'nutTrap', ...up, more: [[30, 10, 6]] })).toContain('nutTrap takes no more;');
    expect(blockOf({ block: 'boss', ...at, name: 'Dom' })).toContain('boss takes no name;');
    // A hole goes square into the face: the normal the description says it does not use is no fault.
    expect(blockOf({ block: 'screwHole', ...up })).toMatchObject({ block: 'screwHole' });
    expect(blockOf({ block: 'nutTrap', ...at, normal: [0, 0, 0] })).toBe('nutTrap needs normal: the way out of the face, three numbers, not all zero');
    expect(blockOf({ block: 'gear', ...at })).toBe('block must be one of screwHole, tappedHole, insertSeat, nutTrap, boss, slot, text, lip, snapFit, keyhole, woodScrew, magnet, knob');
    expect(magnetOf({ block: 'magnet', ...up, diameter: 6, height: 2, size: 'M3' })).toContain('magnet takes no size;');
    expect(wallOf({ block: 'woodScrew', ...at, screw: 4, depth: 3 })).toContain('woodScrew takes no depth;');
    expect(knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], shaft: 'd', shaftDiameter: 6, more: [] })).toContain('knob takes no more;');
    expect(wallOf({ block: 'woodScrew', ...at, screw: 4, more: Array.from({ length: 21 }, () => [20, 10, 6]) })).toBe('at most 20 further holes');
  });

  it('builds no magnet, knob or wall screw of a size the user did not give, and says to ask (R15)', () => {
    expect(magnetOf({ block: 'magnet', ...up })).toBe("magnet needs diameter and height: the magnet's, as the user measured them; ask the user with partbuddy_ask if they did not say");
    expect(magnetOf({ block: 'magnet', ...up, diameter: 6 })).toContain('magnet needs diameter and height');
    expect(knobOf({ block: 'knob', body: 'Volume', point: [0, 0, 0], shaft: 'round' })).toBe('knob needs shaft (d, round, knurl) and shaftDiameter, as the user measured them; ask the user with partbuddy_ask if they did not say');
    expect(wallOf({ block: 'keyhole', ...up })).toBe("keyhole needs screw: the wood screw's thread diameter in mm (3.5, 4, 4.5, 5); ask the user with partbuddy_ask if they did not say");
    expect(BLOCK_GUIDANCE).toContain("it needs the magnet's diameter and height, so ask with partbuddy_ask when the user has not said them");
  });

  it('names the features as the model asks, numbering several holes (R38)', () => {
    const row = blockOf({ block: 'screwHole', ...at, more: [[30, 10, 6]], name: 'Befestigung' }) as FeatureBlock;
    expect(named(stepsOf(row), 'Befestigung').map((step) => step.params.name)).toEqual(['Befestigung 1', 'Befestigung 2']);
    const slot = blockOf({ block: 'slot', ...up, name: 'Langloch' }) as FeatureBlock;
    expect(named(stepsOf(slot), 'Langloch').map((step) => step.params.name)).toEqual(['Langloch ✎', undefined, 'Langloch']);
    // Sketch, pocket and hole of a nut trap each have their own name (review of PR #369, K5).
    const trap = blockOf({ block: 'nutTrap', ...up, name: 'Mutter' }) as FeatureBlock;
    expect(named(stepsOf(trap), 'Mutter').map((step) => step.params.name)).toEqual(['Mutter ✎', undefined, 'Mutter', 'Mutter ●']);
    expect(named(stepsOf(row), undefined)).toEqual(stepsOf(row));
    expect((magnetOf({ block: 'magnet', ...up, diameter: 6, height: 2, name: 'Magnet Deckel' }) as { steps: { params: Record<string, unknown> }[] }).steps[0]?.params.name).toBe('Magnet Deckel 1');
    expect((wallOf({ block: 'woodScrew', ...at, screw: 4, name: 'Wandschraube' }) as { steps: { params: Record<string, unknown> }[] }).steps[0]?.params.name).toBe('Wandschraube 1');
  });

  it("says each size the model changed beside its standard, and that a slot's length is centre to centre (R6, T44, N-bloecke-8)", async () => {
    const { tools, built } = plate();
    expect(await said(tools.callTool('partbuddy_block', { block: 'slot', ...up, length: 20, depth: 3, name: 'Langloch' }))).toBe(
      'Built slot on Plate at [10, 10, 6]: size M3, length 20 (standard 10), width 3.4, depth 3, along x. The length is centre to centre, how far the screw can travel: the slot is 23.4 mm long.',
    );
    expect(built('solid.extrude')).toEqual([{ distance: '-3 mm', operation: 'cut', targets: ['Plate'], name: 'Langloch' }]);
    const snap = await said(tools.callTool('partbuddy_block', { block: 'snapFit', ...up, length: 15 }));
    expect(snap).toContain('length 15 (standard 12)');
    expect(snap).toContain('The arm bends 0.89 % at its root as the catch snaps in; printed PLA takes 2 %.');
  });

  it('says why SolidCraft would refuse, before it is asked: a body there is not (N-bloecke-3)', async () => {
    // Measured rc.4: magnet and woodScrew on "Ghost" came back as SolidCraft's raw JSON ("`targets` must list existing bodies").
    for (const args of [{ block: 'magnet', diameter: 6, height: 2 }, { block: 'woodScrew', screw: 4 }])
      expect(await said(plate().tools.callTool('partbuddy_block', { ...up, ...args, body: 'Ghost' }))).toBe('Not built: there is no body named Ghost; the design has Plate');
  });

  it('keeps as print face only what body.print_face answers (W33)', async () => {
    const { tools, faces } = plate((step) => (step.command === 'solid.hole' ? { face: 'F1:+z' } : undefined));
    expect(await said(tools.callTool('partbuddy_block', { block: 'screwHole', ...at }))).toMatch(/^Built screwHole/);
    expect(faces).toEqual([]);
  });

});

type Vec3 = [number, number, number];

describe('a block on the printer in use, on a moved part and on an uneven rim (review of PR 369)', () => {
  const at = { body: 'Plate', point: [10, 10, 6] };
  const up = { ...at, normal: [0, 0, 1] };
  const nozzle = (size: number) => ({ nozzle: size, layer: 0.2 });

  it('checks each size for the nozzle in use: refuses what the model gave below it and raises a standard size to it (S3)', async () => {
    // 0.6 mm: two lines are 1.35 mm; the standard lip of 1.2 is raised, one the model gave is refused.
    expect(blockOf({ block: 'lip', ...at }, nozzle(0.6))).toMatchObject({ width: 1.35 });
    expect(blockOf({ block: 'lip', ...at, width: 1.2 }, nozzle(0.6))).toBe('width 1.2: a lip narrower than 1.35 mm (two lines on a 0.6 mm nozzle) does not print solid');
    expect(blockOf({ block: 'lip', ...at, type: 'groove', width: 1.2 }, nozzle(0.6))).toBe('width 1.2: a groove narrower than 1.35 mm takes no lip that prints solid (two lines on a 0.6 mm nozzle)');
    // 0.8 mm: the snap arm becomes 1.8 thick, the catch 0.82 deep (the narrowest line a slicer lays, thinnestLine), the default
    // text 8 high (strokes of 1.6 mm at the least).
    expect(blockOf({ block: 'snapFit', ...up }, nozzle(0.8))).toMatchObject({ thickness: 1.8, width: 5, catchDepth: 0.82 });
    expect(blockOf({ block: 'snapFit', ...up, thickness: 1.5 }, nozzle(0.8))).toContain('thickness 1.5: an arm under 1.8 mm (two lines on a 0.8 mm nozzle)');
    expect(blockOf({ block: 'text', ...up, text: 'Hi' }, nozzle(0.8))).toMatchObject({ height: 8 });
    expect(blockOf({ block: 'text', ...up, text: 'Hi', height: 7 }, nozzle(0.8))).toContain('height 7: the strokes of bold capitals 7 mm high are 1.41 mm wide, under the 1.6 mm (two nozzle widths) a stroke needs on a 0.8 mm nozzle; give height 8 or more');
    // 0.25 mm: bold text of 3 mm has strokes of 0.61 mm, over the 0.5 it needs.
    expect(blockOf({ block: 'text', ...up, text: 'Hi', height: 3 }, nozzle(0.25))).toMatchObject({ height: 3 });
    expect(blockOf({ block: 'text', ...up, text: 'Hi', height: 3 })).toContain('give height 4 or more');
    // Through the tool: the printer comes from the profile, and the answer says so.
    const fine = plate(undefined, nozzle(0.8));
    // A raised size says why (second review of PR 369, K7); one the model gave names its standard.
    expect(await said(fine.tools.callTool('partbuddy_block', { block: 'snapFit', ...up, length: 15 }))).toContain('length 15 (standard 12), thickness 1.8 (raised from the standard 1.5 for the 0.8 mm nozzle)');
    expect(fine.built('plastic.snap_fit')[0]).toMatchObject({ thickness: '1.8 mm' });
  });

  it("checks the form's blocks by the same limits, and no font whose strokes were not measured (contract test F1)", () => {
    // The blocks the contract tests build through the form print on a 0.4 mm nozzle.
    const form = [
      { block: 'text', body: 'Body1', point: [10, 0, 5], normal: [0, -1, 0], size: 'M3', text: 'PB', height: 4, depth: 0.6, mode: 'deboss', bold: true, font: 'Georgia' },
      { block: 'nutTrap', body: 'Body1', point: [10, 10, 0], normal: [0, 0, -1], size: 'M2', flats: 4.3, depth: 2 },
      { block: 'slot', body: 'Body1', point: [20, 10, 5], normal: [1, 0, 0], size: 'M3', length: 6, width: 3.4, depth: 3, along: 'x' },
      { block: 'lip', body: 'Body1', point: [1.5, 10, 10], size: 'M3', type: 'lip', width: 1.2, height: 2, gap: 0.2 },
      { block: 'snapFit', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', length: 10, thickness: 1.5, width: 5, catchDepth: 0.8, catchLength: 1.5, hook: 'y+' },
      { block: 'text', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', text: 'PB', height: 6, depth: 0.6, mode: 'emboss', bold: false },
    ] as FeatureBlock[];
    // And every other block the contract tests build or try through the form (solidcraft.contract.spec.ts).
    const top = (x: number, y: number) => ({ body: 'Body1', point: [x, y, 10] });
    form.push(
      ...([
        { block: 'tappedHole', ...top(5, 5), size: 'M4', depth: 6, modeled: true, more: [[5, 10, 10]] },
        { block: 'screwHole', ...top(15, 5), size: 'M3', head: 'countersunk', fit: 'normal' },
        { block: 'insertSeat', ...top(5, 15), size: 'M3', diameter: 4, depth: 6.7 },
        { block: 'boss', ...top(15, 15), size: 'M2', diameter: 7.2, height: 6 },
        { block: 'boss', body: 'Body1', point: [10, 10, 5], size: 'M3', diameter: 8, height: 5 },
        { block: 'snapFit', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', length: 9, thickness: 1.5, width: 5, catchDepth: 0.5, catchLength: 1.5, hook: 'y+' },
        { block: 'logo', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', name: 'ring', svg: '', width: 12, depth: 0.6, mode: 'deboss' },
        { block: 'logo', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', name: 'Badge', svg: '', width: 16, depth: 0.6, mode: 'deboss', colours: true },
        { block: 'logo', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', name: 'ring', svg: '', width: 6, depth: 0.6, mode: 'deboss' },
        { block: 'slot', body: 'Flap', point: [64, 15, 4], normal: [0, 0, 1], size: 'M3', length: 10, width: 3.4, depth: null, along: 'x' },
      ] as FeatureBlock[]),
    );
    for (const block of form) expect(printLimit(block, nozzle(0.4)), block.block).toBeNull();
    // The form's snap fit with a catch of 0.3 mm: under one nozzle width (contract test F1, run 43449802254).
    expect(printLimit({ ...(form[4] as FeatureBlock), catchDepth: 0.3 } as FeatureBlock, nozzle(0.4))).toBe('catchDepth 0.3: a catch under 0.42 mm (the narrowest line a slicer lays on a 0.4 mm nozzle) does not print and holds nothing');
    // On the line it holds, just under it not (thinnestLine since #371).
    expect(printLimit({ ...(form[4] as FeatureBlock), catchDepth: 0.42 } as FeatureBlock, nozzle(0.4))).toBeNull();
    expect(printLimit({ ...(form[4] as FeatureBlock), catchDepth: 0.41 } as FeatureBlock, nozzle(0.4))).toContain('a catch under 0.42 mm');
    // Bold capitals of 3 mm in Arial: 0.61 mm strokes; in Georgia not measured, so not refused.
    const ui = { block: 'text', body: 'Body1', point: [10, 0, 5], normal: [0, -1, 0], size: 'M3', text: 'UI', height: 3, depth: 0.6, mode: 'deboss', bold: true } as FeatureBlock;
    expect(printLimit(ui, nozzle(0.4))).toBe('height 3: the strokes of bold capitals 3 mm high are 0.61 mm wide, under the 0.8 mm (two nozzle widths) a stroke needs on a 0.4 mm nozzle; give height 4 or more');
    expect(printLimit({ ...ui, height: 4 } as FeatureBlock, nozzle(0.4))).toBeNull();
    expect(printLimit({ ...ui, font: 'Georgia' } as FeatureBlock, nozzle(0.4))).toBeNull();
    expect(printLimit({ ...ui, font: 'Arial' } as FeatureBlock, nozzle(0.4))).toContain('give height 4 or more');
    // With a 0.8 mm nozzle a lip of 1.2 mm someone gave is refused; the form starts from the standard raised to 1.8, as the
    // assistant does (BlockPanel.tsx; third review of PR 369, S4).
    expect(printLimit(form[3] as FeatureBlock, nozzle(0.8))).toContain('width 1.2: a lip narrower than 1.8 mm');
    expect(raisedBlock(defaultBlock('lip', 'Body1', [1.5, 10, 10], 'M3'), nozzle(0.6))).toMatchObject({ block: { width: 1.35 }, raised: ['width'] });
    expect(raisedBlock(defaultBlock('lip', 'Body1', [1.5, 10, 10], 'M3'), nozzle(0.8)).block).toMatchObject({ width: 1.8 });
    expect(raisedBlock(defaultBlock('snapFit', 'Body1', [10, 10, 10], 'M3', [0, 0, 1]), nozzle(0.8))).toMatchObject({ block: { thickness: 1.8, width: 5, catchDepth: 0.82 }, raised: ['thickness', 'catchDepth'] });
    expect(raisedBlock(defaultBlock('text', 'Body1', [10, 0, 5], 'M3', [0, -1, 0]), nozzle(0.8)).block).toMatchObject({ height: 8 });
    expect(raisedBlock(defaultBlock('text', 'Body1', [10, 0, 5], 'M3', [0, -1, 0]), nozzle(0.4)).raised).toEqual([]);
    // Every standard the form starts from prints once raised, on every nozzle.
    for (const kind of ['lip', 'snapFit', 'text', 'nutTrap', 'slot'] as const)
      for (const size of [0.25, 0.4, 0.6, 0.8]) expect(blockLimit(raisedBlock(defaultBlock(kind, 'Body1', [10, 10, 10], 'M3', [0, 0, 1]), nozzle(size)).block, nozzle(size)), kind + String(size)).toBeNull();
    // A size someone gave stays as given, and is refused.
    expect(raisedBlock(form[3] as FeatureBlock, nozzle(0.8), ['width']).block).toMatchObject({ width: 1.2 });
  });

  it('warns of a snap arm that bends more than PLA takes, and builds it (S3)', async () => {
    const answer = await said(plate().tools.callTool('partbuddy_block', { block: 'snapFit', ...up, length: 4 }));
    expect(answer).toMatch(/^Built snapFit/);
    expect(answer).toContain('Warning: the arm bends 17.04 % at its root as the catch snaps in; printed PLA cracks above 2 % and PETG takes about 3 %.');
  });

  it('builds no block on a part a joint has moved from where it rests, and lets every other joint be (S1)', async () => {
    // As SolidCraft 0.40.1 lists them (2026-11-13): occurrence 5 grounded, a slider limited to [5, 50] rests at 5.
    const listing = { components: [{ id: 0, parent: null, bodies: [] }, { id: 4, parent: 0, bodies: ['Base'], occurrences: [{ id: 5, name: 'Base:1' }] }, { id: 6, parent: 0, bodies: ['Plate'], occurrences: [{ id: 7, name: 'Plate:1' }] }, { id: 8, parent: 0, bodies: ['Other'], occurrences: [{ id: 9, name: 'Other:1' }] }] };
    const rail = (value: number, a = 5, b = 7) => ({ fixed: [0, 5], joints: [{ name: 'Rail', a, b, type: 'slider', values: [{ name: 'distance', value, limits: [5, 50], unit: 'mm' }] }] });
    const scene = (joints: unknown) => plate((step) => (step.command === 'joint.list' ? joints : step.command === 'component.list' ? listing : undefined));
    expect(jointsMoving(rail(12), listing, 'Plate')).toEqual(['"Rail" stands at 12 mm and rests at 5 mm']);
    expect(await said(scene(rail(12)).tools.callTool('partbuddy_block', { block: 'boss', ...at }))).toBe('Not built: Plate stands moved by its joint: "Rail" stands at 12 mm and rests at 5 mm. Drive the joint to where it rests with joint.drive first, so Plate is where it was designed');
    // At its lower limit the slider rests: SolidCraft will not drive it to 0.
    expect(await said(scene(rail(5)).tools.callTool('partbuddy_block', { block: 'boss', ...at }))).toMatch(/^Built boss/);
    // On the grounded side, or between two other parts, the joint does not move Plate.
    expect(jointsMoving(rail(12, 7, 5), { components: [listing.components[0], { ...listing.components[2], occurrences: [{ id: 5, name: 'Plate:1' }] }] }, 'Plate')).toEqual([]);
    expect(await said(scene(rail(12, 5, 9)).tools.callTool('partbuddy_block', { block: 'boss', ...at }))).toMatch(/^Built boss/);
    // A part inside the moved part moves with it: "Tip" in "Flap" (component.list of SolidCraft 0.40.1: an occurrence's
    // parent is the component it sits in; second review of PR 369).
    const nested = {
      components: [
        { id: 0, parent: null, bodies: [] },
        { id: 1, parent: 0, bodies: ['Base'], occurrences: [{ id: 2, name: 'Base:1', parent: 0 }] },
        { id: 4, parent: 0, bodies: ['Flap'], occurrences: [{ id: 5, name: 'Flap:1', parent: 0 }] },
        { id: 7, parent: 4, bodies: ['Tip'], occurrences: [{ id: 8, name: 'Tip:1', parent: 4 }] },
      ],
    };
    const slide = { fixed: [0, 2], joints: [{ name: 'Slide', a: 2, b: 5, values: [{ value: 20, limits: [5, 50], unit: 'mm' }] }] };
    expect(jointsMoving(slide, nested, 'Tip')).toEqual(['"Slide" stands at 20 mm and rests at 5 mm']);
    expect(jointsMoving(slide, nested, 'Base')).toEqual([]);
    // A hinge without limits rests at 0.
    expect(jointsMoving({ fixed: [0], joints: [{ name: 'Lid hinge', a: 5, b: 7, values: [{ value: 30, unit: 'deg' }] }] }, listing, 'Plate')).toEqual(['"Lid hinge" stands at 30° and rests at 0°']);
  });

  it('takes back a piece that stands apart from the body (W34)', async () => {
    const apart = plate((step) => (step.command === 'plastic.boss' ? { warning: 'Boss1: Plate is now in 2 separate pieces' } : undefined));
    expect(await said(apart.tools.callTool('partbuddy_block', { block: 'boss', ...at }))).toContain('Not built: it would stand apart from Plate (SolidCraft: "Boss1: Plate is now in 2 separate pieces"); give a point on a face of Plate');
  });

  /** The top face and edges of a box 60 × 40, 30 high, hollowed from x0 to x1 and y0 to y1, as model.faces and model.edges give them. */
  const rimOf = (x0: number, y0: number, x1: number, y1: number) => {
    const side = (s: [number, number], e: [number, number]) => ({ start: [s[0], s[1], 30], mid: [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2, 30], end: [e[0], e[1], 30] });
    const square = (a: number, b: number, c: number, d: number) => [side([a, b], [c, b]), side([c, b], [c, d]), side([c, d], [a, d]), side([a, d], [a, b])];
    return {
      faces: { faces: [{ plane_normal: [-1, 0, 0], point: [0, 30, 10] }, { plane_normal: [0, 0, 1], point: [57.18, 3.67, 30] }] },
      edges: { edges: [...square(0, 0, 60, 40), ...square(x0, y0, x1, y1), { start: [0, 0, 0], mid: [0, 20, 0], end: [0, 40, 0] }] },
    };
  };

  it('measures the rim at its narrowest, on its edges, and keeps two lines of wall beside a groove everywhere (S2, N-bloecke-5)', async () => {
    // Walls of 1.6 mm on three sides and 6 mm on one: a mean width of 2.49 mm; at its narrowest it is 1.6 (measured 2026-11-13).
    const uneven = rimOf(1.6, 1.6, 54, 38.4);
    expect(rimNarrowest([0.8, 20, 30], uneven.faces, uneven.edges)).toBe(1.6);
    const even = rimOf(2, 2, 58, 38);
    expect(rimNarrowest([1, 20, 30], even.faces, even.edges)).toBe(2);
    // A round rim: a tube 20 mm across with a bore of 16, each edge a closed circle.
    // A round rim: a pot 40 mm across shelled to 2 mm, as SolidCraft 0.40.1 gives it (2026-11-13). Each edge is a closed
    // circle whose seam lies at angle 0 (y = 0) and whose mid misses y = 0 by 1e-14; points on the seam's line once counted it twice.
    const pot = {
      faces: { faces: [{ name: 'F2:side:c1', plane_normal: null, cylinder: { axis: [0, 0, 1], origin: [0, 0, 0], radius: 20 } }, { name: 'F2:top', plane_normal: [0, 0, 1], point: [12.673655681709661, -14.656433146017925, 20] }, { name: 'F3:inner(F2:side:c1)', plane_normal: null, cylinder: { axis: [0, 0, 1], origin: [0, 0, 0], radius: 18 } }] },
      edges: {
        edges: [
          { name: 'F2:side:c1|F2:top', start: [20, 0, 20], mid: [-19.999999999999996, -1.9456412573374646e-14, 20], end: [20, 0, 20] },
          { name: 'F2:top|F3:inner(F2:side:c1)', start: [18, 0, 20], mid: [-17.999999999999996, -2.6098474116521377e-14, 20], end: [18, 0, 20] },
        ],
      },
    };
    for (const at of [[-19, 0, 20], [19, 0, 20], [-13.4, 13.4, 20], [0, 19, 20], [0, -19, 20]] as Vec3[]) expect(rimNarrowest(at, pot.faces, pot.edges)).toBe(2);
    // An ellipse: model.edges gives three points of it, too few to know it, and its face is no cylinder: not measured.
    const oval = {
      faces: { faces: [{ name: 'F12:side:e1', plane_normal: null }, { name: 'F12:top', plane_normal: [0, 0, 1], point: [439.79, 3.8, 20] }, { name: 'F13:inner(F12:side:e1)', plane_normal: null }] },
      edges: { edges: [{ name: 'F12:side:e1|F12:top', start: [480, 20, 20], mid: [420, 19.99999999999997, 20], end: [480, 20, 20] }, { name: 'F12:top|F13:inner(F12:side:e1)', start: [478, 20, 20], mid: [422, 20.00000000000002, 20], end: [478, 20, 20] }] },
    };
    expect(rimNarrowest([421, 20, 20], oval.faces, oval.edges)).toBeUndefined();
    // No inside within the outside (a flat plate's top): not measured.
    expect(rimNarrowest([1, 20, 30], even.faces, { edges: rimOf(2, 2, 58, 38).edges.edges.slice(0, 4) })).toBeUndefined();
    const answer = (rim: ReturnType<typeof rimOf>) => (step: { command: string }) => (step.command === 'model.faces' ? rim.faces : step.command === 'model.edges' ? rim.edges : undefined);
    const thin = plate(answer(uneven));
    expect(await said(thin.tools.callTool('partbuddy_block', { block: 'lip', body: 'Plate', point: [0.8, 20, 30], type: 'groove' }))).toBe(
      'Not built: the rim of Plate is 1.6 mm wide at its narrowest (measured on its edges); a groove 1.4 mm wide (width and gap) leaves 0.2 mm of wall beside it there, under the 0.9 mm of two lines on a 0.4 mm nozzle. Give a narrower width, or make the wall thicker.',
    );
    expect(thin.built('plastic.lip')).toEqual([]);
    expect(await said(plate(answer(rimOf(3, 3, 57, 37))).tools.callTool('partbuddy_block', { block: 'lip', body: 'Plate', point: [1.5, 20, 30], type: 'groove' }))).toContain('The rim is 3 mm wide at its narrowest (measured on its edges): 1.6 mm of wall stay beside the groove there.');
    expect(await said(plate().tools.callTool('partbuddy_block', { block: 'lip', ...at, type: 'groove' }))).toContain('PartBuddy could not measure the rim: check the wall beside the groove yourself.');
  });

  it('runs no trial for embossed text: nothing of it goes into the part', async () => {
    const raised = plate();
    expect(await said(raised.tools.callTool('partbuddy_block', { block: 'text', ...up, text: 'Hi', mode: 'emboss', depth: 1 }))).toMatch(/^Built text on Plate .* Its strokes are about 1.41 mm wide; the gaps between the letters were not measured: the print check shows them.$/);
    expect(raised.sent.some((batch) => batch.rollback)).toBe(false);
  });
});

describe("holes, threads and standard sizes from PartBuddy's tables (audit BC-12)", () => {
  const at = { body: 'Plate', point: [10, 10, 6] };
  const up = { ...at, normal: [0, 0, 1] };

  it('drills every hole by its own table and says its size: clearance, counterbore with bridge layers, thread with room (R7, W21, S-09, S-11)', async () => {
    const tools = plate(undefined, { nozzle: 0.4, layer: 0.12 });
    const hole = await said(tools.tools.callTool('partbuddy_block', { block: 'screwHole', ...at, through: 'body' }));
    expect(hole).toContain("The hole is 3.4 mm (ISO 273 medium, PartBuddy's table): 0.4 mm over the screw, more than the 0.3 mm a printed hole loses at the most, under a counterbore 6.7 mm wide and 3.4 mm deep with two bridge layers of 0.12 mm under its floor");
    expect(tools.built('solid.hole')[0]).toMatchObject({ diameter: '3.4 mm', bridge: '0.12 mm' });
    expect(tools.built('solid.hole')[0]).not.toHaveProperty('clearance');
    const loose = await said(tools.tools.callTool('partbuddy_block', { block: 'screwHole', ...at, size: 'M5', head: 'countersunk', fit: 'loose', through: 'body' }));
    expect(loose).toContain("The hole is 5.8 mm (ISO 273 coarse, PartBuddy's table): 0.8 mm over the screw, more than the 0.3 mm a printed hole loses at the most, under a 90° countersink 11.8 mm wide, in which the head sinks flush.");
    const thread = await said(tools.tools.callTool('partbuddy_block', { block: 'tappedHole', ...at, size: 'M6', depth: 10 }));
    expect(thread).toContain('The thread is M6.3x1: the ISO profile of M6 with 0.3 mm more on every diameter for printing (0.15 mm a side; Sovol and SelfCAD name 0.1 to 0.2), drilled 5.3 mm, its mouth chamfered 0.5 mm at 45°. No such thread has been printed here yet');
    expect(tools.built('solid.hole').at(-1)).toMatchObject({ thread: 'M6.3x1', modeled: true, cs_diameter: '6.3 mm' });
  });

  it('refuses a close hole that loses its room in print, and lets close through from M6 (T31)', () => {
    expect(blockOf({ block: 'screwHole', ...at, size: 'M5', fit: 'close' })).toBe('fit close: the M5 hole of ISO 273 fine is 5.3 mm, 0.3 mm over the 5 mm screw, and a printed hole comes out up to 0.3 mm smaller (the largest hole allowance of the material catalogue), so the screw may not pass; give fit normal (5.5 mm)');
    expect(blockOf({ block: 'screwHole', ...at, size: 'M6', fit: 'close' })).toMatchObject({ fit: 'close', size: 'M6' });
  });

  it('stands a boss straight with a fillet at its foot, and names an M10 nut of the older DIN tables (S-14, MV-09)', async () => {
    const tools = plate();
    expect(await said(tools.tools.callTool('partbuddy_block', { block: 'boss', ...at }))).toContain('diameter 8.5, height 8.7. It stands straight, without draft, with a 1.13 mm fillet at its foot.');
    expect(tools.built('plastic.boss')[0]).toMatchObject({ diameter: '8.5 mm', draft: '0 deg', fillet: '1.13 mm' });
    expect(await said(tools.tools.callTool('partbuddy_block', { block: 'nutTrap', ...up, size: 'M10', depth: 8.8 }))).toContain('ISO 4032 M10 nuts are 16 mm across their flats; the older DIN 934 hex and DIN 562 square nuts are 17 mm and do not go in: for those give flats 17.3.');
    expect(blockOf({ block: 'nutTrap', ...up, size: 'M10', flats: 17.3 })).toMatchObject({ flats: 17.3 });
  });

  it('takes the depth of text from the layers and says what reads less well, built as given (T49, S-19, R36)', async () => {
    expect(blockOf({ block: 'text', ...up, text: 'Hi' }, { nozzle: 0.4, layer: 0.16 })).toMatchObject({ depth: 0.64 });
    const tools = plate(undefined, { nozzle: 0.4, layer: 0.16 });
    const shallow = await said(tools.tools.callTool('partbuddy_block', { block: 'text', ...up, text: 'Hi', mode: 'emboss', depth: 0.4, height: 4 }));
    expect(shallow).toContain('Its strokes are about 0.81 mm wide; the gaps between the letters were not measured: the print check shows them. Text reads well with strokes of 1 mm (Xometry; two lines at the least): capitals 5 mm high give that. 0.4 mm high is under the 0.64 mm text needs to read well (0.5 mm in whole 0.16 mm layers, Xometry); it was built as given.');
    // At the rule's sizes nothing more is said.
    const fine = await said(tools.tools.callTool('partbuddy_block', { block: 'text', ...up, text: 'Hi', mode: 'emboss', height: 5 }));
    expect(fine).toMatch(/Its strokes are about 1.01 mm wide; the gaps between the letters were not measured: the print check shows them.$/);
  });

  it("keeps the printer's least floor under a magnet and says it (H-22)", () => {
    const magnet = { block: 'magnet', body: 'Plate', point: [10, 10, 6], normal: [0, 0, 1], diameter: 6, height: 2 };
    const coarse = magnetOf(magnet, { nozzle: 0.6, layer: 0.3 });
    expect(coarse && typeof coarse !== 'string' && coarse.stock[0]?.depth).toBe(3.05);
    expect(coarse && typeof coarse !== 'string' && coarse.text).toContain('Keep at least 1.2 mm of plastic round a pocket and 1.35 mm under it.');
    const standard = magnetOf(magnet);
    expect(standard && typeof standard !== 'string' && standard.need).toContain('0.9 mm under it (two lines or four layers on a 0.4 mm nozzle)');
  });

  it('gives the keyhole of a 5 mm screw a roof the print check bridges, and the wood screw its countersink to a hundredth (MV-13, N-bloecke-10)', () => {
    const key: KeyholeSpec = { body: 'Plate', point: [20, 0, 80], normal: [0, -1, 0], up: [0, 0, 1], screw: 5, more: [], name: 'Keyhole' };
    const steps = keyholeSteps(key);
    // 11 mm entry: the sides lean in at 30° from upright over 0.87 mm above the pocket, so the roof spans 9.995 mm.
    expect(steps.slice(7).map((step) => step.command)).toEqual(['sketch.create', 'sketch.slot.center_to_center', 'solid.extrude']);
    expect(steps[7]?.params.plane).toMatchObject({ origin: [20, 6.2, 80] });
    expect(steps[9]?.params).toMatchObject({ distance: '0.87 mm', taper: '-30 deg', operation: 'cut' });
    expect(keyholeDepth(5)).toBe(8.27);
    expect(keyholeSteps({ ...key, screw: 4.5 })).toHaveLength(7);
    const text = wallOf({ block: 'keyhole', body: 'Plate', point: [20, 0, 80], normal: [0, -1, 0], screw: 5 });
    expect(text && typeof text !== 'string' && text.text).toContain("the pocket's roof is a bridge of 10 mm, its sides leaning in at 30° from upright over the last 0.87 mm (bridged up to 10 mm, as the print check counts; over 5 mm it may sag a little, Hubs)");
    const wood = wallOf({ block: 'woodScrew', body: 'Plate', point: [20, 8, 30], screw: 4 });
    expect(wood && typeof wood !== 'string' && wood.text).toContain('the plate thicker than the countersink is deep (2.05 mm)');
  });

  it('keeps directions at full precision (T40)', () => {
    const skew = magnetSteps({ body: 'Plate', point: [0, 0, 0], normal: [1, 0.3337, 0], more: [], diameter: 6, height: 2, hold: 'glue', name: 'Magnet' });
    const axis = skew[0]?.params.axis as number[];
    expect(Math.hypot(...axis)).toBeCloseTo(1, 12);
    expect((axis[1] ?? 0) / (axis[0] ?? 1)).toBeCloseTo(-0.3337 / -1, 12);
  });

  it('gives a knob an even number of flutes and a round shaft the plastic its set screw holds in (T46, MV-26)', () => {
    expect([13, 25, 40].map((diameter) => knobFlutes(diameter))).toEqual([8, 12, 18]);
    const knob = { block: 'knob', body: 'Knob', point: [0, 0, 0], shaft: 'round', shaftDiameter: 6 };
    expect(knobOf({ ...knob, diameter: 18 })).toBe('diameter must be 19–80 mm for a round 6 mm shaft: the M3 set screw holds in at least 6 mm of plastic beside the bore (twice its diameter)');
    expect(knobOf({ ...knob, diameter: 19 })).toMatchObject({ body: 'Knob' });
    expect(knobOf({ ...knob, shaft: 'd', diameter: 13 })).toMatchObject({ body: 'Knob' });
  });
});
