import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DESIGN_TOOL, withDesignTool } from '../src/main/agents/designTool';
import { DEFAULT_PRINT_SETTINGS, PrintProfiles, printFileOf, printNote } from '../src/main/print/printProfiles';
import { DESIGN_DEFAULTS, printSettingsSchema, type DesignRule } from '../src/shared/contract';
import { fitMarkOf, fitSize, refit, snapSize, withoutFitMark } from '../src/shared/designFit';

let folder: string | null = null;
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = null;
});

function setup() {
  folder = mkdtempSync(join(tmpdir(), 'partbuddy-design-'));
  const design = join(folder, 'Box.sc');
  const make = () => new PrintProfiles({ file: join(folder ?? '', 'print-profiles.json'), designFile: () => design, log: () => undefined });
  return { profiles: make(), make, design };
}

/** A sentence only each group's rules carry. */
const MARKERS: Record<DesignRule, string> = {
  rounding: 'round outer edges that are seen or touched',
  printInPlace: 'first look for a print-in-place solution',
  details: 'chamfer hole and screw entries',
  snap: 'Sizes you choose yourself snap up to the printer',
  economy: 'Material and print time, from the first shape on',
};

const small = { nozzle: 0.4, layer: 0.2 };
const large = { nozzle: 0.6, layer: 0.3 };

describe('design rules in the print note (decided 2026-11-07)', () => {
  it('puts every rule group, the user-size rule and the report line into the note by default', () => {
    const { profiles } = setup();
    const note = printNote(profiles.part());
    for (const marker of Object.values(MARKERS)) expect(note).toContain(marker);
    expect(note).toContain('Sizes the user names are fixed: build them exactly');
    expect(note).toContain('name what you added on your own, what you did for material and print time and the sizes you snapped in one short line');
    expect(note).toContain('walls and ribs to whole lines of 0.45 mm (0.9, 1.35, 1.8, 2.25 mm)');
    expect(note).toContain('to whole layers of 0.2 mm (0.6, 0.8, 1, 1.2 mm)');
    expect(note).toContain('print-in-place gaps 0.4 mm');
    expect(note).toContain(DESIGN_TOOL);
    expect(note).not.toContain('The user turned off');
  });

  it('takes out exactly the group a setting turns off', () => {
    for (const rule of Object.keys(MARKERS) as DesignRule[]) {
      const { profiles } = setup();
      profiles.save({ ...profiles.settings(), design: { ...DESIGN_DEFAULTS, [rule]: false } });
      const note = printNote(profiles.part());
      for (const [other, marker] of Object.entries(MARKERS)) expect(note.includes(marker)).toBe(other !== rule);
      expect(note).toContain('The user turned off');
      rmSync(folder ?? '', { recursive: true, force: true });
    }
  });

  it('takes out exactly the group the project turns off in the chat, kept next to the design over a restart', async () => {
    for (const rule of Object.keys(MARKERS) as DesignRule[]) {
      const { profiles, make, design } = setup();
      const tools = withDesignTool({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.reject(new Error('upstream')) }, (change) => profiles.setDesign(change).design);
      expect((await tools.listTools()).map((tool) => tool.name)).toEqual([DESIGN_TOOL]);
      const reply = await tools.callTool(DESIGN_TOOL, { [rule]: false });
      expect(reply.isError).toBeUndefined();
      // A fresh start reads it back from the design's print file.
      const note = printNote(make().part());
      for (const [other, marker] of Object.entries(MARKERS)) expect(note.includes(marker)).toBe(other !== rule);
      expect(JSON.parse(readFileSync(printFileOf(design), 'utf8'))).toMatchObject({ design: { [rule]: false } });
      rmSync(folder ?? '', { recursive: true, force: true });
    }
  });

  it('refuses unknown groups and values without keeping anything', async () => {
    const { profiles } = setup();
    const tools = withDesignTool({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.reject(new Error('upstream')) }, (change) => profiles.setDesign(change).design);
    expect((await tools.callTool(DESIGN_TOOL, { colour: false })).isError).toBe(true);
    expect((await tools.callTool(DESIGN_TOOL, { rounding: 'no' })).isError).toBe(true);
    expect((await tools.callTool(DESIGN_TOOL, {})).isError).toBe(true);
    expect(profiles.part().design).toEqual(DESIGN_DEFAULTS);
  });

  it('ranks the project over the setting over the default', () => {
    const { profiles } = setup();
    expect(profiles.part().design.rounding).toBe(true);
    profiles.save({ ...profiles.settings(), design: { ...DESIGN_DEFAULTS, rounding: false, details: false } });
    expect(profiles.part().design).toMatchObject({ rounding: false, details: false });
    // The chat turns rounding back on for this project; details keep the setting.
    profiles.setDesign({ rounding: true, printInPlace: false });
    expect(profiles.part().design).toEqual({ rounding: true, printInPlace: false, details: false, snap: true, economy: true });
    // null hands the group back to the setting.
    profiles.setDesign({ rounding: null });
    expect(profiles.part().design.rounding).toBe(false);
    // Settings saved before the groups existed have them all on.
    const before = Object.fromEntries(Object.entries(DEFAULT_PRINT_SETTINGS).filter(([key]) => key !== 'design'));
    expect(printSettingsSchema.parse(before).design).toEqual(DESIGN_DEFAULTS);
  });
});

