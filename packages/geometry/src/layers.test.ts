import { describe, expect, it } from 'vitest';

import { Overhang, overhangLimits, overhangOf, smallOverhangReach } from './overhang';
import { gridBody, meshOf, revolved, type RawMesh } from './testShapes';

const check = (mesh: RawMesh) => overhangOf({ ...mesh, normals: new Float32Array(mesh.positions.length) }, 0, overhangLimits(45), smallOverhangReach(0.4));

// Two walls `span` apart under a roof, a post 3 × 3 on the roof, and on the post a head 1.5 out to both sides.
const headOnBridge = (span: number) => {
  const middle = 2 + span / 2;
  return meshOf(gridBody('Head', [0, 2, middle - 3, middle - 1.5, middle + 1.5, middle + 3, 2 + span, 4 + span], [0, 10, 11.5, 14.5, 16, 30], [0, 8, 10, 14, 16], (i, j, k) => (k === 0 ? i === 0 || i === 6 : k === 1 || (i === 3 && j === 2) || (k === 3 && i >= 2 && i <= 4 && j === 2))));
};

describe('what stands, cut in layers', () => {
  it('lets a bridge carry what is built on it, and a reported ceiling not', () => {
    expect(check(headOnBridge(8)).area[Overhang.Support]).toBeLessThan(1);
    // The ceiling of 12 × 30 and the two undersides of the head, 1.5 × 3 each.
    expect(check(headOnBridge(12)).area[Overhang.Support]).toBeCloseTo(360 + 9, 0);
  });

  it('cuts a closed bolt of 260 ribs, 100 000 triangles, without taking seconds', { timeout: 120_000 }, () => {
    // Ribs like the turns of a thread: 0.6 out over 0.3, back over 0.7; closed on the axis at both ends.
    const ribs = Array.from({ length: 260 }, (_, k): [number, number][] => [[4.6, k + 0.3], [4, k + 1]]).flat();
    const bolt = revolved([[0, 0], [4, 0], ...ribs, [0, 260]], [-1, ...ribs.map(() => 0), 1]);
    let ms = Infinity;
    let map = check(bolt);
    for (let run = 0; run < 2; run += 1) {
      const start = performance.now();
      map = check(bolt);
      ms = Math.min(ms, performance.now() - start);
    }
    expect(bolt.index.length / 3).toBe(100_224);
    expect(Math.round(map.area[Overhang.Support])).toBe(0);
    expect(map.area[Overhang.Borderline]).toBeGreaterThan(4700);
    // Measured 0.9 s on the build server (2026-11-12); the limit leaves room for a busy runner.
    expect(ms).toBeLessThan(3000);
  });
});
