import { describe, expect, it } from 'vitest';

import { LocalAgent, usableModels } from '../src/main/local/localAgent';
import { contextFor, findOllama, modelFromShow, modelNames } from '../src/main/local/ollama';

// Answers as Ollama 0.34.0 gives them (shortened), recorded on the home server on 2026-11-06.
const TAGS = { models: [{ name: 'qwen3.5:9b' }, { name: 'embeddinggemma:latest' }, { name: 'tiny:1b' }] };
const SHOW: Record<string, unknown> = {
  'qwen3.5:9b': { capabilities: ['completion', 'vision', 'tools', 'thinking'], model_info: { 'qwen35.context_length': 262144 } },
  'embeddinggemma:latest': { capabilities: ['embedding'], model_info: { 'gemma3.context_length': 2048 } },
  'tiny:1b': { capabilities: ['completion', 'tools'], model_info: { 'llama.context_length': 4096 } },
};

function fakeOllama(up = true): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit) => {
    if (!up) return Promise.reject(new TypeError('fetch failed'));
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (path === '/api/version') return json({ version: '0.34.0' });
    if (path === '/api/tags') return json(TAGS);
    if (path === '/api/show') return json(SHOW[(JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { model: string }).model]);
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
}

const noChoices = { get: () => null, set: () => undefined };

function agent(up = true) {
  const events: unknown[] = [];
  const local = new LocalAgent({ tools: () => Promise.resolve(null), event: (event) => events.push(event), changed: () => undefined, log: () => undefined, choices: noChoices, fetch: fakeOllama(up) });
  return { local, events };
}

describe('local models through Ollama (F8)', () => {
  it('reads capabilities and context length from /api/show', () => {
    expect(modelFromShow('qwen3.5:9b', SHOW['qwen3.5:9b'])).toEqual({ id: 'qwen3.5:9b', tools: true, vision: true, context: 262144 });
    expect(modelFromShow('x', null)).toEqual({ id: 'x', tools: false, vision: false, context: null });
    expect(modelNames(TAGS)).toEqual(['qwen3.5:9b', 'embeddinggemma:latest', 'tiny:1b']);
  });

  it('runs a model with 16K context at most and refuses one too small for the tools', () => {
    expect(contextFor({ id: 'a', tools: true, vision: false, context: 262144 })).toBe(16384);
    expect(contextFor({ id: 'b', tools: true, vision: false, context: 4096 })).toBeNull();
    expect(contextFor({ id: 'c', tools: true, vision: false, context: null })).toBe(16384);
  });

  it('offers only models that call tools and have room for them', async () => {
    const found = await findOllama(fakeOllama());
    expect(found?.version).toBe('0.34.0');
    expect(usableModels(found ?? { version: '', models: [] }).map((model) => model.id)).toEqual(['qwen3.5:9b']);
    expect(await findOllama(fakeOllama(false))).toBeNull();
  });

  it('is ready with the first usable model, or says what is missing', async () => {
    const { local } = agent();
    expect(local.status().state).toBe('checking');
    const status = await local.refresh();
    expect(status).toMatchObject({ agent: 'local', state: 'ready', version: '0.34.0', model: 'qwen3.5:9b' });
    const down = await agent(false).local.refresh();
    expect(down.state).toBe('unavailable');
    expect(down.detail).toContain('Start Ollama');
  });
});
