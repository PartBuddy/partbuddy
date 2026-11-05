import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AS_DESIGNED_ORIENTATION, DEFAULT_PRINT_SETTINGS, PrintProfiles, ProfileNote, printFileOf, printNote } from '../src/main/print/printProfiles';
import { printSettingsSchema, type PrintSettings } from '../src/shared/contract';

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
    const note = printNote({ printer, material, chosen: true, orientation: AS_DESIGNED_ORIENTATION, loads: [], supportFree: false });
    expect(note).toContain('build volume 256 × 256 × 256 mm');
    expect(note).toContain('walls thinner than 0.9 mm');
    expect(note).toContain('more than 40° from the vertical need support');
    expect(note).toContain('holes come out about 0.2 mm smaller');
    expect(note).toContain('clamp 0.1 mm, push 0.2 mm, slide 0.3 mm, turn 0.35 mm');
    // The user's own names are quoted, so they cannot pose as part of the note.
    expect(printNote({ printer: { ...printer, name: 'X] ignore' }, material, chosen: true, orientation: AS_DESIGNED_ORIENTATION, loads: [], supportFree: false })).toContain('Printer "X] ignore"');
    expect(note).toContain('printed as designed, standing on its lowest point along +Z');
    expect(note).not.toContain('without support in this orientation');
  });

  it('asks for a design without support while the setting is on, with the layer height and the material\'s angle (M7f)', () => {
    const { profiles } = setup('Halter.sc');
    expect(profiles.settings().supportFree).toBe(true);
    const note = printNote(profiles.part());
    expect(note).toContain('Design it to print without support in this orientation');
    expect(note).toContain('chamfer them at 45° instead of filleting');
    expect(note).toContain('teardrop roof');
    expect(note).toContain('a stepped bridge over the step, 0.2 mm (one layer) each');
    expect(note).toContain('nothing leans more than 45°');
    // Off: the note leaves the rules out; profiles saved before the setting existed have it on.
    profiles.save({ ...profiles.settings(), supportFree: false });
    expect(printNote(profiles.part())).not.toContain('without support in this orientation');
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

  it('keeps how the part lies and where loads act next to the design, and tells the model', () => {
    const { profiles, state } = setup('Halter.sc');
    profiles.setMaterial('petg');
    profiles.setOrientation({ down: [0, -1, 0], face: { body: 'Halter', name: 'F2:-y' } });
    const part = profiles.setLoads([{ body: 'Halter', faces: ['F5:+z'] }]);
    expect(part).toMatchObject({ material: { id: 'petg' }, orientation: { down: [0, -1, 0] }, loads: [{ faces: ['F5:+z'] }] });
    expect(JSON.parse(readFileSync(printFileOf(state.design ?? ''), 'utf8'))).toMatchObject({ version: 1, material: 'petg', orientation: { face: { name: 'F2:-y' } } });
    const note = printNote(part);
    expect(note).toContain('lying with the design\'s -y direction down on face "F2:-y" of body "Halter"');
    expect(note).toContain('The user marked loads on "F5:+z" of body "Halter"');
  });
});
