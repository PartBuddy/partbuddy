import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MirrorScheduler } from '../src/main/solidcraft/mirror';
import type { PartReferences, ReferenceState } from '../src/main/solidcraft/partReference';
import { SolidCraftSupervisor } from '../src/main/solidcraft/supervisor';
import { ProjectStore } from '../src/main/projects/projectStore';
import type { ConnectionStatus, MirrorRevision } from '../src/shared/contract';
import { FakeSolidCraft } from './fakeSolidCraft';
import { rootGrowth, type FeatureBlock } from '../src/shared/blocks';

// The slicer a test opens is never started: spawn answers as a started or failed program would.
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function setup(options: { installed?: boolean; autoStart?: boolean; cacheDir?: string; partReferences?: () => PartReferences } = {}) {
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-control-'));
  const cacheDir = options.cacheDir ?? realpathSync.native(mkdtempSync(join(tmpdir(), 'partbuddy-cache-')));
  cleanups.push(() => {
    rmSync(controlDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });
  const statuses: ConnectionStatus[] = [];
  const revisions: MirrorRevision[] = [];
  const saved = { count: 0 };
  const supervisor = new SolidCraftSupervisor(
    {
      environment: {
        platform: process.platform,
        env: {
          SOLIDCRAFT_CONTROL_DIR: controlDir,
          // An executable that exists, or one that does not.
          PARTBUDDY_SOLIDCRAFT_EXE: options.installed === false ? join(controlDir, 'missing.exe') : process.execPath,
        },
        home: controlDir,
        isAlive: (pid) => pid === process.pid,
      },
      launchPort: 65000,
      autoStart: options.autoStart ?? false,
      ...(options.partReferences ? { partReferences: options.partReferences } : {}),
      cacheDir,
      log: () => undefined,
    },
    {
      status: (status) => statuses.push(status),
      revision: (revision) => revisions.push(revision),
      saved: () => {
        saved.count += 1;
      },
    },
  );
  cleanups.push(() => supervisor.shutdown());
  return { supervisor, statuses, revisions, controlDir, cacheDir, saved };
}

async function startFake(controlDir: string, batchDelayMs = 0) {
  const fake = new FakeSolidCraft({ controlDir, batchDelayMs });
  await fake.start();
  cleanups.push(() => fake.stop());
  return fake;
}

describe('SolidCraft supervisor', () => {
  it('connects to a running SolidCraft and mirrors the design', async () => {
    const { supervisor, statuses, revisions, controlDir, cacheDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    const [revision] = revisions;
    expect(revision).toMatchObject({ documentId: fake.documentId, revision: 1, designName: 'Cable clip' });
    expect(revision?.bodies[0]?.name).toBe('CableClip');
    expect(revision?.bodies[0]?.faces.faces.length).toBeGreaterThan(10);
    expect(revision?.bodies[0]?.mesh.byteLength).toBeGreaterThan(1000);
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', mirror: 'idle', owned: false, port: fake.port });
    // Exports are removed from the cache after reading.
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  // Windows' 8.3 name of a folder, or the folder itself where the volume keeps none.
  function shortName(folder: string): string {
    return spawnSync('cmd', ['/d', '/c', `for %I in ("${folder}") do @echo %~sI`], { encoding: 'utf8', windowsVerbatimArguments: true }).stdout.trim();
  }

  it.skipIf(process.platform !== 'win32')('hands SolidCraft the cache folder in its long form, not as an 8.3 short name', async () => {
    const long = realpathSync.native(mkdtempSync(join(tmpdir(), 'partbuddy-long-folder-name-')));
    cleanups.push(() => {
      rmSync(long, { recursive: true, force: true });
    });
    const short = shortName(long);
    expect(short).toContain('~'); // the test is only meaningful with a real short name
    const { supervisor, revisions, controlDir } = setup({ cacheDir: short });
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    expect(fake.exports.length).toBeGreaterThan(0);
    for (const entry of fake.exports) expect(entry.path.startsWith(long)).toBe(true);
  });

  it('mirrors the active sketch and visible sketches as world-space segments, not consumed ones (#21)', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    fake.sketches = [
      { id: 1, name: 'Base', visible: false },
      { id: 2, name: 'Curves', visible: true },
      { id: 3, name: 'Editing', visible: false },
    ];
    fake.activeSketch = 3;
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    const sketches = revisions[0]?.sketches ?? [];
    expect(sketches.map((sketch) => [sketch.id, sketch.name, sketch.active])).toEqual([
      [2, 'Curves', false],
      [3, 'Editing', true],
    ]);
    const [curves] = sketches;
    if (!curves) throw new Error('no sketch mirrored');
    expect(curves.positions.length).toBe(curves.styles.length * 6);
    expect(curves.curves.length).toBe(57);
    // The fixture sketch lies on XZ, offset 5 mm.
    for (let i = 1; i < curves.positions.length; i += 3) expect(curves.positions[i]).toBeCloseTo(5, 4);
    expect(fake.methods.filter((method) => method === 'engine.batch')).toHaveLength(2);
  });

  it('undoes and redoes the user\'s steps and mirrors the history depth (ADR 0016)', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    fake.undoDepth = 2;
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    expect(revisions[0]?.history).toEqual({ undo: 2, redo: 0 });

    await supervisor.undo();
    await vi.waitFor(() => expect(revisions.at(-1)?.history).toEqual({ undo: 1, redo: 1 }), { timeout: 5000 });
    await supervisor.redo();
    await vi.waitFor(() => expect(revisions.at(-1)?.history).toEqual({ undo: 2, redo: 0 }), { timeout: 5000 });

    fake.redoDepth = 0;
    await expect(supervisor.redo()).rejects.toThrow(/nothing to redo/);
  });

  it('exports every body through the cache folder and copies the file to where the user saves it', async () => {
    const { supervisor, revisions, controlDir, cacheDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    const target = mkdtempSync(join(tmpdir(), 'partbuddy-export-'));
    cleanups.push(() => {
      rmSync(target, { recursive: true, force: true });
    });
    const file = join(target, 'Unterordner', 'Kabelclip.stl');

    await supervisor.exportDesign('stl', file);
    expect(readFileSync(file, 'utf8')).toBe('fake stl');
    const [written] = fake.exports.filter((entry) => entry.format === 'stl');
    // SolidCraft only writes into the cache folder; PartBuddy copies from there and cleans up.
    expect(written?.path.startsWith(cacheDir)).toBe(true);
    expect(written?.bodies).toEqual(['CableClip']);
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('exports no standard part, waits for its reference, and says so instead of exporting a body it could not check (third review, b)', async () => {
    // A nut beside the clip, as SolidCraft lists and measures it; where its reference stands is the test's to say.
    const shape = { volume: 45.9, area: 106.6, faces: 1, edges: 21, vertices: 14, faceAreas: [18.1], perimeters: [21.3], radii: [1.5] };
    let state: ReferenceState = { building: true };
    const waited: ReferenceState[] = [];
    const { supervisor, revisions, controlDir } = setup({
      partReferences: () => ({
        known: (parts) => new Map(parts.map((part) => [part.description, state])),
        // What an export waits for: by then the part is built, refused or lost.
        ready: (parts) => Promise.resolve(new Map(parts.map((part) => [part.description, waited.shift() ?? state]))),
        forget: () => undefined,
      }),
    });
    const fake = await startFake(controlDir);
    fake.bodies = ['CableClip', 'Nut'];
    fake.answers['component.list'] = () => ({ components: [{ id: 0, parent: null, bodies: ['CableClip'], occurrences: [] }, { id: 2, parent: 0, bodies: ['Nut'], occurrences: [{ id: 3, parent: 0 }] }] });
    fake.answers['component.metadata'] = () => ({ description: 'Hex nut M3' });
    fake.answers['parts.library'] = () => ({ families: [{ family: 'hex_nut', name: 'Hex nut', sizes: [{ size: 'M3' }] }] });
    fake.answers['inspect.measure'] = (params) =>
      params.items ? { items: [{ type: 'face', area_mm2: 18.1, perimeter_mm: 21.3, radius: 1.5 }] } : { bodies: [{ name: 'Nut', volume_mm3: 45.9, area_mm2: 106.6, faces: 1, edges: 21, vertices: 14 }] };
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    // The mirror did not wait: the nut is neither printed nor bought yet, and the print check leaves it out.
    expect(revisions[0]?.structure).toMatchObject({ standardParts: [], pendingParts: ['Nut'] });
    const target = mkdtempSync(join(tmpdir(), 'partbuddy-export-'));
    cleanups.push(() => {
      rmSync(target, { recursive: true, force: true });
    });
    const exported = () => fake.exports.filter((entry) => entry.format === 'stl').map((entry) => entry.bodies);

    // The export waits; the reference arrives: the nut stays out.
    waited.push({ shape, partNumber: 'ISO 4032 M3' });
    await supervisor.exportDesign('stl', join(target, 'a.stl'));
    expect(exported()).toEqual([['CableClip']]);
    // The reference could not be built, or is still being built after the wait: nothing is written, and the user reads why.
    for (const lost of [{ failed: 'no answer within 22 s' }, { building: true as const }]) {
      waited.push(lost);
      await expect(supervisor.exportDesign('stl', join(target, 'b.stl'))).rejects.toThrow(/nothing was written, because it is not known whether these are bought standard parts: "Nut": ./);
    }
    expect(exported()).toEqual([['CableClip']]);
    expect(existsSync(join(target, 'b.stl'))).toBe(false);
    // SolidCraft builds no such part: the body is a printed one and is exported.
    state = { refused: '`length` must be 0…2000 mm' };
    await supervisor.exportDesign('stl', join(target, 'c.stl'));
    expect(exported()).toEqual([['CableClip'], ['CableClip', 'Nut']]);
    // The parts to buy follow the same recognition.
    state = { shape, partNumber: 'ISO 4032 M3' };
    expect(await supervisor.hardware()).toEqual([{ count: 1, name: 'Hex nut M3', standard: 'ISO 4032 M3' }]);
    // No solidcraft-cli, so no part can ever be checked: the nut goes along as a printed body and is named for the user (last review, 2).
    state = { unavailable: 'SolidCraft is installed without solidcraft-cli' };
    expect(await supervisor.exportDesign('stl', join(target, 'd.stl'))).toEqual({ unverified: ['Nut'] });
    expect(exported().at(-1)).toEqual(['CableClip', 'Nut']);
    expect(await supervisor.hardware()).toEqual([]);
  });

  describe('parts printed together in the export and to the slicer (audit G1, review of PR 366 S3, S4)', () => {
    const mark = { 'io.github.manuelstaggl.partbuddy.together.a': { joint: 'Hinge' } };
    const fixture = new URL('../../../packages/geometry/fixtures/cable-clip.3mf', import.meta.url);
    /** A 3MF as SolidCraft writes it: a mesh object and a build item per body. */
    const meshes = (bodies: string[]) => {
      const objects = bodies.map((name, i) => `<object id="${String(i + 2)}" type="model" name="${name}"><mesh><vertices><vertex x="0" y="0" z="${String(i * 10)}"/><vertex x="1" y="0" z="${String(i * 10 + 5)}"/></vertices><triangles/></mesh></object>`);
      return zipSync({ '3D/3dmodel.model': strToU8(`<model><resources>${objects.join('')}</resources><build>${bodies.map((_, i) => `<item objectid="${String(i + 2)}"/>`).join('')}</build></model>`) });
    };
    const started = async (slicer: { program: string | null }) => {
      const { supervisor, revisions, controlDir } = setup();
      const fake = await startFake(controlDir);
      fake.bodies = ['Box', 'Lid', 'Loose'];
      fake.answers['component.list'] = () => ({ components: [{ id: 0, parent: null, bodies: [] }, ...fake.bodies.map((name, i) => ({ id: 2 + 2 * i, parent: 0, bodies: [name], occurrences: [{ id: 3 + 2 * i }] }))] });
      fake.answers['joint.list'] = () => ({ joints: [{ id: 20, name: 'Hinge', type: 'revolute', a: 3, b: 5, values: [{ unit: 'deg', value: 0, limits: [0, 180] }] }] });
      fake.answers['component.metadata'] = (params) => ({ metadata: params.component === 2 || params.component === 4 ? mark : {} });
      fake.answers['file.export'] = (params) => {
        const bodies = (params.bodies as string[] | undefined) ?? fake.bodies;
        if (params.format === '3mf-tagged') copyFileSync(fixture, String(params.path));
        else writeFileSync(String(params.path), meshes(bodies));
        fake.exports.push({ path: String(params.path), format: String(params.format), bodies });
        return { path: params.path };
      };
      fake.answers['file.slicers'] = () => ({ slicers: [{ id: 'bambu', name: 'Bambu Studio', program: slicer.program }] });
      supervisor.start();
      await vi.waitFor(() => expect(revisions.at(-1)?.structure.printGroups).toEqual([['Box', 'Lid']]), { timeout: 5000 });
      // Read after the mirror: the lid's top is its print face; the loose body's names a face it does not have.
      const asked: unknown[] = [];
      fake.answers['model.faces'] = (params) => {
        asked.push(params.body);
        return { body: params.body, faces: [{ name: 'F1:+z', plane_normal: [0, 0, 1] }] };
      };
      return { supervisor, fake, asked };
    };
    const model = (file: string) => strFromU8(unzipSync(readFileSync(file))['3D/3dmodel.model'] ?? new Uint8Array());
    const child = (event: 'spawn' | 'error') => {
      const program = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ChildProcess;
      setTimeout(() => program.emit(event, ...(event === 'error' ? [new Error('spawn EACCES')] : [])), 0);
      return program;
    };

    it('writes the hinge as one object into the exported 3MF', async () => {
      const { supervisor } = await started({ program: null });
      const target = mkdtempSync(join(tmpdir(), 'partbuddy-export-'));
      cleanups.push(() => {
        rmSync(target, { recursive: true, force: true });
      });
      await supervisor.exportDesign('3mf', join(target, 'hinge.3mf'));
      const written = model(join(target, 'hinge.3mf'));
      expect(written).toContain('<object id="5" type="model" name="Box + Lid"><components><component objectid="2"/><component objectid="3"/></components></object>');
      expect(written).toContain('<build>\n<item objectid="5"/>\n<item objectid="4"/>\n</build>');
      // With print faces the exported 3MF lies as the check lays it: the hinge on the lid's top, the loose body on its own (audit D21).
      await supervisor.exportDesign('3mf', join(target, 'laid.3mf'), { Lid: 'F1:+z', Loose: 'F1:+z' });
      expect(model(join(target, 'laid.3mf'))).toContain('<item objectid="5" transform="-1 0 0 0 1 0 0 0 -1 0 0 15"/>\n<item objectid="4" transform="-1 0 0 0 1 0 0 0 -1 0 0 25"/>');
    });

    it('writes the file for the slicer itself, the hinge as one piece laid on its print face, and starts the slicer on it', async () => {
      const { supervisor, fake, asked } = await started({ program: process.execPath });
      vi.mocked(spawn).mockImplementationOnce(() => child('spawn'));
      expect(await supervisor.sendToSlicer('bambu', { Lid: 'F1:+z', Loose: 'F9:gone' })).toEqual({ name: 'Bambu Studio', unverified: [] });
      // One batch: the export, then the faces of the two bodies with a print face, in that order.
      expect(asked).toEqual(['Lid', 'Loose']);
      const [program, args] = vi.mocked(spawn).mock.calls.at(-1) ?? [];
      expect(program).toBe(process.execPath);
      const file = String((args as string[] | undefined)?.[0]);
      expect(fake.exports.at(-1)).toMatchObject({ path: file, format: '3mf', bodies: ['Box', 'Lid', 'Loose'] });
      // The lid's top down turns the hinge over, its highest point (z 15) to the bed; the loose body has no such face and lies as designed.
      expect(model(file)).toContain('<item objectid="5" transform="-1 0 0 0 1 0 0 0 -1 0 0 15"/>\n<item objectid="4"/>');
    });

    it('says when the slicer cannot be started instead of reporting it opened', async () => {
      const missing = await started({ program: join(tmpdir(), 'no-such-slicer.exe') });
      await expect(missing.supervisor.sendToSlicer('bambu')).rejects.toThrow('this slicer is not installed');
      const nameless = await started({ program: null });
      await expect(nameless.supervisor.sendToSlicer('bambu')).rejects.toThrow('SolidCraft names no program for Bambu Studio');
      const failing = await started({ program: process.execPath });
      vi.mocked(spawn).mockImplementationOnce(() => child('error'));
      await expect(failing.supervisor.sendToSlicer('bambu')).rejects.toThrow('the slicer did not start: spawn EACCES');
    });
  });

  describe('the export lays each body on its print face and meshes round faces fine (audit D21, D22, S-23)', () => {
    /** A binary STL of one upward and one downward triangle, as `file.export` writes it, the part 2 … 12 mm high. */
    const binary = () => {
      const data = Buffer.alloc(84 + 2 * 50);
      data.writeUInt32LE(2, 80);
      [[0, 0, 1, 0, 0, 12, 10, 0, 12, 0, 10, 12], [0, 0, -1, 0, 0, 2, 0, 10, 2, 10, 0, 2]].forEach((values, t) => values.forEach((value, i) => data.writeFloatLE(value, 84 + t * 50 + i * 4)));
      return data;
    };
    const exporting = async (bodies: string[]) => {
      const { supervisor, revisions, controlDir } = setup();
      const fake = await startFake(controlDir);
      fake.bodies = bodies;
      const asked: Record<string, unknown>[] = [];
      fake.answers['file.export'] = (params) => {
        if (params.format === '3mf-tagged') copyFileSync(new URL('../../../packages/geometry/fixtures/cable-clip.3mf', import.meta.url), String(params.path));
        else if (params.format === 'stl') writeFileSync(String(params.path), binary());
        else writeFileSync(String(params.path), 'fake step');
        asked.push(params);
        return { path: params.path };
      };
      supervisor.start();
      await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
      fake.answers['model.faces'] = () => ({ faces: [{ name: 'F1:+z', plane_normal: [0, 0, 1] }] });
      const target = mkdtempSync(join(tmpdir(), 'partbuddy-export-'));
      cleanups.push(() => {
        rmSync(target, { recursive: true, force: true });
      });
      return { supervisor, asked, target, fake };
    };
    const heights = (file: string) => {
      const data = readFileSync(file);
      return [0, 1].flatMap((t) => [1, 2, 3].map((corner) => Math.round(data.readFloatLE(84 + t * 50 + corner * 12 + 8) * 1000) / 1000));
    };

    it('turns a single body of an STL onto its print face and asks for fine quality', async () => {
      const { supervisor, asked, target } = await exporting(['Lid']);
      await supervisor.exportDesign('stl', join(target, 'lid.stl'), { Lid: 'F1:+z' });
      expect(asked.at(-1)).toMatchObject({ format: 'stl', bodies: ['Lid'], quality: 'fine' });
      // The top (z 12) is on the bed, the bottom (z 2) 10 mm above it.
      expect(heights(join(target, 'lid.stl'))).toEqual([0, 0, 0, 10, 10, 10]);
      // Without a print face it lies as designed.
      await supervisor.exportDesign('stl', join(target, 'as-designed.stl'));
      expect(heights(join(target, 'as-designed.stl'))).toEqual([12, 12, 12, 2, 2, 2]);
    });

    it('exports a body whose print face cannot be read as designed instead of failing the export (review of BC-04, K4)', async () => {
      const { supervisor, target, fake } = await exporting(['Lid']);
      fake.answers['model.faces'] = () => {
        throw new Error('the body has no faces to list');
      };
      await supervisor.exportDesign('stl', join(target, 'lid.stl'), { Lid: 'F1:+z' });
      expect(heights(join(target, 'lid.stl'))).toEqual([12, 12, 12, 2, 2, 2]);
      await supervisor.exportDesign('3mf', join(target, 'lid.3mf'), { Lid: 'F1:+z' });
      expect(existsSync(join(target, 'lid.3mf'))).toBe(true);
    });

    it('leaves an STL of several pieces as designed, and STEP always, without a quality', async () => {
      const { supervisor, asked, target } = await exporting(['Lid', 'Box']);
      await supervisor.exportDesign('stl', join(target, 'two.stl'), { Lid: 'F1:+z' });
      expect(heights(join(target, 'two.stl'))).toEqual([12, 12, 12, 2, 2, 2]);
      await supervisor.exportDesign('step', join(target, 'two.step'), { Lid: 'F1:+z' });
      expect(asked.at(-1)).toEqual({ path: expect.any(String) as string, format: 'step', bodies: ['Lid', 'Box'] });
    });
  });

  it('reads the print faces from the saved design only while it is current, and saves first when the design moved (audit D20, review of BC-04 B1)', async () => {
    const { supervisor, revisions, controlDir, cacheDir, saved } = setup();
    await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    expect(await supervisor.savedPrintFaces()).toBeNull();
    const [body] = revisions[0]?.bodies ?? [];
    const top = body?.faces.faces.find((face) => face.planeNormal?.[2] === 1);
    if (!body || !top) throw new Error('the fixture has no flat top');
    // The headless engine as the supervisor uses it: a save writes the design as SolidCraft does (a zip whose
    // document.json lists the print faces) and moves the revision; the project store holds the design.
    const projects = join(cacheDir, 'projects');
    const design = join(projects, 'Cable clip', 'Cable clip.sc');
    // As HeadlessEngine: `current()` is the revision recorded at the end of the save, not a live read; `during` is a
    // change sent while the save runs, after SolidCraft took the file.
    const state = { revision: 7, recorded: null as { documentId: string; revision: number } | null, changes: 0, faces: {} as Record<string, unknown>, during: null as (() => void) | null };
    const engine = {
      isOpen: true,
      get changes() {
        return state.changes;
      },
      current: () => state.recorded,
      revision: () => Promise.resolve({ documentId: 'doc', revision: state.revision }),
      save: (path: string) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, zipSync({ 'document.json': strToU8(JSON.stringify({ print_faces: state.faces })), 'cache/bodies.bin': new Uint8Array(8) }));
        state.during?.();
        state.during = null;
        state.revision += 1;
        state.recorded = { documentId: 'doc', revision: state.revision };
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    };
    Object.assign(supervisor as unknown as Record<string, unknown>, { engine, designFile: design, designs: new ProjectStore(projects, join(cacheDir, 'designs'), 'Part') });
    // Never saved: nothing is read.
    expect(await supervisor.savedPrintFaces()).toBeNull();
    // A print face set and not saved yet (no timer runs, the mirror has not come): saveNow saves, the save is told.
    state.faces = { [body.name]: { name: 'F9:old', point: top.centroid }, Gone: { name: 'F1:+z', point: [0, 0, 0] } };
    state.revision += 1;
    expect(await supervisor.saveNow()).toBe(design);
    expect(saved.count).toBe(1);
    const read = await supervisor.savedPrintFaces();
    expect(read).toEqual({ faces: { [body.name]: expect.any(String) as string, Gone: 'F1:+z' }, lost: [] });
    expect(body.faces.faces.find((face) => face.name === read?.faces[body.name])?.planeNormal).toEqual(top.planeNormal);
    // The design moved after the save (a print face set or undone): the older file is not read.
    state.faces = {};
    state.revision += 1;
    expect(await supervisor.savedPrintFaces()).toBeNull();
    await supervisor.saveNow();
    expect(saved.count).toBe(2);
    expect(await supervisor.savedPrintFaces()).toEqual({ faces: {}, lost: [] });
    // Nothing moved since: no save.
    await supervisor.saveNow();
    expect(saved.count).toBe(2);
    // A print face sent while a save runs (review of BC-04, S1): the file was taken before it, the revision read after
    // the save holds it. The file is not read, so the face just set stays; the next save holds it.
    state.revision += 1;
    state.during = () => {
      state.faces = { [body.name]: { name: top.name, point: top.centroid } };
      state.changes += 1;
      state.revision += 1;
    };
    await supervisor.saveNow();
    expect(saved.count).toBe(3);
    expect(await supervisor.savedPrintFaces()).toBeNull();
    await supervisor.saveNow();
    expect(saved.count).toBe(4);
    expect((await supervisor.savedPrintFaces())?.faces).toEqual({ [body.name]: top.name });
  });

  it('refuses to export a design without a body', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    fake.bodies = [];
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    await expect(supervisor.exportDesign('3mf', join(tmpdir(), 'never.3mf'))).rejects.toThrow(/no body/);
    expect(supervisor.canOpenInSolidCraft()).toBe(false);
  });

  it('mirrors again on design.changed and coalesces bursts', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir, 150);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    for (let i = 0; i < 5; i += 1) fake.change();
    await vi.waitFor(() => expect(revisions.at(-1)?.revision).toBe(6), { timeout: 5000 });
    // One mirror for the first change, at most one more for the rest of the burst.
    expect(revisions.length).toBeLessThanOrEqual(3);
    expect(supervisor.status()).toMatchObject({ state: 'connected', revision: 6 });
  });

  it('reports a lost connection and reconnects when SolidCraft returns', async () => {
    const { supervisor, statuses, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    await fake.stop();
    await vi.waitFor(() => expect(statuses.some((s) => s.state === 'lost')).toBe(true), { timeout: 5000 });
    await startFake(controlDir);
    await vi.waitFor(() => expect(supervisor.status().state).toBe('connected'), { timeout: 15000 });
  }, 20000);

  it("tries a form snap fit's root radius, shows it, builds it only where kept, and says when it stays sharp (second review of BC-17, S2/S4)", async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    // SolidCraft's hook and each root edge: the body grows by what a 0.9 mm radius adds along 5 mm, as measured on 0.40.1.
    let volume = 1000;
    let fillets = 0;
    let refuse: (n: number) => boolean = () => false;
    const built: string[][] = [];
    fake.answers['component.list'] = () => ({ components: [{ id: 0, parent: null, bodies: ['CableClip'], occurrences: [] }] });
    fake.answers['plastic.snap_fit'] = () => ({ feature: 1 });
    fake.answers['inspect.measure'] = () => ({ bodies: [{ name: 'CableClip', volume_mm3: volume }] });
    fake.answers['solid.fillet'] = (params) => {
      fillets += 1;
      if (refuse(fillets)) throw new Error('the fillet is larger than the faces beside its edges allow');
      built.push((params.edges as number[][]).map((edge) => edge.join(',')));
      volume += rootGrowth(5, 0.9);
      return { warning: null };
    };
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    const hook = { block: 'snapFit', body: 'CableClip', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', length: 12, thickness: 1.5, width: 5, catchDepth: 0.8, catchLength: 1.5, hook: 'y+' } satisfies FeatureBlock;
    // Kept: the preview carries it (and draws it), apply builds both edges after the trial.
    expect(await supervisor.previewBlock(hook)).toMatchObject({ ok: true, root: { applied: 0.9, wanted: 0.9 } });
    expect(await supervisor.applyBlock(hook)).toBeNull();
    expect(built.slice(-2)).toEqual([['10,10,10'], ['10,8.5,10']]);
    // Refused on trial: the preview says null, apply builds the hook alone and answers rootSharp.
    refuse = () => true;
    built.length = 0;
    expect(await supervisor.previewBlock(hook)).toMatchObject({ ok: true, root: { applied: null, wanted: 0.9 } });
    expect(await supervisor.applyBlock(hook)).toEqual({ rootSharp: true });
    expect(built).toEqual([]);
    // Kept on trial, refused when built for real: still told (not only logged).
    const from = fillets;
    refuse = (n) => n > from + 2;
    expect(await supervisor.applyBlock(hook)).toEqual({ rootSharp: true });
  }, 20000);

  it('says when SolidCraft is not running, and finds it once it starts', async () => {
    const { supervisor, controlDir } = setup();
    supervisor.start();
    await vi.waitFor(() => expect(supervisor.status().state).toBe('notRunning'), { timeout: 5000 });
    await startFake(controlDir);
    supervisor.retry();
    await vi.waitFor(() => expect(supervisor.status().state).toBe('connected'), { timeout: 5000 });
  });

  it('says when SolidCraft is not installed', async () => {
    const { supervisor } = setup({ installed: false });
    supervisor.start();
    await vi.waitFor(() => expect(supervisor.status().state).toBe('notInstalled'), { timeout: 5000 });
  });

  it('does not ask a SolidCraft it did not start to quit', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    await supervisor.shutdown();
    expect(fake.quitRequested).toBe(false);
  });
});

describe('mirror scheduler', () => {
  it('runs one mirror at a time and keeps only the newest request', async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    const delivered: number[] = [];
    const scheduler = new MirrorScheduler(
      async () => {
        calls += 1;
        const revision = calls === 1 ? 1 : 4;
        await new Promise<void>((done) => {
          release = done;
        });
        return { documentId: 'd', revision, designName: '', bodies: [], sketches: [], structure: { features: [], marker: null, bodies: [], sketches: [] }, history: { undo: 0, redo: 0 }, mirrorMs: 1 };
      },
      { started: () => undefined, delivered: (r) => delivered.push(r.revision), failed: () => undefined, idle: () => undefined },
    );
    scheduler.request({ documentId: 'd', revision: 1 });
    scheduler.request({ documentId: 'd', revision: 2 });
    scheduler.request({ documentId: 'd', revision: 3 });
    scheduler.request({ documentId: 'd', revision: 4 });
    await vi.waitFor(() => expect(release).not.toBeNull());
    (release as unknown as () => void)();
    await vi.waitFor(() => expect(calls).toBe(2));
    (release as unknown as () => void)();
    await vi.waitFor(() => expect(delivered).toEqual([1, 4]));
  });
});
