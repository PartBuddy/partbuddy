import { describe, expect, it } from 'vitest';

import { Overhang, overhangLimits, overhangOf, smallOverhangReach, type OverhangInput } from './overhang';

type Ring = [number, number, number][];

/** A surface through rings of points, each joined to the next; `wrap` closes every ring. Triangles face away from the Z axis, flat rings the way `facing` says. */
function surface(rings: Ring[], facing: number[], wrap: boolean): OverhangInput {
  const positions = rings.flat(2);
  const per = rings[0]?.length ?? 0;
  const index: number[] = [];
  const point = (v: number) => [positions[v * 3] ?? 0, positions[v * 3 + 1] ?? 0, positions[v * 3 + 2] ?? 0] as const;
  for (let r = 0; r + 1 < rings.length; r += 1) {
    for (let i = 0; i < (wrap ? per : per - 1); i += 1) {
      const j = (i + 1) % per;
      const quad = [r * per + i, r * per + j, (r + 1) * per + j, (r + 1) * per + i] as const;
      for (const [a, b, c] of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] as const) {
        const [pa, pb, pc] = [point(a), point(b), point(c)];
        const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]] as const;
        const w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]] as const;
        const normal = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]] as const;
        const radial = normal[0] * (pa[0] + pb[0] + pc[0]) + normal[1] * (pa[1] + pb[1] + pc[1]);
        const flip = Math.abs(radial) > 1e-9 ? radial < 0 : normal[2] * (facing[r] ?? 0) < 0;
        index.push(a, flip ? c : b, flip ? b : c);
      }
    }
  }
  return { positions: Float32Array.from(positions), normals: new Float32Array(positions.length), index: Uint32Array.from(index), vertexFaces: new Uint32Array(positions.length / 3), faceCount: 1 };
}

const circle = (radius: number, z: number, n: number): Ring => Array.from({ length: n }, (_, i) => [radius * Math.cos((i * 2 * Math.PI) / n), radius * Math.sin((i * 2 * Math.PI) / n), z]);

/** An outside thread on a core that stands on the bed: root 4 mm, crest 4.6 mm, pitch 1 mm, the under flank 63° from the vertical. */
function thread(turns: number, n: number): OverhangInput {
  const helix = (radius: number, lift: number, z?: number): Ring => Array.from({ length: turns * n + 1 }, (_, i) => [radius * Math.cos((i * 2 * Math.PI) / n), radius * Math.sin((i * 2 * Math.PI) / n), z ?? i / n + lift]);
  return surface([helix(4, 0, -1), helix(4, 0), helix(4.6, 0.3), helix(4, 1)], [0, 0, 0], false);
}

/** A funnel that steps outwards going up: risers 1 mm high, ledges 1 mm out facing down, no face that looks up. */
function funnel(steps: number, n: number): OverhangInput {
  const rings = [circle(5, 0, n)];
  const facing: number[] = [];
  for (let k = 0; k < steps; k += 1) {
    rings.push(circle(5 + k, k + 1, n), circle(6 + k, k + 1, n));
    facing.push(0, -1);
  }
  return surface(rings, facing, true);
}

/** A stem meshed in many rings under a ledge 1.5 mm out. */
function stem(rings: number, n: number, from: number): OverhangInput {
  const all = Array.from({ length: rings + 1 }, (_, k) => circle(5, from + k * 0.2, n));
  return surface([...all, circle(6.5, from + rings * 0.2, n)], [...Array.from({ length: rings }, () => 0), -1], true);
}

/** The check on a mesh, with the fastest of three runs: one run alone says more about the runner than about the check. */
function timed(mesh: OverhangInput, bed: number) {
  let ms = Infinity;
  let map = overhangOf(mesh, bed, overhangLimits(45), smallOverhangReach(0.4));
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    map = overhangOf(mesh, bed, overhangLimits(45), smallOverhangReach(0.4));
    ms = Math.min(ms, performance.now() - start);
  }
  return { ms, triangles: mesh.index.length / 3, support: Math.round(map.area[Overhang.Support]), small: Math.round(map.area[Overhang.Borderline]) };
}

/**
 * How many times longer a mesh four times the size may take. One pass takes 4 times as long,
 * searching anew from every rim 16 times; a limit in seconds failed on a busy runner instead
 * (3.9 s against 3 s for the thread).
 */
const GROWTH = 12;
/** Time for a test to finish at all on a busy runner; no measure of the check. */
const PATIENCE = 120_000;

describe('what stands and what hangs on large meshes, in one pass', () => {
  // Searching anew from every rim took 14 s on 24 000 triangles of the funnel and 56 s on 48 000.
  it('finds every step of a stepped funnel small: each ledge stands on the riser below', { timeout: PATIENCE }, () => {
    const small = timed(funnel(60, 100), 0);
    expect(small).toMatchObject({ triangles: 24_000, support: 0, small: 13_186 });
    const large = timed(funnel(250, 100), 0);
    expect(large).toMatchObject({ triangles: 100_000, support: 0 });
    expect(large.ms).toBeLessThan(small.ms * GROWTH);
  });

  it('finds the flanks of a long thread small, turn over turn', { timeout: PATIENCE }, () => {
    const short = timed(thread(65, 96), -1);
    expect(short).toMatchObject({ triangles: 37_440, support: 0 });
    const bolt = timed(thread(260, 96), -1);
    expect(bolt.triangles).toBe(149_760);
    expect(bolt.support).toBe(0);
    expect(bolt.small).toBeGreaterThan(4700);
    expect(bolt.ms).toBeLessThan(short.ms * GROWTH);
  });

  it('holds a ledge on a finely meshed stem that stands on the bed, and reports it on one that floats', { timeout: PATIENCE }, () => {
    const short = timed(stem(62, 200, 0), 0);
    expect(short).toMatchObject({ triangles: 25_200, support: 0, small: 54 });
    const standing = timed(stem(250, 200, 0), 0);
    expect(standing).toMatchObject({ triangles: 100_400, support: 0, small: 54 });
    expect(standing.ms).toBeLessThan(short.ms * GROWTH);
    const floating = timed(stem(250, 200, 1), 0);
    expect(floating).toMatchObject({ support: 54, small: 0 });
    expect(floating.ms).toBeLessThan(timed(stem(62, 200, 1), 0).ms * GROWTH);
  });
});
