import { describe, expect, it, vi } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { composeMessage, describeView, VIEW_TOOL, viewDirection, withViewTool } from '../src/main/agents/viewContext';
import { agentMessageSchema, viewStateSchema, type FaceSelection, type ViewState } from '../src/shared/contract';

const top: FaceSelection = { body: 'Body1', face: 'F1:+z', surface: 'plane', area: 400, point: [10.004, 9.996, 20], normal: [0, 0, 1] };

const state: ViewState = {
  camera: { position: [78, -96, 70], target: [10, 10, 10] },
  selection: top,
  bodies: [{ name: 'Body1', faces: 6 }],
  sketches: [],
  changes: { faces: 6, sketchCurves: 0 },
};

describe('view context for the assistant', () => {
  it('puts the selected face in front of the message as one short line', () => {
    const { prompt, label } = composeMessage('Round all edges of the marked face', top);
    expect(label).toBe('F1:+z · Body1');
    expect(prompt).toMatch(/^\[PartBuddy: the user selected face "F1:\+z" of body "Body1".*picked at 10 10 20 mm\)/);
    expect(prompt.endsWith('\n\nRound all edges of the marked face')).toBe(true);
    // Token budget: the note stays far below a screenshot (about 1,500 tokens).
    expect(prompt.length).toBeLessThan(320);
    expect(composeMessage('hello')).toEqual({ prompt: 'hello' });
  });

  it('names the camera direction in words (Z up, front is -Y)', () => {
    expect(viewDirection([78, -96, 70], [0, 0, 0])).toBe('front-right-top');
    expect(viewDirection([0, 0, 100], [0, 0, 0])).toBe('top');
    expect(viewDirection([0, 50, 0], [0, 0, 0])).toBe('back');
    expect(viewDirection([1, 1, 1], [1, 1, 1])).toBe('unknown');
  });

  it('answers partbuddy_view itself, in compact text, and passes other tools through', async () => {
    const callTool = vi.fn(() => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }));
    const upstream: UpstreamTools = {
      instructions: () => 'SolidCraft',
      listTools: () => Promise.resolve([{ name: 'measure', inputSchema: { type: 'object' } }]),
      callTool,
    };
    const tools = withViewTool(upstream, () => state);
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['measure', VIEW_TOOL]);
    const result = await tools.callTool(VIEW_TOOL, {});
    expect(callTool).not.toHaveBeenCalled();
    const text = String(result.content[0]?.text);
    expect(JSON.parse(text)).toMatchObject({ selected: { face: 'F1:+z', body: 'Body1' }, camera: { from: 'front-right-top' }, bodies: [{ name: 'Body1', faces: 6 }] });
    expect(text.length).toBeLessThan(500);
    await tools.callTool('measure', {});
    expect(callTool).toHaveBeenCalledWith('measure', {});
    expect(describeView(null)).toContain('no design');
  });

  it('is allowed by the tool policy', () => {
    expect(decide(VIEW_TOOL, {})).toEqual({ allow: true });
  });

  it('validates what the renderer sends', () => {
    expect(viewStateSchema.safeParse(state).success).toBe(true);
    expect(viewStateSchema.safeParse({ ...state, selection: { ...top, point: [Number.NaN, 0, 0] } }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'hi', selection: top }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'hi', selection: { ...top, extra: 1 } }).success).toBe(false);
  });
});
