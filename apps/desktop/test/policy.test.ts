import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';

import { GateProxy, type ToolCallRecord, type ToolResult, type UpstreamTools } from '../src/main/agents/gateProxy';
import { policyToolSet } from '../src/main/agents/loop';
import { CHECKED_WAYS, COMMAND_GROUPS, decide, decideParameterNames, GROUP_EXCEPTIONS, inputProblem, namesToChange, offeredTool, REFUSED_COMMANDS, TOOL_ARGUMENTS } from '../src/main/agents/policy';
import { ASK_TOOL, Questions } from '../src/main/agents/questions';
import { SKILL_NOTE, TOOL_NOTES } from '../src/main/agents/toolNotes';
import { changesDesign } from '../src/main/agents/workLog';
import { JOINT_GUIDANCE } from '../src/main/agents/assemblyTool';
import { MECHANISM_TOOL, withMechanismTool } from '../src/main/agents/mechanismTool';
import { BLOCK_KINDS } from '../src/shared/blocks';
import { TAPPED_FROM } from '../src/shared/mechanisms';
import type { AgentEvent } from '../src/shared/contract';

const absolute = (name: string): string => join(tmpdir(), 'PartBuddy', name);
const reasonOf = (name: string, args: Record<string, unknown>): string => {
  const decision = decide(name, args);
  return decision.allow ? 'allowed' : decision.reason;
};
const execute = (command: string, params: Record<string, unknown> = {}) => decide('execute', { command, params });
const step = (command: string, params: Record<string, unknown> = {}) => decide('batch', { commands: [{ command: 'sketch.finish', params: {} }, { command, params }] });

describe('tool policy: forms it cannot read are refused (audit W42, H-30)', () => {
  it('refuses execute and batch named as engine commands, at any depth', () => {
    // Each was allowed before (rc.4 measurement W42 (a)); SolidCraft refuses them itself, the policy no longer relies on it.
    expect(reasonOf('execute', { command: 'execute', params: { command: 'file.export', params: { path: 'x.stl' } } })).toContain('execute is a tool, not an engine command');
    expect(reasonOf('execute', { command: 'batch', params: { commands: [] } })).toContain('batches do not nest');
    expect(reasonOf('batch', { commands: [{ command: 'batch', params: { commands: [{ command: 'file.export' }] } }] })).toContain('batch step 0 (batch): batches do not nest');
    expect(decide('batch', { commands: [{ command: 'execute', params: { command: 'execute', params: { command: 'solid.box' } } }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'execute', params: { command: 'Batch', params: {} } }] }).allow).toBe(false);
    // What SolidCraft runs as steps stays allowed.
    expect(decide('batch', { commands: [{ command: 'execute', params: { command: 'solid.box', params: { length: 20 } } }, { command: 'undo' }] })).toEqual({ allow: true });
  });

  it('refuses params and steps given as text or a list, which it would have read as empty', () => {
    // Measured with SolidCraft 0.40.1: a step's params as text is parsed and run; execute's and batch's are refused by schema.
    const hidden = JSON.stringify({ path: absolute('x.svg') });
    expect(reasonOf('execute', { command: 'sketch.insert_svg', params: hidden })).toContain('params as a JSON object');
    expect(decide('execute', { command: 'sketch.insert_svg', params: [hidden] }).allow).toBe(false);
    expect(decide('execute', { command: 'solid.box', params: null }).allow).toBe(false);
    expect(reasonOf('batch', { commands: '[{"command":"file.export","params":{"path":"x.stl"}}]' })).toContain('as a list in commands');
    expect(decide('batch', {}).allow).toBe(false);
    expect(reasonOf('batch', { commands: [{ command: 'sketch.insert_svg', params: hidden }] })).toContain('batch step 0: params must be a JSON object');
    expect(decide('batch', { commands: [{ command: 'execute', params: '{"command":"file.export"}' }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'execute', params: { command: 'sketch.insert_svg', params: hidden } }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'sketch.finish', params: [] }] }).allow).toBe(false);
    // A step that is no object, names its command other than by text, or carries more than command, id and params.
    expect(decide('batch', { commands: ['file.export'] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ params: {} }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: ['file.export'] }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: { id: 'file.export' }, id: 'sketch.finish' }] }).allow).toBe(false);
    expect(decide('batch', { commands: [{ command: 'sketch.finish', path: 'steps.json' }] }).allow).toBe(false);
    expect(decide('execute', { command: 42, params: {} }).allow).toBe(false);
    expect(decide('execute', {}).allow).toBe(false);
    // The usual forms stay allowed.
    expect(decide('batch', { commands: [{ command: 'sketch.create', params: { plane: 'XY' } }, { command: 'sketch.finish' }, { id: 'solid.extrude', params: { distance: '5 mm' } }] })).toEqual({ allow: true });
    expect(execute('solid.box')).toEqual({ allow: true });
    expect(decide('execute', { command: 'solid.box' })).toEqual({ allow: true });
  });
});

