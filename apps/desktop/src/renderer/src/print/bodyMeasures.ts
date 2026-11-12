import { Overhang, meshMetrics, overhangLimits, overhangOf, type PrintCheckBody, type PrintCheckProfile } from '@partbuddy/geometry';
import { Quaternion, Vector3 } from 'three';

import type { PrintCheckReport } from '../../../shared/contract';

export type BodyMeasures = NonNullable<PrintCheckReport['bodies']>[number];

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * What a body costs to print as far as its shape decides it: solid volume, height and layers as it
 * lies on the bed, the area on the bed and the area that leans past the material's limit. The
 * assistant reads them with every check, so it sees what a change saved without being asked to
 * measure. Grams and minutes are not among them: infill, walls and speed are the slicer's.
 * shortcut: the pose (print face down) and the reach of small overhangs repeat what printCheck.ts
 * and overhang.ts of packages/geometry keep to themselves (`laid`, `smallOverhangReach`); take them
 * from there once the package exports them.
 */
export function bodyMeasures(body: PrintCheckBody, profile: Pick<PrintCheckProfile, 'nozzle' | 'layer' | 'overhang'>): BodyMeasures {
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
  return {
    name: body.name,
    volume: round(Math.abs(volumeMm3) / 1000, 2),
    height: round(height, 1),
    layers: profile.layer > 0 ? Math.ceil(height / profile.layer - 1e-6) : 0,
    contact: round(map.area[Overhang.Bed], 0),
    support: round(map.area[Overhang.Support], 0),
  };
}
