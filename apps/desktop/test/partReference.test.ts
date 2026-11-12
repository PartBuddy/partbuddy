import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { builtParts, cliReferences, faceCount, faceScript, referenceScript, referencesOf, sameShape, shapeOf, TransientCliError, type CliRunner, type PartQuery } from '../src/main/solidcraft/partReference';

const nut: PartQuery = { description: 'Hex nut M3', part: { family: 'hex_nut', size: 'M3', length: null } };
const screw: PartQuery = { description: 'Countersunk socket screw M3x10', part: { family: 'countersunk_socket_screw', size: 'M3', length: 10 } };
// A washer has no length: SolidCraft 0.40.1 builds "Plain washer M3" whatever length is asked for.
const forged: PartQuery = { description: 'Plain washer M3x8', part: { family: 'washer', size: 'M3', length: 8 } };
// parts.insert refuses a length over 2000 mm, and with it the whole script.
const refused: PartQuery = { description: 'Socket head cap screw M3x5000', part: { family: 'socket_head_cap_screw', size: 'M3', length: 5000 } };

// One face as inspect.measure {items: [{type: "face", body, index}]} answers.
const face = (area: number, perimeter: number, radius?: number) => ({ items: [{ type: 'face', area_mm2: area, perimeter_mm: perimeter, ...(radius === undefined ? {} : { radius }) }] });
// Volume and area as SolidCraft 0.40.1 measures them; the faces shortened to three and two.
const NUT = { volume_mm3: 45.9088439852507, area_mm2: 106.60297841336842, faces: 3, edges: 21, vertices: 14 };
const NUT_FACES = [face(18.1, 21.3, 1.5), face(6.6, 12.1), face(2.4, 8.2)];
const SCREW = { volume_mm3: 89.91686929002658, area_mm2: 167.0365086545463, faces: 2, edges: 23, vertices: 15 };
const SCREW_FACES = [face(61.2, 30.1, 1.5), face(20.5, 18.8)];
const nutShape = { volume: NUT.volume_mm3, area: NUT.area_mm2, faces: 3, edges: 21, vertices: 14, faceAreas: [2.4, 6.6, 18.1], perimeters: [8.2, 12.1, 21.3], radii: [1.5] };

