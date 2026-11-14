import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { checkPrint, DESIGN_HINTS, withDesign, type PrintCheckBody, type PrintCheckProfile, type PrintFinding } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';
import { lyingTube, posed } from './testShapes';
import { growth } from './testTiming';
import { buildViewerModel } from './viewerModel';

/**
 * The design hints (Manuel, 2026-11-14): SolidCraft's own meshes of tools/fixtures/<set>.script.json (SolidCraft 0.41.0),
 * each also checked turned, mirrored and lifted, at nozzle 0.4 and 0.6 and at 40°; and PartBuddy's templates.
 */

const PLA: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 };
const PROFILES: PrintCheckProfile[] = [PLA, { ...PLA, nozzle: 0.6, layer: 0.3 }, { ...PLA, overhang: 40 }];
const PLACES = [{ turn: 0, mirrored: false, lift: 0 }, { turn: 30, mirrored: true, lift: 10 }];

const fixture = new URL('../fixtures/', import.meta.url);
function solidcraft(set: string, name: string): PrintCheckBody {
  const table = (JSON.parse(readFileSync(new URL(`${set}.faces.json`, fixture), 'utf8')) as Record<string, FaceTable>)[name];
  if (!table) throw new Error(`no fixture ${set} ${name}`);
  const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL(`${set}-${name}.3mf`, fixture))));
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

/**
 * The same body with every triangle cut in four, `times` over (16 times the triangles for 2), its faces kept: for the speed
 * tests. Corners are welded by position, so the body stays closed.
 */