describe('material and print time as a rule group of its own (2026-11-12)', () => {
  it('is on by default, from the first shape on, with walls and layers of the printer in use', () => {
    const { profiles } = setup();
    const note = printNote(profiles.part());
    // 0.4 mm nozzle, 0.2 mm layer: lines of 0.45 mm.
    expect(note).toContain('Slicers print 0.9, 1.35, 1.8 mm (two to four lines) as wall and fill anything thicker with sparse infill');
    expect(note).toContain('every 0.2 mm of height is one more layer');
    expect(note).toContain('shell 1.35 mm with two ribs instead of a solid block');
    // It never outranks function, and it promises nothing the slicer decides.
    expect(note).toContain('Loaded regions, sizes the user names and what the user wants solid stay as they are.');
    expect(note).toContain('never promise grams or minutes');
    expect(note).toContain('A refinement never makes function or printing worse');
    const settings = profiles.settings();
    profiles.save({ ...settings, printers: settings.printers.map((printer) => ({ ...printer, nozzle: 0.6, layer: 0.3 })) });
    const wide = printNote(profiles.part());
    expect(wide).toContain('Slicers print 1.35, 2.025, 2.7 mm (two to four lines) as wall');
    expect(wide).toContain('every 0.3 mm of height is one more layer');
  });

  it('stays off once the user turned it off in the chat, and the report line asks for nothing of it', async () => {
    const { profiles, make } = setup();
    const tools = withDesignTool({ instructions: () => undefined, listTools: () => Promise.resolve([]), callTool: () => Promise.reject(new Error('upstream')) }, (change) => profiles.setDesign(change).design);
    const reply = await tools.callTool(DESIGN_TOOL, { economy: false });
    expect(reply.content[0]).toMatchObject({ text: 'Kept for this project. On: rounding, printInPlace, details, snap. Off: economy.' });
    // After a restart and after another group changed, it is still off.
    make().setDesign({ rounding: false });
    const note = printNote(make().part());
    expect(note).not.toContain(MARKERS.economy);
    expect(note).toContain('The user turned off rounded and chamfered edges, saving material and print time');
    expect(note).toContain('name what you added on your own and the sizes you snapped in one short line');
    expect(note).not.toContain('instead of a solid block');
  });
});

describe('sizes fitted to nozzle and layer', () => {
  it('snaps the assistant\'s sizes for 0.4 / 0.2', () => {
    expect(snapSize('wall', 1.2, small)).toBe(1.35);
    expect(snapSize('wall', 0.5, small)).toBe(0.9);
    expect(snapSize('wall', 1.35, small)).toBe(1.35);
    expect(snapSize('height', 1.1, small)).toBe(1.2);
    expect(snapSize('height', 1, small)).toBe(1);
    expect(snapSize('gap', 0.2, small)).toBe(0.4);
    expect(snapSize('detail', 0.3, small)).toBe(0.4);
  });

  it('snaps the assistant\'s sizes for 0.6 / 0.3', () => {
    expect(snapSize('wall', 1.2, large)).toBe(1.35);
    expect(snapSize('wall', 1.5, large)).toBe(2.025);
    expect(snapSize('height', 1, large)).toBe(1.2);
    expect(snapSize('height', 0.9, large)).toBe(0.9);
    expect(snapSize('gap', 0.4, large)).toBe(0.6);
    expect(snapSize('detail', 0.4, large)).toBe(0.6);
  });

  it('keeps a size the user names exactly and only warns', () => {
    expect(fitSize('wall', 1.0, 'user', small)).toEqual({ value: 1.0, warning: expect.stringContaining('1.35 mm prints cleaner') as unknown });
    expect(fitSize('wall', 0.5, 'user', small)).toEqual({ value: 0.5, warning: expect.stringContaining('under the printable 0.9 mm') as unknown });
    expect(fitSize('gap', 0.1, 'user', small).value).toBe(0.1);
    expect(fitSize('detail', 0.3, 'user', large).warning).toContain('0.6 mm');
    expect(fitSize('wall', 1.35, 'user', small)).toEqual({ value: 1.35, warning: null });
    expect(fitSize('wall', 1.0, 'assistant', small)).toEqual({ value: 1.35, warning: null });
  });

  it('refits only the assistant\'s marked sizes when the printer changes', () => {
    const parameters = [
      { name: 'Wall', value: 1.35, comment: 'Wall [auto 3×line]' },
      { name: 'Floor', value: 1, comment: 'Floor [auto 5×layer]' },
      { name: 'Gap', value: 0.4, comment: 'Hinge gap [auto 1x nozzle]' },
      { name: 'Width', value: 80, comment: 'Inner width, from the user [60..100]' },
      { name: 'UserWall', value: 1, comment: '' },
    ];
    expect(refit(parameters, small)).toEqual([]);
    // Walls and heights keep their size on the new grid; only the gap grows with the nozzle.
    expect(refit(parameters, large)).toEqual([
      { name: 'Floor', value: 1.2 },
      { name: 'Gap', value: 0.6 },
    ]);
    expect(refit([{ name: 'Rim', value: 6, comment: 'Rim [auto 30×layer]' }], large)).toEqual([]);
    // A fine nozzle does not close a gap under 0.3 mm (audit MG-05: it became 0.2 mm on a 0.2 mm nozzle).
    expect(refit([{ name: 'Gap', value: 0.3, comment: 'Hinge gap [auto 1×nozzle]' }], { nozzle: 0.2, layer: 0.1 })).toEqual([]);
    expect(refit([{ name: 'Gap', value: 0.4, comment: 'Hinge gap [auto 1×nozzle]' }], { nozzle: 0.25, layer: 0.1 })).toEqual([{ name: 'Gap', value: 0.3 }]);
    expect(refit([{ name: 'Wall', value: 1.8, comment: 'Wall [auto 4×line]' }], large)).toEqual([{ name: 'Wall', value: 2.025 }]);
    expect(fitMarkOf('Inner width')).toBeNull();
    expect(withoutFitMark('Wall [auto 3×line]')).toBe('Wall');
  });
});
