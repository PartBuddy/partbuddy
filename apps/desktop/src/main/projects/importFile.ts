import { existsSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute } from 'node:path';

import { designChanged, type DesignHistory } from '../agents/workLog';

/**
 * Files PartBuddy imports (plan step B4): SolidCraft designs as they are, STEP and IGES as bodies
 * with faces (`file.insert_step`), STL, 3MF and OBJ as mesh bodies (`file.insert_mesh`), and
 * PartBuddy's own project packages (P3).
 */
export type ImportKind = 'design' | 'step' | 'mesh' | 'package';

const KINDS: Record<string, ImportKind> = {
  '.sc': 'design',
  '.step': 'step',
  '.stp': 'step',
  '.iges': 'step',
  '.igs': 'step',
  '.stl': 'mesh',
  '.3mf': 'mesh',
  '.obj': 'mesh',
  '.partbuddy': 'package',
};

/** The extensions of the open dialog, without the dot. */
export const IMPORT_EXTENSIONS = {
  design: ['sc'],
  step: ['step', 'stp', 'iges', 'igs'],
  mesh: ['stl', '3mf', 'obj'],
  package: ['partbuddy'],
} as const;

/** Larger files are not parts for a 3D printer; SolidCraft would take minutes to read them. */
export const MAX_IMPORT_BYTES = 512 * 1024 * 1024;

export function importKindOf(file: string): ImportKind | null {
  return KINDS[extname(file).toLowerCase()] ?? null;
}

/** The name of a file without its extension, as the project or the component is called. */
export function importName(file: string): string {
  return basename(file, extname(file));
}

/**
 * Checks a file the user picked or dropped before SolidCraft reads it: an absolute path to an
 * existing file of a known kind and not too large. Throws with a short reason otherwise.
 */
export function checkImportFile(file: string): ImportKind {
  if (!isAbsolute(file)) throw new Error('not an absolute path');
  const kind = importKindOf(file);
  if (!kind) throw new Error('PartBuddy cannot import this kind of file');
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error('the file does not exist');
  if (statSync(file).size > MAX_IMPORT_BYTES) throw new Error('the file is larger than 512 MB');
  return kind;
}

/** Units an STL or OBJ may be in (`file.insert_mesh` `units`); a 3MF states its own. */
export const MESH_UNITS = ['mm', 'in', 'cm', 'm'] as const;
export type MeshUnit = (typeof MESH_UNITS)[number];

/** The SolidCraft command that inserts a file of this kind into the open design; `units` for an STL or OBJ not in millimetres. */
export function insertCommand(kind: Exclude<ImportKind, 'design' | 'package'>, path: string, units?: MeshUnit): { command: string; params: Record<string, unknown> } {
  return { command: kind === 'step' ? 'file.insert_step' : 'file.insert_mesh', params: { path, ...(units && units !== 'mm' ? { units } : {}) } };
}

/** The size of the box around `bodies` (all of them when omitted) in a result of `inspect.measure`; null where none reads. */
export function boxSize(measured: unknown, bodies?: readonly string[]): [number, number, number] | null {
  const list = (measured as { bodies?: unknown } | null | undefined)?.bodies;
  const ok = (value: unknown): value is number[] => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const entry of Array.isArray(list) ? (list as { name?: unknown; bbox?: { min?: unknown; max?: unknown } }[]) : []) {
    if (bodies && !bodies.includes(entry.name as string)) continue;
    const [low, high] = [entry.bbox?.min, entry.bbox?.max];
    if (!ok(low) || !ok(high)) continue;
    for (const i of [0, 1, 2]) {
      min[i] = Math.min(min[i] ?? Infinity, low[i] ?? Infinity);
      max[i] = Math.max(max[i] ?? -Infinity, high[i] ?? -Infinity);
    }
  }
  if (!Number.isFinite(min[0])) return null;
  return [0, 1, 2].map((i) => Math.round(((max[i] ?? 0) - (min[i] ?? 0)) * 1000) / 1000) as [number, number, number];
}

/** Whether the file is an STL or OBJ, which state no unit (a 3MF, STEP or IGES file does). */
export function statesNoUnit(file: string): boolean {
  return ['.stl', '.obj'].includes(extname(file).toLowerCase());
}

/**
 * Below this, the largest side of an STL or OBJ read in millimetres is more likely inches or metres: a part designed
 * at 1 to 5 in reads as 1 to 5 mm (audit D44). A part this small in millimetres is asked about once and kept.
 */
const SMALL_MM = 5;

/**
 * Whether to ask in which unit an inserted STL or OBJ is (they state none; SolidCraft reads millimetres and asks
 * nothing): when its largest side is under SMALL_MM or larger than the largest side of the printer's bed.
 */
export function asksForUnit(file: string, size: readonly [number, number, number] | null, bed: readonly [number, number, number]): boolean {
  if (!size || !statesNoUnit(file)) return false;
  const largest = Math.max(...size);
  return largest < SMALL_MM || largest > Math.max(...bed);
}

/**
 * Whether the insert is still the last step of the design, so one Undo takes back the insert and nothing else: nothing
 * changed since (`designChanged`, which at SolidCraft's undo cap of 200 goes by the marker and the revision) and
 * nothing waits to be redone (review of BC-04, S2).
 */
export function insertIsLast(after: DesignHistory, now: DesignHistory): boolean {
  return !designChanged(after, now) && now.redo === 0;
}
