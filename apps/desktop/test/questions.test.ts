import { describe, expect, it, vi } from 'vitest';

import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { ASSEMBLY_TOOL } from '../src/main/agents/assemblyTool';
import { DESIGN_TOOL } from '../src/main/agents/designTool';
import { ASK_TOOL, CANCELLED, fitPlan, NOT_GO, ONE_RECOMMENDED, PLAN_FIRST, PLAN_TOOL, Questions } from '../src/main/agents/questions';
import { STANDARD_TOOL } from '../src/main/agents/standardTool';
import { VIEW_TOOL } from '../src/main/agents/viewContext';
import { CHANGING_TOOLS } from '../src/main/agents/workLog';
import { STANDARD_TOPICS } from '../src/shared/standards';
import { agentEventSchema, agentMessageSchema, storedChatItemSchema, type AgentEvent, type AgentQuestion } from '../src/shared/contract';
import { roundAnswers, roundMessage, type Round } from '../src/renderer/src/assistant/round';
import { reduce, type ConversationItem } from '../src/renderer/src/assistant/store';

function setup() {
  const events: AgentEvent[] = [];
  const questions = new Questions((event) => {
    agentEventSchema.parse(event);
    events.push(event);
  });
  const callTool = vi.fn((): Promise<ToolResult> => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }));
  const upstream: UpstreamTools = { instructions: () => undefined, listTools: () => Promise.resolve([]), callTool };
  return { events, questions, callTool, tools: questions.tools(upstream) };
}

