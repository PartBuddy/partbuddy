import { surfaceKind } from '@partbuddy/geometry';

import type { FaceSelection, ViewState } from '../../../shared/contract';
import type { FacePick, LiveChanges, ModelState } from '../state/store';

/** The selected face as the assistant gets it: names and a few numbers, no picture. */
export function faceSelectionOf(model: ModelState, pick: FacePick | null): FaceSelection | null {
  if (!pick || model.status !== 'ready') return null;
  const body = model.bodies[pick.body];
  const face = body?.model.table.faces[pick.face];
  if (!body || !face) return null;
  const selection: FaceSelection = {
    body: body.name,
    face: face.name,
    surface: surfaceKind(face),
    area: face.area,
    point: pick.point,
    normal: pick.normal,
  };
  if (face.cylinder) selection.radius = face.cylinder.radius;
  return selection;
}

export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

/** What the view shows, for the assistant's `partbuddy_view` tool. */
export function viewStateOf(model: ModelState, pick: FacePick | null, changes: LiveChanges | null, camera: CameraView | null): ViewState {
  const ready = model.status === 'ready';
  return {
    camera,
    selection: faceSelectionOf(model, pick),
    bodies: ready ? model.bodies.map((body) => ({ name: body.name, faces: body.model.table.faces.length })) : [],
    sketches: ready ? model.sketches.map((sketch) => ({ name: sketch.name, active: sketch.active })) : [],
    changes: changes ? { faces: changes.count, sketchCurves: changes.sketchCurves } : null,
  };
}
