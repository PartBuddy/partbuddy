import { overhangOf, type OverhangLimits, type OverhangMap } from '@partbuddy/geometry';
import type { BufferAttribute } from 'three';

import type { BodyModel } from '../state/store';
import { bodiesBox } from './section';

/** Overhang classes per body model, bed height and limits, worked out once per mirrored revision. */
const cache = new WeakMap<BodyModel['model'], { bedZ: number; limits: OverhangLimits; map: OverhangMap }>();

export function overhangFor(model: BodyModel['model'], bedZ: number, limits: OverhangLimits): OverhangMap {
  const known = cache.get(model);
  if (known && known.bedZ === bedZ && known.limits.support === limits.support && known.limits.borderline === limits.borderline) return known.map;
  const geometry = model.geometry;
  const map = overhangOf(
    {
      positions: (geometry.getAttribute('position') as BufferAttribute).array as Float32Array,
      normals: (geometry.getAttribute('normal') as BufferAttribute).array as Float32Array,
      index: (geometry.index?.array ?? new Uint32Array()) as Uint32Array,
      vertexFaces: model.vertexFaces,
      faceCount: model.table.faces.length,
    },
    bedZ,
    limits,
  );
  cache.set(model, { bedZ, limits, map });
  return map;
}

/** The print bed: the lowest point of all bodies, which the part stands on when printed along +Z. */
export function bedOf(bodies: readonly BodyModel[]): number {
  const box = bodiesBox(bodies);
  return box.isEmpty() ? 0 : box.min.z;
}

/** Overhang area in mm² of all bodies, per class. */
export function overhangArea(bodies: readonly BodyModel[], limits: OverhangLimits): [number, number, number, number] {
  const bedZ = bedOf(bodies);
  const total: [number, number, number, number] = [0, 0, 0, 0];
  for (const body of bodies) {
    const { area } = overhangFor(body.model, bedZ, limits);
    for (let i = 0; i < 4; i += 1) total[i] = (total[i] ?? 0) + (area[i] ?? 0);
  }
  return total;
}
