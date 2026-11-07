import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { cubeRegions, cubeViewDirection, regionGeometry } from '../src/renderer/src/viewer/viewCubeGeometry';

describe('view cube', () => {
  it('has six faces, twelve bevel edges and eight corners with unique directions', () => {
    const regions = cubeRegions();
    expect(regions).toHaveLength(26);
    expect(regions.filter((r) => r.face)).toHaveLength(6);
    expect(regions.filter((r) => r.direction.filter(Boolean).length === 2)).toHaveLength(12);
    expect(regions.filter((r) => r.direction.filter(Boolean).length === 3)).toHaveLength(8);
    expect(new Set(regions.map((r) => r.direction.join(','))).size).toBe(26);
  });

  it('maps face labels to the Z-up CAD convention and gives poles a stable front lean', () => {
    const faces = Object.fromEntries(cubeRegions().filter((r) => r.face).map((r): [string, number[]] => [r.face ?? '', [...r.direction]]));
    expect(faces).toEqual({ front: [0, -1, 0], back: [0, 1, 0], right: [1, 0, 0], left: [-1, 0, 0], top: [0, 0, 1], bottom: [0, 0, -1] });
    for (const z of [-1, 1]) {
      const direction = cubeViewDirection([0, 0, z]);
      expect(direction.length()).toBeCloseTo(1);
      expect(direction.y).toBeLessThan(0);
      expect(direction.z).toBeCloseTo(z);
    }
  });

  it('is a closed bevelled surface and every region can be picked from its view direction', () => {
    const regions = cubeRegions();
    const seams = new Map<string, number>();
    const material = new MeshBasicMaterial();
    const meshes = regions.map((region) => new Mesh(regionGeometry(region), material));
    try {
      regions.forEach((region, i) => {
        expect(cubeViewDirection(region.direction).length()).toBeCloseTo(1);
        region.vertices.forEach((vertex, j) => {
          const edge = [vertex.toArray().join(','), region.vertices[(j + 1) % region.vertices.length]?.toArray().join(',')].sort().join('|');
          seams.set(edge, (seams.get(edge) ?? 0) + 1);
        });
        const origin = new Vector3(...region.direction).normalize().multiplyScalar(5);
        const ray = new Raycaster(origin, origin.clone().negate().normalize());
        const hits = ray.intersectObjects(meshes, false);
        expect(hits[0]?.object).toBe(meshes[i]);
        const geometry = meshes[i]?.geometry;
        if (!geometry) throw new Error('Missing region geometry');
        const normal = new Vector3().fromBufferAttribute(geometry.getAttribute('normal'), 0);
        expect(normal.dot(origin)).toBeGreaterThan(0);
      });
      expect([...seams.values()].every((count) => count === 2)).toBe(true);
    } finally {
      meshes.forEach((mesh) => { mesh.geometry.dispose(); });
      material.dispose();
    }
  });
});
