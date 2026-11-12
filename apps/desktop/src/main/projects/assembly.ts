import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assemblyPlanSchema, type AssemblyPlan } from '../../shared/assembly';
import { printFacesSchema } from '../../shared/contract';

/**
 * The assembly order of a project (ADR 0026), kept as `assembly.json` next to its design. A project
 * without the file, or with one that does not pass the schema, has none; the view then proposes an
 * order from the geometry. Older projects have no file and open as before.
 */

export const ASSEMBLY_FILE = 'assembly.json';

export function readAssembly(folder: string, log: (message: string) => void = () => undefined): AssemblyPlan | null {
  let text: string;
  try {
    text = readFileSync(join(folder, ASSEMBLY_FILE), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = assemblyPlanSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    log(`assembly order not read: ${parsed.error.issues[0]?.message ?? 'does not match the schema'}`);
  } catch (error) {
    log(`assembly order not read: ${(error as Error).message}`);
  }
  return null;
}

/** Writes the plan through a temporary file, so a crash never leaves half a file. */
export function writeAssembly(folder: string, plan: AssemblyPlan): void {
  const file = join(folder, ASSEMBLY_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(assemblyPlanSchema.parse(plan), null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/**
 * Print faces as PartBuddy set them (B8), by body, kept as `print-faces.json` so the plate view can
 * lay each part on its face; SolidCraft keeps the face itself but does not report it back.
 * A mechanism (a screw lid) and a template say theirs when they are built; one the assistant sets
 * itself is read from SolidCraft's answer (printFaceWatch.ts).
 * shortcut: an undo of body.print_face leaves the kept face; upgrade when SolidCraft reports print faces.
 */
export const PRINT_FACES_FILE = 'print-faces.json';

export function readPrintFaces(folder: string): Record<string, string> {
  try {
    const parsed = printFacesSchema.safeParse(JSON.parse(readFileSync(join(folder, PRINT_FACES_FILE), 'utf8')));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Keeps or clears (null) one body's print face. */
export function keepPrintFace(folder: string, body: string, face: string | null): void {
  const faces = Object.fromEntries(Object.entries(readPrintFaces(folder)).filter(([name]) => name !== body));
  if (face) faces[body] = face;
  writeFileSync(join(folder, PRINT_FACES_FILE), `${JSON.stringify(faces, null, 2)}\n`);
}
