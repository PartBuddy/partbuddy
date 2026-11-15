// Stand-in for Claude Code that records what PartBuddy sends to a model (issue #446): the role
// (`--system-prompt`), the MCP server's instructions and tool list, and every user message.
// It answers each message at once and calls no tool, so no model and no plan usage are involved.
// PROBE_OUT: the JSON file the record goes to, rewritten after every message.
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const args = process.argv.slice(2);
const out = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

if (args[0] === '--version') {
  console.log('9.9.9 (Claude Code)');
} else if (args[0] === 'auth') {
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' }));
} else if (args.includes('-p')) {
  const configPath = flag('--mcp-config');
  const record = { args, role: flag('--system-prompt-file') ? readFileSync(flag('--system-prompt-file'), 'utf8') : (flag('--system-prompt') ?? flag('--append-system-prompt')), instructions: null, tools: null, messages: [] };
  const save = () => process.env.PROBE_OUT && writeFileSync(process.env.PROBE_OUT, JSON.stringify(record, null, 1));
  out({ type: 'system', subtype: 'init', model: 'probe' });
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.type === 'control_request') {
      const levels = ['low', 'medium', 'high'];
      const response = message.request.subtype === 'initialize' ? { models: [{ value: 'opus', displayName: 'Opus', supportedEffortLevels: levels }] } : {};
      out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response } });
      continue;
    }
    if (configPath && !record.tools) {
      const server = JSON.parse(readFileSync(configPath, 'utf8')).mcpServers.partbuddy;
      const client = new Client({ name: 'probe', version: '0.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
      record.instructions = client.getInstructions() ?? null;
      record.tools = (await client.listTools()).tools;
      await client.close();
    }
    record.messages.push(message.message.content);
    save();
    out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Recorded.' }] } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1 });
  }
}