describe('tool policy: command groups are an allow list', () => {
  it('refuses the design document in every command (audit N-normteile-policy-3)', () => {
    for (const command of ['document.units', 'document.metadata', 'document.metadata.set', 'document.metadata.remove', 'document.inspect', 'document.revision', 'Document.Units']) {
      expect(reasonOf('execute', { command, params: { units: 'in', values: { 'com.example.x': {} } } }), command).toContain('works on the design document itself');
      expect(step(command).allow, `step ${command}`).toBe(false);
    }
  });

  it("refuses SolidCraft's window, layouts and selection, but keeps saved views, undo and redo (audit S-31)", () => {
    for (const command of ['layout.reset', 'layout.save', 'panel.close', 'panel.list', 'ui.palette', 'view.fit', 'view.top', 'view.visual_style', 'select.set', 'selection.get', 'selection.delete', 'edit.repeat']) {
      expect(reasonOf('execute', { command, params: {} }), command).toContain("works on SolidCraft's window");
      expect(step(command).allow, `step ${command}`).toBe(false);
    }
    for (const command of [...GROUP_EXCEPTIONS]) expect(execute(command, { name: 'Front' }), command).toEqual({ allow: true });
  });

  it("refuses configurations, imported parameters, recorded features, reordering and moved placements (audit S-26)", () => {
    expect(reasonOf('execute', { command: 'config.configure', params: { params: ['wall'] } })).toContain('configurations');
    expect(reasonOf('execute', { command: 'parameters.import', params: { text: 'name,expression\nwall,3 mm' } })).toContain('set_parameter');
    expect(reasonOf('execute', { command: 'timeline.add', params: { feature: { type: 'import', path: 'x.step' } } })).toContain('raw data');
    for (const command of ['timeline.reorder', 'timeline.reorder_many', 'occurrence.move', 'occurrence.drag', 'occurrence.align']) {
      expect(step(command, { feature: 'Extrude1', occurrence: 'Lid:1', translate: [1, 0, 0] }).allow, command).toBe(false);
    }
    expect(reasonOf('execute', { command: 'occurrence.move', params: { occurrence: 'Lid:1', translate: [5, 0, 0] } })).toContain('solid.move');
    // Review BC-09 S1, measured with 0.40.1: move_many put Base behind the history marker, 2 bodies became 1.
    expect(reasonOf('execute', { command: 'timeline.move_many', params: { features: ['Base'], position: 4, active: false } })).toContain('moves features in the history');
    expect(step('Timeline.Move_Many', { features: ['Base'], position: 0 }).allow).toBe(false);
    // Neighbours that change nothing PartBuddy cannot show stay; folders keep the order.
    for (const command of ['timeline.suppress', 'timeline.rollback', 'timeline.move_to_group', 'occurrence.copy', 'occurrence.ground', 'parameters.add', 'parameters.list']) {
      expect(execute(command, { feature: 'Extrude1' }), command).toEqual({ allow: true });
    }
  });

  it("refuses SolidCraft's physical material (audit S-27)", () => {
    expect(reasonOf('execute', { command: 'material.assign', params: { bodies: ['Box'], material: 'Steel' } })).toContain('print profile');
    expect(step('material.list').allow).toBe(false);
    expect(step('Material.Create', { name: 'PETG' }).allow).toBe(false);
  });

  it('refuses a group nobody has looked at, and an id that is no engine command id', () => {
    for (const command of ['engine.commands', 'render.start', 'pointcloud.insert', 'library.apply', 'future.make_file', 'file.export', 'doc.open', 'settings.profile.apply', 'diagnostics.profile']) {
      expect(execute(command).allow, command).toBe(false);
    }
    // Unicode look-alikes and forms a rule could miss: ligature fi, Cyrillic o, full-width dot, dotted capital I, no group.
    for (const command of ['ﬁle.export', 'dоc.open', 'file．export', 'FİLE.export', 'screenshot', 'solid', 'solid..box', '.solid.box', '']) {
      expect(reasonOf('execute', { command, params: {} }), command).toContain('is not an engine command id');
    }
    // Every group the policy names a reason for is outside the allow list.
    for (const group of ['file', 'doc', 'document', 'settings', 'diagnostics', 'library', 'pointcloud', 'render', 'material', 'config', 'layout', 'panel', 'ui', 'view', 'select', 'selection', 'engine']) {
      expect(COMMAND_GROUPS.has(group), group).toBe(false);
    }
  });

  it('tells the assistant the same lists the code holds (audit R42)', () => {
    for (const group of COMMAND_GROUPS) expect(TOOL_NOTES, group).toContain(group);
    for (const command of [...GROUP_EXCEPTIONS, ...Object.keys(REFUSED_COMMANDS)]) expect(TOOL_NOTES, command).toContain(`\`${command}\``);
    expect(TOOL_NOTES).not.toContain('file, document and settings commands');
    expect(TOOL_NOTES).toContain('`canvas.insert`');
  });
});

