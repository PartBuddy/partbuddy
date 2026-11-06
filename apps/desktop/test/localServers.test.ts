import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { LOOP_NOTICE } from '../src/main/agents/loop';
import { LocalAgent, serverReason } from '../src/main/local/localAgent';
import { findOpenAiServers, llamaProps, modelsFromList, modelsFromLmStudio } from '../src/main/local/openaiServers';
import type { AgentEvent } from '../src/shared/contract';

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, 'fixtures', 'local', name), 'utf8'));
// Recorded from llama.cpp b12144 (llama-server, Qwen3-4B-Instruct-2507) on the home server, 2026-11-06.
const LLAMA_MODELS = fixture('llamacpp-b12144-models.json');
const LLAMA_PROPS = fixture('llamacpp-b12144-props.json');
const LLAMA_ID = 'unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M';

type Route = (path: string, body: Record<string, unknown> | null) => Response | null;

/** A fake machine: each port answers through its route; a port without one refuses. */
function machine(routes: Record<string, Route>) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const route = routes[url.port];
    if (!route) return Promise.reject(new TypeError('fetch failed'));
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    if (body) bodies.push(body);
    return Promise.resolve(route(url.pathname, body) ?? new Response('not found', { status: 404 }));
  }) as typeof fetch;
  return { fetchFn, bodies };
}

