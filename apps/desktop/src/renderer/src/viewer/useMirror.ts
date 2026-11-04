import { buildViewerModel, diffFaces, disposeViewerModel, type ViewerModel } from '@partbuddy/geometry';
import { Box3, Vector3 } from 'three';
import { useEffect } from 'react';

import type { MirrorRevision } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyChanges, type BodyModel, type LiveChanges } from '../state/store';
import type { ParseRequest, ParseResponse } from '../workers/protocol';

let changeSerial = 0;

/** Bounds of the given faces of one body, from the render vertices. */
function facesBox(model: ViewerModel, faces: Set<number>, box: Box3): void {
  const position = model.geometry.getAttribute('position');
  const point = new Vector3();
  for (let v = 0; v < model.vertexFaces.length; v += 1) {
    if (faces.has(model.vertexFaces[v] ?? -1)) box.expandByPoint(point.fromBufferAttribute(position, v));
  }
}

/**
 * Faces that changed against the previous revision of the same design (matched by body and face
 * name, ADR 0004). The first revision of a design highlights nothing.
 */
function liveChanges(previous: BodyModel[], next: BodyModel[]): LiveChanges | null {
  const bodies: BodyChanges[] = [];
  const box = new Box3();
  next.forEach((body, index) => {
    const before = previous.find((candidate) => candidate.name === body.name);
    const diff = diffFaces(before?.model.table ?? null, body.model.table);
    const faces = [...diff.added, ...diff.changed];
    if (faces.length === 0) return;
    bodies.push({ body: index, faces });
    facesBox(body.model, new Set(faces), box);
  });
  if (bodies.length === 0) return null;
  changeSerial += 1;
  return {
    bodies,
    count: bodies.reduce((sum, body) => sum + body.faces.length, 0),
    box: box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() },
    serial: changeSerial,
  };
}

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
    let shownDocument: string | null = null;
    const postedAt = new Map<number, number>();
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
      const sameDesign = shownDocument === pending.documentId && previous.length > 0;
      shown = bodies;
      shownDocument = pending.documentId;
      useStudio.getState().showRevision(
        { status: 'ready', documentId: pending.documentId, revision: pending.revision, designName: pending.designName, bodies },
        sameDesign ? liveChanges(previous, bodies) : null,
        { mirrorMs: pending.mirrorMs, parseMs: Math.round(performance.now() - (postedAt.get(response.id) ?? performance.now())) },
      );
      for (const body of previous) disposeViewerModel(body.model);
    };

    const requests = new Map<number, MirrorRevision>();
    const show = (revision: MirrorRevision) => {
      const id = nextId;
      nextId += 1;
      newest = id;
      requests.set(id, revision);
      postedAt.clear();
      postedAt.set(id, performance.now());
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
