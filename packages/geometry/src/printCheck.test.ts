/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { checkPrint, minimumWall, type PrintCheckBody, type PrintCheckProfile } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';
import { boxesBody, lyingTube } from './testShapes';
import { buildViewerModel } from './viewerModel';

const PLA: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, overhang: 45 };

/** A box as SolidCraft would export it: six faces, outward triangles, named like `F1:+z`. */
function box(name: string, min: [number, number, number], max: [number, number, number]): PrintCheckBody {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  // Quads counter-clockwise seen from outside: -z, +z, -y, +x, +y, -x.
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const names = ['F1:-z', 'F1:+z', 'F1:-y', 'F1:+x', 'F1:+y', 'F1:-x'];
  const indices: number[] = [];
  const triangleFaces: number[] = [];
  quads.forEach(([a, b, c, d], face) => {
    indices.push(a!, b!, c!, a!, c!, d!);
    triangleFaces.push(face, face);
  });
  const mesh: TaggedMesh = {
    name,
    faceCount: 6,
    positions: Float64Array.from(corners.flat()),
    indices: Uint32Array.from(indices),
    triangleFaces: Uint32Array.from(triangleFaces),
  };
  const table: FaceTable = {
    model: 'test',
    body: name,
    units: 'mm',
    faces: names.map((faceName, index) => ({ index, name: faceName, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0] })),
  };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

