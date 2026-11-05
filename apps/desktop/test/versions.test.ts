import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    const moved = { identical: false, a: { volume_mm3: 125 }, b: { volume_mm3: 125 }, difference: { volume_percent: 0, center_of_mass_distance_mm: 3 }, regions: [] };
    const result = summarizeComparison({
      pairs: [
        { body: 'Halter', result: changed },
        { body: 'Deckel', result: moved },
        { body: 'Fuß', result: { identical: true } },
      ],
      onlyInVersion: ['Clip (2)'],
      onlyNow: ['Zusatz'],
    });
    expect(result.bodies.map((body) => [body.body, body.status])).toEqual([
      ['Halter', 'changed'],
      ['Deckel', 'moved'],
      ['Fuß', 'same'],
      ['Clip', 'removed'],
      ['Zusatz', 'added'],
    ]);
    expect(result.bodies[0]).toMatchObject({ removedMm3: 196.35, addedMm3: 0, regions: [{ side: 'removed', volume: 196.35, center: [15, 10, 5] }] });
    expect(result.bodies[1]?.movedMm).toBe(3);
  });
});
