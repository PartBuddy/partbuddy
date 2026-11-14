import { describe, expect, it } from 'vitest';

import { ANGLE_TOLERANCE, CURVED_TOLERANCE, Overhang, overhangLimits, overhangOf } from './overhang';
import { soup } from './testShapes';

/** One square face of side 10 per entry, as render buffers: corners, normal and face index. */
function faces(list: { corners: number[][]; normal: number[] }[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const vertexFaces: number[] = [];
  list.forEach(({ corners, normal }, face) => {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
      vertexFaces.push(face);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    index: Uint32Array.from(index),
    vertexFaces: Uint32Array.from(vertexFaces),
    faceCount: list.length,
  };
}

const s = Math.SQRT1_2;

describe('overhangs for FDM printing (UI upgrade step 12)', () => {
  it('tells the bed, a ceiling that needs support, a 30° slope and a wall apart', () => {
    const mesh = faces([
      // The bottom on the bed at z 0, facing down: not an overhang.
      { corners: [[0, 0, 0], [0, 10, 0], [10, 10, 0], [10, 0, 0]], normal: [0, 0, -1] },
      // A ceiling at z 20, facing down: needs support.
      { corners: [[0, 0, 20], [0, 10, 20], [10, 10, 20], [10, 0, 20]], normal: [0, 0, -1] },
      // A wall: fine.
      { corners: [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]], normal: [0, -1, 0] },
      // Leaning 30° from the vertical, facing down: fine (sin 30° = 0.5).
      { corners: [[0, 0, 5], [10, 0, 5], [10, 5, 13.66], [0, 5, 13.66]], normal: [0, Math.cos(Math.PI / 6), -0.5] },
    ]);
    const map = overhangOf(mesh, 0);
    expect([map.vertices[0], map.vertices[4], map.vertices[8], map.vertices[12]]).toEqual([Overhang.Bed, Overhang.Support, Overhang.Fine, Overhang.Fine]);
    expect(map.area[Overhang.Bed]).toBeCloseTo(100, 3);
    expect(map.area[Overhang.Support]).toBeCloseTo(100, 3);
  });

  it('marks 40° from the vertical as borderline and 50° as needing support', () => {
    const at = (degrees: number) => -Math.sin((degrees * Math.PI) / 180);
    const mesh = faces([
      { corners: [[0, 0, 5], [10, 0, 5], [10, 1, 6], [0, 1, 6]], normal: [0, Math.cos((40 * Math.PI) / 180), at(40)] },
      { corners: [[0, 0, 7], [10, 0, 7], [10, 1, 8], [0, 1, 8]], normal: [0, Math.cos((50 * Math.PI) / 180), at(50)] },
      { corners: [[0, 0, 9], [10, 0, 9], [10, 1, 10], [0, 1, 10]], normal: [0, s, s] },
    ]);
    const map = overhangOf(mesh, 0);
    expect([map.vertices[0], map.vertices[4], map.vertices[8]]).toEqual([Overhang.Borderline, Overhang.Support, Overhang.Fine]);
  });

  it('moves the limits with the material (M7): PETG at 40° needs support at 45°, borderline from 30°', () => {
    const at = (degrees: number) => -Math.sin((degrees * Math.PI) / 180);
    const slope = (degrees: number, z: number) => ({
      corners: [[0, 0, z], [10, 0, z], [10, 1, z + 1], [0, 1, z + 1]],
      normal: [0, Math.cos((degrees * Math.PI) / 180), at(degrees)],
    });
    const mesh = faces([slope(25, 5), slope(35, 7), slope(45, 9)]);
    const map = overhangOf(mesh, 0, overhangLimits(40));
    expect([map.vertices[0], map.vertices[4], map.vertices[8]]).toEqual([Overhang.Fine, Overhang.Borderline, Overhang.Support]);
    expect(overhangLimits(40)).toEqual({ borderline: 30, support: 40 });
  });
  /** The most a triangle of a mesh leans from the vertical, facing down (degrees). */
  const lean = (mesh: { positions: Float32Array; index: Uint32Array }) => {
    let most = 0;
    for (let i = 0; i < mesh.index.length; i += 3) {
      const p = [0, 1, 2].map((c) => [0, 1, 2].map((k) => mesh.positions[(mesh.index[i + c] ?? 0) * 3 + k] ?? 0));
      const [a, b, c] = p as [number[], number[], number[]];
      const u = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
      const v = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
      const nz = (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0);
      const length = Math.hypot((u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0), (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0), nz);
      most = Math.max(most, (Math.asin(Math.max(-1, Math.min(1, -nz / length))) * 180) / Math.PI);
    }
    return most;
  };
  /**
   * A lying cone of 90° (a countersink's angle), axis along Y, 20 mm over the bed, meshed in `n` with a facet across
   * its underside, turned about Z by `turn` and mirrored in X if asked; `normal` for every vertex, else none.
   */
  const lyingCone = (n: number, turn = 0, mirrored = false, normal?: [number, number, number]) => {
    const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
    const at = (r: number, y: number, k: number): [number, number, number] => {
      const angle = ((k + 0.5) * 2 * Math.PI) / n;
      const x = (mirrored ? -1 : 1) * r * Math.cos(angle);
      return [cos * x - sin * y, sin * x + cos * y, 20 + r * Math.sin(angle)];
    };
    // Mirrored, the triangles turn round: keep them facing out.
    const tri = (p: [number, number, number][]) => (mirrored ? [p[0]!, p[2]!, p[1]!] : p);
    const cone = soup(Array.from({ length: n }, (_, k) => [tri([at(2, 0, k), at(6, 4, k), at(6, 4, k + 1)]), tri([at(2, 0, k), at(6, 4, k + 1), at(2, 0, k + 1)])]).flat());
    const normals = new Float32Array(cone.positions.length);
    if (normal) for (let v = 0; v < normals.length; v += 3) normals.set(normal, v);
    return { ...cone, normals };
  };

  it('holds a flat face to a tenth of a degree past the limit and the facets of a curved one to a degree (audit D19, BC-19)', () => {
    // Meshed in 16 the facet across the underside leans 45.56°: past the tenth, within the degree. In 8 it leans 47.27°:
    // past the degree, so even a curved face needs support there (review S3). Turned and mirrored alike.
    for (const turn of [0, 1, 7.5, 15, 30, 45, 60, 75, 90]) {
      for (const mirrored of [false, true]) {
        const how = `turned ${String(turn)}°${mirrored ? ', mirrored' : ''}`;
        const fine = lyingCone(16, turn, mirrored);
        expect(lean(fine), how).toBeGreaterThan(45 + ANGLE_TOLERANCE);
        expect(lean(fine), how).toBeLessThan(45 + CURVED_TOLERANCE);
        const map = overhangOf(fine, 0, overhangLimits(45));
        expect(map.area[Overhang.Support], how).toBe(0);
        expect(map.area[Overhang.Borderline], how).toBeGreaterThan(0);
        const coarse = lyingCone(8, turn, mirrored);
        expect(lean(coarse), how).toBeGreaterThan(45 + CURVED_TOLERANCE);
        expect(overhangOf(coarse, 0, overhangLimits(45)).area[Overhang.Support], how).toBeGreaterThan(0);
      }
    }
    // The same facets as faces of their own (each quad a flat face): the one across the underside needs support.
    const fine = lyingCone(16);
    const flat = { ...fine, vertexFaces: Uint32Array.from({ length: fine.vertexFaces.length }, (_, v) => v), faceCount: fine.vertexFaces.length };
    expect(overhangOf(flat, 0, overhangLimits(45)).area[Overhang.Support]).toBeGreaterThan(0);
  });

  it('shades the vertices of a curved face with the tolerance its area is counted with (review K5)', () => {
    // Every vertex normal 45.5° from the vertical: borderline on the curved face, support on flat ones.
    const down = (45.5 * Math.PI) / 180;
    const cone = lyingCone(16, 0, false, [Math.cos(down), 0, -Math.sin(down)]);
    expect(new Set(overhangOf(cone, 0, overhangLimits(45)).vertices)).toEqual(new Set([Overhang.Borderline]));
    const flat = { ...cone, vertexFaces: Uint32Array.from({ length: cone.vertexFaces.length }, (_, v) => v), faceCount: cone.vertexFaces.length };
    expect(new Set(overhangOf(flat, 0, overhangLimits(45)).vertices)).toEqual(new Set([Overhang.Support]));
  });
});
