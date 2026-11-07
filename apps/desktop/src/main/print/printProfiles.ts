import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import {
  DESIGN_DEFAULTS,
  DESIGN_RULES,
  partMaterialRequestSchema,
  printSettingsSchema,
  type DesignRule,
  type DesignRules,
  type MaterialProfile,
  type PartPrint,
  type PrintSettings,
} from '../../shared/contract';
import { fitSize, lineWidth, printInPlaceGap, scaleClearance, unitSize, type FitPrinter } from '../../shared/designFit';

/**
 * What is kept next to a design: its material, and the design rule groups the user turned on or off
 * for this project in the chat (decided 2026-11-07). Files written before plan step R1 may also hold
 * an orientation and loads; those keys are dropped when read.
 */
const partFileSchema = z.object({
  version: z.literal(1),
  material: partMaterialRequestSchema.shape.material.optional(),
  // Not designRulesSchema.partial(): that fills in its defaults, and a missing group must fall through to the setting.
  design: z.partialRecord(z.enum(DESIGN_RULES), z.boolean()).optional().catch(undefined),
});
interface PartFile {
  material?: string;
  design?: Partial<DesignRules>;
}

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
  supportFree: true,
  design: DESIGN_DEFAULTS,
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
  /** The starting printer's name in the interface language ("Mein Drucker"); English when left out. */
  printerName?: () => string;
}

/** Profiles saved before plan step R2 carry the outer growth from measuring; it is dropped when read. */
function withoutOuterGrowth(stored: unknown): unknown {
  if (typeof stored !== 'object' || stored === null || !Array.isArray((stored as { materials?: unknown }).materials)) return stored;
  const materials = (stored as { materials: unknown[] }).materials.map((item) => {
    if (typeof item !== 'object' || item === null) return item;
    const rest: Record<string, unknown> = { ...(item as Record<string, unknown>) };
    delete rest.outerGrowth;
    return rest;
  });
  return { ...stored, materials };
}

/**
 * Printer and material profiles (M7): one file for the installation, and the material of each part
 * in a small file next to its design, like the conversation. A choice made before the design has a
 * file is held and written once it has one. Both files are read back as untrusted input.
 */
export class PrintProfiles {
  private pending: PartFile | null = null;

  constructor(private readonly options: PrintProfilesOptions) {}

  /** The starting values, the printer named in the interface language (polish round 4). */
  private defaults(): PrintSettings {
    const name = this.options.printerName?.();
    if (!name) return DEFAULT_PRINT_SETTINGS;
    return { ...DEFAULT_PRINT_SETTINGS, printers: DEFAULT_PRINT_SETTINGS.printers.map((printer) => ({ ...printer, name })) };
  }

  settings(): PrintSettings {
    if (!existsSync(this.options.file)) return this.defaults();
    try {
      const parsed = printSettingsSchema.safeParse(withoutOuterGrowth(JSON.parse(readFileSync(this.options.file, 'utf8'))));
      if (parsed.success) return parsed.data;
      this.options.log('the print profiles do not match their format; the starting values are used');
    } catch (error) {
      this.options.log(`the print profiles could not be read: ${(error as Error).message}`);
    }
    return this.defaults();
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
    const own = this.partFile();
    const chosen = own.material === undefined ? undefined : settings.materials.find((item) => item.id === own.material);
    return {
      printer,
      material: chosen ?? fallback,
      chosen: chosen !== undefined,
      supportFree: settings.supportFree,
      // The project's choice in the chat goes before the setting, the setting before the default.
      design: { ...settings.design, ...own.design },
    };
  }

  /** Turns rule groups on or off for this project (the chat); null hands a group back to the setting. */
  setDesign(change: Partial<Record<DesignRule, boolean | null>>): PartPrint {
    const merged: Partial<Record<DesignRule, boolean | null>> = { ...this.partFile().design, ...change };
    const design = Object.fromEntries(Object.entries(merged).filter(([, value]) => typeof value === 'boolean')) as Partial<DesignRules>;
    return this.update({ design });
  }

