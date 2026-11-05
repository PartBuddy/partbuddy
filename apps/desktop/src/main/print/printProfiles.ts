import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  partMaterialRequestSchema,
  printSettingsSchema,
  type MaterialProfile,
  type PartPrint,
  type PrintSettings,
} from '../../shared/contract';

/**
 * Starting values (M7, 2026-11-05): a generic printer with a 0.4 mm nozzle and the common
 * filaments. Clearances are per side; they are a start that the user corrects for their printer,
 * later with measured values (M7 "measure after printing").
 */
const material = (
  id: string,
  name: string,
  overhang: number,
  holeShrink: number,
  [clamp, push, slide, turn]: [number, number, number, number],
): MaterialProfile => ({ id, name, overhang, holeShrink, clearance: { clamp, push, slide, turn } });

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  version: 1,
  printers: [{ id: 'printer', name: 'My printer', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2 }],
  printer: 'printer',
  materials: [
    material('pla', 'PLA', 45, 0.15, [0.05, 0.15, 0.25, 0.3]),
    material('petg', 'PETG', 40, 0.2, [0.1, 0.2, 0.3, 0.35]),
    material('petg-cf', 'PETG-CF', 40, 0.2, [0.1, 0.2, 0.3, 0.35]),
    material('asa', 'ASA', 40, 0.2, [0.1, 0.2, 0.3, 0.35]),
    material('tpu', 'TPU', 35, 0.25, [0, 0.1, 0.3, 0.4]),
  ],
  material: 'pla',
};

/** The print file of a design: `Grundplatte.sc` → `Grundplatte.print.json`, next to it. */
export function printFileOf(design: string): string {
  return `${design.replace(/\.sc$/i, '')}.print.json`;
}

/** Written next to the target first and then moved, so a crash never leaves half a file. */
function writeAtomic(file: string, data: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(data), 'utf8');
  renameSync(`${file}.tmp`, file);
}

export interface PrintProfilesOptions {
  /** The profiles of this installation (`print-profiles.json` in the app's data folder). */
  file: string;
  /** The file of the open design, or null while it has none yet. */
  designFile(): string | null;
  log(message: string): void;
}

/**
 * Printer and material profiles (M7): one file for the installation, and the material of each part
 * in a small file next to its design, like the conversation. A choice made before the design has a
 * file is held and written once it has one. Both files are read back as untrusted input.
 */
export class PrintProfiles {
  private pending: string | null = null;

  constructor(private readonly options: PrintProfilesOptions) {}

  settings(): PrintSettings {
    if (!existsSync(this.options.file)) return DEFAULT_PRINT_SETTINGS;
    try {
      const parsed = printSettingsSchema.safeParse(JSON.parse(readFileSync(this.options.file, 'utf8')));
      if (parsed.success) return parsed.data;
      this.options.log('the print profiles do not match their format; the starting values are used');
    } catch (error) {
      this.options.log(`the print profiles could not be read: ${(error as Error).message}`);
    }
    return DEFAULT_PRINT_SETTINGS;
  }

  save(settings: PrintSettings): PrintSettings {
    const parsed = printSettingsSchema.parse(settings);
    writeAtomic(this.options.file, parsed);
    return parsed;
  }

  /** The printer in use and the open part's material; a removed material falls back to the default. */
  part(): PartPrint {
    const settings = this.settings();
    const printer = settings.printers.find((item) => item.id === settings.printer) ?? settings.printers[0];
    const fallback = settings.materials.find((item) => item.id === settings.material) ?? settings.materials[0];
    if (!printer || !fallback) throw new Error('print profiles without printer or material');
    const own = this.partMaterial();
    const chosen = own === null ? undefined : settings.materials.find((item) => item.id === own);
    return { printer, material: chosen ?? fallback, chosen: chosen !== undefined };
  }

  setMaterial(id: string): PartPrint {
    if (!this.settings().materials.some((item) => item.id === id)) throw new Error(`unknown material ${id}`);
    this.pending = id;
    this.flush();
    return this.part();
  }

  /** Writes a held material choice once the design has a file. */
  flush(): void {
    const design = this.options.designFile();
    if (!design || this.pending === null) return;
    try {
      writeAtomic(printFileOf(design), { version: 1, material: this.pending });
      this.pending = null;
    } catch (error) {
      this.options.log(`the part's material could not be saved: ${(error as Error).message}`);
    }
  }

  private partMaterial(): string | null {
    if (this.pending !== null) return this.pending;
    const design = this.options.designFile();
    if (!design) return null;
    const file = printFileOf(design);
    if (!existsSync(file)) return null;
    try {
      const stored = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown; material?: unknown };
      if (stored.version !== 1) return null;
      const parsed = partMaterialRequestSchema.safeParse({ material: stored.material });
      return parsed.success ? parsed.data.material : null;
    } catch {
      return null;
    }
  }
}

const mm = (value: number) => `${String(Math.round(value * 100) / 100)} mm`;

/**
 * The profile as the model reads it (English, like every note to the model). It names what the
 * practice run of 2026-11-04 missed: parts were built at nominal size and fits came up only when
 * asked. Names are the user's own text, so they are quoted and cut short.
 */
export function printNote({ printer, material: used }: PartPrint): string {
  const name = (text: string) => JSON.stringify(text.slice(0, 60));
  const [x, y, z] = printer.bed;
  const wall = Math.round(printer.nozzle * 2 * 1.125 * 100) / 100;
  const { clamp, push, slide, turn } = used.clearance;
  return [
    `[PartBuddy: print profile of this part. Printer ${name(printer.name)}: build volume ${String(x)} × ${String(y)} × ${String(z)} mm,`,
    `nozzle ${mm(printer.nozzle)}, layer height ${mm(printer.layer)}; walls thinner than ${mm(wall)} (two lines) and details under ${mm(printer.nozzle)} print poorly.`,
    `Material ${name(used.name)}: faces leaning more than ${String(used.overhang)}° from the vertical need support; holes come out about ${mm(used.holeShrink)} smaller in diameter.`,
    `Clearance per side between mating parts: clamp ${mm(clamp)}, push ${mm(push)}, slide ${mm(slide)}, turn ${mm(turn)}.`,
    'Keep nominal sizes as parameters, add the clearance and the hole allowance as their own parameters, and say which fit you chose.]',
  ].join('\n');
}

/**
 * Sends the profile once per conversation and again when it changes, so the model always has it
 * without reading it with every message.
 */
export class ProfileNote {
  private sent: { conversation: string; text: string } | null = null;

  /** The note for this message, or null when this conversation already has it. */
  take(conversation: string, fresh: boolean, text: string): string | null {
    if (!fresh && this.sent?.conversation === conversation && this.sent.text === text) return null;
    this.sent = { conversation, text };
    return text;
  }

  /** The message did not go out; the next one carries the note again. */
  forget(): void {
    this.sent = null;
  }
}