describe('tool policy: files by argument, per command (audit N-normteile-policy-4, -5)', () => {
  const fileCommands: [string, string][] = [
    ['sketch.insert_dxf', 'path'],
    ['sketch.insert_svg', 'path'],
    ['sketch.drawing_bounds', 'path'],
    ['sketch.export_dxf', 'path'],
    ['sketch.replace', 'file'],
    ['canvas.insert', 'path'],
    ['canvas.decal', 'path'],
    ['component.insert_design', 'path'],
    ['component.relink', 'path'],
    ['component.extract', 'path'],
    ['component.replace_with_link', 'path'],
    ['motion.export', 'path'],
    ['motion.export_animation', 'path'],
    ['sheet.export_dxf', 'path'],
    ['sheet.export_bend_table', 'path'],
    ['assembly.bom', 'path'],
    ['timeline.export_script', 'path'],
    ['parameters.export', 'path'],
    ['inspect.compare_picture', 'reference'],
  ];

  it('refuses a file argument in any form: a list, a text that looks like a curve id, an object', () => {
    // Measured on rc.4 and again on 0.40.1 (main a6e52eb): `path` as a list and `path: "ab12"` were allowed.
    const file = absolute('x.svg');
    const forms: unknown[] = ['ab12', 'l1', [file], ['l1'], { file: 'x.svg' }, 'x.svg', '\\\\server\\share\\x.svg', `\\\\.\\${file}`, `\\\\?\\${file}`, file.replace('PartBuddy', 'PARTBU~1'), '..\\..\\x.svg', 'ｘ.svg', 0];
    for (const [command, argument] of fileCommands) {
      for (const form of forms) {
        expect(decide('execute', { command, params: { [argument]: form } }).allow, `${command} ${argument} ${JSON.stringify(form)}`).toBe(false);
        expect(decide('batch', { commands: [{ command: command.toUpperCase(), params: { [argument]: form } }] }).allow, `step ${command}`).toBe(false);
      }
      // Without the argument the command answers with its content.
      expect(execute(command, { body: 'Box' }), command).toEqual({ allow: true });
    }
  });

  it('takes a font by its family, not from a file', () => {
    // A family name of 64 signs passes, 65 do not.
    expect(execute('sketch.text', { text: 'A', font: 'F'.repeat(65) }).allow).toBe(false);
    for (const font of ['Arial', 'Segoe UI Semibold', 'DejaVu Sans', 'F'.repeat(64), '']) {
      expect(execute('sketch.text', { text: 'A', font, at: [0, 0] }), font).toEqual({ allow: true });
    }
    for (const font of [absolute('arial.ttf'), 'arial.ttf', './f.otf', '\\\\server\\f.ttf', ['Arial'], 3]) {
      expect(reasonOf('execute', { command: 'sketch.edit_text', params: { link: 1, font } }), JSON.stringify(font)).toContain('font by its family name');
    }
  });

  it('decides the command a command runs inside it (review BC-09)', () => {
    const svg = { command: 'sketch.insert_svg', params: { path: absolute('box.svg') } };
    expect(reasonOf('execute', { command: 'sketch.draw.dimensioned', params: { ...svg, dimensions: {} } })).toContain('sketch.draw.dimensioned runs sketch.insert_svg: sketch.insert_svg with path');
    expect(decide('batch', { commands: [{ command: 'sketch.draw.dimensioned', params: { ...svg, dimensions: {} } }] }).allow).toBe(false);
    expect(execute('timeline.redefine', { feature: 'Logo', command: 'File.Export', params: { path: 'x.stl' } }).allow).toBe(false);
    expect(execute('timeline.redefine', { feature: 'Box1', command: 'timeline.redefine', params: { feature: 'Box1', command: 'material.assign', params: {} } }).allow).toBe(false);
    expect(execute('sketch.drag_end', { constraint: { command: 'execute', params: { command: 'file.export' } } }).allow).toBe(false);
    expect(execute('sketch.draw.dimensioned', { command: 'sketch.rectangle.two_point', params: '{}' }).allow).toBe(false);
    expect(execute('sketch.drag_end', { constraint: 'sketch.constraint.coincident' }).allow).toBe(false);
    expect(execute('timeline.redefine', { feature: 'Box1' }).allow).toBe(false);
    // What they are for stays.
    expect(execute('sketch.draw.dimensioned', { command: 'sketch.rectangle.two_point', params: { p1: [0, 0], p2: [20, 10] }, dimensions: { width: 'breite = 20 mm' } })).toEqual({ allow: true });
    expect(execute('timeline.redefine', { feature: 'Box1', command: 'solid.box', params: { length: 30, width: 20, height: 10 } })).toEqual({ allow: true });
    expect(execute('sketch.drag_end', { constraint: { command: 'sketch.constraint.coincident', params: { a: 'p1', b: 'p2' } } })).toEqual({ allow: true });
    expect(execute('sketch.drag_end', {})).toEqual({ allow: true });
  });

  it('finds no reason on Object for a name such as constructor (review BC-09)', () => {
    expect(reasonOf('execute', { command: 'constructor.x', params: {} })).toBe('constructor.x is not available in PartBuddy. Continue with the modelling and inspection commands.');
    expect(reasonOf('constructor', {})).toBe('constructor is not allowed by PartBuddy. Continue with the other tools.');
    expect(reasonOf('batch', { commands: [{ command: 'toString' }] })).toContain('is not an engine command id');
  });

  it('keeps geometry paths of the other commands', () => {
    expect(execute('solid.sweep', { sketch: 'P', path_sketch: 'S', path: ['l1', 'a2'] })).toEqual({ allow: true });
    expect(execute('sketch.text', { text: 'A', path: 'l1' })).toEqual({ allow: true });
    expect(execute('occurrence.copy', { component: 'Lid', path: [2, 3] })).toEqual({ allow: true });
    expect(execute('browser.visibility', { path: [1], folder: 'bodies', visible: true })).toEqual({ allow: true });
    expect(execute('sketch.text', { text: 'A', path: absolute('x') }).allow).toBe(false);
  });

  it("refuses PartBuddy's own keys under properties too (audit N-normteile-policy-5)", () => {
    const key = 'io.github.manuelstaggl.partbuddy.standard-parts';
    expect(reasonOf('execute', { command: 'component.metadata.set', params: { component: 'Deckel', properties: { [key]: 'x' } } })).toContain("PartBuddy's own data");
    expect(decide('batch', { commands: [{ command: 'component.metadata.set', params: { component: 3, properties: { [key.toUpperCase()]: 'x' } } }] }).allow).toBe(false);
    // Measured rc.4: document.metadata.set {properties: {<key>}} was allowed; the whole group is refused now.
    expect(execute('document.metadata.set', { properties: { [key]: { bodies: ['Deckel'] } } }).allow).toBe(false);
    expect(execute('component.metadata.set', { component: 'Deckel', properties: { colour: 'red' } })).toEqual({ allow: true });
  });
});

