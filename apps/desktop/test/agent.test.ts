import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentService } from '../src/main/agents/agentService';
import { findClaudeCode, parseStreamLine, roleOf } from '../src/main/agents/claudeCode';
import { instructionsFor, MAX_STEPS, REFUSAL_GUIDANCE } from '../src/main/agents/loop';
import { GateProxy, REPEAT_REASON, type ToolCallRecord, type UpstreamTools } from '../src/main/agents/gateProxy';
import { photoFile, photoNote } from '../src/main/agents/photoNote';
import { decide, TOOL_ARGUMENTS } from '../src/main/agents/policy';
import { TOOL_NOTES } from '../src/main/agents/toolNotes';
import { reduce, type ConversationItem } from '../src/renderer/src/assistant/store';
import type { AgentEvent, AgentStatus, ModelChoice } from '../src/shared/contract';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function fakeUpstream() {
  const calls: string[] = [];
  const upstream: UpstreamTools = {
    instructions: () => 'SolidCraft drives the app.',
    listTools: () =>
      Promise.resolve([
        { name: 'inspect_design', description: 'The whole design', inputSchema: { type: 'object', properties: {} } },
        { name: 'export', description: 'Export bodies', inputSchema: { type: 'object', properties: {} } },
      ]),
    callTool: (name) => {
      calls.push(name);
      return Promise.resolve({ content: [{ type: 'text', text: `${name} ok` }] });
    },
  };
  return { upstream, calls };
}

