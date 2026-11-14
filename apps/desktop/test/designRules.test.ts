import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkPrint, minimumWall } from '@partbuddy/geometry';
import { afterEach, describe, expect, it } from 'vitest';

import { DESIGN_TOOL, withDesignTool } from '../src/main/agents/designTool';
import { DEFAULT_PRINT_SETTINGS, PrintProfiles, printFileOf, printNote } from '../src/main/print/printProfiles';
import { invokeChannels } from '../src/shared/channels';
import { DESIGN_DEFAULTS, invokeContract, printSettingsProblem, printSettingsSchema, type DesignRule } from '../src/shared/contract';
import { boxesBody } from '../../../packages/geometry/src/testShapes';
import { fitMarkOf, lineWidth, refit, snapSize, withoutFitMark } from '../src/shared/designFit';

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
    expect(note).not.toContain('Turned off for this part');
  });

  it('takes out exactly the group a setting turns off', () => {
    for (const rule of Object.keys(MARKERS) as DesignRule[]) {
      const { profiles } = setup();
      profiles.save({ ...profiles.settings(), design: { ...DESIGN_DEFAULTS, [rule]: false } });
      const note = printNote(profiles.part());
      for (const [other, marker] of Object.entries(MARKERS)) expect(note.includes(marker)).toBe(other !== rule);
      expect(note).toContain("Turned off for this part, in PartBuddy's settings or with partbuddy_design_rules in the chat");
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
    expect(note).toContain('Slicers print two to four lines (0.9 mm to 1.8 mm) as wall and fill anything thicker with sparse infill');
    // Ribs are no thinner than the thinnest wall that prints (review of PR 357: half a 0.9 mm wall is one line).
    expect(note).toContain('stiffen with ribs as thick as the wall, at least two lines (0.9 mm), instead of thickening the wall');
    expect(note).not.toContain('three quarters');
    expect(note).toContain('every 0.2 mm of height is one more layer');
    expect(note).toContain('shell 1.35 mm with two ribs instead of a solid block');
    // It never outranks function, and it promises nothing the slicer decides.
    expect(note).toContain('Loaded regions, sizes the user names and what the user wants solid stay as they are.');
    expect(note).toContain('never promise grams or minutes');
    expect(note).toContain('A refinement never makes function or printing worse');
    const settings = profiles.settings();
    profiles.save({ ...settings, printers: settings.printers.map((printer) => ({ ...printer, nozzle: 0.6, layer: 0.3 })) });
    const wide = printNote(profiles.part());
    expect(wide).toContain('Slicers print two to four lines (1.35 mm to 2.7 mm) as wall');
    expect(wide).toContain('at least two lines (1.35 mm)');
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
    expect(note).toContain('in the chat: rounded and chamfered edges, saving material and print time. Do not add them unless the user asks for them.');
    expect(note).toContain('name what you added on your own and the sizes you snapped in one short line');
    expect(note).not.toContain('instead of a solid block');
  });
});

