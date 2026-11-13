import { LYING_HOLE, OVERHANG_LIMITS, thinnestLine } from '@partbuddy/geometry';

import { DEFAULT_PRINTER } from '../../../shared/blocks';
import type { DesignAction, PartPrint } from '../../../shared/contract';
import { fitSize, lineWidth, snapSize, type FitPrinter } from '../../../shared/designFit';
import type { BodyModel, Pick } from '../state/store';

export type ActionKind = DesignAction['action'];

type Vec3 = [number, number, number];

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

/** What the actions are measured against: the printer and material of the part, or the defaults before they are known. */
export interface ActionPrint {
  printer: FitPrinter;
  /** How far a face may lean from the vertical without support (°). */
  overhang: number;
  /** How much smaller than drawn a hole comes out, on the diameter (mm). */
  holeShrink: number;
  material: string;
}

/** The part's print profile for the actions; before it is known, the blocks' default printer and no hole allowance. */
export function actionPrint(print: PartPrint | null): ActionPrint {
  if (!print) return { printer: DEFAULT_PRINTER, overhang: OVERHANG_LIMITS.support, holeShrink: 0, material: '' };
  return { printer: print.printer, overhang: print.material.overhang, holeShrink: print.material.holeShrink, material: print.material.name };
}

const dot = (a: readonly number[], b: readonly number[]) => (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The direction to the bed for a body, as the print check lays it: the outward normal of its print face when it has a flat
 * one, otherwise −z, standing as designed (packages/geometry printDown).
 */
export function bedDown(body: BodyModel | undefined, printFace: string | undefined): Vec3 {
  const normal = printFace ? body?.model.table.faces.find((face) => face.name === printFace)?.planeNormal : undefined;
  const length = normal ? Math.hypot(...normal) : 0;
  return normal && length > 0 ? [normal[0] / length, normal[1] / length, normal[2] / length] : [0, 0, -1];
}

/**
 * How many of the picked edges are outer edges of a flat face that faces the bed: one that leans more than the material's
 * overhang from the vertical, the bed face itself among them. A fillet there starts flat: it needs support, and on the
 * bed it curls up (printProfiles.ts: "Edges that face down towards the bed: chamfer them at 45°"). Inner edges are left
 * out, as rounding them fills a corner under a ceiling that is no worse for it.
 * shortcut: only flat faces count, a round face facing down (a lying cylinder's underside) does not; read the triangles
 * along the edge if fillets there turn up.
 */
export function downEdges(bodies: BodyModel[], picks: Pick[], down: Vec3, overhang: number): number {
  // A face leans more than the overhang from the vertical when its normal is within 90° − overhang of the bed.
  const facing = Math.sin((overhang * Math.PI) / 180);
  return picks.filter((pick) => {
    if (pick.kind !== 'edge') return false;
    const model = bodies[pick.body]?.model;
    const [a, b] = [model?.edgeFaces[pick.edge * 2], model?.edgeFaces[pick.edge * 2 + 1]].map((index) => (index === undefined ? undefined : model?.table.faces[index]));
    if (!a || !b) return false;
    // Outer edge: each face's other side lies behind the plane of the first; a point on the face that is no point of the edge.
    const behind = (face: typeof a, other: typeof b) => (face.planeNormal ? dot(face.planeNormal, sub(other.point, pick.point)) : 0);
    const convex = behind(a, b) < -1e-6 || behind(b, a) < -1e-6;
    return convex && [a, b].some((face) => face.planeNormal !== undefined && dot(face.planeNormal, down) > facing + 1e-9);
  }).length;
}

/**
 * The size an action's field starts with, for the printer in use (audit D26):
 * - fillet: 1 mm, the smallest radius of the rules (parts under 30 mm), and no less than the nozzle (both own choice, printProfiles.ts);
 * - chamfer: on edges facing the bed two layers (the rules' 45° chamfer of two to three layers, which also takes up the
 *   elephant's foot), elsewhere the rules' 0.5 mm entry chamfer raised to whole layers;
 * - shell: three lines, the rules' shell (two to four lines print as solid wall);
 * - extrude 5 mm and hole 3 mm: own choice, a step and a small screw or pin; the hole is drilled with the allowance.
 */
export function startSize(kind: ActionKind, printer: FitPrinter, facingBed: boolean): number {
  switch (kind) {
    case 'fillet':
      return round3(Math.max(1, printer.nozzle));
    case 'chamfer':
      return snapSize('height', facingBed ? 2 * printer.layer : 0.5, printer);
    case 'shell':
      return snapSize('wall', 3 * lineWidth(printer), printer);
    case 'extrude':
      return 5;
    case 'hole':
      return 3;
  }
}

/** A word on the size typed, said under the field before anything is built; `refuse` keeps it from being built. */
export type ActionNote =
  /** Edges facing the bed would be rounded: a chamfer of `chamfer` mm prints there. */
  | { note: 'downFillet'; count: number; chamfer: number }
  /** The hole is drilled `allowance` wider than typed, as holes of the material print smaller. */
  | { note: 'holeAllowance'; drilled: number; allowance: number; material: string }
  /** A hole lying across the layers, wider than prints round without support. */
  | { note: 'lyingHole'; drilled: number; most: number }
  /** A wall under the narrowest line a slicer lays: it does not print (the print check blocks it). */
  | { note: 'wallNoPrint'; least: number; better: number; refuse: true }
  /** A wall under two lines: it prints, poorly. */
  | { note: 'wallThin'; least: number; better: number }
  /** A wall that is no whole number of lines. */
  | { note: 'wallLines'; line: number; better: number };

export interface ActionPlan {
  /** The size sent to SolidCraft: the hole's drilled diameter, otherwise the size typed. */
  size: number;
  notes: ActionNote[];
}

/**
 * The action as PartBuddy's rules build it (audit D25, S-15, S-16): a hole gets the material's allowance on its diameter
 * and a word when it lies across the layers too wide to print round; a fillet on edges facing the bed gets the chamfer
 * offered; a shell's wall is held against the narrowest line, two lines and the line grid, as fitSize does for the
 * assistant. Sizes the user types stay as typed (printProfiles.ts: "Sizes the user names are fixed"); only a wall that
 * does not print is refused, as the print check would block it.
 */
export function actionPlan(kind: ActionKind, size: number, bodies: BodyModel[], picks: Pick[], down: Vec3, print: ActionPrint): ActionPlan {
  const { printer } = print;
  switch (kind) {
    case 'fillet': {
      const count = downEdges(bodies, picks, down, print.overhang);
      return { size, notes: count > 0 ? [{ note: 'downFillet', count, chamfer: startSize('chamfer', printer, true) }] : [] };
    }
    case 'hole': {
      const drilled = round3(size + print.holeShrink);
      const notes: ActionNote[] = print.holeShrink > 0 ? [{ note: 'holeAllowance', drilled, allowance: print.holeShrink, material: print.material }] : [];
      const [pick] = picks;
      const axis = pick?.kind === 'face' ? bodies[pick.body]?.model.table.faces[pick.face]?.planeNormal : undefined;
      // The hole's wall leans as far from the vertical as its axis does; past the overhang its roof needs support.
      const lying = axis !== undefined && Math.abs(dot(axis, down)) / Math.hypot(...axis) < Math.cos((print.overhang * Math.PI) / 180) - 1e-9;
      if (lying && drilled > LYING_HOLE) notes.push({ note: 'lyingHole', drilled, most: LYING_HOLE });
      return { size: drilled, notes };
    }
    case 'shell': {
      const better = snapSize('wall', size, printer);
      const least = thinnestLine(printer.nozzle);
      if (size < least - 1e-9) return { size, notes: [{ note: 'wallNoPrint', least, better, refuse: true }] };
      if (!fitSize('wall', size, 'user', printer).warning) return { size, notes: [] };
      const two = snapSize('wall', 0, printer);
      return { size, notes: [size < two - 1e-6 ? { note: 'wallThin', least: two, better } : { note: 'wallLines', line: lineWidth(printer), better }] };
    }
    default:
      return { size, notes: [] };
  }
}
