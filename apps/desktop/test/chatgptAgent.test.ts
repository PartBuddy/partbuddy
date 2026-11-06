import { describe, expect, it, vi } from 'vitest';

import { Assistant, type AgentBackend } from '../src/main/agents/assistant';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import type { ChatGptAccount } from '../src/main/chatgpt/account';
import { ChatGptAgent } from '../src/main/chatgpt/chatgptAgent';
import type { AgentEvent, AgentStatus } from '../src/shared/contract';

const sse = (events: Record<string, unknown>[]) =>
  new Response(events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  });

const created = (id: string) => [
  { type: 'response.created', response: { id, created_at: 1, model: 'gpt-test', service_tier: null } },
  { type: 'response.in_progress', response: { id, created_at: 1, model: 'gpt-test', service_tier: null } },
];
const completed = (id: string) => ({
  type: 'response.completed',
  response: { id, created_at: 1, model: 'gpt-test', service_tier: null, incomplete_details: null, usage: { input_tokens: 10, output_tokens: 5 } },
});

/** OpenAI's Responses API as Sign in with ChatGPT serves it: a namespaced tool call, then the answer. */
function fakeOpenAI(firstTool: string) {
  const bodies: Record<string, unknown>[] = [];
  const auth: string[] = [];
  const fetchFn = ((url: string | URL, init?: RequestInit): Promise<Response> => {
    auth.push(new Headers(init?.headers).get('Authorization') ?? '');
    if (String(url).endsWith('/models')) {
      return Promise.resolve(
        Response.json({
          models: [
            { slug: 'gpt-5-test', display_name: 'GPT Test', visibility: 'list', default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }] },
            { slug: 'gpt-hidden', visibility: 'hide' },
            { slug: 'gpt-mini', display_name: 'GPT Mini', visibility: 'list', supported_reasoning_levels: [] },
          ],
        }),
      );
    }
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;
    bodies.push(body);
    if (bodies.length === 1) {
      const item = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: firstTool, namespace: 'solidcraft', arguments: '' };
      return Promise.resolve(sse([
        ...created('resp_1'),
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{}' },
        { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 0, arguments: '{}' },
        { type: 'response.output_item.done', output_index: 0, item: { ...item, arguments: '{}', status: 'completed' } },
        completed('resp_1'),
      ]));
    }
    const message = { type: 'message', id: 'msg_1', role: 'assistant', status: 'in_progress', content: [] };
    return Promise.resolve(sse([
      ...created('resp_2'),
      { type: 'response.output_item.added', output_index: 0, item: message },
      { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Volume: ', logprobs: [] },
      { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: '4000 mm³', logprobs: [] },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { ...message, status: 'completed', content: [{ type: 'output_text', text: 'Volume: 4000 mm³', annotations: [], logprobs: [] }] },
      },
      completed('resp_2'),
    ]));
  }) as typeof fetch;
  return { fetchFn, bodies, auth };
}

function setup(firstTool = 'measure') {
  const openai = fakeOpenAI(firstTool);
  const calls: string[] = [];
  const events: AgentEvent[] = [];
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () =>
      Promise.resolve([
        { name: 'measure', description: 'Volume', inputSchema: { type: 'object', properties: {} } },
        { name: 'export', description: 'Export', inputSchema: { type: 'object', properties: {} } },
      ]),
    callTool: (name) => {
      calls.push(name);
      return Promise.resolve({ content: [{ type: 'text', text: 'volume_mm3: 4000' }] });
    },
  };
  const account = {
    status: () => ({ state: 'signedIn' as const, email: 'someone@example.com' }),
    accessToken: () => Promise.resolve('access-token-1'),
  } as unknown as ChatGptAccount;
  const agent = new ChatGptAgent({
    account,
    tools: () => Promise.resolve(upstream),
    event: (event) => events.push(event),
    changed: () => undefined,
    log: () => undefined,
    choices: { get: () => null, set: () => undefined },
    fetch: openai.fetchFn,
  });
  return { agent, openai, calls, events };
}

