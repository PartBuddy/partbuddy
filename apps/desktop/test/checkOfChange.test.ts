import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import { GateProxy, type ToolResult, type UpstreamTools } from '../src/main/agents/gateProxy';
import { policyToolSet } from '../src/main/agents/loop';
import { Questions } from '../src/main/agents/questions';
import { CHANGING_TOOLS, UNCHECKED_CHANGE, UNDO_CAP, designChanged, WorkLog } from '../src/main/agents/workLog';
import { CHECK_PENDING, CHECK_PENDING_VIEW, CheckTold, printCheckNote, withCheckOfChange, type CheckState } from '../src/main/print/printCheckNote';
import type { PrintCheckReport } from '../src/shared/contract';
import { describeToolCall } from '../src/shared/stepPhrases';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const thinWall: PrintCheckReport['findings'][number] = { kind: 'thinWall', severity: 'block', floor: false, thickness: 0.3, minimum: 0.9, area: 400, places: [{ body: 'Plate', faces: ['F2:side:0'] }] };
const box = { name: 'Plate', volume: 6000, shell: 2100, height: 10, layers: 50, surface: 2200, contact: 600, support: 0 };

interface Options {
  /** How long mirror and mesh check take after a change; null: they never come. */
  checkAfterMs?: number | null;
  /** How long SolidCraft measures clearance and joints after that; null: one body, nothing to measure. */
  measureMs?: number | null;
  waitMs?: number;
  fullMs?: number;
}

/**
 * The tool chain as index.ts builds it for every route, on a design with SolidCraft's linear history: `solid.extrude`
 * leaves a 0.3 mm wall, a trial moves the revision alone, `fail` changes the design and answers as an error.
 */
function setup({ checkAfterMs = 100, measureMs = null, waitMs = 1000, fullMs = 500, steps = 0 }: Options & { steps?: number } = {}) {
  // SolidCraft reads the depth of its undo history as 200 at most.
  const design = { revision: 1, steps, redo: 0, get undo() { return Math.min(UNDO_CAP, this.steps); } };
  const state: CheckState = { mirrored: { documentId: 'doc-1', revision: 1 }, report: { status: 'ready', findings: [], nozzle: 0.4, revision: 1 } };
  const logged: string[] = [];
  let historyFails = false;
  const changed = () => {
    design.revision += 1;
    const built = design.revision;
    if (checkAfterMs === null) return;
    const report: PrintCheckReport = { status: 'block', findings: [thinWall], nozzle: 0.4, revision: built, bodies: [box] };
    setTimeout(() => {
      // A later change has its own check; an older one never overwrites it.
      if (state.mirrored && state.mirrored.revision > built) return;
      state.mirrored = { documentId: 'doc-1', revision: built };
      state.report = measureMs === null ? report : { ...report, measuring: true };
      if (measureMs !== null) setTimeout(() => state.report?.revision === built && (state.report = report), measureMs);
    }, checkAfterMs);
  };
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve(['execute', 'undo', 'partbuddy_place_drawing', 'partbuddy_move_drawing'].map((name) => ({ name, inputSchema: { type: 'object' as const } }))),
    callTool: (name, args): Promise<ToolResult> => {
      if (args.command === 'solid.extrude' || args.command === 'fail' || name.endsWith('_drawing')) {
        design.steps += 1;
        design.redo = 0;
        changed();
      }
      if (name === 'undo') {
        design.steps -= 1;
        design.redo += 1;
        changed();
      }
      // A trial, a save, a block that was taken back: the revision moves, the design and its history stay.
      if (args.command === 'trial') design.revision += 1;
      return Promise.resolve({ content: [{ type: 'text', text: args.command === 'fail' ? 'failed half way' : 'ok' }], ...(args.command === 'fail' ? { isError: true } : {}) });
    },
  };
  const told = new CheckTold();
  const log = new WorkLog({
    history: () => (historyFails ? Promise.reject(new Error('no answer')) : Promise.resolve({ documentId: 'doc-1', revision: design.revision, undo: design.undo, redo: design.redo })),
    travel: () => Promise.resolve(),
    emit: () => undefined,
    changed: (result, after) => withCheckOfChange(result, after, () => state, (report) => told.note(report), waitMs, fullMs),
    log: (line) => logged.push(line),
  });
  return { tools: log.tools(upstream), told, logged, state, failHistory: () => (historyFails = true) };
}

