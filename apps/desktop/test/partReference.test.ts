import { describe, expect, it } from 'vitest';

import { referenceScript, referencesOf, sameShape, shapeOf, type PartQuery } from '../src/main/solidcraft/partReference';

const nut: PartQuery = { description: 'Hex nut M3', part: { family: 'hex_nut', size: 'M3', length: null } };
const screw: PartQuery = { description: 'Countersunk socket screw M3x10', part: { family: 'countersunk_socket_screw', size: 'M3', length: 10 } };
// A washer has no length: SolidCraft builds "Plain washer M3" whatever length is asked for.
const forged: PartQuery = { description: 'Plain washer M3x8', part: { family: 'washer', size: 'M3', length: 8 } };

describe('a library part as SolidCraft builds it alone (review 2, stage 2)', () => {
  it('builds each part under a name of its own and measures them all', () => {
    expect(referenceScript([nut, screw])).toEqual([
      { command: 'parts.insert', params: { family: 'hex_nut', size: 'M3', name: 'ref0', point: [0, 0, 0] } },
      { command: 'parts.insert', params: { family: 'countersunk_socket_screw', size: 'M3', length: 10, name: 'ref1', point: [1000, 0, 0] } },
      { command: 'component.list', params: {} },
      { command: 'component.metadata', params: { component: 'ref0' } },
      { command: 'component.metadata', params: { component: 'ref1' } },
      { command: 'inspect.measure', params: {} },
    ]);
  });

  it('reads shape and part number of the parts SolidCraft described in the words asked for', () => {
    // The results of `solidcraft-cli run --results` for nut, screw and the forged washer, as SolidCraft 0.40.1 answers, shortened.
    const results = [
      { component: 1, name: 'ref0' },
      { component: 8, name: 'ref1' },
      { component: 15, name: 'ref2' },
      { components: [{ id: 0, name: 'Untitled', bodies: [] }, { id: 1, name: 'ref0', bodies: ['Body1'] }, { id: 8, name: 'ref1', bodies: ['Body2'] }, { id: 15, name: 'ref2', bodies: ['Body3'] }] },
      { description: 'Hex nut M3', part_number: 'ISO 4032 M3' },
      { description: 'Countersunk socket screw M3x10', part_number: 'ISO 10642 M3x10' },
      { description: 'Plain washer M3', part_number: 'ISO 7089 M3' },
      {
        bodies: [
          { name: 'Body2', volume_mm3: 89.91686929002658, area_mm2: 167.0365086545463, faces: 11, edges: 23, vertices: 15 },
          { name: 'Body1', volume_mm3: 45.9088439852507, area_mm2: 106.60297841336842, faces: 9, edges: 21, vertices: 14 },
          { name: 'Body3', volume_mm3: 10.1, area_mm2: 70.2, faces: 4, edges: 4, vertices: 4 },
        ],
      },
    ];
    const references = referencesOf([nut, screw, forged], results);
    expect([...references.keys()]).toEqual(['Hex nut M3', 'Countersunk socket screw M3x10']);
    expect(references.get('Hex nut M3')).toEqual({ shape: { volume: 45.9088439852507, area: 106.60297841336842, faces: 9, edges: 21, vertices: 14 }, partNumber: 'ISO 4032 M3' });
    // Results that read oddly give no reference, so the body counts as printed.
    expect(referencesOf([nut], []).size).toBe(0);
    expect(referencesOf([nut], [{}, { components: [{ name: 'ref0', bodies: ['Body1', 'Body2'] }] }, { description: 'Hex nut M3' }, { bodies: [] }]).size).toBe(0);
  });

  it('takes two bodies for the same shape within the measuring noise only', () => {
    const shape = { volume: 75.22017841527448, area: 137.6044195955919, faces: 12, edges: 24, vertices: 16 };
    // The same screw turned to [1, 2, 3], as SolidCraft 0.40.1 measures it.
    expect(sameShape(shape, { ...shape, volume: 75.22017841786527, area: 137.60441959673892 })).toBe(true);
    expect(sameShape(shape, { ...shape, volume: shape.volume * 1.00001 })).toBe(false);
    expect(sameShape(shape, { ...shape, area: shape.area * 0.9999 })).toBe(false);
    expect(sameShape(shape, { ...shape, faces: 13 })).toBe(false);
    expect(shapeOf({ volume_mm3: 1, area_mm2: 6, faces: 6, edges: 12, vertices: 8 })).toEqual({ volume: 1, area: 6, faces: 6, edges: 12, vertices: 8 });
    // An open body has no volume.
    expect(shapeOf({ area_mm2: 6, faces: 6, edges: 12, vertices: 8 })).toBeNull();
    expect(shapeOf(undefined)).toBeNull();
  });
});