describe('ChatGPT agent', () => {
  it('sends the selected face as a note and shows it as a label (#view context)', async () => {
    const { agent, openai, events } = setup();
    await agent.refresh();
    await agent.send('Round this face', [{ kind: 'face', body: 'Body1', face: 'F1:+z', surface: 'plane', area: 400, point: [10, 10, 20], normal: [0, 0, 1] }]);
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
    expect(events[0]).toEqual({ type: 'user', text: 'Round this face', selection: 'F1:+z · Body1', selected: { faces: 1, edges: 0, vertices: 0, bodies: ['Body1'] } });
    const input = JSON.stringify(openai.bodies[0]?.input);
    expect(input).toContain('[PartBuddy: the user selected face \\"F1:+z\\" of body \\"Body1\\"');
    expect(String(openai.bodies[0]?.instructions)).toContain('partbuddy_view');
    // SolidCraft's traps reach this route too, not only Claude Code through the gate proxy.
    expect(String(openai.bodies[0]?.instructions)).toContain('PartBuddy notes on these tools');
  });


  it('lists the account\'s models and sends the chosen model with its reasoning effort (B1)', async () => {
    const { agent, openai, events } = setup();
    const status = await agent.refresh();
    expect(status.models).toEqual([
      { id: 'gpt-5-test', name: 'GPT Test', efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      { id: 'gpt-mini', name: 'GPT Mini', efforts: [] },
    ]);
    expect(status.model).toBe('gpt-5-test');
    await agent.chooseModel({ model: 'gpt-5-test', effort: 'high' }, false);
    await agent.send('Hello');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
    expect(openai.bodies[0]).toMatchObject({ model: 'gpt-5-test', reasoning: { effort: 'high' } });
    await expect(agent.chooseModel({ model: 'gpt-hidden', effort: null }, false)).rejects.toThrow(/not offered/);
    // An effort the model does not take falls back to the model's own default.
    await agent.chooseModel({ model: 'gpt-mini', effort: 'high' }, false);
    expect(agent.status()).toMatchObject({ model: 'gpt-mini' });
    expect(agent.status().effort).toBeUndefined();
  });

  it('sends a picture as an image part along with the message (kept for the photo import)', async () => {
    const { agent, openai, events } = setup();
    await agent.refresh();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    await agent.send('Hold this', [], '[PartBuddy: a photo of the object]', png);
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
    expect(events[0]).toEqual({ type: 'user', text: 'Hold this', sketch: true });
    const input = JSON.stringify(openai.bodies[0]?.input);
    expect(input).toContain('input_image');
    expect(input).toContain('a photo of the object');
  });

  it('follows the preview rules of Sign in with ChatGPT and runs the tool loop', async () => {
    const { agent, openai, calls, events } = setup();
    expect((await agent.refresh()).model).toBe('gpt-5-test');
    await agent.send('How big is it?');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));

    expect(calls).toEqual(['measure']);
    expect(openai.auth.every((header) => header === 'Bearer access-token-1')).toBe(true);
    const first = openai.bodies[0] ?? {};
    expect(first).toMatchObject({ model: 'gpt-5-test', store: false, stream: true });
    expect(typeof first.instructions).toBe('string');
    for (const field of ['temperature', 'max_output_tokens', 'previous_response_id', 'top_p']) expect(first).not.toHaveProperty(field);
    expect(JSON.stringify(first.input)).not.toContain('"role":"system"');
    expect(first.tools).toEqual([expect.objectContaining({ type: 'namespace', name: 'solidcraft' })]);
    // The second request carries the whole history, including the tool result.
    expect(JSON.stringify(openai.bodies[1]?.input)).toContain('volume_mm3: 4000');

    expect(events.filter((e) => e.type === 'textDelta').map((e) => (e as { text: string }).text).join('')).toBe('Volume: 4000 mm³');
    expect(events.find((e) => e.type === 'tool')).toMatchObject({ name: 'measure', decision: 'allowed' });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ ok: true });
    expect(agent.status()).toMatchObject({ agent: 'chatgpt', state: 'ready', account: 'someone@example.com', model: 'gpt-5-test' });
  });

  it('refuses gated tools without calling SolidCraft', async () => {
    const { agent, calls, events } = setup('export');
    await agent.refresh();
    await agent.send('Export it');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
    expect(calls).toEqual([]);
    expect(events.find((e) => e.type === 'tool')).toMatchObject({ name: 'export', decision: 'denied' });
  });
});

describe('assistant routes', () => {
  function backend(agent: 'claude-code' | 'chatgpt') {
    const calls: string[] = [];
    const status: AgentStatus = { agent, state: 'ready' };
    const route: AgentBackend = {
      status: () => status,
      refresh: () => Promise.resolve(status),
      send: (text) => {
        calls.push(`send:${text}`);
        return Promise.resolve();
      },
      stop: () => {
        calls.push('stop');
        return Promise.resolve();
      },
      chooseModel: () => Promise.resolve(),
      newConversation: () => Promise.resolve(),
      freshConversation: () => false,
      signIn: () => calls.push('signIn'),
      signOut: () => {
        calls.push('signOut');
        return Promise.resolve();
      },
      dispose: () => Promise.resolve(),
    };
    return { route, calls };
  }

  it('sends to the picked route and stops the old one when switching', async () => {
    const claude = backend('claude-code');
    const chatgpt = backend('chatgpt');
    const states: unknown[] = [];
    const assistant = new Assistant({ 'claude-code': claude.route, chatgpt: chatgpt.route }, (state) => states.push(state));
    await assistant.send('a');
    const state = await assistant.select('chatgpt');
    await assistant.send('b');
    assistant.signIn();
    expect(claude.calls).toEqual(['send:a', 'stop']);
    expect(chatgpt.calls).toEqual(['send:b', 'signIn']);
    expect(state.selected).toBe('chatgpt');
    expect(state.agents.map((a) => a.agent)).toEqual(['claude-code', 'chatgpt']);
    expect(states.length).toBeGreaterThan(0);
  });
});
