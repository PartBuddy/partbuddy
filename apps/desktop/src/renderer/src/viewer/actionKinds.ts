import { LYING_HOLE, minimumFloor, minimumWall, OVERHANG_LIMITS, thinnestLine } from '@partbuddy/geometry';

import { DEFAULT_PRINTER } from '../../../shared/blocks';
import type { DesignAction, PartPrint } from '../../../shared/contract';
import { lineWidth, snapSize, type FitPrinter } from '../../../shared/designFit';
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

/** How a body lies on the bed: the direction to the bed, and how far along it the bed lies (the piece's lowest point). */
export interface Bed {
  down: Vec3;
  level: number;
}

/**
 * How a body lies as the print check lays it (packages/geometry `laidBodies`): a body printed in one piece with others
 * (`printGroups`) lies with them, on the flat print face of the first of them that has one (`pieceOf`, `printDown`),
 * otherwise on −z, standing as designed; the bed is the piece's lowest point that way.
 */
export function bedOf(bodies: BodyModel[], index: number, printFaces: Readonly<Record<string, string>>, groups: readonly (readonly string[])[] = []): Bed {
  const name = bodies[index]?.name;
  const group = name === undefined ? undefined : groups.find((members) => members.includes(name));
  const piece = group ? bodies.filter((body) => group.includes(body.name)) : bodies.slice(index, index + 1);
  let down: Vec3 = [0, 0, -1];
  for (const body of piece) {
    const face = printFaces[body.name];
    const normal = face ? body.model.table.faces.find((entry) => entry.name === face)?.planeNormal : undefined;
    const length = normal ? Math.hypot(...normal) : 0;
    if (normal && length > 0) {
      down = [normal[0] / length, normal[1] / length, normal[2] / length];
      break;
    }
  }
  let level = -Infinity;
  for (const { model } of piece) for (let k = 0; k + 2 < model.vertices.length; k += 3) level = Math.max(level, dot(down, [model.vertices[k] ?? 0, model.vertices[k + 1] ?? 0, model.vertices[k + 2] ?? 0]));
  return { down, level };
}

/** How far under a limit a size may be and still meet it: the print check's EPSILON (printCheck.ts). */
const CHECK_SLACK = 1e-3;

/** The shelled body keeps a flat face square to the bed that is not picked (the face a shell removes): a floor or a lid. */
function keepsFlat(bodies: BodyModel[], picks: Pick[], down: Vec3): boolean {
  const removed = new Set(picks.flatMap((pick) => (pick.kind === 'face' ? [`${String(pick.body)}:${String(pick.face)}`] : [])));
  const shelled = new Set(picks.map((pick) => pick.body));
  return [...shelled].some((body) =>
    (bodies[body]?.model.table.faces ?? []).some((face, index) => !removed.has(`${String(body)}:${String(index)}`) && face.planeNormal !== undefined && Math.abs(dot(face.planeNormal, down)) > 1 - 1e-6),
  );
}

/** The lean of the chamfer SolidCraft cuts from one distance (`solid.chamfer {distance}`), from the vertical. */
const CHAMFER_ANGLE = 45;

/** A flat face lies on the bed: it faces it straight and reaches its level (within 0.01 mm). */
const onBed = (face: { point: readonly number[]; planeNormal?: readonly number[] | undefined }, bed: Bed) =>
  face.planeNormal !== undefined && dot(face.planeNormal, bed.down) > 1 - 1e-6 && dot(face.point, bed.down) > bed.level - 0.01;

/**
 * The picked edges that are outer edges of a flat face facing down: one that leans more than the material's overhang from
 * the vertical, a ceiling over the bed and the bed face itself among them (`count`), and of those the edges of a face
 * lying on the bed (`onBed`). A fillet there starts flat, so it needs support, and on the bed it curls up
 * (printProfiles.ts: "Edges that face down towards the bed: chamfer them at 45°"). Inner edges are left out, as rounding
 * them fills a corner under a ceiling that is no worse for it.
 * shortcut: only flat faces count, a round face facing down (a lying cylinder's underside) does not; read the triangles
 * along the edge if fillets there turn up.
 */
