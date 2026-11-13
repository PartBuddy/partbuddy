import { BOLD_FONT, textDepth } from './blocks';
import { ELEPHANT_FOOT, snapSize } from './designFit';
import { FIT_STEPS, HOLE_SIZES, OVERHANG_STEPS } from './tolerances';

/**
 * The test pieces of the tolerance assistant, built with SolidCraft's own commands like the
 * templates (F3): a fit comb with a pin, a hole plate and an overhang staircase, each step with its
 * value engraved. They keep the rules the assistant gets (audit T27, MV-16): heights are whole layers
 * of the printer in use, the engraving `textDepth`, the letters bold with a digit stroke
 * of two nozzles, and every hole a 45° chamfer at the bed, so the elephant's foot does not narrow the
 * holes that are measured. Fixed numbers, no parameters: they are made, printed and thrown away.
 * Checked with `solidcraft-cli run --param-check strict` (0.40.1) on 2026-11-13 for nozzles 0.25, 0.4, 0.6 and 0.8.
 */

type Step = { command: string; params: Record<string, unknown> };

/** The diameter of the comb's pin; each hole is this plus twice the step's clearance. */
export const PIN = 6;
/** The fit comb's holes per row. */
const PER_ROW = 5;
/**
 * The thinnest stroke of a digit in Arial bold as a share of the cap height: 0.134, the top bar of the 5, measured on
 * SolidCraft 0.40.1 (2026-11-13, 10 mm digits, narrowest neck of the engraved glyph). blocks.ts TEXT_STROKE (0.2019) is the
 * capital I; the bars of 0, 2 and 5 are thinner (BC-20 review). The tails of 6 and 9 taper further, as every stroke end.
 */
export const DIGIT_STROKE = 0.134;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function testPieceSteps({ nozzle, layer }: { nozzle: number; layer: number }): Step[] {
  const printer = { nozzle, layer };
  const layers = (mm: number) => snapSize('height', mm, printer);
  const engraving = textDepth(printer);
  // Cap height for a digit stroke of two nozzles, the block check's text rule (blockLimit), on 0.5 mm and at least the
  // earlier 3 mm: 3 mm on 0.2, 4 on 0.25, 6 on 0.4, 9 on 0.6, 12 on 0.8. The rule text's 1 mm (textStroke) is not
  // taken: on a 0.4 mm nozzle it asks 7.5 mm digits, and the staircase would outgrow a 120 mm bed.
  const letters = Math.max(3, Math.ceil(((2 * nozzle) / DIGIT_STROKE) * 2 - 1e-9) / 2);
  // Two layers as the rule text's bed chamfer, more where two do not take up the elephant's foot (0.12 mm layers).
  const chamfer = round(Math.max(2, Math.ceil(ELEPHANT_FOOT / layer - 1e-9)) * layer);
  const steps: Step[] = [];
  const hole = (body: string, diameter: number, height: number, [x, y]: [number, number], name: string) => {
    steps.push({ command: 'solid.cylinder', params: { diameter: round(diameter), height, base: [x, y, 0], operation: 'cut', targets: [body], name } });
    steps.push({ command: 'solid.cone', params: { diameter: round(diameter + 2 * chamfer), top_diameter: round(diameter), height: chamfer, base: [x, y, 0], operation: 'cut', targets: [body], name: `${name} chamfer` } });
  };
  const label = (body: string, top: number, items: [string, number, number][]) => {
    steps.push({ command: 'sketch.create', params: { plane: 'XY', offset: top, name: `${body} labels` } });
    for (const [text, x, y] of items) steps.push({ command: 'sketch.text', params: { text, at: [x, y], height: letters, align: 'center', font: BOLD_FONT, bold: true } });
    steps.push({ command: 'sketch.finish', params: {} });
    steps.push({ command: 'solid.extrude', params: { distance: engraving, direction: 'negative', operation: 'cut', targets: [body], name: `${body} values` } });
  };

  // Fit comb: rows of holes, the clearance per side under each; the pin beside it. "-0.05" in bold is about 3.2 letters wide.
  const pitch = Math.max(12, round(letters * 3.6));
  // Label baseline 1.5 mm from the cell's edge, the hole above it clear of the letters.
  const above = round(letters + 7);
  const row = round(letters + 12);
  const rows = Math.ceil(FIT_STEPS.length / PER_ROW);
  const comb = layers(4);
  steps.push({ command: 'solid.box', params: { length: PER_ROW * pitch, width: rows * row, height: comb, operation: 'new', body_name: 'Fit comb', name: 'Fit comb' } });
  const fitLabels: [string, number, number][] = [];
  FIT_STEPS.forEach((clearance, i) => {
    const x = pitch / 2 + (i % PER_ROW) * pitch;
    const y = (rows - 1 - Math.floor(i / PER_ROW)) * row + above;
    hole('Fit comb', PIN + 2 * clearance, comb, [x, y], `Fit ${String(clearance)}`);
    fitLabels.push([String(clearance), x, y - above + 1.5]);
  });
  label('Fit comb', comb, fitLabels);
  const pinX = PER_ROW * pitch + 12;
  steps.push({ command: 'solid.cylinder', params: { diameter: 2 * PIN, height: layers(2), base: [pinX, row, 0], operation: 'new', body_name: 'Fit pin', name: 'Pin grip' } });
  steps.push({ command: 'solid.cylinder', params: { diameter: PIN, height: 10, base: [pinX, row, layers(2)], operation: 'join', targets: ['Fit pin'], name: 'Pin' } });

  // Hole plate: the nominal sizes to measure with a caliper.
  const plateY = rows * row + 8;
  const plateWidth = round(letters + 16);
  const plate = layers(3);
  // "10" in bold is about 1.6 letters wide.
  const spacing = Math.max(16, round(letters * 2.1));
  steps.push({ command: 'solid.box', params: { length: HOLE_SIZES.length * spacing, width: plateWidth, height: plate, corner: [0, plateY, 0], operation: 'new', body_name: 'Hole plate', name: 'Hole plate' } });
  HOLE_SIZES.forEach((size, i) => hole('Hole plate', size, plate, [round(spacing / 2 + i * spacing), round(plateY + letters + 8.5)], `Hole ${String(size)}`));
  label(
    'Hole plate',
    plate,
    HOLE_SIZES.map((size, i) => [String(size), round(spacing / 2 + i * spacing), plateY + 2]),
  );

  // Overhang staircase: fins whose downward face leans further from the vertical step by step. "70" is about 1.6 letters wide.
  const fin = Math.max(8, round(letters * 1.8));
  const base = layers(1.2);
  const height = 6;
  const depth = Math.max(3, round(6 * nozzle));
  const width = Math.max(4, round(8 * nozzle));
  const stairY = plateY + plateWidth + 8;
  const ledge = round(Math.max(10, letters + depth + 3));
  steps.push({ command: 'solid.box', params: { length: OVERHANG_STEPS.length * fin, width: ledge, height: base, corner: [0, stairY, 0], operation: 'new', body_name: 'Overhang', name: 'Overhang base' } });
  OVERHANG_STEPS.forEach((angle, i) => {
    const y = stairY + ledge - depth;
    const reach = round(height * Math.tan((angle * Math.PI) / 180));
    steps.push({ command: 'sketch.create', params: { plane: 'YZ', offset: round(i * fin + (fin - width) / 2), name: `Fin ${String(angle)}` } });
    steps.push({ command: 'sketch.line', params: { points: [[y, base], [y + depth, base], [round(y + depth + reach), base + height], [y, base + height]], closed: true } });
    steps.push({ command: 'sketch.finish', params: {} });
    steps.push({ command: 'solid.extrude', params: { distance: width, operation: 'join', targets: ['Overhang'], name: `Fin ${String(angle)}°` } });
  });
  label(
    'Overhang',
    base,
    OVERHANG_STEPS.map((angle, i) => [String(angle), i * fin + fin / 2, stairY + 1]),
  );
  return steps;
}

