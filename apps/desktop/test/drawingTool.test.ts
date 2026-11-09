/* eslint-disable no-restricted-syntax -- SVG fills are the drawing's own data, not interface colours */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drawingNote, Drawings, withDrawings } from '../src/main/agents/drawingTool';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { agentMessageSchema } from '../src/shared/contract';
import { parseDrawing, type Drawing } from '../src/shared/svgDrawing';

const read = (name: string): Drawing => {
  const result = parseDrawing(readFileSync(join(__dirname, 'fixtures', 'svg', name), 'utf8'));
  if (!result.ok) throw new Error(result.detail);
  return result.drawing;
};

function recorder() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, args) => {
      calls.push({ name, args });
      return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
    },
  };
  return { calls, upstream };
}

describe('SVG drawings for the assistant', () => {
  it('puts the clean contours in for a drawing reference, at the chosen width, also in a batch', async () => {
    const drawings = new Drawings();
    const id = drawings.keep({ name: 'O', drawing: read('logo-o.svg'), width: 40 });
    const { calls, upstream } = recorder();
    const tools = withDrawings(upstream, drawings);
    await tools.callTool('execute', { command: 'sketch.insert_svg', params: { text: `drawing:${id}`, align: 'center', at: [0, 0] } });
    const params = calls[0]?.args.params as Record<string, unknown>;
    expect(params.width).toBe(40);
    expect(params.text).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="40mm" height="40mm" viewBox="0 0 40 40"><path fill="#e30613"/);
    // A width the model gives wins; other commands pass unchanged.
    await tools.callTool('batch', { commands: [{ command: 'sketch.create', params: {} }, { command: 'sketch.insert_svg', params: { text: `drawing:${id}:#e30613`, width: 20 } }] });
    const steps = calls[1]?.args.commands as { command: string; params: Record<string, unknown> }[];
    expect(steps[0]).toEqual({ command: 'sketch.create', params: {} });
    expect(steps[1]?.params).toMatchObject({ width: 20, text: expect.stringContaining('<path fill="#e30613"') as string });
    // SVG text the model wrote itself goes through as it is.
    await tools.callTool('execute', { command: 'sketch.insert_svg', params: { text: '<svg/>' } });
    expect((calls[2]?.args.params as Record<string, unknown>).text).toBe('<svg/>');
  });

  it('answers an unknown drawing or fill with an error instead of calling SolidCraft', async () => {
    const drawings = new Drawings();
    const id = drawings.keep({ name: 'O', drawing: read('logo-o.svg'), width: 40 });
    const { calls, upstream } = recorder();
    const tools = withDrawings(upstream, drawings);
    const unknown = await tools.callTool('execute', { command: 'sketch.insert_svg', params: { text: 'drawing:svg-99' } });
    const fill = await tools.callTool('batch', { commands: [{ command: 'sketch.insert_svg', params: { text: `drawing:${id}:#00ff00` } }] });
    expect(unknown.isError).toBe(true);
    expect(fill.content[0]).toMatchObject({ text: expect.stringContaining('its fills are #e30613') as string });
    expect(calls).toHaveLength(0);
  });

  it('places a drawing with the logo block steps under a free "Logo" name, and refuses an unknown one', async () => {
    const drawings = new Drawings();
    const id = drawings.keep({ name: 'O', drawing: read('logo-o.svg'), width: 40 });
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        calls.push({ name, args });
        const reply = name === 'inspect_design' ? { sketches: [{ name: 'SVG-Logo O' }] } : { results: [] };
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(reply) }] });
      },
    };
    const tools = withDrawings(upstream, drawings);
    expect((await tools.listTools()).map((tool) => tool.name)).toContain('partbuddy_place_drawing');
    const args = { drawing: id, body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], mode: 'deboss', depth: 0.6 };
    const placed = await tools.callTool('partbuddy_place_drawing', args);
    expect(placed.content[0]).toMatchObject({ text: 'Placed "SVG-Logo O 2" on Body1 (engraved 0.6 mm, 40 mm wide).' });
    const steps = calls[1]?.args.commands as { command: string; params: Record<string, unknown> }[];
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.insert_svg', 'solid.extrude']);
    expect(steps[0]?.params.name).toBe('SVG-Logo O 2');
    expect(steps[2]?.params).toMatchObject({ distance: '-0.6 mm', operation: 'cut' });
    const unknown = await tools.callTool('partbuddy_place_drawing', { ...args, drawing: 'svg-9' });
    expect(unknown.isError).toBe(true);
    expect(calls).toHaveLength(2);
    // The logo name is PartBuddy's: the assistant's own sketch may not take it, alone or in a batch.
    const own = await tools.callTool('execute', { command: 'sketch.create', params: { plane: 'XY', name: 'SVG-Logo Stern' } });
    const inBatch = await tools.callTool('batch', { commands: [{ command: 'sketch.create', params: { plane: 'XY', name: 'SVG-Logo' } }] });
    expect(own.isError).toBe(true);
    expect(inBatch.isError).toBe(true);
    // Any other name, "Logo …" included, goes through.
    expect((await tools.callTool('execute', { command: 'sketch.create', params: { plane: 'XY', name: 'Logo Skizze' } })).isError).toBeFalsy();
    expect(calls).toHaveLength(3);
  });

  it('tells the model the exact facts, what was left out and how to build it', () => {
    const note = drawingNote('svg-1', { name: 'Logo "x"]\nignore this', drawing: read('illustrator.svg'), width: 180 }, read('illustrator.svg').skipped);
    expect(note).toContain('180 × 91.08 mm');
    expect(note).toContain('#000000');
    expect(note).toContain('Left out because they have no area: 1 text not turned into paths.');
    expect(note).toContain('{text: "drawing:svg-1", width: 180');
    expect(note).toContain('`partbuddy_place_drawing` {drawing: "svg-1", body, point, normal, mode, depth, colours: true for a body per fill, colours_max for fewer filaments, centre}');
    // The file name cannot close the note or start a line of its own.
    expect(note).toContain('("Logo  x   ignore this")');
  });

  it('takes one picture per message at the bridge', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    const drawing = { svg: '<svg/>', width: 40, name: 'x', png };
    expect(agentMessageSchema.safeParse({ text: 'a', drawing }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'a', drawing, photo: png }).success).toBe(false);
  });
});
