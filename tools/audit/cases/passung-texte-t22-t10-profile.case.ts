import { blockOf } from '../../../apps/desktop/src/main/agents/blockTool';
import { DEFAULT_PRINT_SETTINGS } from '../../../apps/desktop/src/main/print/printProfiles';
import { defaultBlock, stepsOf } from '../../../apps/desktop/src/shared/blocks';
import { magnetPocket, MAGNET } from '../../../apps/desktop/src/shared/magnet';
import { MATERIAL_CATALOG } from '../../../apps/desktop/src/shared/materialCatalog';
import { HEAD_ALLOWANCE, INSERT, NUT_ALLOWANCE } from '../../../apps/desktop/src/shared/screwSizes';
import { save, source } from '../passung-texte-helpers';

const r3 = (value: number) => Math.round(value * 1000) / 1000;

// T22: the starting profiles against the catalog's entry of the same material, value by value.
test('T22: starting profiles against the material catalog', () => {
  const catalogName: Record<string, string> = { TPU: 'TPU 95A' };
  const rows = DEFAULT_PRINT_SETTINGS.materials.flatMap((profile) => {
    const entry = MATERIAL_CATALOG.find((material) => material.name === (catalogName[profile.name] ?? profile.name));
    if (!entry) return [{ material: profile.name, value: 'entry', profile: 'present', catalog: 'missing', equal: false }];
    const pairs: [string, number, number][] = [
      ['overhang °', profile.overhang, entry.overhang],
      ['holeShrink mm', profile.holeShrink, entry.holeShrink],
      ['clamp mm', profile.clearance.clamp, entry.clearance.clamp],
      ['push mm', profile.clearance.push, entry.clearance.push],
      ['slide mm', profile.clearance.slide, entry.clearance.slide],
      ['turn mm', profile.clearance.turn, entry.clearance.turn],
    ];
    return pairs.map(([value, own, catalog]) => ({ material: `${profile.name} / ${entry.name}`, value, profile: own, catalog, equal: own === catalog }));
  });
  save('t22-profile', { rows, different: rows.filter((row) => !row.equal) });
  expect(rows.filter((row) => !row.equal).length).toBeGreaterThan(0);
});

// T10: what a block's allowance leaves once the material's hole allowance is taken off.
test('T10: block allowances per material', () => {
  const nut = defaultBlock('nutTrap', 'Cube', [10, 10, 20], 'M3');
  const nutSteps = stepsOf(nut);
  const pocket = { glue: magnetPocket({ diameter: 6, height: 2, hold: 'glue' }), press: magnetPocket({ diameter: 6, height: 2, hold: 'press' }) };
  const perMaterial = MATERIAL_CATALOG.map((material) => ({
    material: material.name,
    holeShrink: material.holeShrink,
    nutFlatsLeft: r3(NUT_ALLOWANCE.flats - material.holeShrink),
    magnetGlueLeft: r3(MAGNET.room.glue - material.holeShrink),
    magnetPressLeft: r3(MAGNET.room.press - material.holeShrink),
    headLeft: r3(HEAD_ALLOWANCE.diameter - material.holeShrink),
    insertSeatM3Printed: r3((INSERT.M3?.diameter ?? NaN) - material.holeShrink),
  }));
  const blockTool = source('main/agents/blockTool.ts');
  const result = {
    nutTrapM3: { block: nut, polygonRadius: nutSteps.find((step) => step.command.startsWith('sketch.polygon'))?.params.radius, steps: nutSteps },
    // The tool's own reading of the model's arguments: a material or nozzle in them changes nothing.
    blockOfPlain: blockOf({ block: 'nutTrap', body: 'Cube', point: [10, 10, 20], normal: [0, 0, 1], size: 'M3' }),
    blockOfWithMaterial: blockOf({ block: 'nutTrap', body: 'Cube', point: [10, 10, 20], normal: [0, 0, 1], size: 'M3', material: 'PP', nozzle: 0.8, holeShrink: 0.3 }),
    magnet6x2: pocket,
    insertM3: INSERT.M3,
    allowances: { NUT_ALLOWANCE, HEAD_ALLOWANCE, MAGNET },
    blockToolReadsProfile: { holeShrink: blockTool.includes('holeShrink'), clearance: /clearance\.(clamp|push|slide|turn)/.test(blockTool), printProfiles: blockTool.includes('printProfiles'), nozzle: blockTool.includes('nozzle') },
    perMaterial,
  };
  save('t10-zugaben', result);
  expect(result.blockOfWithMaterial).toEqual(result.blockOfPlain);
});
