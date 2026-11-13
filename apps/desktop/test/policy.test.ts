import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';

import { GateProxy, type ToolCallRecord, type ToolResult, type UpstreamTools } from '../src/main/agents/gateProxy';
import { COMMAND_GROUPS, decide, decideParameterNames, GROUP_EXCEPTIONS, namesToChange, REFUSED_COMMANDS } from '../src/main/agents/policy';
import { TOOL_NOTES } from '../src/main/agents/toolNotes';

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
    // Neighbours that change nothing PartBuddy cannot show stay.
    for (const command of ['timeline.suppress', 'timeline.rollback', 'occurrence.copy', 'occurrence.ground', 'parameters.add', 'parameters.list']) {
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
});
