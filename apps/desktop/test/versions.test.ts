import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { summarizeComparison } from '../src/main/projects/versionCompare';
import { MAX_AUTOMATIC, VersionStore } from '../src/main/projects/versionStore';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'partbuddy-versions-'));
  dirs.push(root);
  const folder = join(root, 'Halter');
  mkdirSync(folder);
  const design = join(folder, 'Halter.sc');
  writeFileSync(design, 'design 1');
  return design;
}

describe('versions (B5)', () => {
  it('keeps a copy of the design with its preview, newest first', () => {
    let clock = 1_000;
    const store = new VersionStore(() => clock);
    const design = project();
    writeFileSync(join(design, '..', 'preview.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]));
    const first = store.save(design, 'manual', '  vor dem Deckel ', false);
    clock = 2_000;
    writeFileSync(design, 'design 2');
    const second = store.save(design, 'export', 'Halter.3mf', true);
    const list = store.list(design);
    expect(list.map((version) => [version.id, version.reason, version.label])).toEqual([
      [second, 'export', 'Halter.3mf'],
      [first, 'manual', 'vor dem Deckel'],
    ]);
    expect(list[0]?.preview).toMatch(/^data:image\/png;base64,/);
    expect(store.fileOf(design, first ?? '')).toBe(join(design, '..', 'versions', first ?? '', 'design.sc'));
  });

  it('saves an automatic version only when the design changed, a named one always', () => {
    let clock = 1_000;
    const store = new VersionStore(() => (clock += 1));
    const design = project();
    expect(store.save(design, 'assistant', 'Build a box', true)).not.toBeNull();
    expect(store.save(design, 'assistant', 'Make it taller', true)).toBeNull();
    expect(store.save(design, 'manual', 'Same again', false)).not.toBeNull();
    expect(store.list(design)).toHaveLength(2);
  });

  it('keeps the newest automatic versions and every named one', () => {
    let clock = 1_000;
    const store = new VersionStore(() => (clock += 1));
    const design = project();
    store.save(design, 'manual', 'Named', false);
    for (let i = 0; i < MAX_AUTOMATIC + 3; i += 1) {
      writeFileSync(design, `design ${String(i)}`);
      store.save(design, 'assistant', `Request ${String(i)}`, true);
    }
    const list = store.list(design);
    expect(list.filter((version) => version.reason === 'assistant')).toHaveLength(MAX_AUTOMATIC);
    expect(list.some((version) => version.label === 'Named')).toBe(true);
    expect(list[0]?.label).toBe(`Request ${String(MAX_AUTOMATIC + 2)}`);
    expect(readdirSync(join(design, '..', 'versions'))).toHaveLength(MAX_AUTOMATIC + 1);
  });

  it('refuses ids that are not versions of the project', () => {
    const store = new VersionStore();
    const design = project();
    expect(store.fileOf(design, '..')).toBeNull();
    expect(store.fileOf(design, 'v-..\\..\\x')).toBeNull();
    expect(store.fileOf(design, 'v-abc')).toBeNull();
    expect(existsSync(join(design, '..', 'versions'))).toBe(false);
  });
});

describe('version comparison (B5)', () => {
  it('says per body what was added, removed, moved or left as it was', () => {
    const changed = {
      identical: false,
      a: { volume_mm3: 6000 },
      b: { volume_mm3: 5803.65 },
      difference: { volume_percent: -3.27, center_of_mass_distance_mm: 0 },
      only_in_a: { volume_mm3: 196.35 },
      only_in_b: { volume_mm3: 0 },
      regions: [{ side: 'only_in_a', volume_mm3: 196.35, center: [15, 10, 5] }],
    };
    // As SolidCraft 0.40.1 compares a plate moved by [3, 4, 0]: centre and box move alike.
    const moved = { identical: false, a: { volume_mm3: 125 }, b: { volume_mm3: 125 }, difference: { volume_percent: 0, center_of_mass_distance_mm: 5, center_of_mass: [3, 4, 0], bbox_min: [3, 4, 0], bbox_max: [3, 4, 0] }, regions: [] };
    // A hole moved 5 mm inside the plate: same volume, the centre 0.18 mm away, the box where it was (audit D31).
    const hole = {
      identical: false,
      a: { volume_mm3: 3858.6 },
      b: { volume_mm3: 3858.6 },
      difference: { volume_percent: -4.2e-11, center_of_mass_distance_mm: 0.183, center_of_mass: [-0.183, 0, 0], bbox_min: [0, 0, 0], bbox_max: [0, 0, 8.9e-16] },
      only_in_a: { volume_mm3: 141.4 },
      only_in_b: { volume_mm3: 141.4 },
      regions: [
        { side: 'only_in_a', volume_mm3: 141.4, center: [15, 10, 2.5] },
        { side: 'only_in_b', volume_mm3: 141.4, center: [10, 10, 2.5] },
      ],
    };
    const result = summarizeComparison({
      pairs: [
        { body: 'Halter', result: changed },
        { body: 'Deckel', result: moved },
        { body: 'Fuß', result: { identical: true } },
        { body: 'Platte', result: hole },
      ],
      onlyInVersion: ['Clip (2)'],
      onlyNow: ['Zusatz'],
    });
    expect(result.bodies.map((body) => [body.body, body.status])).toEqual([
      ['Halter', 'changed'],
      ['Deckel', 'moved'],
      ['Fuß', 'same'],
      ['Platte', 'changed'],
      ['Clip', 'removed'],
      ['Zusatz', 'added'],
    ]);
    expect(result.bodies[0]).toMatchObject({ removedMm3: 196.35, addedMm3: 0, regions: [{ side: 'removed', volume: 196.35, center: [15, 10, 5] }] });
    expect(result.bodies[1]?.movedMm).toBe(5);
    // Box and centre one move within 0.01 mm, on either side of it; a reply without the box is no move.
    const shifted = (corner: number[]) => summarizeComparison({ pairs: [{ body: 'P', result: { ...moved, difference: { ...moved.difference, bbox_min: corner, bbox_max: [3, 4, 0] } } }], onlyInVersion: [], onlyNow: [] }).bodies[0]?.status;
    expect(shifted([3.009, 4, 0])).toBe('moved');
    expect(shifted([3.012, 4, 0])).toBe('changed');
    expect(summarizeComparison({ pairs: [{ body: 'P', result: { ...moved, difference: { volume_percent: 0, center_of_mass_distance_mm: 5, center_of_mass: [3, 4, 0] } } }], onlyInVersion: [], onlyNow: [] }).bodies[0]?.status).toBe('changed');
    expect(result.bodies[3]).toMatchObject({ movedMm: 0, regions: [{ side: 'removed', center: [15, 10, 2.5] }, { side: 'added', center: [10, 10, 2.5] }] });
  });
});

describe('milestones (P4)', () => {
  it('names an automatic version so it outlives pruning, keeping its hash, time and first reason', () => {
    let clock = 1_000;
    const store = new VersionStore(() => clock);
    const design = project();
    const kept = store.save(design, 'assistant', 'Mach den Deckel dicker', false);
    if (!kept) throw new Error('no version');
    const note = join(VersionStore.folderOf(design), kept, 'version.json');
    const before = JSON.parse(readFileSync(note, 'utf8')) as Record<string, unknown>;
    store.name(design, kept, '  Deckel 3 mm ');
    const after = JSON.parse(readFileSync(note, 'utf8')) as Record<string, unknown>;
    expect(after).toEqual({ ...before, reason: 'manual', label: 'Deckel 3 mm', promoted: 'assistant' });
    // Renaming a milestone keeps where it came from.
    store.name(design, kept, 'Deckel final');
    expect(JSON.parse(readFileSync(note, 'utf8'))).toMatchObject({ reason: 'manual', label: 'Deckel final', promoted: 'assistant' });
    for (let n = 0; n < MAX_AUTOMATIC + 1; n += 1) {
      clock += 1_000;
      writeFileSync(design, `design ${String(n)}`);
      store.save(design, 'export', 'x.3mf', true);
    }
    expect(store.list(design).filter((version) => version.reason === 'manual').map((version) => version.label)).toEqual(['Deckel final']);
  });

  it('reads a note from before milestones and refuses names for versions that are not there', () => {
    const store = new VersionStore(() => 5_000);
    const design = project();
    const folder = join(VersionStore.folderOf(design), 'v-old');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'design.sc'), 'old');
    writeFileSync(join(folder, 'version.json'), JSON.stringify({ created: 1, reason: 'export', label: 'a.3mf', hash: 'h' }));
    expect(store.list(design).map((version) => version.reason)).toEqual(['export']);
    expect(() => store.name(design, 'v-none', 'x')).toThrow();
    expect(() => store.name(design, '../v-old', 'x')).toThrow();
    expect(() => store.name(design, 'v-old', '   ')).toThrow();
  });
});
