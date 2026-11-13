/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { smallOverhangReach } from './overhang';
import { checkPrint, laidBodies, minimumFloor, minimumWall, thinnestLine, withClearance, type PrintCheckBody, type PrintCheckProfile } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';
import { boxesBody, gridBody, lathe, lyingRod, lyingTube, posed, prismBody, rawBody, revolved } from './testShapes';
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
    // It fits; 200 mm high on 20 × 20 it wants a brim (audit D17), which is no matter of size.
    const small = checkPrint([box('Rod', [0, 0, 0], [20, 20, 200])], { ...PLA, bed: [180, 180, 250] });
    expect(small.findings.map((f) => f.kind)).toEqual(['contact']);
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
    // A profile without a layer height is checked as 0.2 mm, not passed (it read ready).
    expect(thinOf(box('Plate', [0, 0, 0], [30, 30, 0.3]), { ...PLA, layer: undefined as unknown as number })).toMatchObject([{ floor: true, minimum: 0.8, layers: 4 }]);
    expect(minimumFloor(Number.NaN)).toBe(0.8);
    // The finding says how many layers its minimum is: four from 0.2 mm on, more below (0.8 mm at 0.12 mm).
    expect(skin[0]?.layers).toBe(4);
    expect(thinOf(box('Plate', [0, 0, 0], [30, 30, 0.3]), { ...PLA, layer: 0.12 })).toMatchObject([{ minimum: 0.8, layers: 6.7 }]);
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
    // Printed as one piece they stay together in the slicer (audit G1, review of PR #366 K7): the top hangs over the leg, which alone stands on the bed.
    const together = checkPrint([{ ...box('Leg', [9, 9, 0], [11, 11, 10]), group: 'Leg' }, { ...box('Top', [0, 0, 10], [20, 20, 12]), group: 'Leg' }], PLA);
    expect(together.findings.map((f) => f.kind)).toEqual(['fused', 'overhang', 'contact']);
    expect(together.findings.find((f) => f.kind === 'fused')).toEqual({ kind: 'fused', severity: 'warn', bodies: ['Leg', 'Top'] });
  });

  it('says where bodies printed as one piece touch, as they fuse there, and not where a gap parts them (review of PR 366)', () => {
    const pair = (gap: number) => checkPrint([{ ...box('Box', [0, 0, 0], [40, 30, 30]), group: 'Box' }, { ...box('Lid', [40 + gap, 0, 0], [80 + gap, 30, 30]), group: 'Box' }], PLA);
    expect(pair(0).findings).toEqual([{ kind: 'fused', severity: 'warn', bodies: ['Box', 'Lid'] }]);
    expect(pair(0.4).findings).toEqual([]);
  });

  it('blocks a body that is an open shell, and says nothing else about it', () => {
    // Audit N-druckpruefung-2: a cube without its top face (SolidCraft: closed false, volume 0) read ready.
    const shell = box('Shell', [0, 0, 0], [20, 20, 20], false);
    expect(shell.model.openEdges).toBe(4);
    expect(checkPrint([shell], PLA)).toEqual({ status: 'block', findings: [{ kind: 'open', severity: 'block', bodies: ['Shell'] }] });
    // The closed bodies beside it are still checked, and a closed one alone has no such finding.
    const beside = checkPrint([shell, box('Rod', [30, 0, 0], [40, 10, 300])], PLA).findings;
    expect(beside.map((f) => f.kind)).toEqual(['open', 'size', 'contact']);
    expect(box('Cube', [0, 0, 0], [20, 20, 20]).model.openEdges).toBe(0);
  });

  it('checks a body whose model carries no count of open edges as a closed one', () => {
    // It fell out of both the open and the closed bodies: 10 × 10 × 300 mm read ready.
    const post = box('Post', [0, 0, 0], [10, 10, 300]);
    const bare = { ...post, model: { ...post.model, openEdges: undefined as unknown as number } };
    expect(checkPrint([bare], PLA).findings).toMatchObject([{ kind: 'size', severity: 'block', body: 'Post' }, { kind: 'contact' }]);
  });

  it('gathers the bodies with little on the bed into one finding that names them all', () => {
    // Fifty pins 4 × 4 mm made fifty findings, of which the report kept 40 and the note 12.
    // 20 mm high, as at 10 mm a pin stands (Bambu Studio lays no brim for it, audit D17).
    const pins = Array.from({ length: 50 }, (_, i) => box(`Pin${String(i)}`, [i * 6, 0, 0], [i * 6 + 4, 4, 20]));
    const findings = checkPrint(pins, PLA).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'contact', severity: 'warn', area: 16, bodies: 50 });
    expect(findings[0]?.kind === 'contact' ? findings[0].places.map((place) => place.body) : []).toEqual(pins.map((pin) => pin.name));
  });

  it('looks at what lies on the bed body by body: a broad one does not hold one standing on an edge', () => {
    // Audit D3: 400 mm² of a cube hid a second body with nothing on the bed.
    const cube = box('Cube', [20, 0, 0], [40, 20, 20]);
    const onEdge = prismBody('Diamond', [[0, 0], [10, 10], [0, 20], [-10, 10]], 20);
    const contact = checkPrint([cube, onEdge], PLA).findings.filter((f) => f.kind === 'contact');
    expect(contact).toMatchObject([{ severity: 'warn', area: 0, bodies: 1, places: [{ body: 'Diamond', faces: [] }] }]);
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

  it('finds a hole that cuts the wall of the part open as a wall of nothing, and leaves a cut cylinder that opens alone (audit N-normteile-policy-2)', () => {
    // A block 20 × 20 × 20 and a 3.4 mm hole along Y, its axis 1 mm under the top: the top is open over the hole's length.
    const [cx, cz, r] = [10, 19, 1.7];
    const edge = Math.asin((20 - cz) / r);
    const arc = Array.from({ length: 41 }, (_, i): [number, number] => {
      const angle = edge - (i * (Math.PI + 2 * edge)) / 40;
      return [cx + r * Math.cos(angle), cz + r * Math.sin(angle)];
    });
    const outline: [number, number][] = [[0, 0], [20, 0], [20, 20], ...arc, [0, 20]];
    const cut = (name: string) => (i: number) => (i >= 3 && i < 3 + 40 ? { name, cylinder: { origin: [cx, 0, cz] as [number, number, number], axis: [0, 1, 0] as [number, number, number], radius: r } } : undefined);
    const opened = thinOf(prismBody('Cube', outline, 20, cut('F2:bore:side:0#1')));
    expect(opened).toHaveLength(1);
    // Each arc's piece is a face of its own here; SolidCraft names the pieces of a split bore alike.
    expect(opened[0]).toMatchObject({ severity: 'block', floor: false, places: [{ body: 'Cube' }] });
    expect(new Set((opened[0] as { places: { faces: string[] }[] }).places[0]?.faces)).toEqual(new Set(['F2:bore:side:0#1']));
    expect((opened[0] as { thickness: number }).thickness).toBeLessThan(0.1);
    // The same shape cut by a cylinder of another feature (a knuckle's room, a flute) may open on purpose.
    expect(thinOf(prismBody('Cube', outline, 20, cut('F2:side')))).toEqual([]);
  });

  it('on SolidCraft\'s own meshes: finds the hole that opens the side, and no wall at the rim of a hole drilled across a rod, into a chamfer or askew (review of PR #365)', () => {
    const fixture = new URL('../fixtures/', import.meta.url);
    const tables = JSON.parse(readFileSync(new URL('holes.faces.json', fixture), 'utf8')) as Record<string, FaceTable>;
    const thin = (name: string) => {
      const table = tables[name];
      if (!table) throw new Error(`no fixture ${name}`);
      const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL(`holes-${name}.3mf`, fixture))));
      return thinOf({ name, model: buildViewerModel(buildRenderMesh(mesh, table), table) });
    };
    // A 3.4 mm hole 1 mm from the side: the side is open over 20 mm (the old check said ready).
    const edge = thin('Edge');
    expect(edge).toHaveLength(1);
    expect(edge[0]).toMatchObject({ severity: 'block', floor: false, thickness: 0 });
    expect((edge[0] as { places: { faces: string[] }[] }).places[0]?.faces.every((face) => face.includes(':bore:'))).toBe(true);
    // The same cylinder cut by solid.cylinder (a groove, a knuckle's room) may open on purpose; across a rod, the hole's
    // rim meets the round face at a slant, as it does a chamfer and the faces of a hole drilled askew.
    for (const name of ['Groove', 'Rod8M5', 'Rod10M5', 'Rod6M3', 'Rod20M8', 'Chamfer', 'Slant', 'Cross']) expect(thin(name), name).toEqual([]);
  }, 60_000);

  it('on SolidCraft\'s own mesh: the contract test\'s wall holder is ready to print (contract test run 43445239910)', () => {
    // Plate, hook and lip with two lying countersunk holes and fillets (tools/fixtures/wallholder.script.json, as test/fakeClaude.mjs builds it).
    const fixture = new URL('../fixtures/', import.meta.url);
    const table = (JSON.parse(readFileSync(new URL('wallholder.faces.json', fixture), 'utf8')) as Record<string, FaceTable>)['Wandhalter'];
    if (!table) throw new Error('no fixture Wandhalter');
    const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL('wallholder-Wandhalter.3mf', fixture))));
    const holder = { name: 'Wandhalter', model: buildViewerModel(buildRenderMesh(mesh, table), table) };
    for (const place of [PLACES[0]!, { turn: 30, mirrored: true, lift: 10 }]) expect(checkPrint(placed([holder], place), PLA), JSON.stringify(place)).toEqual({ status: 'ready', findings: [] });
  }, 120_000);

  it('checks overhangs at 45° where the profile names no angle', () => {
    // With the angle undefined nothing passed the limit: a ceiling 14 mm wide read ready.
    const table = boxesBody('Table', [[[9, 9, 0], [11, 11, 10]], [[0, 0, 10], [20, 20, 12]]]);
    for (const overhang of [undefined as unknown as number, Number.NaN]) {
      expect(checkPrint([table], { ...PLA, overhang }).findings.find((f) => f.kind === 'overhang')).toMatchObject({ area: 400, limit: 45 });
    }
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

  it('blocks on a feature SolidCraft could not build and warns on its warnings; the error of a rolled back one does not count', () => {
    const features = [
      { name: 'Fillet1', error: 'radius too large', warning: null, suppressed: false, rolledBack: false },
      { name: 'Shell1', error: null, warning: 'thin result', suppressed: false, rolledBack: false },
      { name: 'Hole1', error: 'no face', warning: null, suppressed: false, rolledBack: true },
    ];
    const result = checkPrint([box('Block', [0, 0, 0], [40, 30, 10])], PLA, features);
    expect(result.status).toBe('block');
    // Rolled back, it is not in the part: that is said (audit H-03), its error is not.
    expect(result.findings.map((f) => (f.kind === 'feature' ? `${f.severity}:${f.feature}` : f.kind))).toEqual(['block:Fillet1', 'leftOut', 'warn:Shell1']);
  });

  it('says which features are left out of the part: suppressed, or rolled back (audit H-03)', () => {
    const feature = (name: string, more: { error?: string; suppressed?: boolean; rolledBack?: boolean } = {}) => ({ name, error: more.error ?? null, warning: null, suppressed: more.suppressed ?? false, rolledBack: more.rolledBack ?? false });
    const block = box('Block', [0, 0, 0], [40, 30, 10]);
    // A chamfer larger than the wall blocked; suppressed, it read ready, with the chamfer missing from the part.
    expect(checkPrint([block], PLA, [feature('Box'), feature('Chamfer1', { error: 'chamfer larger than the wall' })]).status).toBe('block');
    const suppressed = checkPrint([block], PLA, [feature('Box'), feature('Chamfer1', { error: 'chamfer larger than the wall', suppressed: true })]);
    expect(suppressed).toEqual({ status: 'warn', findings: [{ kind: 'leftOut', severity: 'warn', rolledBack: false, features: ['Chamfer1'] }] });
    // Rolled back to the first of four: one finding for the three after the marker.
    const rolled = checkPrint([block], PLA, [feature('Box'), feature('Hole1', { rolledBack: true }), feature('Fillet1', { rolledBack: true }), feature('Shell1', { rolledBack: true })]);
    expect(rolled).toEqual({ status: 'warn', findings: [{ kind: 'leftOut', severity: 'warn', rolledBack: true, features: ['Hole1', 'Fillet1', 'Shell1'] }] });
    // All in: nothing.
    expect(checkPrint([block], PLA, [feature('Box'), feature('Hole1')])).toEqual({ status: 'ready', findings: [] });
  });

  it('says nothing of a suppressed or rolled back sketch or plane: they build no material (review of PR #371, K5)', () => {
    const block = box('Block', [0, 0, 0], [40, 30, 10]);
    const entry = (name: string, type: string, more: { suppressed?: boolean; rolledBack?: boolean }) => ({ name, type, error: null, warning: null, suppressed: more.suppressed ?? false, rolledBack: more.rolledBack ?? false });
    const quiet = [entry('S1', 'Sketch', { suppressed: true }), entry('Plane1', 'ConstructionPlane', { suppressed: true }), entry('Axis1', 'ConstructionAxis', { rolledBack: true }), entry('S2', 'Sketch', { rolledBack: true })];
    expect(checkPrint([block], PLA, [entry('E1', 'ExtrudeFeature', {}), ...quiet])).toEqual({ status: 'ready', findings: [] });
    // The fillet after them is said.
    expect(checkPrint([block], PLA, [entry('E1', 'ExtrudeFeature', {}), ...quiet, entry('Fillet1', 'FilletFeature', { rolledBack: true })]).findings).toEqual([{ kind: 'leftOut', severity: 'warn', rolledBack: true, features: ['Fillet1'] }]);
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

describe('parts printed together (audit 2026-11-12, G1)', () => {
  // The hinge of the mechanism tool between a box 30 mm high and a lid block on z 22…30 beside it
  // (tools/fixtures/hinge.script.json, the audit's `g1-lid-underside-lowest`).
  const fixture = new URL('../fixtures/', import.meta.url);
  const tables = JSON.parse(readFileSync(new URL('hinge.faces.json', fixture), 'utf8')) as Record<string, FaceTable>;
  const hinge = (group?: string, faces: Partial<Record<string, string>> = {}): PrintCheckBody[] =>
    ['Box', 'Lid'].map((name) => {
      const table = tables[name];
      if (!table) throw new Error(`no fixture ${name}`);
      const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL(`hinge-${name}.3mf`, fixture))));
      return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table), printFace: faces[name], group };
    });
  const lidFaces = (check: ReturnType<typeof checkPrint>) => {
    const overhang = check.findings.find((f) => f.kind === 'overhang');
    return overhang && 'places' in overhang ? (overhang.places.find((place) => place.body === 'Lid')?.faces ?? []) : [];
  };

  it('stands a print-in-place hinge on one bed: the lid that starts 22 mm up hangs over it', () => {
    const together = checkPrint(hinge('hinge'), PLA);
    // The lid's underside is 1200 mm² in the air; on its own bed it was taken for 1200 mm² on the bed.
    expect(lidFaces(together)).toContain('F2:-z');
    expect((together.findings.find((f) => f.kind === 'overhang') as { area: number }).area).toBeGreaterThanOrEqual(1200);
    // On the bed stands the box: the hinge does not come loose.
    expect(together.findings.find((f) => f.kind === 'contact')).toBeUndefined();
  }, 60_000);

  it('checks parts printed apart each on its own bed, as before (counter-check)', () => {
    // A guide's two parts print apart: each lies on its own lowest point, the lid's underside on the bed.
    expect(lidFaces(checkPrint(hinge(), PLA))).not.toContain('F2:-z');
  }, 60_000);

  it('turns the group as one onto the print face of one of its bodies', () => {
    // On the box's top (+z) the hinge lies upside down, the lid turned with it: both stand on the barrels, which reach
    // 1.5 mm over the tops (z 31.5), so the tops of box and lid hang that far over the bed and little stands on it.
    const bodies = hinge('hinge', { Box: 'F1:+z' });
    expect(laidBodies(bodies).map((body) => [body.down?.toArray(), Math.round(body.bed * 10) / 10])).toEqual([[[0, 0, 1], -31.5], [[0, 0, 1], -31.5]]);
    const turned = checkPrint(bodies, PLA);
    expect(lidFaces(turned)).toContain('F2:+z');
    expect(lidFaces(turned)).not.toContain('F2:-z');
    expect(turned.findings.find((f) => f.kind === 'contact')).toMatchObject({ bodies: 2 });
  }, 60_000);
});

