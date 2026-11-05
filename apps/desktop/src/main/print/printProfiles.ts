import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import {
  loadPlacesSchema,
  partMaterialRequestSchema,
  printOrientationSchema,
  printSettingsSchema,
  type LoadPlaces,
  type MaterialProfile,
  type PartPrint,
  type PrintOrientation,
  type PrintSettings,
} from '../../shared/contract';

/** What is kept next to a design: its material, how it lies on the bed, where loads act. */
const partFileSchema = z
  .object({
    version: z.literal(1),
    material: partMaterialRequestSchema.shape.material.optional(),
    orientation: printOrientationSchema.optional(),
    loads: loadPlacesSchema.optional(),
  })
  .strict();
type PartFile = Omit<z.infer<typeof partFileSchema>, 'version'>;

/** The part as designed: standing on its lowest point along +Z. */
export const AS_DESIGNED_ORIENTATION: PrintOrientation = { down: [0, 0, -1], face: null };

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
): MaterialProfile => ({ id, name, overhang, holeShrink, clearance: { clamp, push, slide, turn }, outerGrowth: 0 });

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
  private pending: PartFile | null = null;

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

  /** The printer in use and the open part's material, orientation and loads; a removed material falls back to the default. */
  part(): PartPrint {
    const settings = this.settings();
    const printer = settings.printers.find((item) => item.id === settings.printer) ?? settings.printers[0];
    const fallback = settings.materials.find((item) => item.id === settings.material) ?? settings.materials[0];
    if (!printer || !fallback) throw new Error('print profiles without printer or material');
    const own = this.partFile();
    const chosen = own.material === undefined ? undefined : settings.materials.find((item) => item.id === own.material);
    return {
      printer,
      material: chosen ?? fallback,
      chosen: chosen !== undefined,
      orientation: own.orientation ?? AS_DESIGNED_ORIENTATION,
      loads: own.loads ?? [],
    };
  }

  setMaterial(id: string): PartPrint {
    if (!this.settings().materials.some((item) => item.id === id)) throw new Error(`unknown material ${id}`);
    return this.update({ material: id });
  }

  setOrientation(orientation: PrintOrientation): PartPrint {
    return this.update({ orientation });
  }

  setLoads(loads: LoadPlaces): PartPrint {
    return this.update({ loads });
  }

  /** Writes a held change once the design has a file. */
  flush(): void {
    const design = this.options.designFile();
    if (!design || this.pending === null) return;
    try {
      writeAtomic(printFileOf(design), { version: 1, ...this.pending });
      this.pending = null;
    } catch (error) {
      this.options.log(`the part's print settings could not be saved: ${(error as Error).message}`);
    }
  }

  private update(change: PartFile): PartPrint {
    this.pending = { ...this.partFile(), ...change };
    this.flush();
    return this.part();
  }

  private partFile(): PartFile {
    if (this.pending !== null) return this.pending;
    const design = this.options.designFile();
    if (!design) return {};
    const file = printFileOf(design);
    if (!existsSync(file)) return {};
    try {
      const parsed = partFileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (!parsed.success) return {};
      const { material, orientation, loads } = parsed.data;
      return { ...(material ? { material } : {}), ...(orientation ? { orientation } : {}), ...(loads ? { loads } : {}) };
    } catch {
      return {};
    }
  }
}

/** How the part lies on the bed, in the design's own directions, and where loads act. */
function orientationLine({ down, face }: PrintOrientation, loads: LoadPlaces): string {
  const axis = ['x', 'y', 'z'].find((_, k) => Math.abs(Math.abs(down[k] ?? 0) - 1) < 1e-6);
  const k = ['x', 'y', 'z'].indexOf(axis ?? '');
  const direction = axis ? `${(down[k] ?? 0) < 0 ? '-' : '+'}${axis}` : `[${down.map((v) => String(Math.round(v * 1000) / 1000)).join(', ')}]`;
  const lying =
    direction === '-z' && !face
      ? 'It is printed as designed, standing on its lowest point along +Z.'
      : `It is printed lying with the design's ${direction} direction down${face ? ` on face ${JSON.stringify(face.name)} of body ${JSON.stringify(face.body)}` : ''}; layers stack along the direction opposite to that.`;
  const marked = loads.flatMap(({ body, faces }) => faces.map((name) => `${JSON.stringify(name)} of body ${JSON.stringify(body)}`)).slice(0, 12);
  return marked.length > 0 ? `${lying} The user marked loads on ${marked.join(', ')}; layers are weakest when pulled apart.` : lying;
}

const mm = (value: number) => `${String(Math.round(value * 100) / 100)} mm`;

/**
 * The profile as the model reads it (English, like every note to the model). It names what the
 * practice run of 2026-11-04 missed: parts were built at nominal size and fits came up only when
 * asked. Names are the user's own text, so they are quoted and cut short.
 */
export function printNote({ printer, material: used, orientation, loads }: PartPrint): string {
  const name = (text: string) => JSON.stringify(text.slice(0, 60));
  const [x, y, z] = printer.bed;
  const wall = Math.round(printer.nozzle * 2 * 1.125 * 100) / 100;
  const { clamp, push, slide, turn } = used.clearance;
  return [
    `[PartBuddy: print profile of this part. Printer ${name(printer.name)}: build volume ${String(x)} × ${String(y)} × ${String(z)} mm,`,
    `nozzle ${mm(printer.nozzle)}, layer height ${mm(printer.layer)}; walls thinner than ${mm(wall)} (two lines) and details under ${mm(printer.nozzle)} print poorly.`,
    `Material ${name(used.name)}: faces leaning more than ${String(used.overhang)}° from the vertical need support; holes come out about ${mm(used.holeShrink)} smaller in diameter.`,
    `Clearance per side between mating parts: clamp ${mm(clamp)}, push ${mm(push)}, slide ${mm(slide)}, turn ${mm(turn)}.`,
    ...(used.outerGrowth !== 0 ? [`Measured prints: outer sizes (pins, walls, widths) come out ${mm(used.outerGrowth)} ${used.outerGrowth > 0 ? 'larger' : 'smaller'} than drawn; allow for it on pins.`] : []),
    orientationLine(orientation, loads),
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
