import { describe, expect, it } from 'vitest';

import { blockOf, wallOf, withBlockTool } from '../src/main/agents/blockTool';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { describeToolCall } from '../src/shared/stepPhrases';
import { KEYHOLE, WALL, keyholeDepth, keyholeProblem, keyholeSteps, woodScrewSteps, type KeyholeSpec } from '../src/shared/wallMount';

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
        batches.push(commands.map((step) => step.command).join(' '));
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ results: commands.map((step) => (step.command === 'component.list' ? { components: [{ id: 0, parent: null, bodies: [] }, { id: 7, parent: 0, bodies: ['Plate'], occurrences: [{ name: 'Plate:1' }] }] } : {})) }) }] });
      },
    };
    const tools = withBlockTool(upstream);
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['partbuddy_block']);
    const hole = await tools.callTool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: [10, 10, 6], more: [[30, 10, 6]] });
    expect(hole.content[0]).toMatchObject({ text: 'Built 2 × screwHole on Plate at [10, 10, 6]: size M3, head cap, fit normal.' });
    const key = await tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 0, 80], normal: [0, -1, 0] });
    expect(String(key.content[0]?.text)).toContain('Built 1 keyhole slot for 4 mm wood screws in Plate: entry 9 mm for the head, a slot 4.5 mm wide running 8 mm up to where the screw rests, and behind its 2 mm lip a pocket 3.5 mm deep for the head. The part must be at least 6.7 mm thick there.');
    // The holes need no sketch; the keyhole's sketches are drawn with the plate's component active.
    expect(batches).toEqual(['solid.hole solid.hole', 'component.list', 'component.activate solid.cylinder sketch.create sketch.slot.center_to_center solid.extrude sketch.create sketch.slot.center_to_center solid.extrude component.activate']);
    expect(await tools.callTool('partbuddy_block', { block: 'keyhole', body: 'Plate', point: [20, 0, 80] })).toMatchObject({ isError: true, content: [{ text: 'Not built: keyhole needs normal: the way out of the face against the wall, three numbers' }] });
    expect(decide('partbuddy_block', { block: 'screwHole' })).toEqual({ allow: true });
    expect(describeToolCall('partbuddy_block', { block: 'keyhole', screw: 4.5 })).toEqual([{ key: 'keyhole', values: { screw: 4.5 } }]);
    expect(describeToolCall('partbuddy_block', { block: 'woodScrew' })).toEqual([{ key: 'woodScrewHole', values: { screw: 4 } }]);
    expect(describeToolCall('partbuddy_block', { block: 'insertSeat', body: 'Base' })).toEqual([{ key: 'blockByAssistant', values: { block: 'insertSeat', body: 'Base' } }]);
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
