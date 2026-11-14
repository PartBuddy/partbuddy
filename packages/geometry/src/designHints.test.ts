import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { checkPrint, DESIGN_HINTS, withDesign, type PrintCheckBody, type PrintCheckProfile, type PrintFinding } from './printCheck';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf } from './tagged3mf';
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