describe('profiles as the user enters them (audit T32, D28, T33)', () => {
  const withPrinter = (nozzle: number, layer: number) => ({ ...DEFAULT_PRINT_SETTINGS, printers: DEFAULT_PRINT_SETTINGS.printers.map((printer) => ({ ...printer, nozzle, layer })) });

  it('holds back a layer over the nozzle and takes one up to it', () => {
    // Before: layer 1.2 on a 0.1 mm nozzle was saved.
    expect(printSettingsProblem(withPrinter(0.1, 1.2))).toEqual({ problem: 'layerUnsaved', name: 'My printer' });
    expect(printSettingsProblem(withPrinter(0.4, 0.41))?.problem).toBe('layerUnsaved');
    expect(printSettingsProblem(withPrinter(0.4, 0.4))).toBeNull();
    expect(printSettingsProblem(withPrinter(0.4, 0.39))).toBeNull();
    expect(printSettingsProblem(withPrinter(0.1, 0.04))).toBeNull();
    // The test pieces are not made for such a printer either.
    expect(invokeContract[invokeChannels.printTestPiecesExport].request.safeParse({ nozzle: 0.4, layer: 0.6, slicer: null }).success).toBe(false);
    expect(invokeContract[invokeChannels.printTestPiecesExport].request.safeParse({ nozzle: 0.4, layer: 0.4, slicer: null }).success).toBe(true);
    expect(invokeContract[invokeChannels.printTestPiecesPicture].request.safeParse({ nozzle: 0.4, layer: 0.6 }).success).toBe(false);
    expect(invokeContract[invokeChannels.printTestPiecesPicture].request.safeParse({ nozzle: 0.4, layer: 0.4 }).success).toBe(true);
  });

  it('still reads and saves a file saved before, so no profile is lost and the assistant switches keep saving', () => {
    expect(printSettingsSchema.safeParse(withPrinter(0.1, 1.2)).success).toBe(true);
    expect(invokeContract[invokeChannels.printSaveSettings].request.safeParse(withPrinter(0.1, 1.2)).success).toBe(true);
  });

  it('holds back a material whose fits do not grow from clamp to turn, and a missing name first', () => {
    const disordered = { ...DEFAULT_PRINT_SETTINGS, materials: DEFAULT_PRINT_SETTINGS.materials.map((material, i) => (i === 0 ? { ...material, clearance: { ...material.clearance, slide: material.clearance.turn + 0.05 } } : material)) };
    expect(printSettingsProblem(disordered)).toEqual({ problem: 'fitOrderUnsaved', name: DEFAULT_PRINT_SETTINGS.materials[0]?.name });
    expect(printSettingsProblem({ ...disordered, materials: disordered.materials.map((material) => ({ ...material, clearance: { ...material.clearance, turn: material.clearance.slide } })) })).toBeNull();
    expect(printSettingsProblem({ ...withPrinter(0.4, 0.6), printers: withPrinter(0.4, 0.6).printers.map((printer) => ({ ...printer, name: ' ' })) })).toEqual({ problem: 'nameMissing', name: '' });
    expect(printSettingsProblem(DEFAULT_PRINT_SETTINGS)).toBeNull();
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
    // A gap the assistant chose is never under the print-in-place gap, the same the print check holds it to (#381; audit MG-07, T54).
    expect(snapSize('gap', 0.25, small)).toBe(0.4);
    expect(snapSize('gap', 0.399, small)).toBe(0.4);
    expect(snapSize('gap', 0.401, small)).toBe(0.401);
  });

  it('snaps the assistant\'s sizes for 0.6 / 0.3', () => {
    expect(snapSize('wall', 1.2, large)).toBe(1.35);
    expect(snapSize('wall', 1.5, large)).toBe(2.025);
    expect(snapSize('height', 1, large)).toBe(1.2);
    expect(snapSize('height', 0.9, large)).toBe(0.9);
    expect(snapSize('gap', 0.4, large)).toBe(0.6);
  });

  it('snaps walls to the print check\'s own two-line wall, at every nozzle (audit MG-17, D37)', () => {
    for (let tenths = 2; tenths <= 40; tenths += 1) {
      const nozzle = tenths / 20;
      const printer = { nozzle, layer: Math.min(0.2, nozzle) };
      // Two lines of the grid are the check's minimum, to the 0.001 mm the check compares.
      expect(Math.round(2 * lineWidth(printer) * 1000) / 1000).toBe(minimumWall(nozzle));
      expect(snapSize('wall', 0.01, printer)).toBe(minimumWall(nozzle));
      expect(snapSize('wall', minimumWall(nozzle) - 0.001, printer)).toBe(minimumWall(nozzle));
      expect(snapSize('wall', minimumWall(nozzle) + 0.001, printer)).toBe(Math.round(3 * lineWidth(printer) * 1000) / 1000);
    }
    // Before: 2 × 0.563 = 1.126 mm at 0.5 mm, under the check's 1.13 mm; at 0.25 mm 0.562 against 0.56.
    expect(snapSize('wall', 0.1, { nozzle: 0.5, layer: 0.2 })).toBe(1.13);
    expect(lineWidth({ nozzle: 0.25, layer: 0.12 })).toBe(0.28);
    expect(lineWidth(small)).toBe(0.45);
    expect(lineWidth(large)).toBe(0.675);
  });

  it('gives no thin-wall finding on the thinnest wall it snaps (the check measured, not its formula)', () => {
    for (const [nozzle, layer] of [[0.25, 0.12], [0.4, 0.2], [0.5, 0.2], [0.6, 0.3], [0.8, 0.4]] as const) {
      const thickness = snapSize('wall', 0.1, { nozzle, layer });
      const findings = checkPrint([boxesBody('Wall', [[[0, 0, 0], [30, thickness, 20]]])], { bed: [256, 256, 256], nozzle, layer, overhang: 45 }).findings;
      expect(findings.filter((finding) => finding.kind === 'thinWall'), `${String(nozzle)} mm nozzle, wall ${String(thickness)} mm`).toEqual([]);
    }
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

  it('tells the assistant the fits as scaleClearance brings them to the nozzle (BC-14 review K2)', () => {
    const pla = { id: 'pla', name: 'PLA', overhang: 45, holeShrink: 0.15, clearance: { clamp: 0.05, push: 0.15, slide: 0.25, turn: 0.3 } };
    const note = (nozzle: number, layer: number) => printNote({ printer: { id: 'p', name: 'P', bed: [256, 256, 256], nozzle, layer }, material: pla, chosen: true, design: DESIGN_DEFAULTS });
    const sentence = 'they grow with a nozzle wider than 0.4 mm and never go under their 0.4 mm values on a finer one';
    expect(note(0.2, 0.1)).toContain(`clamp 0.05 mm (tight, only with force), push 0.15 mm (in by hand), slide 0.25 mm (without force), turn 0.3 mm (turns freely); the material's values brought to this nozzle: ${sentence}`);
    expect(note(0.6, 0.3)).toContain(`clamp 0.075 mm (tight, only with force), push 0.225 mm (in by hand), slide 0.375 mm (without force), turn 0.45 mm (turns freely); the material's values brought to this nozzle: ${sentence}`);
    expect(note(0.4, 0.2)).not.toContain('scaled for this nozzle');
  });

  it('makes a size marked in nozzles that many print-in-place gaps, so a gap never narrows on a fine nozzle (BC-14 review S3)', () => {
    const gap = (value: number) => [{ name: 'Gap', value, comment: 'Hinge gap [auto 2×nozzle]' }];
    // Two gaps of 0.3 mm on 0.2 and 0.25 mm nozzles, not two nozzles (0.4 / 0.5 mm, a narrower gap).
    expect(refit(gap(0.8), { nozzle: 0.2, layer: 0.1 })).toEqual([{ name: 'Gap', value: 0.6 }]);
    expect(refit(gap(0.8), { nozzle: 0.25, layer: 0.12 })).toEqual([{ name: 'Gap', value: 0.6 }]);
    expect(refit(gap(0.8), { nozzle: 0.6, layer: 0.3 })).toEqual([{ name: 'Gap', value: 1.2 }]);
    // There and back gives the size it started with.
    expect(refit(gap(1.2), small)).toEqual([{ name: 'Gap', value: 0.8 }]);
    expect(refit(gap(0.6), small)).toEqual([{ name: 'Gap', value: 0.8 }]);
    expect(refit([{ name: 'Gap', value: 0.4, comment: 'Gap [auto 1×nozzle]' }], { nozzle: 0.29, layer: 0.1 })).toEqual([{ name: 'Gap', value: 0.3 }]);
    expect(refit([{ name: 'Gap', value: 0.4, comment: 'Gap [auto 1×nozzle]' }], { nozzle: 0.31, layer: 0.1 })).toEqual([{ name: 'Gap', value: 0.31 }]);
  });
});