/** Each placement a case is checked in: turned about Z, mirrored, and lifted off the bed. */
/** Time for a test of many placements to finish at all on a busy runner; no measure of the check. */
const PATIENCE = 120_000;
const PLACES = [0, 1, 7.5, 15, 30, 45, 60, 75, 90].flatMap((turn) => [false, true].flatMap((mirrored) => [0, 10].map((lift) => ({ turn, mirrored, lift }))));
const placed = (bodies: PrintCheckBody[], { turn, mirrored, lift }: (typeof PLACES)[number]) => bodies.map((body) => posed(body, turn, mirrored, lift));

describe('bodies that touch (audit N-druckpruefung-3, MG-19, D41)', () => {
  const bar = (name: string, min: [number, number, number], max: [number, number, number]) => boxesBody(name, [[min, max]]);
  const touching = (bodies: PrintCheckBody[]) => checkPrint(bodies, PLA).findings.find((f) => f.kind === 'separate');
  const cases: [string, PrintCheckBody[], boolean][] = [
    // Two bars across each other, no corner of one near the other: 100 mm² of contact read ready.
    ['bars laid across each other', [bar('A', [0, 25, 0], [60, 35, 10]), bar('B', [25, 0, 10], [35, 60, 20])], true],
    ['bars run into each other across', [bar('A', [0, 25, 0], [60, 35, 10]), bar('B', [25, 0, 0], [35, 60, 10])], true],
    ['bars across, 0.04 mm apart', [bar('A', [0, 25, 0], [60, 35, 10]), bar('B', [25, 0, 10.04], [35, 60, 20])], true],
    ['a cube wholly inside another', [bar('A', [0, 0, 0], [30, 30, 30]), bar('B', [10, 10, 10], [20, 20, 20])], true],
    ['a bar through a cube, no corner inside', [bar('A', [0, 0, 0], [20, 20, 20]), bar('B', [-10, 5, 5], [30, 15, 15])], true],
    // Held in a closed hollow 1 mm clear all round: neither touches; a ray from it meets the cage's inside, facing it (review of PR #371).
    ['a cube caught in a closed hollow', [gridBody('Cage', [0, 2, 12, 14], [0, 2, 12, 14], [0, 2, 12, 14], (i, j, k) => !(i === 1 && j === 1 && k === 1)), bar('Caught', [3, 3, 3], [11, 11, 11])], false],
    ['bars across, 0.1 mm apart', [bar('A', [0, 25, 0], [60, 35, 10]), bar('B', [25, 0, 10.1], [35, 60, 20])], false],
    ['two cubes 10 mm apart', [bar('A', [0, 0, 0], [20, 20, 20]), bar('B', [30, 0, 0], [50, 20, 20])], false],
    ['a cube in a ring around it, apart', [boxesBody('Ring', [[[0, 0, 0], [40, 5, 10]], [[0, 35, 0], [40, 40, 10]], [[0, 5, 0], [5, 35, 10]], [[35, 5, 0], [40, 35, 10]]]), bar('Core', [10, 10, 0], [30, 30, 10])], false],
  ];
  it.each(cases)('%s', (_name, bodies, touch) => {
    for (const place of PLACES) {
      const found = touching(placed(bodies, place));
      expect(found ? found.bodies.length : 0, JSON.stringify(place)).toBe(touch ? 2 : 0);
    }
  }, PATIENCE);
});

