import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AgentEvent, AgentStatus, ModelChoice } from '../src/shared/contract';
import { AcpError, failureOf, modelsOfSession, TurnText } from '../src/main/agents/acp';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { agentFile, findOpenCode, OpenCodeAgent, supportedVersion } from '../src/main/agents/openCode';

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('OpenCode route (issue 489)', () => {
  it('finds OpenCode where its installers put it', () => {
    // Placeholder folders: only how the candidates are put together counts.
    const npm = join('APPDATA', 'npm', 'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe');
    expect(findOpenCode({ APPDATA: 'APPDATA', PATH: '' }, 'HOME', (path) => path === npm, 'win32')?.command).toBe(npm);
    const script = join('HOME', '.opencode', 'bin', 'opencode');
    expect(findOpenCode({ PATH: 'BIN' }, 'HOME', (path) => path === script, 'linux')?.command).toBe(script);
    expect(findOpenCode({ PATH: '' }, 'HOME', () => false, 'linux')).toBeNull();
    expect(supportedVersion('2.3.2')).toBe(true);
    expect(supportedVersion('1.19.6')).toBe(false);
  });

  it("denies every tool of OpenCode but PartBuddy's, and the web only for research", () => {
    const plain = agentFile('ROLE', false);
    // The last matching rule wins: deny all first, then PartBuddy's MCP tools.
    expect(plain.indexOf('action: "*", resource: "*", effect: deny')).toBeLessThan(plain.indexOf('action: "partbuddy_*", resource: "*", effect: allow'));
    expect(plain).not.toContain('webfetch');
    expect(plain.trimEnd().endsWith('ROLE')).toBe(true);
    expect(agentFile('ROLE', true)).toContain('action: "websearch", resource: "*", effect: allow');
  });

  it('reads the models, and the efforts of the current one, from the session', () => {
    const read = modelsOfSession([
      { id: 'model', currentValue: 'a/x', options: [{ value: 'a/x', name: 'A X' }, { value: 'b/y' }] },
      { id: 'effort', currentValue: 'high', options: [{ value: 'none' }, { value: 'high' }, { value: 'default' }] },
    ]);
    expect(read).toEqual({ models: [{ id: 'a/x', name: 'A X', efforts: ['none', 'high'] }, { id: 'b/y', name: 'b/y', efforts: [] }], current: 'a/x', effort: 'high' });
  });

  it('streams a message in chunks, gives each one whole, and parts messages as paragraphs', () => {
    const text = new TurnText();
    const chunk = (messageId: string, value: string) => text.update({ sessionUpdate: 'agent_message_chunk', messageId, content: { type: 'text', text: value } });
    expect(chunk('m1', 'Hel')).toEqual([{ type: 'textDelta', text: 'Hel' }]);
    chunk('m1', 'lo');
    expect(text.update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hm' } })).toEqual([]);
    expect(chunk('m2', 'Next')).toEqual([{ type: 'text', text: 'Hello' }, { type: 'textDelta', text: '\n\n' }, { type: 'textDelta', text: 'Next' }]);
    expect(text.end()).toEqual([{ type: 'text', text: 'Next' }]);
  });

  it('names why a prompt failed', () => {
    expect(failureOf(new AcpError('Free usage limit reached.', -32603, 'provider.free-limit'))).toBe('limit');
    expect(failureOf(new AcpError('Authentication required', -32000, ''))).toBe('signedOut');
    expect(failureOf(new Error('fetch failed'))).toBe('offline');
    expect(failureOf(new Error('boom'))).toBe('failed');
  });
});

describe('OpenCode agent with a fake OpenCode', { timeout: 30_000 }, () => {
  function setup(env: Record<string, string> = {}) {
    const workDir = mkdtempSync(join(tmpdir(), 'partbuddy-opencode-'));
    const traceFile = join(workDir, 'trace');
    const calls: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => 'SolidCraft drives the app.',
      listTools: () => Promise.resolve([{ name: 'inspect_design', description: 'The whole design', inputSchema: { type: 'object', properties: {} } }]),
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve({ content: [{ type: 'text', text: `${name} ok` }] });
      },
    };
    const kept: { choice: ModelChoice | null } = { choice: null };
    const statuses: AgentStatus[] = [];
    const events: AgentEvent[] = [];
    const agent = new OpenCodeAgent(
      {
        env: { ...process.env, PARTBUDDY_OPENCODE_COMMAND: JSON.stringify([process.execPath, resolve(__dirname, 'fakeOpenCode.mjs')]), FAKE_OPENCODE_TRACE: traceFile, ...env },
        home: workDir,
        workDir,
        tools: () => Promise.resolve(upstream),
        choices: { get: () => kept.choice, set: (_route, choice) => (kept.choice = choice) },
        log: () => undefined,
      },
      { status: (status) => statuses.push(status), event: (event) => events.push(event) },
    );
    cleanups.push(() => rmSync(workDir, { recursive: true, force: true }));
    cleanups.push(() => agent.dispose());
    const trace = () => (existsSync(traceFile) ? readFileSync(traceFile, 'utf8').trim().split('\n') : []);
    const ended = async (count = 1) => {
      for (let i = 0; i < 200 && events.filter((event) => event.type === 'done').length < count; i++) await new Promise((done) => setTimeout(done, 50));
      return events.filter((event): event is Extract<AgentEvent, { type: 'done' }> => event.type === 'done').at(-1);
    };
    return { agent, events, calls, trace, ended, kept };
  }

  it("is ready without a sign-in, lists the models, and builds through PartBuddy's gate only", async () => {
    const { agent, events, calls, trace, ended } = setup();
    const status = await agent.refresh();
    expect(status).toMatchObject({ agent: 'opencode', state: 'ready', version: '2.3.2', model: 'opencode/big-pickle' });
    expect(status.models?.map((model) => model.id)).toEqual(['opencode/big-pickle', 'github-copilot/gpt-9']);
    await agent.send('Look at it', [], null, [new Uint8Array([1, 2, 3])], 'photo');
    const done = await ended();
    expect(done).toMatchObject({ ok: true, detail: null });
    expect(calls).toEqual(['inspect_design']);
    expect(events.filter((event) => event.type === 'tool').map((event) => (event as { decision: string }).decision)).toEqual(['allowed', 'allowed']);
    expect(events.filter((event) => event.type === 'text')).toEqual([{ type: 'text', text: 'Checked the design and the picture.' }]);
    expect(agent.status()).toMatchObject({ state: 'ready', context: { used: 2400, size: 200000 } });
    // Every OpenCode process ran PartBuddy's locked agent; the chat is deleted from OpenCode's history when it ends.
    expect(trace().filter((line) => line.startsWith('agent'))).not.toContain('agent open');
    await agent.newConversation();
    expect(trace().at(-1)).toBe('session/delete');
    expect(agent.freshConversation()).toBe(true);
  });

  it('switches model and effort before the turn, and keeps them for new chats when asked', async () => {
    const { agent, events, ended, kept, trace } = setup();
    await agent.refresh();
    // The efforts of a model are known once the session runs with it.
    await agent.chooseModel({ model: 'github-copilot/gpt-9', effort: null }, true);
    expect(kept.choice).toEqual({ model: 'github-copilot/gpt-9', effort: null });
    await agent.send('Which model');
    await ended();
    expect(trace()).toContain('session/set_config_option model=github-copilot/gpt-9');
    expect(events.filter((event) => event.type === 'text').at(-1)).toEqual({ type: 'text', text: 'model github-copilot/gpt-9 effort default' });
  });

  it('says when the free models are used up', async () => {
    const { agent, ended } = setup();
    await agent.refresh();
    await agent.send('Use up the free models');
    expect(await ended()).toMatchObject({ ok: false, detail: 'limit' });
    expect(agent.status().state).toBe('ready');
  });

  it('stops a turn when asked', async () => {
    const { agent, ended } = setup();
    await agent.refresh();
    await agent.send('Take your time');
    await agent.stop();
    expect(await ended()).toMatchObject({ ok: false, detail: 'stopped' });
  });

  it('refuses OpenCode 1 and an agent other than PartBuddy', async () => {
    const old = setup({ FAKE_OPENCODE_VERSION: 'opencode 1.19.6' });
    expect(await old.agent.refresh()).toMatchObject({ state: 'unavailable', version: '1.19.6' });
    const other = setup({ FAKE_OPENCODE_MODE: 'build' });
    await other.agent.refresh();
    await expect(other.agent.send('Look at it')).rejects.toThrow(/did not take PartBuddy's agent/);
    expect(other.calls).toEqual([]);
  });

  it('shows OpenCode as not installed when it is nowhere', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'partbuddy-opencode-'));
    cleanups.push(() => rmSync(workDir, { recursive: true, force: true }));
    const agent = new OpenCodeAgent({ env: { PATH: '' }, home: workDir, workDir, tools: () => Promise.resolve(null), choices: { get: () => null, set: () => undefined }, log: () => undefined }, { status: () => undefined, event: () => undefined });
    expect(await agent.refresh()).toEqual({ agent: 'opencode', state: 'notInstalled' });
  });
});
