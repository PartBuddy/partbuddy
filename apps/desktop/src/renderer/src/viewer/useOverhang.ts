import { AS_DESIGNED, isAsDesigned, orientBuffers, overhangOf, type Down, type OverhangLimits, type OverhangMap } from '@partbuddy/geometry';
import type { BufferAttribute } from 'three';

import type { BodyModel } from '../state/store';
import { bodiesBox } from './section';

const positionsOf = (model: BodyModel['model']) => (model.geometry.getAttribute('position') as BufferAttribute).array as Float32Array;
const normalsOf = (model: BodyModel['model']) => (model.geometry.getAttribute('normal') as BufferAttribute).array as Float32Array;

/** The buffers turned into the print orientation (M7), once per model and orientation. */
const turnedCache = new WeakMap<BodyModel['model'], { key: string; positions: Float32Array; normals: Float32Array }>();
function turned(model: BodyModel['model'], down: Down): { positions: Float32Array; normals: Float32Array } {
  if (isAsDesigned(down)) return { positions: positionsOf(model), normals: normalsOf(model) };
  const key = down.join(',');
  const known = turnedCache.get(model);
  if (known?.key === key) return known;
  const result = { key, ...orientBuffers(positionsOf(model), normalsOf(model), down) };
  turnedCache.set(model, result);
  return result;
}

/** Overhang classes per body model, orientation, bed height and limits, worked out once per mirrored revision. */
const cache = new WeakMap<BodyModel['model'], { key: string; map: OverhangMap }>();

/**
 * Overhang classes of a body printed lying `down` (M7). The classes belong to the render vertices,
 * so the view keeps showing the part as designed with the colours of its print orientation.
 */
export function overhangFor(model: BodyModel['model'], bedZ: number, limits: OverhangLimits, down: Down = AS_DESIGNED): OverhangMap {
  const key = [bedZ, limits.borderline, limits.support, ...down].join(',');
  const known = cache.get(model);
  if (known?.key === key) return known.map;
  const { positions, normals } = turned(model, down);
  const map = overhangOf(
    {
      positions,
      normals,
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

/** The print bed: the lowest point of all bodies in the print orientation, which the part stands on. */
export function bedOf(bodies: readonly BodyModel[], down: Down = AS_DESIGNED): number {
  if (isAsDesigned(down)) {
    const box = bodiesBox(bodies);
    return box.isEmpty() ? 0 : box.min.z;
  }
  let min = Infinity;
  for (const { model } of bodies) {
    const { positions } = turned(model, down);
    for (let i = 2; i < positions.length; i += 3) min = Math.min(min, positions[i] ?? Infinity);
  }
  return Number.isFinite(min) ? min : 0;
}

/** Overhang area in mm² of all bodies, per class. */
export function overhangArea(bodies: readonly BodyModel[], limits: OverhangLimits, down: Down = AS_DESIGNED): [number, number, number, number] {
  const bedZ = bedOf(bodies, down);
  const total: [number, number, number, number] = [0, 0, 0, 0];
  for (const body of bodies) {
    const { area } = overhangFor(body.model, bedZ, limits, down);
    for (let i = 0; i < 4; i += 1) total[i] = (total[i] ?? 0) + (area[i] ?? 0);
  }
  return total;
}
