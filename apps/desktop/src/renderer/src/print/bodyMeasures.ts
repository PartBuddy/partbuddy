import { Overhang, laidBodies, meshMetrics, overhangLimits, overhangOf, type LaidBody, type PrintCheckBody, type PrintCheckProfile } from '@partbuddy/geometry';

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
 * A body printed with others as one piece (a print-in-place hinge) lies as their piece does (`laidBodies`), its height
 * counted from their bed.
 * shortcut: the reach of small overhangs repeats what overhang.ts of packages/geometry keeps to itself
 * (`smallOverhangReach`); take it from there once the package exports it.
 */
export function bodyMeasures(body: PrintCheckBody, profile: Profile, lying: LaidBody | undefined = laidBodies([body])[0]): BodyMeasures {
  const { model } = body;
  const positions = Float32Array.from(lying?.positions ?? model.geometry.getAttribute('position').array);
  const index = (model.geometry.index?.array ?? new Uint32Array()) as Uint32Array;
  const { volumeMm3, bbox } = meshMetrics({ name: body.name, faceCount: model.table.faces.length, positions: Float64Array.from(positions), indices: index, triangleFaces: model.triangleFaces });
  const bed = lying?.bed ?? bbox.min[2];
  const height = Math.max(0, bbox.max[2] - bed);
  const map = overhangOf(
    { positions, normals: Float32Array.from(lying?.normals ?? model.geometry.getAttribute('normal').array), index, vertexFaces: model.vertexFaces, faceCount: model.table.faces.length },
    bed,
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
  const closed = bodies.filter((body) => body.model.table.faces.length > 0 && !(body.model.openEdges > 0));
  const lying = laidBodies(closed);
  for (const [b, body] of closed.entries()) {
    try {
      measured.push(bodyMeasures(body, profile, lying[b]));
    } catch (error) {
      problems.push(`${body.name.slice(0, 40)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { bodies: measured, ...(problems.length > 0 ? { problem: `no measures for ${problems.join('; ')}`.slice(0, 300) } : {}) };
}
