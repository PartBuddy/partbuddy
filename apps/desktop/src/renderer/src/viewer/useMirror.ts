import { buildViewerModel, diffFaces, disposeViewerModel, type ViewerModel } from '@partbuddy/geometry';
import { Box3, Vector3 } from 'three';
import { useEffect } from 'react';

import type { MirroredSketch, MirrorRevision } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyChanges, type BodyModel, type LiveChanges, type SketchChanges } from '../state/store';
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

/** True when the curve's segments differ from the same curve in the previous revision. */
function curveMoved(before: MirroredSketch | undefined, after: MirroredSketch, curve: MirroredSketch['curves'][number]): boolean {
  const old = before?.curves.find((candidate) => candidate.id === curve.id);
  if (!before || !old || old.count !== curve.count) return true;
  const a = before.positions.subarray(old.first * 6, (old.first + old.count) * 6);
  const b = after.positions.subarray(curve.first * 6, (curve.first + curve.count) * 6);
  return a.some((value, i) => value !== b[i]);
}

function sketchChanges(previous: MirroredSketch[], next: MirroredSketch[], box: Box3): SketchChanges[] {
  const changes: SketchChanges[] = [];
  const point = new Vector3();
  for (const sketch of next) {
    const before = previous.find((candidate) => candidate.id === sketch.id);
    const curves = sketch.curves.filter((curve) => curveMoved(before, sketch, curve));
    if (curves.length === 0) continue;
    changes.push({ sketch: sketch.id, curves: curves.map((curve) => curve.id) });
    for (const curve of curves) {
      for (let i = curve.first * 6; i < (curve.first + curve.count) * 6; i += 3) {
        box.expandByPoint(point.fromArray(sketch.positions, i));
      }
    }
  }
  return changes;
}

interface Shown {
  bodies: BodyModel[];
  sketches: MirroredSketch[];
}

/**
 * Faces and sketch curves that changed against the previous revision of the same design (faces
 * matched by body and face name, ADR 0004; curves by sketch and curve id). The first revision
 * PartBuddy shows of a design highlights nothing.
 */
function liveChanges(previous: Shown, next: Shown): LiveChanges | null {
  const bodies: BodyChanges[] = [];
  const box = new Box3();
  next.bodies.forEach((body, index) => {
    const before = previous.bodies.find((candidate) => candidate.name === body.name);
    const diff = diffFaces(before?.model.table ?? null, body.model.table);
    const faces = [...diff.added, ...diff.changed];
    if (faces.length === 0) return;
    bodies.push({ body: index, faces });
    facesBox(body.model, new Set(faces), box);
  });
  const sketches = sketchChanges(previous.sketches, next.sketches, box);
  if (bodies.length === 0 && sketches.length === 0) return null;
  changeSerial += 1;
  return {
    bodies,
    count: bodies.reduce((sum, body) => sum + body.faces.length, 0),
    sketches,
    sketchCurves: sketches.reduce((sum, sketch) => sum + sketch.curves.length, 0),
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
    let shown: Shown = { bodies: [], sketches: [] };
    let shownDocument: string | null = null;
    // The bodies before the latest change, kept for before/after until the next revision.
    let kept: Shown['bodies'] = [];
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
      const { sketches } = pending;
      const previous = shown;
      const sameDesign = shownDocument === pending.documentId;
      shown = { bodies, sketches };
      shownDocument = pending.documentId;
      const changes = sameDesign ? liveChanges(previous, shown) : null;
      // Only a change to the geometry of the same design has a "before" worth comparing.
      const keep = changes !== null && changes.count > 0 && previous.bodies.length > 0;
      useStudio.getState().showRevision(
        { status: 'ready', documentId: pending.documentId, revision: pending.revision, designName: pending.designName, bodies, sketches, structure: pending.structure },
        changes,
        { mirrorMs: pending.mirrorMs, parseMs: Math.round(performance.now() - (postedAt.get(response.id) ?? performance.now())) },
        keep ? previous.bodies : null,
      );
      for (const body of kept) disposeViewerModel(body.model);
      kept = keep ? previous.bodies : [];
      if (!keep) for (const body of previous.bodies) disposeViewerModel(body.model);
    };

    const requests = new Map<number, MirrorRevision>();
    const show = (revision: MirrorRevision) => {
      useStudio.getState().setHistory(revision.history);
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
      for (const body of shown.bodies) disposeViewerModel(body.model);
      for (const body of kept) disposeViewerModel(body.model);
    };
  }, []);
}