const extrude = { command: 'solid.extrude', params: { distance: 5 } };
const BLOCKED = 'not ready to print.\n- blocks printing: walls down to 0.3 mm, thinner than the narrowest line a slicer lays (0.42 mm with the 0.4 mm nozzle)';
const textOf = (result: ToolResult) => result.content.map((part) => String(part.text)).join('\n');

/** What Claude Code reads: the tool result through the gate proxy. */
async function throughProxy(tools: UpstreamTools, args: Record<string, unknown>, name = 'execute'): Promise<string> {
  const proxy = new GateProxy(tools, () => undefined);
  await proxy.start();
  cleanups.push(() => proxy.stop());
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(proxy.url), { requestInit: { headers: { Authorization: `Bearer ${proxy.token}` } } }));
  cleanups.push(() => client.close());
  const result = await client.callTool({ name, arguments: args });
  return (result.content as { text: string }[]).map((part) => part.text).join('\n');
}

/** What ChatGPT and local models read: the tool result of PartBuddy's own loop. */
async function throughLoop(tools: UpstreamTools, args: Record<string, unknown>, name = 'execute'): Promise<string> {
  const set = await policyToolSet(tools, { nextId: () => 'call-1', event: () => undefined });
  const execute = set[name]?.execute as (input: unknown, options: unknown) => Promise<string>;
  return execute(args, { toolCallId: 'call-1', messages: [] });
}

describe('the print check of a change comes back with the tool that made it (audit R1)', () => {
  it('puts a blocking check into the answer of the changing call on the Claude Code route', async () => {
    const text = await throughProxy(setup().tools, extrude);
    expect(text).toContain('ok');
    expect(text).toContain(BLOCKED);
  });

  it('does the same in the loop of ChatGPT and local models', async () => {
    expect(await throughLoop(setup().tools, extrude)).toContain(BLOCKED);
  });

  it('adds nothing to a call that changed nothing, and does not wait for it', async () => {
    const read = { command: 'inspect.measure', params: {} };
    expect(await throughProxy(setup().tools, read)).toBe('ok');
    expect(await throughLoop(setup().tools, read)).toBe('ok');
  });

  it('waits a bounded time and then says the check is still running, never an older verdict', async () => {
    const started = Date.now();
    const text = await throughLoop(setup({ checkAfterMs: null, waitMs: 300 }).tools, extrude);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(text).toBe(`ok\n${CHECK_PENDING}`);
    expect(text).not.toContain('nothing found');
  });

  it('takes a mirror that is past the change, and no check of another design', async () => {
    const result: ToolResult = { content: [{ type: 'text', text: 'ok' }] };
    const report: PrintCheckReport = { status: 'block', findings: [thinWall], nozzle: 0.4, revision: 9 };
    const text = async (state: CheckState) => (await withCheckOfChange(result, { documentId: 'doc-1', revision: 7 }, () => state, printCheckNote, 0)).content.at(-1)?.text;
    expect(await text({ mirrored: { documentId: 'doc-1', revision: 9 }, report })).toContain('blocks printing');
    expect(await text({ mirrored: { documentId: 'doc-2', revision: 9 }, report })).toBe(CHECK_PENDING);
    expect(await text({ mirrored: { documentId: 'doc-1', revision: 9 }, report: { ...report, revision: 6 } })).toBe(CHECK_PENDING);
    expect(await text({ mirrored: null, report: null })).toBe(CHECK_PENDING);
  });

  it('tells partbuddy_view to wait, not to call partbuddy_view', () => {
    expect(CHECK_PENDING_VIEW).not.toContain('call partbuddy_view');
    expect(CHECK_PENDING_VIEW).toContain('in a moment');
  });
});

