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
import { ENTRY_CHAMFER, STURDY, textDepth, textStroke } from '../../shared/blocks';
import { snapHook, snapLength, snapLimit } from '../../shared/mechanisms';
import { CLEARANCE_NOZZLE, ELEPHANT_FOOT, lineWidth, printInPlaceGap, scaleClearance, type FitPrinter } from '../../shared/designFit';
import { MATERIAL_CATALOG } from '../../shared/materialCatalog';
import { COMPENSATED_CIRCLE, holeAllowance, HOLE_SIZES, LARGEST_HOLE } from '../../shared/tolerances';
import { BLOCK_TOOL } from '../agents/blockTool';
import { MECHANISM_TOOL } from '../agents/mechanismTool';
import { DESIGN_TOOL } from '../agents/designTool';
import { ASK_TOOL } from '../agents/questions';
import { BRIDGE_SPAN, LYING_HOLE, minimumFloor, minimumWall, thinnestLine } from '@partbuddy/geometry';

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
 * filaments. The materials are the catalog's, with its sources, so a fresh installation and »Add
 * material« give the same numbers (audit D27, T22); saved profiles keep their own values. They are
 * a start that the user corrects with the tolerance pieces.
 */
function catalogMaterial(id: string, name: string): MaterialProfile {
  const entry = MATERIAL_CATALOG.find((item) => item.name === name);
  if (!entry) throw new Error(`${name} is not in the material catalog`);
  return { id, name, overhang: entry.overhang, holeShrink: entry.holeShrink, clearance: { ...entry.clearance } };
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  version: 1,
  printers: [{ id: 'printer', name: 'My printer', bed: [256, 256, 256], nozzle: 0.4, layer: 0.2 }],
  printer: 'printer',
  materials: [
    catalogMaterial('pla', 'PLA'),
    catalogMaterial('petg', 'PETG'),
    catalogMaterial('petg-cf', 'PETG-CF'),
    catalogMaterial('asa', 'ASA'),
    catalogMaterial('tpu', 'TPU 95A'),
  ],
  material: 'pla',
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

/**
 * Profiles saved before plan step R2 carry the outer growth from measuring, and before 2026-11-14 the setting "Design without
 * support" (its rules now always apply, Manuel's decision on audit BC-19); both are dropped when read, so the file still opens.
 */
function withoutRetired(stored: unknown): unknown {
  if (typeof stored !== 'object' || stored === null) return stored;
  const kept: Record<string, unknown> = { ...(stored as Record<string, unknown>) };
  delete kept.supportFree;
  if (!Array.isArray(kept.materials)) return kept;
  const materials = (kept.materials as unknown[]).map((item) => {
    if (typeof item !== 'object' || item === null) return item;
    const rest: Record<string, unknown> = { ...(item as Record<string, unknown>) };
    delete rest.outerGrowth;
    return rest;
  });
  return { ...kept, materials };
}

/**
 * Printer and material profiles (M7): one file for the installation, and the material of each part
 * in a small file next to its design, like the conversation. A choice made before the design has a
 * file is held and written once it has one. Both files are read back as untrusted input.
 */
const STARTING_NAMES = new Set(['My printer', 'Mein Drucker']);

export class PrintProfiles {
  private pending: PartFile | null = null;

  constructor(private readonly options: PrintProfilesOptions) {}

  /** The starting values, the printer named in the interface language (polish round 4). */
  private defaults(): PrintSettings {
    const name = this.options.printerName?.();
    if (!name) return DEFAULT_PRINT_SETTINGS;
    return { ...DEFAULT_PRINT_SETTINGS, printers: DEFAULT_PRINT_SETTINGS.printers.map((printer) => ({ ...printer, name })) };
  }

  /** A printer still carrying a starting name follows the interface language (audit A-02). */
  private translated(settings: PrintSettings): PrintSettings {
    const name = this.options.printerName?.();
    if (!name) return settings;
    return { ...settings, printers: settings.printers.map((printer) => (STARTING_NAMES.has(printer.name) ? { ...printer, name } : printer)) };
  }

  settings(): PrintSettings {
    if (!existsSync(this.options.file)) return this.defaults();
    try {
      const parsed = printSettingsSchema.safeParse(withoutRetired(JSON.parse(readFileSync(this.options.file, 'utf8'))));
      if (parsed.success) return this.translated(parsed.data);
      this.options.log('the print profiles do not match their format; the starting values are used');
    } catch (error) {
      this.options.log(`the print profiles could not be read: ${(error as Error).message}`);
    }
    return this.defaults();
  }

  /** Printers and materials back to the starting ones; the assistant's design rules stay (audit A-23). */
  startingProfiles(): PrintSettings {
    const { design } = this.settings();
    return { ...this.defaults(), design };
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

// To 0.001 mm like the scaled clearances, so 0.075 does not read 0.08 (audit N-passung-texte-5).
const mm = (value: number) => `${String(Math.round(value * 1000) / 1000)} mm`;

/**
 * How far a ledge may reach out from the material below without support: four lines, as the print check counts
 * it (`smallOverhangReach`). OrcaSlicer leaves such overhangs without support by default ("Ignore small
 * overhangs": a cluster narrower than two lines once one line is eroded from each side, TreeSupport.cpp at
 * commit e23af6d, lines 1186-1190; default in PrintConfig.cpp). HLH Rapid names 1.2 mm.
 * shortcut: repeats smallOverhangReach, which packages/geometry does not export; import it once it does.
 */
const smallLedge = (nozzle: number) => Math.round(4 * 1.125 * nozzle * 100) / 100;

/** The gap printInPlaceGap never goes under, whatever the nozzle: moving parts need at least 0.3 mm (Prusa). */
const MOVING_GAP = printInPlaceGap({ nozzle: 0, layer: 0 });

/**
 * The profile as the model reads it (English, like every note to the model). It names what the
 * practice run of 2026-11-04 missed: parts were built at nominal size and fits came up only when
 * asked. Names are the user's own text, so they are quoted and cut short.
 */
/**
 * Rules for designing without support (M7f, decided 2026-11-05), from what the practice run and
 * the slicer showed and the common design-for-printing advice (Prusa knowledge base, Hackaday's
 * teardrop holes). Bridges over counterbores facing the bed are left to the slicer, which builds
 * them itself (plan step R1). The spans are the print check's own (audit T25, D18).
 */
function withoutSupportLines(overhang: number, nozzle: number): string[] {
  return [
    'Design it to print without support wherever the shape allows, as designed or on the print face you set; where it cannot, tell the user which faces need support and why:',
    `- Edges that face down towards the bed: chamfer them at 45° instead of filleting (the bottom of a fillet ends flat; Prusa); fillets that face up or sideways are fine.`,
    `- Holes lying across the layers: up to ${String(LYING_HOLE)} mm across they print round without support (MakerVerse); wider ones get a teardrop roof (45° to a point above the circle) or a flat roof (the teardrop cut off), so nothing leans more than ${String(overhang)}°.`,
    `- Ceilings and ledges: walls at most ${String(BRIDGE_SPAN)} mm apart are bridged (UltiMaker; Hubs names 5 mm for a bridge that does not sag at all), and ledges reaching out at most ${mm(smallLedge(nozzle))} (four lines) from the material below are left without support (OrcaSlicer); the print check counts both the same way. Anything wider gets a 45° slope underneath, or say which side the part should rather stand on.`,
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
  economy: 'saving material and print time',
};

/** The least length of PartBuddy's snap arm on the printer in the material, bent by its whole catch, as the snapFit block checks it (audit H-17). */
const snapArm = (printer: FitPrinter, material: MaterialProfile) => {
  const hook = snapHook(printer, material);
  return snapLength(hook.thickness, hook.catch, hook.catchLength, snapLimit(material).strain);
};

/**
 * What a careful FDM designer does without being asked (decided 2026-11-07), in five groups the user
 * can turn off: in the settings for every project, in the chat for one. The sizes come from the
 * printer in use, so they fit its nozzle and layer height. Sizes the user names are above all of it.
 * Every fixed size names its source or says it is PartBuddy's own choice (audit D29).
 */
export function designLines(design: DesignRules, printer: FitPrinter, material: MaterialProfile): string[] {
  const line = lineWidth(printer);
  const layer = printer.layer;
  const gap = printInPlaceGap(printer);
  // The print check's own minimum, so the rules and the check name the same wall (0.56, not 0.562, at 0.25 mm).
  const minWall = minimumWall(printer.nozzle);
  const clearance = (fit: keyof MaterialProfile['clearance']) => mm(scaleClearance(material.clearance[fit], printer, material.measuredNozzle));
  // A measured clamp fit may be below zero (the schema allows it): then it is an interference, not room.
  const room = Object.values(material.clearance).every((value) => value >= 0)
    ? 'Each is room, never an interference.'
    : 'A value below zero is an interference: the part is that much larger than its seat, per side.';
  const off = (Object.keys(RULE_NAMES) as DesignRule[]).filter((rule) => !design[rule]);
  const lines = [
    'Design it well without being asked: apply the rules below on your own, in every design, unless the user says otherwise.',
    `- Sizes the user names are fixed: build them exactly, never round or snap them to the nozzle or layer height. If one does not print at all (a wall or detail thinner than ${mm(thinnestLine(printer.nozzle))}, the narrowest line a slicer lays with this nozzle; a floor or lid thinner than one ${mm(layer)} layer; such walls and floors are what the print check blocks), or is implausible for the part (ten times off the rest, a hole wider than the face it goes through), do not build it: ask with ${ASK_TOOL}, offering the value as given and the nearest one that prints. A size that only prints less well (a wall under two lines, ${mm(minWall)}, or not a whole number of ${mm(line)} lines; a detail under one line; a floor under ${mm(minimumFloor(layer))}) is built as given, with one sentence on the better value. Working parts are the exception: lips and snap arms under two lines do not hold, and ${BLOCK_TOOL} refuses them, so ask for those too.`,
    `- Fits follow the purpose, not the raw size: nominal size plus the clearance per side of the fit, clamp ${clearance('clamp')} (tight, only with force), push ${clearance('push')} (in by hand), slide ${clearance('slide')} (without force), turn ${clearance('turn')} (turns freely); the material's values brought to this nozzle: they grow with a nozzle wider than ${mm(CLEARANCE_NOZZLE)} and never go under their ${mm(CLEARANCE_NOZZLE)} values on a finer one. ${room} A round hole also gets the material's hole allowance on its diameter. ${BLOCK_TOOL} and ${MECHANISM_TOOL} add both themselves: give them nominal sizes (the screw, the insert, the magnet, the peg, the shaft), never a size with clearance or allowance added, or they come out twice as loose. A part that holds something (a clip on a cable, tube or pen) grips it: wrap round items more than halfway, with the push fit and an opening narrower than the item. Ask only when the purpose is unclear.`,
    `- Printing comes first: nothing leans more than ${String(material.overhang)}° without support, no support that a better shape or orientation avoids, and stand the part so loads and snap arms run along the layers, not across them. A refinement never makes function or printing worse; leave it out where it would.`,
  ];
  if (design.rounding)
    lines.push(
      `- Edges: round outer edges that are seen or touched, radius 1 mm on parts under 30 mm, 2 mm up to 100 mm, 3 mm above (own choice), never more than the wall they cut into. Edges on the bed get a 45° chamfer, not a fillet, ${series(layer, 2, 3)} high, which also takes up the elephant's foot (0.1 to ${mm(ELEPHANT_FOOT)}: Prusa about 0.2, Bambu Lab 0.1 to 0.2, OrcaSlicer up to 0.25). Round inner corners under load with at least half the wall thickness (guides say a quarter to the whole wall: MakerVerse, Xometry), and at least ${mm(Math.max(1, printer.nozzle * 2))} (own choice). Use at most two or three radii per part so they match.`,
    );
  if (design.printInPlace)
    lines.push(
      `- Hinges, guides, snap closures and clips: build them with partbuddy_mechanism (hinges print in place in one piece with this printer's gap; guides, closures and clips print as separate parts). Other joints you model yourself (a wheel on its axle, a lever): first look for a print-in-place solution that prints without support, with ${mm(gap)} gap all round the moving parts (one nozzle, at least ${mm(MOVING_GAP)}: Prusa), the pin lying flat with 45° cones or teardrop holes instead of flat ceilings, and a ${mm(layer * 2)} chamfer on the moving parts' bed edges so they do not fuse. Snap arms long enough to bend within what the material takes, which ${BLOCK_TOOL} snapFit checks at the root (in this material on this nozzle at least ${mm(snapArm(printer, material))} for its ${mm(snapHook(printer, material).thickness)} arm with a ${mm(snapHook(printer, material).catch)} catch; a deeper catch or a thicker arm needs more), with a 30–45° lead-in (own choice). When print-in-place does not work (load, size, material), choose another joint on purpose and say why in one sentence.`,
    );
  if (design.details)
    lines.push(
      `- Details: keep walls the same thickness throughout (one wall parameter), chamfer hole and screw entries ${mm(ENTRY_CHAMFER)} × 45° and give mating edges a 0.5 mm lead-in chamfer so parts go together (both own choice), sink screw heads (counterbore or countersink), and blend changes in thickness with a radius or a 45° slope instead of a sharp step. Details that have to hold at least ${mm(Math.max(STURDY, line))} (Xometry). Embossed or engraved text at least ${mm(textDepth(printer))} deep and ${mm(textStroke(printer))} wide per stroke (Xometry: 0.5 mm and 1 mm).`,
    );
  if (design.snap)
    lines.push(
      `- Sizes you choose yourself snap up to the printer: walls and ribs to whole lines of ${mm(line)} (${series(line, 2, 5)}), floors, lids, steps and chamfer heights to whole layers of ${mm(layer)} (${series(layer, 3, 6)}), floors and lids at least ${mm(minimumFloor(layer))} (four layers and 0.8 mm: Stratasys, Hubs), print-in-place gaps ${mm(gap)}, radii at least ${mm(printer.nozzle)} and details at least one line. Mark each such parameter's comment with the multiple, e.g. "Wall [auto 3×line]", "Floor [auto 5×layer]", "Hinge gap [auto 1×nozzle]", so PartBuddy fits it again when the user changes printer or nozzle. Sizes the user named get no mark.`,
    );
  // Material and print time (2026-11-12): what the shape decides of them, by the makers' design guides (Prusa, Protolabs
  // Network, Markforged, Stratasys Direct); what the slicer decides is named as not the assistant's to promise.
  if (design.economy)
    lines.push(
      `- Material and print time, from the first shape on and not as a clean-up: build a shell, not a block. Slicers print two to four lines (${mm(minWall)} to ${mm(4 * line)}) as wall and fill anything thicker with sparse infill, so stiffen with ribs as thick as the wall, at least two lines (${mm(minWall)}), instead of thickening the wall. Keep the part low as it prints: every ${mm(layer)} of height is one more layer, and print time grows with the layers. Shape it so it needs no support, which costs more time and material than any other choice. Leave out whole regions that do nothing (an open frame instead of a plate, a shorter body); small pockets and holes in a filled region add walls and save little or nothing. Split a part only when that saves support or much height and a joint is acceptable. Loaded regions, sizes the user names and what the user wants solid stay as they are. Infill, speed and layer height are set in the slicer: never promise grams or minutes. The print check lists each body's solid volume, height, layers and support area: compare them before and after a change.`,
    );
  if (off.length > 0)
    // audit H-28: the groups may have been turned off by the assistant with partbuddy_design_rules, so the note does not say "the user".
    lines.push(`- Turned off for this part, in PartBuddy's settings or with ${DESIGN_TOOL} in the chat: ${off.map((rule) => RULE_NAMES[rule]).join(', ')}. Do not add them unless the user asks for them.`);
  lines.push(
    `- After each design step, name what you added on your own${design.economy ? ', what you did for material and print time' : ''} and the sizes you snapped in one short line, e.g. "Outer edges 2 mm rounded, hinge print-in-place with ${mm(gap)} gap, lid slide fit ${clearance('slide')}${design.economy ? `, shell ${mm(line * 3)} with two ribs instead of a solid block` : ''}", so the user can turn it off or change it.`,
    `- When the user turns one of these off or back on ("no fillets", "screw the hinge instead", "make it solid"), call partbuddy_design_rules, so it holds for the rest of the project, also after a restart.`,
  );
  return lines;
}

export function printNote({ printer, material: used, design }: PartPrint): string {
  const name = (text: string) => JSON.stringify(text.slice(0, 60));
  const [x, y, z] = printer.bed;
  const fit = (value: number) => mm(scaleClearance(value, printer, used.measuredNozzle));
  const { clamp, push, slide, turn } = used.clearance;
  return [
    `[PartBuddy: print profile of this part. Printer ${name(printer.name)}: build volume ${String(x)} × ${String(y)} × ${String(z)} mm,`,
    `nozzle ${mm(printer.nozzle)}, layer height ${mm(printer.layer)}; walls thinner than ${mm(minimumWall(printer.nozzle))} (two lines) print poorly, and walls or details thinner than ${mm(thinnestLine(printer.nozzle))}, the narrowest line a slicer lays, do not print. The print check blocks such walls where they cover more than a few square millimetres and only warns about smaller spots; fine details and text it does not check.`,
    `Material ${name(used.name)}: faces leaning more than ${String(used.overhang)}° from the vertical need support; holes come out about ${mm(used.holeShrink)} smaller in diameter, a guide value for holes of ${String(HOLE_SIZES[0])} to ${String(LARGEST_HOLE)} mm that the hole plate of the tolerance pieces measures on this printer; larger ones shrink more, about ${mm(holeAllowance(used.holeShrink, COMPENSATED_CIRCLE))} at ${String(COMPENSATED_CIRCLE)} mm, growing evenly in between (shrinkage is a share of the size).`,
    `Clearance per side between mating parts, for this nozzle (${used.measuredNozzle === undefined ? 'not measured with the tolerance pieces' : 'measured with the tolerance pieces'}): clamp ${fit(clamp)}, push ${fit(push)}, slide ${fit(slide)}, turn ${fit(turn)}.`,
    'It is printed as designed, standing on its lowest point along +Z. A body that prints turned over (a lid on its top) gets its print face instead: body.print_face {body, point} with a point on the flat face that goes on the bed; the check and the slicer then lay it on that face.',
    ...withoutSupportLines(used.overhang, printer.nozzle),
    ...designLines(design, printer, used),
    `Keep nominal sizes as parameters, add the clearance and the hole allowance as their own parameters where you model a fit yourself (${BLOCK_TOOL} and ${MECHANISM_TOOL} add them), and say which fit you chose.]`,
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