  setMaterial(id: string): PartPrint {
    if (!this.settings().materials.some((item) => item.id === id)) throw new Error(`unknown material ${id}`);
    return this.update({ material: id });
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
      const { material } = parsed.data;
      const design = Object.fromEntries(Object.entries(parsed.data.design ?? {}).filter(([, value]) => typeof value === 'boolean')) as Partial<DesignRules>;
      return { ...(material ? { material } : {}), ...(Object.keys(design).length > 0 ? { design } : {}) };
    } catch {
      return {};
    }
  }
}

const mm = (value: number) => `${String(Math.round(value * 100) / 100)} mm`;

/**
 * The profile as the model reads it (English, like every note to the model). It names what the
 * practice run of 2026-11-04 missed: parts were built at nominal size and fits came up only when
 * asked. Names are the user's own text, so they are quoted and cut short.
 */
/**
 * Rules for designing without support (M7f, decided 2026-11-05), from what the practice run and
 * the slicer showed and the common design-for-printing advice (Prusa knowledge base, Hackaday's
 * teardrop holes). Bridges over counterbores facing the bed are left to the slicer, which builds
 * them itself (plan step R1).
 */
function supportFreeLines(overhang: number): string[] {
  return [
    'Design it to print without support as designed, standing on its lowest point (the user\'s setting); where that cannot be done, say so and why:',
    `- Edges that face down towards the bed: chamfer them at 45° instead of filleting (the bottom of a fillet ends flat); fillets that face up or sideways are fine.`,
    `- Holes lying across the layers: up to about 10 mm wide the slicer bridges them; wider ones get a teardrop roof (45° to a point above the circle) or a flat roof (the teardrop cut off), so nothing leans more than ${String(overhang)}°.`,
    '- Ceilings and ledges: walls at most 10 mm apart are bridged, ledges up to 1.5 mm out from a wall print; anything wider gets a 45° slope underneath, or say which side the part should rather stand on.',
    'Model these as their own features with parameters (layer height, roof angle) and name them when you report.',
  ];
}

/** Every multiple from `from` to `to` units, as the model reads them: "0.9, 1.35, 1.8 mm". */
function series(unit: number, from: number, to: number): string {
  const values: string[] = [];
  for (let count = from; count <= to; count += 1) values.push(String(Math.round(unit * count * 1000) / 1000));
  return `${values.join(', ')} mm`;
}

const RULE_NAMES: Record<DesignRule, string> = {
  rounding: 'rounded and chamfered edges',
  printInPlace: 'print-in-place joints',
  details: 'refined details',
  snap: 'sizes snapped to nozzle and layer',
};

/**
 * What a careful FDM designer does without being asked (decided 2026-11-07), in four groups the user
 * can turn off: in the settings for every project, in the chat for one. The sizes come from the
 * printer in use, so they fit its nozzle and layer height. Sizes the user names are above all of it.
 */