describe('tool policy: parameter names (audit R17)', () => {
  const design = (params: { name: string }[] | null, isError = false) => {
    const calls: string[] = [];
    // Answers as SolidCraft 0.40.1's parameters.list does (measured): user and feature inputs alike.
    const callTool = (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
      calls.push(`${name} ${JSON.stringify(args)}`);
      return Promise.resolve({ content: [{ type: 'text', text: isError ? 'The user has not answered your plan yet.' : JSON.stringify(params === null ? { count: 0 } : { count: params.length, parameters: params }) }], isError });
    };
    return { callTool, calls };
  };

  it('finds the names a call sets, after the ones a batch adds first', () => {
    expect(namesToChange('set_parameter', { name: 'wnad', value: 6 })).toEqual(['wnad']);
    expect(namesToChange('execute', { command: 'Parameters.Change', params: { name: 'wnad', expression: '6 mm' } })).toEqual(['wnad']);
    expect(namesToChange('execute', { command: 'parameters.change', params: { changes: { wand: '3 mm' } } })).toEqual([]);
    expect(namesToChange('execute', { command: 'solid.box', params: { name: 'Box' } })).toEqual([]);
    expect(
      namesToChange('batch', {
        commands: [
          { command: 'set_parameter', params: { name: 'a', value: 1 } },
          { command: 'parameters.add', params: { name: 'b', expression: '2 mm' } },
          { command: 'parameters.change', params: { name: 'b', expression: '3 mm' } },
          { command: 'execute', params: { command: 'parameters.change', params: { name: 'c', expression: '1 mm' } } },
          { id: 'set_parameter', params: { name: 'd', value: 1 } },
        ],
      }),
    ).toEqual(['a', 'c', 'd']);
    expect(namesToChange('inspect_design', {})).toEqual([]);
    // A step that names its command twice is followed under both, as the policy decides it; names are compared trimmed.
    expect(namesToChange('batch', { commands: [{ command: 'sketch.finish', id: 'set_parameter', params: { name: ' wnad ' } }] })).toEqual(['wnad']);
    // A dimension "name = value" earlier in the batch makes the parameter.
    expect(
      namesToChange('batch', {
        commands: [
          { command: 'sketch.dimension', params: { a: 'l1', value: 'breite = 40 mm' } },
          { command: 'sketch.draw.dimensioned', params: { command: 'sketch.rectangle.two_point', params: {}, dimensions: { height: 'hoehe=20 mm' } } },
          { command: 'set_parameter', params: { name: 'breite', value: 50 } },
          { command: 'set_parameter', params: { name: 'hoehe', value: 25 } },
        ],
      }),
    ).toEqual([]);
  });

  it('refuses a name the design does not have and lists the names it has', async () => {
    // Measured with SolidCraft 0.40.1: set_parameter {name: "wnad"} next to "wand" made a new parameter, recomputed 0.
    const { callTool, calls } = design([{ name: 'wand' }, { name: 'd1' }]);
    const misspelt = await decideParameterNames(callTool, 'set_parameter', { name: 'wnad', value: '6 mm' });
    expect(misspelt).toEqual({
      allow: false,
      reason: 'There is no parameter "wnad": setting it would make a new parameter and change nothing in the design. The parameters are: wand, d1. Take the exact name, or add a new parameter with parameters.add.',
    });
    expect(calls).toEqual(['execute {"command":"parameters.list","params":{}}']);
    expect((await decideParameterNames(callTool, 'set_parameter', { name: 'Wand', value: 3 })).allow).toBe(false);
    expect(await decideParameterNames(callTool, 'set_parameter', { name: 'wand', value: 3 })).toEqual({ allow: true });
    expect(await decideParameterNames(callTool, 'set_parameter', { name: ' wand', value: 3 })).toEqual({ allow: true });
    expect(await decideParameterNames(callTool, 'execute', { command: 'parameters.change', params: { name: 'd1', expression: '25 mm' } })).toEqual({ allow: true });
    expect(await decideParameterNames(callTool, 'batch', { commands: [{ command: 'parameters.add', params: { name: 'neu', expression: '1 mm' } }, { command: 'set_parameter', params: { name: 'neu', value: 2 } }] })).toEqual({ allow: true });
  });

  it('reads nothing for a call that sets no parameter, and refuses with the reason when it cannot read them', async () => {
    const quiet = design([]);
    expect(await decideParameterNames(quiet.callTool, 'execute', { command: 'solid.box', params: {} })).toEqual({ allow: true });
    expect(quiet.calls).toEqual([]);
    const failing = await decideParameterNames(design(null, true).callTool, 'set_parameter', { name: 'wand', value: 3 });
    expect(failing.allow).toBe(false);
    // The reason of the read goes along, such as an open plan that holds every change.
    if (!failing.allow) expect(failing.reason).toBe('PartBuddy could not read the design\'s parameters to check the name "wand": The user has not answered your plan yet.');
    expect((await decideParameterNames(design(null).callTool, 'set_parameter', { name: 'wand', value: 3 })).allow).toBe(false);
  });

  it('holds in the gate proxy: a misspelt name never reaches SolidCraft', async () => {
    const calls: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve({ content: [{ type: 'text', text: name === 'execute' ? JSON.stringify({ parameters: [{ name: 'wand', source: 'user' }] }) : 'ok' }] });
      },
    };
    const records: ToolCallRecord[] = [];
    const proxy = new GateProxy(upstream, (record) => records.push(record));
    await proxy.start();
    const client = new Client({ name: 'test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(proxy.url), { requestInit: { headers: { Authorization: `Bearer ${proxy.token}` } } }));
      const refused = await client.callTool({ name: 'set_parameter', arguments: { name: 'wnad', value: 6 } });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused.content)).toContain('There is no parameter \\"wnad\\"');
      expect(calls).toEqual(['execute']);
      expect(records.at(-1)).toMatchObject({ name: 'set_parameter', decision: 'denied' });
      await client.callTool({ name: 'set_parameter', arguments: { name: 'wand', value: 6 } });
      expect(calls).toEqual(['execute', 'execute', 'set_parameter']);
    } finally {
      await client.close();
      await proxy.stop();
    }
  });

  it('holds in the loop of ChatGPT and local models too (review BC-09 S2)', async () => {
    const calls: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => undefined,
      listTools: () => Promise.resolve([{ name: 'set_parameter', inputSchema: { type: 'object', properties: {} } }]),
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve({ content: [{ type: 'text', text: name === 'execute' ? JSON.stringify({ parameters: [{ name: 'wand' }] }) : 'ok' }] });
      },
    };
    const events: AgentEvent[] = [];
    const set = await policyToolSet(upstream, { nextId: () => 'call-1', event: (event) => events.push(event) });
    const run = set.set_parameter?.execute as (input: unknown, options: unknown) => Promise<string>;
    expect(await run({ name: 'wnad', value: 6 }, { toolCallId: 'call-1', messages: [] })).toContain('There is no parameter "wnad"');
    expect(calls).toEqual(['execute']);
    expect(events.at(-1)).toMatchObject({ type: 'tool', name: 'set_parameter', decision: 'denied' });
    expect(await run({ name: 'wand', value: 6 }, { toolCallId: 'call-1', messages: [] })).toBe('ok');
    expect(calls).toEqual(['execute', 'execute', 'set_parameter']);
  });

  it('reads the names as a read: not held by an open question, not tracked as a change (review BC-09 S3)', async () => {
    expect(changesDesign('execute', { command: 'parameters.list', params: {} })).toBe(false);
    expect(changesDesign('execute', { command: ' Parameters.List ' })).toBe(false);
    expect(changesDesign('execute', { command: 'parameters.change', params: { name: 'wand' } })).toBe(true);
    expect(changesDesign('batch', { commands: [{ command: 'parameters.list' }] })).toBe(true);
    expect(changesDesign('set_parameter', { name: 'wand' })).toBe(true);
    const forwarded: string[] = [];
    const questions = new Questions(() => undefined);
    const tools = questions.tools({
      instructions: () => undefined,
      listTools: () => Promise.resolve([]),
      callTool: (name, args) => {
        forwarded.push(`${name} ${String(args.command)}`);
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ parameters: [{ name: 'wand' }] }) }] });
      },
    });
    await tools.callTool(ASK_TOOL, { questions: [{ question: 'Fillets?', options: [{ label: 'Yes' }, { label: 'No' }] }] });
    // While the question is open the read goes through and the change is held, with the question's own reason.
    expect(await decideParameterNames((name, args) => tools.callTool(name, args), 'set_parameter', { name: 'wand', value: 3 })).toEqual({ allow: true });
    const held = await tools.callTool('set_parameter', { name: 'wand', value: 3 });
    expect(JSON.stringify(held.content)).toContain('has not answered your question');
    expect(forwarded).toEqual(['execute parameters.list']);
  });
});

