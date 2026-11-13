/**
 * Sizes that fit the nozzle and the layer height (decided 2026-11-07). The assistant snaps the sizes
 * it chooses itself and marks them in the parameter comment, e.g. "Wall [auto 3×line]"; when the
 * user changes printer or nozzle, PartBuddy fits only those again. Sizes the user names carry no
 * mark and are never changed, also in projects from before.
 */

export interface FitPrinter {
  nozzle: number;
  layer: number;
}

/** What a size is a multiple of: an extrusion line (walls), a layer (heights) or the nozzle (gaps, radii). */
export type FitUnit = 'line' | 'layer' | 'nozzle';

const round = (value: number) => Math.round(value * 1000) / 1000;
const EPSILON = 1e-6;

/** The width of one extrusion line, the slicers' default of 112.5 % of the nozzle. */
export function lineWidth(printer: FitPrinter): number {
  return round(printer.nozzle * 1.125);
}

export function unitSize(unit: FitUnit, printer: FitPrinter): number {
  return unit === 'line' ? lineWidth(printer) : unit === 'layer' ? printer.layer : printer.nozzle;
}

/** The gap between moving print-in-place parts: one nozzle width, never under 0.3 mm. */
export function printInPlaceGap(printer: FitPrinter): number {
  return round(Math.max(0.3, printer.nozzle));
}

/** The nozzle the clearances of a material profile stand for when none was measured. */
export const CLEARANCE_NOZZLE = 0.4;

/**
 * Clearances of the material profiles are starting values for a 0.4 mm nozzle; a wider nozzle needs more.
 * Clearances read off the tolerance pieces hold for the nozzle they were printed with (`from`): on that
 * nozzle they are used as read.
 */
export function scaleClearance(clearance: number, printer: FitPrinter, from = CLEARANCE_NOZZLE): number {
  return round((clearance * printer.nozzle) / from);
}

export type SizeKind = 'wall' | 'height' | 'gap' | 'detail';

const UNIT_OF: Record<SizeKind, FitUnit> = { wall: 'line', height: 'layer', gap: 'nozzle', detail: 'nozzle' };
/** The fewest units that still print: two lines of wall, one layer, the minimum gap, one nozzle of detail. */
const MINIMUM: Record<SizeKind, (printer: FitPrinter) => number> = {
  wall: (printer) => round(2 * lineWidth(printer)),
  height: (printer) => printer.layer,
  gap: () => 0.2,
  detail: (printer) => printer.nozzle,
};

/** A size the assistant chooses, rounded up to the next whole multiple, never under the minimum. */
export function snapSize(kind: SizeKind, value: number, printer: FitPrinter): number {
  if (kind === 'gap') return round(Math.max(value, printInPlaceGap(printer)));
  const unit = unitSize(UNIT_OF[kind], printer);
  const snapped = round(Math.ceil(value / unit - EPSILON) * unit);
  return round(Math.max(snapped, MINIMUM[kind](printer)));
}

export interface FittedSize {
  value: number;
  /** For a size of the user's: why another value prints better, and which; null when it fits. */
  warning: string | null;
}

/**
 * The rule in one place: a size of the user's stays exactly as given and at most gets a warning
 * with a better value; a size of the assistant's is snapped.
 */
export function fitSize(kind: SizeKind, value: number, by: 'user' | 'assistant', printer: FitPrinter): FittedSize {
  const snapped = snapSize(kind, value, printer);
  if (by === 'assistant') return { value: snapped, warning: null };
  const minimum = MINIMUM[kind](printer);
  const mm = (size: number) => `${String(round(size))} mm`;
  if (value < minimum - EPSILON) return { value, warning: `${mm(value)} is under the printable ${mm(minimum)}; ${mm(snapped)} prints reliably.` };
  if (kind === 'wall' && Math.abs(snapped - value) > EPSILON) return { value, warning: `${mm(value)} is not a whole number of ${mm(lineWidth(printer))} lines; ${mm(snapped)} prints cleaner.` };
  return { value, warning: null };
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
 * The value a marked size has on this printer. Walls and heights keep their size, rounded up to the
 * new grid of lines or layers (counting layers made a 6 mm rim 9 mm on a 0.3 mm layer, live run
 * 2026-11-07); gaps and other nozzle sizes grow with the nozzle and stop shrinking at 0.3 mm a nozzle.
 */
export function fittedValue(mark: FitMark, value: number, printer: FitPrinter): number {
  if (mark.unit === 'line') return snapSize('wall', value, printer);
  if (mark.unit === 'layer') return snapSize('height', value, printer);
  // A gap marked in nozzles never goes under what keeps moving parts apart (0.3 mm), however fine the nozzle.
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
