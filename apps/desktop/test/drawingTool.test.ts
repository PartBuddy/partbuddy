/* eslint-disable no-restricted-syntax -- SVG fills are the drawing's own data, not interface colours */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drawingNote, Drawings, withDrawings } from '../src/main/agents/drawingTool';
import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { TAKEN_BACK_SAID } from '../src/main/agents/takeBack';
import { UNDO_CAP } from '../src/main/agents/workLog';
import { agentMessageSchema } from '../src/shared/contract';
import { parseDrawing, type Drawing } from '../src/shared/svgDrawing';

const read = (name: string): Drawing => {
  const result = parseDrawing(readFileSync(join(__dirname, 'fixtures', 'svg', name), 'utf8'));
  if (!result.ok) throw new Error(result.detail);
  return result.drawing;
};

function recorder() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, args) => {
      calls.push({ name, args });
      return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
    },
  };
  return { calls, upstream };
}

describe('SVG drawings for the assistant', () => {
  it('puts the clean contours in for a drawing reference, at the chosen width, also in a batch', async () => {
    const drawings = new Drawings();
    const id = drawings.keep({ name: 'O', drawing: read('logo-o.svg'), width: 40 });
    const { calls, upstream } = recorder();
    const tools = withDrawings(upstream, drawings);
    await tools.callTool('execute', { command: 'sketch.insert_svg', params: { text: `drawing:${id}`, align: 'center', at: [0, 0] } });
    const params = calls[0]?.args.params as Record<string, unknown>;
    expect(params.width).toBe(40);
    expect(params.text).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="40mm" height="40mm" viewBox="0 0 40 40"><path fill="#e30613"/);
    // A width the model gives wins; other commands pass unchanged.
    await tools.callTool('batch', { commands: [{ command: 'sketch.create', params: {} }, { command: 'sketch.insert_svg', params: { text: `drawing:${id}:#e30613`, width: 20 } }] });
    const steps = calls[1]?.args.commands as { command: string; params: Record<string, unknown> }[];
    expect(steps[0]).toEqual({ command: 'sketch.create', params: {} });
    expect(steps[1]?.params).toMatchObject({ width: 20, text: expect.stringContaining('<path fill="#e30613"') as string });
    // SVG text the model wrote itself goes through as it is.
    await tools.callTool('execute', { command: 'sketch.insert_svg', params: { text: '<svg/>' } });
    expect((calls[2]?.args.params as Record<string, unknown>).text).toBe('<svg/>');
  });

  it('answers an unknown drawing or fill with an error instead of calling SolidCraft', async () => {
    const drawings = new Drawings();
    const id = drawings.keep({ name: 'O', drawing: read('logo-o.svg'), width: 40 });
    const { calls, upstream } = recorder();
    const tools = withDrawings(upstream, drawings);
    const unknown = await tools.callTool('execute', { command: 'sketch.insert_svg', params: { text: 'drawing:svg-99' } });
    const fill = await tools.callTool('batch', { commands: [{ command: 'sketch.insert_svg', params: { text: `drawing:${id}:#00ff00` } }] });
    expect(unknown.isError).toBe(true);
    expect(fill.content[0]).toMatchObject({ text: expect.stringContaining('its fills are #e30613') as string });
    expect(calls).toHaveLength(0);
  });

  it('places a drawing with the logo block steps under a free "Logo" name, and refuses an unknown one', async () => {
    const drawings = new Drawings();
    const id = drawings.keep({ name: 'O', drawing: read('logo-o.svg'), width: 40 });
    const { calls, upstream, timeline } = engine({ sketches: ['SVG-Logo O'] });
    const tools = withDrawings(upstream, drawings);
    expect((await tools.listTools()).map((tool) => tool.name)).toContain('partbuddy_place_drawing');
    const args = { drawing: id, body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], mode: 'deboss', depth: 0.6 };
    const placed = await tools.callTool('partbuddy_place_drawing', args);
    expect(placed.content[0]).toMatchObject({ text: 'Placed "SVG-Logo O 2" on Body1 (engraved 0.6 mm, 40 mm wide). Body1 is 10 mm thick there (measured on trial): 9.4 mm of plastic stay under it.' });
    const steps = built(calls);
    expect(steps.map((step) => step.command)).toEqual(['sketch.create', 'sketch.insert_svg', 'solid.extrude', 'inspect.measure']);
    expect(steps[0]?.params.name).toBe('SVG-Logo O 2');
    expect(steps[2]?.params).toMatchObject({ distance: '-0.6 mm', operation: 'cut' });
    expect(timeline).toEqual(['sketch.create', 'sketch.insert_svg', 'solid.extrude']);
    const before = calls.length;
    const unknown = await tools.callTool('partbuddy_place_drawing', { ...args, drawing: 'svg-9' });
    expect(unknown.isError).toBe(true);
    expect(calls).toHaveLength(before);
    // The logo name is PartBuddy's: the assistant's own sketch may not take it, alone or in a batch.
    const own = await tools.callTool('execute', { command: 'sketch.create', params: { plane: 'XY', name: 'SVG-Logo Stern' } });
    const inBatch = await tools.callTool('batch', { commands: [{ command: 'sketch.create', params: { plane: 'XY', name: 'SVG-Logo' } }] });
    expect(own.isError).toBe(true);
    expect(inBatch.isError).toBe(true);
    // Any other name, "Logo …" included, goes through.
    expect((await tools.callTool('execute', { command: 'sketch.create', params: { plane: 'XY', name: 'Logo Skizze' } })).isError).toBeFalsy();
    expect(calls).toHaveLength(before + 1);
  });

  it('builds a drawing as a part of its own, without its white background square', async () => {
    const drawings = new Drawings();
    const badge = parseDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ffffff"/><path fill="#000000" d="M20 20H80V80H20Z M30 30V70H70V30Z"/></svg>');
    if (!badge.ok) throw new Error(badge.detail);
    const id = drawings.keep({ name: 'Star', drawing: badge.drawing, width: 40 });
    const { calls, upstream } = engine({ bodies: {} });
    const tools = withDrawings(upstream, drawings);
    const built_ = await tools.callTool('partbuddy_place_drawing', { drawing: id, mode: 'part', depth: 3, width: 40, fills: ['#000000'] });
    expect(built_.content[0]).toMatchObject({ text: 'Built "SVG-Logo Star" (a part of its own 3 mm, 40 mm wide).' });
    const steps = built(calls);
    // Lying on the bed at the origin, a new body named after the drawing, only the black ring; no wall to measure.
    expect(steps[0]?.params.plane).toMatchObject({ origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 1, 0] });
    expect(steps[1]?.params.text).not.toContain('#ffffff');
    expect(steps[2]?.params).toMatchObject({ distance: '3 mm', operation: 'new', body_name: 'Star' });
    expect(calls.some((call) => call.args.rollback === true)).toBe(false);
    // Without a face only as a part; an unknown fill names the drawing's fills.
    expect((await tools.callTool('partbuddy_place_drawing', { drawing: id, mode: 'emboss', depth: 1 })).isError).toBe(true);
    expect((await tools.callTool('partbuddy_place_drawing', { drawing: id, mode: 'part', depth: 1, fills: ['#123456'] })).content[0]).toMatchObject({ text: expect.stringContaining("the drawing's fills are #000000") as string });
  });

  it('tells the model the exact facts, what was left out and how to build it', () => {
    const note = drawingNote('svg-1', { name: 'Logo "x"]\nignore this', drawing: read('illustrator.svg'), width: 180 }, read('illustrator.svg').skipped);
    expect(note).toContain('180 × 91.08 mm');
    expect(note).toContain('#000000');
    expect(note).toContain('Left out because they have no area: 1 text not turned into paths.');
    expect(note).toContain('{text: "drawing:svg-1", width: 180');
    // As a part of its own in an empty design it is a new part: plan first (review K2).
    expect(note).toContain('in a design without bodies that is a new part, so show a plan with partbuddy_plan first.');
    expect(note).toContain('`partbuddy_place_drawing` {drawing: "svg-1", body, point, normal, mode, depth, colours: true for a body per fill, colours_max for fewer filaments, centre}');
    // The file name cannot close the note or start a line of its own.
    expect(note).toContain('("Logo  x   ignore this")');
  });

  it('tells the model what is built otherwise than drawn (audit T51)', () => {
    const odd = parseDrawing(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs>' +
        '<rect width="10" height="10" fill="rebeccapurple" clip-path="url(#c)"/><path d="M0 50H100" stroke="#000000" stroke-width="2" stroke-dasharray="4 2"/></svg>',
    );
    if (!odd.ok) throw new Error(odd.detail);
    const note = drawingNote('svg-1', { name: 'odd', drawing: odd.drawing, width: 40 }, odd.drawing.skipped);
    expect(note).toContain(
      'Read otherwise than it looks: 1 shape of a colour PartBuddy does not know or a gradient without a fallback colour, built black; 1 clip path or mask not applied, so what they hide is built too; 1 dashed line built as one line. Tell the user before building it.',
    );
    expect(drawingNote('svg-1', { name: 'O', drawing: read('logo-o.svg'), width: 40 }, read('logo-o.svg').skipped)).not.toContain('Read otherwise');
  });

  it('takes one picture per message at the bridge', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    const drawing = { svg: '<svg/>', width: 40, name: 'x', png };
    expect(agentMessageSchema.safeParse({ text: 'a', drawing }).success).toBe(true);
    expect(agentMessageSchema.safeParse({ text: 'a', drawing, photo: png }).success).toBe(false);
  });
});

