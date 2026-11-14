import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

import {
  DESIGN_DEFAULTS,
  DESIGN_RULES,
  HINT_DEFAULTS,
  partMaterialRequestSchema,
  printSettingsSchema,
  type DesignRule,
  type DesignRules,
  type MaterialProfile,
  type PartPrint,
  type PrintSettings,
} from '../../shared/contract';
import { ENTRY_CHAMFER, STURDY, TEXT_STROKE, textDepth, textStroke } from '../../shared/blocks';
import { LEAD_IN, PEG, snapHook, snapLength, snapLimit } from '../../shared/mechanisms';
import { BED_CHAMFER_LAYERS } from '../../shared/standards';
import { CLEARANCE_NOZZLE, lineWidth, printInPlaceGap, scaleClearance, type FitPrinter } from '../../shared/designFit';
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
  hints: HINT_DEFAULTS,
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
      hints: settings.hints,
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


/**
 * Rules for designing without support (M7f, decided 2026-11-05), from what the practice run and
 * the slicer showed and the common design-for-printing advice. Bridges over counterbores facing the
 * bed are left to the slicer, which builds them itself (plan step R1). The spans are the print
 * check's own (audit T25, D18). The material's angle stands alone in the profile's material line;
 * these lines say only how to stay within it (audit 10, W6). Sources, kept out of the model's text
 * to keep it short (audit 10 review): a fillet's bottom ends flat (Prusa); lying holes up to 8 mm
 * (MakerVerse); bridges up to 10 mm (UltiMaker; Hubs: no sag at all up to 5 mm); ledges of four lines
 * (OrcaSlicer, see `smallLedge`).
 */
function withoutSupportLines(lean: string, nozzle: number): string[] {
  return [
    `- Print it without support, standing as designed or on the print face you set; where support cannot be avoided, tell the user which faces need it and why. Steep here means ${lean}. Edges that face down, on the bed too: where you would round them, give them a steep chamfer. Holes lying across the layers print round up to ${String(LYING_HOLE)} mm across; wider ones get a steep teardrop roof or that roof cut flat.`,
    `- Walls at most ${String(BRIDGE_SPAN)} mm apart are bridged, and ledges reaching out at most ${mm(smallLedge(nozzle))} (four lines) from the material below need no support, as the print check counts them. Anything wider gets a steep slope underneath or another side down. Model these chamfers, roofs and slopes as features from this profile, not as parameters, and name them when you report.`,
  ];
}

/** Every multiple from `from` to `to` units, as the model reads them: "0.9, 1.35, 1.8 mm". */
function series(unit: number, from: number, to: number): string {
  const values: string[] = [];
  for (let count = from; count <= to; count += 1) values.push(String(Math.round(unit * count * 1000) / 1000));
  return `${values.join(', ')} mm`;
}

