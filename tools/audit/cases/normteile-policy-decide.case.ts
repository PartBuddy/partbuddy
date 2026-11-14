import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Drawings, withDrawings } from '../../../apps/desktop/src/main/agents/drawingTool';
import { decide } from '../../../apps/desktop/src/main/agents/policy';
import { Questions } from '../../../apps/desktop/src/main/agents/questions';
import { CHANGING_TOOLS } from '../../../apps/desktop/src/main/agents/workLog';
import { parseDrawing } from '../../../apps/desktop/src/shared/svgDrawing';
import { openAudit } from '../harness';
import { attempt, finish, text, upstreamOf } from '../normteile-policy-helpers';

const NAME = 'normteile-policy/decide';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="#000000"/></svg>';

// W42 / R2 and the ways to a bad model: policy.ts decide() fed with each call, allow or deny; and what the real
// SolidCraft does with the forms the policy lets through unread.
test('decide() call by call, and SolidCraft on what passes', async () => {
  const audit = await openAudit(NAME);
  try {
    const inside = (file: string) => join(audit.dir, file);
    const exportTo = (file: string) => ({ command: 'file.export', params: { path: inside(file), format: 'stl' } });
    await audit.batch([{ command: 'solid.box', params: { length: '20 mm', width: '20 mm', height: '20 mm', operation: 'new', body_name: 'Cube', name: 'Cube' } }]);

    // [id, tool, args, file SolidCraft would have written or null, send to SolidCraft when allowed]
    const rows: [string, string, Record<string, unknown>, string | null, boolean][] = [
      // W42 (a): wrapped file commands
      ['file command, plain execute', 'execute', exportTo('plain.stl'), 'plain.stl', false],
      ['file command as batch step', 'batch', { commands: [exportTo('step.stl')] }, 'step.stl', false],
      ['execute wrapped in execute', 'execute', { command: 'execute', params: exportTo('nested-execute.stl') }, 'nested-execute.stl', true],
      ['batch as execute command', 'execute', { command: 'batch', params: { commands: [exportTo('execute-batch.stl')] } }, 'execute-batch.stl', true],
      ['batch as batch step', 'batch', { commands: [{ command: 'batch', params: { commands: [exportTo('batch-batch.stl')] } }] }, 'batch-batch.stl', true],
      ['execute as batch step', 'batch', { commands: [{ command: 'execute', params: exportTo('batch-execute.stl') }] }, 'batch-execute.stl', false],
      ['execute in execute as batch step', 'batch', { commands: [{ command: 'execute', params: { command: 'execute', params: exportTo('batch-execute-execute.stl') } }] }, 'batch-execute-execute.stl', true],
      ['export tool as batch step', 'batch', { commands: [{ command: 'export', params: { path: inside('tool-export.stl'), format: 'stl' } }] }, 'tool-export.stl', false],
      ['save tool as execute command', 'execute', { command: 'save', params: { file: inside('saved.sc') } }, 'saved.sc', true],
      // W42 (b): file arguments of tools and other names than `path`
      ['screenshot with path', 'screenshot', { path: inside('shot.png') }, 'shot.png', true],
      ['screenshot as batch step with path', 'batch', { commands: [{ command: 'screenshot', params: { path: inside('shot-step.png') } }] }, 'shot-step.png', true],
      ['compare_picture with reference file', 'compare_picture', { reference: inside('reference.png') }, null, true],
      ['path as a list', 'execute', { command: 'timeline.export_script', params: { path: [inside('script-list.json')] } }, 'script-list.json', true],
      ['path that reads like a curve id', 'execute', { command: 'timeline.export_script', params: { path: 'ab12' } }, null, true],
      ['sketch.insert_svg with path', 'execute', { command: 'sketch.insert_svg', params: { path: inside('logo.svg'), plane: 'XY' } }, null, false],
      ['sketch.insert_svg with text', 'execute', { command: 'sketch.insert_svg', params: { text: SVG, plane: 'XY' } }, null, false],
      ['sketch.replace from a design file (file, not path)', 'execute', { command: 'sketch.replace', params: { from: 'Sketch1', file: inside('other.sc') } }, null, true],
      ['timeline.export_script without path', 'execute', { command: 'timeline.export_script', params: {} }, null, false],
      ['document.units', 'execute', { command: 'document.units', params: { units: 'mm' } }, null, false],
      ['doc.recovery_list', 'execute', { command: 'doc.recovery_list', params: {} }, null, false],
      ['new_design', 'new_design', {}, null, false],
      ['new_design as batch step', 'batch', { commands: [{ command: 'new_design', params: {} }] }, null, false],
      ['edit.restore_checkpoint', 'execute', { command: 'edit.restore_checkpoint', params: { checkpoint: 1 } }, null, false],
      // R2 and the ways W2, W3, W8, X1, X3, X4: raw commands that have a checked PartBuddy way
      ['solid.hole raw', 'execute', { command: 'solid.hole', params: { position: [10, 10, 20], diameter: '3 mm' } }, null, false],
      ['solid.hole thread M2 modelled', 'execute', { command: 'solid.hole', params: { position: [10, 10, 20], thread: 'M2', modeled: true } }, null, false],
      ['solid.hole thread M3 modelled, as batch step', 'batch', { commands: [{ command: 'solid.hole', params: { position: [10, 10, 20], thread: 'M3', modeled: true } }] }, null, false],
      ['solid.shell 0.2 mm', 'execute', { command: 'solid.shell', params: { faces: [[10, 10, 20]], thickness: '0.2 mm' } }, null, false],
      ['plastic.snap_fit', 'execute', { command: 'plastic.snap_fit', params: { position: [10, 10, 20], hook: [1, 0, 0], length: '4 mm', thickness: '2 mm', width: '5 mm', catch_depth: '1 mm', catch_length: '1.5 mm' } }, null, false],
      ['plastic.boss', 'execute', { command: 'plastic.boss', params: { position: [10, 10, 20], diameter: '3 mm', height: '10 mm', hole_diameter: '2.6 mm' } }, null, false],
      ['plastic.lip', 'execute', { command: 'plastic.lip', params: { face: [10, 0.1, 20], width: '0.2 mm', height: '2 mm' } }, null, false],
      ['solid.thread', 'execute', { command: 'solid.thread', params: { face: [10, 10, 10], designation: 'M2' } }, null, false],
      ['joint.as_built without limits', 'execute', { command: 'joint.as_built', params: { type: 'revolute', a: 1, b: 2 } }, null, false],
      ['parts.insert', 'execute', { command: 'parts.insert', params: { family: 'countersunk_socket_screw', size: 'M3', point: [0, 0, 40] } }, null, false],
      ['parts.resize', 'execute', { command: 'parts.resize', params: { component: 1, size: 'M8' } }, null, false],
      ['component.metadata.set description', 'execute', { command: 'component.metadata.set', params: { component: 'Cube', description: 'Hex nut M3' } }, null, false],
      ['timeline.suppress', 'execute', { command: 'timeline.suppress', params: { feature: 'Cube' } }, null, false],
      ['timeline.delete', 'execute', { command: 'timeline.delete', params: { feature: 'Cube' } }, null, false],
      ['browser.visibility hide a body', 'execute', { command: 'browser.visibility', params: { visible: false, items: ['Cube'] } }, null, false],
      ['solid.scale', 'execute', { command: 'solid.scale', params: { bodies: ['Cube'], factor: 0.5 } }, null, false],
      ['body.print_face', 'execute', { command: 'body.print_face', params: { body: 'Cube', point: [10, 10, 20] } }, null, false],
      ['set_parameter with a name nobody has', 'set_parameter', { name: 'wnad', value: '6 mm' }, null, false],
    ];

    const table = [];
    for (const [id, tool, args, file, send] of rows) {
      const decision = decide(tool, args);
      const reply = decision.allow && send ? await attempt(async () => text(await audit.tool(tool, args))) : undefined;
      table.push({ id, tool, args, allow: decision.allow, reason: decision.allow ? null : decision.reason, solidcraft: reply, ...(file ? { fileWritten: existsSync(inside(file)) } : {}) });
    }

    // compare_picture needs the reference to exist to say what it does with it.
    const shot = table.find((row) => row.id === 'screenshot with path');
    // A path outside the folder SolidCraft was allowed (--allow-path out/<case>): one level up.
    const outside = join(audit.dir, '..', 'outside-allow-path.png');
    const outsideReply = await attempt(async () => text(await audit.tool('screenshot', { path: outside })));

    // W37 / W17: an open plan, then the changing tools. The app stacks questions.tools over the drawings (main/index.ts:583-600).
    const drawings = new Drawings();
    const parsed = parseDrawing(SVG);
    if (!parsed.ok) throw new Error(parsed.detail);
    const drawing = drawings.keep({ name: 'Badge', drawing: parsed.drawing, width: 10 });
    const events: unknown[] = [];
    const questions = new Questions((event) => events.push(event));
    const gated = questions.tools(withDrawings(upstreamOf(audit), drawings));
    const bodiesNow = async () => ((await audit.batch([{ command: 'document.inspect', params: {} }]))[0] as { features?: unknown[]; sketches?: { name?: string }[] });
    const beforePlan = await bodiesNow();
    const plan = await gated.callTool('partbuddy_plan', { summary: 'A cube with a badge.', steps: ['Engrave the badge'] }, undefined);
    const whileOpen = [];
    for (const [tool, args] of [
      ['execute', { command: 'solid.hole', params: { position: [10, 10, 20], diameter: '3 mm' } }],
      ['batch', { commands: [{ command: 'solid.hole', params: { position: [10, 10, 20], diameter: '3 mm' } }] }],
      ['partbuddy_block', { block: 'screwHole', body: 'Cube', point: [10, 10, 20], size: 'M3', head: 'none' }],
      ['partbuddy_place_drawing', { drawing, body: 'Cube', point: [10, 10, 20], normal: [0, 0, 1], mode: 'deboss', depth: 0.6 }],
      ['partbuddy_move_drawing', { logo: 'SVG-Logo Badge', by: [2, 0] }],
    ] as [string, Record<string, unknown>][]) {
      const reply = await gated.callTool(tool, args, undefined);
      whileOpen.push({ tool, inChangingTools: CHANGING_TOOLS.has(tool), policy: decide(tool, args).allow, isError: reply.isError === true, text: reply.content.find((part) => part.type === 'text')?.text });
    }
    const afterPlan = await bodiesNow();
    const [volume] = (await audit.batch([{ command: 'inspect.measure', params: { bodies: ['Cube'] } }])) as [{ bodies: { volume_mm3: number }[] }];

    const result = {
      table,
      screenshotFileBytes: shot?.fileWritten ? readFileSync(inside('shot.png')).length : null,
      screenshotOutsideAllowPath: { path: outside, reply: outsideReply, fileWritten: existsSync(outside) },
      w37: {
        changingTools: [...CHANGING_TOOLS],
        planOpen: questions.open !== null,
        plan: plan.content.find((part) => part.type === 'text')?.text,
        whileOpen,
        featuresBefore: beforePlan.features?.length,
        featuresAfter: afterPlan.features?.length,
        sketchesAfter: afterPlan.sketches?.map((sketch) => sketch.name),
        cubeVolumeAfter: volume.bodies[0]?.volume_mm3,
      },
    };
    mkdirSync(audit.dir, { recursive: true });
    writeFileSync(inside('table.md'), ['| Aufruf | Werkzeug | decide |', '|---|---|---|', ...table.map((row) => `| ${row.id} | ${row.tool} | ${row.allow ? 'allow' : 'deny'} |`)].join('\n'));
    await finish(audit, NAME, result);
    expect(table.length).toBe(rows.length);
  } finally {
    await audit.close();
  }
});
