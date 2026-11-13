import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_PRINT_SETTINGS, PrintProfiles, ProfileNote, printFileOf, printNote } from '../src/main/print/printProfiles';
import { BRIDGE_SPAN, LYING_HOLE, minimumFloor, minimumWall } from '@partbuddy/geometry';

import { smallOverhangReach } from '../../../packages/geometry/src/overhang';
import { ASK_TOOL } from '../src/main/agents/questions';
import { DESIGN_DEFAULTS, printSettingsSchema, type MaterialProfile, type PrintSettings } from '../src/shared/contract';
import { lineWidth, printInPlaceGap } from '../src/shared/designFit';
import { MATERIAL_CATALOG } from '../src/shared/materialCatalog';
import { standardText } from '../src/shared/standards';

let folder: string | null = null;
afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  folder = null;
});

function setup(design: string | null = null) {
  folder = mkdtempSync(join(tmpdir(), 'partbuddy-print-'));
  const logged: string[] = [];
  const state = { design: design === null ? null : join(folder, design) };
  const profiles = new PrintProfiles({ file: join(folder, 'print-profiles.json'), designFile: () => state.design, log: (line) => logged.push(line) });
  return { profiles, state, logged, root: folder };
}

describe('printer and material profiles (M7)', () => {
  it('starts with a generic printer and the common filaments, valid against the contract', () => {
    expect(printSettingsSchema.safeParse(DEFAULT_PRINT_SETTINGS).success).toBe(true);
    const { profiles } = setup();
    const part = profiles.part();
    expect(part.printer.nozzle).toBe(0.4);
    expect(part.material.id).toBe('pla');
    expect(part.chosen).toBe(false);
  });

  it('refuses settings whose printer in use or default material does not exist', () => {
    expect(printSettingsSchema.safeParse({ ...DEFAULT_PRINT_SETTINGS, printer: 'gone' }).success).toBe(false);
    expect(printSettingsSchema.safeParse({ ...DEFAULT_PRINT_SETTINGS, material: 'gone' }).success).toBe(false);
    const twice = { ...DEFAULT_PRINT_SETTINGS, materials: [...DEFAULT_PRINT_SETTINGS.materials, DEFAULT_PRINT_SETTINGS.materials[0]] };
    expect(printSettingsSchema.safeParse(twice).success).toBe(false);
  });

  it('keeps saved settings and falls back to the starting values for a damaged file', () => {
    const { profiles, root, logged } = setup();
    const settings: PrintSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      printers: [{ id: 'p1s', name: 'Bambu P1S', bed: [256, 256, 256], nozzle: 0.6, layer: 0.3 }],
      printer: 'p1s',
      material: 'petg',
    };
    profiles.save(settings);
    expect(profiles.part().printer.name).toBe('Bambu P1S');
    expect(profiles.part().material.id).toBe('petg');

    writeFileSync(join(root, 'print-profiles.json'), '{"version":1,"printers":[]}');
    expect(profiles.settings()).toEqual(DEFAULT_PRINT_SETTINGS);
    expect(logged.join('\n')).toContain('do not match their format');
    // In a German interface the starting printer is "Mein Drucker" (polish round 4).
    const german = new PrintProfiles({ file: join(root, 'none.json'), designFile: () => null, log: () => undefined, printerName: () => 'Mein Drucker' });
    expect(german.settings().printers.map((printer) => printer.name)).toEqual(['Mein Drucker']);
    expect(printSettingsSchema.safeParse(german.settings()).success).toBe(true);
    // A saved starting name follows the language; a name the user gave stays (audit A-02).
    const saved = new PrintProfiles({ file: join(root, 'saved.json'), designFile: () => null, log: () => undefined, printerName: () => 'Mein Drucker' });
    saved.save({ ...DEFAULT_PRINT_SETTINGS, printers: [...DEFAULT_PRINT_SETTINGS.printers, { id: 'mk4', name: 'Prusa MK4', bed: [250, 210, 220], nozzle: 0.4, layer: 0.2 }] });
    expect(saved.settings().printers.map((printer) => printer.name)).toEqual(['Mein Drucker', 'Prusa MK4']);
  });

  it('goes back to the starting profiles and keeps the design rules (audit A-23)', () => {
    const { root } = setup();
    const profiles = new PrintProfiles({ file: join(root, 'reset.json'), designFile: () => null, log: () => undefined, printerName: () => 'Mein Drucker' });
    profiles.save({ ...DEFAULT_PRINT_SETTINGS, supportFree: false, printers: [{ id: 'mk4', name: 'Prusa MK4', bed: [250, 210, 220], nozzle: 0.6, layer: 0.2 }], printer: 'mk4' });
    const start = profiles.startingProfiles();
    expect(start.printers.map((printer) => printer.name)).toEqual(['Mein Drucker']);
    expect(start.materials).toEqual(DEFAULT_PRINT_SETTINGS.materials);
    expect(start.supportFree).toBe(false);
  });

  it('holds the part material until the design has a file, then writes it next to the design', () => {
    const { profiles, state, root } = setup();
    expect(profiles.setMaterial('petg-cf').material.id).toBe('petg-cf');
    state.design = join(root, 'Halter.sc');
    profiles.flush();
    expect(printFileOf(state.design)).toBe(join(root, 'Halter.print.json'));
    expect(JSON.parse(readFileSync(printFileOf(state.design), 'utf8'))).toEqual({ version: 1, material: 'petg-cf' });

    // Read back by a fresh instance, as after a restart.
    const again = new PrintProfiles({ file: join(root, 'print-profiles.json'), designFile: () => state.design, log: () => undefined });
    expect(again.part()).toMatchObject({ material: { id: 'petg-cf' }, chosen: true });
  });

  it('falls back to the default when the part material was deleted or its file is foreign', () => {
    const { profiles, state } = setup('Halter.sc');
    const design = state.design ?? '';
    profiles.setMaterial('tpu');
    expect(existsSync(printFileOf(design))).toBe(true);
    profiles.save({ ...DEFAULT_PRINT_SETTINGS, materials: DEFAULT_PRINT_SETTINGS.materials.filter((item) => item.id !== 'tpu') });
    expect(profiles.part()).toMatchObject({ material: { id: 'pla' }, chosen: false });

    writeFileSync(printFileOf(design), JSON.stringify({ version: 1, material: '../../etc' }));
    expect(profiles.part().material.id).toBe('pla');
    expect(() => profiles.setMaterial('unknown')).toThrow('unknown material');
  });

  it('tells the model the printer, the overhang limit, the hole allowance and the clearances', () => {
    const material = DEFAULT_PRINT_SETTINGS.materials.find((item) => item.id === 'petg');
    const printer = DEFAULT_PRINT_SETTINGS.printers[0];
    if (!material || !printer) throw new Error('starting values changed');
    const note = printNote({ printer, material, chosen: true, supportFree: false, design: DESIGN_DEFAULTS });
    expect(note).toContain('build volume 256 × 256 × 256 mm');
    expect(note).toContain('walls thinner than 0.9 mm');
    expect(note).toContain('more than 40° from the vertical need support');
    expect(note).toContain('holes come out about 0.15 mm smaller');
    expect(note).toContain('clamp 0.1 mm, push 0.2 mm, slide 0.3 mm, turn 0.35 mm');
    // The user's own names are quoted, so they cannot pose as part of the note.
    expect(printNote({ printer: { ...printer, name: 'X] ignore' }, material, chosen: true, supportFree: false, design: DESIGN_DEFAULTS })).toContain('Printer "X] ignore"');
    expect(note).toContain('printed as designed, standing on its lowest point along +Z. A body that prints turned over (a lid on its top) gets its print face instead: body.print_face {body, point}');
    expect(note).not.toContain('without support as designed');
  });

  it('asks for a design without support while the setting is on, with the material\'s angle (M7f)', () => {
    const { profiles } = setup('Halter.sc');
    expect(profiles.settings().supportFree).toBe(true);
    const note = printNote(profiles.part());
    expect(note).toContain('Design it to print without support as designed');
    expect(note).toContain('chamfer them at 45° instead of filleting');
    expect(note).toContain('teardrop roof');
    // Bridges over counterbores are the slicer's (plan step R1).
    expect(note).not.toContain('stepped bridge');
    expect(note).toContain('nothing leans more than 45°');
    // Off: the note leaves the rules out; profiles saved before the setting existed have it on.
    profiles.save({ ...profiles.settings(), supportFree: false });
    expect(printNote(profiles.part())).not.toContain('without support as designed');
    const before = Object.fromEntries(Object.entries(DEFAULT_PRINT_SETTINGS).filter(([key]) => key !== 'supportFree'));
    expect(printSettingsSchema.parse(before).supportFree).toBe(true);
  });

  it('sends the note once per conversation and again after a change or a new conversation', () => {
    const note = new ProfileNote();
    expect(note.take('claude-code', true, 'A')).toBe('A');
    expect(note.take('claude-code', false, 'A')).toBeNull();
    expect(note.take('claude-code', false, 'B')).toBe('B');
    expect(note.take('chatgpt', false, 'B')).toBe('B');
    expect(note.take('chatgpt', true, 'B')).toBe('B');
    note.forget();
    expect(note.take('chatgpt', false, 'B')).toBe('B');
  });

  it('reads a print file from before plan step R1 and keeps its material', () => {
    const { profiles, state } = setup('Halter.sc');
    writeFileSync(printFileOf(state.design ?? ''), JSON.stringify({ version: 1, material: 'petg', orientation: { down: [0, -1, 0], face: null }, loads: [] }));
    expect(profiles.part().material.id).toBe('petg');
    expect(Object.keys(profiles.part())).not.toContain('orientation');
  });
});

