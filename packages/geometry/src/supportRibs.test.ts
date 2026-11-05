import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { proposeOrientations } from './orientation';
import { checkPrint } from './printCheck';
import { isSupportBody } from './supportBody';
import { mergeSupportObjects, objectNames3mf } from './supportExport';
import { ribsFor } from './supportRibs';
import { boxBody, boxesBody } from './testShapes';

const PLA = { bed: [256, 256, 256] as const, nozzle: 0.4, overhang: 45, layer: 0.2 };

// A block with a ledge 8 mm out at half height: its underside needs support.
const ledge = () => boxesBody('Ledge', [[[0, 0, 0], [10, 10, 10]], [[10, 0, 5], [18, 10, 10]]]);

describe('support printed into the model (M7f step 4)', () => {
  it('knows the support bodies by their name', () => {
    expect(isSupportBody('Print support')).toBe(true);
    expect(isSupportBody('Print support 3')).toBe(true);
    expect(isSupportBody('Print supports')).toBe(false);
    expect(isSupportBody('Halter')).toBe(false);
  });

  it('puts walls 4 mm apart under the ledge, on the bed, one layer below it and clear of the block', () => {
    const ribs = ribsFor(ledge().model, [0, 0, -1], 45, 0.2);
    expect(ribs.length).toBe(2);
    for (const rib of ribs) {
      expect(rib.origin[2]).toBe(0);
      expect(rib.yDir).toEqual([0, 0, 1]);
      expect(rib.thickness).toBe(1);
      // Along the ledge's 10 mm, 0.5 mm in from each end; up to one layer under the ledge.
      const xs = rib.points.map(([x]) => x);
      const ys = rib.points.map(([, y]) => y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(8);
      expect(Math.max(...ys)).toBeCloseTo(4.8, 6);
    }
    // Both walls stand under the ledge, at least half a wall and the gap away from the block's side.
    const across = ribs.map((rib) => rib.origin[0]).sort((a, b) => a - b);
    expect(across[0]).toBeGreaterThanOrEqual(11);
    expect(across[1]).toBeLessThanOrEqual(17);
  });

  it('reads the ledge as carried once the walls stand under it, and leaves them out of the rest', () => {
    const part = ledge();
    expect(checkPrint([part], PLA).findings.find((f) => f.kind === 'support')).toMatchObject({ severity: 'warn', cause: 'other' });
    const walls = ribsFor(part.model, [0, 0, -1], 45, 0.2).map((rib, i) => {
      const length = Math.max(...rib.points.map(([x]) => x));
      const x = rib.origin[0];
      return boxBody(`Print support ${String(i + 1)}`, [x - 0.5, rib.origin[1], 0], [x + 0.5, rib.origin[1] + length, 4.8]);
    });
    const result = checkPrint([part, ...walls], PLA);
    expect(result.status).toBe('ready');
    expect(result.findings).toEqual([expect.objectContaining({ kind: 'support', severity: 'info', ribs: true, places: [{ body: 'Ledge', faces: ['F2:-z'] }] })]);
    // The proposal does not lay the part another way because of its walls.
    expect(proposeOrientations([part, ...walls], PLA)[0]?.down).toEqual(proposeOrientations([part], PLA)[0]?.down);
  });
});

describe('support in the exported 3MF (M7f step 4)', () => {
  const object = (id: number, name: string, x: number, y: number) =>
    `<object id="${String(id)}" type="model" name="${name}"><mesh><vertices>` +
    `<vertex x="${String(x)}" y="${String(y)}" z="0"/><vertex x="${String(x + 4)}" y="${String(y)}" z="0"/><vertex x="${String(x)}" y="${String(y + 4)}" z="5"/>` +
    `</vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>`;
  const file = (objects: string, items: string) =>
    zipSync({
      '3D/3dmodel.model': strToU8(`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter"><resources>${objects}</resources><build>${items}</build></model>`),
    });

  it('moves each support wall into the part it stands under, so the slicer cannot move it away', () => {
    const merged = mergeSupportObjects(
      file(
        object(2, 'Konsole', 0, 0) + object(3, 'Print support 1', 1, 1) + object(4, 'Deckel', 50, 0),
        '<item objectid="2"/><item objectid="3"/><item objectid="4"/>',
      ),
    );
    const xml = strFromU8(unzipSync(merged)['3D/3dmodel.model'] ?? new Uint8Array());
    expect(xml).not.toContain('Print support');
    expect(objectNames3mf(merged)).toEqual(['Konsole', 'Deckel']);
    expect(xml).not.toContain('objectid="3"');
    // The part has the wall's three vertices after its own and its triangle numbered on from them.
    const konsole = /<object id="2"[\s\S]*?<\/object>/.exec(xml)?.[0] ?? '';
    expect(konsole.match(/<vertex /g)?.length).toBe(6);
    expect(konsole).toContain('<triangle v1="3" v2="4" v3="5"/>');
    expect(/<object id="4"[\s\S]*?<\/object>/.exec(xml)?.[0].match(/<vertex /g)?.length).toBe(3);
  });

  it('leaves a file without support, or one it cannot read, as it is', () => {
    const plain = file(object(2, 'Konsole', 0, 0), '<item objectid="2"/>');
    expect(mergeSupportObjects(plain)).toBe(plain);
    const broken = strToU8('fake 3mf');
    expect(mergeSupportObjects(broken)).toBe(broken);
  });
});
