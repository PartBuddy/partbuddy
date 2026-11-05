import type { BufferAttribute } from 'three';

import type { BodyModel } from '../state/store';
import { bodiesBox } from './section';
import { overhangOf, type OverhangMap } from './overhang';

/** Overhang classes per body model and bed height, worked out once per mirrored revision. */
const cache = new WeakMap<BodyModel['model'], { bedZ: number; map: OverhangMap }>();

export function overhangFor(model: BodyModel['model'], bedZ: number): OverhangMap {
  const known = cache.get(model);
  if (known && known.bedZ === bedZ) return known.map;
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
  );
  cache.set(model, { bedZ, map });
  return map;
}

/** The print bed: the lowest point of all bodies, which the part stands on when printed along +Z. */
export function bedOf(bodies: readonly BodyModel[]): number {
  const box = bodiesBox(bodies);
  return box.isEmpty() ? 0 : box.min.z;
}

/** Overhang area in mm² of all bodies, per class. */
export function overhangArea(bodies: readonly BodyModel[]): [number, number, number, number] {
  const bedZ = bedOf(bodies);
  const total: [number, number, number, number] = [0, 0, 0, 0];
  for (const body of bodies) {
    const { area } = overhangFor(body.model, bedZ);
    for (let i = 0; i < 4; i += 1) total[i] = (total[i] ?? 0) + (area[i] ?? 0);
  }
  return total;
}
