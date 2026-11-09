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
