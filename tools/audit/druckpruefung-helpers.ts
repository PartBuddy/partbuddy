/**
 * Helpers of the print-check cases (cases/druckpruefung-*.case.ts). The shared harness is left as it
 * is; what it lacks for these cases is here: several designs in one SolidCraft session, a short form
 * of a check's result, and a body given directly as a mesh (an open shell SolidCraft would not
 * export as a solid).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildRenderMesh, buildViewerModel, checkPrint, deriveEdges, type FaceTable, type PrintCheck, type PrintCheckProfile, type TaggedMesh, type ViewerModel } from '../../packages/geometry/src/index';
import { overhang, PLA_04, type Audit, type MeasuredBody, type Step } from './harness';

export type Point = [number, number, number];
const r3 = (value: number) => Math.round(value * 1e3) / 1e3;

/** A check's result without the boxes: status and each finding's numbers and faces. */
export function brief(check: PrintCheck) {
  return {
    status: check.status,
    findings: check.findings.map((finding) => {
      const { box: _box, ...rest } = finding as typeof finding & { box?: unknown };
      return rest;
    }),
  };
}

export interface Scene {
  id: string;
  input: string;
  bodies: { name: string; volumeMm3: number; bbox: unknown; closed: unknown; triangles: number; onBedMm2: number; supportMm2: number; borderlineMm2: number }[];
  check: ReturnType<typeof brief>;
  measured: MeasuredBody[];
  rawCheck: PrintCheck;
}

/**
 * One design in the running session: a new design, the steps, the app's mirror and checkPrint with
 * `profile`. The STL of the design goes to `<dir>/<id>.stl`. Throws SolidCraft's own words when a
 * step fails.
 */
export async function scene(audit: Audit, id: string, input: string, steps: Step[], profile: PrintCheckProfile = PLA_04): Promise<Scene> {
  const fresh = await audit.tool('new_design', {});
  if (fresh.isError) throw new Error(`new_design: ${fresh.text}`);
  await audit.batch(steps);
  const { bodies, check } = await audit.measure();
  await audit.batch([{ command: 'file.export', params: { path: join(audit.dir, `${id}.stl`), format: 'stl' } }]);
  const rawCheck = check(profile);
  return {
    id,
    input,
    bodies: bodies.map((body) => {
      // Each body on its own lowest point, with the check's own reach for small overhangs.
      const map = overhang(body, profile, Math.round(4 * 1.125 * profile.nozzle * 100) / 100);
      return {
        name: body.name,
        volumeMm3: r3(body.solidcraft.volume_mm3 as number),
        bbox: body.solidcraft.bbox,
        closed: body.solidcraft.closed,
        triangles: body.mesh.indices.length / 3,
        onBedMm2: map.bed,
        supportMm2: map.support,
        borderlineMm2: map.borderline,
      };
    }),
    check: brief(rawCheck),
    measured: bodies,
    rawCheck,
  };
}

/** What goes into result.json of a scene: everything but the meshes. */
export const stored = ({ measured: _measured, rawCheck: _raw, ...rest }: Scene) => rest;

export function writeResult(dir: string, result: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
}

/**
 * A body given as quads (corner indices, outward when seen counter-clockwise), one named face each:
 * for shells SolidCraft does not hand out as a solid. `openEdges` is the mesh's own count of edges
 * with one triangle (deriveEdges).
 */
export function quadBody(name: string, points: readonly Point[], quads: readonly { name: string; corners: readonly [number, number, number, number]; normal?: Point }[]): { name: string; model: ViewerModel; openEdges: number } {
  const mesh: TaggedMesh = {
    name,
    faceCount: quads.length,
    positions: Float64Array.from(points.flat()),
    indices: Uint32Array.from(quads.flatMap(({ corners: [a, b, c, d] }) => [a, b, c, a, c, d])),
    triangleFaces: Uint32Array.from(quads.flatMap((_, face) => [face, face])),
  };
  const table: FaceTable = {
    model: 'audit',
    body: name,
    units: 'mm',
    faces: quads.map((quad, index) => ({ index, name: quad.name, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], ...(quad.normal ? { planeNormal: quad.normal } : {}) })),
  };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table), openEdges: deriveEdges(mesh, () => false).openEdges };
}

export { checkPrint, PLA_04 };
