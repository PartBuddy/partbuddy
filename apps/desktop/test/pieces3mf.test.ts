import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { joinPieces } from '../src/main/print/pieces3mf';

/** A 3MF as SolidCraft's `file.export` writes it: one mesh object and one build item per body, in the design's frame. */
function exported(boxes: Record<string, [[number, number, number], [number, number, number]]>): Uint8Array {
  const objects = Object.entries(boxes).map(([name, [[x0, y0, z0], [x1, y1, z1]]], i) => {
    const vertices = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    return `  <object id="${String(i + 2)}" type="model" name="${name}">\n   <mesh>\n    <vertices>\n${vertices.map(([x, y, z]) => `     <vertex x="${String(x)}" y="${String(y)}" z="${String(z)}"/>`).join('\n')}\n    </vertices>\n    <triangles>\n     <triangle v1="0" v2="1" v3="2"/>\n    </triangles>\n   </mesh>\n  </object>`;
  });
  const items = Object.keys(boxes).map((_, i) => `  <item objectid="${String(i + 2)}"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n <resources>\n${objects.join('\n')}\n </resources>\n <build>\n${items.join('\n')}\n </build>\n</model>\n`;
  return zipSync({ '3D/3dmodel.model': strToU8(model), '[Content_Types].xml': strToU8('<Types/>') });
}

const modelOf = (file: Uint8Array) => strFromU8(unzipSync(file)['3D/3dmodel.model'] ?? new Uint8Array());
const items = (model: string) => [...model.matchAll(/<item\b[^>]*\/>/g)].map((match) => match[0]);

describe('a print-in-place hinge in the exported 3MF (audit G1)', () => {
  const design = { 'Box & co': [[0, 0, 0], [40, 30, 30]], Lid: [[44, 0, 22], [84, 30, 30]], Loose: [[0, 50, 5], [10, 60, 15]] } as const;

  it('writes the group as one object of components on the bodies\' meshes, which stay where they are', () => {
    const file = exported(design as unknown as Parameters<typeof exported>[0]);
    const model = modelOf(joinPieces(file, [['Box & co', 'Lid']]));
    expect(model).toContain('<object id="5" type="model" name="Box &amp; co + Lid"><components><component objectid="2"/><component objectid="3"/></components></object>');
    // One build item for the hinge, one for the loose body; the meshes are untouched, so the bodies keep their place to each other.
    expect(items(model)).toEqual(['<item objectid="5"/>', '<item objectid="4"/>']);
    expect(model.match(/<vertex [^>]*>/g)).toEqual(modelOf(file).match(/<vertex [^>]*>/g));
    // Nothing else in the package changes.
    expect(Object.keys(unzipSync(joinPieces(file, [['Box & co', 'Lid']])))).toEqual(Object.keys(unzipSync(file)));
  });

  it('lays each piece on the first print face among its bodies, its lowest point on the bed', () => {
    const file = exported(design as unknown as Parameters<typeof exported>[0]);
    // The lid's top (+z) down: the piece turns half a turn (about Y), and its top at z 30 comes to z 0.
    const model = modelOf(joinPieces(file, [['Box & co', 'Lid']], { Lid: [0, 0, 1] }));
    expect(items(model)).toEqual(['<item objectid="5" transform="-1 0 0 0 1 0 0 0 -1 0 0 30"/>', '<item objectid="4"/>']);
  });

  it('leaves a file without groups and print faces as it is, and a body of a group that is not exported out', () => {
    const file = exported(design as unknown as Parameters<typeof exported>[0]);
    expect(joinPieces(file, [])).toBe(file);
    expect(joinPieces(file, [['Lid', 'Gone']])).toBe(file);
  });
});
