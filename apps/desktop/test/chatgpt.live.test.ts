import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { ChatGptAccount } from '../src/main/chatgpt/account';
import { hostId } from '../src/main/chatgpt/oauth';
import { SecretStore } from '../src/main/credentials/secretStore';

// Live check against OpenAI with the user's own ChatGPT account (opt in with
// PARTBUDDY_E2E_CHATGPT=1). The first run opens the browser for the user to sign in and consent;
// tokens go to the Windows credential store and are never printed.
const enabled = process.env.PARTBUDDY_E2E_CHATGPT === '1';

function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('rundll32', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', detached: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

describe.skipIf(!enabled)('ChatGPT plan usage (live)', () => {
  it('signs in, lists models and streams a Responses request with a namespaced tool', async () => {
    const account = new ChatGptAccount({
      store: new SecretStore(),
      hostId: () => hostId(join(process.env.APPDATA ?? tmpdir(), 'PartBuddy', 'chatgpt-host-id')),
      openBrowser,
      onStatus: () => undefined,
    });
    if (account.load().state !== 'signedIn') {
      const status = await account.signIn();
      expect(status.detail ?? '').toBe('');
    }
    expect(account.status().state).toBe('signedIn');
    const token = await account.accessToken();

    const models = (await (await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${token}` } })).json()) as {
      models?: { slug: string; visibility?: string }[];
    };
    const listed = (models.models ?? []).filter((m) => m.visibility === 'list').map((m) => m.slug);
    console.log('models:', listed.join(', '));
    expect(listed.length).toBeGreaterThan(0);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: listed[0],
        instructions: 'Call the tool once, then answer with one word.',
        input: [{ role: 'user', content: 'What is the volume of the box? Use the tool.' }],
        tools: [
          {
            type: 'namespace',
            name: 'solidcraft',
            description: 'SolidCraft CAD tools.',
            tools: [
              {
                type: 'function',
                name: 'measure',
                description: 'Volume of the design in mm³.',
                parameters: { type: 'object', properties: {}, additionalProperties: false },
              },
            ],
          },
        ],
        store: false,
        stream: true,
      }),
    });
    const text = await response.text();
    console.log('status:', response.status);
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; item?: Record<string, unknown> });
    console.log('event types:', [...new Set(events.map((e) => e.type))].join(', '));
    const call = events.find((e) => e.type === 'response.output_item.done' && e.item?.type === 'function_call');
    console.log('function_call item keys:', call ? Object.keys(call.item ?? {}).join(', ') : 'none', JSON.stringify({ name: call?.item?.name, namespace: call?.item?.namespace }));
    if (response.status !== 200) console.log('body:', text.slice(0, 800));
    expect(response.status).toBe(200);
  }, 15 * 60 * 1000);
});

describe.skipIf(!enabled)('ChatGPT agent loop (live)', () => {
  it('runs the AI SDK loop on the plan with a namespaced SolidCraft tool', async () => {
    const { ChatGptAgent } = await import('../src/main/chatgpt/chatgptAgent');
    const account = new ChatGptAccount({
      store: new SecretStore(),
      hostId: () => hostId(join(process.env.APPDATA ?? tmpdir(), 'PartBuddy', 'chatgpt-host-id')),
      openBrowser,
      onStatus: () => undefined,
    });
    expect(account.load().state).toBe('signedIn');
    const events: { type: string; [key: string]: unknown }[] = [];
    const calls: string[] = [];
    const agent = new ChatGptAgent({
      account,
      choices: { get: () => null, set: () => undefined },
      tools: () =>
        Promise.resolve({
          instructions: () => undefined,
          listTools: () =>
            Promise.resolve([
              { name: 'measure', description: 'Volume of the design in mm³.', inputSchema: { type: 'object' as const, properties: {} } },
            ]),
          callTool: (name: string) => {
            calls.push(name);
            return Promise.resolve({ content: [{ type: 'text', text: 'volume_mm3: 4000' }] });
          },
        }),
      event: (event) => events.push(event),
      changed: () => undefined,
      log: (message) => console.log(message),
    });
    await agent.refresh();
    console.log('model:', agent.status().model);
    await agent.send('Measure the design with the tool and tell me the volume in mm³.');
    const deadline = Date.now() + 120_000;
    while (!events.some((e) => e.type === 'done') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    const answer = events.filter((e) => e.type === 'textDelta').map((e) => e.text).join('');
    console.log('events:', events.map((e) => e.type).join(','), '| answer:', answer.slice(0, 200));
    console.log('errors:', JSON.stringify(events.filter((e) => e.type === 'error')));
    expect(calls).toEqual(['measure']);
    expect(events.find((e) => e.type === 'done')).toMatchObject({ ok: true });
    expect(answer).toMatch(/4[ .,]?000/);
  }, 180_000);
});
