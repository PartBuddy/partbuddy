import { useEffect, useState } from 'react';

import { parseTagged3mf, type FaceTable } from '@partbuddy/geometry';
import tableUrl from '@partbuddy/geometry/fixtures/cable-clip.faces.json?url';
import meshUrl from '@partbuddy/geometry/fixtures/cable-clip.3mf?url';
import { buildViewerModel, type ViewerModel } from './model';

export type ModelState =
  | { status: 'loading' }
  | { status: 'ready'; model: ViewerModel }
  | { status: 'error'; message: string };

/** Loads the mirrored revision. In the product the main process delivers both files per step. */
export function useModel(): ModelState {
  const [state, setState] = useState<ModelState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [meshResponse, tableResponse] = await Promise.all([
          fetch(meshUrl, { signal: controller.signal }),
          fetch(tableUrl, { signal: controller.signal }),
        ]);
        for (const response of [meshResponse, tableResponse]) {
          if (!response.ok) throw new Error(`${response.url}: HTTP ${response.status}`);
        }
        const mesh = parseTagged3mf(new Uint8Array(await meshResponse.arrayBuffer()));
        const table = (await tableResponse.json()) as FaceTable;
        setState({ status: 'ready', model: buildViewerModel(mesh, table) });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
    void load();
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}
