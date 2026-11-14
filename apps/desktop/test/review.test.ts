import { describe, expect, it } from 'vitest';

import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { REVIEW_CHECKLIST, REVIEW_PROMPT, REVIEW_TOOL, Review, SAME_STATE } from '../src/main/agents/review';

/** SolidCraft and PartBuddy's inner tools as far as the review reads them; `failing` names calls that answer an error. */
function setup(options: { pictures?: boolean; enabled?: boolean; failing?: string[]; noShots?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const lines: string[] = [];
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([{ name: 'execute', inputSchema: { type: 'object' } }]),
    callTool: (name, args): Promise<ToolResult> => {
      calls.push({ name, args });
      if (options.failing?.includes(name)) return Promise.resolve({ content: [{ type: 'text', text: 'refused' }], isError: true });
      if (name === 'partbuddy_view') return Promise.resolve({ content: [{ type: 'text', text: '{"bodies":[{"name":"Lid"}]}' }, { type: 'text', text: 'check: ready to print' }] });
      if (name === 'screenshot') {
        if (options.noShots) return Promise.reject(new Error('no renderer'));
        return Promise.resolve({ content: [{ type: 'image', data: 'iVBORw0', mimeType: 'image/png' }] });
      }
      return Promise.resolve({ content: [{ type: 'text', text: `${name} ok` }] });
    },
  };
  const review = new Review((line) => lines.push(line), () => options.pictures ?? false, options.enabled ?? true);
  const tools = review.tools(upstream);
  const call = (name: string, args: Record<string, unknown> = {}) => tools.callTool(name, args);
  return { review, tools, call, calls, lines };
}

const box = { command: 'solid.box', params: { length: 20, width: 20, height: 10 } };

describe('the review before "done"', () => {
  it('offers partbuddy_review besides the other tools', async () => {
    const { tools } = setup();
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual(['execute', REVIEW_TOOL]);
  });

  it('sends a changing turn without the review back once, then lets it end and logs it', async () => {
    const { review, call, lines } = setup();
    await call('execute', box);
    expect(review.due()).toBe(REVIEW_PROMPT);
    expect(review.due()).toBeNull();
    expect(review.due()).toBeNull();
    expect(lines).toEqual([
      'the assistant ended a changing turn without partbuddy_review; it is sent back once',
      'the assistant ended a changing turn without partbuddy_review although it was sent back once; the turn ends without it',
    ]);
  });

  it('lets a turn end that reviewed after its last change, and not one that changed again after the review', async () => {
    const { review, call } = setup();
    await call('execute', box);
    await call(REVIEW_TOOL);
    expect(review.due()).toBeNull();
    await call('execute', box);
    expect(review.due()).toBe(REVIEW_PROMPT);
  });

  it('asks nothing for questions, reads, refused calls, undo, redo or a single parameter change', async () => {
    const { review, call } = setup({ failing: ['batch'] });
    await call('inspect_design');
    await call('execute', { command: 'parameters.list' });
    await call('batch', { commands: [box] });
    await call('undo');
    await call('redo');
    await call('set_parameter', { name: 'wall', expression: '3 mm' });
    expect(review.due()).toBeNull();
    // A second parameter is no longer the cheap path.
    await call('set_parameter', { name: 'height', expression: '30 mm' });
    expect(review.due()).toBe(REVIEW_PROMPT);
  });

  it('lets a turn end that shows a question or a plan after its change: the user answers first', async () => {
    const { review, call } = setup();
    await call('execute', box);
    await call('partbuddy_plan', { summary: 'A lid', steps: ['Lid'] });
    expect(review.due()).toBeNull();
  });

  it('starts every user message afresh, and does nothing when turned off', async () => {
    const { review, call } = setup();
    await call('execute', box);
    review.newTurn();
    expect(review.due()).toBeNull();
    const off = setup({ enabled: false });
    await off.call('execute', box);
    expect(off.review.due()).toBeNull();
  });

  it('answers the view and its check, three pictures where the route shows them, and the checklist', async () => {
    const { call, calls } = setup({ pictures: true });
    const answer = await call(REVIEW_TOOL);
    expect(calls.filter((entry) => entry.name === 'screenshot').map((entry) => entry.args.view)).toEqual(['front', 'top', 'iso']);
    expect(answer.content.map((part) => part.type)).toEqual(['text', 'text', 'text', 'image', 'text', 'image', 'text', 'image', 'text']);
    expect(answer.content[1]).toEqual({ type: 'text', text: 'check: ready to print' });
    expect(answer.content.at(-1)).toEqual({ type: 'text', text: REVIEW_CHECKLIST });
    expect(REVIEW_CHECKLIST).toMatch(/Function and fit[\s\S]*Strength[\s\S]*Looks[\s\S]*Print time and material/);
  });

  it('answers in words alone on a route without pictures, and when the pictures cannot be rendered', async () => {
    const words = setup();
    expect((await words.call(REVIEW_TOOL)).content.map((part) => part.type)).toEqual(['text', 'text', 'text']);
    expect(words.calls.some((entry) => entry.name === 'screenshot')).toBe(false);
    const blind = setup({ pictures: true, noShots: true });
    const answer = await blind.call(REVIEW_TOOL);
    expect(answer.content.filter((part) => part.type === 'image')).toEqual([]);
    expect(JSON.stringify(answer.content)).toContain('the iso picture could not be rendered');
    expect(blind.lines).toContain(`${REVIEW_TOOL}: no front picture: no renderer`);
  });

  it('does not review the same state twice in a turn', async () => {
    const { call, calls } = setup({ pictures: true });
    await call('execute', box);
    await call(REVIEW_TOOL);
    const shots = calls.length;
    expect(await call(REVIEW_TOOL)).toEqual({ content: [{ type: 'text', text: SAME_STATE }] });
    expect(calls).toHaveLength(shots);
    // A change in between makes a new state.
    await call('set_parameter', { name: 'wall', expression: '3 mm' });
    expect((await call(REVIEW_TOOL)).content.at(-1)).toEqual({ type: 'text', text: REVIEW_CHECKLIST });
  });

  it('keeps the send-back text free of the words that start scenes of the test double of Claude Code', () => {
    for (const word of ['plan', 'box', 'notes', 'export', 'Research', 'a hinge', 'pressed Go', 'answered your questions', 'Make it fail', 'Compact now']) {
      expect(REVIEW_PROMPT, word).not.toContain(word);
    }
  });
});
