import type { DesignAction } from '../../../shared/contract';
import type { BodyModel, Pick } from '../state/store';

export type ActionKind = DesignAction['action'];

/** Planar faces of the selection, for actions that need one. */
function isPlane(bodies: BodyModel[], pick: Pick): boolean {
  return pick.kind === 'face' && bodies[pick.body]?.model.table.faces[pick.face]?.planeNormal !== undefined;
}

/** The actions that fit everything selected: edges round or chamfer, faces extrude, drill or shell. */
export function actionsFor(bodies: BodyModel[], picks: Pick[]): ActionKind[] {
  if (picks.length === 0 || picks.some((pick) => pick.body !== picks[0]?.body)) return [];
  if (picks.every((pick) => pick.kind === 'edge')) return ['fillet', 'chamfer'];
  if (picks.every((pick) => pick.kind === 'face')) {
    if (picks.length === 1 && isPlane(bodies, picks[0] as Pick)) return ['extrude', 'hole', 'shell'];
    return ['shell'];
  }
  return [];
}

