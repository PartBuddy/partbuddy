/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { meshMetrics } from './analysis';
import type { FaceTable } from './faceTable';
import { evaluateOrientation, orientationQuaternion, proposeOrientations, type OrientationBody } from './orientation';
import { orientMeshFile } from './orientFile';
import { checkPrint } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';
import { boxesBody } from './testShapes';
import { buildViewerModel } from './viewerModel';

const PLA = { bed: [256, 256, 256] as const, overhang: 45 };

/** A box with flat faces named like SolidCraft's (`F1:+z`), each with a plane normal. */
function box(name: string, min: [number, number, number], max: [number, number, number]): OrientationBody {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const names = ['F1:-z', 'F1:+z', 'F1:-y', 'F1:+x', 'F1:+y', 'F1:-x'];
  const normals: [number, number, number][] = [[0, 0, -1], [0, 0, 1], [0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]];
  const indices: number[] = [];
  const triangleFaces: number[] = [];
  quads.forEach(([a, b, c, d], face) => {
    indices.push(a!, b!, c!, a!, c!, d!);
    triangleFaces.push(face, face);
  });
  const mesh: TaggedMesh = { name, faceCount: 6, positions: Float64Array.from(corners.flat()), indices: Uint32Array.from(indices), triangleFaces: Uint32Array.from(triangleFaces) };
  const table: FaceTable = {
    model: 'test',
    body: name,
    units: 'mm',
    faces: names.map((faceName, index) => ({ index, name: faceName, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], planeNormal: normals[index] })),
  };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

describe('print orientation (M7)', () => {
  it('turns the chosen direction onto the bed', () => {
    const turned = new Vector3(0, -1, 0).applyQuaternion(orientationQuaternion([0, -1, 0]));
    expect(turned.z).toBeCloseTo(-1, 6);
    expect(new Vector3(0, 0, -1).applyQuaternion(orientationQuaternion()).z).toBeCloseTo(-1, 6);
  });

  it('proposes laying a table upside down: no support, the whole top on the bed', () => {
    const table = [boxesBody('Table', [[[9, 9, 0], [11, 11, 10]], [[0, 0, 10], [20, 20, 12]]])];
    const asDesigned = evaluateOrientation(table, PLA, [0, 0, -1]);
    expect(asDesigned.support).toBeGreaterThan(330);
    expect(Math.round(asDesigned.contact)).toBe(4);
    const [best] = proposeOrientations(table, PLA);
    // The leg's end inside the top faces down once turned, but it rests on the top's material.
    expect(best).toMatchObject({ down: [0, 0, 1], face: { body: 'Table', name: 'F2:+z' }, support: 0, contact: 400, height: 12 });
    // The check agrees in that orientation: nothing to support, no contact warning.
    const check = checkPrint(table, { ...PLA, nozzle: 0.4 }, [], best!.down);
    expect(check).toEqual({ status: 'ready', findings: [] });
  });

  it('stands every body on its own bed: the height is the tallest body', () => {
    const sleeves = [box('S5', [0, 0, 0], [12, 12, 5]), box('S15', [17, 0, 0], [29, 12, 15])];
    const flipped = evaluateOrientation(sleeves, PLA, [0, 0, 1]);
    expect(flipped).toMatchObject({ support: 0, height: 15 });
    expect(Math.round(flipped.contact)).toBe(288);
  });

  it('puts the layers along a marked load, even with less on the bed', () => {
    // A plate pressed on its top face: printed flat, the load acts across the layers.
    const plate = [box('Bracket', [0, 0, 0], [60, 10, 4])];
    const loads = [{ body: 'Bracket', faces: ['F1:+z'] }];
    expect(evaluateOrientation(plate, PLA, [0, 0, -1], loads).load).toBeCloseTo(1, 6);
    const [best] = proposeOrientations(plate, PLA, loads);
    expect(best?.load).toBe(0);
    expect(Math.abs(best?.down[2] ?? 1)).toBeLessThan(1e-6);
    // Without a load, flat wins.
    expect(proposeOrientations(plate, PLA)[0]?.down).toEqual([0, 0, -1]);
  });

  it('leaves out ways that do not fit the printer', () => {
    const rod = [box('Rod', [0, 0, 0], [10, 10, 200])];
    const [best] = proposeOrientations(rod, { ...PLA, bed: [256, 256, 150] });
    expect(best?.fits).toBe(true);
    expect(best?.height).toBe(10);
  });

  it('exports the 3MF lying the chosen way, on the bed', () => {
    const fixture = new URL('../fixtures/', import.meta.url);
    const data = new Uint8Array(readFileSync(new URL('cable-clip.3mf', fixture)));
    const turned = parseTagged3mf(orientMeshFile('3mf', data, [1, 0, 0]));
    const { bbox } = meshMetrics(turned);
    expect(bbox.min[2]).toBeCloseTo(0, 4);
    expect(bbox.max[2]).toBeCloseTo(64, 4);
  });

  it('exports a binary STL lying the chosen way, on the bed', () => {
    const stl = new Uint8Array(84 + 50);
    const view = new DataView(stl.buffer);
    view.setUint32(80, 1, true);
    const values = [0, 0, 1, 0, 0, 5, 10, 0, 5, 0, 20, 5];
    values.forEach((value, i) => { view.setFloat32(84 + i * 4, value, true); });
    const out = new DataView(orientMeshFile('stl', stl, [0, -1, 0]).buffer);
    const z = [0, 1, 2].map((k) => out.getFloat32(84 + 12 + k * 12 + 8, true));
    expect(Math.min(...z)).toBeCloseTo(0, 5);
    expect(Math.max(...z)).toBeCloseTo(20, 5);
  });

  it('exports an ASCII STL lying the chosen way', () => {
    const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 5\nvertex 10 0 5\nvertex 0 20 5\nendloop\nendfacet\nendsolid t\n';
    const text = new TextDecoder().decode(orientMeshFile('stl', new TextEncoder().encode(ascii), [0, -1, 0]));
    const z = [...text.matchAll(/vertex \S+ \S+ (\S+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...z)).toBeCloseTo(0, 5);
    expect(Math.max(...z)).toBeCloseTo(20, 5);
  });
});
