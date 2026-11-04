import { describe, expect, it, vi } from 'vitest';

import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { ASK_TOOL, PLAN_TOOL, Questions } from '../src/main/agents/questions';
import { agentEventSchema, agentMessageSchema, type AgentEvent } from '../src/shared/contract';
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

  it('names the picked option, and treats typed text as the answer', async () => {
    const { questions, tools } = setup();
    await tools.callTool(ASK_TOOL, { question: 'Which wall?', options: [{ label: '2 mm' }, { label: '3 mm', detail: 'stiffer' }] });
    expect(questions.answer({ question: 'question-1', choice: '1' })).toBe('[PartBuddy: the user answered your question "Which wall?" with the button "3 mm".]');
    await tools.callTool(ASK_TOOL, { question: 'Colour?', options: [{ label: 'Red' }, { label: 'Blue' }] });
    expect(questions.answer()).toBe('[PartBuddy: this message answers your question "Colour?".]');
  });

  it('refuses invalid input and a second open question', async () => {
    const { tools } = setup();
    expect((await tools.callTool(ASK_TOOL, { question: 'Only one?', options: [{ label: 'yes' }] })).isError).toBe(true);
    await tools.callTool(PLAN_TOOL, { summary: 'x', steps: ['y'] });
    expect((await tools.callTool(PLAN_TOOL, { summary: 'x', steps: ['y'] })).isError).toBe(true);
  });

  it('accepts only known answers from the renderer', () => {
    expect(agentMessageSchema.safeParse({ text: 'Go', answer: { question: 'question-1', choice: 'go' } }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'Go', answer: { question: 'question-1', choice: 'rm -rf' } }).success).toBe(false);
  });

  it('marks the card answered in the conversation', () => {
    let items: ConversationItem[] = [];
    items = reduce(items, { type: 'question', question: { id: 'q1', kind: 'ask', question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] } });
    items = reduce(items, { type: 'answered', id: 'q1', choice: '0' });
    expect(items[0]).toMatchObject({ kind: 'question', answered: true, choice: '0' });
  });
});
