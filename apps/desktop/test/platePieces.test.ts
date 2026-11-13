import { buildRenderMesh, buildViewerModel, type FaceTable, type TaggedMesh } from '@partbuddy/geometry';
import { describe, expect, it } from 'vitest';

import type { BodyModel } from '../src/renderer/src/state/store';
import { platePieces } from '../src/renderer/src/viewer/platePieces';

/** A box between two corners, its six faces named with their normals, as SolidCraft exports one. */
function box(name: string, [x0, y0, z0]: [number, number, number], [x1, y1, z1]: [number, number, number]): BodyModel {
  const corners = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const faces: [string, [number, number, number]][] = [['F1:-z', [0, 0, -1]], ['F1:+z', [0, 0, 1]], ['F1:-y', [0, -1, 0]], ['F1:+x', [1, 0, 0]], ['F1:+y', [0, 1, 0]], ['F1:-x', [-1, 0, 0]]];
  const mesh: TaggedMesh = { name, faceCount: 6, positions: Float64Array.from(corners.flat()), indices: Uint32Array.from(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d] as number[])), triangleFaces: Uint32Array.from(quads.flatMap((_, face) => [face, face])) };
  const table: FaceTable = { model: 'test', body: name, units: 'mm', faces: faces.map(([faceName, planeNormal], index) => ({ index, name: faceName, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], planeNormal })) };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

describe('the plate view lays a print-in-place hinge as one part (audit G1, review of PR 366 S4)', () => {
  // The lid lies beside the box with its underside 22 mm up, as the mechanism tool's hinge holds it.
  const bodies = [box('Lid', [44, 0, 22], [84, 30, 30]), box('Box', [0, 0, 0], [40, 30, 30]), box('Screw', [0, 40, 0], [3, 43, 10])];

  it('takes the group as one part on the common bed, its bodies in the order of the group', () => {
    const [hinge, ...rest] = platePieces(bodies, [['Box', 'Lid']], {}, ['Screw']);
    expect(rest).toEqual([]);
    expect(hinge).toMatchObject({ name: 'Box', members: ['Box', 'Lid'], floor: 0, height: 30 });
    // The footprint covers both bodies where they lie to each other.
    expect(Math.max(...(hinge?.points ?? []).map(([x]) => x))).toBe(84);
  });

  it('turns the group onto the first print face among its bodies, in the order of the group', () => {
    // The box's -x side down wins over the lid's top: both turn a quarter turn, the lid 44 mm up beside the box.
    const [hinge] = platePieces(bodies, [['Box', 'Lid']], { Lid: 'F1:+z', Box: 'F1:-x' }, ['Screw']);
    expect(hinge?.members).toEqual(['Box', 'Lid']);
    expect([round(hinge?.floor ?? NaN), round(hinge?.height ?? NaN)]).toEqual([0, 84]);
  });

  it('lays bodies printed apart each by itself, as before', () => {
    expect(platePieces(bodies, [], { Lid: 'F1:+z' }, ['Screw']).map((piece) => [piece.name, piece.members, round(piece.floor)])).toEqual([['Lid', ['Lid'], -30], ['Box', ['Box'], 0]]);
  });
});
