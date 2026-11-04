import type { TaggedMesh } from './tagged3mf';

export interface MeshMetrics {
  triangles: number;
  volumeMm3: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

/** Volume by the divergence theorem; valid for the closed meshes SolidCraft exports. */
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

export interface OverhangFinding {
  face: number;
  areaMm2: number;
  maxAngleDeg: number;
}

/**
 * Faces with downward-facing triangles steeper than `limitDeg` from vertical, excluding the
 * first layer on the bed. Overhang angle is measured from vertical: a ceiling is 90°.
 * This is a simplified preview of the product's overhang tool, for the prototype only.
 */
export function overhangFindings(mesh: TaggedMesh, limitDeg = 60, bedTolerance = 0.25): OverhangFinding[] {
  const p = mesh.positions;
  const threshold = -Math.sin((limitDeg * Math.PI) / 180);
  const byFace = new Map<number, OverhangFinding>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]! * 3, mesh.indices[t + 1]! * 3, mesh.indices[t + 2]! * 3];
    const ux = p[b]! - p[a]!;
    const uy = p[b + 1]! - p[a + 1]!;
    const uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!;
    const vy = p[c + 1]! - p[a + 1]!;
    const vz = p[c + 2]! - p[a + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) continue;
    const z = nz / length;
    const minZ = Math.min(p[a + 2]!, p[b + 2]!, p[c + 2]!);
    if (z > threshold || minZ <= bedTolerance) continue;
    const face = mesh.triangleFaces[t / 3]!;
    const angle = (Math.asin(Math.min(1, -z)) * 180) / Math.PI;
    const entry = byFace.get(face) ?? { face, areaMm2: 0, maxAngleDeg: 0 };
    entry.areaMm2 += length / 2;
    entry.maxAngleDeg = Math.max(entry.maxAngleDeg, angle);
    byFace.set(face, entry);
  }
  return [...byFace.values()].sort((x, y) => y.areaMm2 - x.areaMm2);
}
