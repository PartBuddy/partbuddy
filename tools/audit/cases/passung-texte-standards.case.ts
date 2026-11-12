import { hingeOf } from '../../../apps/desktop/src/main/agents/mechanismTool';
import { printNote } from '../../../apps/desktop/src/main/print/printProfiles';
import { fitSize, lineWidth, snapSize } from '../../../apps/desktop/src/shared/designFit';
import { MATERIAL_CATALOG } from '../../../apps/desktop/src/shared/materialCatalog';
import { STANDARDS } from '../../../apps/desktop/src/shared/standards';
import { WALL, WOOD_SCREWS } from '../../../apps/desktop/src/shared/wallMount';
import { partPrint, save, startingMaterial } from '../passung-texte-helpers';

const sentence = (rules: readonly string[], pattern: RegExp) => rules.flatMap((rule) => rule.split(/(?<=[.;]) /)).find((part) => pattern.test(part)) ?? null;
const r3 = (value: number) => Math.round(value * 1000) / 1000;

// R4, T24, T25, T26: the figures of standards.ts recomputed with PartBuddy's own functions.
test('R4/T24/T25/T26: sentences of standards.ts recomputed', () => {
  // R4 / T26: the pilot hole.
  const pilot = sentence(STANDARDS.boardMount.rules, /pilot hole/);
  const stated = { 'M2.5': 2.0, M3: 2.5 };
  const pilotRows = ([['M2.5', 2.5], ['M3', 3]] as const).map(([size, screw]) => ({
    size,
    screw,
    by025Less: r3(screw - 0.25),
    statedAfterPrint: stated[size],
    differenceOfTheTwoReadings: r3(screw - 0.25 - stated[size]),
    // Drawn 0.25 mm less, printed in each material: drawn minus the profile's hole allowance.
    printedIfDrawn025Less: Object.fromEntries(MATERIAL_CATALOG.map((material) => [material.name, r3(screw - 0.25 - material.holeShrink)])),
    // To come out at the stated size, per material.
    drawnForStated: Object.fromEntries(MATERIAL_CATALOG.map((material) => [material.name, r3(stated[size] + material.holeShrink)])),
  }));

  // T24: bars of 1.2 mm as "three lines of a 0.4 mm nozzle".
  const printer = { nozzle: 0.4, layer: 0.2 };
  const bars = sentence(STANDARDS.vent.rules, /bars at least/);
  const hexagons = sentence(STANDARDS.vent.rules, /Hexagons/);
  const wall = {
    lineWidth: lineWidth(printer),
    lines: [1, 2, 3, 4].map((count) => r3(count * lineWidth(printer))),
    linesIn1_2: r3(1.2 / lineWidth(printer)),
    fitSizeUser: fitSize('wall', 1.2, 'user', printer),
    snapSizeAssistant: snapSize('wall', 1.2, printer),
  };

  // T25: every bridge limit the assistant is given or a tool builds.
  const note = printNote(partPrint(0.4, 0.2, startingMaterial('pla'))).split('\n');
  const hinge = (length: number) => {
    const spec = hingeOf({ fixed: 'A', moving: 'B', from: [0, 0, 3], to: [0, length, 3] }, 0.4);
    return typeof spec === 'string' ? { length, refused: spec } : { length, knuckles: spec.knuckles, knuckle: r3((length - (spec.knuckles - 1) * spec.gap) / spec.knuckles) };
  };
  const bridges = {
    'standards.ts slidingLid': sentence(STANDARDS.slidingLid.rules, /bridge/),
    'standards.ts vent': sentence(STANDARDS.vent.rules, /lying slot/),
    'printNote holes': note.find((line) => line.includes('Holes lying across the layers')),
    'printNote ceilings': note.find((line) => line.includes('Ceilings and ledges')),
    'hinge knuckle (pin bridges inside each)': [20, 30, 50, 90, 100, 150].map(hinge),
    'keyhole pocket roof = entry (wallMount.ts:70)': Object.fromEntries(WOOD_SCREWS.map((screw) => [String(screw), WALL[screw].entry])),
  };

  save('standards', { pilot: { sentence: pilot, rows: pilotRows }, wall: { sentence: bars, hexagons, ...wall }, bridges });
  expect(pilotRows.map((row) => row.by025Less)).toEqual([2.25, 2.75]);
  expect(wall.lines[2]).toBe(1.35);
  expect(wall.fitSizeUser.warning).not.toBeNull();
});