/** A streamed or plain chat completion, as OpenAI-compatible servers send it. */
function completion(body: Record<string, unknown> | null, message: { content?: string; toolCall?: string }): Response {
  const toolCalls = message.toolCall ? [{ index: 0, id: 'call_1', type: 'function', function: { name: message.toolCall, arguments: '{"word":"ok"}' } }] : undefined;
  if (body?.stream === true) {
    const chunk = (delta: object, finish: string | null) => `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'm', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    const sse = chunk({ role: 'assistant', content: message.content ?? '', ...(toolCalls ? { tool_calls: toolCalls } : {}) }, null) + chunk({}, toolCalls ? 'tool_calls' : 'stop') + 'data: [DONE]\n\n';
    return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }
  return Response.json({
    id: 'c',
    object: 'chat.completion',
    created: 1,
    model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content: message.content ?? null, ...(toolCalls ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

const upstream: UpstreamTools = {
  instructions: () => undefined,
  listTools: () => Promise.resolve([{ name: 'measure', description: 'Volume', inputSchema: { type: 'object', properties: {} } }]),
  callTool: () => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }),
};

function agent(fetchFn: typeof fetch) {
  const events: AgentEvent[] = [];
  const local = new LocalAgent({
    tools: () => Promise.resolve(upstream),
    event: (event) => events.push(event),
    changed: () => undefined,
    log: () => undefined,
    choices: { get: () => null, set: () => undefined },
    fetch: fetchFn,
  });
  return { local, events };
}

/**
 * An OpenAI server on LM Studio's port with one model that does or does not call the test tool;
 * `circles` makes the real turn call that tool every round, as Qwen3-1.7B did on vLLM.
 */
function lmStudio(callsTool: boolean, circles?: string) {
  return machine({
    '1234': (path, body) => {
      if (path === '/api/v0/models') return Response.json({ object: 'list', data: [{ id: 'qwen3-4b', type: 'llm', state: 'not-loaded', max_context_length: 32768 }, { id: 'nomic-embed', type: 'embeddings', state: 'not-loaded' }] });
      if (path === '/api/v1/models/load') return Response.json({ type: 'llm', instance_id: 'qwen3-4b', load_time_seconds: 2, status: 'loaded' });
      if (path === '/v1/chat/completions') {
        const tools = (body?.tools as { function: { name: string } }[] | undefined) ?? [];
        // The connection test offers only the dummy tool; the real turn offers SolidCraft's.
        if (tools.some((entry) => entry.function.name === 'partbuddy_ping')) return completion(body, callsTool ? { toolCall: 'partbuddy_ping' } : { content: 'ok' });
        return completion(body, circles ? { toolCall: circles } : { content: 'Built it.' });
      }
      return null;
    },
  });
}

describe('LM Studio, llama.cpp and vLLM (F8)', () => {
  it('reads llama.cpp as it answers: context, picture input and tool support from /props', () => {
    expect(modelsFromList(LLAMA_MODELS)).toEqual([{ id: LLAMA_ID, context: 16384, vision: false, loading: false, tools: null, busy: false }]);
    expect(llamaProps(LLAMA_PROPS)).toEqual({ context: 16384, vision: false, tools: true });
  });

  it('reads vLLM context and LM Studio language models only', () => {
    expect(modelsFromList({ object: 'list', data: [{ id: 'Qwen/Qwen3-4B', object: 'model', max_model_len: 16384 }] })).toEqual([{ id: 'Qwen/Qwen3-4B', context: 16384, vision: false, loading: false, tools: null, busy: false }]);
    // Loaded: the context it was loaded with, not the model's maximum (LM Studio loads with 8,192 by default).
    expect(modelsFromLmStudio({ data: [{ id: 'a', type: 'vlm', state: 'loaded', max_context_length: 262144, loaded_context_length: 8192 }, { id: 'e', type: 'embeddings' }] })).toEqual([{ id: 'a', context: 8192, vision: true, loading: false, tools: null, busy: false }]);
    expect(modelsFromLmStudio(fixture('lmstudio-0.4.28-models.json'))).toEqual([{ id: 'qwen/qwen3-4b-2507', context: 262144, vision: false, loading: true, tools: true, busy: false }]);
  });

  it('finds llama.cpp on 9931, tells loading by 503 and leaves 8080 to a Strata', async () => {
    const { fetchFn } = machine({
      '9931': (path) => (path === '/health' ? Response.json({ status: 'ok' }) : path === '/v1/models' ? Response.json(LLAMA_MODELS) : path === '/props' ? Response.json(LLAMA_PROPS) : path === '/slots' ? Response.json([{ id: 0, is_processing: true }]) : null),
      '8080': (path) => (path === '/health' ? Response.json({ error: { code: 503, message: 'Loading model' } }, { status: 503 }) : null),
    });
    const servers = await findOpenAiServers(fetchFn);
    expect(servers).toEqual([
      { name: 'llama.cpp', url: 'http://127.0.0.1:9931', models: [{ id: LLAMA_ID, context: 16384, vision: false, loading: false, tools: true, busy: true }] },
      { name: 'llama.cpp', url: 'http://127.0.0.1:8080', models: [] },
    ]);
    expect(await findOpenAiServers(fetchFn, ['http://127.0.0.1:8080'])).toHaveLength(1);
  });

  it('offers a model whose tool support is unknown and tests it once before the first turn', async () => {
    const server = lmStudio(true);
    const { local, events } = agent(server.fetchFn);
    const status = await local.refresh();
    expect(status.models).toEqual([{ id: 'lmstudio1234:qwen3-4b', name: 'qwen3-4b · LM Studio', efforts: [], description: 'Loads on first use · 32K context · Tool calling is tested on first use · Cannot see pictures' }]);
    expect(status).toMatchObject({ state: 'ready', account: 'LM Studio', model: 'lmstudio1234:qwen3-4b' });
    await local.send('Make a box');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
    expect(events.filter((e) => e.type === 'tool' && e.name === 'partbuddy_ping').at(-1)).toMatchObject({ ok: true });
    // Not loaded yet: PartBuddy loads it with 16K context first, as LM Studio's own load would give 8K.
    expect(server.bodies[0]).toEqual({ model: 'qwen3-4b', context_length: 16384 });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ ok: true });
    // The second turn does not test again.
    const before = server.bodies.length;
    await local.send('Again');
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(2));
    expect(server.bodies.length - before).toBe(1);
  });

  it('stops a model that repeats the same tool call, known or unknown, after three rounds', async () => {
    for (const name of ['measure', 'sketch.rect']) {
      const server = lmStudio(true, name);
      const { local, events } = agent(server.fetchFn);
      await local.refresh();
      await local.send('Make a box');
      await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
      // Load, connection test, then three rounds of the turn.
      expect(server.bodies).toHaveLength(5);
      expect(events.find((e) => e.type === 'error')).toEqual({ type: 'error', message: LOOP_NOTICE });
      expect(events.find((e) => e.type === 'done')).toMatchObject({ ok: false });
    }
  });

  it('drops a model that does not call the test tool and says why', async () => {
    const { local, events } = agent(lmStudio(false).fetchFn);
    await local.refresh();
    await local.send('Make a box');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true));
    expect(events.find((e) => e.type === 'error')).toMatchObject({ message: expect.stringContaining('cannot call tools') as unknown });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ ok: false });
    expect(local.status()).toMatchObject({ state: 'unavailable' });
    expect(local.freshConversation()).toBe(true);
  });
});

describe('local server errors (F8)', () => {
  it('passes on the server\'s own reason instead of the SDK\'s', () => {
    // LM Studio's answer when the prompt does not fit, wrapped as the AI SDK reports it.
    const refused = Object.assign(new Error('OpenAI stream failed before any output was generated'), {
      responseBody: JSON.stringify({ error: { code: 400, message: 'request (9376 tokens) exceeds the available context size (8192 tokens), try increasing it', type: 'exceed_context_size_error' } }),
    });
    expect(serverReason(refused)).toBe('The local server refused the request: request (9376 tokens) exceeds the available context size (8192 tokens), try increasing it');
    expect(serverReason(Object.assign(new Error('Failed after 3 attempts'), { lastError: refused }))).toContain('9376 tokens');
    expect(serverReason(new Error('fetch failed'))).toBe('fetch failed');
  });
});