/**
 * The footprint of each test piece, X and Y in mm, from its boxes, cylinders and fins; the letters stay inside. The slicer
 * lays the pieces apart, so each has to fit the bed on its own.
 */
export function testPieceSizes(printer: { nozzle: number; layer: number }): Record<string, [number, number]> {
  const boxes: Record<string, [number, number, number, number]> = {};
  const grow = (body: string, x0: number, y0: number, x1: number, y1: number) => {
    const [a, b, c, d] = boxes[body] ?? [x0, y0, x1, y1];
    boxes[body] = [Math.min(a, x0), Math.min(b, y0), Math.max(c, x1), Math.max(d, y1)];
  };
  let fin: number | null = null;
  for (const { command, params } of testPieceSteps(printer)) {
    const body = typeof params.body_name === 'string' ? params.body_name : ((params.targets as string[] | undefined)?.[0] ?? '');
    if (command === 'solid.box') {
      const [x, y] = (params.corner as number[] | undefined) ?? [0, 0];
      grow(body, x ?? 0, y ?? 0, (x ?? 0) + Number(params.length), (y ?? 0) + Number(params.width));
    } else if (command === 'solid.cylinder' && params.operation !== 'cut') {
      const [x = 0, y = 0] = params.base as number[];
      const r = Number(params.diameter) / 2;
      grow(body, x - r, y - r, x + r, y + r);
    } else if (command === 'sketch.create' && params.plane === 'YZ') fin = Number(params.offset);
    else if (command === 'sketch.line' && fin !== null) for (const [y = 0] of params.points as number[][]) grow('Overhang', fin, y, fin, y);
  }
  return Object.fromEntries(Object.entries(boxes).map(([body, [x0, y0, x1, y1]]) => [body, [round(x1 - x0), round(y1 - y0)]]));
}