describe('the ready-to-print check (M7)', () => {
  it('passes a solid block that lies flat on the bed', () => {
    expect(checkPrint([box('Block', [0, 0, 0], [40, 30, 10])], PLA)).toEqual({ status: 'ready', findings: [] });
  });

  it('blocks a part larger than the build volume and says when it would fit lying on its side', () => {
    const tall = checkPrint([box('Rod', [0, 0, 0], [20, 20, 300])], PLA);
    expect(tall.status).toBe('block');
    expect(tall.findings[0]).toMatchObject({ kind: 'size', size: [20, 20, 300], lying: false });
    const small = checkPrint([box('Rod', [0, 0, 0], [20, 20, 200])], { ...PLA, bed: [180, 180, 250] });
    expect(small.status).toBe('ready');
    const lying = checkPrint([box('Plank', [0, 0, 0], [20, 200, 100])], { ...PLA, bed: [220, 220, 50] });
    expect(lying.findings[0]).toMatchObject({ kind: 'size', lying: true });
  });

  it('warns about walls under two lines and blocks walls under the nozzle width, with their faces', () => {
    expect(minimumWall(0.4)).toBe(0.9);
    const thin = checkPrint([box('Plate', [0, 0, 0], [20, 20, 0.6])], PLA);
    expect(thin.status).toBe('warn');
    const wall = thin.findings.find((f) => f.kind === 'thinWall');
    expect(wall).toMatchObject({ severity: 'warn', thickness: 0.6, minimum: 0.9 });
    expect(wall && 'places' in wall ? wall.places[0]?.faces : []).toEqual(expect.arrayContaining(['F1:-z', 'F1:+z']));

    const foil = checkPrint([box('Foil', [0, 0, 0], [20, 20, 0.3])], PLA);
    expect(foil.status).toBe('block');
    expect(foil.findings.find((f) => f.kind === 'thinWall')).toMatchObject({ severity: 'block', thickness: 0.3 });
  });

  it('finds the ceiling of a table top as needing support, and the small foot on the bed', () => {
    const table = checkPrint([boxesBody('Table', [[[9, 9, 0], [11, 11, 10]], [[0, 0, 10], [20, 20, 12]]])], PLA);
    expect(table.status).toBe('warn');
    const support = table.findings.find((f) => f.kind === 'support');
    expect(support).toMatchObject({ severity: 'warn', limit: 45, places: [{ body: 'Table', faces: ['F2:-z'] }] });
    // The top reaches 9 mm out from the leg; only the first 1.5 mm around it grows from the leg.
    const area = support && 'area' in support ? support.area : 0;
    expect(area).toBeGreaterThan(330);
    expect(area).toBeLessThan(396);
    expect(table.findings.find((f) => f.kind === 'contact')).toMatchObject({ area: 4, places: [{ body: 'Table', faces: ['F1:-z'] }] });
  });

  it('lays every body on the bed by itself, as the slicer does, and warns when bodies touch', () => {
    // The same table as two bodies: in the slicer the top lies on the bed apart from the leg.
    const apart = checkPrint([box('Leg', [9, 9, 0], [11, 11, 10]), box('Top', [0, 0, 10], [20, 20, 12])], PLA);
    expect(apart.findings.map((f) => f.kind)).not.toContain('support');
    expect(apart.findings.find((f) => f.kind === 'separate')).toMatchObject({ severity: 'warn', bodies: ['Leg', 'Top'] });
    // Three sleeves of 5, 10 and 15 mm printed upside down: each still stands on its own end.
    const sleeves = [box('S5', [0, 0, 0], [12, 12, 5]), box('S10', [17, 0, 0], [29, 12, 10]), box('S15', [34, 0, 0], [46, 12, 15])];
    const flipped = checkPrint(sleeves, PLA, [], [0, 0, 1]);
    expect(flipped).toEqual({ status: 'ready', findings: [] });
  });

  it('lets bridges and short overhangs print without support, as the slicer does', () => {
    const bridge = (gap: number) =>
      checkPrint([boxesBody('Bridge', [[[0, 0, 0], [5, 10, 10]], [[5 + gap, 0, 0], [10 + gap, 10, 10]], [[0, 0, 10], [10 + gap, 10, 14]]])], PLA);
    expect(bridge(4).findings.map((f) => f.kind)).not.toContain('support');
    expect(bridge(8).findings.map((f) => f.kind)).not.toContain('support');
    const wide = bridge(20).findings.find((f) => f.kind === 'support');
    expect(wide && 'area' in wide ? wide.area : 0).toBeGreaterThan(100);

    // A ledge sticking out of a wall: 1 mm grows from the wall, 8 mm needs support.
    const ledge = (reach: number) => checkPrint([boxesBody('Ledge', [[[0, 0, 0], [10, 10, 10]], [[10, 0, 5], [10 + reach, 10, 10]]])], PLA);
    expect(ledge(1).findings.map((f) => f.kind)).not.toContain('support');
    expect(ledge(8).findings.find((f) => f.kind === 'support')).toMatchObject({ places: [{ body: 'Ledge', faces: ['F2:-z'] }] });
  });

  it('bridges the top of a lying hole, but supports the underside of a lying tube', () => {
    const result = checkPrint([lyingTube('Tube', 6, 2.25, 10)], PLA);
    const support = result.findings.find((f) => f.kind === 'support');
    const faces = support && 'places' in support ? support.places.flatMap((place) => place.faces) : [];
    expect(faces).not.toContain('F1:hole');
    expect(faces).toContain('F1:outer');
  });

  it('blocks on a feature SolidCraft could not build and warns on its warnings; rolled back ones do not count', () => {
    const features = [
      { name: 'Fillet1', error: 'radius too large', warning: null, suppressed: false, rolledBack: false },
      { name: 'Shell1', error: null, warning: 'thin result', suppressed: false, rolledBack: false },
      { name: 'Hole1', error: 'no face', warning: null, suppressed: false, rolledBack: true },
    ];
    const result = checkPrint([box('Block', [0, 0, 0], [40, 30, 10])], PLA, features);
    expect(result.status).toBe('block');
    expect(result.findings.map((f) => (f.kind === 'feature' ? `${f.severity}:${f.feature}` : f.kind))).toEqual(['block:Fillet1', 'warn:Shell1']);
  });

  it('checks the real cable clip: it fits, stands on its base and has no wall the nozzle cannot print', () => {
    const fixture = new URL('../fixtures/', import.meta.url);
    const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL('cable-clip.3mf', fixture))));
    const faces = JSON.parse(readFileSync(new URL('cable-clip.faces.json', fixture), 'utf8')) as FaceTable;
    const clip = { name: mesh.name, model: buildViewerModel(buildRenderMesh(mesh, faces), faces) };
    const result = checkPrint([clip], PLA);
    expect(result.status).not.toBe('block');
    expect(result.findings.map((f) => f.kind)).not.toContain('size');
    expect(result.findings.map((f) => f.kind)).not.toContain('contact');
  });
});
