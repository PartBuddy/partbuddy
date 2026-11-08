import { FIT_STEPS, HOLE_SIZES, OVERHANG_STEPS } from './tolerances';

/**
 * The test pieces of the tolerance assistant, built with SolidCraft's own commands like the
 * templates (F3): a fit comb with a pin, a hole plate and an overhang staircase, each step with its
 * value engraved. Heights are whole layers of the printer in use, the engraving two layers deep and
 * the letters at least 3 mm, larger for a wide nozzle. Fixed numbers, no parameters: they are made,
 * printed and thrown away. Checked with `solidcraft-cli run` (0.40.0-rc.2) on 2026-11-08.
 */

type Step = { command: string; params: Record<string, unknown> };

/** The diameter of the comb's pin; each hole is this plus twice the step's clearance. */
export const PIN = 6;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function testPieceSteps({ nozzle, layer }: { nozzle: number; layer: number }): Step[] {
  const layers = (mm: number) => round(Math.max(1, Math.ceil(mm / layer - 1e-9)) * layer);
  const engraving = round(2 * layer);
  const letters = Math.max(3, round(nozzle * 7.5));
  const steps: Step[] = [];
  const label = (body: string, top: number, items: [string, number, number][]) => {
    steps.push({ command: 'sketch.create', params: { plane: 'XY', offset: top, name: `${body} labels` } });
    for (const [text, x, y] of items) steps.push({ command: 'sketch.text', params: { text, at: [x, y], height: letters, align: 'center' } });
    steps.push({ command: 'sketch.finish', params: {} });
    steps.push({ command: 'solid.extrude', params: { distance: engraving, direction: 'negative', operation: 'cut', targets: [body], name: `${body} values` } });
  };

  // Fit comb: two rows of holes, the clearance per side under each; the pin beside it.
  const pitch = Math.max(12, round(letters * 4));
  // Label baseline 1.5 mm from the cell's edge, the hole above it clear of the letters.
  const above = round(letters + 7);
  const row = round(letters + 12);
  const comb = layers(4);
  const perRow = Math.ceil(FIT_STEPS.length / 2);
  steps.push({ command: 'solid.box', params: { length: perRow * pitch, width: 2 * row, height: comb, operation: 'new', body_name: 'Fit comb', name: 'Fit comb' } });
  const fitLabels: [string, number, number][] = [];
  FIT_STEPS.forEach((clearance, i) => {
    const x = pitch / 2 + (i % perRow) * pitch;
    const y = (i < perRow ? row : 0) + above;
    steps.push({ command: 'solid.cylinder', params: { diameter: round(PIN + 2 * clearance), height: comb, base: [x, y, 0], operation: 'cut', targets: ['Fit comb'], name: `Fit ${String(clearance)}` } });
    fitLabels.push([String(clearance), x, y - above + 1.5]);
  });
  label('Fit comb', comb, fitLabels);
  const pinX = perRow * pitch + 12;
  steps.push({ command: 'solid.cylinder', params: { diameter: 2 * PIN, height: layers(2), base: [pinX, row, 0], operation: 'new', body_name: 'Fit pin', name: 'Pin grip' } });
  steps.push({ command: 'solid.cylinder', params: { diameter: PIN, height: 10, base: [pinX, row, layers(2)], operation: 'join', targets: ['Fit pin'], name: 'Pin' } });

  // Hole plate: the nominal sizes to measure with a caliper.
  const plateY = 2 * row + 8;
  const plateWidth = round(letters + 16);
  const plate = layers(3);
  steps.push({ command: 'solid.box', params: { length: HOLE_SIZES.length * 16, width: plateWidth, height: plate, corner: [0, plateY, 0], operation: 'new', body_name: 'Hole plate', name: 'Hole plate' } });
  HOLE_SIZES.forEach((size, i) => {
    steps.push({ command: 'solid.cylinder', params: { diameter: size, height: plate, base: [8 + i * 16, round(plateY + letters + 8.5), 0], operation: 'cut', targets: ['Hole plate'], name: `Hole ${String(size)}` } });
  });
  label(
    'Hole plate',
    plate,
    HOLE_SIZES.map((size, i) => [String(size), 8 + i * 16, plateY + 2]),
  );

  // Overhang staircase: fins whose downward face leans further from the vertical step by step.
  const fin = Math.max(8, round(letters * 2.7));
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
