import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { mirrorActiveDesign, type ControlRequester, type PartChecks } from '../src/main/solidcraft/mirror';
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
const SCREW_REFERENCE: PartReference = { shape: { volume: SCREW.volume_mm3, area: SCREW.area_mm2, faces: 11, edges: 23, vertices: 15 }, partNumber: 'ISO 10642 M3x10' };

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
      const commands = (params?.commands ?? []) as { command: string; params: { component?: number } }[];
      const results: unknown[] = [];
      for (const step of commands) {
        calls[step.command] = (calls[step.command] ?? 0) + 1;
        const given = answer(step.command, step.params.component, calls[step.command] ?? 0);
        if (given instanceof Error) return Promise.reject(given);
        if (given === 'no results') return Promise.resolve({ completed: 0, results: [] } as T);
        if (typeof given === 'object' && given !== null && 'failed' in given) return Promise.resolve({ completed: results.length, results, failed: { index: results.length, command: step.command, error: String(given.failed) } } as T);
        results.push(given ?? (step.command === 'component.metadata' ? { description: descriptions[step.params.component ?? -1] ?? null } : (answers[step.command] ?? {})));
      }
      return Promise.resolve({ completed: results.length, results } as T);
    },
  };
  const checks: PartChecks = { log: (message) => void logs.push(message), references: (parts) => Promise.resolve(new Map(parts.map((part) => [part.description, SCREW_REFERENCE]))) };
  const mirror = async (given: PartChecks = checks) => {
    const cache = mkdtempSync(join(tmpdir(), 'partbuddy-mirror-'));
    try {
      return (await mirrorActiveDesign(client, cache, given)).structure.standardParts;
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  };
  return { mirror, logs, calls, checks };
}

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
    const { mirror, logs } = design((command) => (command === 'inspect.measure' ? { bodies: [{ name: 'Body1', ...SCREW }, { name: 'Body2', ...LID }] } : undefined));
    expect(await mirror()).toEqual(['Body1']);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('body "Body2" is described as "Countersunk socket screw M3x10" but is not that part');
  });

  it('says so in the log when parts.library fails or is empty, and reads it again with the next mirror (review 5)', async () => {
    // Mirror by mirror: the batch fails, the request is rejected, no results come back, the library is empty; then it is there.
    const failures = [{ failed: 'unknown command `parts.library`' }, new Error('timed out'), 'no results', { families: [] }];
    const { mirror, logs, calls } = design((command, _component, call) => (command === 'parts.library' ? failures[call - 1] : undefined));
    for (let n = 0; n < failures.length; n += 1) expect(await mirror()).toEqual([]);
    expect(logs).toEqual([
      'standard parts cannot be told from printed bodies: parts.library failed (unknown command `parts.library`); every body counts as printed',
      'standard parts could not be told from printed bodies (timed out); every body counts as printed',
      'standard parts cannot be told from printed bodies: parts.library lists no families; every body counts as printed',
      'standard parts cannot be told from printed bodies: parts.library lists no families; every body counts as printed',
    ]);
    expect(await mirror()).toEqual(['Body1', 'Body2']);
    expect(calls['parts.library']).toBe(5);
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
    expect(await unknown.mirror({ ...unknown.checks, references: () => Promise.resolve(new Map()) })).toEqual([]);
    expect(unknown.logs).toHaveLength(2);
  });
});
