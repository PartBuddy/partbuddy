/**
 * Sizes that fit the nozzle and the layer height (decided 2026-11-07). The assistant snaps the sizes
 * it chooses itself and marks them in the parameter comment, e.g. "Wall [auto 3×line]"; when the
 * user changes printer or nozzle, PartBuddy fits only those again. Sizes the user names carry no
 * mark and are never changed, also in projects from before: the print check warns about them
 * (`thinnestLine`, `minimumWall`, the push fit and the print-in-place gap), and the rule text tells
 * the assistant to name the better value (printProfiles.ts).
 */
import { minimumWall, narrowestGap } from '@partbuddy/geometry';

export interface FitPrinter {
  nozzle: number;
  layer: number;
}

/** What a size is a multiple of: an extrusion line (walls), a layer (heights) or the nozzle (gaps, radii). */
export type FitUnit = 'line' | 'layer' | 'nozzle';

/** To 0.001 mm, as the print check compares (PR #381). */
const round = (value: number) => Math.round(value * 1000) / 1000;
const EPSILON = 1e-6;

/**
 * The width of one extrusion line: half the print check's two-line wall (`minimumWall`, 112.5 % of the nozzle), so two
 * lines here are the check's minimum at every nozzle (audit MG-17, D37: 1.126 against 1.13 at 0.5 mm). 112.5 % is
 * the widest of the slicers' defaults, not the line each of them lays: PrusaSlicer 0.45 mm at 0.4 (112.5 %), Bambu
 * Studio 0.42 mm outer and 0.45 mm inner wall at 0.4 and 0.62 mm at 0.6 (fdm_process_common.json,
 * fdm_process_single_0.30_nozzle_0.6.json), OrcaSlicer 105–120 % for the outer wall (wiki, Line Width). Overlapping
 * lines make n lines a little narrower than n widths (two 0.4 mm lines at 0.2 mm layers: 0.714 mm, OrcaSlicer wiki,
 * Precision), so a wall of n of these widths is the upper bound: it holds n lines in every one of these slicers
 * (audit T19, MG-09, MG-10). A guide value for the grid, PartBuddy's own choice.
 */
export function lineWidth(printer: FitPrinter): number {
  return round(minimumWall(printer.nozzle) / 2);
}

/** The most a first layer is squeezed wider, which a bed chamfer takes up: 0.1 to 0.25 mm (Prusa about 0.2, Bambu Lab 0.1 to 0.2, OrcaSlicer up to 0.25). */
export const ELEPHANT_FOOT = 0.25;

/** The gap between moving print-in-place parts: one nozzle width, never under 0.3 mm; the print check's narrowest slot (BC-24). */
export function printInPlaceGap(printer: FitPrinter): number {
  return narrowestGap(printer.nozzle);
}

/** The nozzle the clearances of a material profile stand for when none was measured. */
export const CLEARANCE_NOZZLE = 0.4;

/** What a nozzle does to a clearance: nothing under 0.4 mm, in proportion above. */
const clearanceReach = (nozzle: number) => Math.max(nozzle, CLEARANCE_NOZZLE);

/**
 * Clearances of the material profiles are starting values for a 0.4 mm nozzle; a wider nozzle needs more. Clearances
 * read off the tolerance pieces hold for the nozzle they were printed with (`from`): on that nozzle they are used as
 * read. A finer nozzle never takes a clearance under its 0.4 mm value: the printer's accuracy (± 0.2 to 0.5 mm, Prusa,
 * Protolabs Network) does not halve with the nozzle, and moving parts need 0.3 mm whatever the nozzle (Prusa; audit
 * MG-12, T20). An interference (below zero) stays as it is: a wider nozzle would only press harder.
 * shortcut: the growth above 0.4 mm is PartBuddy's own choice, no source scales clearance with the nozzle; the tolerance
 * pieces measure it for the nozzle in use, so replace it if their readings on 0.6 and 0.8 mm say otherwise.
 */
export function scaleClearance(clearance: number, printer: FitPrinter, from = CLEARANCE_NOZZLE): number {
  if (clearance <= 0) return clearance;
  return round((clearance * clearanceReach(printer.nozzle)) / clearanceReach(from));
}

export type SizeKind = 'wall' | 'height' | 'gap';

/**
 * A size the assistant chooses, rounded up to the next whole multiple: walls of lines and at least two of them (the
 * check's `minimumWall`), heights of layers and at least one, gaps at least the print-in-place gap.
 */
export function snapSize(kind: SizeKind, value: number, printer: FitPrinter): number {
  if (kind === 'gap') return round(Math.max(value, printInPlaceGap(printer)));
  const unit = kind === 'wall' ? lineWidth(printer) : printer.layer;
  const least = kind === 'wall' ? minimumWall(printer.nozzle) : printer.layer;
  return round(Math.max(round(Math.ceil(value / unit - EPSILON) * unit), least));
}

export interface FitMark {
  count: number;
  unit: FitUnit;
}

const MARK = /\[auto\s+(\d+(?:[.,]\d+)?)\s*[×x*]\s*(line|layer|nozzle)\]/i;

/** "Wall [auto 3×line]" → 3 lines; null for a size without the mark, which is the user's. */
export function fitMarkOf(comment: string): FitMark | null {
  const match = MARK.exec(comment);
  if (!match) return null;
  const count = Number.parseFloat((match[1] ?? '').replace(',', '.'));
  return count > 0 && Number.isFinite(count) ? { count, unit: (match[2] ?? '').toLowerCase() as FitUnit } : null;
}

/** The comment without the mark, as the parameter table shows it. */
export function withoutFitMark(comment: string): string {
  return comment.replace(MARK, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The value a marked size has on this printer. Walls and heights keep their size, rounded up to the new grid of lines
 * or layers (decided 2026-11-07: counting layers made a 6 mm rim 9 mm on a 0.3 mm layer). Sizes marked in nozzles are
 * that many print-in-place gaps: a gap never closes under what keeps moving parts apart, however fine the nozzle
 * (audit MG-05, #352; the gap the check holds parts to, #381).
 * shortcut: the mark does not say gap or radius, and a gap that narrows fuses while a wider radius is harmless, so a
 * radius follows the gap too ("2×nozzle" is 0.6 mm on a 0.2 mm nozzle, not 0.4; BC-14 review S3); give the mark a kind
 * ("[auto 2×gap]") if radii should follow the nozzle itself.
 * shortcut: the mark keeps the count it was written with, so after a change to a coarser grid a wall or height can
 * stand on more units than its mark says, and changing back keeps the larger size (0.9 mm "2×line" is 1.35 mm on
 * 0.6 mm and stays 1.35 on 0.4; audit T21, MG-15); fix it when refit may rewrite the mark with the size it was
 * designed at (main/index.ts refitSizes, dimensions.ts apply).
 */
export function fittedValue(mark: FitMark, value: number, printer: FitPrinter): number {
  if (mark.unit === 'line') return snapSize('wall', value, printer);
  if (mark.unit === 'layer') return snapSize('height', value, printer);
  return round(mark.count * printInPlaceGap(printer));
}

/** The assistant's marked sizes whose value changes on this printer; the user's sizes are never in it. */
export function refit(parameters: readonly { name: string; value: number; comment: string }[], printer: FitPrinter): { name: string; value: number }[] {
  return parameters.flatMap((parameter) => {
    const mark = fitMarkOf(parameter.comment);
    if (!mark) return [];
    const value = fittedValue(mark, parameter.value, printer);
    return Math.abs(value - parameter.value) > EPSILON ? [{ name: parameter.name, value }] : [];
  });
}
