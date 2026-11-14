import type { TaggedMesh } from './tagged3mf';

export interface MeshMetrics {
  triangles: number;
  volumeMm3: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

/**
 * Volume by the divergence theorem: valid only for a closed mesh, so callers pass closed bodies alone (the app's
 * `measuresOf` leaves out bodies with open edges; audit D36).
 */
export function meshMetrics(mesh: TaggedMesh): MeshMetrics {
  const p = mesh.positions;
  let volume = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]! * 3, mesh.indices[t + 1]! * 3, mesh.indices[t + 2]! * 3];
    volume +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, p[i + k]!);
      max[k] = Math.max(max[k]!, p[i + k]!);
    }
  }
  return { triangles: mesh.indices.length / 3, volumeMm3: volume, bbox: { min, max } };
}
