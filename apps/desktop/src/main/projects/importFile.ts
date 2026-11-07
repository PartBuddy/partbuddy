import { existsSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute } from 'node:path';

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

/** The SolidCraft command that inserts a file of this kind into the open design. */
export function insertCommand(kind: Exclude<ImportKind, 'design' | 'package'>, path: string): { command: string; params: Record<string, unknown> } {
  return { command: kind === 'step' ? 'file.insert_step' : 'file.insert_mesh', params: { path } };
}