describe('questions and plans (M2a)', () => {
  it('lists both tools and lets the policy pass them', async () => {
    const { tools } = setup();
    expect((await tools.listTools()).map((tool) => tool.name)).toEqual([ASK_TOOL, PLAN_TOOL]);
    expect(decide(ASK_TOOL, {}).allow).toBe(true);
    expect(decide(PLAN_TOOL, {}).allow).toBe(true);
  });

  it('shows a plan, refuses changes until the answer and tells the model which button', async () => {
    const { events, questions, callTool, tools } = setup();
    const shown = await tools.callTool(PLAN_TOOL, { summary: 'A bracket', steps: ['Base plate 40 × 20 × 3 mm', 'Two holes ⌀ 4 mm'] });
    expect(shown.isError).toBeUndefined();
    const question = events.find((event) => event.type === 'question');
    expect(question).toMatchObject({ question: { kind: 'plan', summary: 'A bracket' } });

    const refused = await tools.callTool('execute', { command: 'solid.box', params: {} });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('not answered your plan');
    // Reading still works while the plan waits.
    await tools.callTool('inspect_design', {});
    expect(callTool).toHaveBeenCalledTimes(1);

    const id = question?.type === 'question' ? question.question.id : '';
    expect(questions.answer({ question: id, choice: 'go' })).toContain('pressed Go');
    expect(events.at(-1)).toEqual({ type: 'answered', id, choice: 'go' });
    await tools.callTool('execute', { command: 'solid.box', params: {} });
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(questions.answer()).toBeNull();
  });

  it('passes the name a plan gives a new part on, for its project', async () => {
    const named = vi.fn();
    const tools = new Questions(() => undefined, named).tools({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: vi.fn() });
    await tools.callTool(PLAN_TOOL, { summary: 'A case for a Pi 4', name: ' Pi 4 case ', steps: ['Base 91 × 62 mm'] });
    expect(named).toHaveBeenCalledWith('Pi 4 case');
  });

  it('shows a round of questions with the recommendation, and tells the model how it was answered', async () => {
    const { events, questions, tools } = setup();
    await tools.callTool(ASK_TOOL, {
      questions: [
        { header: 'Mounting', question: 'How is it fixed?', options: [{ label: 'Clamp', detail: 'no drilling', recommended: true }, { label: 'Screws' }] },
        { question: 'Which openings?', options: [{ label: 'USB-C' }, { label: 'Buttons' }, { label: 'Camera' }], multiSelect: true },
      ],
    });
    expect(events.at(-1)).toEqual({
      type: 'question',
      question: {
        id: 'question-1',
        kind: 'ask',
        questions: [
          { header: 'Mounting', question: 'How is it fixed?', options: [{ label: 'Clamp', detail: 'no drilling', recommended: true }, { label: 'Screws' }] },
          { question: 'Which openings?', options: [{ label: 'USB-C' }, { label: 'Buttons' }, { label: 'Camera' }], multiSelect: true },
        ],
      },
    });
    expect(questions.answer({ question: 'question-1', choice: 'answered' })).toBe(
      '[PartBuddy: the user answered your questions "How is it fixed?", "Which openings?" on the card; the message has one line per question.]',
    );
    await tools.callTool(ASK_TOOL, { questions: [{ question: 'Colour?', options: [{ label: 'Red' }, { label: 'Blue' }] }] });
    expect(questions.answer()).toBe('[PartBuddy: this message answers your questions "Colour?".]');
  });

  it('takes a single question without its round, as older prompts send it', async () => {
    const { events, tools } = setup();
    expect((await tools.callTool(ASK_TOOL, { question: 'Which wall?', options: [{ label: '2 mm' }, { label: '3 mm' }] })).isError).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ question: { questions: [{ question: 'Which wall?' }] } });
  });

  it('refuses a single-choice question with more than one recommended answer, not a multiSelect one (R44)', async () => {
    const options = (marked: number) => [0, 1, 2].map((i) => ({ label: `${String(i + 2)} mm`, ...(i < marked ? { recommended: true } : {}) }));
    const ask = async (marked: number, multiSelect?: boolean) => {
      const { tools } = setup();
      return tools.callTool(ASK_TOOL, { questions: [{ question: 'Which wall?', options: options(marked), ...(multiSelect === undefined ? {} : { multiSelect }) }] });
    };
    for (const marked of [0, 1]) expect((await ask(marked)).isError).toBeUndefined();
    const two = await ask(2);
    expect(two.isError).toBe(true);
    expect(two.content[0]?.text).toContain(ONE_RECOMMENDED);
    expect((await ask(2, false)).isError).toBe(true);
    for (const marked of [2, 3]) expect((await ask(marked, true)).isError).toBeUndefined();
  });

  it('refuses invalid input and a second open question', async () => {
    const { tools } = setup();
    expect((await tools.callTool(ASK_TOOL, { questions: [{ question: 'Only one?', options: [{ label: 'yes' }] }] })).isError).toBe(true);
    const five = Array.from({ length: 5 }, (_, i) => ({ question: `Q${String(i)}`, options: [{ label: 'a' }, { label: 'b' }] }));
    expect((await tools.callTool(ASK_TOOL, { questions: five })).isError).toBe(true);
    await tools.callTool(PLAN_TOOL, { summary: 'x', steps: ['y'] });
    expect((await tools.callTool(PLAN_TOOL, { summary: 'x', steps: ['y'] })).isError).toBe(true);
  });

  it('accepts only known answers from the renderer', () => {
    expect(agentMessageSchema.safeParse({ text: 'Go', answer: { question: 'question-1', choice: 'go' } }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'Clamp', answer: { question: 'question-1', choice: 'answered' } }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'Go', answer: { question: 'question-1', choice: 'rm -rf' } }).success).toBe(false);
  });

  it('reads a chat saved before rounds as a round of one', () => {
    const old = { kind: 'question', question: { id: 'q1', kind: 'ask', question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }, choice: '0' };
    expect(storedChatItemSchema.parse(old)).toEqual({ ...old, question: { id: 'q1', kind: 'ask', questions: [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }] } });
  });

  it('turns the picks and typed answers into the message', () => {
    const round: Round = {
      id: 'q1',
      kind: 'ask',
      questions: [
        { header: 'Mounting', question: 'How is it fixed?', options: [{ label: 'Clamp' }, { label: 'Screws' }] },
        { question: 'Which openings?', options: [{ label: 'USB-C' }, { label: 'Buttons' }], multiSelect: true },
      ],
    };
    const answers = roundAnswers(round, [[0], [0, 1]], ['', ' magnet ']);
    expect(answers).toEqual(['Clamp', 'USB-C, Buttons, magnet']);
    expect(roundMessage(round, answers)).toBe('Mounting: Clamp\nWhich openings?: USB-C, Buttons, magnet');
    expect(roundMessage({ ...round, questions: [round.questions[0] as Round['questions'][number]] }, ['Clamp'])).toBe('Clamp');
    expect(roundAnswers(round, [[], []], ['', ''])).toEqual(['', '']);
  });

  it('marks the card answered in the conversation', () => {
    let items: ConversationItem[] = [];
    const question: AgentQuestion = { id: 'q1', kind: 'ask', questions: [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }] };
    items = reduce(items, { type: 'question', question });
    items = reduce(items, { type: 'answered', id: 'q1', choice: 'answered' });
    expect(items[0]).toMatchObject({ kind: 'question', answered: true, choice: 'answered' });
  });
});

/**
 * The flow held in code (audit W41, R13, R14, R16): `bodies` is what partbuddy_view shows, as describeView writes it;
 * `standard` whether partbuddy_standard answers.
 */