describe('tool policy', () => {
  it('allows reading and modelling tools', () => {
    expect(decide('inspect_design', {})).toEqual({ allow: true });
    expect(decide('execute', { command: 'solid.extrude', params: {} })).toEqual({ allow: true });
  });

  it('refuses tools that discard the design or touch files, with a reason', () => {
    for (const name of ['new_design', 'open', 'save', 'export']) {
      const decision = decide(name, {});
      expect(decision.allow, name).toBe(false);
    }
    expect(decide('unknown_tool', {}).allow).toBe(false);
  });

  it('refuses file commands hidden in execute and batch', () => {
    expect(decide('execute', { command: 'file.export', params: {} }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'sketch.line' }, { command: 'doc.open' }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'sketch.line' }] }).allow).toBe(true);
  });

  it('decides tools that SolidCraft runs as batch steps like the tools themselves', () => {
    for (const command of ['save', 'open', 'new_design', 'export', 'crash_reports']) {
      const decision = decide('batch', { commands: [{ command: 'solid.box', params: {} }, { command, params: { path: 'part.sc' } }] });
      expect(decision.allow, command).toBe(false);
      if (!decision.allow) expect(decision.reason).toContain(`batch step 1 (${command})`);
    }
    const nested = { commands: [{ command: 'execute', params: { command: 'file.save_as', params: { path: 'x.sc' } } }] };
    expect(decide('batch', nested).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'set_parameter', params: { name: 'L', value: 40 } }] }).allow).toBe(true);
  });

  it('refuses settings, diagnostics and checkpoint commands with the next step', () => {
    expect(decide('execute', { command: 'settings.profile.export', params: { name: 'a' } }).allow).toBe(false);
    expect(decide('execute', { command: 'diagnostics.crash_reports', params: {} }).allow).toBe(false);
    const restore = decide('batch', { commands: [{ command: 'edit.restore_checkpoint', params: { checkpoint: 1 } }] });
    expect(restore.allow).toBe(false);
    if (!restore.allow) expect(restore.reason).toContain('Use undo and redo');
  });

  it('refuses a file path on any command but keeps geometry paths', () => {
    for (const path of ['out.dxf', 'designs\\part', 'notes']) {
      expect(decide('execute', { command: 'sketch.export_dxf', params: { path } }).allow, path).toBe(false);
    }
    expect(decide('execute', { command: 'sketch.export_dxf', params: {} }).allow).toBe(true);
    expect(decide('execute', { command: 'parameters.export', params: { format: 'json' } }).allow).toBe(true);
    expect(decide('execute', { command: 'solid.pattern.path', params: { path: ['l1', 'l2'], count: 3 } }).allow).toBe(true);
    expect(decide('execute', { command: 'construct.point.along_path', params: { path: 'l1', t: 0.5 } }).allow).toBe(true);
    expect(decide('execute', { command: 'component.activate', params: { component: 1, path: [2, 3] } }).allow).toBe(true);
  });

  it('refuses to write a component\'s description, which tells a bought part from a printed one (audit H-01)', () => {
    // Measured with SolidCraft 0.40.1: after this call the 0.3 mm lid was a "standard part", out of print check and export.
    const forged = decide('execute', { command: 'component.metadata.set', params: { component: 'Deckel', description: 'Hex nut M3' } });
    expect(forged.allow).toBe(false);
    if (!forged.allow) expect(forged.reason).toContain('parts.insert');
    // The other form SolidCraft takes, as a batch step, and with an empty text (which removes a real part's description).
    expect(decide('execute', { command: 'component.metadata.set', params: { component: 'Deckel', values: { description: 'Hex nut M3' } } }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'component.metadata.set', params: { component: 3, description: 'Plain washer M3' } }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'execute', params: { command: 'component.metadata.set', params: { component: 3, description: '' } } }] }).allow).toBe(false);
    // What says nothing about bought or printed stays: other properties, the name, reading.
    expect(decide('execute', { command: 'component.metadata.set', params: { component: 'Deckel', revision: 'B', properties: { description: 'Hex nut M3' } } }).allow).toBe(true);
    expect(decide('execute', { command: 'component.rename', params: { component: 'Deckel', name: 'Hex nut M3' } }).allow).toBe(true);
    expect(decide('execute', { command: 'component.metadata', params: { component: 'Deckel' } }).allow).toBe(true);
    expect(decide('execute', { command: 'parts.insert', params: { family: 'hex_nut', size: 'M3' } }).allow).toBe(true);
  });

  it('lets a tool of SolidCraft through only with the arguments it is known to take, and with no file but a photo the user sent', () => {
    // Measured with SolidCraft 0.40.1: screenshot {path} wrote its PNG (442 140 bytes) over a JSON file in the cache folder.
    const cache = join(tmpdir(), 'PartBuddy', 'cache', 'part-references.json');
    const screenshot = decide('screenshot', { path: cache });
    expect(screenshot.allow).toBe(false);
    if (!screenshot.allow) expect(screenshot.reason).toContain('Leave out path');
    expect(decide('screenshot', { path: 'new.png', view: 'iso' }).allow).toBe(false);
    expect(decide('screenshot', { view: 'iso', width: 800 })).toEqual({ allow: true });
    // A skill's document goes by its name.
    expect(decide('skill_reference', { skill: 'solidcraft-modeling', file: 'SKILL.md' })).toEqual({ allow: true });
    expect(decide('skill_reference', { skill: 'solidcraft-modeling' })).toEqual({ allow: true });
    expect(decide('skill_reference', { skill: 'solidcraft-modeling', file: '../../secret.md' }).allow).toBe(false);
    // Every tool let through has its arguments listed, and takes each of them.
    const tools = ['list_commands', 'describe_command', 'execute', 'batch', 'inspect_design', 'measure', 'body_topology', 'set_parameter', 'check_parameters', 'screenshot', 'compare_picture', 'running', 'pending', 'undo', 'redo', 'skill_reference'];
    expect(Object.keys(TOOL_ARGUMENTS).sort()).toEqual([...tools].sort());
    const steps = ['set_parameter', 'list_commands', 'describe_command', 'execute', 'measure', 'compare_picture', 'inspect_design', 'undo', 'redo'];
    for (const tool of tools) {
      // execute and batch need their command or steps in a form the policy can read (audit H-30).
      const base: Record<string, unknown> = tool === 'execute' ? { command: 'solid.box' } : tool === 'batch' ? { commands: [] } : {};
      expect(decide(tool, base), tool).toEqual({ allow: true });
      for (const argument of TOOL_ARGUMENTS[tool] ?? []) {
        if (['reference', 'file', 'commands', 'command', 'params'].includes(argument)) continue;
        expect(decide(tool, { ...base, [argument]: 1 }), `${tool} ${argument}`).toEqual({ allow: true });
      }
      // An argument that is not listed is refused, whatever it is called: a later SolidCraft may write a file with it.
      for (const argument of ['path', 'file', 'reference', 'output', 'out', 'filename', 'dest', 'image', 'dir', 'depth']) {
        if ((TOOL_ARGUMENTS[tool] ?? []).includes(argument)) continue;
        const decision = decide(tool, { ...base, [argument]: cache });
        expect(decision.allow, `${tool} ${argument}`).toBe(false);
        // The same as a batch step, for the tools SolidCraft runs as steps.
        if (steps.includes(tool)) expect(decide('batch', { commands: [{ command: tool, params: { [argument]: cache } }] }).allow, `batch step ${tool} ${argument}`).toBe(false);
      }
    }
    const unknown = decide('measure', { dest: 'x' });
    if (!unknown.allow) expect(unknown.reason).toBe('measure takes no argument dest in PartBuddy; its arguments are: body, items, names_only, summary.');
    // An engine command reads a file through `file` as well as through `path`.
    expect(decide('execute', { command: 'sketch.replace', params: { from: 'Sketch1', file: cache } }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'Sketch.Replace', params: { from: 'Sketch1', file: 'other.sc' } }] }).allow).toBe(false);
    // A geometry reference is no file.
    expect(decide('execute', { command: 'construct.plane.tangent', params: { reference: 'XY', face: [0, 0, 1] } })).toEqual({ allow: true });
    // PartBuddy's own tools are not SolidCraft's: a drawing is named, not read from a path the assistant gives.
    expect(decide('partbuddy_place_drawing', { file: 'logo.svg', body: 'Cube' })).toEqual({ allow: true });
  });

  it('takes for the user\'s photo only the file PartBuddy kept, not a path that looks like one (last review, 4)', () => {
    const project = join(tmpdir(), 'PartBuddy', 'Hook');
    const photo = photoFile(project, new Date(2026, 10, 12, 10, 15, 0));
    const calls = (reference: string): [string, Record<string, unknown>][] => [
      ['compare_picture', { reference, view: 'top' }],
      ['execute', { command: 'inspect.compare_picture', params: { reference } }],
      ['execute', { command: 'canvas.insert', params: { path: reference, plane: 'XY', width: 120 } }],
      ['batch', { commands: [{ command: 'compare_picture', params: { reference } }] }],
    ];
    // Before PartBuddy kept and named it, the path is a path like any other.
    for (const [tool, args] of calls(photo)) expect(decide(tool, args).allow, `${tool} before`).toBe(false);
    photoNote([photo]);
    for (const [tool, args] of calls(photo)) expect(decide(tool, args), tool).toEqual({ allow: true });
    // The same file as the model copies it: forward slashes, another case.
    for (const [tool, args] of calls(photo.replaceAll('\\', '/'))) expect(decide(tool, args), tool).toEqual({ allow: true });
    expect(decide('compare_picture', { reference: photo.toUpperCase().replace('.PNG', '.png').replace('PHOTOS', 'photos').replace('PHOTO-', 'photo-') })).toEqual({ allow: true });
    const name = 'photo-20261112-101500.png';
    const others: Record<string, string> = {
      'another project': join(tmpdir(), 'PartBuddy', 'OTHER', 'photos', name),
      'a photo not kept': photoFile(project, new Date(2026, 10, 12, 10, 15, 1)),
      'a network share': `//server/share/photos/${name}`,
      'a network share with backslashes': `\\\\server\\share\\photos\\${name}`,
      'a device path': `\\\\.\\${photo}`,
      'a long path prefix': `\\\\?\\${photo}`,
      'a relative path': `photos/${name}`,
      'a path from the working folder': `Hook/photos/${name}`,
      'a short 8.3 name': photo.replace('PartBuddy', 'PARTBU~1'),
      'a way round': [project, 'photos', '..', 'photos', name].join(sep),
      'another file': join(project, 'photos', 'holiday.png'),
    };
    for (const [what, reference] of Object.entries(others)) {
      for (const [tool, args] of calls(reference)) expect(decide(tool, args).allow, `${what}: ${tool}`).toBe(false);
    }
    expect(decide('compare_picture', { reference: [photo] }).allow).toBe(false);
  });

  it('decides a command id in any spelling SolidCraft runs: every rule holds for mixed case', () => {
    // Measured with SolidCraft 0.40.1: each of these ran as written and was allowed, because the rules compared the id exactly.
    const set = { component: 'Deckel', description: 'Hex nut M3' };
    const key = 'io.github.manuelstaggl.partbuddy.standard-parts';
    const refused: [string, Record<string, unknown>][] = [
      ['execute', { command: 'Component.Metadata.Set', params: set }],
      ['batch', { commands: [{ command: 'COMPONENT.METADATA.SET', params: set }] }],
      ['batch', { commands: [{ command: 'execute', params: { command: 'COMPONENT.METADATA.SET', params: set } }] }],
      ['execute', { command: 'Document.Metadata.Set', params: { values: { [key]: { bodies: ['Deckel'] } } } }],
      ['execute', { command: 'Document.Metadata.Remove', params: { key } }],
      ['execute', { command: 'Edit.Checkpoint', params: {} }],
      ['execute', { command: 'EDIT.RESTORE_CHECKPOINT', params: { checkpoint: 1 } }],
      ['execute', { command: 'File.Export', params: { format: 'stl' } }],
      ['execute', { command: 'Doc.recovery_list', params: {} }],
      ['execute', { command: 'Settings.profile.apply', params: { name: 'a' } }],
      ['execute', { command: 'Diagnostics.Crash_Reports', params: {} }],
      ['execute', { command: 'Parameters.Export', params: { path: 'out.json' } }],
      ['execute', { command: ' file.export ', params: {} }],
      // A batch step's tool in another case is no tool for SolidCraft; decided as the tool, it stays refused.
      ['batch', { commands: [{ command: 'Save', params: {} }] }],
      ['batch', { commands: [{ command: 'New_Design', params: {} }] }],
      // SolidCraft takes a step's command as `id` too, and a batch's steps from a script file.
      ['batch', { commands: [{ id: 'component.metadata.set', params: set }] }],
      ['batch', { commands: [{ id: 'execute', params: { command: 'component.metadata.set', params: set } }] }],
      ['batch', { commands: [{ command: 'document.revision', id: 'file.export', params: {} }] }],
      ['batch', { path: 'steps.json' }],
    ];
    for (const [tool, args] of refused) expect(decide(tool, args).allow, JSON.stringify(args)).toBe(false);
    // Tool names SolidCraft knows only as written; another case is no tool and stays refused.
    expect(decide('Execute', { command: 'solid.box', params: {} }).allow).toBe(false);
    expect(decide('BATCH', { commands: [] }).allow).toBe(false);
    // What was allowed stays allowed in any case, the photo canvas too.
    expect(decide('execute', { command: 'Solid.Extrude', params: {} })).toEqual({ allow: true });
    expect(decide('batch', { commands: [{ command: 'SOLID.BOX', params: {} }, { id: 'Sketch.Finish' }] })).toEqual({ allow: true });
    expect(decide('execute', { command: 'Construct.Point.Along_Path', params: { path: 'l1', t: 0.5 } }).allow).toBe(true);
    // Parameter keys SolidCraft reads only as written: `Path` writes no file (measured), so it is not taken for one.
    expect(decide('execute', { command: 'parameters.export', params: { Path: 'out.json' } }).allow).toBe(true);
  });
});

