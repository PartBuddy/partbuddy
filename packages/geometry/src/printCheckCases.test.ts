import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceInfo, FaceTable } from './faceTable';
import { checkPrint, smallHoles, type PrintCheckBody, type PrintCheckProfile, type PrintFinding } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';
import { boxesBody, lathe, lyingTube, posed, rawBody } from './testShapes';
import { growth } from './testTiming';
import { buildViewerModel } from './viewerModel';

/**
 * The cases of BC-27 (raw `solid.fillet`, `solid.chamfer`, `solid.shell` and what reaches the same shapes): rounded bed
 * edges, a yellow hint, never a block; shells as they are. SolidCraft's own meshes come from
 * tools/fixtures/edges.script.json (20 mm cubes, SolidCraft 0.40.1); each is also checked turned, mirrored and lifted.
 */

const PLA: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 };
const PLACES = [{ turn: 0, mirrored: false, lift: 0 }, { turn: 30, mirrored: true, lift: 10 }];

const fixture = new URL('../fixtures/', import.meta.url);
function solidcraft(set: string, name: string): PrintCheckBody {
  const table = (JSON.parse(readFileSync(new URL(`${set}.faces.json`, fixture), 'utf8')) as Record<string, FaceTable>)[name];
  if (!table) throw new Error(`no fixture ${set} ${name}`);
  const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL(`${set}-${name}.3mf`, fixture))));
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

/**
 * A body of revolution round Z (`lathe`) whose upright faces are SolidCraft-like cylinders, one face per radius; the
 * rest flat faces by height. For gaps between two faces round one axis (BC-24 review).
 */
function turned(name: string, profile: readonly (readonly [number, number])[], n: number): PrintCheckBody {
  // Welded to 1e-6 mm like rawBody, so the seam where the turn closes is no open edge.
  const raw = { ...lathe(profile, n) };
  const welded = new Map<string, number>();
  const points: number[] = [];
  raw.index = Uint32Array.from(raw.index, (v) => {
    const point = [0, 1, 2].map((k) => Math.round((raw.positions[v * 3 + k] ?? 0) * 1e6) / 1e6);
    const key = point.join(',');
    let at = welded.get(key);
    if (at === undefined) {
      at = points.length / 3;
      welded.set(key, at);
      points.push(...point);
    }
    return at;
  });
  raw.positions = Float32Array.from(points);
  const names: string[] = [];
  const cylinders: (FaceInfo['cylinder'] | undefined)[] = [];
  const faceOf = (label: string, cylinder?: FaceInfo['cylinder']) => {
    const at = names.indexOf(label);
    if (at >= 0) return at;
    names.push(label);
    cylinders.push(cylinder);
    return names.length - 1;
  };
  const triangleFaces: number[] = [];
  for (let t = 0; t < raw.index.length; t += 3) {
    const corners = [0, 1, 2].map((k) => (raw.index[t + k] ?? 0) * 3);
    const radii = corners.map((p) => Math.round(Math.hypot(raw.positions[p] ?? 0, raw.positions[p + 1] ?? 0) * 1e4) / 1e4);
    const heights = corners.map((p) => raw.positions[p + 2] ?? 0);
    const upright = radii.every((r) => r === radii[0]) && !heights.every((z) => z === heights[0]);
    triangleFaces.push(upright ? faceOf(`F1:r${String(radii[0])}`, { origin: [0, 0, 0], axis: [0, 0, 1], radius: radii[0] ?? 0 }) : faceOf(`F1:z${String(heights[0])}`));
  }
  const table: FaceTable = { model: 'test', body: name, units: 'mm', faces: names.map((label, index) => ({ index, name: label, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], ...(cylinders[index] ? { cylinder: cylinders[index] } : {}) })) };
  const mesh: TaggedMesh = { name, faceCount: names.length, positions: Float64Array.from(raw.positions), indices: Uint32Array.from(raw.index), triangleFaces: Uint32Array.from(triangleFaces) };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

