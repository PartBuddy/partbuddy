import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ASSEMBLY_GUIDANCE, JOINT_GUIDANCE } from '../src/main/agents/assemblyTool';
import { BLOCK_GUIDANCE } from '../src/main/agents/blockTool';
import { roleOf } from '../src/main/agents/claudeCode';
import { drawingNote } from '../src/main/agents/drawingTool';
import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { instructionsFor, LIMITS_GUIDANCE, ownLoopNote, PICTURE_TOOLS, policyToolSet, ROLE_INTRO, rolePrompt } from '../src/main/agents/loop';
import { MECHANISM_GUIDANCE } from '../src/main/agents/mechanismTool';
import { PHOTO_COMPARE, photoFile, photoNote } from '../src/main/agents/photoNote';
import { ANSWER_GUIDANCE } from '../src/main/agents/questions';
import { NO_RESEARCH_GUIDANCE, RESEARCH_GUIDANCE } from '../src/main/agents/research';
import { SKETCH_LIST, sketchNote } from '../src/main/agents/sketchNote';
import { STANDARD_GUIDANCE } from '../src/main/agents/standardTool';
import { SCREENSHOT_GUIDANCE, VIEW_TOOL, withViewTool } from '../src/main/agents/viewContext';
import { blindNote, UNSEEN_DRAWING, UNSEEN_PICTURE, UNSEEN_SKETCH } from '../src/main/local/localAgent';
import { parseDrawing } from '../src/shared/svgDrawing';

/** Guidance of other lanes' files, as placeholders: the snapshots hold what the routes differ in, not those texts. */
const FOREIGN = { ASSEMBLY_GUIDANCE, JOINT_GUIDANCE, MECHANISM_GUIDANCE, BLOCK_GUIDANCE, STANDARD_GUIDANCE };
function skeleton(prompt: string): string {
  let text = prompt;
  for (const [name, value] of Object.entries(FOREIGN)) {
    expect(text).toContain(value);
    text = text.replace(value, `<${name}>`);
  }
  // One sentence a line, for a readable diff; "1. Concept" stays on one line.
  return text.replace(/(?<=[a-z)\]]\.) (?=[A-Z<])/g, '\n');
}

const upstream: UpstreamTools = { instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.reject(new Error('unused')) };

/** Each route's role: Claude Code with and without research, ChatGPT likewise, local models never research. */
const ROUTES = {
  'Claude Code': roleOf(false),
  'Claude Code, research': roleOf(true),
  ChatGPT: rolePrompt(true, false),
  'ChatGPT, research': rolePrompt(true, true),
  local: rolePrompt(true, false),
};

