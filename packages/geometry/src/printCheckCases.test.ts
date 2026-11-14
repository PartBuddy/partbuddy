import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { checkPrint, type PrintCheckBody, type PrintCheckProfile, type PrintFinding } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf } from './tagged3mf';
import { posed } from './testShapes';
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
        expect(round?.places[0]?.faces.length, what).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it('takes no hole\'s roof nor a lying rod for a rounded bed edge', () => {
    // A hole drilled square into a 45° chamfer comes out through the bed; at 40° its slanted roof leans past the limit.
    for (const name of ['Chamfer', 'Rod8M5', 'Rod20M8']) {
      for (const overhang of [45, 40]) expect(one(checkPrint([solidcraft('holes', name)], { ...PLA, overhang }).findings, 'roundBedEdge'), `${name} at ${String(overhang)}°`).toBeUndefined();
    }
  }, 60_000);
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
    // The housing's one warning stays the lid lying on it (solidcraft.contract.spec.ts, sharing package).
    if (id === 'housing') expect(kinds(checkPrint(bodies, PLA).findings)).toEqual(['separate']);
  }, 60_000);
});