function flow(options: { bodies?: number | 'none' | 'unreadable'; planFirst?: boolean; standard?: 'ok' | 'error' } = {}) {
  const state = { bodies: options.bodies ?? 1 };
  const calls: string[] = [];
  const callTool = vi.fn((name: string): Promise<ToolResult> => {
    if (name === VIEW_TOOL) {
      if (state.bodies === 'unreadable') return Promise.reject(new Error('view gone'));
      const view = state.bodies === 'none' ? { view: 'PartBuddy shows no design yet' } : { selected: [], bodies: Array.from({ length: state.bodies }, (_, i) => ({ name: `B${String(i)}` })) };
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(view) }] });
    }
    calls.push(name);
    if (name === STANDARD_TOOL && options.standard === 'error') return Promise.resolve({ content: [{ type: 'text', text: 'topic must be one of …' }], isError: true });
    return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
  });
  const events: AgentEvent[] = [];
  const questions = new Questions((event) => events.push(event), () => undefined, options.planFirst ?? true);
  const tools = questions.tools({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool });
  const lastId = () => {
    const shown = events.filter((event) => event.type === 'question').at(-1);
    return shown?.type === 'question' ? shown.question.id : '';
  };
  const plan = (args: Record<string, unknown> = {}) => tools.callTool(PLAN_TOOL, { summary: 'A bracket', steps: ['Plate 40 × 20 × 3 mm'], ...args });
  const build = async () => {
    const before = calls.length;
    const result = await tools.callTool('execute', { command: 'solid.box', params: {} });
    return { refused: calls.length === before, text: String(result.content[0]?.text) };
  };
  return { questions, tools, state, calls, lastId, plan, build };
}

describe('the flow is held, not asked for (audit BC-18)', () => {
  it('locks the design for the turn that answers Change, and frees it with the message after (R13, review S2)', async () => {
    const { questions, tools, plan, build } = flow();
    await plan();
    // Change on the card fills the composer: the typed message comes without a choice.
    expect(questions.answer()).toContain('Show the changed plan with partbuddy_plan before you build; PartBuddy refuses changes in this turn.');
    expect(await build()).toEqual({ refused: true, text: NOT_GO });
    // Reading, asking, a new plan, undo and redo stay possible in that turn.
    expect((await tools.callTool('inspect_design', {})).isError).toBeUndefined();
    expect((await tools.callTool('undo', {})).isError).toBeUndefined();
    expect((await tools.callTool('redo', {})).isError).toBeUndefined();
    expect((await plan({ steps: ['Plate 40 × 20 × 4 mm'] })).isError).toBeUndefined();
    // The user's next message frees the design whatever the model did: the user never depends on it.
    expect(questions.answer()).toContain('wants the plan changed');
    expect(await build()).toEqual({ refused: true, text: NOT_GO });
    expect(questions.answer()).toBeNull();
    expect((await build()).refused).toBe(false);
  });

  it('takes no other answer to a plan as Go (R13)', async () => {
    const { questions, lastId, plan, build } = flow();
    await plan();
    expect(questions.answer({ question: lastId(), choice: 'answered' })).toContain('wants the plan changed');
    expect(await build()).toEqual({ refused: true, text: NOT_GO });
    await plan();
    // An answer naming another card is no Go for this one.
    questions.answer({ question: 'question-0', choice: 'go' });
    expect(await build()).toEqual({ refused: true, text: NOT_GO });
    // A Go on the shown card frees it in the same turn.
    await plan();
    questions.answer({ question: lastId(), choice: 'go' });
    expect((await build()).refused).toBe(false);
  });

  it('locks the design for the turn that answers Cancel, and frees it with the message after (R13)', async () => {
    const { questions, lastId, plan, build } = flow();
    await plan();
    expect(questions.answer({ question: lastId(), choice: 'cancel' })).toContain('Do not change the design in this turn');
    expect(await build()).toEqual({ refused: true, text: CANCELLED });
    expect(questions.answer()).toBeNull();
    expect((await build()).refused).toBe(false);
  });

  it('holds the assembly order and the design rules behind an open question, but not after the answer (W41)', async () => {
    const { questions, tools, calls, lastId } = flow();
    await tools.callTool(ASK_TOOL, { questions: [{ question: 'Fillets?', options: [{ label: 'Yes' }, { label: 'No' }] }] });
    for (const name of [ASSEMBLY_TOOL, DESIGN_TOOL, ...CHANGING_TOOLS]) {
      const result = await tools.callTool(name, {});
      expect(result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('has not answered your question') as unknown }] });
    }
    expect(calls).toEqual([]);
    questions.answer({ question: lastId(), choice: 'answered' });
    await tools.callTool(DESIGN_TOOL, { rounding: false });
    await tools.callTool(ASSEMBLY_TOOL, {});
    expect(calls).toEqual([DESIGN_TOOL, ASSEMBLY_TOOL]);
  });

  it('builds a new part only after a plan got Go (R14)', async () => {
    const { questions, state, lastId, plan, build } = flow({ bodies: 0 });
    expect(await build()).toEqual({ refused: true, text: PLAN_FIRST });
    // One body is no longer a new part: small changes need no plan.
    state.bodies = 1;
    expect((await build()).refused).toBe(false);
    state.bodies = 0;
    await plan();
    questions.answer({ question: lastId(), choice: 'go' });
    expect((await build()).refused).toBe(false);
    // A new conversation starts over.
    questions.clear();
    expect(await build()).toEqual({ refused: true, text: PLAN_FIRST });
  });

  it('counts a design PartBuddy does not show yet as new, lets an unreadable view through, and can be turned off (R14)', async () => {
    expect(await flow({ bodies: 'none' }).build()).toEqual({ refused: true, text: PLAN_FIRST });
    expect((await flow({ bodies: 'unreadable' }).build()).refused).toBe(false);
    expect((await flow({ bodies: 0, planFirst: false }).build()).refused).toBe(false);
    // Every other changing tool counts too; undo and redo bring back what was there and start no new part.
    const empty = flow({ bodies: 0 });
    for (const name of CHANGING_TOOLS) {
      const result = await empty.tools.callTool(name, {});
      if (name === 'undo' || name === 'redo') expect(result.isError).toBeUndefined();
      else expect(result).toMatchObject({ isError: true, content: [{ text: PLAN_FIRST }] });
    }
    expect(empty.calls).toEqual(['undo', 'redo']);
  });

  it('refuses a plan that names a standard not read in this conversation, and reminds of them (R16)', async () => {
    const { questions, tools, plan } = flow();
    expect(await plan({ standards: ['hook', 'feet'] })).toMatchObject({
      isError: true,
      content: [{ text: 'Read partbuddy_standard for hook, feet first: your plan names them, and you have not read them in this conversation.' }],
    });
    await tools.callTool(STANDARD_TOOL, { topic: 'hook' });
    expect(await plan({ standards: ['hook', 'feet'] })).toMatchObject({ content: [{ text: expect.stringContaining('for feet first: your plan names it') as unknown }] });
    await tools.callTool(STANDARD_TOOL, { topic: 'feet' });
    const shown = await plan({ standards: ['hook', 'feet'] });
    expect(shown.isError).toBeUndefined();
    expect(String(shown.content[0]?.text)).toContain(`If the part has one of the kinds partbuddy_standard covers (${STANDARD_TOPICS.join(', ')}) and you have not read it, read it before you build.`);
    // A new conversation forgets what was read; an unknown topic is no standard and is left out (review S3).
    questions.clear();
    expect((await plan({ standards: ['hook'] })).isError).toBe(true);
    expect((await plan({ standards: ['gear'] })).isError).toBeUndefined();
  });

  it('does not count a standard that could not be read (R16)', async () => {
    const { tools, plan } = flow({ standard: 'error' });
    await tools.callTool(STANDARD_TOOL, { topic: 'hook' });
    expect((await plan({ standards: ['hook'] })).isError).toBe(true);
  });
});

