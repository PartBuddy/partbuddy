import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { checkPrint, nearestLines, onLineGrid, type PrintCheckBody, type PrintCheckProfile, type PrintFinding } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf } from './tagged3mf';
import { gridBody, posed, prismBody } from './testShapes';
import { buildViewerModel } from './viewerModel';

/**
 * The cases of BC-27 (raw `solid.fillet`, `solid.chamfer`, `solid.shell` and what reaches the same shapes): walls off
 * the line grid, a yellow hint, never a block. SolidCraft's own meshes come from
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

describe('walls off the line grid (BC-27)', () => {
  it('takes a wall as on the grid when lines of 100 to 120 % of the nozzle fill it, and names the grid sizes around it', () => {
    // [thickness, nozzle, on the grid]
    const cases: [number, number, boolean][] = [
      [0.8, 0.4, true], [0.9, 0.4, true], [0.96, 0.4, true], [0.97, 0.4, false], [1, 0.4, false], [1.1, 0.4, false], [1.19, 0.4, false],
      [1.2, 0.4, true], [1.35, 0.4, true], [1.44, 0.4, true], [1.5, 0.4, false], [1.6, 0.4, true], [1.8, 0.4, true], [1.95, 0.4, false],
      [2, 0.4, true], [2.5, 0.4, true], [3, 0.4, true], [12, 0.4, true],
      [1.35, 0.6, true], [1.5, 0.6, false], [1.8, 0.6, true], [2.025, 0.6, true],
      [0.5, 0.25, true], [0.6, 0.25, true], [0.65, 0.25, false],
    ];
    for (const [thickness, nozzle, on] of cases) expect(onLineGrid(thickness, nozzle), `${String(thickness)} mm at ${String(nozzle)}`).toBe(on);
    // PartBuddy's own grid (lineWidth, 112.5 %) is always on it.
    for (const nozzle of [0.2, 0.25, 0.4, 0.5, 0.6, 0.8, 1]) for (let lines = 1; lines < 12; lines += 1) expect(onLineGrid(lines * Math.round(nozzle * 1.125 * 1000) / 1000, nozzle), `${String(lines)} lines at ${String(nozzle)}`).toBe(true);
    expect(nearestLines(1, 0.4)).toEqual([0.9, 1.35]);
    expect(nearestLines(1.5, 0.4)).toEqual([1.35, 1.8]);
    expect(nearestLines(1.95, 0.4)).toEqual([1.8, 2.25]);
    expect(nearestLines(1.5, 0.6)).toEqual([1.35, 2.025]);
  });

  it('warns about a standing plate off the grid, says nothing on the grid or past five lines, and leaves a thin one to thinWall', () => {
    // [thickness, nozzle, what it says: null for nothing, else the grid sizes around it]
    const cases: [number, number, [number, number] | null][] = [
      [0.9, 0.4, null], [1, 0.4, [0.9, 1.35]], [1.2, 0.4, null], [1.35, 0.4, null], [1.5, 0.4, [1.35, 1.8]], [1.8, 0.4, null],
      [1.95, 0.4, [1.8, 2.25]], [2, 0.4, null], [2.5, 0.4, null], [1.5, 0.6, [1.35, 2.025]], [1.8, 0.6, null],
    ];
    for (const [thickness, nozzle, better] of cases) {
      for (const place of PLACES) {
        const plate = posed(gridBody('Plate', [0, thickness], [0, 30], [0, 20], () => true), place.turn, place.mirrored, place.lift);
        const lines = one(checkPrint([plate], { ...PLA, nozzle }).findings, 'wallLines');
        const what = `${String(thickness)} mm at ${String(nozzle)}, ${JSON.stringify(place)}`;
        if (better === null) expect(lines, what).toBeUndefined();
        else expect(lines, what).toMatchObject({ severity: 'warn', thickness, better, area: 1200 });
      }
    }
    // Under two lines it is a thin wall, and only that.
    const thin = checkPrint([gridBody('Plate', [0, 0.6], [0, 30], [0, 20], () => true)], PLA).findings;
    expect(one(thin, 'thinWall')).toBeDefined();
    expect(one(thin, 'wallLines')).toBeUndefined();
  });

  it('says nothing of a tapered wall: it runs through the grid, no one size of it is to change', () => {
    // 1 mm at the foot, 2 mm at the top, 20 mm high: 1.4° a side, within the 10° the check takes as a wall.
    const tapered = prismBody('Taper', [[0, 0], [1, 0], [1.5, 20], [-0.5, 20]], 30);
    expect(one(checkPrint([tapered], PLA).findings, 'wallLines')).toBeUndefined();
  });

  it('on SolidCraft\'s shells: 1.0 and 1.5 mm warn with the sizes round them, 0.9, 1.2 and 1.35 mm are ready, 0.6 mm is a thin wall', () => {
    // [body, what it should give: the wall and the grid sizes around it, 'ready', or 'thin' (thinWall only)]
    const cases: [string, [number, [number, number]] | 'ready' | 'thin'][] = [
      ['Shell06', 'thin'], ['Shell09', 'ready'], ['Shell10', [1, [0.9, 1.35]]], ['Shell12', 'ready'], ['Shell135', 'ready'], ['Shell15', [1.5, [1.35, 1.8]]],
      // Rounded corners: the wall between two cylinders round one axis, measured as the difference of their radii.
      ['ShellRound10', [1, [0.9, 1.35]]],
    ];
    for (const [name, want] of cases) {
      const body = solidcraft('edges', name);
      for (const place of PLACES) {
        const { status, findings } = checkPrint([posed(body, place.turn, place.mirrored, place.lift)], PLA);
        const what = `${name} ${JSON.stringify(place)}`;
        if (want === 'ready') expect({ status, findings }, what).toEqual({ status: 'ready', findings: [] });
        else if (want === 'thin') expect(kinds(findings), what).toEqual(['thinWall', 'thinWall']);
        else {
          expect(status, what).toBe('warn');
          expect(kinds(findings), what).toEqual(['wallLines']);
          expect(one(findings, 'wallLines'), what).toMatchObject({ thickness: want[0], line: 0.45, better: want[1] });
        }
      }
    }
  }, 120_000);

  it('on PartBuddy\'s print-in-place hinge: the lid\'s knuckle round its pin is 1.1 mm, off the grid', () => {
    // shortcut: the hinge's own sizes (knuckle 6 mm, pin hole 3.8 mm) leave 2.4 lines; size them to the grid (mechanisms.ts) to clear it.
    expect(one(checkPrint([solidcraft('hinge', 'Lid')], PLA).findings, 'wallLines')).toMatchObject({ thickness: 1.1, better: [0.9, 1.35] });
    expect(one(checkPrint([solidcraft('hinge', 'Box')], PLA).findings, 'wallLines')).toBeUndefined();
  }, 60_000);
});
