import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { mirrorActiveDesign, type ControlRequester } from '../src/main/solidcraft/mirror';

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

describe('standard parts in the mirrored structure (audit S-01, G2)', () => {
  it('takes the countersunk screws of a screw joint for standard parts, by the library SolidCraft answers with', async () => {
    // As SolidCraft 0.40.1 answers after partbuddy_mechanism {kind: screw, head: countersunk}: two screws, each a component; a bracket of the user's.
    const descriptions: Record<number, string | null> = { 2: 'Countersunk socket screw M3x10', 9: 'Countersunk socket screw M3x10', 16: 'Hex nut holder' };
    const answers: Record<string, unknown> = {
      'document.revision': { document_id: 'doc', revision: 1 },
      // Hidden bodies are not exported, so the fake needs no mesh.
      'document.inspect': { name: 'Part', bodies: ['Block', 'Plate', 'Body1', 'Body2', 'Holder'].map((name) => ({ name, visible: false })), sketches: [] },
      'component.list': {
        components: [
          { id: 0, parent: null, bodies: ['Block', 'Plate'] },
          { id: 2, parent: 0, bodies: ['Body1'] },
          { id: 9, parent: 0, bodies: ['Body2'] },
          { id: 16, parent: 0, bodies: ['Holder'] },
        ],
      },
      'parts.library': { families: [{ family: 'countersunk_socket_screw', name: 'Countersunk socket screw', sizes: [{ size: 'M3' }] }, { family: 'hex_nut', name: 'Hex nut', sizes: [{ size: 'M3' }] }] },
    };
    const client: ControlRequester = {
      request: <T,>(_method: string, params?: Record<string, unknown>): Promise<T> => {
        const commands = (params?.commands ?? []) as { command: string; params: { component?: number } }[];
        return Promise.resolve({ results: commands.map((step) => (step.command === 'component.metadata' ? { description: descriptions[step.params.component ?? -1] } : (answers[step.command] ?? {}))) } as T);
      },
    };
    const cache = mkdtempSync(join(tmpdir(), 'partbuddy-mirror-'));
    try {
      expect((await mirrorActiveDesign(client, cache)).structure.standardParts).toEqual(['Body1', 'Body2']);
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});