function subdivided(body: PrintCheckBody, times: number): PrintCheckBody {
  const source = body.model.geometry.getAttribute('position').array;
  const welded = new Map<string, number>();
  let positions: number[] = [];
  const weld = (x: number, y: number, z: number) => {
    const key = `${String(x)},${String(y)},${String(z)}`;
    let at = welded.get(key);
    if (at === undefined) {
      at = positions.length / 3;
      welded.set(key, at);
      positions.push(x, y, z);
    }
    return at;
  };
  let indices = Array.from(body.model.geometry.index?.array ?? [], (v) => weld(source[v * 3] ?? 0, source[v * 3 + 1] ?? 0, source[v * 3 + 2] ?? 0));
  let faces = Array.from(body.model.triangleFaces);
  for (let round = 0; round < times; round += 1) {
    const next: number[] = [];
    const nextFaces: number[] = [];
    const middle = (a: number, b: number) => weld(((positions[a * 3] ?? 0) + (positions[b * 3] ?? 0)) / 2, ((positions[a * 3 + 1] ?? 0) + (positions[b * 3 + 1] ?? 0)) / 2, ((positions[a * 3 + 2] ?? 0) + (positions[b * 3 + 2] ?? 0)) / 2);
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
      const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      for (let k = 0; k < 4; k += 1) nextFaces.push(faces[t / 3] ?? 0);
    }
    [indices, faces] = [next, nextFaces];
  }
  positions = positions.slice();
  const table = body.model.table;
  const mesh: TaggedMesh = { name: body.name, faceCount: table.faces.length, positions: Float64Array.from(positions), indices: Uint32Array.from(indices), triangleFaces: Uint32Array.from(faces) };
  return { ...body, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

/** The design hints alone, of bodies as checked. */
const design = (bodies: readonly PrintCheckBody[], profile: PrintCheckProfile = PLA) => withDesign({ status: 'ready', findings: [] }, bodies, profile).findings;
const one = <K extends PrintFinding['kind']>(findings: readonly PrintFinding[], kind: K) => findings.find((finding) => finding.kind === kind) as Extract<PrintFinding, { kind: K }> | undefined;
/** Each place and profile of a body: what it gives. */
function everywhere(body: PrintCheckBody, check: (findings: PrintFinding[], what: string) => void): void {
  for (const place of PLACES) {
    const moved = posed(body, place.turn, place.mirrored, place.lift);
    for (const profile of PROFILES) check(design([moved], profile), `${body.name} ${JSON.stringify(place)} ${JSON.stringify(profile)}`);
  }
}

describe('bodies with no rounded or chamfered edge (sharpEdge)', () => {
  // [set, body, sharp edges and the radius the rules ask, or 'none']
  const cases: [string, string, [number, number] | 'none'][] = [
    // 40 × 30 × 15: the eight edges off the bed, 2 mm by the rules (30 to 100 mm).
    ['sharp', 'RawBox', [8, 2]],
    ['sharp', 'Plate', [8, 3]],
    // An L of two plates: its inner corner is no outer edge.
    ['sharp', 'Bracket', [13, 2]],
    ['sharp', 'RoundedBox', 'none'],
    ['sharp', 'ChamferedBox', 'none'],
    // Under 10 mm: a detail.
    ['sharp', 'SmallCube', 'none'],
    // Its corners cut at 45° in the sketch: a chamfer made otherwise, as the knob block's cone.
    ['sharp', 'Octagon', 'none'],
    ['edges', 'FilletTop2', 'none'],
  ];

  it.each(cases)('%s %s', (set, name, want) => {
    everywhere(solidcraft(set, name), (findings, what) => {
      const found = one(findings, 'sharpEdge');
      if (want === 'none') expect(found, what).toBeUndefined();
      else expect(found, what).toMatchObject({ severity: 'warn', edges: want[0], radius: want[1] });
    });
  }, 60_000);

  it('names the faces and leaves the check as it was otherwise', () => {
    const body = solidcraft('sharp', 'RawBox');
    const check = checkPrint([body], PLA);
    const found = withDesign(check, [body], PLA);
    expect(found.status).toBe('warn');
    expect(found.findings.filter((finding) => finding.kind !== 'sharpEdge')).toEqual(check.findings);
    // The bed face is no part of it: its edges are the bed chamfer's (BC-27).
    expect(one(found.findings, 'sharpEdge')?.places[0]?.faces.sort()).toEqual(['F1:+x', 'F1:+y', 'F1:+z', 'F1:-x', 'F1:-y']);
  });

  it('is not looked for when turned off', () => {
    expect(one(design([solidcraft('sharp', 'RawBox')], { ...PLA, off: ['sharpEdge'] }), 'sharpEdge')).toBeUndefined();
  });

  it('grows linearly with the triangles', () => {
    // A tube meshed 512 and 2048 round: every mesh edge once, so about 4 times as long, never 16.
    const tube = (n: number) => lyingTube('Tube', 5, 3, 20, n, n);
    expect(growth((body) => design([body]), tube(512), tube(2048))).toBeLessThan(8);
  });
});

describe('outer edges rounded with more than three radii (edgeRadii)', () => {
  // radii.script.json: 80 × 50 × 20 blocks, the four upright edges rounded. [body, families and radii, or 'none']
  const cases: [string, [number, number[]] | 'none'][] = [
    ['Radii4', [4, [1, 2, 4, 8]]],
    ['Radii3', 'none'],
    // 5 and 6 mm read as one, the 1 mm top edge as a second: as PartBuddy's housing (0.6, 1, 5 and 6 mm).
    ['RadiiNear', 'none'],
  ];

  it.each(cases)('%s', (name, want) => {
    everywhere(solidcraft('radii', name), (findings, what) => {
      const found = one(findings, 'edgeRadii');
      if (want === 'none') expect(found, what).toBeUndefined();
      else expect(found, what).toMatchObject({ severity: 'warn', families: want[0], radii: want[1], most: 3 });
    });
  }, 60_000);

  it('counts no inner fillet, hole or round that is no fillet', () => {
    // An inner fillet of 0.5 mm, holes of 1.5 to 20 mm, a fillet round a hole's foot, a shell rounded inside.
    for (const [set, name] of [['detail', 'InnerFillet05'], ['edges', 'HoleFillet1'], ['edges', 'ShellRound10'], ['holes', 'Rod10M5']] as const) expect(one(design([solidcraft(set, name)]), 'edgeRadii'), name).toBeUndefined();
  });

  it('is not looked for when turned off', () => {
    expect(one(design([solidcraft('radii', 'Radii4')], { ...PLA, off: ['edgeRadii'] }), 'edgeRadii')).toBeUndefined();
  });
});

describe('sharp inner corners at the foot of slender arms (rootCorner)', () => {
  // roots.script.json: on 3 mm plates. [body, roots, thinnest arm's thickness and length, or 'none']
  const cases: [string, [number, number, number] | 'none'][] = [
    // An arm 6 wide, 1.6 thick, 14 long: its two wide sides.
    ['ArmSharp', [2, 1.6, 14]],
    // A 3 × 3 × 15 post: all four sides.
    ['TallPost', [4, 3, 15]],
    // A hook: its catch makes an inner corner on the front, so only the back's foot.
    ['Hook', [1, 1.6, 14]],
    ['ArmFillet', 'none'],
    // A fin longer than high, a post 6 thick and 10 high, a box shelled 1.6 mm: no arm.
    ['Fin', 'none'],
    ['Post', 'none'],
    ['ShellBox', 'none'],
  ];

  it.each(cases)('%s', (name, want) => {
    everywhere(solidcraft('roots', name), (findings, what) => {
      const found = one(findings, 'rootCorner');
      if (want === 'none') expect(found, what).toBeUndefined();
      else {
        expect(found, what).toMatchObject({ severity: 'warn', roots: want[0], thickness: want[1] });
        expect(found?.length, what).toBeCloseTo(want[2], 0);
      }
    });
  }, 60_000);

  it('asks half the thickness, at least 1 mm and two nozzles', () => {
    expect(one(design([solidcraft('roots', 'ArmSharp')]), 'rootCorner')?.radius).toBe(1);
    expect(one(design([solidcraft('roots', 'ArmSharp')], { ...PLA, nozzle: 0.6 }), 'rootCorner')?.radius).toBe(1.2);
    expect(one(design([solidcraft('roots', 'TallPost')]), 'rootCorner')?.radius).toBe(1.5);
  });

  it('takes no shell rounded inside for arms', () => {
    // Inner walls meet in inner rounds, not outwards: no arm stands free.
    for (const [set, name] of [['edges', 'ShellRound10'], ['edges', 'Shell12'], ['detail', 'Pin15']] as const) expect(one(design([solidcraft(set, name)]), 'rootCorner'), name).toBeUndefined();
  });

  it('is not looked for when turned off', () => {
    expect(one(design([solidcraft('roots', 'ArmSharp')], { ...PLA, off: ['rootCorner'] }), 'rootCorner')).toBeUndefined();
  });
});

describe('faces facing up that lean less than 15° from flat (shallowSlope)', () => {
  // slopes.script.json: 40 × 30 × 20 blocks, the top cut 30 mm back by a chamfer down 1.5, 5 and 11 mm. [body, angle, or 'none']
  const cases: [string, number | 'none'][] = [
    ['Slope3', 2.9],
    ['Slope10', 9.5],
    ['Slope20', 'none'],
    // Flat tops, 45° chamfers and fillets.
    ['RawBox', 'none'],
    ['ChamferedBox', 'none'],
    ['RoundedBox', 'none'],
  ];

  it.each(cases)('%s', (name, want) => {
    const body = solidcraft(name.startsWith('Slope') ? 'slopes' : 'sharp', name);
    // Turned about Z, mirrored and lifted it lies the same.
    everywhere(body, (findings, what) => {
      const found = one(findings, 'shallowSlope');
      if (want === 'none') expect(found, what).toBeUndefined();
      else {
        expect(found, what).toMatchObject({ severity: 'warn', faces: 1, angle: want, limit: 15 });
        // Steps of a layer each: 0.2 / tan 9.5° = 1.2 mm at 0.2 mm layers.
        const layer = what.includes('"layer":0.3') ? 0.3 : 0.2;
        expect(found?.step, what).toBeCloseTo(layer / Math.tan((want * Math.PI) / 180), 0);
      }
    });
  }, 60_000);

  it('looks at the faces as the body lies on its print face', () => {
    // Lying on the slope, it is the bed; the flat top across from it now leans 9.5° the other way, facing up.
    const body = solidcraft('slopes', 'Slope10');
    const slope = body.model.table.faces.find((face) => face.name.startsWith('F2:blend'))?.name;
    expect(one(design([{ ...body, printFace: slope }]), 'shallowSlope')).toMatchObject({ angle: 9.5 });
    expect(one(design([{ ...body, printFace: 'F1:-z' }]), 'shallowSlope')).toMatchObject({ angle: 9.5 });
    expect(one(design([{ ...body, printFace: 'F1:-x' }]), 'shallowSlope')).toBeUndefined();
  });

  it('is not looked for when turned off', () => {
    expect(one(design([solidcraft('slopes', 'Slope3')], { ...PLA, off: ['shallowSlope'] }), 'shallowSlope')).toBeUndefined();
  });
});

describe('shell corners rounded outside only (shellCorner)', () => {
  // corners.script.json: 60 × 40 × 30 boxes, shelled 2 mm open at the top, the four upright edges rounded. [body, whether told]
  const cases: [string, boolean][] = [
    // Rounded 6 mm after shelling: sharp inside, the wall thins to about 0.34 mm in the corner.
    ['ShellAfter', true],
    // Rounded before shelling: 4 mm inside, concentric.
    ['ShellBefore', false],
    // 1 mm outside on a 2 mm wall: the corner grows a little, never thins.
    ['ShellAfterSmall', false],
    // No shell: a rounded block.
    ['SolidRound', false],
  ];

  it.each(cases)('%s', (name, want) => {
    everywhere(solidcraft('corners', name), (findings, what) => {
      const found = one(findings, 'shellCorner');
      if (!want) expect(found, what).toBeUndefined();
      else {
        expect(found, what).toMatchObject({ severity: 'warn', corners: 4, wall: 2, radius: 6, inner: 4 });
        // Measured from the facets' middles, a little over the true 0.34 mm.
        expect(found?.thickness, what).toBeGreaterThan(0.3);
        expect(found?.thickness, what).toBeLessThan(1);
      }
    });
  }, 60_000);

  it('is not looked for when turned off', () => {
    expect(one(design([solidcraft('corners', 'ShellAfter')], { ...PLA, off: ['shellCorner'] }), 'shellCorner')).toBeUndefined();
  });
});

describe('speed of the design hints', () => {
  // Every hint looks at each mesh edge, facet or face once, and casts a ray or two per facet of a fillet: 16 times the
  // triangles take about 16 times as long (a ray is logarithmic), never 256 (BC-27 lesson: +40 s at 147k triangles).
  it.each([
    ['roots', 'ArmSharp', 'rootCorner'],
    ['corners', 'ShellAfter', 'shellCorner'],
    ['radii', 'Radii4', 'edgeRadii'],
    ['slopes', 'Slope10', 'shallowSlope'],
    ['sharp', 'RawBox', 'sharpEdge'],
  ] as const)('grows linearly on %s %s', (set, name, kind) => {
    const body = solidcraft(set, name);
    const large = subdivided(body, 2);
    expect(large.model.triangleFaces.length).toBe(body.model.triangleFaces.length * 16);
    expect(one(design([large]), kind), name).toBeDefined();
    expect(growth((one) => design([one]), body, large)).toBeLessThan(40);
  }, 60_000);
});

describe("PartBuddy's templates", () => {
  // templates.faces.json (templateFixtures.test.ts): the bodies on their print faces and in their print-in-place groups.
  const tables = JSON.parse(readFileSync(new URL('templates.faces.json', fixture), 'utf8')) as Record<string, FaceTable & { printFace?: string; group?: string }>;
  const ids = [...new Set(Object.keys(tables).map((key) => key.split('/')[0] ?? ''))];

  it.each(ids)('%s gives no design hint', (id) => {
    const bodies = Object.entries(tables)
      .filter(([key]) => key.startsWith(`${id}/`))
      .map(([, table]) => {
        const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL(`templates-${id}-${table.body.replace(/\W/g, '')}.3mf`, fixture))));
        return { name: table.body, model: buildViewerModel(buildRenderMesh(mesh, table), table), printFace: table.printFace, group: table.group };
      });
    for (const profile of PROFILES) expect(design(bodies, profile).map((finding) => finding.kind), `${id} ${JSON.stringify(profile)}`).toEqual([]);
    expect(DESIGN_HINTS.length).toBeGreaterThan(0);
  }, 60_000);
});