describe('role prompts per route (BC-21)', () => {
  it('gives each route its role as the snapshot holds it', () => {
    for (const [route, prompt] of Object.entries(ROUTES)) expect(skeleton(prompt)).toMatchSnapshot(route);
    // The own loops send exactly that role before the tool notes; the local route passes research false (localAgent.ts).
    for (const research of [false, true]) expect(instructionsFor(upstream, research).startsWith(`${rolePrompt(true, research)}\n\n`)).toBe(true);
    expect(readFileSync(join(__dirname, '../src/main/local/localAgent.ts'), 'utf8')).toContain('instructions: instructionsFor(upstream, false)');
  });

  it('says on every route how SolidCraft runs and what its tools are, and owns up to limits (R21, R27)', () => {
    for (const prompt of Object.values(ROUTES)) {
      expect(prompt.startsWith(ROLE_INTRO)).toBe(true);
      expect(prompt).toContain(LIMITS_GUIDANCE);
      // Before: the own loops said SolidCraft was open and named "solidcraft tools", Claude Code "only the partbuddy tools".
      expect(prompt).not.toContain('SolidCraft is open');
      expect(prompt).not.toMatch(/solidcraft tools|only the partbuddy tools/i);
    }
    expect(ROLE_INTRO).toContain('SolidCraft runs in the background');
    expect(LIMITS_GUIDANCE).toContain('mains voltage, food, load over a person or heat');
  });

  it('advises a screenshot only where the model gets the picture (R24, W44)', () => {
    expect(roleOf(false)).toContain(SCREENSHOT_GUIDANCE);
    for (const prompt of [ROUTES.ChatGPT, ROUTES['ChatGPT, research'], ROUTES.local]) expect(prompt).not.toMatch(/screenshot/i);
  });

  it('offers the own loops no tool whose answer is a picture (R24)', async () => {
    const names = ['measure', 'screenshot', 'compare_picture', 'execute'];
    const listing: UpstreamTools = { ...upstream, listTools: () => Promise.resolve(names.map((name) => ({ name, inputSchema: { type: 'object', properties: {} } }))) };
    const tools = await policyToolSet(listing, { nextId: () => 'id', event: () => undefined });
    expect(Object.keys(tools)).toEqual(['measure', 'execute']);
    expect([...PICTURE_TOOLS]).toEqual(['screenshot', 'compare_picture']);
    // partbuddy_view says what the user looks at in words and no longer points to a screenshot or counts tokens (R43).
    const view = (await withViewTool(upstream, () => null).listTools()).find((tool) => tool.name === VIEW_TOOL);
    expect(view?.description).not.toMatch(/screenshot|tokens/);
    expect(view?.description).toContain('as text');
  });

  it('drops the photo note\'s compare step on the own loops only (R24)', () => {
    const file = photoFile(join(tmpdir(), 'P'), new Date(2026, 10, 13, 9, 5, 7));
    const note = photoNote([file]);
    expect(note).toContain(PHOTO_COMPARE);
    expect(note).toContain('scale it with `canvas.calibrate` from a dimension the user gave and model on it, then check the outline with `compare_picture`');
    const own = ownLoopNote(`[PartBuddy: profile]\n${note}`);
    expect(own).not.toContain('compare_picture');
    expect(own).toContain('scale it with `canvas.calibrate` from a dimension the user gave and model on it. Skip this for a photo taken at an angle.]');
    expect(own?.startsWith('[PartBuddy: profile]\n')).toBe(true);
    expect(ownLoopNote(null)).toBeNull();
  });

  it('tells research from none: look up only where the route may search (R25)', () => {
    for (const prompt of [ROUTES['Claude Code, research'], ROUTES['ChatGPT, research']]) {
      expect(prompt).toContain(RESEARCH_GUIDANCE);
      expect(prompt).not.toContain(NO_RESEARCH_GUIDANCE);
      expect(prompt).toContain('look up product data instead of asking for it');
    }
    for (const prompt of [ROUTES['Claude Code'], ROUTES.ChatGPT, ROUTES.local]) {
      expect(prompt).toContain(NO_RESEARCH_GUIDANCE);
      expect(prompt).not.toContain(RESEARCH_GUIDANCE);
      expect(prompt).not.toMatch(/look (them )?up/);
    }
    expect(NO_RESEARCH_GUIDANCE).toContain('You cannot search the web in this conversation.');
    expect(NO_RESEARCH_GUIDANCE).toContain('partbuddy_standard');
  });

  it('keeps answers short without leaving out limits, and takes the material from the profile (R26, R41)', () => {
    for (const prompt of Object.values(ROUTES)) {
      expect(prompt).toContain(ANSWER_GUIDANCE);
      expect(prompt).not.toContain('PLA is stiff');
      expect(prompt).toContain('the material of the print profile decides how far an arm may bend');
    }
    expect(ANSWER_GUIDANCE).toContain('Never leave out, for the sake of brevity: what does not print or was not checked');
  });
});

describe('picture notes for a local model that cannot see pictures (R58)', () => {
  const before = '[PartBuddy: printer note]';

  it('finds where each of PartBuddy\'s picture notes starts', () => {
    const file = photoFile(join(tmpdir(), 'P'), new Date(2026, 10, 13, 9, 5, 7));
    const read = parseDrawing(readFileSync(join(__dirname, 'fixtures', 'svg', 'logo-o.svg'), 'utf8'));
    if (!read.ok) throw new Error(read.detail);
    const drawing = drawingNote('svg-1', { name: 'Logo', drawing: read.drawing, width: 40 }, read.drawing.skipped);
    for (const [note, kind] of [
      [photoNote([file]), 'photo'],
      [photoNote([file, null]), 'photo'],
      [sketchNote(), 'sketch'],
      [sketchNote('rect 2×3 at (1, 1) "40 mm"'), 'sketch'],
      [drawing, 'drawing'],
    ] as const) {
      const blind = blindNote(`${before}\n${note}`, kind);
      // The note before the picture stays; nothing says the model got a picture it did not get.
      expect(blind.startsWith(`${before}\n`)).toBe(true);
      expect(blind).not.toMatch(/\[PartBuddy: the (\d+ )?attached pictures? (is|are) /);
    }
    expect(blindNote(`${before}\n${drawing}`, 'drawing')).toBe(`${before}\n${UNSEEN_DRAWING}\n${drawing}`);
  });

  it('replaces a photo and a bare sketch, keeps a sketch\'s list', () => {
    const file = photoFile(join(tmpdir(), 'P'), new Date(2026, 10, 13, 9, 5, 7));
    expect(blindNote(`${before}\n${photoNote([file])}`, 'photo')).toBe(`${before}\n${UNSEEN_PICTURE}`);
    expect(blindNote(sketchNote(), 'sketch')).toBe(UNSEEN_PICTURE);
    const list = 'rect 2×3 at (1, 1) "40 mm"';
    expect(blindNote(sketchNote(list), 'sketch')).toBe(`${UNSEEN_SKETCH}${SKETCH_LIST}${list}]`);
    // No note at all, or one without a picture note: the model still learns a picture went nowhere.
    expect(blindNote(null, 'photo')).toBe(UNSEEN_PICTURE);
    expect(blindNote(before, 'sketch')).toBe(`${before}\n${UNSEEN_PICTURE}`);
  });
});