describe('thin walls, wherever they are (audit MG-16, D7, D39, MG-18, D40)', () => {
  const wall = (thickness: number) => boxesBody('Wall', [[[0, 0, 0], [20, thickness, 20]]]);
  const thinIn = (bodies: PrintCheckBody[], place: (typeof PLACES)[number], profile = PLA) => checkPrint(placed(bodies, place), profile).findings.find((f) => f.kind === 'thinWall' && !f.floor);

  it('takes Bambu Studio\'s outer wall line for every nozzle: the nozzle and 0.02 mm (second review of PR 371, S4)', () => {
    // 1.05 times the nozzle put 0.62 at the 0.6 mm nozzle, 0.82 at 0.8 and 0.26 at 0.25 under the line: red for walls Bambu lays.
    for (const nozzle of [0.2, 0.25, 0.4, 0.6, 0.8]) {
      expect(thinnestLine(nozzle)).toBe(Math.round((nozzle + 0.02) * 1000) / 1000);
      for (const place of [PLACES[0]!, { turn: 30, mirrored: true, lift: 10 }]) {
        const where = `${String(nozzle)} ${JSON.stringify(place)}`;
        expect(thinIn([wall(nozzle + 0.02)], place, { ...PLA, nozzle }), where).toMatchObject({ severity: 'warn' });
        expect(thinIn([wall(nozzle + 0.01)], place, { ...PLA, nozzle }), where).toMatchObject({ severity: 'block' });
      }
    }
  }, PATIENCE);

  it('measures a solid round rod across itself, not as a wall of nothing (second review of PR 371, B2)', () => {
    // Both sides of a rod are its one round face: the same radius read as 0 mm and blocked a rod of 0.8 mm.
    for (const [diameter, severity] of [[0.8, 'warn'], [0.6, 'warn'], [0.4, 'block']] as const) {
      for (const place of PLACES) {
        const found = thinIn([lyingRod('Rod', diameter / 2, 20)], place);
        const where = `${String(diameter)} ${JSON.stringify(place)}`;
        expect(found, where).toMatchObject({ severity });
        expect(found && 'thickness' in found ? found.thickness : 0, where).toBeGreaterThan(diameter - 0.05);
      }
    }
  }, PATIENCE);

  it('blocks a wall under the narrowest line a slicer lays (0.42 mm for the 0.4 mm nozzle), not first under the nozzle', () => {
    expect(thinnestLine(0.4)).toBe(0.42);
    expect(thinnestLine(0.6)).toBe(0.62);
    for (const place of PLACES) {
      const where = JSON.stringify(place);
      // A plate standing 0.41 mm thin is under Bambu Studio's outer wall line of 0.42 (it read as a warning, audit MG-16).
      expect(thinIn([wall(0.41)], place), where).toMatchObject({ severity: 'block', thickness: 0.41 });
      // 0.42 and 0.44 are a line, as Bambu lays them: a warning, not red (review of PR #371, B1).
      expect(thinIn([wall(0.42)], place), where).toMatchObject({ severity: 'warn', thickness: 0.42 });
      expect(thinIn([wall(0.44)], place), where).toMatchObject({ severity: 'warn', thickness: 0.44 });
    }
  }, PATIENCE);

  it('measures a round wall by its radii, however finely outside and hole are meshed (review of PR #371, B1)', () => {
    // A tube of 0.45 mm wall, round 5 mm, its outside and its hole meshed alike and not: 36/72 read 0.43, 24/48 0.41 and blocked.
    for (const [outer, inner] of [[96, 96], [36, 72], [24, 48], [72, 36]] as const) {
      for (const place of PLACES) {
        const where = `${String(outer)}/${String(inner)} ${JSON.stringify(place)}`;
        expect(thinIn([lyingTube('Tube', 5, 4.55, 20, outer, inner)], place), where).toMatchObject({ severity: 'warn', thickness: 0.45 });
        // 0.4 mm round is under the line, however meshed.
        expect(thinIn([lyingTube('Tube', 5, 4.6, 20, outer, inner)], place), where).toMatchObject({ severity: 'block', thickness: 0.4 });
      }
    }
  }, PATIENCE);

  it('adds up small thin faces: twenty ribs of 0.9 mm² a side on a plate', () => {
    // 0.3 × 0.9 × 1 mm each, 2 mm apart: no face reached 1 mm², and the plate read ready.
    const ribs = boxesBody('Grille', [[[0, 0, 0], [50, 10, 2]], ...Array.from({ length: 20 }, (_, i): [[number, number, number], [number, number, number]] => [[2 + i * 2.4, 4, 2], [2.3 + i * 2.4, 4.9, 3]])]);
    for (const place of PLACES) {
      const found = thinIn([ribs], place);
      expect(found, JSON.stringify(place)).toMatchObject({ severity: 'block', thickness: 0.3 });
      expect(found && 'area' in found ? found.area : 0).toBeGreaterThanOrEqual(35);
      expect(found && 'places' in found ? found.places[0]?.faces.length : 0).toBe(40);
    }
    // A plate without them has nothing thin.
    for (const place of PLACES) expect(thinIn([boxesBody('Plate', [[[0, 0, 0], [50, 10, 2]]])], place)).toBeUndefined();
  }, PATIENCE);

  it('does not add up small overhangs: each under 1 mm² is left to the slicer (review of PR #371, K1, contract test run 43445239910)', () => {
    // Twenty teeth 0.3 wide reaching 3 mm out: each underside 0.9 mm². Added up, they warned; so did two cone faces of a
    // countersink under 1 mm² each on the wall holder below, which the slicers print. Overhangs are a hint by angle only.
    const comb = boxesBody('Comb', [[[0, 0, 0], [60, 3, 10]], ...Array.from({ length: 20 }, (_, i): [[number, number, number], [number, number, number]] => [[2 + i * 2.8, 3, 6], [2.3 + i * 2.8, 6, 7]])]);
    for (const place of PLACES) expect(checkPrint(placed([comb], place), PLA).findings.find((f) => f.kind === 'overhang'), JSON.stringify(place)).toBeUndefined();
    // Their thin walls still add up.
    expect(checkPrint([comb], PLA).findings.find((f) => f.kind === 'thinWall')).toMatchObject({ severity: 'block', thickness: 0.3 });
  }, PATIENCE);

  it('counts only the part of a face that is under one line: a wall of 0.8 mm with a spot of 0.3 mm warns (audit D39)', () => {
    // A pocket 0.7 × 0.7 mm, 0.5 deep, in the middle of a standing wall 20 × 0.8 × 20.
    const spot = gridBody('Wall', [0, 9.65, 10.35, 20], [0, 0.5, 0.8], [0, 9.65, 10.35, 20], (i, j, k) => !(i === 1 && j === 0 && k === 1));
    for (const place of PLACES) {
      const found = thinIn([spot], place);
      expect(found, JSON.stringify(place)).toMatchObject({ severity: 'warn', thickness: 0.3 });
    }
  }, PATIENCE);

  it('looks at every triangle of a fine mesh: a rib of a few triangles on a plate of 138 000 (audit MG-18, D40)', () => {
    const xs = Array.from({ length: 201 }, (_, i) => Math.round(i * 10) / 100);
    // The rib 0.3 × 3 × 2 mm on the plate 20 × 20 × 2, the plate meshed in squares of 0.1 mm, the rib a cell of its own.
    const ys = [...xs.filter((y) => y <= 10 || y >= 13)];
    const rib = ys.indexOf(10);
    const plate = gridBody('Plate', xs, ys, [0, 2, 4], (i, j, k) => k === 0 || (i >= 100 && i < 103 && j === rib));
    expect(plate.model.geometry.index!.count / 3).toBeGreaterThan(138_000);
    for (const place of [PLACES[0]!, { turn: 30, mirrored: true, lift: 10 }]) {
      const found = thinIn([plate], place);
      // Both sides, 3 × 2 mm each, all of them under one line: no estimate from every fourth triangle.
      expect(found, JSON.stringify(place)).toMatchObject({ severity: 'block', thickness: 0.3, area: 12 });
    }
  }, PATIENCE);
});