describe('a library part as SolidCraft builds it alone (review 2, stage 2)', () => {
  it('builds each part under a name of its own and measures it, then again to measure each face', () => {
    const insertNut = { command: 'parts.insert', params: { family: 'hex_nut', size: 'M3', name: 'ref0', point: [0, 0, 0] } };
    expect(referenceScript([nut, screw])).toEqual([
      insertNut,
      { command: 'parts.insert', params: { family: 'countersunk_socket_screw', size: 'M3', length: 10, name: 'ref1', point: [1000, 0, 0] } },
      { command: 'component.list', params: {} },
      { command: 'component.metadata', params: { component: 'ref0' } },
      { command: 'component.metadata', params: { component: 'ref1' } },
      { command: 'inspect.measure', params: {} },
    ]);
    // How many faces a part has is known only after the first run.
    expect(faceScript([{ ...nut, partNumber: 'ISO 4032 M3', measured: NUT, faces: 3 }])).toEqual([
      insertNut,
      { command: 'component.list', params: {} },
      { command: 'inspect.measure', params: { items: [{ type: 'face', body: 'Body1', index: 0 }] } },
      { command: 'inspect.measure', params: { items: [{ type: 'face', body: 'Body1', index: 1 }] } },
      { command: 'inspect.measure', params: { items: [{ type: 'face', body: 'Body1', index: 2 }] } },
    ]);
  });

  it('reads shape and part number of the parts SolidCraft described in the words asked for', () => {
    // The results of the first `solidcraft-cli run --results` for nut, screw and the forged washer.
    const first = [
      { component: 1, name: 'ref0' },
      { component: 8, name: 'ref1' },
      { component: 15, name: 'ref2' },
      { components: [{ id: 0, name: 'Untitled', bodies: [] }, { id: 1, name: 'ref0', bodies: ['Body1'] }, { id: 8, name: 'ref1', bodies: ['Body2'] }, { id: 15, name: 'ref2', bodies: ['Body3'] }] },
      { description: 'Hex nut M3', part_number: 'ISO 4032 M3' },
      { description: 'Countersunk socket screw M3x10', part_number: 'ISO 10642 M3x10' },
      { description: 'Plain washer M3', part_number: 'ISO 7089 M3' },
      { bodies: [{ name: 'Body2', ...SCREW }, { name: 'Body1', ...NUT }, { name: 'Body3', volume_mm3: 10.1, area_mm2: 70.2, faces: 4, edges: 4, vertices: 4 }] },
    ];
    const built = builtParts([nut, screw, forged], first);
    expect(built.map((part) => [part.description, part.partNumber, part.faces])).toEqual([['Hex nut M3', 'ISO 4032 M3', 3], ['Countersunk socket screw M3x10', 'ISO 10642 M3x10', 2]]);
    // The second run: the two parts again, then the nut's three faces and the screw's two.
    const second = [{}, {}, { components: [{ name: 'ref0', bodies: ['Body1'] }, { name: 'ref1', bodies: ['Body2'] }] }, ...NUT_FACES, ...SCREW_FACES];
    const references = referencesOf(built, second);
    expect([...references.keys()]).toEqual(['Hex nut M3', 'Countersunk socket screw M3x10']);
    expect(references.get('Hex nut M3')).toEqual({ shape: nutShape, partNumber: 'ISO 4032 M3' });
    expect(references.get('Countersunk socket screw M3x10')?.shape.faceAreas).toEqual([20.5, 61.2]);
    // Results that read oddly give no reference, so the body counts as printed: no results, two bodies, a body of another
    // name, a face that was not measured, another body in the second run.
    expect(builtParts([nut], [])).toEqual([]);
    expect(builtParts([nut], [{}, { components: [{ name: 'ref0', bodies: ['Body1', 'Body2'] }] }, { description: 'Hex nut M3' }, { bodies: [{ name: 'Body1', ...NUT }] }])).toEqual([]);
    expect(builtParts([nut], [{}, { components: [{ name: 'ref0', bodies: ['Nut'] }] }, { description: 'Hex nut M3' }, { bodies: [{ name: 'Nut', ...NUT }] }])).toEqual([]);
    expect(referencesOf(built.slice(0, 1), [{}, { components: [{ name: 'ref0', bodies: ['Body1'] }] }, ...NUT_FACES.slice(0, 2)]).size).toBe(0);
    expect(referencesOf(built.slice(0, 1), [{}, { components: [{ name: 'ref0', bodies: ['Body7'] }] }, ...NUT_FACES]).size).toBe(0);
  });

  it('takes two bodies for the same shape within the measuring noise only', () => {
    const shape = { volume: 75.22017841527448, area: 137.6044195955919, faces: 12, edges: 24, vertices: 16, faceAreas: [3.1, 40.2, 94.3], perimeters: [7.8, 14.1, 31], radii: [1.25, 2.25] };
    // The same screw turned to [1, 2, 3], as SolidCraft 0.40.1 measures it.
    expect(sameShape(shape, { ...shape, volume: 75.22017841786527, area: 137.60441959673892 })).toBe(true);
    expect(sameShape(shape, { ...shape, volume: shape.volume * 1.00001 })).toBe(false);
    expect(sameShape(shape, { ...shape, area: shape.area * 0.9999 })).toBe(false);
    expect(sameShape(shape, { ...shape, faces: 13 })).toBe(false);
    expect(sameShape(shape, { ...shape, perimeters: [7.8, 14.2, 31] })).toBe(false);
    expect(shapeOf(NUT, NUT_FACES)).toEqual(nutShape);
    // An open body has no volume; a body is not measured without its faces, with one too few or with one that reads oddly.
    expect(shapeOf({ area_mm2: 6, faces: 3, edges: 12, vertices: 8 }, NUT_FACES)).toBeNull();
    expect(shapeOf(NUT, undefined)).toBeNull();
    expect(shapeOf(NUT, NUT_FACES.slice(1))).toBeNull();
    expect(shapeOf(NUT, [NUT_FACES[0], NUT_FACES[1], { items: [{ area_mm2: 'wide' }] }])).toBeNull();
    expect(shapeOf(undefined, NUT_FACES)).toBeNull();
    expect(faceCount(NUT)).toBe(3);
    expect(faceCount({ faces: 100_000 })).toBeNull();
  });

  it('does not take a ring for the washer whose volume, area and counts it has (second review, point 3)', () => {
    // The M3 washer of SolidCraft 0.40.1: 7 mm wide, 3.2 mm bore, 0.5 mm thick (15.2210164 mm³); and a ring of R 4.0251,
    // r 3.3699, 1 mm high, which meets its volume, its area and its 4 faces, 4 edges and 4 vertices to 2.6e-11.
    const ring = (outer: number, inner: number, height: number) => ({
      volume: Math.PI * (outer ** 2 - inner ** 2) * height,
      area: 2 * Math.PI * (outer ** 2 - inner ** 2) + 2 * Math.PI * (outer + inner) * height,
      faces: 4,
      edges: 4,
      vertices: 4,
      faceAreas: [Math.PI * (outer ** 2 - inner ** 2), Math.PI * (outer ** 2 - inner ** 2), 2 * Math.PI * outer * height, 2 * Math.PI * inner * height].sort((a, b) => a - b),
      perimeters: [2 * Math.PI * (outer + inner), 2 * Math.PI * (outer + inner), 4 * Math.PI * outer, 4 * Math.PI * inner].sort((a, b) => a - b),
      radii: [inner, outer],
    });
    const washer = ring(3.5, 1.6, 0.5);
    const twin = ring(4.025086206896552, 3.3699137931034486, 1);
    expect(Math.abs(twin.volume - washer.volume) / washer.volume).toBeLessThan(1e-9);
    expect(Math.abs(twin.area - washer.area) / washer.area).toBeLessThan(1e-9);
    expect(sameShape(twin, washer)).toBe(false);
    // The five numbers alone agree; the faces, their outlines and the radii each tell the two apart.
    const alike = { ...twin, faceAreas: washer.faceAreas, perimeters: washer.perimeters, radii: washer.radii };
    expect(sameShape(alike, washer)).toBe(true);
    expect(sameShape({ ...alike, faceAreas: twin.faceAreas }, washer)).toBe(false);
    expect(sameShape({ ...alike, perimeters: twin.perimeters }, washer)).toBe(false);
    expect(sameShape({ ...alike, radii: twin.radii }, washer)).toBe(false);
  });
});