describe('tool policy: raw commands PartBuddy builds itself are refused with the call to use (BC-13, audit R2)', () => {
  // From the catalogue of SolidCraft 0.40.1 (`solidcraft-cli commands`): holes, threads, bosses, snap hooks, lips, scaling.
  const ways: Record<string, string> = {
    'solid.hole': 'partbuddy_block',
    'solid.thread': 'tappedHole',
    'plastic.boss': '{"block": "boss"}',
    'plastic.snap_fit': '{"block": "snapFit"}',
    'plastic.lip': '{"block": "lip"}',
    'solid.scale': 'set_parameter',
  };

  it('refuses each in every way it can be sent: execute, a batch step, by id, in another case, inside another command', () => {
    expect(Object.keys(CHECKED_WAYS).sort()).toEqual(Object.keys(ways).sort());
    for (const [command, use] of Object.entries(ways)) {
      for (const sent of [command, ` ${command.toUpperCase()} `]) {
        expect(reasonOf('execute', { command: sent, params: {} }), sent).toContain(use);
        expect(reasonOf('execute', { command: sent, params: {} }), sent).toContain('tell the user what is missing');
        expect(step(sent).allow, sent).toBe(false);
        expect(decide('batch', { commands: [{ id: sent, params: {} }] }).allow, sent).toBe(false);
        expect(decide('batch', { commands: [{ command: 'execute', params: { command: sent, params: {} } }] }).allow, sent).toBe(false);
        expect(execute('timeline.redefine', { feature: 'Hole1', command: sent, params: {} }).allow, sent).toBe(false);
        expect(execute('sketch.draw.dimensioned', { command: sent, params: {}, dimensions: {} }).allow, sent).toBe(false);
      }
    }
    expect(reasonOf('execute', { command: 'solid.hole', params: { position: [10, 10, 20], thread: 'M3', modeled: true } })).toContain('"insertSeat"');
    expect(reasonOf('execute', { command: 'solid.thread', params: { face: [0, 5, 2] } })).toContain('{"kind": "lid"}');
  });

  it("refuses SolidCraft's injection-moulding rules, and keeps the plastic commands PartBuddy has no block for (audit S-12)", () => {
    for (const command of ['plastic.manage_rules', 'plastic.assign_rule']) expect(reasonOf('execute', { command, params: { name: 'ABS (1.5mm)' } }), command).toContain('injection-moulding');
    expect(execute('plastic.rules')).toEqual({ allow: true });
    expect(execute('plastic.rest', { position: [0, 0, 5], width: 4, height: 2 })).toEqual({ allow: true });
  });

  it('refuses an edit that makes a thread or a clearance on a hole, and keeps the other edits (audit S-08)', () => {
    for (const set of [{ thread: 'M3' }, { Modeled: true }, { 'thread.hand': 'left' }, { designation: 'M8' }, { clearance: 'M4' }]) {
      expect(reasonOf('execute', { command: 'timeline.edit', params: { feature: 'Hole1', set } }), JSON.stringify(set)).toContain('partbuddy_block');
    }
    expect(execute('timeline.edit', { feature: 'Extrude1', set: { extent: { distance: '30' } } })).toEqual({ allow: true });
    expect(execute('timeline.edit', { feature: 'Hole1', set: { depth: '8 mm' } })).toEqual({ allow: true });
  });

  it('keeps the other modelling commands, which the check after each change covers (audit S-03, S-17)', () => {
    for (const command of ['solid.fillet', 'solid.chamfer', 'solid.shell', 'solid.extrude', 'solid.sphere', 'solid.revolve', 'solid.loft', 'solid.combine', 'solid.emboss', 'face.delete', 'surface.thicken', 'sheet.flange', 'joint.as_built', 'joint.gear', 'parts.insert', 'parts.resize']) {
      expect(execute(command), command).toEqual({ allow: true });
      expect(changesDesign('execute', { command, params: {} }), command).toBe(true);
    }
    // The units of the design are refused with the design document (audit S-22, BC-09).
    expect(reasonOf('execute', { command: 'document.units', params: { units: 'in' } })).toContain('stays in millimetres');
  });

  it('names the commands in the notes, and blocks and kinds the tools have, as the code holds them', async () => {
    for (const command of Object.keys(CHECKED_WAYS)) expect(TOOL_NOTES, command).toContain(`\`${command}\``);
    expect(TOOL_NOTES).toContain('`partbuddy_block` and `partbuddy_mechanism` build holes');
    const text = Object.values(CHECKED_WAYS).join(' ');
    const blocks = [...text.matchAll(/"block": "(\w+)"|"(tappedHole|insertSeat|nutTrap)"/g)].map((found) => found[1] ?? found[2]);
    const kinds = [...text.matchAll(/"kind": "(\w+)"/g)].map((found) => found[1]);
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) expect(BLOCK_KINDS, block).toContain(block);
    const [mechanism] = await withMechanismTool({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [] }) }, () => 0.4).listTools();
    const enumOf = ((mechanism?.inputSchema.properties as Record<string, { enum?: string[] }> | undefined)?.kind?.enum ?? []);
    for (const kind of kinds) expect(enumOf, kind).toContain(kind);
    expect(CHECKED_WAYS['solid.thread']).toContain(`M${String(TAPPED_FROM)} and larger`);
  });

  it('sends hinges and guides to the mechanism tool and says what coupled joints do not make (audit R23, S-20)', () => {
    expect(JOINT_GUIDANCE.startsWith(`For a hinge or a guide use ${MECHANISM_TOOL}, which also makes the joint.`)).toBe(true);
    for (const link of ['joint.gear', 'joint.rack_pinion', 'joint.screw', 'joint.cam', 'joint.motion_link']) expect(JOINT_GUIDANCE, link).toContain(link);
    expect(JOINT_GUIDANCE).toContain('they make no teeth, thread or cam');
  });
});