describe('what stands tall on too little (audit D17, MG-20)', () => {
  const tips = (body: PrintCheckBody, place: (typeof PLACES)[number]) => checkPrint(placed([body], place), PLA).findings.find((f) => f.kind === 'contact');
  const cases: [string, PrintCheckBody, boolean][] = [
    // 25 mm² and 36 mm² on the bed passed the fixed 25 mm²; Bambu Studio lays a brim of 18 mm round both.
    ['a tower 5 × 5 × 200', boxesBody('Tower', [[[0, 0, 0], [5, 5, 200]]]), true],
    ['a rod 6 × 6 × 200', boxesBody('Rod', [[[0, 0, 0], [6, 6, 200]]]), true],
    ['a wall 60 × 2 × 40, on its edge', boxesBody('Fin', [[[0, 0, 0], [60, 2, 40]]]), true],
    ['a post 10 × 10 × 80', boxesBody('Post', [[[0, 0, 0], [10, 10, 80]]]), true],
    ['a T on a narrow foot', boxesBody('T', [[[9, 9, 0], [11, 11, 30]], [[0, 0, 30], [20, 20, 32]]]), true],
    // Short or broad, nothing: under 25 mm² a pin 4 × 4 × 10 read as loose.
    ['a pin 4 × 4 × 10', boxesBody('Pin', [[[0, 0, 0], [4, 4, 10]]]), false],
    ['a cube 20', boxesBody('Cube', [[[0, 0, 0], [20, 20, 20]]]), false],
    ['a post 10 × 10 × 40', boxesBody('Post', [[[0, 0, 0], [10, 10, 40]]]), false],
    ['a plate 60 × 2 × 10, on its edge', boxesBody('Fin', [[[0, 0, 0], [60, 2, 10]]]), false],
    // Slender plates on edge, just under and over Bambu's 5 mm brim along their main axes; the worst of all directions
    // read them 1.2 times higher, at an angle no slicer reads (second review of PR 371, S5).
    ['a sign 100 × 4 × 60 on its edge (Bambu: 4.2 mm, no brim)', boxesBody('Sign', [[[0, 0, 0], [100, 4, 60]]]), false],
    ['a sign 100 × 4 × 66 on its edge (Bambu: 5.1 mm)', boxesBody('Sign', [[[0, 0, 0], [100, 4, 66]]]), true],
    ['a small part 10 × 3 × 15 (Bambu: 4.7 mm, no brim)', boxesBody('Clip', [[[0, 0, 0], [10, 3, 15]]]), false],
    ['a small part 10 × 3 × 16 (Bambu: 5.3 mm)', boxesBody('Clip', [[[0, 0, 0], [10, 3, 16]]]), true],
    // Round: Bambu lays a brim of 5.1 mm round a pin of 10 mm, 40 high (review of PR #371, S1); not at 20 high.
    ['a round pin 10 × 40', rawBody('Pin', lathe([[0, 0], [5, 0], [5, 40], [0, 40]], 64)), true],
    ['a round pin 10 × 20', rawBody('Pin', lathe([[0, 0], [5, 0], [5, 20], [0, 20]], 64)), false],
    // A post with a 1 mm chamfer round its foot stands on less than its first layer; short, it still stands (shortcut in tipsOver).
    ['a post 10 × 10 × 20 chamfered at the foot', rawBody('Post', lathe([[0, 0], [6.07, 0], [7.07, 1], [7.07, 20], [0, 20]], 4)), false],
    ['a tube 40 high round 20 on a ring 2 mm wide', gridBody('Tube', [0, 2, 18, 20], [0, 2, 18, 20], [0, 40], (i, j) => i !== 1 || j !== 1), false],
  ];
  it.each(cases)('%s', (_name, body, tall) => {
    for (const place of PLACES) expect(tips(body, place) !== undefined, JSON.stringify(place)).toBe(tall);
  }, PATIENCE);

  it('holds a piece printed as one by what all its bodies have on the bed', () => {
    // Two towers 5 × 5 × 200 joined at the top by a hinge's pair stand on 50 mm² 40 mm apart: no brim for that.
    const left = { ...boxesBody('Left', [[[0, 0, 0], [5, 5, 200]]]), group: 'Pair' };
    const right = { ...boxesBody('Right', [[[40, 0, 0], [45, 5, 200]]]), group: 'Pair' };
    expect(checkPrint([left, right], PLA).findings.find((f) => f.kind === 'contact')).toMatchObject({ bodies: 2 });
    // Printed apart, each tower is one on its own.
    expect(checkPrint([{ ...left, group: undefined }, { ...right, group: undefined }], PLA).findings.find((f) => f.kind === 'contact')).toMatchObject({ bodies: 2 });
  }, PATIENCE);
});

