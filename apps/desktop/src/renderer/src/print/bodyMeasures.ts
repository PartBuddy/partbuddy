import { Overhang, meshMetrics, overhangLimits, overhangOf, type PrintCheckBody, type PrintCheckProfile } from '@partbuddy/geometry';
import { Quaternion, Vector3 } from 'three';

import type { PrintCheckReport } from '../../../shared/contract';

export type BodyMeasures = NonNullable<PrintCheckReport['bodies']>[number];
type Profile = Pick<PrintCheckProfile, 'nozzle' | 'layer' | 'overhang'>;

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The infill the shell estimate reckons with: Prusa and Protolabs Network name 10 to 20 % as usual. An assumption, said as one. */
const INFILL = 0.15;

/**
 * What a body costs to print as far as its shape decides it: solid volume, height and layers as it
 * lies on the bed, its surface, the area on the bed and the area that leans past the material's limit. The
 * assistant reads them with every check, so it sees what a change saved without being asked to
 * measure. Grams and minutes are not among them: infill, walls and speed are the slicer's. The shell
 * estimate comes nearer to filament than the solid volume: two wall lines on every surface and
 * sparse infill in what is left, never more than the solid.
 * shortcut: the pose (print face down) and the reach of small overhangs repeat what printCheck.ts
 * and overhang.ts of packages/geometry keep to themselves (`laid`, `smallOverhangReach`); take them
 * from there once the package exports them.
 */
export function bodyMeasures(body: PrintCheckBody, profile: Profile): BodyMeasures {
  const { model } = body;
  const down = body.printFace ? model.table.faces.find((face) => face.name === body.printFace)?.planeNormal : undefined;
  const turn = down ? new Quaternion().setFromUnitVectors(new Vector3(...down).normalize(), new Vector3(0, 0, -1)) : null;
  const v = new Vector3();
  const laid = (source: ArrayLike<number>) => {
    const out = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3) {
      v.set(source[i] ?? 0, source[i + 1] ?? 0, source[i + 2] ?? 0);
      if (turn) v.applyQuaternion(turn);
      out.set([v.x, v.y, v.z], i);
    }
    return out;
  };
  const positions = laid(model.geometry.getAttribute('position').array);
  const index = (model.geometry.index?.array ?? new Uint32Array()) as Uint32Array;
  const { volumeMm3, bbox } = meshMetrics({ name: body.name, faceCount: model.table.faces.length, positions: Float64Array.from(positions), indices: index, triangleFaces: model.triangleFaces });
  const height = Math.max(0, bbox.max[2] - bbox.min[2]);
  const map = overhangOf(
    { positions, normals: laid(model.geometry.getAttribute('normal').array), index, vertexFaces: model.vertexFaces, faceCount: model.table.faces.length },
    bbox.min[2],
    overhangLimits(profile.overhang),
    Math.round(4 * 1.125 * profile.nozzle * 100) / 100,
  );
  const solid = Math.abs(volumeMm3);
  const surface = map.area.reduce((sum, area) => sum + area, 0);
  const walls = Math.min(solid, surface * 2 * 1.125 * profile.nozzle);
  const measures = {
    // A name longer than the report takes is cut, not a reason to lose the report.
    name: body.name.slice(0, 200),
    volume: round(solid, 0),
    shell: round(walls + (solid - walls) * INFILL, 0),
    height: round(height, 1),
    layers: profile.layer > 0 ? Math.ceil(height / profile.layer - 1e-6) : 0,
    surface: round(surface, 0),
    contact: round(map.area[Overhang.Bed], 0),
    support: round(map.area[Overhang.Support], 0),
  };
  const odd = Object.entries(measures).find(([, value]) => typeof value === 'number' && !(Number.isFinite(value) && value >= 0));
  if (odd) throw new Error(`${odd[0]} is ${String(odd[1])}`);
  return measures;
}

/**
 * The measures of every closed body. One that cannot be measured is left out and named in `problem`, for the log:
 * the check itself must still reach the assistant, which otherwise waits for it with every step.
 */
export function measuresOf(bodies: readonly PrintCheckBody[], profile: Profile): { bodies: BodyMeasures[]; problem?: string } {
  const measured: BodyMeasures[] = [];
  const problems: string[] = [];
  for (const body of bodies) {
    if (body.model.table.faces.length === 0 || body.model.openEdges > 0) continue;
    try {
      measured.push(bodyMeasures(body, profile));
    } catch (error) {
      problems.push(`${body.name.slice(0, 40)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { bodies: measured, ...(problems.length > 0 ? { problem: `no measures for ${problems.join('; ')}`.slice(0, 300) } : {}) };
}