export function designLines(design: DesignRules, printer: FitPrinter, material: MaterialProfile): string[] {
  const line = lineWidth(printer);
  const layer = printer.layer;
  const gap = printInPlaceGap(printer);
  const minWall = fitSize('wall', 0, 'assistant', printer).value;
  const clearance = (value: number) => mm(scaleClearance(value, printer));
  const off = (Object.keys(RULE_NAMES) as DesignRule[]).filter((rule) => !design[rule]);
  const lines = [
    'Design it well without being asked: apply the rules below on your own, in every design, unless the user says otherwise.',
    `- Sizes the user names are fixed: build them exactly, never round or snap them to the nozzle or layer height. If one is under what prints (a wall under ${mm(minWall)}, a gap under 0.2 mm, a detail under ${mm(printer.nozzle)}) or a wall is not a whole number of ${mm(line)} lines, build it as given anyway and say in one sentence which value prints better.`,
    `- Fits follow the purpose, not the raw size: nominal size plus clearance per side, press fit ${clearance(material.clearance.clamp)}, sliding fit ${clearance(material.clearance.slide)}, loose fit ${clearance(material.clearance.turn)} (the material's values, scaled for this nozzle). Ask only when the purpose is unclear.`,
    `- Printing comes first: nothing leans more than ${String(material.overhang)}° without support, no support that a better shape or orientation avoids, and stand the part so loads and snap arms run along the layers, not across them. A refinement never makes function or printing worse; leave it out where it would.`,
  ];
  if (design.rounding)
    lines.push(
      `- Edges: round outer edges that are seen or touched, radius 1 mm on parts under 30 mm, 2 mm up to 100 mm, 3 mm above, never more than the wall they cut into. Edges on the bed get a 45° chamfer, not a fillet, ${series(layer, 2, 3)} high, which also takes up the elephant's foot. Round inner corners under load with at least half the wall thickness (at least ${mm(Math.max(1, printer.nozzle * 2))}). Use at most two or three radii per part so they match.`,
    );
  if (design.printInPlace)
    lines.push(
      `- Hinges, joints and clips: first look for a print-in-place solution that prints without support, with ${mm(gap)} gap all round the moving parts, the pin lying flat with 45° cones or teardrop holes instead of flat ceilings, and a ${mm(layer * 2)} chamfer on the moving parts' bed edges so they do not fuse. Snap arms at least five times as long as thick, with a 30–45° lead-in. When print-in-place does not work (load, size, material), choose another joint on purpose and say why in one sentence.`,
    );
  if (design.details)
    lines.push(
      `- Details: keep walls the same thickness throughout (one wall parameter), chamfer hole and screw entries 0.5 mm × 45°, sink screw heads (counterbore or countersink), give mating edges a 0.5 mm lead-in chamfer so parts go together, and blend changes in thickness with a radius or a 45° slope instead of a sharp step. Embossed or engraved text at least ${mm(Math.max(0.6, layer * 3))} deep and ${mm(printer.nozzle * 2)} wide per stroke.`,
    );
  if (design.snap)
    lines.push(
      `- Sizes you choose yourself snap up to the printer: walls and ribs to whole lines of ${mm(line)} (${series(line, 2, 5)}), floors, lids, steps and chamfer heights to whole layers of ${mm(layer)} (${series(layer, 3, 6)}), floors and lids at least ${mm(Math.max(0.8, layer * 4))}, print-in-place gaps ${mm(gap)}, radii and details at least ${mm(unitSize('nozzle', printer))}. Mark each such parameter's comment with the multiple, e.g. "Wall [auto 3×line]", "Floor [auto 5×layer]", "Hinge gap [auto 1×nozzle]", so PartBuddy fits it again when the user changes printer or nozzle. Sizes the user named get no mark.`,
    );
  if (off.length > 0)
    lines.push(`- The user turned off ${off.map((rule) => RULE_NAMES[rule]).join(', ')}: do not add them unless the user asks for them.`);
  lines.push(
    '- After each design step, name what you added on your own and the sizes you snapped in one short line, e.g. "Outer edges 2 mm rounded, hinge print-in-place with 0.4 mm gap, lid sliding fit 0.3 mm", so the user can turn it off or change it.',
    `- When the user turns one of these off or back on ("no fillets", "screw the hinge instead"), call partbuddy_design_rules, so it holds for the rest of the project, also after a restart.`,
  );
  return lines;
}

export function printNote({ printer, material: used, supportFree, design }: PartPrint): string {
  const name = (text: string) => JSON.stringify(text.slice(0, 60));
  const [x, y, z] = printer.bed;
  const wall = Math.round(printer.nozzle * 2 * 1.125 * 100) / 100;
  const { clamp, push, slide, turn } = used.clearance;
  return [
    `[PartBuddy: print profile of this part. Printer ${name(printer.name)}: build volume ${String(x)} × ${String(y)} × ${String(z)} mm,`,
    `nozzle ${mm(printer.nozzle)}, layer height ${mm(printer.layer)}; walls thinner than ${mm(wall)} (two lines) and details under ${mm(printer.nozzle)} print poorly.`,
    `Material ${name(used.name)}: faces leaning more than ${String(used.overhang)}° from the vertical need support; holes come out about ${mm(used.holeShrink)} smaller in diameter.`,
    `Clearance per side between mating parts, for this nozzle: clamp ${mm(scaleClearance(clamp, printer))}, push ${mm(scaleClearance(push, printer))}, slide ${mm(scaleClearance(slide, printer))}, turn ${mm(scaleClearance(turn, printer))}.`,
    'It is printed as designed, standing on its lowest point along +Z.',
    ...(supportFree ? supportFreeLines(used.overhang) : []),
    ...designLines(design, printer, used),
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
