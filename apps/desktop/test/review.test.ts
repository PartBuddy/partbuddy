import { describe, expect, it } from 'vitest';

import type { AgentEvent } from '../src/shared/contract';
import { agentEventSchema } from '../src/shared/contract';
import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { reduce } from '../src/renderer/src/assistant/store';
import { REVIEW_CHECKLIST, REVIEW_PROMPT, REVIEW_TOOL, Review, SAME_STATE } from '../src/main/agents/review';
import { WorkLog, type DesignHistory } from '../src/main/agents/workLog';

/**
 * SolidCraft and PartBuddy's inner tools as far as the review reads them, behind the real work log, which tells the
 * review what changed the design: `solid.*` commands and `set_parameter` add to the history, undo and redo move in it,
 * everything else only reads. `failing` names calls that answer an error and change nothing.
 */
function setup(options: { pictures?: boolean; enabled?: boolean; failing?: string[]; noShots?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const lines: string[] = [];
  const history: DesignHistory = { documentId: 'd', revision: 1, undo: 0, redo: 0 };
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([{ name: 'execute', inputSchema: { type: 'object' } }]),
    callTool: (name, args): Promise<ToolResult> => {
      calls.push({ name, args });
      if (options.failing?.includes(name)) return Promise.resolve({ content: [{ type: 'text', text: 'refused' }], isError: true });
      const command = typeof args.command === 'string' ? args.command : '';
      if (name === 'set_parameter' || command.startsWith('solid.')) Object.assign(history, { revision: history.revision + 1, undo: history.undo + 1, redo: 0 });
      if (name === 'undo') Object.assign(history, { revision: history.revision + 1, undo: history.undo - 1, redo: history.redo + 1 });
      if (name === 'redo') Object.assign(history, { revision: history.revision + 1, undo: history.undo + 1, redo: history.redo - 1 });
      if (name === 'partbuddy_view') return Promise.resolve({ content: [{ type: 'text', text: '{"bodies":[{"name":"Lid"}]}' }, { type: 'text', text: 'check: ready to print' }] });
      if (name === 'screenshot') {
        if (options.noShots) return Promise.reject(new Error('no renderer'));
        return Promise.resolve({ content: [{ type: 'image', data: 'iVBORw0', mimeType: 'image/png' }] });
      }
      return Promise.resolve({ content: [{ type: 'text', text: `${name} ok` }] });
    },
  };
  const events: AgentEvent[] = [];
  const review = new Review((line) => lines.push(line), () => options.pictures ?? false, options.enabled ?? true, (event) => events.push(event));
  const steps = new WorkLog({
    history: () => Promise.resolve({ ...history }),
    travel: () => Promise.resolve(),
    emit: () => undefined,
    changed: (result, _after, name) => {
      review.changed(name);
      return Promise.resolve(result);
    },
  });
  const tools = review.tools(steps.tools(upstream));
  const call = (name: string, args: Record<string, unknown> = {}) => tools.callTool(name, args);
  return { review, tools, call, calls, lines, events };
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
    // Reads through execute: the work log sees the history unchanged (coordinator review, item 1).
    for (const command of ['view.pick', 'view.apply', 'view.list', 'inspect.measure', 'inspect.section']) await call('execute', { command, params: {} });
    expect(review.due()).toBeNull();
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
    expect(calls.filter((entry) => entry.name === 'screenshot').map((entry) => entry.args)).toEqual(['front', 'top', 'iso'].map((view) => ({ view, width: 640, height: 480 })));
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

  it('shows in the chat that it ran with its pictures, the send-back and the end without it', async () => {
    const shown = setup({ pictures: true });
    await shown.call('execute', box);
    shown.review.due();
    await shown.call(REVIEW_TOOL);
    await shown.call(REVIEW_TOOL);
    const src = 'data:image/png;base64,iVBORw0';
    expect(shown.events).toEqual([
      { type: 'review', outcome: 'sentBack', pictures: [] },
      { type: 'review', outcome: 'reviewed', pictures: [{ view: 'front', src }, { view: 'top', src }, { view: 'iso', src }] },
    ]);
    for (const event of shown.events) expect(agentEventSchema.parse(event)).toEqual(event);
    // The chat gets one line per event, in order.
    expect(shown.events.reduce(reduce, []).map((item) => (item.kind === 'review' ? item.outcome : item.kind))).toEqual(['sentBack', 'reviewed']);

    const skipped = setup();
    await skipped.call('execute', box);
    skipped.review.due();
    skipped.review.due();
    expect(skipped.events.map((event) => (event.type === 'review' ? event.outcome : event.type))).toEqual(['sentBack', 'skipped']);
    // Without pictures the line comes alone; without a change nothing shows.
    const words = setup();
    await words.call(REVIEW_TOOL);
    expect(words.events).toEqual([{ type: 'review', outcome: 'reviewed', pictures: [] }]);
    expect(setup().review.due()).toBeNull();
    // Pictures due and none rendered: the line says so.
    const blind = setup({ pictures: true, noShots: true });
    await blind.call(REVIEW_TOOL);
    expect(blind.events).toEqual([{ type: 'review', outcome: 'reviewed', pictures: [], picturesFailed: true }]);
  });

  it('gives the words after a send-back a bubble of their own, with nothing empty between (own loops)', () => {
    const events: AgentEvent[] = [
      { type: 'user', text: 'Make it taller' },
      { type: 'textDelta', text: 'Built it.' },
      { type: 'review', outcome: 'sentBack', pictures: [] },
      { type: 'review', outcome: 'reviewed', pictures: [] },
      { type: 'textDelta', text: 'Reviewed, nothing to fix.' },
    ];
    const label = (item: ReturnType<typeof reduce>[number]) => (item.kind === 'assistant' ? `${item.text}|${item.open ? 'open' : 'closed'}` : item.kind === 'review' ? item.outcome : item.kind);
    // The first bubble closes at the send-back line; the second streams until the turn is done.
    expect(events.reduce(reduce, []).map(label)).toEqual(['user', 'Built it.|closed', 'sentBack', 'reviewed', 'Reviewed, nothing to fix.|open']);
    expect([...events, { type: 'done', ok: true, durationMs: 10, detail: null } as const].reduce(reduce, []).map(label).at(-1)).toBe('Reviewed, nothing to fix.|closed');
  });

  it('does not review the same state twice in a turn', async () => {
    const { call, calls } = setup({ pictures: true });
    await call('execute', box);
    await call(REVIEW_TOOL);
    const shots = calls.length;
    expect(await call(REVIEW_TOOL)).toEqual({ content: [{ type: 'text', text: SAME_STATE }] });
    expect(calls).toHaveLength(shots);
    // A change in between makes a new state, and so do undo and redo.
    await call('set_parameter', { name: 'wall', expression: '3 mm' });
    expect((await call(REVIEW_TOOL)).content.at(-1)).toEqual({ type: 'text', text: REVIEW_CHECKLIST });
    await call('undo');
    expect((await call(REVIEW_TOOL)).content.at(-1)).toEqual({ type: 'text', text: REVIEW_CHECKLIST });
    await call('redo');
    expect((await call(REVIEW_TOOL)).content.at(-1)).toEqual({ type: 'text', text: REVIEW_CHECKLIST });
  });

  it('counts nothing the work log does not see as a change, such as a call that failed', async () => {
    const { review, call } = setup({ failing: ['execute'] });
    await call('execute', box);
    expect(review.due()).toBeNull();
  });

  it('keeps the send-back text free of the words that start scenes of the test double of Claude Code', () => {
    for (const word of ['plan', 'box', 'notes', 'export', 'Research', 'a hinge', 'pressed Go', 'answered your questions', 'Make it fail', 'Compact now']) {
      expect(REVIEW_PROMPT, word).not.toContain(word);
    }
  });
});