describe('a body that starts above the bed (audit N-druckpruefung-4)', () => {
  const cube = (name: string, x: number, z: number) => boxesBody(name, [[[x, 0, z], [x + 20, 20, z + 20]]]);
  it('lays a body of its own onto the bed, as the slicer drops every object of the 3MF, and holds one printed with another in the air', () => {
    for (const place of PLACES) {
      const where = JSON.stringify(place);
      // A cube 10 mm up, alone or beside one on the bed: each is an object of its own in the export, dropped onto the bed.
      expect(checkPrint(placed([cube('Floats', 0, 10)], place), PLA), where).toEqual({ status: 'ready', findings: [] });
      expect(checkPrint(placed([cube('Down', 0, 0), cube('Floats', 30, 10)], place), PLA), where).toEqual({ status: 'ready', findings: [] });
      // Printed as one piece (a print-in-place group, #366): its underside hangs 10 mm over the common bed.
      const together = checkPrint(placed([{ ...cube('Down', 0, 0), group: 'Pair' }, { ...cube('Floats', 30, 10), group: 'Pair' }], place), PLA);
      expect(together.findings.find((f) => f.kind === 'overhang'), where).toMatchObject({ area: 400, places: [{ body: 'Floats', faces: ['F1:-z'] }] });
    }
  }, PATIENCE);
});

