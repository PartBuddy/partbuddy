import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { checkPrint, type PrintCheckBody, type PrintCheckProfile, type PrintFinding } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf } from './tagged3mf';
import { lathe, lyingTube, posed, rawBody } from './testShapes';
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
