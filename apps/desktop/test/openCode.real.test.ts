/**
 * The OpenCode route against the OpenCode installed on this machine (issue 489), not run in CI:
 *
 *   REAL_OPENCODE=1 npx vitest run test/openCode.real.test.ts
 *
 * API keys: a stand-in provider on 127.0.0.1 that answers only with its key, defined for this run through
 * OPENCODE_CONFIG_CONTENT as a user's provider with an API key would be. GitHub Copilot or a real key: sign in
 * through "Connect a provider…" in PartBuddy first, then name one of its models in OPENCODE_REAL_MODEL
 * (e.g. github-copilot/gpt-5-mini): a whole turn with a PartBuddy tool runs with it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AgentEvent } from '../src/shared/contract';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { OpenCodeAgent } from '../src/main/agents/openCode';

const KEY = 'partbuddy-test-key';

/** OpenAI-compatible chat completions, streamed; any other key gets 401 as from a real provider. */
function keyedProvider(): Promise<Server> {
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      if (request.headers.authorization !== `Bearer ${KEY}`) {
        response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } }));
        return;
      }
      const chunk = (delta: object, finish: string | null = null) => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: 'keyed-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(`${chunk({ role: 'assistant', content: 'Hello from the keyed provider.' })}${chunk({}, 'stop')}data: [DONE]\n\n`);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

describe.runIf(process.env.REAL_OPENCODE === '1')('the OpenCode route against the installed OpenCode', { timeout: 600_000 }, () => {
  let provider: Server;
  const cleanups: (() => unknown)[] = [];
  beforeAll(async () => {
    provider = await keyedProvider();
  });
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    provider.close();
  });

  function agent(key: string | null, model: string, calls: string[] = []) {
    const workDir = mkdtempSync(join(tmpdir(), 'partbuddy-opencode-real-'));
    const events: AgentEvent[] = [];
    const config = {
      providers: {
        keyed: { name: 'Keyed', env: ['PARTBUDDY_KEYED_API_KEY'], package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: `http://127.0.0.1:${String((provider.address() as AddressInfo).port)}/v1` }, models: { 'keyed-model': { name: 'Keyed Model' } } },
      },
    };
    const env: NodeJS.ProcessEnv = { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) };
    delete env.PARTBUDDY_KEYED_API_KEY;
    if (key) env.PARTBUDDY_KEYED_API_KEY = key;
    const upstream: UpstreamTools = {
      instructions: () => 'SolidCraft drives the app.',
      listTools: () => Promise.resolve([{ name: 'inspect_design', description: 'Lists the bodies of the design', inputSchema: { type: 'object', properties: {} } }]),
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve({ content: [{ type: 'text', text: 'One body: Box 20 x 20 x 10 mm' }] });
      },
    };
    const route = new OpenCodeAgent(
      { env, home: homedir(), workDir, tools: () => Promise.resolve(upstream), choices: { get: () => ({ model, effort: null }), set: () => undefined }, log: () => undefined },
      { status: () => undefined, event: (event) => events.push(event) },
    );
    cleanups.push(() => route.dispose(), () => rmSync(workDir, { recursive: true, force: true }));
    const done = async () => {
      for (let i = 0; i < 5000 && !events.some((event) => event.type === 'done'); i++) await new Promise((resolve) => setTimeout(resolve, 100));
      return events.find((event) => event.type === 'done');
    };
    return { route, events, done };
  }

  it('lists a provider with an API key among the models and answers with it', async () => {
    const { route, events, done } = agent(KEY, 'keyed/keyed-model');
    const status = await route.refresh();
    expect(status.models?.map((model) => model.id)).toContain('keyed/keyed-model');
    expect(status.model).toBe('keyed/keyed-model');
    await route.send('Say hello');
    expect(await done()).toMatchObject({ ok: true });
    expect(events.filter((event) => event.type === 'text').map((event) => (event as { text: string }).text).join('')).toContain('Hello from the keyed provider.');
  });

  it('says to connect the provider when its key is wrong or missing', async () => {
    for (const key of ['wrong-key', null]) {
      const { route, done } = agent(key, 'keyed/keyed-model');
      await route.refresh();
      await route.send('Say hello');
      // OpenCode 2.3.2 answers both with ACP's auth_required (-32000 "Authentication required").
      expect(await done()).toMatchObject({ ok: false, detail: 'signedOut' });
      expect(route.status().state).toBe('ready');
    }
  });

  it.runIf(Boolean(process.env.OPENCODE_REAL_MODEL))("runs a turn with PartBuddy's tool on a signed-in provider (OPENCODE_REAL_MODEL)", async () => {
    const calls: string[] = [];
    const model = process.env.OPENCODE_REAL_MODEL ?? '';
    const { route, done } = agent(null, model, calls);
    const status = await route.refresh();
    expect(status.models?.map((option) => option.id), `${model} is not offered; sign in first`).toContain(model);
    await route.send('Call the inspect_design tool, then tell me in one sentence what the design holds.');
    expect(await done()).toMatchObject({ ok: true });
    expect(calls).toContain('inspect_design');
  });
});
