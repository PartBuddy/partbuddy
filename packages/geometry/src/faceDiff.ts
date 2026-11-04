import type { FaceInfo, FaceTable } from './faceTable';

/**
 * Which faces of a body changed between two mirrored revisions. Face indices are reassigned on
 * every rebuild (ADR 0004), so faces are matched by their SolidCraft name; a face whose name
 * stayed but whose geometry moved or resized also counts as changed.
 */
export interface FaceDiff {
  /** Indices (in the new table) of faces whose name did not exist before. */
  added: number[];
  /** Indices (in the new table) of faces that kept their name but changed geometry. */
  changed: number[];
  /** Names of faces that no longer exist. */
  removed: string[];
}

/** Absolute tolerance in mm and mm², relative 0.1 %: below the chord error of the "standard" export. */
const ABSOLUTE = 1e-3;
const RELATIVE = 1e-3;

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= ABSOLUTE + RELATIVE * Math.max(Math.abs(a), Math.abs(b));
}

function sameGeometry(a: FaceInfo, b: FaceInfo): boolean {
  if (!close(a.area, b.area)) return false;
  return a.centroid.every((value, i) => close(value, b.centroid[i] ?? Number.NaN));
}

export function diffFaces(previous: FaceTable | null, next: FaceTable): FaceDiff {
  if (!previous) return { added: next.faces.map((face) => face.index), changed: [], removed: [] };
  const before = new Map(previous.faces.map((face) => [face.name, face]));
  const added: number[] = [];
  const changed: number[] = [];
  for (const face of next.faces) {
    const old = before.get(face.name);
    if (!old) added.push(face.index);
    else if (!sameGeometry(old, face)) changed.push(face.index);
    before.delete(face.name);
  }
  return { added, changed, removed: [...before.keys()] };
}

/** True when nothing changed: same names and the same geometry for every face. */
export function isUnchanged(diff: FaceDiff): boolean {
  return diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0;
}
