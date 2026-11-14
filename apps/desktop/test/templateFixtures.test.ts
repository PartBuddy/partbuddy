import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TEMPLATE_IDS, templateSteps } from '../src/shared/templates';

/**
 * Builds PartBuddy's templates with the SolidCraft CLI into the print check's fixtures (BC-27): a tagged 3MF per body the
 * template names (`templates-<id>-<body>.3mf`; standard parts, which the check leaves out, are not written) and
 * `templates.faces.json` with each body's face table, its print face and the bodies printed with it as one piece.
 * Run with PARTBUDDY_TEMPLATE_FIXTURES=1 (and SolidCraft installed); CI uses the committed outputs.
 */
const enabled = process.env.PARTBUDDY_TEMPLATE_FIXTURES === '1';
const CLI = process.env.SOLIDCRAFT_CLI ?? 'C:\\Program Files\\SolidCraft\\solidcraft-cli.exe';
const OUT = join(__dirname, '..', '..', '..', 'packages', 'geometry', 'fixtures');

type Face = { index: number; name: string; exact: boolean; area: number; centroid: number[]; point: number[]; plane_normal?: number[]; cylinder?: { origin: number[]; axis: number[]; radius: number } };
const round = (value: number) => Math.round(value * 1e4) / 1e4;

describe.skipIf(!enabled)('template fixtures for the print check (BC-27)', () => {
  it('builds every template and writes its bodies', () => {
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-templates-'));
    const tables: Record<string, unknown> = {};
    try {
      for (const id of TEMPLATE_IDS) {
        const steps = templateSteps(id);
        const bodies = steps.flatMap((step) => (typeof step.params.body_name === 'string' ? [step.params.body_name] : []));
        const script = { commands: [...steps, ...bodies.flatMap((body) => [{ command: 'model.faces', params: { body } }, { command: 'file.export', params: { path: join(OUT, `templates-${id}-${body.replace(/\W/g, '')}.3mf`), format: '3mf-tagged', bodies: [body], quality: 'standard' } }])] };
        writeFileSync(join(work, `${id}.json`), JSON.stringify(script));
        execFileSync(CLI, ['run', join(work, `${id}.json`), '--results', '--json-out', join(work, `${id}-result.json`)], { stdio: ['ignore', 'ignore', 'inherit'] });
        const found = (JSON.parse(readFileSync(join(work, `${id}-result.json`), 'utf8')) as unknown[]).filter((result): result is { faces: Face[] } => Array.isArray((result as { faces?: unknown } | null)?.faces)).slice(-bodies.length);
        expect(found, id).toHaveLength(bodies.length);
        // Jointed bodies marked to print together (`component.metadata.set`, printGroupsOf in mirror.ts) are one piece.
        const jointed = steps.some((step) => step.command === 'component.metadata.set');
        bodies.forEach((body, i) => {
          const faces = (found[i]?.faces ?? []).map((face) => ({ index: face.index, name: face.name, exact: face.exact, area: round(face.area), centroid: face.centroid.map(round), point: face.point.map(round), ...(face.plane_normal ? { planeNormal: face.plane_normal.map(round) } : {}), ...(face.cylinder ? { cylinder: { origin: face.cylinder.origin.map(round), axis: face.cylinder.axis.map(round), radius: round(face.cylinder.radius) } } : {}) }));
          // The print face the template sets, by a point on it: the flat face whose plane holds the point, nearest its middle.
          const set = steps.find((step) => step.command === 'body.print_face' && step.params.body === body)?.params.point as number[] | undefined;
          const onPlane = set ? faces.filter((face) => face.planeNormal && Math.abs(face.planeNormal.reduce((sum, n, k) => sum + n * ((set[k] ?? 0) - (face.point[k] ?? 0)), 0)) < 1e-3) : [];
          const distance = (face: { centroid: number[] }) => face.centroid.reduce((sum, c, k) => sum + (c - (set?.[k] ?? 0)) ** 2, 0);
          const printFace = onPlane.sort((a, b) => distance(a) - distance(b))[0]?.name;
          tables[`${id}/${body}`] = { model: id, body, units: 'mm', source: `SolidCraft CLI, templateSteps('${id}')`, ...(printFace ? { printFace } : {}), ...(jointed ? { group: id } : {}), faces };
        });
      }
      writeFileSync(join(OUT, 'templates.faces.json'), `${JSON.stringify(tables, null, 2)}\n`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 300_000);
});