describe('gate proxy', () => {
  async function startProxy() {
    const { upstream, calls } = fakeUpstream();
    const records: ToolCallRecord[] = [];
    const proxy = new GateProxy(upstream, (record) => records.push(record));
    await proxy.start();
    cleanups.push(() => proxy.stop());
    return { proxy, calls, records };
  }

  async function connect(proxy: GateProxy, token = proxy.token) {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(proxy.url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
    );
    cleanups.push(() => client.close());
    return client;
  }

  it('lists the SolidCraft tools the policy offers and forwards allowed calls (audit S-04)', async () => {
    const { proxy, calls, records } = await startProxy();
    const client = await connect(proxy);
    const { tools } = await client.listTools();
    // export is refused whatever its arguments, so it is not offered.
    expect(tools.map((tool) => tool.name)).toEqual(['inspect_design']);
    expect(client.getInstructions()).toBe(`SolidCraft drives the app.\n\n${TOOL_NOTES}`);
    const result = await client.callTool({ name: 'inspect_design', arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(calls).toEqual(['inspect_design']);
    expect(records.at(-1)).toMatchObject({ name: 'inspect_design', decision: 'allowed', ok: true });
  });

  it('refuses gated calls without reaching SolidCraft', async () => {
    const { proxy, calls, records } = await startProxy();
    const client = await connect(proxy);
    const result = await client.callTool({ name: 'export', arguments: { path: 'x.3mf' } });
    expect(result.isError).toBe(true);
    expect(calls).toEqual([]);
    expect(records.at(-1)).toMatchObject({ name: 'export', decision: 'denied' });
  });

  it('refuses the third identical call in a row until the next turn', async () => {
    const { proxy, calls, records } = await startProxy();
    const client = await connect(proxy);
    const inspect = () => client.callTool({ name: 'inspect_design', arguments: { timeline: true } });
    await inspect();
    await inspect();
    const third = await inspect();
    expect(third.isError).toBe(true);
    expect(calls).toHaveLength(2);
    expect(records.at(-1)).toMatchObject({ name: 'inspect_design', decision: 'denied', reason: REPEAT_REASON });
    // Other arguments, or a new turn, start the count again.
    await client.callTool({ name: 'inspect_design', arguments: { timeline: false } });
    await inspect();
    await inspect();
    proxy.newTurn();
    await inspect();
    expect(calls).toHaveLength(6);
  });

  it('refuses requests without the token or for another host', async () => {
    const { proxy } = await startProxy();
    await expect(connect(proxy, 'wrong')).rejects.toThrow();
    // A DNS-rebinding page would send its own host name; fetch cannot set Host, node:http can.
    const status = await new Promise<number | undefined>((done) => {
      const call = request(
        { host: '127.0.0.1', port: proxy.port, path: '/mcp', method: 'POST', headers: { Host: 'evil.example', Authorization: `Bearer ${proxy.token}` } },
        (response) => {
          response.resume();
          done(response.statusCode);
        },
      );
      call.end('{}');
    });
    expect(status).toBe(401);
  });
});

describe('Claude Code adapter', () => {
  it('maps stream-json lines to events', () => {
    expect(parseStreamLine('{"type":"system","subtype":"init","model":"m"}')).toEqual([{ type: 'started', model: 'm' }]);
    expect(
      parseStreamLine('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}'),
    ).toEqual([{ type: 'textDelta', text: 'Hi' }]);
    expect(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"text","text":"A"},{"type":"tool_use"}]}}')).toEqual([
      { type: 'text', text: 'A' },
    ]);
    // Text blocks around a tool call stay paragraphs, while streaming and in the final text.
    expect(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"text","text":"A."},{"type":"tool_use"},{"type":"text","text":"B"}]}}')).toEqual([
      { type: 'text', text: 'A.\n\nB' },
    ]);
    expect(parseStreamLine('{"type":"stream_event","event":{"type":"content_block_start","index":2,"content_block":{"type":"text","text":""}}}')).toEqual([
      { type: 'textDelta', text: '\n\n' },
    ]);
    expect(parseStreamLine('{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}')).toEqual([]);
    expect(parseStreamLine('{"type":"result","subtype":"error_max_turns","is_error":true}')).toEqual([
      { type: 'done', ok: false, durationMs: null, detail: 'error_max_turns' },
    ]);
    // An expired sign-in comes as a "success" with is_error; a plain error with is_error is a failure, not a stop.
    expect(parseStreamLine('{"type":"result","subtype":"success","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed"}')).toEqual([
      { type: 'done', ok: false, durationMs: null, detail: 'signedOut', reason: 'Failed to authenticate: OAuth session expired and could not be refreshed' },
    ]);
    // The made-up answer before it stays out of the chat: the German card says it (chat polish).
    expect(
      parseStreamLine(
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Failed to authenticate: OAuth session expired and could not be refreshed"}]},"error":"authentication_failed","isApiErrorMessage":true}',
      ),
    ).toEqual([]);
    // Another Claude Code process renewing the shared token is a failed turn, not a sign-out (2026-11-08).
    const refreshing = 'Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh';
    expect(parseStreamLine(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: refreshing }))).toEqual([
      { type: 'done', ok: false, durationMs: null, detail: 'failed', reason: refreshing },
    ]);
    expect(parseStreamLine('{"type":"result","subtype":"success","is_error":true,"result":"API Error: 500"}')).toEqual([
      { type: 'done', ok: false, durationMs: null, detail: 'failed', reason: 'API Error: 500' },
    ]);
    expect(parseStreamLine('not json')).toEqual([]);
    // The plan's limits after a request (Claude Code 2.1.302); odd values are left out or clamped.
    expect(
      parseStreamLine('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","unifiedWindows":{"five_hour":{"utilization":1.2},"seven_day":{"utilization":0.69,"resetsAt":1794117600},"odd":{"utilization":"x"}}}}'),
    ).toEqual([{ type: 'usage', windows: [{ window: 'five_hour', used: 1, resetsAt: null }, { window: 'seven_day', used: 0.69, resetsAt: 1794117600 }] }]);
    expect(parseStreamLine('{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}')).toEqual([]);
    // Context: each request's prompt and answer, and the window with the result; odd counts are ignored.
    expect(parseStreamLine('{"type":"assistant","message":{"content":[],"usage":{"input_tokens":2,"cache_read_input_tokens":70,"cache_creation_input_tokens":18,"output_tokens":4}}}')).toEqual([{ type: 'context', used: 94 }]);
    expect(parseStreamLine('{"type":"assistant","message":{"content":[],"usage":{"input_tokens":2,"output_tokens":-1}}}')).toEqual([]);
    expect(parseStreamLine('{"type":"result","subtype":"success","modelUsage":{"a":{"contextWindow":200000},"b":{"contextWindow":1000000},"c":{"contextWindow":"x"}}}')[0]).toEqual({ type: 'context', size: 1000000 });
    // Compacting (audit H-11): the boundary, with or without a usable size.
    expect(parseStreamLine('{"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"auto","pre_tokens":180000}}')).toEqual([{ type: 'compacted', tokens: 180000 }]);
    expect(parseStreamLine('{"type":"system","subtype":"compact_boundary","compact_metadata":{"pre_tokens":-1}}')).toEqual([{ type: 'compacted', tokens: null }]);
    expect(parseStreamLine('{"type":"system","subtype":"compact_boundary"}')).toEqual([{ type: 'compacted', tokens: null }]);
    expect(parseStreamLine('{"type":"system","subtype":"status"}')).toEqual([]);
  });

  it('tells every route alike what to do when a block or mechanism was not built, and the own loops their rounds (audit R22, R57)', () => {
    const upstream: UpstreamTools = { instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.reject(new Error('unused')) };
    for (const role of [roleOf(false), roleOf(true), instructionsFor(upstream, false)]) {
      expect(role).toContain(REFUSAL_GUIDANCE);
      // The old rule made "continue without it" cover "Not built" too.
      expect(role).not.toContain('If PartBuddy refuses a tool, tell the user why');
    }
    expect(REFUSAL_GUIDANCE).toContain('When partbuddy_block or partbuddy_mechanism answers "Not built", correct what it names and call it again; never model that feature yourself instead.');
    expect(instructionsFor(upstream, false)).toContain(`You have ${String(MAX_STEPS)} tool rounds per turn`);
    // Claude Code has no such limit.
    expect(roleOf(false)).not.toContain('tool rounds per turn');
  });

  it('finds the native install in the user folder', () => {
    const home = join(tmpdir(), 'partbuddy-home');
    const expected = join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
    expect(findClaudeCode({}, home, (path) => path === expected)).toEqual({ command: expected, prefix: [] });
    expect(findClaudeCode({}, home, () => false)).toBeNull();
  });

  it('finds a Homebrew install on macOS without the shell PATH', () => {
    const expected = join('/opt/homebrew/bin', 'claude');
    expect(findClaudeCode({}, tmpdir(), (path) => path === expected, 'darwin')).toEqual({ command: expected, prefix: [] });
    expect(findClaudeCode({}, tmpdir(), (path) => path === expected, 'linux')).toBeNull();
  });
});

