import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESIGN_DEFAULTS, type MaterialProfile, type PartPrint } from '../../apps/desktop/src/shared/contract';
import { DEFAULT_PRINT_SETTINGS } from '../../apps/desktop/src/main/print/printProfiles';

// The shared harness writes results only through openAudit(), which starts SolidCraft. These cases
// call PartBuddy's functions alone, so they write their result here: out/passung-texte/<name>.json.
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'apps', 'desktop', 'src');

export function save(name: string, result: unknown): void {
  const folder = join(here, 'out', 'passung-texte');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${name}.json`), JSON.stringify(result, null, 2), 'utf8');
}

/** A source file of the desktop app, for counting what a file mentions. */
export function source(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8');
}

export function startingMaterial(id: string): MaterialProfile {
  const found = DEFAULT_PRINT_SETTINGS.materials.find((material) => material.id === id);
  if (!found) throw new Error(`no starting material ${id}`);
  return found;
}

export function partPrint(nozzle: number, layer: number, material: MaterialProfile): PartPrint {
  return { printer: { id: 'printer', name: 'Audit', bed: [256, 256, 256], nozzle, layer }, material, chosen: true, supportFree: true, design: DESIGN_DEFAULTS };
}