/** "a, b and c". */
const listed = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`);

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

/** The least height of bold capitals whose strokes are `textStroke` wide, as partbuddy_block text advises it (blockTool.ts). */
const letterHeight = (printer: FitPrinter) => Math.ceil((textStroke(printer) / TEXT_STROKE.bold) * 10 - 1e-6) / 10;

/**
 * What a careful FDM designer does without being asked (decided 2026-11-07), ranked by Manuel's order of
 * 2026-11-14: it works, prints without support, holds, looks good, prints fast. Five groups the user can turn
 * off: in the settings for every project, in the chat for one; function, support, strength and looks stay on.
 * The sizes come from the printer in use, so they fit its nozzle and layer height. Sizes the user names are
 * above all of it. Every fixed size has a source or is PartBuddy's own choice (audit D29): the model's text
 * marks own choices only, and the comments next to the lines name the sources (audit 10 review: shorter text).
 */
export function designLines(design: DesignRules, printer: FitPrinter, material: MaterialProfile): string[] {
  const line = lineWidth(printer);
  const layer = printer.layer;
  const gap = printInPlaceGap(printer);
  // The material's angle where it prints less than 45° (PETG 40°, TPU 35°), so a chamfer or roof built to these rules is no overhang itself.
  const lean = `leaning at most ${String(Math.min(45, material.overhang))}° from the vertical`;
  const clearance = (fit: keyof MaterialProfile['clearance']) => mm(scaleClearance(material.clearance[fit], printer, material.measuredNozzle));
  // A measured clamp fit may be below zero (the schema allows it): then it is an interference, not room.
  const room = Object.values(material.clearance).every((value) => value >= 0)
    ? 'Each is room, never an interference.'
    : 'A value below zero is an interference: the part is that much larger than its seat, per side.';
  const measured = material.measuredNozzle === undefined ? 'not measured with the tolerance pieces' : 'measured with the tolerance pieces';
  // On the nozzle the values stand for they are used as read (scaleClearance), so only another nozzle needs the sentence.
  const scaled = printer.nozzle === (material.measuredNozzle ?? CLEARANCE_NOZZLE) ? '' : `; brought to this nozzle, they grow with a nozzle wider than ${mm(CLEARANCE_NOZZLE)} and never go under their ${mm(CLEARANCE_NOZZLE)} values on a finer one`;
  const off = (Object.keys(RULE_NAMES) as DesignRule[]).filter((rule) => !design[rule]);
  const lines = [
    // Audit 10, W5: one ranking, said once; the last goal only while its group is on.
    `Design it well without being asked, in every design unless the user says otherwise. Goals by rank, none at the cost of an earlier one: it works, prints without support, holds, looks good${design.economy ? ', prints fast and lean' : ''}. Figures not marked own choice follow printing guides.`,
    // W7: the thin-wall limits as the user's sizes need them; the profile line above only names what prints.
    `- Sizes the user names are fixed: build them exactly, never round them to the nozzle or layer. If one does not print at all (a wall or detail under ${mm(thinnestLine(printer.nozzle))} or a floor under one layer, which the print check blocks) or is implausible (ten times off the rest, a hole wider than its face), do not build it: ask with ${ASK_TOOL}, offering the value as given and the nearest one that prints. One that only prints less well (a wall under two lines or not a whole number of ${mm(line)} lines, a detail under one line, a floor under ${mm(minimumFloor(layer))}) is built as given, with one sentence on the better value. Lips and snap arms under two lines do not hold and ${BLOCK_TOOL} refuses them: ask for those too.`,
    `- Fits follow the purpose: nominal size plus the clearance per side, clamp ${clearance('clamp')} (tight, only with force), push ${clearance('push')} (in by hand), slide ${clearance('slide')} (without force), turn ${clearance('turn')} (turns freely), the material's values (${measured}${scaled}). ${room} A round hole also gets the material's hole allowance on its diameter. ${BLOCK_TOOL} and ${MECHANISM_TOOL} add both themselves: give them nominal sizes, or they come out twice as loose. Where you model a fit yourself, put both into the feature or a formula over the nominal size and say which fit you chose. A part that holds something (a clip on a cable, tube or pen) grips it: wrap round items more than halfway, with the push fit and an opening narrower than the item. Ask only when the purpose is unclear.`,
  ];
  if (design.snap)
    lines.push(
      // Floors of four layers and 0.8 mm: Stratasys, Hubs.
      `- Sizes you choose yourself snap up to the printer: walls and ribs to whole lines of ${mm(line)} (${series(line, 2, 5)}), floors, lids and steps to whole layers of ${mm(layer)} (${series(layer, 3, 6)}), floors and lids at least ${mm(minimumFloor(layer))}, print-in-place gaps ${mm(gap)}, details at least one line. Where such a size is a parameter, put it in the group [Druck] and mark its comment with the multiple, e.g. "[Druck] Wall [auto 3×line]", "[Druck] Hinge gap [auto 1×nozzle]", so PartBuddy refits it for another printer; sizes the user named get no mark.`,
    );
  lines.push(
    // Across the layers a part holds a fraction (Hubs, CNC Kitchen); a broken part is worse than one that needs support.
    '- Function: know what the part holds, carries and touches and the direction of its main load. Stand it so that load and any snap arm run along the layers, never pulling them apart: this is "it works" and goes before printing without support.',
  );
  lines.push(
    ...withoutSupportLines(lean, printer.nozzle),
  );
  if (design.printInPlace)
    lines.push(
      // The gap: one nozzle, at least 0.3 mm (Prusa).
      `- Hinges, guides, snap closures and clips: build them with ${MECHANISM_TOOL}. Joints you model yourself (a wheel on its axle, a lever): first look for a print-in-place solution without support, ${mm(gap)} gap all round the moving parts, the pin lying flat with steep cones or teardrop holes, and their bed edges chamfered ${mm(layer * 2)} so they do not fuse. Snap arms long enough to bend within the material, as ${BLOCK_TOOL} snapFit checks at the root (here at least ${mm(snapArm(printer, material))} for its ${mm(snapHook(printer, material).thickness)} arm with a ${mm(snapHook(printer, material).catch)} catch; deeper catches and thicker arms need more), with a 30–45° lead-in (own choice). Where it does not suit (load, size, material), choose another joint and say why.`,
    );
  lines.push(
    // Walls over infill: Prusa, CNC Kitchen. Ribs as thick as the wall: Stratasys (thinner ribs are injection moulding's, W9);
    // low and tied at both ends: Fictiv's FEA. Gussets on bosses: Stratasys, Fictiv. Pins under 5 mm: Hubs, Xometry.
    `- Strength comes from the walls, not the infill: where the part carries load, walls of four lines (${mm(4 * line)}), and tell the user to set four perimeters. Ribs, not thicker walls, stiffen: as thick as the wall, at most three walls high, in the plane the part bends in, both ends tied to a wall or boss; several low ribs beat one tall one. A boss taller than twice its diameter (own choice) is tied to a wall or gets three or four gussets. Pins printed standing under 5 mm hold little across: a fillet at the foot, a bought pin where one must hold.`,
    // Springs: Hubs, Fictiv (snap-fit guides).
    '- A spring or flexing arm you model yourself lies in the layers, is at least 5 mm wide, tapers to half its root thickness at the tip and has a root fillet of half that thickness. Under a lasting load allow a tenth of a breaking load (own choice; plastic creeps), and say so when the user names a weight.',
  );
  // CNC Kitchen: a hook on 0.3 mm layers (0.4 mm nozzle) held half.
  if (layer > printer.nozzle / 2) lines.push('- This layer is more than half the nozzle: for a part under load, say that thinner layers hold better.');
  lines.push(
    // Always on (audit 10 review): what is seen is no refinement to switch off. Seen face: Hubs, Prusa; seam: Prusa;
    // text: bold sans-serif (Stratasys, HLH Rapid), depth and stroke Xometry (0.5 and 1 mm), capitals from the stroke.
    '- Looks: put the face seen most on top as one flat level or on the bed, never over support. Seen faces facing up lie flat or lean at least 15° from horizontal (own choice). A part round in plan shows its seam: if it is seen from all sides, give it a sharp upright edge or a small groove at the back for it (own choice), or tell the user.',
    `- Text and logos: a bold sans-serif font, capitals at least ${mm(letterHeight(printer))} high, at least ${mm(textDepth(printer))} deep or high and ${mm(textStroke(printer))} wide per stroke; raised or engraved on top faces, engraved on bed faces, either on upright faces, never over support.`,
  );
  if (design.rounding)
    lines.push(
      // W1: inside of a shell corner = outer − wall (Envalior); W8: one order for every least radius. Under load: guides say a
      // quarter to the whole wall (MakerVerse, Xometry). Elephant's foot 0.1 to 0.25 mm: Prusa, Bambu Lab, OrcaSlicer.
      `- Edges: round outer edges that are seen or touched, radius 1 mm on parts under 30 mm, 2 mm up to 100 mm, 3 mm above (own choice), at most three radii per part; plate and rib edges at most half their thickness. Top edges: a fillet of at least five layers (${mm(5 * layer)}) or a 45° chamfer (own choice). Bed edges: a chamfer ${mm(BED_CHAMFER_LAYERS[0] * layer)} to ${mm(BED_CHAMFER_LAYERS[1] * layer)} high (${String(BED_CHAMFER_LAYERS[0])} to ${String(BED_CHAMFER_LAYERS[1])} layers) against the elephant's foot. Inner corners never under one nozzle (${mm(printer.nozzle)}); on a shell the inside of a rounded edge is the outer radius less the wall, so the wall stays even; under load the larger of that, half the wall and ${mm(Math.max(1, printer.nozzle * 2))} (own choice).`,
    );
  if (design.details)
    lines.push(
      // W3: entry and lead-in chamfers are the tools' fixed sizes, so steps but not these snap to layers. Details 1 mm: Xometry.
      `- Details: one wall thickness throughout (one wall parameter), changes blended with a radius or a steep slope; hole and screw entries chamfered ${mm(ENTRY_CHAMFER)} × 45°, as ${BLOCK_TOOL} builds them, and mating edges a lead-in chamfer as ${MECHANISM_TOOL} builds them (${mm(PEG.chamfer)} on pegs, ${mm(LEAD_IN)} on lid lips; own choice); screw heads sunk (counterbore or countersink); details that have to hold at least ${mm(Math.max(STURDY, line))}.`,
    );
  // Material and print time (2026-11-12): what the shape decides of them, by the makers' design guides (Prusa, Protolabs
  // Network, Markforged, Stratasys Direct); what the slicer decides is named as not the assistant's to promise.
  if (design.economy)
    lines.push(
      // W4: slicers fill a closed body sparsely anyway, a cavity adds walls and a bridged ceiling (Stratasys: solid is often faster).
      `- Material and print time, from the first shape on: leave out volume that does nothing (an open bottom, a frame instead of a plate, a shorter body), but never hollow a closed body; small pockets in a filled region save nothing. Keep the part low as it prints: every ${mm(layer)} of height is one more layer. Split a part only when that saves support or much height and a joint is acceptable. Loaded regions and what the user wants solid stay as they are. Infill, speed and layer height are the slicer's: never promise grams or minutes; compare the print check's figures before and after.`,
    );
  if (off.length > 0)
    // audit H-28: the groups may have been turned off by the assistant with partbuddy_design_rules, so the note does not say "the user".
    lines.push(`- Turned off for this part, in PartBuddy's settings or with ${DESIGN_TOOL} in the chat: ${off.map((rule) => RULE_NAMES[rule]).join(', ')}. Do not add them unless the user asks for them.`);
  // The report and its example follow the switches, so it never names what is turned off.
  const report = ['what you added on your own', ...(design.economy ? ['what you did for material and print time'] : []), ...(design.snap ? ['the sizes you snapped'] : [])];
  const example = [
    ...(design.rounding ? ['outer edges 2 mm rounded'] : []),
    ...(design.printInPlace ? [`hinge print-in-place with ${mm(gap)} gap`] : []),
    `lid slide fit ${clearance('slide')}`,
    ...(design.economy ? [`open frame with two ${mm(line * 3)} ribs instead of a solid plate`] : []),
  ].join(', ');
  lines.push(
    `- After each design step, name ${listed(report)} in one short line, e.g. "${example.charAt(0).toUpperCase()}${example.slice(1)}", so the user can turn it off or change it.`,
    `- When the user turns one of these off or back on ("no fillets", "screw the hinge instead", "make it solid"), call ${DESIGN_TOOL}, so it holds for the rest of the project, also after a restart.`,
  );
  return lines;
}