describe('references from solidcraft-cli, kept and built in the background (second review, points 1, 2 and 4)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A `solidcraft-cli` that answers a reference script as SolidCraft 0.40.1 does; `fail` makes a run throw. */
  function fakeCli(fail: (parts: { family: string; length?: number }[]) => Error | null = () => null) {
    const runs: string[][] = [];
    const faceRuns: number[] = [];
    const scripts: string[] = [];
    const held: (() => void)[] = [];
    const state = { hold: false, version: 'solidcraft-cli 0.40.1' };
    const run: CliRunner = async (_program, args) => {
      if (args[0] === '--version') return `${state.version}\n`;
      const script = args[1] ?? '';
      scripts.push(script);
      const steps = JSON.parse(readFileSync(script, 'utf8')) as { command: string; params: { family: string; size: string; length?: number; name: string; items?: { body: string; index: number }[] } }[];
      const inserts = steps.filter((step) => step.command === 'parts.insert').map((step) => step.params);
      // The second run of a build asks for the faces; `runs` counts the builds, `faceRuns` their second runs.
      const faces = steps.flatMap((step) => step.params.items ?? []);
      if (faces.length > 0) faceRuns.push(inserts.length);
      else runs.push(inserts.map((part) => `${part.family} ${part.size}${part.length === undefined ? '' : `x${String(part.length)}`}`));
      if (state.hold) {
        await new Promise<void>((done) => held.push(done));
      }
      const error = fail(inserts);
      if (error) throw error;
      const describe = (part: { family: string; size: string; length?: number }) =>
        part.family === 'hex_nut' ? `Hex nut ${part.size}` : part.family === 'washer' ? `Plain washer ${part.size}` : `Countersunk socket screw ${part.size}x${String(part.length)}`;
      const built = [...inserts.map((part) => ({ name: part.name })), { components: inserts.map((part, i) => ({ name: part.name, bodies: [`Body${String(i + 1)}`] })) }];
      if (faces.length > 0) return JSON.stringify([...built, ...faces.map((item) => (inserts[Number(item.body.slice(4)) - 1]?.family === 'hex_nut' ? NUT_FACES : SCREW_FACES)[item.index])]);
      return JSON.stringify([
        ...built,
        ...inserts.map((part) => ({ description: describe(part), part_number: part.family === 'hex_nut' ? 'ISO 4032 M3' : 'ISO 10642 M3x10' })),
        { bodies: inserts.map((part, i) => ({ name: `Body${String(i + 1)}`, ...(part.family === 'hex_nut' ? NUT : SCREW) })) },
      ]);
    };
    return { run, runs, faceRuns, scripts, state, release: () => held.splice(0).forEach((done) => done()) };
  }

  function store(cli: ReturnType<typeof fakeCli>, dir = mkdtempSync(join(tmpdir(), 'partbuddy-parts-'))) {
    if (!dirs.includes(dir)) dirs.push(dir);
    const logs: string[] = [];
    const clock = { now: 1_000_000 };
    let built = 0;
    // The program must be a file that exists: its size and date are part of what the references are kept under.
    const references = cliReferences({ cli: () => process.execPath, dir, log: (message) => void logs.push(message), run: cli.run, now: () => clock.now, built: () => (built += 1) });
    return { references, logs, clock, dir, built: () => built };
  }

  it('answers at once, builds in the background and tells once when the references are there', async () => {
    const cli = fakeCli();
    const { references, built, logs } = store(cli);
    // Nothing is known yet: the mirror gets its answer without a process having run.
    expect(references.known([nut, screw, nut])).toEqual(new Map([['Hex nut M3', { building: true }], ['Countersunk socket screw M3x10', { building: true }]]));
    expect(cli.runs).toEqual([]);
    // Asked again while they are built: no second process (point 2), also for the export that waits.
    references.known([nut, screw]);
    const ready = await references.ready([nut, screw]);
    expect(cli.runs).toEqual([['hex_nut M3', 'countersunk_socket_screw M3x10']]);
    expect(cli.faceRuns).toEqual([2]);
    expect(ready.get('Hex nut M3')).toEqual({ shape: nutShape, partNumber: 'ISO 4032 M3' });
    // One background build, one mirror more.
    expect(built()).toBe(1);
    // Known from here on: no process, no further mirror.
    expect(references.known([nut]).get('Hex nut M3')).toEqual({ shape: nutShape, partNumber: 'ISO 4032 M3' });
    await references.ready([nut, screw]);
    expect(cli.runs).toHaveLength(1);
    expect(built()).toBe(1);
    expect(logs).toEqual([]);
    // The script is gone, the references are kept.
    expect(cli.scripts.every((script) => !existsSync(script))).toBe(true);
  });

  it('keeps the references over a restart, under the program they were built with', async () => {
    const cli = fakeCli();
    const first = store(cli);
    await first.references.ready([nut]);
    expect(readdirSync(first.dir)).toEqual(['part-references.json']);
    // A new run of PartBuddy: the nut comes from the file, without a build; the mirror is told once it is read.
    const second = store(cli, first.dir);
    expect(second.references.known([nut]).get('Hex nut M3')).toEqual({ building: true });
    expect((await second.references.ready([nut])).get('Hex nut M3')).toEqual({ shape: nutShape, partNumber: 'ISO 4032 M3' });
    expect(cli.runs).toHaveLength(1);
    expect(second.built()).toBe(1);
    // Another SolidCraft builds its parts itself.
    cli.state.version = 'solidcraft-cli 0.41.0';
    const third = store(cli, first.dir);
    await third.references.ready([nut]);
    expect(cli.runs).toHaveLength(2);
  });

  it('remembers a part SolidCraft does not build, with the reason, and lets the parts beside it stand', async () => {
    // As 0.40.1 answers a length of 5000 mm: the whole script fails.
    const cli = fakeCli((parts) => (parts.some((part) => part.length === 5000) ? new Error('invalid parameters for `parts.insert`: `length` must be 0…2000 mm') : null));
    const { references, logs, built, dir } = store(cli);
    const ready = await references.ready([nut, refused, forged]);
    // One run for all, then each by itself, once.
    expect(cli.runs).toEqual([['hex_nut M3', 'socket_head_cap_screw M3x5000', 'washer M3x8'], ['hex_nut M3'], ['socket_head_cap_screw M3x5000'], ['washer M3x8']]);
    expect(ready.get('Hex nut M3')).toEqual({ shape: nutShape, partNumber: 'ISO 4032 M3' });
    expect(ready.get('Socket head cap screw M3x5000')).toEqual({ failed: 'invalid parameters for `parts.insert`: `length` must be 0…2000 mm' });
    expect(ready.get('Plain washer M3x8')).toEqual({ failed: 'SolidCraft builds another part for these words' });
    expect(logs).toEqual(['no reference for the standard part "Socket head cap screw M3x5000": invalid parameters for `parts.insert`: `length` must be 0…2000 mm']);
    expect(built()).toBe(1);
    // The next mirrors start no process for them, nor does the next run of PartBuddy.
    references.known([nut, refused, forged]);
    await references.ready([refused, forged]);
    await store(cli, dir).references.ready([nut, refused, forged]);
    expect(cli.runs).toHaveLength(4);
    expect(cli.scripts.every((script) => !existsSync(script))).toBe(true);
  });

  it('does not try a program that gave no answer again with every mirror, but after a while', async () => {
    const cli = fakeCli(() => new TransientCliError('no answer within 22 s'));
    const { references, logs, clock, built, dir } = store(cli);
    expect((await references.ready([nut, screw])).get('Hex nut M3')).toEqual({ failed: 'no answer within 22 s' });
    // One process, not one more for each part.
    expect(cli.runs).toHaveLength(1);
    expect(logs).toEqual(['no reference for the standard part "Hex nut M3": no answer within 22 s', 'no reference for the standard part "Countersunk socket screw M3x10": no answer within 22 s']);
    await references.ready([nut, screw]);
    references.known([nut]);
    expect(cli.runs).toHaveLength(1);
    expect(built()).toBe(0);
    // Not kept over a restart either: nothing says the part cannot be built.
    expect(existsSync(join(dir, 'part-references.json')) ? (JSON.parse(readFileSync(join(dir, 'part-references.json'), 'utf8')) as { parts: object }).parts : {}).toEqual({});
    clock.now += 5 * 60 * 1000 + 1;
    await references.ready([nut, screw]);
    expect(cli.runs).toHaveLength(2);
  });

  it('builds a part once when the mirror and the list of parts to buy ask for it at the same time', async () => {
    const cli = fakeCli();
    cli.state.hold = true;
    const { references } = store(cli);
    references.known([nut]);
    const waiting = [references.ready([nut]), references.ready([nut, screw])];
    // Both processes are running; the nut is in one of them only.
    await expect.poll(() => cli.runs.length).toBe(2);
    cli.state.hold = false;
    cli.release();
    const [first, second] = await Promise.all(waiting);
    // The nut ran once; the screw, asked for while the nut was built, in a run of its own.
    expect(cli.runs.map((parts) => parts.join()).sort()).toEqual(['countersunk_socket_screw M3x10', 'hex_nut M3']);
    expect(first?.get('Hex nut M3')).toEqual(second?.get('Hex nut M3'));
  });
});