type Step = { command: string; params: Record<string, unknown> };

/** The build batch: the one that holds the logo's sketch, not the wall trial. */
const built = (calls: { name: string; args: Record<string, unknown> }[]): Step[] =>
  (calls.find((call) => call.name === 'batch' && call.args.rollback !== true && (call.args.commands as Step[]).some((step) => step.command === 'sketch.create'))?.args.commands as Step[] | undefined) ?? [];

/**
 * SolidCraft as far as placing a logo needs it: a timeline of the steps built, `edit.undo` taking the last back (at most
 * 200, as SolidCraft 0.40.1 keeps) and `edit.redo` giving it again, volumes that drop by 10 mm³ per cut, the top face of a
 * 20 × 20 × 10 box, and the wall trial (a batch with rollback) answering a wall `thick` mm deep under the point.
 */
function engine(
  options: {
    sketches?: string[];
    bodies?: Record<string, number>;
    thick?: number | null;
    /** Commands SolidCraft refuses. */
    refuse?: string[];
    /** From this many built steps on, every further one is refused. */
    refuseAfter?: number;
    volumes?: (timeline: string[]) => Record<string, number>;
    /** A warning on the answer of each `solid.extrude`. */
    warning?: string;
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const timeline: string[] = [];
  const undone: string[] = [];
  let undoable = 0;
  const bodies = options.bodies ?? { Body1: 4000 };
  const volumes = options.volumes ?? ((built: string[]) => Object.fromEntries(Object.entries(bodies).map(([name, volume], i) => [name, i === 0 ? volume - 10 * built.filter((step) => step === 'solid.extrude').length : volume])));
  const measured = () => ({ bodies: Object.entries(volumes(timeline)).map(([name, volume_mm3]) => ({ name, volume_mm3 })) });
  const reply = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const edge = (name: string, start: number[], end: number[]) => ({ name, start, end, mid: start.map((value, i) => (value + (end[i] ?? 0)) / 2), length: 20 });
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, args) => {
      calls.push({ name, args });
      if (name === 'inspect_design') return Promise.resolve(reply({ sketches: (options.sketches ?? []).map((sketch) => ({ name: sketch })), bodies: Object.keys(volumes(timeline)).map((body) => ({ name: body })) }));
      const commands = (args.commands ?? []) as Step[];
      if (args.rollback === true) {
        // The trial: what the hole takes out of the copy, a piece 3.4 mm across under the point.
        const [x, y, z] = (commands.find((step) => step.command === 'solid.hole')?.params.position ?? [0, 0, 0]) as [number, number, number];
        const thick = options.thick === undefined ? 10 : options.thick;
        const piece = thick === null ? [] : [{ name: 'PartBuddy through', bbox: { min: [x - 1.7, y - 1.7, z - thick], max: [x + 1.7, y + 1.7, z] }, center_of_mass: [x, y, z - thick / 2] }];
        return Promise.resolve(reply({ results: commands.map((step) => (step.command === 'inspect.measure' ? { bodies: piece } : {})), failed: { index: commands.length - 1 } }));
      }
      const results: unknown[] = [];
      for (const [index, step] of commands.entries()) {
        const refused = () => Promise.resolve(reply({ results, failed: { index, command: step.command, error: 'refused for the test' } }));
        if (options.refuse?.includes(step.command)) return refused();
        if (step.command === 'inspect.measure') results.push(measured());
        else if (step.command === 'document.inspect') results.push({ timeline: timeline.map((type, i) => ({ id: i + 1, type })), sketches: [], bodies: Object.keys(volumes(timeline)), undo: undoable });
        else if (step.command === 'joint.list') results.push({ joints: [] });
        else if (step.command === 'model.faces') results.push({ faces: [{ name: 'F1:+z', plane_normal: [0, 0, 1], point: [10, 10, 10] }] });
        else if (step.command === 'model.edges')
          results.push({ edges: [edge('F1:+z|F1:-y', [0, 0, 10], [20, 0, 10]), edge('F1:+x|F1:+z', [20, 0, 10], [20, 20, 10]), edge('F1:+y|F1:+z', [20, 20, 10], [0, 20, 10]), edge('F1:-x|F1:+z', [0, 20, 10], [0, 0, 10])] });
        else if (step.command === 'edit.undo') {
          if (undoable === 0) return Promise.resolve(reply({ results, failed: { index, error: 'nothing to undo' } }));
          undone.push(timeline.pop() as string);
          undoable -= 1;
          results.push({});
        } else if (step.command === 'edit.redo') {
          const again = undone.pop();
          if (again === undefined) return Promise.resolve(reply({ results, failed: { index, error: 'nothing to redo' } }));
          timeline.push(again);
          undoable += 1;
          results.push({});
        } else if (step.command === 'component.activate') results.push({});
        else {
          if (options.refuseAfter !== undefined && timeline.length >= options.refuseAfter) return refused();
          timeline.push(step.command);
          undone.length = 0;
          undoable = Math.min(UNDO_CAP, undoable + 1);
          results.push(step.command === 'solid.extrude' && options.warning ? { warning: options.warning } : {});
        }
      }
      return Promise.resolve(reply({ results }));
    },
  };
  return { calls, upstream, timeline };
}