/**
 * The profile as the model reads it (English, like every note to the model). It names what the
 * practice run of 2026-11-04 missed: parts were built at nominal size and fits came up only when
 * asked. Names are the user's own text, so they are quoted and cut short. The clearances are named
 * once, in the design rules' fits.
 */
export function printNote({ printer, material: used, design }: PartPrint): string {
  const name = (text: string) => JSON.stringify(text.slice(0, 60));
  const [x, y, z] = printer.bed;
  const lines = designLines(design, printer, used);
  return [
    `[PartBuddy: print profile of this part. Printer ${name(printer.name)}: build volume ${String(x)} × ${String(y)} × ${String(z)} mm,`,
    `nozzle ${mm(printer.nozzle)}, layer height ${mm(printer.layer)}; walls thinner than ${mm(minimumWall(printer.nozzle))} (two lines) print poorly, and walls or details thinner than ${mm(thinnestLine(printer.nozzle))}, the narrowest line a slicer lays, do not print. The print check blocks such walls over a few mm² and does not check fine details and text.`,
    `Material ${name(used.name)}: faces leaning more than ${String(used.overhang)}° from the vertical need support; holes come out about ${mm(used.holeShrink)} smaller in diameter from ${String(HOLE_SIZES[0])} to ${String(LARGEST_HOLE)} mm (measured with the tolerance pieces' hole plate) and about ${mm(holeAllowance(used.holeShrink, COMPENSATED_CIRCLE))} at ${String(COMPENSATED_CIRCLE)} mm, growing evenly in between.`,
    'It is printed as designed, standing on its lowest point along +Z. A body that prints turned over (a lid on its top) gets its print face instead: body.print_face {body, point} with a point on the flat face that goes on the bed.',
    ...lines.slice(0, -1),
    `${lines.at(-1) ?? ''}]`,
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
