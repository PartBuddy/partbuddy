// Test double for the Claude Code program (ADR 0015). It answers `--version` and
// `auth status --json` like Claude Code 2.1, and in `-p` stream-json mode it connects to the MCP
// server named in --mcp-config, calls one SolidCraft tool per message and streams an answer.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const args = process.argv.slice(2);
const out = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

if (args[0] === '--version') {
  console.log('9.9.9 (Claude Code)');
} else if (args[0] === 'auth' && args[1] === 'status') {
  const signedIn = process.env.FAKE_CLAUDE_SIGNED_OUT !== '1';
  const apiKey = process.env.FAKE_CLAUDE_API_KEY === '1';
  console.log(
    JSON.stringify({
      loggedIn: signedIn,
      authMethod: !signedIn ? 'none' : apiKey ? 'api_key' : 'claude.ai',
      email: 'someone@example.com',
      orgName: 'Example',
      subscriptionType: signedIn && !apiKey ? 'max' : null,
    }),
  );
} else if (args.includes('-p')) {
  const config = JSON.parse(readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8'));
  const server = config.mcpServers.partbuddy;
  out({ type: 'system', subtype: 'init', model: 'fake-model' });
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    const message = JSON.parse(line);
    const tool = message.message.content.includes('export') ? 'export' : 'inspect_design';
    const client = new Client({ name: 'fake-claude', version: '9.9.9' });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
    const result = await client.callTool({ name: tool, arguments: { measure: false } });
    await client.close();
    const text = result.isError ? `Refused: ${result.content[0].text}` : 'The design has one body.';
    for (const part of text.match(/.{1,8}/g)) {
      out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: part } } });
    }
    out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 12 });
  }
}
