import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export type CubeDirection = readonly [number, number, number];
export type CubeFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
export interface CubeRegion {
  direction: CubeDirection;
  face: CubeFace | undefined;
  vertices: Vector3[];
}

/** A truncated cube: six square faces, twelve bevel strips and eight triangular corners. */
export function cubeRegions(): CubeRegion[] {
  const regions: CubeRegion[] = [];
  const inner = 0.72;
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    const direction: CubeDirection = [x, y, z];
    const axes = [0, 1, 2].filter((i) => direction[i] !== 0);
    if (!axes.length) continue;
    const vertices: Vector3[] = [];
    // Every vertex has one coordinate on the outer cube and two on the inset cube.
    for (const outer of axes) {
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
        const signs = [a, b, c];
        if (axes.some((i) => signs[i] !== direction[i])) continue;
        vertices.push(new Vector3(...signs.map((sign, i) => sign * (i === outer ? 1 : inner))));
      }
    }
    const face = axes.length === 1
      ? x ? (x > 0 ? 'right' : 'left') : y ? (y > 0 ? 'back' : 'front') : z > 0 ? 'top' : 'bottom'
      : undefined;
    const normal = new Vector3(...direction).normalize();
    const up = Math.abs(z) === 1 && axes.length === 1 ? new Vector3(0, z, 0) : new Vector3(0, 0, 1);
    const right = new Vector3().crossVectors(up, normal).normalize();
    up.crossVectors(normal, right).normalize();
    const center = vertices.reduce((sum, v) => sum.add(v), new Vector3()).divideScalar(vertices.length);
    vertices.sort((a, b) => {
      const da = a.clone().sub(center), db = b.clone().sub(center);
      return Math.atan2(da.dot(up), da.dot(right)) - Math.atan2(db.dot(up), db.dot(right));
    });
    regions.push({ direction, face, vertices });
  }
  return regions;
}

/** Keep the poles deterministic with Z-up camera-controls. */
export function cubeViewDirection(direction: CubeDirection): Vector3 {
  const [x, y, z] = direction;
  return new Vector3(x, x === 0 && y === 0 ? -1e-4 : y, z).normalize();
}

export function regionGeometry(region: CubeRegion): BufferGeometry {
  const normal = new Vector3(...region.direction).normalize();
  const up = region.face === 'top' ? new Vector3(0, 1, 0) : region.face === 'bottom' ? new Vector3(0, -1, 0) : new Vector3(0, 0, 1);
  const right = new Vector3().crossVectors(up, normal).normalize();
  up.crossVectors(normal, right).normalize();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(region.vertices.flatMap((v) => v.toArray()), 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(region.vertices.flatMap((v) => [v.dot(right) / 1.44 + 0.5, v.dot(up) / 1.44 + 0.5]), 2));
  const indices: number[] = [];
  for (let i = 1; i < region.vertices.length - 1; i++) indices.push(0, i, i + 1);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