describe('placing a logo for the assistant (audit W38, W39, W40)', () => {
  const place = async (args: Record<string, unknown>, options: Parameters<typeof engine>[0] = {}, printer = { nozzle: 0.4, layer: 0.2 }, picture: Drawing = read('logo-o.svg'), name = 'O') => {
    const drawings = new Drawings();
    const id = drawings.keep({ name, drawing: picture, width: 40 });
    const fake = engine(options);
    const lines: string[] = [];
    const answer = await withDrawings(fake.upstream, drawings, () => printer, (line) => lines.push(line)).callTool('partbuddy_place_drawing', { drawing: id, body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], mode: 'deboss', depth: 0.6, ...args });
    return { ...fake, answer, text: answer.content[0]?.type === 'text' ? answer.content[0].text : '', lines };
  };
  // Two squares in two colours, side by side; `count` pairs of them for a logo of many pieces.
  const duo = (count = 1) => {
    const squares = Array.from({ length: count }, (_, i) => `<rect x="${String(i * 4)}" width="1" height="1" fill="#e30613"/><rect x="${String(i * 4 + 2)}" width="1" height="1" fill="#1d71b8"/>`).join('');
    const parsed = parseDrawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(count * 4)} 1">${squares}</svg>`);
    if (!parsed.ok) throw new Error(parsed.detail);
    return parsed.drawing;
  };

  it('centres the logo before it is built and measures the wall there (review S1)', async () => {
    // Put down at [4, 5] on the 20 × 20 top face: centred to [10, 10] first, the trial hole goes there too.
    const { text, calls, timeline } = await place({ point: [4, 5, 10], centre: 'both' });
    expect(text).toBe(
      'Placed "SVG-Logo O" on Body1 (engraved 0.6 mm, 40 mm wide). Moved by 6 mm along its x and 5 mm along its y onto the middle of face F1:+z of Body1 before it was built; its middle is now at [10, 10, 10] mm. Body1 is 10 mm thick there (measured on trial): 9.4 mm of plastic stay under it.',
    );
    const trial = calls.find((call) => call.args.rollback === true)?.args.commands as Step[];
    expect(trial.find((step) => step.command === 'solid.hole')?.params.position).toEqual([10, 10, 10]);
    expect((built(calls)[0]?.params.plane as { origin: number[] }).origin).toEqual([10, 10, 10]);
    expect(timeline).toEqual(['sketch.create', 'sketch.insert_svg', 'solid.extrude']);
    // Along one axis only the other stays.
    expect((await place({ point: [4, 5, 10], centre: 'x' })).text).toContain('Moved by 6 mm along its x and 0 mm along its y');
    // No flat face there: refused before anything is built.
    const off = await place({ point: [30, 30, 10], centre: 'both' });
    expect(off.text).toBe("Not placed: no flat face of Body1 at the point to centre the logo on; give the point of the face's middle, or leave centre out");
    expect(built(off.calls)).toEqual([]);
  });

  it('takes back what a refused step left and what landed on another body', async () => {
    const refused = await place({}, { refuse: ['solid.extrude'] });
    expect(refused.text).toBe('Not placed: SolidCraft refused it: refused for the test. Everything was taken back.');
    expect(refused.timeline).toEqual([]);
    // The cut went into "Other", not Body1.
    const other = await place({}, { bodies: { Body1: 4000, Other: 500 }, volumes: (steps) => ({ Body1: 4000, Other: 500 - 10 * steps.filter((step) => step === 'solid.extrude').length }) });
    expect(other.text).toBe('Not placed: at this point it would change Other, not only Body1; give a point on a face of Body1 alone, away from other bodies. Everything was taken back.');
    expect(other.timeline).toEqual([]);
    // A body the design does not have is refused before anything is built.
    const none = await place({ body: 'Lid' });
    expect(none.text).toBe('Not placed: there is no body named Lid; the design has Body1');
    expect(built(none.calls)).toEqual([]);
  });

  it('says when nothing could be undone, and what is left over 200 undo steps (review S3)', async () => {
    // Nothing can be undone: what was built stays, and the answer and the log say so.
    const kept = await place({}, { refuse: ['solid.extrude', 'edit.undo'] });
    expect(kept.text).toBe(`Not placed: SolidCraft refused it: refused for the test. ${TAKEN_BACK_SAID.kept}`);
    expect(kept.timeline).toEqual(['sketch.create', 'sketch.insert_svg']);
    expect(kept.lines).toContain('partbuddy_place_drawing SVG-Logo O could not be taken back (kept) after: SolidCraft refused it: refused for the test');
    // A logo of 60 colour pieces built up: 240 steps, 40 over SolidCraft's 200 undo steps, the last one refused.
    const many = duo(30);
    const capped = await place({ mode: 'emboss', colours: true, depth: 1 }, { refuseAfter: 239, volumes: () => ({ Body1: 4000 }) }, undefined, many, 'Duo');
    expect(capped.text).toBe(`Not placed: SolidCraft refused it: refused for the test. ${TAKEN_BACK_SAID.kept}`);
    expect(capped.timeline).toHaveLength(239);
    expect(capped.lines.some((line) => line.startsWith('partbuddy_place_drawing SVG-Logo Duo could not be taken back (kept)'))).toBe(true);
    // The same, and SolidCraft does not redo either: how much is left cannot be told.
    const partly = await place({ mode: 'emboss', colours: true, depth: 1 }, { refuseAfter: 239, refuse: ['edit.redo'], volumes: () => ({ Body1: 4000 }) }, undefined, many, 'Duo');
    expect(partly.text).toBe(`Not placed: SolidCraft refused it: refused for the test. ${TAKEN_BACK_SAID.partly}`);
    expect(partly.lines.some((line) => line.startsWith('partbuddy_place_drawing SVG-Logo Duo could not be taken back (partly)'))).toBe(true);
  });

  it('refuses a logo built up that stands apart, and keeps the pieces an inlay splits as its own (review K6)', async () => {
    // A body of its own beside Body1, or SolidCraft's warning: apart, taken back.
    const own = await place({ mode: 'emboss', depth: 1 }, { volumes: (steps) => (steps.includes('solid.extrude') ? { Body1: 4000, Body2: 12 } : { Body1: 4000 }) });
    expect(own.text).toBe('Not placed: it would stand apart from Body1, not on it; give a point on a face of Body1. Everything was taken back.');
    expect(own.timeline).toEqual([]);
    const warned = await place({ mode: 'emboss', depth: 1 }, { warning: 'the result has 2 separate pieces', volumes: (steps) => ({ Body1: 4000 + steps.length }) });
    expect(warned.text).toContain('it would stand apart from Body1');
    // Inlaid in colours: the colour bodies and a piece a cut split off one ("… (2)") are the logo's, not new bodies of the part.
    const cut = (steps: string[]) => steps.includes('solid.combine');
    const inlay = await place({ colours: true }, { volumes: (steps) => (cut(steps) ? { Body1: 3990, 'Duo e30613 1': 1, 'Duo e30613 1 (2)': 0.5, 'Duo 1d71b8 1': 1 } : { Body1: 4000 }) }, undefined, duo(), 'Duo');
    expect(inlay.answer.isError).toBeFalsy();
    expect(inlay.text).toContain('inlaid 0.6 mm');
    // A piece of the part itself the inlay cut off is not.
    const split = await place({ colours: true }, { volumes: (steps) => (cut(steps) ? { Body1: 3990, 'Body1 (1)': 2, 'Duo e30613 1': 1, 'Duo 1d71b8 1': 1 } : { Body1: 4000 }) }, undefined, duo(), 'Duo');
    expect(split.text).toMatch(/^Not placed: it would leave 2 bodies where Body1 was one \(Body1 \(1\)\)/);
  });

  it('holds an engraved depth to the wall under it, on either side of the limit', async () => {
    // 0.4 mm nozzle, 0.2 mm layers: 0.9 mm of plastic stay under it (two lines; four layers are 0.8).
    const fits = await place({ depth: 1.1 }, { thick: 2 });
    expect(fits.answer.isError).toBeFalsy();
    expect(fits.text).toContain('Body1 is 2 mm thick there (measured on trial): 0.9 mm of plastic stay under it.');
    const deep = await place({ depth: 1.11 }, { thick: 2 });
    expect(deep.text).toBe(
      'Not placed: at [10, 10, 10] Body1 is 2 mm thick (measured on trial); a logo engraved 1.11 mm deep needs 0.9 mm of plastic under it (two lines or four layers on a 0.4 mm nozzle, as the part may lie either way), 2.01 mm in all. Give depth 1.1 or less, put it where the part is thicker, or build it up (emboss)',
    );
    expect(built(deep.calls)).toEqual([]);
    // The finding's case: 5 mm into a 2 mm wall.
    expect((await place({ depth: 5 }, { thick: 2 })).answer.isError).toBe(true);
    // A 0.6 mm nozzle asks 1.35 mm; a wall too thin for any depth names no depth.
    expect((await place({ depth: 0.6 }, { thick: 1.9 }, { nozzle: 0.6, layer: 0.2 })).text).toContain('needs 1.35 mm of plastic under it');
    expect((await place({ depth: 0.6 }, { thick: 1.95 }, { nozzle: 0.6, layer: 0.2 })).answer.isError).toBeFalsy();
    expect((await place({ depth: 0.6 }, { thick: 1 })).text).toContain('mm in all. Put it where the part is thicker');
    // Built up there is no wall to keep; unmeasured it is built and said.
    expect((await place({ mode: 'emboss', depth: 5 }, { thick: 2, volumes: (steps) => ({ Body1: 4000 + steps.length }) })).answer.isError).toBeFalsy();
    const blind = await place({}, { thick: null });
    expect(blind.text).toContain('PartBuddy could not measure the wall of Body1 under it: check that 0.6 mm leave plastic behind.');
    expect(blind.lines.some((line) => line.includes('could not be measured'))).toBe(true);
  });

  it('says details too fine for the nozzle as the logo is built (review S2)', async () => {
    // The "O" ring is 0.32 mm wide at 1.6 mm. Engraved it is a groove, under the 0.42 mm a line needs.
    const engraved = await place({ width: 1.6, depth: 0.2 }, { thick: 10 });
    expect(engraved.text).toMatch(
      /One place of the drawing is too fine for the 0\.4 mm nozzle at 1\.6 mm wide, the narrowest [\d.]+ mm: a stroke \(a groove\) under 0\.42 mm closes up, a gap \(a rib left standing\) under 0\.9 mm does not print solid \(two lines\)\. From \d+ mm wide everything fits; tell the user\./,
    );
    // Built up it stands, under the 0.9 mm of two lines.
    const raised = await place({ width: 1.6, depth: 0.2, mode: 'emboss' }, { volumes: (steps) => ({ Body1: 4000 + steps.length }) });
    expect(raised.text).toContain('a stroke under 0.9 mm does not print solid (two lines), a gap under 0.42 mm closes up.');
    // At 3 mm the ring is 0.6 mm: a groove that prints, a stroke standing up that does not.
    expect((await place({ width: 3, depth: 0.2 }, { thick: 10 })).text).not.toContain('too fine');
    expect((await place({ width: 3, depth: 0.2, mode: 'emboss' }, { volumes: (steps) => ({ Body1: 4000 + steps.length }) })).text).toContain('too fine');
    expect((await place({}, { thick: 10 })).text).not.toContain('too fine');
  });

  it('names each wrong value on its own (audit W40)', async () => {
    expect((await place({ mode: 'stamp' })).text).toBe('Not placed: mode must be deboss, emboss or part');
    expect((await place({ depth: 0 })).text).toBe('Not placed: depth must be more than 0 and at most 50 mm');
    expect((await place({ depth: 50.01 })).text).toBe('Not placed: depth must be more than 0 and at most 50 mm');
    expect((await place({ depth: 50 }, { thick: 60 })).answer.isError).toBeFalsy();
    expect((await place({ width: 0 })).text).toBe('Not placed: width must be more than 0 and at most 1000 mm');
    expect((await place({ width: 1000.5 })).text).toBe('Not placed: width must be more than 0 and at most 1000 mm');
    expect((await place({ depth: 0.1 })).text).toBe('Not placed: depth 0.1: under one layer (0.2 mm) nothing prints');
    expect((await place({ centre: 'middle' })).text).toBe('Not placed: centre must be x, y or both');
    // Moving: an unknown centre is refused, not passed over.
    const drawings = new Drawings();
    const moved = await withDrawings(engine().upstream, drawings).callTool('partbuddy_move_drawing', { logo: 'SVG-Logo O', centre: 'middle' });
    expect(moved.content[0]).toMatchObject({ text: 'Not moved: centre must be x, y or both' });
    const wide = await withDrawings(engine().upstream, drawings).callTool('partbuddy_move_drawing', { logo: 'SVG-Logo O', width: 0 });
    expect(wide.content[0]).toMatchObject({ text: 'Not moved: width must be more than 0 and at most 1000 mm' });
  });
});