describe('tool list and input schemas (audit S-04, S-05, W28)', () => {
  // The 22 tools of SolidCraft 0.40.1 (`solidcraft-cli mcp --headless`, tools/list, 2026-11-13).
  const SOLIDCRAFT_TOOLS = ['list_commands', 'describe_command', 'execute', 'batch', 'inspect_design', 'measure', 'body_topology', 'set_parameter', 'check_parameters', 'screenshot', 'compare_picture', 'export', 'crash_reports', 'running', 'pending', 'cancel', 'undo', 'redo', 'new_design', 'open', 'save', 'skill_reference'];
  const schema = { type: 'object' as const, properties: { radius: { type: 'number', maximum: 100 }, name: { type: 'string' } }, required: ['name'], additionalProperties: false };
  const tool = { name: 'partbuddy_block', inputSchema: schema };

  it('offers none of the tools the policy refuses whatever their arguments', () => {
    expect(SOLIDCRAFT_TOOLS.filter((name) => !offeredTool(name)).sort()).toEqual(['cancel', 'crash_reports', 'export', 'new_design', 'open', 'save']);
    for (const name of SOLIDCRAFT_TOOLS.filter(offeredTool)) expect(TOOL_ARGUMENTS, name).toHaveProperty(name);
    expect(offeredTool('partbuddy_block')).toBe(true);
    expect(offeredTool('a_new_tool')).toBe(false);
  });

  it('refuses arguments outside the schema: over a limit, an unknown key, a missing one, a wrong type', () => {
    expect(inputProblem(tool, { name: 'a', radius: 100 })).toBeNull();
    expect(inputProblem(tool, { name: 'a' })).toBeNull();
    for (const args of [{ name: 'a', radius: 100.001 }, { name: 'a', radius: 500 }, { name: 'a', more: [] }, { radius: 5 }, { name: 'a', radius: '5' }]) {
      expect(inputProblem(tool, args), JSON.stringify(args)).toContain('do not fit the input schema of partbuddy_block');
    }
    // A schema that does not compile holds nothing against the call.
    expect(inputProblem({ name: 'odd', inputSchema: { type: 'object', $schema: 'https://example.com/unknown' } }, { any: 1 })).toBeNull();
  });

  function upstreamWith(calls: string[]): UpstreamTools {
    return {
      instructions: () => undefined,
      listTools: () => Promise.resolve([tool, { name: 'skill_reference', inputSchema: { type: 'object' } }, { name: 'export', inputSchema: { type: 'object' } }]),
      callTool: (name) => {
        calls.push(name);
        return Promise.resolve({ content: [{ type: 'text', text: `${name} ok` }] });
      },
    };
  }

  it('holds in the gate proxy: refused tools are not listed, a call outside the schema never reaches the tool, a guide carries the note', async () => {
    const calls: string[] = [];
    const proxy = new GateProxy(upstreamWith(calls), () => undefined);
    await proxy.start();
    const client = new Client({ name: 'test', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(proxy.url), { requestInit: { headers: { Authorization: `Bearer ${proxy.token}` } } }));
      // A call before any list reads the schemas itself.
      const refused = await client.callTool({ name: 'partbuddy_block', arguments: { name: 'a', radius: 500 } });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused.content)).toContain('do not fit the input schema');
      expect(calls).toEqual([]);
      expect((await client.listTools()).tools.map((entry) => entry.name)).toEqual(['partbuddy_block', 'skill_reference']);
      await client.callTool({ name: 'partbuddy_block', arguments: { name: 'a', radius: 5 } });
      const guide = await client.callTool({ name: 'skill_reference', arguments: { skill: 'solidcraft-modeling' } });
      expect((guide.content as { text: string }[]).map((part) => part.text)).toEqual(['skill_reference ok', SKILL_NOTE]);
      expect(calls).toEqual(['partbuddy_block', 'skill_reference']);
    } finally {
      await client.close();
      await proxy.stop();
    }
  });

  it('holds in the loop of ChatGPT and local models too', async () => {
    const calls: string[] = [];
    const events: AgentEvent[] = [];
    const set = await policyToolSet(upstreamWith(calls), { nextId: () => 'call-1', event: (event) => events.push(event) });
    expect(Object.keys(set)).toEqual(['partbuddy_block', 'skill_reference']);
    const run = (name: string, input: unknown) => (set[name]?.execute as (input: unknown, options: unknown) => Promise<string>)(input, { toolCallId: 'call-1', messages: [] });
    expect(await run('partbuddy_block', { name: 'a', radius: 500 })).toContain('do not fit the input schema');
    expect(events.at(-1)).toMatchObject({ name: 'partbuddy_block', decision: 'denied' });
    expect(calls).toEqual([]);
    expect(await run('skill_reference', { skill: 'solidcraft-modeling' })).toBe(`skill_reference ok\n${SKILL_NOTE}`);
  });
});
