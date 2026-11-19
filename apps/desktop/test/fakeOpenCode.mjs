// Test double for OpenCode 2 (issue #489). It answers `--version` like OpenCode 2.3.2 and, as `acp`, speaks the
// Agent Client Protocol as OpenCode does: models as config options, one prompt calls PartBuddy's tool through the MCP
// server the session got, streams its answer in chunks and reports usage. FAKE_OPENCODE_TRACE=<file> logs every request.
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const args = process.argv.slice(2);
const out = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const trace = (line) => process.env.FAKE_OPENCODE_TRACE && appendFileSync(process.env.FAKE_OPENCODE_TRACE, `${line}\n`);

if (args.includes('--version')) {
  console.log(process.env.FAKE_OPENCODE_VERSION ?? 'opencode v2.3.2');
} else if (args[0] === 'acp') {
  // The agent PartBuddy wrote into the folder it started OpenCode in.
  const agent = readFileSync(join(process.cwd(), '.opencode', 'agents', 'partbuddy.md'), 'utf8');
  trace(`agent ${agent.includes('partbuddy_*') && agent.includes('action: "*", resource: "*", effect: deny') ? 'locked' : 'open'}`);
  let model = 'opencode/big-pickle';
  let effort = 'default';
  const sessions = new Map();
  const turn = { cancelled: false };
  const options = () => [
    {
      id: 'model',
      category: 'model',
      type: 'select',
      currentValue: model,
      options: [
        { value: 'opencode/big-pickle', name: 'opencode/Big Pickle' },
        { value: 'github-copilot/gpt-9', name: 'GitHub Copilot/GPT 9' },
      ],
    },
    ...(model === 'github-copilot/gpt-9'
      ? [{ id: 'effort', category: 'thought_level', type: 'select', currentValue: effort, options: [{ value: 'low' }, { value: 'high' }, { value: 'default' }] }]
      : []),
    { id: 'mode', category: 'mode', type: 'select', currentValue: process.env.FAKE_OPENCODE_MODE ?? 'partbuddy', options: [{ value: 'partbuddy' }, { value: 'build' }] },
  ];
  const update = (sessionId, body) => out({ method: 'session/update', params: { sessionId, update: body } });
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    trace(`${message.method}${message.params?.configId ? ` ${message.params.configId}=${message.params.value}` : ''}`);
    const { id, method, params } = message;
    if (method === 'initialize') out({ id, result: { protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } }, authMethods: [{ id: 'opencode-login' }] } });
    else if (method === 'session/new') {
      const sessionId = `ses_${String(sessions.size + 1)}`;
      sessions.set(sessionId, params.mcpServers);
      out({ id, result: { sessionId, configOptions: options() } });
    } else if (method === 'session/set_config_option') {
      if (params.configId === 'model') model = params.value;
      if (params.configId === 'effort') effort = params.value;
      out({ id, result: { configOptions: options() } });
    } else if (method === 'session/delete') {
      sessions.delete(params.sessionId);
      out({ id, result: {} });
    } else if (method === 'session/cancel') turn.cancelled = true;
    else if (method === 'session/prompt') {
      turn.cancelled = false;
      const sessionId = params.sessionId;
      const text = params.prompt.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join('\n');
      if (text.includes('Use up the free models')) {
        out({ id, error: { code: -32603, message: 'Internal error: Free usage limit reached. Connect a provider or subscribe to OpenCode Go to keep going, or switch models.', data: { errorName: 'provider.free-limit' } } });
        continue;
      }
      if (text.includes('Which model')) {
        update(sessionId, { sessionUpdate: 'agent_message_chunk', messageId: 'm0', content: { type: 'text', text: `model ${model} effort ${effort}` } });
        out({ id, result: { stopReason: 'end_turn' } });
        continue;
      }
      if (text.includes('Take your time')) {
        await new Promise((done) => setTimeout(done, 1500));
        out({ id, result: { stopReason: turn.cancelled ? 'cancelled' : 'end_turn' } });
        continue;
      }
      const server = sessions.get(sessionId)?.find((entry) => entry.name === 'partbuddy');
      const client = new Client({ name: 'fake-opencode', version: '2.3.2' });
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: Object.fromEntries(server.headers.map((header) => [header.name, header.value])) } }));
      const result = await client.callTool({ name: text.includes('Call partbuddy_review now') ? 'partbuddy_review' : 'inspect_design', arguments: {} });
      await client.close();
      const answer = result.isError ? 'The tool failed.' : `Checked the design${text.includes('[image]') ? ' and the picture' : ''}.`;
      update(sessionId, { sessionUpdate: 'agent_thought_chunk', messageId: 'm1:reasoning:0', content: { type: 'text', text: 'Thinking' } });
      update(sessionId, { sessionUpdate: 'agent_message_chunk', messageId: 'm1', content: { type: 'text', text: answer.slice(0, 8) } });
      update(sessionId, { sessionUpdate: 'agent_message_chunk', messageId: 'm1', content: { type: 'text', text: answer.slice(8) } });
      update(sessionId, { sessionUpdate: 'usage_update', used: 2400, size: 200000, cost: { amount: 0, currency: 'USD' } });
      out({ id, result: { stopReason: 'end_turn', usage: { inputTokens: 2300, outputTokens: 100, totalTokens: 2400 } } });
    } else if (id !== undefined) out({ id, error: { code: -32601, message: `${method} not found` } });
  }
}
