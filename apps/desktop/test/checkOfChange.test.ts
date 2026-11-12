import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import { GateProxy, type ToolResult, type UpstreamTools } from '../src/main/agents/gateProxy';
import { policyToolSet } from '../src/main/agents/loop';
import { WorkLog } from '../src/main/agents/workLog';
import { CHECK_PENDING, withCheckOfChange, type CheckState } from '../src/main/print/printCheckNote';
import type { PrintCheckReport } from '../src/shared/contract';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const thinWall: PrintCheckReport['findings'][number] = { kind: 'thinWall', severity: 'block', floor: false, thickness: 0.3, minimum: 0.9, area: 400, places: [{ body: 'Plate', faces: ['F2:side:0'] }] };

/**
 * The tool chain as index.ts builds it for every route, with a design whose `solid.extrude` leaves a
 * 0.3 mm wall. `checkAfterMs`: how long mirror and check take after a change; null: they never come.
 */
function setup(checkAfterMs: number | null, waitMs = 1000) {
  let revision = 1;
  const state: CheckState = { mirrored: { documentId: 'doc-1', revision: 1 }, report: { status: 'ready', findings: [], nozzle: 0.4, revision: 1 } };
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([{ name: 'execute', inputSchema: { type: 'object' } }]),
    callTool: (_name, args): Promise<ToolResult> => {
      if (args.command === 'solid.extrude') {
        revision += 1;
        const built = revision;
        if (checkAfterMs !== null)
          setTimeout(() => {
            state.mirrored = { documentId: 'doc-1', revision: built };
            state.report = { status: 'block', findings: [thinWall], nozzle: 0.4, revision: built };
          }, checkAfterMs);
      }
      return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
    },
  };
  const log = new WorkLog({
    history: () => Promise.resolve({ documentId: 'doc-1', revision, undo: revision - 1, redo: 0 }),
    travel: () => Promise.resolve(),
    emit: () => undefined,
    changed: (result, after) => withCheckOfChange(result, after, () => state, waitMs),
  });
  return log.tools(upstream);
}

const extrude = { command: 'solid.extrude', params: { distance: 5 } };
const BLOCKED = 'not ready to print.\n- blocks printing: walls down to 0.3 mm, thinner than the 0.4 mm nozzle';

/** What Claude Code reads: the tool result through the gate proxy. */
async function throughProxy(tools: UpstreamTools, args: Record<string, unknown>): Promise<string> {
  const proxy = new GateProxy(tools, () => undefined);
  await proxy.start();
  cleanups.push(() => proxy.stop());
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(proxy.url), { requestInit: { headers: { Authorization: `Bearer ${proxy.token}` } } }));
  cleanups.push(() => client.close());
  const result = await client.callTool({ name: 'execute', arguments: args });
  return (result.content as { text: string }[]).map((part) => part.text).join('\n');
}

/** What ChatGPT and local models read: the tool result of PartBuddy's own loop. */
async function throughLoop(tools: UpstreamTools, args: Record<string, unknown>): Promise<string> {
  const set = await policyToolSet(tools, { nextId: () => 'call-1', event: () => undefined });
  const execute = set.execute?.execute as (input: unknown, options: unknown) => Promise<string>;
  return execute(args, { toolCallId: 'call-1', messages: [] });
}

describe('the print check of a change comes back with the tool that made it (audit R1)', () => {
  it('puts a blocking check into the answer of the changing call on the Claude Code route', async () => {
    const text = await throughProxy(setup(150), extrude);
    expect(text).toContain('ok');
    expect(text).toContain(BLOCKED);
  });

  it('does the same in the loop of ChatGPT and local models', async () => {
    const text = await throughLoop(setup(150), extrude);
    expect(text).toContain(BLOCKED);
  });

  it('adds nothing to a call that changed nothing', async () => {
    const read = { command: 'inspect.measure', params: {} };
    expect(await throughProxy(setup(150), read)).toBe('ok');
    expect(await throughLoop(setup(150), read)).toBe('ok');
  });

  it('waits a bounded time and then says the check is still running, never an older verdict', async () => {
    const started = Date.now();
    const text = await throughLoop(setup(null, 300), extrude);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(text).toBe(`ok\n${CHECK_PENDING}`);
    expect(text).not.toContain('nothing found');
  });

  it('takes a mirror that is past the change, and no check of another design', async () => {
    const result: ToolResult = { content: [{ type: 'text', text: 'ok' }] };
    const report: PrintCheckReport = { status: 'block', findings: [thinWall], nozzle: 0.4, revision: 9 };
    const text = async (state: CheckState) => (await withCheckOfChange(result, { documentId: 'doc-1', revision: 7 }, () => state, 0)).content.at(-1)?.text;
    expect(await text({ mirrored: { documentId: 'doc-1', revision: 9 }, report })).toContain('blocks printing');
    expect(await text({ mirrored: { documentId: 'doc-2', revision: 9 }, report })).toBe(CHECK_PENDING);
    expect(await text({ mirrored: { documentId: 'doc-1', revision: 9 }, report: { ...report, revision: 6 } })).toBe(CHECK_PENDING);
    expect(await text({ mirrored: null, report: null })).toBe(CHECK_PENDING);
  });
});
