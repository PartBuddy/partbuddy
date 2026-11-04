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
    const content = message.message.content;
    // "box" builds one, so tests can change a headless design (ADR 0016) without a real model.
    // "plan" shows a plan (M2a) and then tries to build anyway, which PartBuddy must refuse;
    // the Go note builds the box.
    const box = { command: 'solid.box', params: { length: 20, width: 20, height: 10 } };
    const planned = content.includes('plan') && !content.includes('pressed Go');
    const tool = content.includes('export')
      ? 'export'
      : planned
        ? 'partbuddy_plan'
        : content.includes('box') || content.includes('pressed Go')
          ? 'execute'
          : 'inspect_design';
    const toolArgs =
      tool === 'execute' ? box : tool === 'partbuddy_plan' ? { summary: 'A 20 mm box', steps: ['Box 20 × 20 × 10 mm'] } : { measure: false };
    const client = new Client({ name: 'fake-claude', version: '9.9.9' });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
    // "notes" (M2b): looks for the note text in inspect_design, tries to undo the user's note and
    // tells whether PartBuddy's note came with the message.
    if (content.includes('notes')) {
      const inspect = await client.callTool({ name: 'inspect_design', arguments: { measure: false } });
      const undo = await client.callTool({ name: 'undo', arguments: {} });
      await client.close();
      const leaked = JSON.stringify(inspect.content).includes('Wall 2 mm here');
      const reply = `inspect ${leaked ? 'shows' : 'hides'} the note; undo ${undo.isError ? 'refused' : 'done'}; the message ${content.includes('«Wall 2 mm here»') ? 'quotes' : 'lacks'} the note`;
      out({ type: 'assistant', message: { content: [{ type: 'text', text: reply }] } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 12 });
      continue;
    }
    const result = await client.callTool({ name: tool, arguments: toolArgs });
    const early = planned ? await client.callTool({ name: 'execute', arguments: box }) : null;
    await client.close();
    const text = early
      ? early.isError
        ? 'Plan shown; building waits for the answer.'
        : 'Built before the answer.'
      : result.isError
        ? `Refused: ${result.content[0].text}`
        : 'The design has one body.';
    for (const part of text.match(/.{1,8}/g)) {
      out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: part } } });
    }
    out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 12 });
  }
}
