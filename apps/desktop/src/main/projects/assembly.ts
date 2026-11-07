import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assemblyPlanSchema, type AssemblyPlan } from '../../shared/assembly';

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
