import { overhangOf, type OverhangLimits, type OverhangMap } from '@partbuddy/geometry';
import type { BufferAttribute } from 'three';

import type { BodyModel } from '../state/store';
import { bodiesBox } from './section';

/** Overhang classes per body model, bed height and limits, worked out once per mirrored revision. */
const cache = new WeakMap<BodyModel['model'], { key: string; map: OverhangMap }>();

/** Overhang classes of a body as designed, standing on `bedZ`; the classes belong to the render vertices. */
export function overhangFor(model: BodyModel['model'], bedZ: number, limits: OverhangLimits): OverhangMap {
  const key = [bedZ, limits.borderline, limits.support].join(',');
  const known = cache.get(model);
  if (known?.key === key) return known.map;
  const map = overhangOf(
    {
      positions: (model.geometry.getAttribute('position') as BufferAttribute).array as Float32Array,
      normals: (model.geometry.getAttribute('normal') as BufferAttribute).array as Float32Array,
      index: (model.geometry.index?.array ?? new Uint32Array()) as Uint32Array,
      vertexFaces: model.vertexFaces,
      faceCount: model.table.faces.length,
    },
    bedZ,
    limits,
  );
  cache.set(model, { key, map });
  return map;
}

/** The print bed: the lowest point of the given bodies (one body: its own bed). */
export function bedOf(bodies: readonly BodyModel[]): number {
  const box = bodiesBox(bodies);
  return box.isEmpty() ? 0 : box.min.z;
}

/** Overhang area in mm² of all bodies, per class, each body on its own bed. */
export function overhangArea(bodies: readonly BodyModel[], limits: OverhangLimits): [number, number, number, number] {
  const total: [number, number, number, number] = [0, 0, 0, 0];
  for (const body of bodies) {
    const { area } = overhangFor(body.model, bedOf([body]), limits);
    for (let i = 0; i < 4; i += 1) total[i] = (total[i] ?? 0) + (area[i] ?? 0);
  }
  return total;
}