describe('designs of several bodies: the mesh check goes ahead of the measures (review of PR 357)', () => {
  it('takes the full check when SolidCraft has measured in time', async () => {
    const text = textOf(await setup({ measureMs: 100 }).tools.callTool('execute', extrude));
    expect(text).toContain(BLOCKED);
    expect(text).not.toContain('Preliminary');
  });

  it('does not wait for a long measure: the mesh check comes as preliminary, with its findings and measures', async () => {
    const started = Date.now();
    const text = textOf(await setup({ measureMs: 60_000, waitMs: 2000, fullMs: 300 }).tools.callTool('execute', extrude));
    expect(Date.now() - started).toBeLessThan(1500);
    expect(text).toContain(BLOCKED);
    expect(text).toContain('Preliminary: clearance and joints still being measured (bodies that overlap or come closer than the push fit, or than the print-in-place gap where they print as one piece and move, joints that stop before a limit, or within a turn or as far as the parts reach where they have none); call partbuddy_view for the full check before you call the part done.');
    expect(text).toContain('- "Plate": 6 cm³ solid');
    expect(text).not.toContain(CHECK_PENDING);
  });

  it('never ends on a preliminary check without saying how to get the full one, in full and in short', () => {
    const told = new CheckTold();
    const clean: PrintCheckReport = { status: 'ready', findings: [], nozzle: 0.4, revision: 2, measuring: true };
    expect(told.note(clean)).toContain('call partbuddy_view for the full check before you call the part done');
    expect(told.note({ ...clean, revision: 3 })).toBe(
      '[PartBuddy: ready-to-print check after this change: unchanged, nothing found; clearance and joints still being measured: call partbuddy_view for the full check before you call the part done.]',
    );
  });

  it('does not send partbuddy_view back to partbuddy_view: from the view a preliminary check says that the rest is coming', () => {
    const fromView = printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 2, measuring: true }, true);
    expect(fromView).toContain('Preliminary: clearance and joints still being measured (bodies that overlap or come closer than the push fit, or than the print-in-place gap where they print as one piece and move, joints that stop before a limit, or within a turn or as far as the parts reach where they have none); the full check will be here in a moment.');
    expect(fromView).not.toContain('call partbuddy_view');
  });

  it('says what SolidCraft could not measure instead of counting it as checked', () => {
    const failed = printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 2, unmeasured: ['clearance'] });
    expect(failed).toContain('nothing found in what it checks (build volume, wall and floor thickness, overhang angle, area on the bed for the height, open bodies, failed, suppressed and rolled back features, bodies that touch, joints that stop before a limit, or within a turn or as far as the parts reach where they have none).');
    expect(failed).toContain("NOT measured, or not all of it (SolidCraft's measure failed or did not finish every pair in its time, or there were more than 200 joint runs): bodies that overlap or come closer than the push fit, or than the print-in-place gap where they print as one piece and move. Measure it yourself (inspect.clearance) before you call the part done.");
    const both = printCheckNote({ status: 'warn', findings: [{ kind: 'open', severity: 'warn', bodies: ['A'] }], nozzle: 0.4, revision: 2, unmeasured: ['clearance', 'joints'] });
    expect(both).toContain('Measure it yourself (inspect.clearance, joint.sweep)');
    // A check that lost its measures is another check than the one before.
    const told = new CheckTold();
    told.note({ status: 'ready', findings: [], nozzle: 0.4, revision: 2 });
    expect(told.note({ status: 'ready', findings: [], nozzle: 0.4, revision: 3, unmeasured: ['joints'] })).toContain('NOT measured');
  });

  it('does not call a preliminary clean check clean of what is still measured', () => {
    const note = printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 1, measuring: true });
    expect(note).toContain('nothing found so far (build volume, wall and floor thickness, overhang angle, area on the bed for the height, open bodies, failed, suppressed and rolled back features, bodies that touch).');
    expect(note).not.toContain('in what it checks');
  });
});

