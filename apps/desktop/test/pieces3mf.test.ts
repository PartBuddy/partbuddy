import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { joinPieces } from '../src/main/print/pieces3mf';

type Box = [[number, number, number], [number, number, number]];

/** A 3MF as SolidCraft's `file.export` writes it: one mesh object and one build item per body, in the design's frame. */
function exported(boxes: Record<string, Box>, { build = '<build>', extra = '' } = {}): Uint8Array {
  const objects = Object.entries(boxes).map(([name, [[x0, y0, z0], [x1, y1, z1]]], i) => {
    const vertices = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    return `  <object id="${String(i + 2)}" type="model" name="${name}">\n   <mesh>\n    <vertices>\n${vertices.map(([x, y, z]) => `     <vertex x="${String(x)}" y="${String(y)}" z="${String(z)}"/>`).join('\n')}\n    </vertices>\n    <triangles>\n     <triangle v1="0" v2="1" v3="2"/>\n    </triangles>\n   </mesh>\n  </object>`;
  });
  const items = Object.keys(boxes).map((_, i) => `  <item objectid="${String(i + 2)}"/>`);
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n <resources>\n${extra}${objects.join('\n')}\n </resources>\n ${build}\n${items.join('\n')}\n </build>\n</model>\n`;
  return zipSync({ '3D/3dmodel.model': strToU8(model), '[Content_Types].xml': strToU8('<Types/>') });
}

const entry = (file: Uint8Array | null, name: string) => strFromU8(unzipSync(file ?? new Uint8Array())[name] ?? new Uint8Array());
const modelOf = (file: Uint8Array | null) => entry(file, '3D/3dmodel.model');
const items = (model: string) => [...model.matchAll(/<item\b[^>]*\/>/g)].map((match) => match[0]);
const design: Record<string, Box> = { 'Box & co': [[0, 0, 0], [40, 30, 30]], Loose: [[0, 50, 5], [10, 60, 15]], Lid: [[44, 0, 22], [84, 30, 30]] };

describe('a print-in-place hinge in the exported 3MF (audit G1)', () => {
  it('writes the group as one object of components on the bodies\' meshes, which stay where they are', async () => {
    const file = exported(design);
    const joined = await joinPieces(file, [['Box & co', 'Lid']]);
    const model = modelOf(joined);
    expect(model).toContain('<object id="5" type="model" name="Box &amp; co + Lid"><components><component objectid="2"/><component objectid="4"/></components></object>');
    // One build item for the hinge, where the box's was, and the loose body's; the meshes are untouched, so the bodies keep
    // their place to each other.
    expect(items(model)).toEqual(['<item objectid="5"/>', '<item objectid="3"/>']);
    expect(model.match(/<vertex [^>]*>/g)).toEqual(modelOf(file).match(/<vertex [^>]*>/g));
    // The parts keep their bodies' names in Bambu Studio and OrcaSlicer (review of PR 366, K5).
    expect(entry(joined, 'Metadata/model_settings.config')).toContain('<object id="5"><metadata key="name" value="Box &amp; co + Lid"/><part id="2" subtype="normal_part"><metadata key="name" value="Box &amp; co"/></part><part id="4" subtype="normal_part"><metadata key="name" value="Lid"/></part></object>');
  });

  it('lays each piece on the first print face among its bodies, its lowest point on the bed', async () => {
    // The lid's top (+z) down: the piece turns half a turn (about Y), and its top at z 30 comes to z 0. A body by itself
    // with a print face is laid too; one without keeps its item.
    const model = modelOf(await joinPieces(exported(design), [['Box & co', 'Lid']], { Lid: [0, 0, 1], Loose: [1, 0, 0] }));
    expect(items(model)).toEqual(['<item objectid="5" transform="-1 0 0 0 1 0 0 0 -1 0 0 30"/>', '<item objectid="3" transform="0 0 -1 0 1 0 1 0 0 0 0 10"/>']);
  });

  it('counts every id of the resources, takes a build with attributes, and keeps what it does not know (review of PR 366, K4)', async () => {
    const extra = '  <basematerials id="9"><base name="PLA"/></basematerials>\n  <object id="7" type="model"><mesh><vertices/><triangles/></mesh></object>\n';
    const file = exported(design, { build: '<build p:UUID="b">', extra });
    const model = modelOf(await joinPieces(file, [['Box & co', 'Lid']]));
    expect(model).toContain('<object id="10" type="model" name="Box &amp; co + Lid">');
    expect(model).toContain('<build p:UUID="b">');
    expect(items(model)).toEqual(['<item objectid="10"/>', '<item objectid="3"/>']);
  });

  it('changes nothing without a group or a print face, and leaves a body of a group that is not exported out', async () => {
    const file = exported(design);
    expect(await joinPieces(file, [])).toBeNull();
    expect(await joinPieces(file, [['Lid', 'Gone']])).toBeNull();
  });
});