describe('the check on large meshes', () => {
  // Ribs like the turns of a thread, 0.6 out over 0.3 and back over 0.7, in a nut 0.2 mm clear of them: every triangle
  // of the bolt is looked at for walls, and comes close to the nut without touching it.
  const boltOf = (count: number) => {
    const ribs = Array.from({ length: count }, (_, k): [number, number][] => [[4.6, k + 0.3], [4, k + 1]]).flat();
    return rawBody('Bolt', revolved([[0, 0], [4, 0], ...ribs, [0, count]], [-1, ...ribs.map(() => 0), 1]));
  };
  const nutOf = (count: number) => rawBody('Nut', lathe([[4.8, 0], [8, 0], [8, count], ...Array.from({ length: count - 1 }, (_, k): [number, number] => [4.8, count - k - 0.5])], 96));
  /** The fastest of three runs: one run alone says more about the runner than about the check. */
  const timed = (bodies: PrintCheckBody[]) => {
    let ms = Infinity;
    let check = checkPrint(bodies, PLA);
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      check = checkPrint(bodies, PLA);
      ms = Math.min(ms, performance.now() - start);
    }
    return { ms, check };
  };

  it('checks a bolt of 100 000 triangles in its nut in time that grows with the mesh, not with its square', () => {
    const quarter = timed([boltOf(65), nutOf(65)]);
    const bolt = boltOf(250);
    const full = timed([bolt, nutOf(250)]);
    expect(bolt.model.geometry.index!.count / 3).toBeGreaterThan(95_000);
    // Apart by 0.2 mm, nothing thin: they neither touch nor have a wall under two lines.
    expect(full.check.findings.map((f) => f.kind)).not.toContain('open');
    expect(full.check.findings.map((f) => f.kind)).not.toContain('separate');
    expect(full.check.findings.map((f) => f.kind)).not.toContain('thinWall');
    // Held by its growth, not in seconds: four times the mesh may take twelve times as long; quadratic would be sixteen.
    expect(full.ms / quarter.ms).toBeLessThan(12);
  }, PATIENCE);
});
