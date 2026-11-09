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
// For the pictures it gets the finish a real answer would add: rounded clip and root, engraved size.
const CABLE_CLIP = [
  ...JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', '..', 'tools', 'fixtures', 'cable-clip.script.json'), 'utf8')).commands,
  {"command":"solid.fillet","params":{"edges":[[10,10,8],[-10,10,8],[10,-10,8],[-10,-10,8]],"radius":"1.5 mm","tangent_chain":false,"name":"ClipCorners"}},
  {"command":"solid.fillet","params":{"edges":[[0,10,4],[0,-10,4]],"radius":"1.5 mm","name":"ClipRoot"}},
  {"command":"sketch.create","params":{"plane":"XY","offset":3.5,"name":"Label"}},
  {"command":"sketch.text","params":{"text":"Ø12","at":[-4,-14.8],"height":3}},
  {"command":"solid.extrude","params":{"sketch":"Label","distance":1,"operation":"cut","targets":["CableClip"],"name":"LabelEngraved"}},
  {"command":"browser.visibility","params":{"visible":false,"folder":"sketches"}},
];

// A case and a flat lid 0.1 mm above its rim: the indicator flags it as tighter than the push fit.
const CASE_AND_LID = [
  {"command":"solid.box","params":{"length":40,"width":30,"height":18,"operation":"new","body_name":"Case","name":"Case"}},
  {"command":"solid.fillet","params":{"edges":[[0,0,9],[40,0,9],[0,30,9],[40,30,9]],"radius":4,"body":"Case","name":"Case corners"}},
  {"command":"solid.shell","params":{"faces":["F1:+z"],"thickness":2,"body":"Case","name":"Hollow"}},
  {"command":"solid.chamfer","params":{"edges":[[20,0,0]],"distance":0.6,"body":"Case","name":"Bed chamfer"}},
  {"command":"solid.cylinder","params":{"diameter":12,"height":4,"base":[20,-1,18],"axis":"Y","operation":"cut","targets":["Case"],"name":"Finger notch"}},
  {"command":"solid.box","params":{"length":40,"width":30,"height":2,"corner":[0,0,18.1],"operation":"new","body_name":"Lid","name":"Lid"}},
  {"command":"solid.fillet","params":{"edges":[[0,0,19.1],[40,0,19.1],[0,30,19.1],[40,30,19.1]],"radius":4,"body":"Lid","name":"Lid corners"}},
  {"command":"solid.fillet","params":{"edges":[[20,0,20.1]],"radius":0.8,"body":"Lid","name":"Lid edge"}},
];

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
    options: [{ label: 'USB-C', recommended: true }, { label: 'LED window', recommended: true }, { label: 'Button' }],
    multiSelect: true,
  },
];

const SKETCH_ROUND = [
  {
    header: 'Height',
    question: 'How tall is the plate? Your sketch gives only its width of 40 mm.',
    options: [{ label: '30 mm', detail: 'Keeps the proportions of your sketch', recommended: true }, { label: '40 mm' }, { label: '50 mm' }],
  },
  {
    header: 'Thickness',
    question: 'How thick should the bracket be?',
    options: [{ label: '3 mm', detail: 'Stiff enough with the R 3 bend', recommended: true }, { label: '4 mm' }],
  },
];

const PHOTO_ROUND = [
  {
    header: 'Size',
    question: 'How long is the box? One real measure sets the scale of the photo.',
    options: [{ label: 'About 60 mm', recommended: true }, { label: 'About 80 mm' }, { label: 'About 100 mm' }],
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

    // PartBuddy's notes and earlier messages can go along with the user's words, so each answer keys on
    // the phrase of the user's own that comes last.
    const said = ['Research the', 'Build a cable clip', 'Build a case and a lid', 'Fit this housing']
      .map((phrase) => [phrase, content.lastIndexOf(phrase)])
      .filter(([, at]) => at >= 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const picture = typeof raw !== 'string' && raw.some((block) => block.type === 'image');
    if (said === 'Research the' && !picture) {
      const tools = args.includes('--tools') ? args[args.indexOf('--tools') + 1] : '';
      if (!tools.includes('WebSearch')) {
        say('Web research is turned off in the settings.');
        continue;
      }
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'ws1', name: 'WebSearch', input: { query: 'ISO 4762 M3 socket head cap screw dimensions' } }] } });
      const links = JSON.stringify([
        { title: 'ISO 4762 socket head cap screws – size table', url: 'https://fastener-tables.example/iso-4762' },
        { title: 'Clearance holes for metric screws (ISO 273)', url: 'https://fastener-tables.example/iso-273' },
      ]);
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'ws1', content: `Web search results for query: "ISO 4762 M3 socket head cap screw dimensions"\n\nLinks: ${links}` }] } });
      out({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'wf1', name: 'WebFetch', input: { url: 'https://fastener-tables.example/iso-4762', prompt: 'M3 head size' } }] } });
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'wf1', content: 'M3: head diameter 5.5 mm, head height 3 mm.' }] } });
      say(
        'An **M3** socket head cap screw (ISO 4762) has a **5.5 mm** head, 3 mm high. The lid holes are **3.4 mm**, the normal clearance for M3 (ISO 273), and the bosses leave room for the head.\n\n' +
          'An M3 × 10 goes through the 2 mm lid and 8 mm into the insert below it. I seated one in a corner of the lid so you can check the length.',
      );
      continue;
    }

    const client = server ? new Client({ name: 'site-claude', version: '1.0.0' }) : null;
    await client?.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }));
    if (picture && content.includes('photo of a real object')) {
      await client?.callTool({ name: 'partbuddy_ask', arguments: { questions: PHOTO_ROUND } });
      await client?.close();
      say('I see a rectangular box with a separate lid that sits on a lip. To build a holder that fits it I need one real measure.');
    } else if (picture) {
      await client?.callTool({ name: 'partbuddy_ask', arguments: { questions: SKETCH_ROUND } });
      await client?.close();
      say('I see a 40 mm wide plate with an Ø 8 hole and an M3 hole, bent into an L with an R 3 inner radius. Two measures are missing before I build it.');
    } else if (said === 'Build a cable clip') {
      for (const step of CABLE_CLIP) await client?.callTool({ name: 'execute', arguments: step });
      await client?.close();
      say(
        'The cable clip is built: a **64 × 32 mm** base plate with two countersunk holes for M3 screws and a snap clip for a **12 mm** cable, its size engraved beside it.\n\n' +
          'Plate size, cable diameter and snap opening are favourite parameters with their ranges, so you can change them with the sliders.',
      );
    } else if (said === 'Build a case and a lid') {
      for (const step of CASE_AND_LID) await client?.callTool({ name: 'execute', arguments: step });
      await client?.close();
      say('The case and a flat lid are built, the lid **0.1 mm** above the rim. The print indicator shows that as tighter than the push fit for PLA: printed like this, the two would fuse.');
    } else if (said === 'Fit this housing') {
      await client?.callTool({ name: 'partbuddy_ask', arguments: { questions: HOUSING_ROUND } });
      await client?.close();
      say('The board fits with 13 mm to spare on each side. Before I add the openings, two questions about the lid and the openings.');
    } else {
      await client?.callTool({ name: 'inspect_design', arguments: { measure: false } });
      await client?.close();
      say('Done.');
    }
  }
}
