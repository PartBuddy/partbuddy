/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { smallOverhangReach } from './overhang';
import { checkPrint, minimumFloor, minimumWall, withClearance, type PrintCheckBody, type PrintCheckProfile } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';
import { boxesBody, lyingTube, prismBody } from './testShapes';
import { buildViewerModel } from './viewerModel';

const PLA: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 };

/** A box as SolidCraft would export it: six faces, outward triangles, named like `F1:+z`. */
function box(name: string, min: [number, number, number], max: [number, number, number], lid = true): PrintCheckBody {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  // Quads counter-clockwise seen from outside: -z, +z, -y, +x, +y, -x.
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const names = ['F1:-z', 'F1:+z', 'F1:-y', 'F1:+x', 'F1:+y', 'F1:-x'];
  // Without its top face the box is an open shell, as a surface body comes from SolidCraft.
  if (!lid) {
    quads.splice(1, 1);
    names.splice(1, 1);
  }
  const indices: number[] = [];
  const triangleFaces: number[] = [];
  quads.forEach(([a, b, c, d], face) => {
    indices.push(a!, b!, c!, a!, c!, d!);
    triangleFaces.push(face, face);
  });
  const mesh: TaggedMesh = {
    name,
    faceCount: names.length,
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

const thinOf = (body: PrintCheckBody, profile = PLA) => checkPrint([body], profile).findings.filter((f) => f.kind === 'thinWall');

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

  it('lays a long bar across the diagonal of the plate, as the slicer turns it', () => {
    // Audit D2, MG-02: 300 × 10 × 5 needs (300 + 10) / √2 = 219.2 mm a side and was blocked as 300 mm.
    expect(checkPrint([box('Bar', [0, 0, 0], [300, 10, 5])], PLA).status).toBe('ready');
    expect(checkPrint([box('Bar', [0, 0, 0], [300, 20, 10])], PLA).status).toBe('ready');
    // 370 mm needs 268.7 mm a side: that one does not fit.
    expect(checkPrint([box('Bar', [0, 0, 0], [370, 10, 5])], PLA).findings).toEqual([{ kind: 'size', severity: 'block', body: 'Bar', size: [370, 10, 5], bed: [256, 256, 256], lying: false }]);
    // Turning about Z does not make a part lower.
    expect(checkPrint([box('Post', [0, 0, 0], [10, 10, 300])], PLA).status).toBe('block');
  });

  it('holds every body against the plate by itself, wherever it was designed', () => {
    // Audit D1, MG-03: two bodies apart read as one part of 320 × 20 and 500 × 200 mm.
    expect(checkPrint([box('A', [0, 0, 0], [20, 20, 20]), box('B', [300, 0, 0], [320, 20, 20])], PLA).status).toBe('ready');
    expect(checkPrint([box('A', [0, 0, 0], [200, 200, 3]), box('B', [300, 0, 0], [500, 200, 3])], PLA).status).toBe('ready');
    // The one that is too large is named.
    const mixed = checkPrint([box('Small', [0, 0, 0], [20, 20, 20]), box('Tall', [300, 0, 0], [320, 20, 300])], PLA);
    expect(mixed.findings.filter((f) => f.kind === 'size')).toMatchObject([{ body: 'Tall', size: [20, 20, 300] }]);
  });

  it('warns about walls under two lines and blocks walls under the nozzle width, with their faces', () => {
    expect(minimumWall(0.4)).toBe(0.9);
    const thin = thinOf(box('Wall', [0, 0, 0], [30, 0.6, 20]));
    expect(thin).toMatchObject([{ severity: 'warn', floor: false, thickness: 0.6, minimum: 0.9, area: 1200 }]);
    expect(thin[0]?.places[0]?.faces).toEqual(expect.arrayContaining(['F1:-y', 'F1:+y']));
    expect(thinOf(box('Foil', [0, 0, 0], [30, 0.3, 20]))).toMatchObject([{ severity: 'block', floor: false, thickness: 0.3 }]);
  });

  it('does not count a wall of just two lines, only one under them', () => {
    // Audit MG-04: 0.9 mm, the smallest wall the assistant snaps to, read as "0.9 under the 0.9 of two lines".
    expect(thinOf(box('Wall', [0, 0, 0], [20, 0.9, 20]))).toEqual([]);
    expect(thinOf(box('Wall', [0, 0, 0], [20, 0.89, 20]))).toMatchObject([{ severity: 'warn', thickness: 0.89 }]);
  });

  it('measures what lies flat in layers: a floor of four layers is sound, one layer still prints', () => {
    expect(minimumFloor(0.2)).toBe(0.8);
    expect(minimumFloor(0.3)).toBe(1.2);
    // Audit N-druckpruefung-1: the 0.8 mm floor the design rule asks for read as a wall under two lines.
    expect(checkPrint([box('Plate', [0, 0, 0], [30, 30, 0.8])], PLA)).toEqual({ status: 'ready', findings: [] });
    // Audit D4: 0.3 mm flat on the bed is a layer and a half, not "thinner than the nozzle, does not print".
    const skin = thinOf(box('Plate', [0, 0, 0], [30, 30, 0.3]));
    expect(skin).toMatchObject([{ severity: 'warn', floor: true, thickness: 0.3, minimum: 0.8, area: 1800 }]);
    expect(skin[0]?.places[0]?.faces).toEqual(['F1:-z', 'F1:+z']);
    // Under one layer nothing is laid.
    expect(thinOf(box('Film', [0, 0, 0], [30, 30, 0.1]))).toMatchObject([{ severity: 'block', floor: true }]);
    // The floor follows the layer height, and the way the body lies.
    expect(thinOf(box('Plate', [0, 0, 0], [30, 30, 1]), { ...PLA, layer: 0.3 })).toMatchObject([{ floor: true, minimum: 1.2 }]);
    const lying = { ...boxesBody('Wall', [[[0, 0, 0], [30, 0.6, 20]]]), printFace: 'F1:-y' };
    expect(thinOf(lying)).toMatchObject([{ severity: 'warn', floor: true, thickness: 0.6, minimum: 0.8 }]);
  });

  it('finds a wall that tapers to nothing between the middles of its triangles', () => {
    // Audit D6: 30 long, 20 high, 0.2 mm at the bed and 2.5 mm on top; both face middles lie above 0.9 mm.
    const taper = thinOf(prismBody('Taper', [[0, 0], [0.2, 0], [2.5, 20], [0, 20]], 30));
    expect(taper).toMatchObject([{ severity: 'block', floor: false, thickness: 0.2, places: [{ body: 'Taper', faces: ['F1:s1', 'F1:s3'] }] }]);
    // 182.6 mm² a side lie under two lines.
    expect(taper[0]?.area).toBeGreaterThan(340);
    expect(taper[0]?.area).toBeLessThan(390);
    // The same wall 2.5 mm all the way up has nothing thin.
    expect(thinOf(prismBody('Wall', [[0, 0], [2.5, 0], [2.5, 20], [0, 20]], 30))).toEqual([]);
  });

  it('marks the ceiling of a table top as an overhang by angle, and the small foot on the bed', () => {
    const table = checkPrint([boxesBody('Table', [[[9, 9, 0], [11, 11, 10]], [[0, 0, 10], [20, 20, 12]]])], PLA);
    expect(table.status).toBe('warn');
    // By angle only: the whole ceiling, without guessing what the slicer bridges or grows from the leg.
    expect(table.findings.find((f) => f.kind === 'overhang')).toMatchObject({ severity: 'warn', limit: 45, area: 400, places: [{ body: 'Table', faces: ['F2:-z'] }] });
    expect(table.findings.find((f) => f.kind === 'contact')).toMatchObject({ area: 4, places: [{ body: 'Table', faces: ['F1:-z'] }] });
    // An overhang never makes the light red.
    expect(table.findings.every((f) => f.severity !== 'block')).toBe(true);
  });

  it('checks a body lying on its print face, and as designed when the face is not a flat one of the body', () => {
    const table = boxesBody('Table', [[[9, 9, 0], [11, 11, 10]], [[0, 0, 10], [20, 20, 12]]]);
    // On its top the table has nothing hanging, and the whole top on the bed.
    // (The test shape is two boxes, so the leg's hidden end face is all that still faces down.)
    const onTop = checkPrint([{ ...table, printFace: 'F2:+z' }], PLA).findings;
    expect(onTop.map((f) => f.kind)).toEqual(['overhang']);
    expect(onTop[0]).toMatchObject({ area: 4, places: [{ body: 'Table', faces: ['F1:+z'] }] });
    expect(checkPrint([{ ...table, printFace: 'gone' }], PLA).findings.map((f) => f.kind)).toEqual(['overhang', 'contact']);
    // On its side the finding still names the faces where they are in the design.
    const side = checkPrint([{ ...table, printFace: 'F2:+x' }], PLA).findings.find((f) => f.kind === 'overhang');
    expect(side && 'box' in side ? side.box?.max[2] : null).toBeLessThanOrEqual(12);
  });

  it('lays every body on the bed by itself, as the slicer does, and warns when bodies touch', () => {
    // The same table as two bodies: in the slicer the top lies on the bed apart from the leg.
    const apart = checkPrint([box('Leg', [9, 9, 0], [11, 11, 10]), box('Top', [0, 0, 10], [20, 20, 12])], PLA);
    expect(apart.findings.map((f) => f.kind)).not.toContain('overhang');
    expect(apart.findings.find((f) => f.kind === 'separate')).toMatchObject({ severity: 'warn', bodies: ['Leg', 'Top'] });
  });

  it('blocks a body that is an open shell, and says nothing else about it', () => {
    // Audit N-druckpruefung-2: a cube without its top face (SolidCraft: closed false, volume 0) read ready.
    const shell = box('Shell', [0, 0, 0], [20, 20, 20], false);
    expect(shell.model.openEdges).toBe(4);
    expect(checkPrint([shell], PLA)).toEqual({ status: 'block', findings: [{ kind: 'open', severity: 'block', bodies: ['Shell'] }] });
    // The closed bodies beside it are still checked, and a closed one alone has no such finding.
    const beside = checkPrint([shell, box('Rod', [30, 0, 0], [40, 10, 300])], PLA).findings;
    expect(beside.map((f) => f.kind)).toEqual(['open', 'size']);
    expect(box('Cube', [0, 0, 0], [20, 20, 20]).model.openEdges).toBe(0);
  });

  it('looks at what lies on the bed body by body: a broad one does not hold one standing on an edge', () => {
    // Audit D3: 400 mm² of a cube hid a second body with nothing on the bed.
    const cube = box('Cube', [20, 0, 0], [40, 20, 20]);
    const onEdge = prismBody('Diamond', [[0, 0], [10, 10], [0, 20], [-10, 10]], 20);
    const contact = checkPrint([cube, onEdge], PLA).findings.filter((f) => f.kind === 'contact');
    expect(contact).toMatchObject([{ severity: 'warn', area: 0, places: [{ body: 'Diamond', faces: [] }] }]);
    // Two bodies that both lie flat: nothing.
    expect(checkPrint([cube, box('Second', [50, 0, 0], [70, 20, 20])], PLA)).toEqual({ status: 'ready', findings: [] });
  });

  it('takes a 45° chamfer facing the bed as printable, a flatter one as an overhang', () => {
    // A bar with its lower edges chamfered: 3 mm at 45°, and 5 mm across, 3 mm up (59° from the vertical).
    const at45 = checkPrint([prismBody('Bar', [[3, 0], [17, 0], [20, 3], [20, 10], [0, 10], [0, 3]], 40)], PLA);
    expect(at45).toEqual({ status: 'ready', findings: [] });
    const flat = checkPrint([prismBody('Bar', [[5, 0], [15, 0], [20, 3], [20, 10], [0, 10], [0, 3]], 40)], PLA);
    expect(flat.findings.find((f) => f.kind === 'overhang')).toMatchObject({ places: [{ body: 'Bar', faces: ['F1:s1', 'F1:s5'] }] });
  });

  it('leaves out small overhangs that hang from the material below, as the slicers do', () => {
    // A wall with a ledge under its top, outline in XZ from the top left corner (fan from there).
    const ledge = (out: number, depth: number) => prismBody('Hook', [[0, 9.5], [0, 0], [3, 0], [3, 8], [3 + out, 8], [3 + out, 9.5]], depth);
    expect(smallOverhangReach(0.4)).toBe(1.8);
    // The nose of a snap fit: 0.8 mm out.
    expect(checkPrint([ledge(0.8, 20)], PLA).findings.map((f) => f.kind)).not.toContain('overhang');
    // 5 mm out it needs support, and so does a narrow arm 1 mm wide that reaches 5 mm.
    expect(checkPrint([ledge(5, 20)], PLA).findings.find((f) => f.kind === 'overhang')).toMatchObject({ places: [{ body: 'Hook', faces: ['F1:s3'] }] });
    expect(checkPrint([ledge(5, 1)], PLA).findings.map((f) => f.kind)).toContain('overhang');
  });

  it('takes the knife edge where a thread runs out as a wedge, not as a thin wall', () => {
    // A 30° wedge lying on the bed, as the end of a bolt cuts a 60° thread flank.
    const wedge = checkPrint([prismBody('Wedge', [[0, 0], [20, 0], [0, 20 * Math.tan(Math.PI / 6)]], 20)], PLA);
    expect(wedge.findings.map((f) => f.kind)).not.toContain('thinWall');
    // A wall with 5° draft still is one.
    const drafted = checkPrint([prismBody('Fin', [[0, 0], [0.6, 0], [0.6 - 3 * Math.tan(Math.PI / 36), 3], [0, 3]], 20)], PLA);
    expect(drafted.findings.map((f) => f.kind)).toContain('thinWall');
  });

  it('follows the overhang angle of the material', () => {
    const tube = lyingTube('Tube', 6, 2.25, 10);
    const faces = (limit: number) => {
      const finding = checkPrint([tube], { ...PLA, overhang: limit }).findings.find((f) => f.kind === 'overhang');
      return finding && 'area' in finding ? finding.area : 0;
    };
    // A steeper limit leaves less of the round underside as an overhang.
    expect(faces(60)).toBeLessThan(faces(45));
    expect(faces(45)).toBeGreaterThan(0);
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
    // 64 × 32 mm does not go onto a 50 mm plate, turned or not.
    expect(checkPrint([clip], { ...PLA, bed: [50, 50, 256] }).findings.find((f) => f.kind === 'size')).toMatchObject({ body: 'CableClip', size: [64, 32, 20] });
  });
});

