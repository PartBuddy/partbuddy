import type { TaggedMesh } from '@partbuddy/geometry';

export interface OverhangFinding {
  face: number;
  areaMm2: number;
  maxAngleDeg: number;
}

/**
 * Faces with downward-facing triangles steeper than `limitDeg` from vertical, excluding the
 * first layer on the bed (taken at z = 0). Overhang angle is measured from vertical: a ceiling is 90°.
 * A simplified preview for this prototype only; the app checks with `overhangOf` of the geometry
 * package (moved here from there, audit D36).
 */
export function overhangFindings(mesh: TaggedMesh, limitDeg = 60, bedTolerance = 0.25): OverhangFinding[] {
  const p = mesh.positions;
  const threshold = -Math.sin((limitDeg * Math.PI) / 180);
  const byFace = new Map<number, OverhangFinding>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [(mesh.indices[t] ?? 0) * 3, (mesh.indices[t + 1] ?? 0) * 3, (mesh.indices[t + 2] ?? 0) * 3];
    const ux = (p[b] ?? 0) - (p[a] ?? 0);
    const uy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
    const uz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
    const vx = (p[c] ?? 0) - (p[a] ?? 0);
    const vy = (p[c + 1] ?? 0) - (p[a + 1] ?? 0);
    const vz = (p[c + 2] ?? 0) - (p[a + 2] ?? 0);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) continue;
    const z = nz / length;
    const minZ = Math.min(p[a + 2] ?? 0, p[b + 2] ?? 0, p[c + 2] ?? 0);
    if (z > threshold || minZ <= bedTolerance) continue;
    const face = mesh.triangleFaces[t / 3] ?? 0;
    const angle = (Math.asin(Math.min(1, -z)) * 180) / Math.PI;
    const entry = byFace.get(face) ?? { face, areaMm2: 0, maxAngleDeg: 0 };
    entry.areaMm2 += length / 2;
    entry.maxAngleDeg = Math.max(entry.maxAngleDeg, angle);
    byFace.set(face, entry);
  }
  return [...byFace.values()].sort((x, y) => y.areaMm2 - x.areaMm2);
}