/** Several bodies' meshes as one body of many shells, faces numbered on. */
function merged(name: string, bodies: readonly PrintCheckBody[]): PrintCheckBody {
  const positions: number[] = [];
  const indices: number[] = [];
  const triangleFaces: number[] = [];
  const faces: FaceInfo[] = [];
  for (const body of bodies) {
    const [base, first] = [positions.length / 3, faces.length];
    positions.push(...body.model.geometry.getAttribute('position').array);
    indices.push(...Array.from(body.model.geometry.index?.array ?? [], (v) => v + base));
    triangleFaces.push(...Array.from(body.model.triangleFaces, (f) => f + first));
    faces.push(...body.model.table.faces.map((face, i) => ({ ...face, index: first + i, name: `${face.name}#${String(first + i)}` })));
  }
  const table: FaceTable = { model: 'test', body: name, units: 'mm', faces };
  const mesh: TaggedMesh = { name, faceCount: faces.length, positions: Float64Array.from(positions), indices: Uint32Array.from(indices), triangleFaces: Uint32Array.from(triangleFaces) };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

const kinds = (findings: readonly PrintFinding[]) => findings.map((finding) => finding.kind).sort();
const one = <K extends PrintFinding['kind']>(findings: readonly PrintFinding[], kind: K) => findings.find((finding) => finding.kind === kind) as Extract<PrintFinding, { kind: K }> | undefined;

describe('raw shells (BC-27)', () => {
  it('say nothing new: walls of 0.9 to 1.5 mm are ready, whatever their number of lines; 0.6 mm is a thin wall', () => {
    // Walls off the line grid are no finding: Arachne (PrusaSlicer 2.5+, Cura 5, OrcaSlicer) prints them solid (BC-27 review).
    for (const name of ['Shell06', 'Shell09', 'Shell10', 'Shell12', 'Shell135', 'Shell15', 'ShellRound10']) {
      const body = solidcraft('edges', name);
      for (const place of PLACES) {
        const { findings } = checkPrint([posed(body, place.turn, place.mirrored, place.lift)], PLA);
        expect(kinds(findings), `${name} ${JSON.stringify(place)}`).toEqual(name === 'Shell06' ? ['thinWall', 'thinWall'] : []);
      }
    }
  }, 120_000);
});

describe('rounded bed edges (BC-27)', () => {
  // [body, material's overhang angle, what it should give: the round bed edge's area (within 10 %), 'overhang' (told as an overhang instead), or 'none']
  const cases: [string, number, number | 'overhang' | 'none'][] = [
    // Under the first layer: the slicer's first layer is all there is of it.
    ['FilletBed05', 45, 'none'],
    ['FilletBed1', 45, 59],
    ['FilletBed1', 40, 59],
    // PR #390: one 2 mm fillet on a bed edge read ready.
    ['FilletEdge2', 45, 31],
    ['FilletEdge2', 40, 36],
    // All four bed edges round: the ring needs support and is told as an overhang, not twice.
    ['FilletBed2', 45, 'overhang'],
    ['FilletBed3', 45, 'overhang'],
    ['FilletBed5', 45, 'overhang'],
    ['ChamferBed2', 45, 'none'],
    ['FilletTop2', 45, 'none'],
    ['FilletTop2', 40, 'none'],
    // Review M1: a 1 mm fillet round the foot of an 8 mm hole bends round the hole the other way, and is one still.
    ['HoleFillet1', 45, 23],
    ['HoleFillet1', 40, 23],
    // Review B1: a 0.6 mm chamfer round rounded corners (r 1, 2, 5 mm) and round a disc is a cone of one slope, 45°: past
    // a 40° or 35° material's limit, but a chamfer already (the first version said 4 to 52 mm²).
    ...(['CornerBox1', 'CornerBox2', 'CornerBox5', 'ChamferDisc'] as const).flatMap((name) => [45, 40, 35].map((angle): [string, number, 'none'] => [name, angle, 'none'])),
  ];

  it.each(cases)('%s at %i°', (name, overhang, want) => {
    const body = solidcraft('edges', name);
    for (const place of PLACES) {
      const { status, findings } = checkPrint([posed(body, place.turn, place.mirrored, place.lift)], { ...PLA, overhang });
      const round = one(findings, 'roundBedEdge');
      const what = JSON.stringify(place);
      expect(status, what).not.toBe('block');
      if (want === 'none') expect(round, what).toBeUndefined();
      else if (want === 'overhang') {
        expect(round, what).toBeUndefined();
        expect(one(findings, 'overhang'), what).toBeDefined();
      } else {
        expect(round, what).toMatchObject({ severity: 'warn', limit: overhang });
        expect(Math.abs((round?.area ?? 0) - want), `${what}: ${String(round?.area)} mm²`).toBeLessThanOrEqual(want * 0.1);
        expect(round?.places[0]?.faces.every((face) => face.includes('blend')), what).toBe(true);
      }
    }
  }, 60_000);

  it('takes no hole\'s roof nor a lying rod for a rounded bed edge', () => {
    // A hole drilled square into a 45° chamfer comes out through the bed; at 40° its slanted roof leans past the limit.
    for (const name of ['Chamfer', 'Rod8M5', 'Rod20M8']) {
      for (const overhang of [45, 40]) expect(one(checkPrint([solidcraft('holes', name)], { ...PLA, overhang }).findings, 'roundBedEdge'), `${name} at ${String(overhang)}°`).toBeUndefined();
    }
  }, 60_000);

  it('takes no half-round groove in the bed face for a rounded bed edge: it bends the other way (follow-up review)', () => {
    // Radius 0.8, 1 and 1.5 mm, cut along the bed: it starts on the bed beside the bottom, runs flat at its top and leans
    // past the limit, so only the direction test leaves it out (the other way round it said 63 to 118 mm²).
    for (const name of ['GrooveBed08', 'GrooveBed10', 'GrooveBed15']) {
      const body = solidcraft('edges', name);
      for (const place of PLACES) {
        for (const overhang of [45, 40]) expect(one(checkPrint([posed(body, place.turn, place.mirrored, place.lift)], { ...PLA, overhang }).findings, 'roundBedEdge'), `${name} at ${String(overhang)}° ${JSON.stringify(place)}`).toBeUndefined();
      }
    }
  }, 60_000);

  it('looks round the facets of a curved face only where no overhang is told: a flattened dome grows linearly (follow-up review)', () => {
    // A dome flattened to half its height, cut below its equator: all one face beside the bed, its foot past 65°, and told
    // as an overhang. 16 times the triangles take about 7 times as long; with every facet looking round the whole face,
    // about 41 times (measured 2026-11-14).
    const dome = (n: number) => {
      const from = -Math.asin(0.8);
      const arc = Array.from({ length: n / 2 + 1 }, (_, i): [number, number] => {
        const angle = from + ((Math.PI / 2 - from) * i) / (n / 2);
        return [Math.max(20 * Math.cos(angle), 0), 8 + 10 * Math.sin(angle)];
      });
      return rawBody('Dome', lathe([[0, 0], ...arc], n));
    };
    const [small, large] = [dome(48), dome(192)];
    expect(one(checkPrint([large], PLA).findings, 'overhang')).toBeDefined();
    expect(growth((body) => checkPrint([body], PLA), small, large)).toBeLessThan(20);
  }, 120_000);
});

describe('small holes (BC-24, S12)', () => {
  // tools/fixtures/detail.script.json: 20 mm blocks, SolidCraft 0.40.1. [body, holes, smallest diameter] or 'none'.
  const cases: [string, [number, number] | 'none'][] = [
    ['Hole15', [1, 1.5]],
    ['Hole19', [1, 1.9]],
    ['HoleLying10', [1, 1]],
    ['HoleBlind15', [1, 1.5]],
    // Just the smallest that prints open.
    ['Hole20', 'none'],
    // Goes less than three quarters round: a hole breaking out of a side, a fillet in an inner corner, a pin.
    ['Breakout15', 'none'],
    ['InnerFillet05', 'none'],
    ['Pin15', 'none'],
  ];

  it.each(cases)('%s', (name, want) => {
    const body = solidcraft('detail', name);
    for (const place of PLACES) {
      const what = JSON.stringify(place);
      const { status, findings } = checkPrint([posed(body, place.turn, place.mirrored, place.lift)], PLA);
      const hole = one(findings, 'smallHole');
      expect(status, what).not.toBe('block');
      if (want === 'none') expect(hole, what).toBeUndefined();
      else expect(hole, what).toMatchObject({ severity: 'warn', holes: want[0], diameter: want[1], minimum: 2, places: [{ body: name }] });
      // Whatever the nozzle: a hole under 2 mm closes up at any of them.
      expect(one(checkPrint([body], { ...PLA, nozzle: 0.6 }).findings, 'smallHole')?.holes, what).toBe(want === 'none' ? undefined : want[0]);
    }
  });

  it('takes no pocket shallower than it is wide for a hole: a dice pip is a dimple (BC-24 review)', () => {
    // A lying tube of 1.5 mm bore, 0.4, 1.4 and 1.5 mm long: the first two shallower than wide.
    for (const [length, want] of [[0.4, undefined], [1.4, undefined], [1.5, 1]] as const) expect(one(checkPrint([lyingTube('Pip', 3, 0.75, length)], PLA).findings, 'smallHole')?.holes, String(length)).toBe(want);
  });

  it('groups the holes of a perforated plate in linear time (BC-24 review)', () => {
    // 1000 and 4000 holes of 1.5 mm, each a tube of its own shell: comparing every face with every hole took 370 ms at 4000.
    const plate = (holes: number) => merged('Grille', Array.from({ length: holes }, (_, i) => posed(lyingTube(`T${String(i)}`, 1.2, 0.75, 2, 6, 8), 0, false, i * 3)));
    const [small, large] = [plate(1000), plate(4000)];
    expect(smallHoles(large).holes).toBe(4000);
    expect(growth((body) => smallHoles(body), small, large)).toBeLessThan(8);
  }, 120_000);

  it('takes no groove along the bed for a hole', () => {
    for (const name of ['GrooveBed08', 'GrooveBed10']) expect(one(checkPrint([solidcraft('edges', name)], PLA).findings, 'smallHole'), name).toBeUndefined();
  });

  it('is not looked for when the user turned it off', () => {
    expect(one(checkPrint([solidcraft('detail', 'Hole15')], { ...PLA, off: ['smallHole'] }).findings, 'smallHole')).toBeUndefined();
  });

  it('grows linearly with the triangles of the holes', () => {
    // A tube with a hole of 1.5 mm meshed 512 and 2048 round: the whole check takes at most 4 times as long, never 16.
    const tube = (n: number) => lyingTube('Tube', 3, 0.75, 10, 48, n);
    expect(one(checkPrint([tube(512)], PLA).findings, 'smallHole')).toMatchObject({ holes: 1, diameter: 1.5 });
    expect(growth((body) => checkPrint([body], PLA), tube(512), tube(2048))).toBeLessThan(8);
  });
});

describe('slots that print closed (BC-24)', () => {
  // tools/fixtures/detail.script.json: slots cut through 20 mm blocks, and one 5 mm deep. [body, nozzle, narrowest gap] or 'none'.
  const cases: [string, number, number | 'none'][] = [
    ['Slot02', 0.4, 0.2],
    ['Slot02', 0.6, 0.2],
    // Under one nozzle at 0.4 (the print-in-place gap), open at 0.3 mm only from a nozzle of 0.3 down.
    ['Slot03', 0.4, 0.3],
    ['Slot03', 0.25, 'none'],
    ['Slot05', 0.4, 'none'],
    ['Slot05', 0.6, 0.5],
    ['SlotBlind02', 0.4, 0.2],
    // Across a hole is the small-hole hint's; a plain block has no slot.
    ['Hole15', 0.4, 'none'],
    ['Hole20', 0.6, 'none'],
    ['Pin15', 0.4, 'none'],
  ];

  it.each(cases)('%s at nozzle %s', (name, nozzle, want) => {
    const body = solidcraft('detail', name);
    for (const place of PLACES) {
      const what = JSON.stringify(place);
      const { status, findings } = checkPrint([posed(body, place.turn, place.mirrored, place.lift)], { ...PLA, nozzle });
      const slot = one(findings, 'narrowGap');
      expect(status, what).not.toBe('block');
      if (want === 'none') expect(slot, what).toBeUndefined();
      else {
        expect(slot, what).toMatchObject({ severity: 'warn', minimum: Math.max(0.3, nozzle), places: [{ body: name }] });
        expect(Math.abs((slot?.gap ?? 0) - want), `${what}: ${String(slot?.gap)}`).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it('says nothing of the shells, holes and edges of BC-27 at 0.4 and 0.6', () => {
    for (const set of ['edges', 'holes']) {
      const tables = JSON.parse(readFileSync(new URL(`${set}.faces.json`, fixture), 'utf8')) as Record<string, FaceTable>;
      for (const name of Object.keys(tables)) {
        for (const nozzle of [0.4, 0.6]) expect(one(checkPrint([solidcraft(set, name)], { ...PLA, nozzle }).findings, 'narrowGap'), `${set} ${name} at ${String(nozzle)}`).toBeUndefined();
      }
    }
  }, 120_000);

  it('is not looked for when the user turned it off', () => {
    expect(one(checkPrint([solidcraft('detail', 'Slot02')], { ...PLA, off: ['narrowGap'] }).findings, 'narrowGap')).toBeUndefined();
  });

  it('measures a ring gap round one axis by the radii, however coarse the mesh (BC-24 review)', () => {
    // A cup with a peg standing in it, one body: peg r 3, cup wall r 3 + gap. Its facets lie cos(π/n) inside the circle,
    // so 0.4 mm meshed 24 round read 0.398 and warned "0.4 under 0.4".
    const cup = (gap: number, n: number) => turned('Cup', [[0, 0], [6, 0], [6, 10], [3 + gap, 10], [3 + gap, 2], [3, 2], [3, 10], [0, 10]], n);
    for (const n of [24, 32, 48]) {
      expect(kinds(checkPrint([cup(0.4, n)], PLA).findings), `0.4 at ${String(n)}`).toEqual([]);
      expect(one(checkPrint([cup(0.3, n)], PLA).findings, 'narrowGap'), `0.3 at ${String(n)}`).toMatchObject({ gap: 0.3, minimum: 0.4 });
    }
  });

  it('takes no gap between two shells of one body for a slot (BC-24 review)', () => {
    // Two blocks 0.2 mm apart in one mesh body (an imported print-in-place part) do not touch: no slot of one part.
    const two = boxesBody('Pair', [[[0, 0, 0], [10, 10, 10]], [[10.2, 0, 0], [20, 10, 10]]]);
    expect(one(checkPrint([two], PLA).findings, 'narrowGap')).toBeUndefined();
  });

  it('takes a slot another body of the part fills for no slot: a debossed logo (BC-24 review)', () => {
    // The 0.2 mm slot of Slot02 filled by a colour body of its size: the colour body is the thin wall, the slot no slot.
    const filler = boxesBody('Colour', [[[89.9, 44, 0], [90.1, 56, 10]]]);
    const { findings } = checkPrint([solidcraft('detail', 'Slot02'), filler], PLA);
    expect(one(findings, 'narrowGap')).toBeUndefined();
    expect(one(findings, 'thinWall')?.places.map((place) => place.body)).toEqual(['Colour']);
  });

  it('grows linearly with the triangles', () => {
    // A tube meshed 256 and 1024 round outside: one more ray per facet, so about 4 times as long, never 16.
    const tube = (n: number) => lyingTube('Tube', 5, 3, 20, n, 48);
    expect(growth((body) => checkPrint([body], PLA), tube(256), tube(1024))).toBeLessThan(8);
  });
});

describe("PartBuddy's templates (BC-27 review B1)", () => {
  // templates.faces.json: templateSteps of each template built with SolidCraft 0.40.1 (apps/desktop/test/templateFixtures.test.ts),
  // the bodies it names on their print faces and in their print-in-place groups; standard parts are left out as in the app.
  const tables = JSON.parse(readFileSync(new URL('templates.faces.json', fixture), 'utf8')) as Record<string, FaceTable & { printFace?: string; group?: string }>;
  const ids = [...new Set(Object.keys(tables).map((key) => key.split('/')[0] ?? ''))];

  it.each(ids)('%s has no rounded bed edge at 45°, 40° or 35°: its bed chamfers round rounded corners are cones', (id) => {
    const bodies = Object.entries(tables)
      .filter(([key]) => key.startsWith(`${id}/`))
      .map(([, table]) => {
        const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL(`templates-${id}-${table.body.replace(/\W/g, '')}.3mf`, fixture))));
        return { name: table.body, model: buildViewerModel(buildRenderMesh(mesh, table), table), printFace: table.printFace, group: table.group };
      });
    expect(bodies.length, id).toBeGreaterThan(0);
    for (const overhang of [45, 40, 35]) expect(one(checkPrint(bodies, { ...PLA, overhang }).findings, 'roundBedEdge'), `${id} at ${String(overhang)}°`).toBeUndefined();
    // BC-24: no hint of its own on PartBuddy's templates, at 0.4 and 0.6 and at 40°.
    for (const profile of [PLA, { ...PLA, nozzle: 0.6, layer: 0.3 }, { ...PLA, overhang: 40 }]) {
      expect(kinds(checkPrint(bodies, profile).findings).filter((kind) => kind === 'smallHole' || kind === 'narrowGap'), `${id} ${JSON.stringify(profile)}`).toEqual([]);
    }
    // The housing's one warning stays the lid lying on it (solidcraft.contract.spec.ts, sharing package).
    if (id === 'housing') expect(kinds(checkPrint(bodies, PLA).findings)).toEqual(['separate']);
  }, 60_000);
});