describe('a plan in the form a small model sends it (review of BC-18, S3)', () => {
  it('fits the form instead of refusing it, and refuses only a plan without text', () => {
    expect(fitPlan({ summary: 'Box', steps: 'Base 40 × 20 mm\n\nLid 3 mm', extra: 1, standards: ['gear', 'hook', 'hook'] })).toEqual({ summary: 'Box', steps: ['Base 40 × 20 mm', 'Lid 3 mm'], standards: ['hook'] });
    expect(fitPlan({ steps: ['Base'] })).toEqual({ summary: 'Base', steps: ['Base'] });
    expect(fitPlan({ summary: 'Only a summary' })).toEqual({ summary: 'Only a summary', steps: ['Only a summary'] });
    const long = fitPlan({ summary: 'x'.repeat(301), name: ` ${'n'.repeat(61)} `, steps: Array.from({ length: 13 }, () => 'y'.repeat(201)) });
    expect(String(long.summary)).toHaveLength(300);
    expect(String(long.name)).toHaveLength(60);
    expect(long.steps).toHaveLength(12);
    expect((long.steps as string[])[0]).toHaveLength(200);
    expect(fitPlan({ summary: '  ', steps: [' ', 3] })).toEqual({ summary: '', steps: [] });
  });

  it('shows the fitted plan, so a new part can get Go', async () => {
    const { questions, tools, lastId, build } = flow({ bodies: 0 });
    expect((await tools.callTool(PLAN_TOOL, { summary: 'A bracket', steps: 'Plate 40 × 20 × 3 mm', standards: ['bracket'] })).isError).toBeUndefined();
    expect(questions.open).toMatchObject({ kind: 'plan', steps: ['Plate 40 × 20 × 3 mm'] });
    questions.answer({ question: lastId(), choice: 'go' });
    expect((await build()).refused).toBe(false);
    expect((await tools.callTool(PLAN_TOOL, {})).isError).toBe(true);
  });
});
