import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { boughtParts, mirrorActiveDesign, MirrorScheduler, printGroupsOf, type ControlRequester, type PartChecks } from '../src/main/solidcraft/mirror';
import type { PartReference } from '../src/main/solidcraft/partReference';

describe('mirroring while the design changes', () => {
  it('names the revision from before its reads, so a change during them is mirrored again', async () => {
    let revision = 1;
    const client: ControlRequester = {
      request: <T,>(_method: string, params?: Record<string, unknown>): Promise<T> => {
        const commands = (params?.commands ?? []) as { command: string }[];
        const results = commands.map((step) => (step.command === 'document.revision' ? { document_id: 'doc', revision } : step.command === 'appearance.list' ? { bodies: {} } : step.command === 'document.inspect' ? { name: 'Part', bodies: [], sketches: [] } : {}));
        // The design changes right after its structure was read.
        if (commands.some((step) => step.command === 'document.inspect')) revision += 1;
        return Promise.resolve({ results } as T);
      },
    };
    const cache = mkdtempSync(join(tmpdir(), 'partbuddy-mirror-'));
    try {
      const mirrored = await mirrorActiveDesign(client, cache);
      // The structure is that of revision 1; revision 2 is still to be mirrored.
      expect(mirrored.revision).toBe(1);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});

// As SolidCraft 0.40.1 measures a countersunk M3x10 and a 0.3 mm lid.
const SCREW = { volume_mm3: 89.91686929002658, area_mm2: 167.0365086545463, faces: 11, edges: 23, vertices: 15 };
const LID = { volume_mm3: 360.00000000000506, area_mm2: 2442, faces: 6, edges: 12, vertices: 8 };
// Each face as inspect.measure {items: [{type: "face", index}]} answers, by index.
const SCREW_FACES = Array.from({ length: 11 }, (_, index) => ({ items: [{ type: 'face', area_mm2: 4 + index, perimeter_mm: 9 + index, ...(index === 1 ? { radius: 1.5 } : {}) }] }));
const SCREW_REFERENCE: PartReference = {
  shape: { volume: SCREW.volume_mm3, area: SCREW.area_mm2, faces: 11, edges: 23, vertices: 15, faceAreas: SCREW_FACES.map((face) => face.items[0]?.area_mm2 ?? 0), perimeters: SCREW_FACES.map((face) => face.items[0]?.perimeter_mm ?? 0), radii: [1.5] },
  partNumber: 'ISO 10642 M3x10',
};

/**
 * A design as SolidCraft 0.40.1 answers after partbuddy_mechanism {kind: screw, head: countersunk}: two
 * screws, each a component, and a holder of the user's. `answer` replaces what a command answers
 * (an Error is thrown, `{failed}` fails the batch it is in).
 */
function design(answer: (command: string, component: number | undefined, call: number) => unknown = () => undefined) {
  const descriptions: Record<number, string> = { 2: 'Countersunk socket screw M3x10', 9: 'Countersunk socket screw M3x10', 16: 'Hex nut holder' };
  const answers: Record<string, unknown> = {
    'document.revision': { document_id: 'doc', revision: 1 },
    // Hidden bodies are not exported, so the fake needs no mesh. The metadata holds the list of names PartBuddy kept until the audit.
    'document.inspect': {
      name: 'Part',
      bodies: ['Block', 'Plate', 'Body1', 'Body2', 'Holder'].map((name) => ({ name, visible: false })),
      sketches: [],
      metadata: { 'io.github.manuelstaggl.partbuddy.standard-parts': { bodies: ['Holder'] } },
    },
    'component.list': {
      components: [
        { id: 0, parent: null, bodies: ['Block', 'Plate'] },
        { id: 2, parent: 0, bodies: ['Body1'] },
        { id: 9, parent: 0, bodies: ['Body2'] },
        { id: 16, parent: 0, bodies: ['Holder'] },
      ],
    },
    'parts.library': { families: [{ family: 'countersunk_socket_screw', name: 'Countersunk socket screw', sizes: [{ size: 'M3' }] }, { family: 'hex_nut', name: 'Hex nut', sizes: [{ size: 'M3' }] }] },
    'inspect.measure': { bodies: [{ name: 'Body1', ...SCREW }, { name: 'Body2', ...SCREW }] },
  };
  const calls: Record<string, number> = {};
  const logs: string[] = [];
  const client: ControlRequester = {
    request: <T,>(_method: string, params?: Record<string, unknown>): Promise<T> => {
      const commands = (params?.commands ?? []) as { command: string; params: { component?: number; items?: { index: number }[] } }[];
      const results: unknown[] = [];
      for (const step of commands) {
        // One face of a body is asked with inspect.measure too; here it goes by a name of its own.
        const face = step.command === 'inspect.measure' ? step.params.items?.[0]?.index : undefined;
        const name = face === undefined ? step.command : 'face';
        calls[name] = (calls[name] ?? 0) + 1;
        const given = answer(name, step.params.component, calls[name] ?? 0);
        if (given instanceof Error) return Promise.reject(given);
        if (given === 'no results') return Promise.resolve({ completed: 0, results: [] } as T);
        if (typeof given === 'object' && given !== null && 'failed' in given) return Promise.resolve({ completed: results.length, results, failed: { index: results.length, command: step.command, error: String(given.failed) } } as T);
        results.push(given ?? (face !== undefined ? SCREW_FACES[face] : step.command === 'component.metadata' ? { description: descriptions[step.params.component ?? -1] ?? null } : (answers[step.command] ?? {})));
      }
      return Promise.resolve({ completed: results.length, results } as T);
    },
  };
  const checks: PartChecks = { log: (message) => void logs.push(message), references: (parts) => Promise.resolve(new Map(parts.map((part) => [part.description, SCREW_REFERENCE]))) };
  const structure = async (given: PartChecks = checks) => {
    const cache = mkdtempSync(join(tmpdir(), 'partbuddy-mirror-'));
    try {
      return (await mirrorActiveDesign(client, cache, given)).structure;
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  };
  const mirror = async (given: PartChecks = checks) => (await structure(given)).standardParts;
  return { mirror, structure, logs, calls, checks };
}

describe('parts printed together in the mirrored structure (audit G1)', () => {
  const mark = (label: string) => ({ [`io.github.manuelstaggl.partbuddy.together.${label}`]: { joint: 'Hinge' } });
  // Components 2, 4, 6 … each placed once, as occurrence id + 1, with a body of their own.
  const names = ['Box', 'Lid', 'Flap', 'Drawer', 'Loose', 'Lid (2)', 'Box (2)', 'Lid (3)'];
  const parts = names.map((name, i) => ({ id: 2 + 2 * i, bodies: [name] }));
  const listing = { components: parts.map((part) => ({ ...part, parent: 0, occurrences: [{ id: part.id + 1 }] })) };
  const joint = (a: string, b: string, suppressed = false) => ({ a: 3 + 2 * names.indexOf(a), b: 3 + 2 * names.indexOf(b), suppressed });

  it('groups the bodies of two components a joint joins and that share the mark of a hinge, chains of hinges as one', () => {
    // Box and lid by one hinge, lid and flap by another; the drawer's guide joins it to the box without a mark.
    const described = [mark('a'), { ...mark('a'), ...mark('b') }, mark('b'), {}, mark('c')].map((metadata) => ({ metadata }));
    const joints = { joints: [joint('Box', 'Lid'), joint('Lid', 'Flap'), joint('Box', 'Drawer')] };
    // In the order of the design's bodies, which print check, plate and export all keep (review of PR 366, K1).
    expect(printGroupsOf(parts.slice(0, 5), described, listing, joints, ['Flap', 'Lid', 'Box', 'Drawer', 'Loose'])).toEqual([['Flap', 'Lid', 'Box']]);
  });

  it('takes no mark without its joint: a copied lid, a hinge whose joint is gone or suppressed, one mark taken back (review of PR 366, S1, S2, K2)', () => {
    // The lid copied with its metadata (component.paste_new) carries the mark, but no joint joins it to the box.
    const copied = [mark('a'), mark('a'), {}, {}, {}, mark('a')].map((metadata) => ({ metadata }));
    expect(printGroupsOf(parts.slice(0, 6), copied, listing, { joints: [joint('Box', 'Lid')] }, names)).toEqual([['Box', 'Lid']]);
    // The pair copied with its joint is a hinge of its own, not part of the first.
    const pair = [mark('a'), mark('a'), {}, {}, {}, {}, mark('a'), mark('a')].map((metadata) => ({ metadata }));
    expect(printGroupsOf(parts, pair, listing, { joints: [joint('Box', 'Lid'), joint('Box (2)', 'Lid (3)')] }, names)).toEqual([['Box', 'Lid'], ['Box (2)', 'Lid (3)']]);
    expect(printGroupsOf(parts.slice(0, 2), copied, listing, { joints: [] }, names)).toEqual([]);
    expect(printGroupsOf(parts.slice(0, 2), copied, listing, { joints: [joint('Box', 'Lid', true)] }, names)).toEqual([]);
    expect(printGroupsOf(parts.slice(0, 2), [{ metadata: mark('a') }, {}], listing, { joints: [joint('Box', 'Lid')] }, names)).toEqual([]);
  });

  it('reads the marks once, only in a design with joints, and says so in the log when they cannot be read', async () => {
    const placed = { components: [{ id: 0, parent: null, bodies: ['Block', 'Plate'] }, { id: 2, parent: 0, bodies: ['Body1'], occurrences: [{ id: 3 }] }, { id: 9, parent: 0, bodies: ['Body2'], occurrences: [{ id: 10 }] }, { id: 16, parent: 0, bodies: ['Holder'], occurrences: [{ id: 17 }] }] };
    const hinge = { joints: [{ id: 20, name: 'Hinge', type: 'revolute', a: 10, b: 17, values: [{ unit: 'deg', value: 0, limits: [0, 180] }] }] };
    const marked = design((command, component) => (command === 'component.list' ? placed : command === 'joint.list' ? hinge : command === 'component.metadata' && (component === 9 || component === 16) ? { metadata: mark('a') } : undefined));
    expect((await marked.structure()).printGroups).toEqual([['Body2', 'Holder']]);
    // One read of the metadata serves the standard parts as well.
    expect(marked.calls['component.metadata']).toBe(3);
    // Without a joint nothing is grouped and the marks are not asked for again.
    const plain = design((command, component) => (command === 'component.list' ? placed : command === 'component.metadata' && (component === 9 || component === 16) ? { metadata: mark('a') } : undefined));
    expect((await plain.structure()).printGroups).toBeUndefined();
    const unread = design((command, _component, call) => (command === 'component.list' ? placed : command === 'joint.list' ? hinge : command === 'component.metadata' && call === 1 ? new Error('timed out') : undefined));
    expect((await unread.structure()).printGroups).toBeUndefined();
    expect(unread.logs).toContain('parts printed together could not be read (timed out); each body is checked on its own bed');
  });
});

describe('standard parts in the mirrored structure (audit S-01, G2 and its review)', () => {
  it('takes the countersunk screws of a screw joint for standard parts, and no body for its name in the design\'s metadata', async () => {
    const { mirror, logs, calls } = design();
    // "Hex nut holder" is no part of the library, and the old list of names in the metadata no longer counts (review 3).
    expect(await mirror()).toEqual(['Body1', 'Body2']);
    expect(logs).toEqual([]);
    // The library is read once per engine, not with every mirror (review 5).
    expect(await mirror()).toEqual(['Body1', 'Body2']);
    expect(calls['parts.library']).toBe(1);
  });

  it('keeps a body printed that is described as a part but is not shaped like it', async () => {
    // Body2 with a plate joined on: the description still says screw, the body is something else.
    const joined = design((command) => (command === 'inspect.measure' ? { bodies: [{ name: 'Body1', ...SCREW }, { name: 'Body2', ...LID }] } : undefined));
    expect(await joined.mirror()).toEqual(['Body1']);
    expect(joined.logs).toHaveLength(1);
    expect(joined.logs[0]).toContain('body "Body2" is described as "Countersunk socket screw M3x10" but is not that part');
    // Only the screw's faces were asked for one by one: the lid's count already differs.
    expect(joined.calls.face).toBe(11);

    // Volume, area and counts of the screw, but one face of another size (second review, point 3): the 14th face asked for is Body2's third.
    const twin = design((command, _component, call) => (command === 'face' && call === 14 ? { items: [{ type: 'face', area_mm2: 6.5, perimeter_mm: 11 }] } : undefined));
    expect(await twin.mirror()).toEqual(['Body1']);
    expect(twin.logs[0]).toContain('body "Body2" is described as "Countersunk socket screw M3x10" but is not that part');

    const unread = design((command, _component, call) => (command === 'face' && call === 14 ? { failed: 'no face 2' } : undefined));
    expect(await unread.mirror()).toEqual([]);
    expect(unread.logs).toEqual(['standard parts could not be told from printed bodies (inspect.measure failed: no face 2); every body counts as printed']);
  });

  it('says so in the log when parts.library fails or is empty, and reads it again with the next mirror (review 5)', async () => {
    // Mirror by mirror: the batch fails, the request is rejected, no results come back, the library is empty; then it is there.
    const failures = [{ failed: 'unknown command `parts.library`' }, new Error('timed out'), 'no results', { families: [] }];
    const { mirror, logs, calls } = design((command, _component, call) => (command === 'parts.library' ? failures[call - 1] : undefined));
    for (let n = 0; n < failures.length; n += 1) expect(await mirror()).toEqual([]);
    expect(logs).toEqual([
      'standard parts cannot be told from printed bodies: parts.library failed (unknown command `parts.library`); every body counts as printed',
      'standard parts cannot be told from printed bodies: parts.library failed (timed out); every body counts as printed',
      'standard parts cannot be told from printed bodies: parts.library lists no families; every body counts as printed',
      'standard parts cannot be told from printed bodies: parts.library lists no families; every body counts as printed',
    ]);
    expect(await mirror()).toEqual(['Body1', 'Body2']);
    expect(calls['parts.library']).toBe(5);
  });

  it('leaves nothing unchecked when parts.library fails, so an export is not held up by it (last review, 3)', async () => {
    const listing = { components: [{ id: 0, parent: null, bodies: ['Block'] }, { id: 2, parent: 0, bodies: ['Body1'] }] };
    const none = { bought: [], pending: [], unchecked: [], unverified: [] };
    const asked: string[] = [];
    for (const answer of [() => Promise.resolve({ completed: 0, results: [], failed: { index: 0, command: 'parts.library', error: 'unknown command' } }), () => Promise.reject(new Error('timed out'))]) {
      const client: ControlRequester = {
        request: <T,>(_method: string, params?: Record<string, unknown>): Promise<T> => {
          asked.push(...((params?.commands ?? []) as { command: string }[]).map((step) => step.command));
          return answer() as Promise<T>;
        },
      };
      expect(await boughtParts(client, listing, { log: () => undefined, references: () => new Map() })).toEqual(none);
    }
    // Nothing else is asked of an engine without a library.
    expect(asked).toEqual(['parts.library', 'parts.library']);
  });

  it('counts every body as printed, with a line in the log, when a component cannot be read, measured or held against SolidCraft\'s part', async () => {
    const unread = design((command, component) => (command === 'component.metadata' && component === 9 ? { failed: 'no component `9`' } : undefined));
    expect(await unread.mirror()).toEqual([]);
    expect(unread.logs).toEqual(['standard parts could not be told from printed bodies (component.metadata failed: no component `9`); every body counts as printed']);

    const unmeasured = design((command) => (command === 'inspect.measure' ? { failed: 'no body `Body2`' } : undefined));
    expect(await unmeasured.mirror()).toEqual([]);
    expect(unmeasured.logs).toEqual(['standard parts could not be told from printed bodies (inspect.measure failed: no body `Body2`); every body counts as printed']);

    // solidcraft-cli is missing: nothing to hold the bodies against.
    const unbuilt = design();
    expect(await unbuilt.mirror({ ...unbuilt.checks, references: () => Promise.reject(new Error('SolidCraft is installed without solidcraft-cli')) })).toEqual([]);
    expect(unbuilt.logs).toEqual(['standard parts could not be told from printed bodies (SolidCraft is installed without solidcraft-cli); every body counts as printed']);

    // SolidCraft built the description as something else (or not at all): no reference for it.
    const unknown = design();
    expect(await unknown.mirror({ ...unknown.checks, references: () => new Map() })).toEqual([]);
    expect(unknown.logs).toHaveLength(2);
  });

  it('does not wait for a part SolidCraft is still building: its body counts as printed until the mirror after', async () => {
    const { structure, logs, checks } = design();
    let built = false;
    const references: PartChecks['references'] = (parts) => new Map(parts.map((part) => [part.description, built ? SCREW_REFERENCE : { building: true as const }]));
    // Neither standard parts nor printed for this moment: the print check leaves the bodies in `pendingParts` out (third review, c).
    expect(await structure({ ...checks, references })).toMatchObject({ standardParts: [], pendingParts: ['Body1', 'Body2'] });
    expect(logs).toEqual([
      'body "Body1" is described as "Countersunk socket screw M3x10", which SolidCraft is building to hold it against: it is neither printed nor bought until then',
      'body "Body2" is described as "Countersunk socket screw M3x10", which SolidCraft is building to hold it against: it is neither printed nor bought until then',
    ]);
    built = true;
    const after = await structure({ ...checks, references });
    expect(after.standardParts).toEqual(['Body1', 'Body2']);
    expect(after.pendingParts).toBeUndefined();
    // A part that could not be built, or that SolidCraft refuses, is printed again and checked: no body stays out for good.
    for (const state of [{ failed: 'no answer within 22 s' }, { refused: '`length` must be 0…2000 mm' }]) {
      const lost = await structure({ ...checks, references: (parts) => new Map(parts.map((part) => [part.description, state])) });
      expect(lost.standardParts).toEqual([]);
      expect(lost.pendingParts).toBeUndefined();
    }
  });
});

describe('mirroring once more when a reference was built', () => {
  const revision = (n: number) => ({ documentId: 'd', revision: n, designName: '', bodies: [], sketches: [], structure: { features: [], marker: null, bodies: [], sketches: [] }, history: { undo: 0, redo: 0 }, mirrorMs: 1 });

  it('mirrors the delivered revision again, once however often it is asked, and once more after a mirror that was running', async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    const scheduler = new MirrorScheduler(
      async () => {
        calls += 1;
        await new Promise<void>((done) => {
          release = done;
        });
        return revision(1);
      },
      { started: () => undefined, delivered: () => undefined, failed: () => undefined, idle: () => undefined },
    );
    const finish = async (expected: number) => {
      await vi.waitFor(() => expect(calls).toBe(expected));
      (release as unknown as () => void)();
      await new Promise((done) => setTimeout(done, 20));
    };
    // Nothing mirrored yet: nothing to mirror again.
    scheduler.refresh();
    expect(calls).toBe(0);
    scheduler.request({ documentId: 'd', revision: 1 });
    await finish(1);
    // The same revision asked for again is not mirrored; a built reference mirrors it once more.
    scheduler.request({ documentId: 'd', revision: 1 });
    expect(calls).toBe(1);
    scheduler.refresh();
    await vi.waitFor(() => expect(calls).toBe(2));
    // While that mirror runs, three more references arrive: one mirror follows, not three.
    scheduler.refresh();
    scheduler.refresh();
    scheduler.refresh();
    await finish(2);
    await finish(3);
    expect(calls).toBe(3);
  });

  it('does not lose a reference built while a mirror fails, and mirrors nothing again after a reset (third review, e)', async () => {
    let calls = 0;
    const failures: string[] = [];
    const steps: ((fail: boolean) => void)[] = [];
    const scheduler = new MirrorScheduler(
      async () => {
        calls += 1;
        const fail = await new Promise<boolean>((done) => steps.push(done));
        if (fail) throw new Error('engine busy');
        return revision(1);
      },
      { started: () => undefined, delivered: () => undefined, failed: (error) => failures.push(error.message), idle: () => undefined },
    );
    const end = async (expected: number, fail: boolean) => {
      await vi.waitFor(() => expect(calls).toBe(expected));
      steps.shift()?.(fail);
      await new Promise((done) => setTimeout(done, 20));
    };
    scheduler.request({ documentId: 'd', revision: 1 });
    await vi.waitFor(() => expect(calls).toBe(1));
    // The reference arrives while the first mirror runs; that mirror fails.
    scheduler.refresh();
    await end(1, true);
    expect(failures).toEqual(['engine busy']);
    // It is tried once more for the reference, and only once when that fails too.
    await end(2, true);
    expect(calls).toBe(2);
    scheduler.request({ documentId: 'd', revision: 2 });
    await end(3, false);
    // After a reset (another design) an old reference mirrors nothing.
    scheduler.reset();
    scheduler.refresh();
    await new Promise((done) => setTimeout(done, 20));
    expect(calls).toBe(3);
  });

  it('hands a body that waited for its part back to the print check when the mirror after fails, and tries that mirror a few times only (last review, 1 and 6)', async () => {
    const pending = { ...revision(1), structure: { ...revision(1).structure, pendingParts: ['Nut'] } };
    const outcomes: (ReturnType<typeof revision> | Error)[] = [pending];
    const delivered: (string[] | undefined)[] = [];
    const timers: (() => void)[] = [];
    let called = 0;
    let calls = 0;
    const scheduler = new MirrorScheduler(
      () => {
        calls += 1;
        const outcome = outcomes.shift() ?? new Error('engine busy');
        return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
      },
      { started: () => undefined, delivered: (mirrored) => delivered.push(mirrored.structure.pendingParts), failed: () => undefined, idle: () => undefined },
      (callback) => {
        timers.push(callback);
        return () => (called += 1);
      },
    );
    const settle = () => new Promise((done) => setTimeout(done, 20));
    scheduler.request({ documentId: 'd', revision: 1 });
    await settle();
    expect(delivered).toEqual([['Nut']]);
    // The part is built, the mirror that would say what the body is fails: the body is checked as a printed one.
    scheduler.refresh();
    await settle();
    expect(delivered).toEqual([['Nut'], undefined]);
    // That mirror is still owed: it is tried three times, then no timer is left.
    for (let n = 0; n < 3; n += 1) {
      expect(timers).toHaveLength(n + 1);
      timers[n]?.();
      await settle();
    }
    expect(timers).toHaveLength(3);
    expect(calls).toBe(5);
    expect(delivered).toHaveLength(2);
    // A mirror that works ends the debt; a reset calls a waiting timer off.
    outcomes.push(pending);
    scheduler.refresh();
    await settle();
    scheduler.refresh();
    await settle();
    expect(delivered).toEqual([['Nut'], undefined, ['Nut'], undefined]);
    expect(timers).toHaveLength(4);
    scheduler.reset();
    expect(called).toBe(1);
  });
});