export function downEdges(bodies: BodyModel[], picks: Pick[], bed: Bed, overhang: number): { count: number; onBed: number } {
  // A face leans more than the overhang from the vertical when its normal is within 90° − overhang of the bed.
  const facing = Math.sin((overhang * Math.PI) / 180);
  const found = picks.flatMap((pick) => {
    if (pick.kind !== 'edge') return [];
    const model = bodies[pick.body]?.model;
    const [a, b] = [model?.edgeFaces[pick.edge * 2], model?.edgeFaces[pick.edge * 2 + 1]].map((index) => (index === undefined ? undefined : model?.table.faces[index]));
    if (!a || !b) return [];
    // Outer edge: each face's other side lies behind the plane of the first; a point on the face that is no point of the edge.
    const behind = (face: typeof a, other: typeof b) => (face.planeNormal ? dot(face.planeNormal, sub(other.point, pick.point)) : 0);
    const convex = behind(a, b) < -1e-6 || behind(b, a) < -1e-6;
    const down = [a, b].filter((face) => face.planeNormal !== undefined && dot(face.planeNormal, bed.down) > facing + 1e-9);
    return convex && down.length > 0 ? [down.some((face) => onBed(face, bed))] : [];
  });
  return { count: found.length, onBed: found.filter(Boolean).length };
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
  /**
   * Edges facing down would be rounded, `onBed` of them on the bed; a 45° chamfer of `chamfer` mm is offered, which prints
   * without support only where the material takes 45° (`overhang`).
   */
  | { note: 'downFillet'; count: number; onBed: number; chamfer: number; free: boolean; overhang: number; material: string }
  /** The hole is drilled `allowance` wider than typed, as holes of the material print smaller. */
  | { note: 'holeAllowance'; drilled: number; allowance: number; material: string }
  /** A hole lying across the layers, wider than prints round without support. */
  | { note: 'lyingHole'; drilled: number; most: number }
  /** A wall under the narrowest line a slicer lays: it does not print (the print check blocks it). */
  | { note: 'wallNoPrint'; least: number; better: number; refuse: true }
  /** A wall under two lines: it prints, poorly. */
  | { note: 'wallThin'; least: number; better: number }
  /** A wall that is no whole number of lines. */
  | { note: 'wallLines'; line: number; better: number }
  /** The shell's flat floor or lid, as thick as its walls, under the print check's floor of `layers` layers. */
  | { note: 'floorThin'; least: number; layers: number; better: number };

export interface ActionPlan {
  /** The size sent to SolidCraft: the hole's drilled diameter, otherwise the size typed. */
  size: number;
  notes: ActionNote[];
}

/**
 * The action as PartBuddy's rules build it (audit D25, S-15, S-16): a hole gets the material's allowance on its diameter
 * and a word when it lies across the layers too wide to print round; a fillet on edges facing the bed gets the chamfer
 * offered; a shell's wall is held against the narrowest line (thinnestLine), two lines (minimumWall) and the line grid
 * (snapSize), as the print check and the assistant's sizes are. Sizes the user types stay as typed (printProfiles.ts: "Sizes the user names are fixed"); only a wall that
 * does not print is refused, as the print check would block it.
 */
export function actionPlan(kind: ActionKind, size: number, bodies: BodyModel[], picks: Pick[], bed: Bed, print: ActionPrint): ActionPlan {
  const { printer } = print;
  const { down } = bed;
  switch (kind) {
    case 'fillet': {
      const { count, onBed } = downEdges(bodies, picks, bed, print.overhang);
      // The radius typed, as a chamfer of whole layers, at least two (the rules' bed chamfer of two to three layers).
      const chamfer = round3(Math.max(2, Math.round(size / printer.layer)) * printer.layer);
      return { size, notes: count > 0 ? [{ note: 'downFillet', count, onBed, chamfer, free: print.overhang >= CHAMFER_ANGLE, overhang: print.overhang, material: print.material }] : [] };
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
      // Under a limit by more than the print check's own tolerance (CHECK_SLACK), as the check would report it.
      if (size < least - CHECK_SLACK) return { size, notes: [{ note: 'wallNoPrint', least, better, refuse: true }] };
      const notes: ActionNote[] = [];
      // On the grid of lines and at least two of them: snapSize leaves it as it is (designFit.ts, the check's minimumWall).
      if (Math.abs(better - size) > 1e-6) {
        const two = minimumWall(printer.nozzle);
        notes.push(size < two - CHECK_SLACK ? { note: 'wallThin', least: two, better } : { note: 'wallLines', line: lineWidth(printer), better });
      }
      // A shell keeps its flat floor and lid at the same thickness; the check holds those to minimumFloor (layers).
      const floor = minimumFloor(printer.layer);
      if (size < floor - CHECK_SLACK && keepsFlat(bodies, picks, down)) notes.push({ note: 'floorThin', least: floor, layers: Math.round(floor / printer.layer), better: snapSize('wall', floor, printer) });
      return { size, notes };
    }
    default:
      return { size, notes: [] };
  }
}