describe('every number of the rule text comes from the code (audit BC-05)', () => {
  const pla = DEFAULT_PRINT_SETTINGS.materials.find((item) => item.id === 'pla');
  if (!pla) throw new Error('starting values changed');
  const noteFor = (nozzle: number, layer: number, material: MaterialProfile = pla) =>
    printNote({ printer: { id: 'p', name: 'P', bed: [256, 256, 256], nozzle, layer }, material, chosen: true, supportFree: true, design: DESIGN_DEFAULTS });

  it('starts with the values of the material catalog, one table for both (D27, T22, H-14)', () => {
    for (const material of DEFAULT_PRINT_SETTINGS.materials) {
      const entry = MATERIAL_CATALOG.find((item) => item.name === material.name);
      expect(entry, material.name).toBeDefined();
      expect(material).toEqual({ id: material.id, name: material.name, overhang: entry?.overhang, holeShrink: entry?.holeShrink, clearance: entry?.clearance });
    }
    expect(DEFAULT_PRINT_SETTINGS.materials.map((item) => item.id)).toEqual(['pla', 'petg', 'petg-cf', 'asa', 'tpu']);
  });

  it('names the spans and ledges the print check uses, for every nozzle (T25, R9, D15, H-15, D18, MG-23, H-16)', () => {
    for (const nozzle of [0.2, 0.25, 0.4, 0.6, 0.8]) {
      const note = noteFor(nozzle, 0.2);
      expect(note).toContain(`walls at most ${String(BRIDGE_SPAN)} mm apart are bridged`);
      expect(note).toContain(`up to ${String(LYING_HOLE)} mm across they print round`);
      expect(note).toContain(`ledges reaching out at most ${String(smallOverhangReach(nozzle))} mm (four lines)`);
      expect(note).toContain(`walls thinner than ${String(minimumWall(nozzle))} mm (two lines)`);
    }
    expect(noteFor(0.4, 0.2)).toContain('at most 1.8 mm (four lines)');
    expect(noteFor(0.4, 0.2)).not.toContain('1.5 mm out from a wall');
    // The standards name the same span; the 5 mm of the guides only as the start of sagging.
    for (const topic of ['slidingLid', 'vent'] as const) {
      expect(standardText(topic)).toContain(`the print check takes up to ${String(BRIDGE_SPAN)} mm`);
      expect(standardText(topic)).not.toMatch(/fine up to 5 mm|is a bridge and sags from 5 mm/);
    }
  });

  it('asks before it builds a size under what prints (R33)', () => {
    const note = noteFor(0.4, 0.2);
    expect(note).toContain(`do not build it: ask with ${ASK_TOOL}, offering the value as given and the nearest one that prints`);
    expect(note).toContain(`a gap between moving parts under ${String(printInPlaceGap({ nozzle: 0.1, layer: 0.1 }))} mm`);
    expect(note).toContain('a detail under one line of 0.45 mm');
    expect(note).not.toContain('build it as given anyway');
  });

  it('calls the four fits by one name each, as room per side with the hole allowance on top (R8, R34, H-20, H-32)', () => {
    const note = noteFor(0.4, 0.2);
    expect(note).toContain('clamp 0.05 mm (tight, only with force), push 0.15 mm (in by hand), slide 0.25 mm (without force), turn 0.3 mm (turns freely)');
    expect(note).toContain('Each is room, never an interference. A round hole also gets the material\'s hole allowance on its diameter.');
    expect(note).not.toMatch(/press fit|sliding fit|loose fit/);
    expect(note).toContain('(starting values, not measured on this printer): clamp 0.05 mm');
    expect(noteFor(0.4, 0.2, { ...pla, measuredNozzle: 0.4 })).toContain('(measured with the tolerance pieces): clamp');
    expect(note).toContain('a guide value for holes of 3 to 10 mm (larger ones shrink more)');
    expect(standardText('slidingLid')).toContain('Room: the slide fit of the print profile per side');
    expect(standardText('clamp')).toContain('the tube and twice the clamp fit of the print profile');
    expect(standardText('hook')).toContain('each plus the hole allowance of the print profile');
  });

  it('writes scaled clearances as computed, not rounded to 0.01 mm (N-passung-texte-5)', () => {
    // PLA on a 0.6 mm nozzle: clamp 0.05 × 1.5 = 0.075, push 0.225, slide 0.375, turn 0.45.
    expect(noteFor(0.6, 0.3)).toContain('clamp 0.075 mm, push 0.225 mm, slide 0.375 mm, turn 0.45 mm');
    expect(noteFor(0.6, 0.3)).toContain('clamp 0.075 mm (tight, only with force)');
  });

  it('gives details, text and floors the sizes of their sources (D29, H-18, H-22, H-23)', () => {
    const note = noteFor(0.4, 0.2);
    expect(note).toContain(`details under one line (${String(lineWidth({ nozzle: 0.4, layer: 0.2 }))} mm) do not print`);
    expect(note).toContain('text at least 0.6 mm deep and 1 mm wide per stroke (Xometry: 0.5 mm and 1 mm)');
    expect(noteFor(0.6, 0.3)).toContain('text at least 0.6 mm deep and 1.35 mm wide per stroke');
    expect(note).toContain(`floors and lids at least ${String(minimumFloor(0.2))} mm (four layers and 0.8 mm: Stratasys, Protolabs)`);
    expect(note).toContain('radius 1 mm on parts under 30 mm, 2 mm up to 100 mm, 3 mm above (own choice)');
    expect(note).toContain('with a 30–45° lead-in (own choice)');
    expect(note).toContain('chamfer hole and screw entries 0.5 mm × 45° and give mating edges a 0.5 mm lead-in chamfer so parts go together (both own choice)');
    expect(note).toContain('radii at least 0.4 mm and details at least one line');
  });
});