describe('clearance between parts (F2)', () => {
  const ready = { status: 'ready' as const, findings: [] };
  const box = { min: [9, 0, 0] as [number, number, number], max: [10, 10, 10] as [number, number, number] };

  it('warns about bodies that share volume, and ignores the contact of two faces', () => {
    const check = withClearance(ready, { overlaps: [{ a: 'Housing', b: 'Lid', volume: 100.004, box }, { a: 'A', b: 'B', volume: 0.001, box }], near: [] }, 0.15);
    expect(check.status).toBe('warn');
    expect(check.findings).toEqual([{ kind: 'overlap', severity: 'warn', bodies: ['Housing', 'Lid'], volume: 100, places: [], box }]);
  });

  it('warns about gaps under the push fit, but not about touching or roomy ones', () => {
    const near = (distance: number) => ({ a: 'A', b: 'C', distance, from: [0, 10, 10] as [number, number, number], to: [0, 10 + distance, 10] as [number, number, number] });
    const check = withClearance(ready, { overlaps: [], near: [near(0.1), near(0), near(0.2)] }, 0.15);
    expect(check.findings).toEqual([{ kind: 'tight', severity: 'warn', bodies: ['A', 'C'], gap: 0.1, minimum: 0.15, places: [], box: { min: [-2, 8, 8], max: [2, 12.1, 12] } }]);
    // A material without a push fit (clearance 0 or less) wants no gap.
    expect(withClearance(ready, { overlaps: [], near: [near(0.1)] }, 0).findings).toEqual([]);
  });

  it('keeps what blocks printing first and the status of the worst finding', () => {
    const blocked = { status: 'block' as const, findings: [{ kind: 'feature' as const, severity: 'block' as const, feature: 'Fillet1', message: 'failed' }] };
    const check = withClearance(blocked, { overlaps: [{ a: 'A', b: 'B', volume: 5, box }], near: [] }, 0.15);
    expect(check.status).toBe('block');
    expect(check.findings.map((finding) => finding.kind)).toEqual(['feature', 'overlap']);
  });
});
