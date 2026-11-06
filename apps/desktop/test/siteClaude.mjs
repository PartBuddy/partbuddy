// Scripted Claude Code for the website pictures (e2e/site-shots.spec.ts). It speaks the same
// stream-json protocol as test/fakeClaude.mjs, but with the words a real conversation would have,
// so that the pictures show the app as it is used. Every answer is fixed: the pictures repeat.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const args = process.argv.slice(2);
const out = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const say = (text) => {
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 12 });
};

// The synthetic cable clip of the repository (tools/fixtures), built step by step.
const CABLE_CLIP = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'tools', 'fixtures', 'cable-clip.script.json'), 'utf8')).commands;

const HOUSING_ROUND = [
  {
    header: 'Lid',
    question: 'How should the lid hold on the housing?',
    options: [
      { label: 'Screws in heat-set inserts', detail: 'M3, opens again and again', recommended: true },
      { label: 'Snap fit', detail: 'No screws, opens a few times' },
      { label: 'Press fit', detail: 'Simplest, may loosen over time' },
    ],
  },
  {
    header: 'Openings',
    question: 'Which openings does the housing need?',
    options: [{ label: 'USB-C', recommended: true }, { label: 'Vent slots', recommended: true }, { label: 'LED window' }],
    multiSelect: true,
  },
];

const SKETCH_ROUND = [
  {
    header: 'Size',
    question: 'How long should the two legs of the bracket be?',
    options: [
      { label: '80 × 40 mm', detail: 'Keeps the proportions of your sketch', recommended: true },
      { label: '60 × 30 mm' },
      { label: '100 × 50 mm' },
    ],
  },
  {
    header: 'Thickness',
    question: 'How thick should the bracket be?',
    options: [{ label: '4 mm', detail: 'Stiff enough for a shelf up to 2 kg', recommended: true }, { label: '6 mm' }],
  },
];

if (args[0] === '--version') {
  console.log('2.1.302 (Claude Code)');
} else if (args[0] === 'auth' && args[1] === 'status') {
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', email: 'maker@example.com', subscriptionType: 'pro' }));
} else if (args.includes('-p')) {
  const config = args.includes('--mcp-config') ? JSON.parse(readFileSync(args[args.indexOf('--mcp-config') + 1], 'utf8')) : null;
  const server = config?.mcpServers.partbuddy;
  out({ type: 'system', subtype: 'init', model: 'default' });
  const now = Math.round(Date.now() / 1000);
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.type === 'control_request') {
      const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
      const response =
        message.request.subtype === 'initialize'
          ? {
              account: { email: 'maker@example.com', subscriptionType: 'pro' },
              models: [
                { value: 'default', displayName: 'Default (recommended)', description: 'The model your plan recommends', supportedEffortLevels: levels },
                { value: 'opus', displayName: 'Opus', description: 'Best for complex parts', supportedEffortLevels: levels },
                { value: 'sonnet', displayName: 'Sonnet', description: 'Fast for everyday parts', supportedEffortLevels: levels },
                { value: 'haiku', displayName: 'Haiku', description: 'Fastest', supportedEffortLevels: ['low', 'medium', 'high'] },
              ],
            }
          : {};
      out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response } });
      continue;
    }
    out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.18, resetsAt: now + 3 * 3600 }, seven_day: { utilization: 0.34, resetsAt: now + 4 * 86400 } } } });
    const raw = message.message.content;
    const content = typeof raw === 'string' ? raw : raw.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join('\n');

    if (content.includes('Research')) {
      const tools = args.includes('--tools') ? args[args.indexOf('--tools') + 1] : '';
      if (!tools.includes('WebSearch')) {
        say('Web research is turned off in the settings.');
        continue;
      }
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'ws1', name: 'WebSearch', input: { query: '608 bearing dimensions' } }] } });
      const links = JSON.stringify([
        { title: '608-2RS deep groove ball bearing – data sheet', url: 'https://bearing-tables.example/608-2rs' },
        { title: 'Miniature bearing sizes 6xx', url: 'https://bearing-tables.example/sizes' },
      ]);
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'ws1', content: `Web search results for query: "608 bearing dimensions"\n\nLinks: ${links}` }] } });
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'wf1', name: 'WebFetch', input: { url: 'https://bearing-tables.example/608-2rs', prompt: 'dimensions' } }] } });
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'wf1', content: 'Bore 8 mm, outside 22 mm, width 7 mm.' }] } });
      say(
        'A **608** bearing is **8 × 22 × 7 mm** (bore × outside × width).\n\n' +
          'For a press fit in PLA I would make the seat **22.1 mm** with a 0.5 mm chamfer at the entry, so the bearing goes in by hand and stays. Shall I add a seat like that to the part?',
      );
      continue;
    }

    const client = server ? new Client({ name: 'site-claude', version: '1.0.0' }) : null;
    await client?.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
    if (typeof raw !== 'string' && raw.some((block) => block.type === 'image')) {
      await client?.callTool({ name: 'partbuddy_ask', arguments: { questions: SKETCH_ROUND } });
      await client?.close();
      say('I see an L-shaped bracket: a long leg to screw to the wall and a short foot for the shelf. Two sizes are missing before I build it.');
    } else if (content.includes('cable clip')) {
      for (const step of CABLE_CLIP) await client?.callTool({ name: 'execute', arguments: step });
      await client?.close();
      say(
        'The cable clip is built: a **64 × 32 mm** base plate with two countersunk holes for M3 screws and a snap clip for a **12 mm** cable.\n\n' +
          'Plate size, cable diameter and snap opening are favourite parameters with their ranges, so you can change them with the sliders.',
      );
    } else if (content.includes('housing')) {
      await client?.callTool({ name: 'partbuddy_ask', arguments: { questions: HOUSING_ROUND } });
      await client?.close();
      say('Before I build the housing, two questions about the lid and the openings.');
    } else {
      await client?.callTool({ name: 'inspect_design', arguments: { measure: false } });
      await client?.close();
      say('Done.');
    }
  }
}
