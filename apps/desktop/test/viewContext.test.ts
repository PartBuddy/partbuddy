import { describe, expect, it, vi } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { composeMessage, describeView, VIEW_TOOL, viewDirection, withViewTool } from '../src/main/agents/viewContext';
import { agentMessageSchema, viewStateSchema, type FaceSelection, type ViewState } from '../src/shared/contract';

const top: FaceSelection = { kind: 'face', body: 'Body1', face: 'F1:+z', surface: 'plane', area: 400, point: [10.004, 9.996, 20], normal: [0, 0, 1] };

const state: ViewState = {
  camera: { position: [78, -96, 70], target: [10, 10, 10] },
  selections: [top],
  bodies: [{ name: 'Body1', faces: 6 }],
  sketches: [],
  changes: { faces: 6, sketchCurves: 0 },
};

describe('view context for the assistant', () => {
  it('puts the selected face in front of the message as one short line', () => {
    const { prompt, label } = composeMessage('Round all edges of the marked face', [top]);
    expect(label).toBe('F1:+z · Body1');
    expect(prompt).toMatch(/^\[PartBuddy: the user selected face "F1:\+z" of body "Body1".*picked at 10 10 20 mm\)/);
    expect(prompt.endsWith('\n\nRound all edges of the marked face')).toBe(true);
    // Token budget: the note stays far below a screenshot (about 1,500 tokens).
    expect(prompt.length).toBeLessThan(320);
    expect(composeMessage('hello')).toEqual({ prompt: 'hello' });
  });

  it('names a selected edge or vertex the same way, with SolidCraft\'s edge name', () => {
    const edge = composeMessage('Fillet this edge 1 mm', [{
      kind: 'edge',
      body: 'Body1',
      edge: 'F1:+x|F1:-y',
      exact: true,
      length: 10,
      point: [40, 0, 5.004],
      ends: [
        [40, 0, 0],
        [40, 0, 10],
      ],
    }]);
    expect(edge.label).toBe('F1:+x|F1:-y · Body1');
    expect(edge.prompt).toMatch(/^\[PartBuddy: the user selected edge "F1:\+x\|F1:-y" of body "Body1".*length 10 mm, from 40 0 0 to 40 0 10 mm, picked at 40 0 5 mm\)\. "This edge"/);
    expect(edge.prompt.length).toBeLessThan(360);
    const loop = composeMessage('x', [{ kind: 'edge', body: 'B', edge: 'F2:side#1|F2:top', exact: false, length: 25.13, point: [4, 0, 15], ends: [], radius: 4 }]);
    expect(loop.prompt).toContain('arc on r 4 mm');
    expect(loop.prompt).toContain('more than one edge');
    const vertex = composeMessage('Chamfer here', [{ kind: 'vertex', body: 'Body1', point: [0, 0, 10] }]);
    expect(vertex.label).toBe('vertex 0 0 10 · Body1');
    expect(vertex.prompt).toMatch(/^\[PartBuddy: the user selected the vertex at 0 0 10 mm of body "Body1"/);
    expect(agentMessageSchema.safeParse({ text: 'x', selections: [{ kind: 'vertex', body: 'B', point: [0, 0, Number.NaN] }] }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'x', selections: [] }).success).toBe(false);
  });

  it('lists several selections, numbered, and says "these" means all of them', () => {
    const second: FaceSelection = { ...top, face: 'F1:-z', normal: [0, 0, -1], point: [10, 10, 0] };
    const { prompt, label } = composeMessage('Make these 2 mm apart', [top, second]);
    expect(label).toBe('F1:+z · Body1; F1:-z · Body1');
    const lines = prompt.split('\n');
    expect(lines[0]).toMatch(/selected these 2 elements together; "these" or "the selected ones" means all of them/);
    expect(lines[1]).toMatch(/^1\. \[PartBuddy: the user selected face "F1:\+z"/);
    expect(lines[2]).toMatch(/^2\. \[PartBuddy: the user selected face "F1:-z"/);
    // With several selections no single line claims to be "this face".
    expect(lines[1]).not.toContain('"This face"');
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
    expect(JSON.parse(text)).toMatchObject({ selected: [{ face: 'F1:+z', body: 'Body1' }], camera: { from: 'front-right-top' }, bodies: [{ name: 'Body1', faces: 6 }] });
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
    expect(viewStateSchema.safeParse({ ...state, selections: [{ ...top, point: [Number.NaN, 0, 0] }] }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'hi', selections: [top] }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'hi', selections: [{ ...top, extra: 1 }] }).success).toBe(false);
    expect(agentMessageSchema.safeParse({ text: 'hi', selections: Array.from({ length: 21 }, () => top) }).success).toBe(false);
  });
});