describe('only a call that changed the design gets a check (review of PR 357)', () => {
  it('reads a moved revision alone as no change: a trial, a save, a block that was taken back', async () => {
    expect(designChanged({ documentId: 'a', revision: 4, undo: 2, redo: 1 }, { documentId: 'a', revision: 9, undo: 2, redo: 1 })).toBe(false);
    // A block that was built and undone again leaves more to redo, and the design as it was.
    expect(designChanged({ documentId: 'a', revision: 4, undo: 2, redo: 0 }, { documentId: 'a', revision: 9, undo: 2, redo: 3 })).toBe(false);
    expect(designChanged({ documentId: 'a', revision: 4, undo: 2, redo: 0 }, { documentId: 'a', revision: 5, undo: 3, redo: 0 })).toBe(true);
    expect(designChanged({ documentId: 'a', revision: 4, undo: 2, redo: 1 }, { documentId: 'a', revision: 5, undo: 1, redo: 2 })).toBe(true);
    // One step undone and another built in its place: the depth is the same, what Redo held is gone.
    expect(designChanged({ documentId: 'a', revision: 4, undo: 2, redo: 1 }, { documentId: 'a', revision: 6, undo: 2, redo: 0 })).toBe(true);
    expect(designChanged({ documentId: 'a', revision: 4, undo: 2, redo: 0 }, { documentId: 'b', revision: 1, undo: 0, redo: 0 })).toBe(true);
    const started = Date.now();
    expect(textOf(await setup({ checkAfterMs: null, waitMs: 1500 }).tools.callTool('execute', { command: 'trial' }))).toBe('ok');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('still gives the check once the undo history is full: 200 before, 200 after (review 2 of PR 357)', async () => {
    // Measured at SolidCraft 0.40.1: a step past the cap moves the revision and leaves undo at 200 and redo at 0.
    expect(designChanged({ documentId: 'a', revision: 300, undo: 200, redo: 0 }, { documentId: 'a', revision: 301, undo: 200, redo: 0 })).toBe(true);
    // A call that only read moves nothing, at the cap as below it.
    expect(designChanged({ documentId: 'a', revision: 300, undo: 200, redo: 0 }, { documentId: 'a', revision: 300, undo: 200, redo: 0 })).toBe(false);
    // The rollback marker counts features past any cap: a new feature shows there even where the cap were higher than 200 (review 3 of PR 357).
    expect(designChanged({ documentId: 'a', revision: 300, undo: 150, redo: 0, marker: 260 }, { documentId: 'a', revision: 301, undo: 150, redo: 0, marker: 261 })).toBe(true);
    expect(designChanged({ documentId: 'a', revision: 300, undo: 150, redo: 0, marker: 260 }, { documentId: 'a', revision: 305, undo: 150, redo: 0, marker: 260 })).toBe(false);
    const { tools } = setup({ steps: 260 });
    expect(textOf(await tools.callTool('execute', extrude))).toContain(BLOCKED);
    expect(textOf(await tools.callTool('execute', extrude))).toContain('ready-to-print check after this change: unchanged');
    expect(textOf(await tools.callTool('execute', { command: 'inspect.measure' }))).toBe('ok');
  });

  it('gives the check to a call that failed half way and left the design changed', async () => {
    const text = textOf(await setup().tools.callTool('execute', { command: 'fail' }));
    expect(text).toContain('failed half way');
    expect(text).toContain(BLOCKED);
  });

  it('gives it after undo as well', async () => {
    const { tools } = setup();
    await tools.callTool('execute', extrude);
    expect(textOf(await tools.callTool('undo', {}))).toContain('ready-to-print check');
  });

  it('gives each of two calls sent together the check of its own change or a later one, never an older', async () => {
    const { tools, state } = setup();
    const [first, second] = await Promise.all([tools.callTool('execute', extrude), tools.callTool('execute', extrude)]);
    // Both end on the check of revision 3, the design as it is after both.
    expect(state.report?.revision).toBe(3);
    expect(textOf(first)).toContain('ready-to-print check');
    expect(textOf(second)).toContain('ready-to-print check');
    expect(textOf(first) + textOf(second)).not.toContain('nothing found');
  });

  it('says in the log and to the model when the history cannot be read, since the answer then carries no check (audit R18)', async () => {
    const { tools, logged, failHistory } = setup();
    failHistory();
    expect(textOf(await tools.callTool('execute', extrude))).toBe(`ok
${UNCHECKED_CHANGE}`);
    expect(UNCHECKED_CHANGE).toContain('no ready-to-print check comes with it; call partbuddy_view');
    expect(logged).toEqual(["the design's history could not be read round execute; its answer carries no print check"]);
  });
});

describe('the drawing tools change the design like any other (review of PR 357)', () => {
  it('lists every tool of PartBuddy that builds, moves or removes geometry', () => {
    // partbuddy_view, _standard, _ask, _plan, _assembly and _design_rules change no geometry.
    expect([...CHANGING_TOOLS].filter((name) => name.startsWith('partbuddy_')).sort()).toEqual(['partbuddy_block', 'partbuddy_mechanism', 'partbuddy_move_drawing', 'partbuddy_place_drawing']);
  });

  it('names them in the work log as the user\'s own logo steps are named', () => {
    expect(describeToolCall('partbuddy_place_drawing', { drawing: 'svg-1', mode: 'emboss', depth: 1 })).toEqual([{ key: 'logo', values: { name: 'svg-1', mode: 'emboss' } }]);
    expect(describeToolCall('partbuddy_move_drawing', { logo: 'SVG-Logo Badge', by: [1, 0] })).toEqual([{ key: 'logoMoved', values: { name: 'SVG-Logo Badge' } }]);
  });

  it('puts the check behind a placed and a moved logo on both routes', async () => {
    expect(await throughProxy(setup().tools, { drawing: 'svg-1', mode: 'deboss', depth: 1 }, 'partbuddy_place_drawing')).toContain(BLOCKED);
    expect(await throughLoop(setup().tools, { logo: 'SVG-Logo Badge', by: [1, 0] }, 'partbuddy_move_drawing')).toContain(BLOCKED);
  });

  it('holds them back while a question is open', async () => {
    const questions = new Questions(() => undefined);
    const tools = questions.tools(setup().tools);
    await tools.callTool('partbuddy_ask', { questions: [{ question: 'Which side?', options: [{ label: 'Top' }, { label: 'Front' }] }] });
    for (const name of ['partbuddy_place_drawing', 'partbuddy_move_drawing']) {
      const answer = await tools.callTool(name, {});
      expect(answer.isError).toBe(true);
      expect(textOf(answer)).toContain('The user has not answered your question yet');
    }
  });
});

describe('the same check is not told in full with every step (review of PR 357)', () => {
  const blocked: PrintCheckReport = { status: 'block', findings: [thinWall], nozzle: 0.4, revision: 2, bodies: [box] };

  it('tells it in full once, then in one line, and names only the measures that changed', () => {
    const told = new CheckTold();
    expect(told.note(blocked)).toBe(printCheckNote(blocked));
    expect(told.note({ ...blocked, revision: 3 })).toBe('[PartBuddy: ready-to-print check after this change: unchanged, still not ready to print, the same 1 finding as before.]');
    const lower = { ...blocked, revision: 4, bodies: [{ ...box, height: 8, layers: 40 }, { ...box, name: 'Lid' }] };
    expect(told.note(lower)).toBe(
      '[PartBuddy: ready-to-print check after this change: unchanged, still not ready to print, the same 1 finding as before.\nMeasures that changed:\n' +
        '- "Plate": 6 cm³ solid, about 2.1 cm³ as a shell, 8 mm high (40 layers), 2200 mm² of surface, 600 mm² on the bed, 0 mm² leaning past the overhang limit.\n' +
        '- "Lid": 6 cm³ solid, about 2.1 cm³ as a shell, 10 mm high (50 layers), 2200 mm² of surface, 600 mm² on the bed, 0 mm² leaning past the overhang limit.]',
    );
    // Thirty steps on a clean part: one full note, then a line each.
    const clean: PrintCheckReport = { status: 'ready', findings: [], nozzle: 0.4, revision: 5, bodies: [box] };
    const notes = Array.from({ length: 30 }, (_, i) => told.note({ ...clean, revision: 5 + i }));
    expect(notes[0]).toBe(printCheckNote(clean));
    expect(new Set(notes.slice(1))).toEqual(new Set(['[PartBuddy: ready-to-print check after this change: unchanged, nothing found.]']));
    expect(notes.join('').length).toBeLessThan(printCheckNote(clean).length + 29 * 90);
  });

  it('tells it in full again when a finding changed, the measures came in, or the user wrote', () => {
    const told = new CheckTold();
    told.note(blocked);
    const thinner = { ...blocked, findings: [{ ...thinWall, thickness: 0.2 }] };
    expect(told.note(thinner)).toBe(printCheckNote(thinner));
    expect(told.note({ ...thinner, measuring: true })).toContain('Preliminary');
    expect(told.note(thinner)).toBe(printCheckNote(thinner));
    told.forget();
    expect(told.note(thinner)).toBe(printCheckNote(thinner));
  });

  it('reads a change in any finding as a change, also past the twelve it lists and the faces it shows (review 2 of PR 357)', () => {
    const wall = (i: number): PrintCheckReport['findings'][number] => ({ kind: 'feature', severity: 'warn', feature: `Shell${String(i)}`, message: 'thin result' });
    const many: PrintCheckReport = { status: 'warn', findings: Array.from({ length: 14 }, (_, i) => wall(i)), nozzle: 0.4, revision: 2 };
    const told = new CheckTold();
    told.note(many);
    // The fourteenth finding is another one: the lines shown are the same, the check is not.
    const other = { ...many, revision: 3, findings: [...many.findings.slice(0, 13), wall(99)] };
    expect(told.note(other)).toBe(printCheckNote(other));
    // A fifth body in a finding that names four: the same.
    const places = (count: number) => Array.from({ length: count }, (_, i) => ({ body: `Pin ${String(i)}`, faces: [] }));
    const loose = (count: number): PrintCheckReport => ({ status: 'warn', nozzle: 0.4, revision: 4, findings: [{ kind: 'contact', severity: 'warn', area: 2, bodies: 6, places: places(count) }] });
    told.note(loose(5));
    const moved = { ...loose(5), findings: [{ kind: 'contact' as const, severity: 'warn' as const, area: 2, bodies: 6, places: [...places(4), { body: 'Peg', faces: [] }] }] };
    expect(told.note(moved)).toBe(printCheckNote(moved));
    expect(told.note({ ...moved, revision: 9 })).toContain('unchanged');
  });

  it('keeps it short through the tool chain: the second step of a turn gets one line', async () => {
    const { tools } = setup();
    expect(textOf(await tools.callTool('execute', extrude))).toContain(BLOCKED);
    expect(textOf(await tools.callTool('execute', extrude))).toBe('ok\n[PartBuddy: ready-to-print check after this change: unchanged, still not ready to print, the same 1 finding as before.]');
  });
});
