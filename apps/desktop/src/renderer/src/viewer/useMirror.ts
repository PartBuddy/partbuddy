import { buildViewerModel, disposeViewerModel } from '@partbuddy/geometry';
import { useEffect } from 'react';

import type { MirrorRevision } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyModel } from '../state/store';
import type { ParseRequest, ParseResponse } from '../workers/protocol';

/**
 * Follows the SolidCraft connection and the mirrored revisions from the main process: each
 * revision is parsed in a worker and swapped into the view in one step. The previous model
 * stays visible until the next one is ready (ADR 0004).
 */
export function useMirror(): void {
  useEffect(() => {
    const api = platform();
    const worker = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), { type: 'module' });
    let nextId = 1;
    let newest = 0;
    let shown: BodyModel[] = [];
    let disposed = false;

    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      const response = event.data;
      if (disposed || response.id !== newest) return;
      const pending = requests.get(response.id);
      requests.clear();
      if (!pending) return;
      if (!response.ok) {
        useStudio.getState().setModel({ status: 'error', message: response.message });
        return;
      }
      const bodies = response.bodies.map((body) => ({ name: body.name, model: buildViewerModel(body.render, body.faces) }));
      const previous = shown;
      shown = bodies;
      useStudio.getState().setModel({
        status: 'ready',
        documentId: pending.documentId,
        revision: pending.revision,
        designName: pending.designName,
        bodies,
      });
      for (const body of previous) disposeViewerModel(body.model);
    };

    const requests = new Map<number, MirrorRevision>();
    const show = (revision: MirrorRevision) => {
      const id = nextId;
      nextId += 1;
      newest = id;
      requests.set(id, revision);
      const request: ParseRequest = { id, bodies: revision.bodies };
      worker.postMessage(request);
    };

    const offStatus = api.solidcraft.onStatus((status) => {
      useStudio.getState().setConnection(status);
    });
    const offRevision = api.mirror.onRevision(show);
    void api.solidcraft.status().then((status) => {
      useStudio.getState().setConnection(status);
    });
    void api.mirror.current().then((revision) => {
      if (revision && newest === 0) show(revision);
    });

    return () => {
      disposed = true;
      offStatus();
      offRevision();
      worker.terminate();
      for (const body of shown) disposeViewerModel(body.model);
    };
  }, []);
}