// Every test starts the fake Claude Code as a real process and waits up to 15 s for it (vi.waitFor below); the
// default 5 s cut that short on a loaded runner (CI of pull request 376).
describe('agent service with a fake Claude Code', { timeout: 20_000 }, () => {
  function setup(env: Record<string, string> = {}) {
    const workDir = mkdtempSync(join(tmpdir(), 'partbuddy-agent-'));
    cleanups.push(() => {
      rmSync(workDir, { recursive: true, force: true });
    });
    const { upstream, calls } = fakeUpstream();
    const billing = { allowed: false };
    const kept: { choice: ModelChoice | null } = { choice: null };
    const choices = { get: () => kept.choice, set: (_route: string, choice: ModelChoice) => (kept.choice = choice) };
    const statuses: AgentStatus[] = [];
    const events: AgentEvent[] = [];
    const service = new AgentService(
      {
        env: {
          ...process.env,
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, resolve(__dirname, 'fakeClaude.mjs')]),
          ...env,
        },
        home: workDir,
        workDir,
        apiBilling: { get: () => billing.allowed, set: (allow: boolean) => (billing.allowed = allow) },
        tools: () => Promise.resolve(upstream),
        log: () => undefined,
        choices,
      },
      { status: (status) => statuses.push(status), event: (event) => events.push(event) },
    );
    cleanups.push(() => service.dispose());
    return { service, statuses, events, calls, workDir, kept };
  }

  it('shows the plan but never account data', async () => {
    const { service } = setup();
    const status = await service.refresh();
    expect(status).toMatchObject({ agent: 'claude-code', state: 'ready', version: '9.9.9', method: 'claude.ai', plan: 'max', apiBillingAllowed: false });
    expect(JSON.stringify(status)).not.toContain('example.com');
  });

  it('lets Claude Code leave on its own and starts it once for the models, however often it looks', async () => {
    const traceDir = mkdtempSync(join(tmpdir(), 'partbuddy-claude-trace-'));
    cleanups.push(() => {
      rmSync(traceDir, { recursive: true, force: true });
    });
    const { service } = setup({ FAKE_CLAUDE_TRACE_DIR: traceDir });
    // Two looks at once are one; a third later reads no models again.
    await Promise.all([service.refresh(), service.refresh()]);
    await service.refresh();
    expect(readFileSync(join(traceDir, 'starts'), 'utf8')).toBe('start\n');
    // The process was not killed: it wrote its file after its input closed.
    expect(existsSync(join(traceDir, 'left'))).toBe(true);
  });

  it('lists the models of the plan and changes model and effort, also in a running session (B1)', async () => {
    const { service, events, kept } = setup();
    const status = await service.refresh();
    // The aliases with their effort levels; pinned older versions are left out.
    expect(status.models?.map((model) => model.id)).toEqual(['opus', 'sonnet', 'haiku']);
    expect(status.models?.find((model) => model.id === 'haiku')?.efforts).toEqual(['low', 'medium', 'high']);
    // Nothing kept yet: PartBuddy's own standard, not Claude Code's default (the plan's frontier model).
    expect(status).toMatchObject({ model: 'opus', effort: 'medium' });

    // Chosen before the first message: the session starts with it, and it is kept for new chats.
    await service.chooseModel({ model: 'sonnet', effort: 'low' }, true);
    expect(service.status()).toMatchObject({ model: 'sonnet', effort: 'low', defaultChoice: { model: 'sonnet', effort: 'low' } });
    expect(kept.choice).toEqual({ model: 'sonnet', effort: 'low' });
    await service.send('Which model?');
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(1), { timeout: 15_000 });
    expect(events.filter((e) => e.type === 'text').at(-1)).toEqual({ type: 'text', text: 'model sonnet effort low' });
    // After an answer the status carries the plan's limits, and keeps them through a refresh.
    expect(service.status().usage).toEqual([{ window: 'five_hour', used: 0.23, resetsAt: 1794117600 }, { window: 'seven_day', used: 0.69, resetsAt: 1794117600 }]);
    expect((await service.refresh()).usage).toHaveLength(2);
    // And how full the session is: the last request's tokens of the model's window.
    expect(service.status().context).toEqual({ used: 43000, size: 200000 });

    // Changed mid-conversation: the running session switches; the kept default stays.
    await service.chooseModel({ model: 'haiku', effort: 'max' }, false);
    expect(service.status()).toMatchObject({ model: 'haiku', defaultChoice: { model: 'sonnet' } });
    // A level the model does not take becomes a named one ("medium"), never an unnamed default.
    expect(service.status().effort).toBe('medium');
    await service.send('Which model now?');
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(2), { timeout: 15_000 });
    expect(events.filter((e) => e.type === 'text').at(-1)).toEqual({ type: 'text', text: 'model haiku effort medium' });

    await expect(service.chooseModel({ model: 'gpt-9', effort: null }, false)).rejects.toThrow(/not offered/);
  });

  it('asks the user to sign in when Claude Code is signed out', async () => {
    const { service } = setup({ FAKE_CLAUDE_SIGNED_OUT: '1' });
    expect((await service.refresh()).state).toBe('signedOut');
    await expect(service.send('hello')).rejects.toThrow(/signedOut/);
  });

  it('asks Claude Code again after an answer that says the sign-in expired, and stays usable while it holds', async () => {
    const { service, events } = setup();
    await service.refresh();
    await service.send('Expire my sign-in');
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(1), { timeout: 15_000 });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ detail: 'signedOut' });
    // `auth status` still says signed in: the chat is not locked until the next start.
    await vi.waitFor(() => expect(service.status().state).toBe('ready'), { timeout: 15_000 });
    // Let the check's model listing end before the work folder goes.
    expect((await service.refresh()).state).toBe('ready');
  });

  it('uses Claude Code with a subscription unless the user allowed API billing', async () => {
    const { service, events } = setup({ FAKE_CLAUDE_API_KEY: '1' });
    const status = await service.refresh();
    expect(status.state).toBe('needsSubscription');
    await expect(service.send('hello')).rejects.toThrow(/needsSubscription/);
    expect(events).toEqual([]);

    // The user may allow API billing explicitly; then the session runs.
    await service.allowApiBilling(true);
    expect(service.status()).toMatchObject({ state: 'ready', apiBillingAllowed: true });
    await service.send('How many bodies?');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true), { timeout: 15_000 });
    await service.allowApiBilling(false);
    expect(service.status().state).toBe('needsSubscription');
  }, 30_000);

  it('runs a turn through the gate proxy and streams the answer', async () => {
    const { service, events, calls, statuses } = setup();
    await service.refresh();
    await service.send('How many bodies?');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true), { timeout: 15_000 });
    expect(calls).toEqual(['inspect_design']);
    expect(events.find((e) => e.type === 'tool')).toMatchObject({ name: 'inspect_design', decision: 'allowed' });
    expect(events.filter((e) => e.type === 'textDelta').length).toBeGreaterThan(1);
    expect(events.find((e) => e.type === 'text')).toEqual({ type: 'text', text: 'The design has one body.' });
    expect(statuses.at(-1)?.state).toBe('ready');

    // The second turn reuses the session; a gated tool is refused and explained.
    await service.send('Please export it');
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(2), { timeout: 15_000 });
    expect(calls).toEqual(['inspect_design']);
    expect(events.filter((e) => e.type === 'tool').at(-1)).toMatchObject({ name: 'export', decision: 'denied' });
  }, 30_000);

  it('counts a compacted session as fresh once, so the print profile goes along again (audit H-11)', async () => {
    const { service, events } = setup();
    await service.refresh();
    expect(service.freshConversation()).toBe(true);
    await service.send('How many bodies?');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true), { timeout: 15_000 });
    expect(service.freshConversation()).toBe(false);
    await service.send('Compact now');
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(2), { timeout: 15_000 });
    expect(service.freshConversation()).toBe(true);
    // The next message carried the notes: the session is no longer fresh.
    await service.send('How many bodies?');
    expect(service.freshConversation()).toBe(false);
    await vi.waitFor(() => expect(events.filter((e) => e.type === 'done')).toHaveLength(3), { timeout: 15_000 });
  }, 30_000);

  it('removes its MCP configuration with the token on dispose', async () => {
    const { service, events, workDir } = setup();
    await service.refresh();
    await service.send('How many bodies?');
    await vi.waitFor(() => expect(events.some((e) => e.type === 'done')).toBe(true), { timeout: 15_000 });
    expect(readdirSync(workDir).some((name) => name.startsWith('mcp-'))).toBe(true);
    await service.dispose();
    expect(readdirSync(workDir).some((name) => name.startsWith('mcp-'))).toBe(false);
  }, 30_000);
});

describe('conversation items', () => {
  it('joins deltas into one answer and closes it with the final text', () => {
    let items: ConversationItem[] = [];
    const events: AgentEvent[] = [
      { type: 'user', text: 'Hi' },
      { type: 'textDelta', text: 'Hel' },
      { type: 'textDelta', text: 'lo' },
      { type: 'text', text: 'Hello' },
      { type: 'tool', id: 'c1', name: 'execute', summary: '{}', decision: 'allowed' },
      { type: 'tool', id: 'c1', name: 'execute', summary: '{}', decision: 'allowed', ok: true },
      { type: 'done', ok: false, durationMs: null, detail: 'stopped' },
    ];
    for (const event of events) items = reduce(items, event);
    expect(items.map((item) => item.kind)).toEqual(['user', 'assistant', 'tool', 'stopped']);
    expect(items[1]).toMatchObject({ text: 'Hello', open: false });
    expect(items[2]).toMatchObject({ ok: true });
  });
});
