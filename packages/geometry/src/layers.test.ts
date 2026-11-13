import { describe, expect, it } from 'vitest';

import { Overhang, overhangLimits, overhangOf, smallOverhangReach } from './overhang';
import { gridBody, meshOf, prismBody, revolved, type RawMesh } from './testShapes';

const check = (mesh: RawMesh) => overhangOf({ ...mesh, normals: new Float32Array(mesh.positions.length) }, 0, overhangLimits(45), smallOverhangReach(0.4));

// Two walls `span` apart under a roof, a post 3 × 3 on the roof, and on the post a head 1.5 out to both sides.
const headOnBridge = (span: number) => {
  const middle = 2 + span / 2;
  return meshOf(gridBody('Head', [0, 2, middle - 3, middle - 1.5, middle + 1.5, middle + 3, 2 + span, 4 + span], [0, 10, 11.5, 14.5, 16, 30], [0, 8, 10, 14, 16], (i, j, k) => (k === 0 ? i === 0 || i === 6 : k === 1 || (i === 3 && j === 2) || (k === 3 && i >= 2 && i <= 4 && j === 2))));
};

/** A funnel of four flat sides that opens upwards over `height` mm, its faces `degrees` from the vertical, with a ledge 1.5 mm out round its top. */
const squareFunnel = (height: number, degrees: number) => {
  const top = 5 + (height * Math.tan((degrees * Math.PI) / 180)) / Math.SQRT1_2;
  return revolved([[0, 0], [5, 0], [top, height], [top + 1.5, height], [top + 1.5, height + 2], [0, height + 2]], [-1, 0, -1, 0, 1], 4);
};
/** The fastest of three runs (ms): one run alone says more about the runner than about the check. */
const fastest = (mesh: RawMesh) => {
  let ms = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    check(mesh);
    ms = Math.min(ms, performance.now() - start);
  }
  return ms;
};

describe('what stands, cut in layers', () => {
  // Rounded as the carried outline grew, every corner left an arc that was never taken out again:
  // 40 triangles took 0.8 s at 5 mm and 33 s at 20 mm (review of pull request 363).
  it.each([45, 50])('cuts a funnel of four flat sides at %s° four times as high in no more than twelve times the time', { timeout: 120_000 }, (degrees) => {
    // Under a millisecond the clock measures itself.
    expect(fastest(squareFunnel(20, degrees))).toBeLessThan(Math.max(5, fastest(squareFunnel(5, degrees))) * 12);
  });

  it('cuts only where something hangs or begins: a column 300 mm high under a lip costs no more than one of 30', { timeout: 120_000 }, () => {
    const column = (height: number) => revolved([[0, 0], [10, 0], [10, height - 2], [11.5, height - 2], [11.5, height], [0, height]], [-1, 0, -1, 0, 1], 160);
    expect(check(column(300)).area[Overhang.Support]).toBeLessThan(1);
    expect(fastest(column(300))).toBeLessThan(Math.max(5, fastest(column(30))) * 4);
  });

  it('cuts a stair of 740 steps in no more than forty times the time of one of 185', { timeout: 120_000 }, () => {
    // Linear here (185: 39 ms, 740: 149 ms, 1480: 294 ms); a busy runner took 13-14 times. The fault this guards against
    // took over a hundred times, so forty still catches it.
    // Every cut goes through every triangle of the stair's flat ends: 4.9 s for 300 mm (second review of pull request 363).
    const stairOf = (steps: number) => {
      const outline: [number, number][] = [[0, 0], [5, 0], [5, 4]];
      for (let step = 1; step <= steps; step += 1) outline.push([5 + step * 0.5, 3.6 + step * 0.4], [5 + step * 0.5, 4 + step * 0.4]);
      const mesh = meshOf(prismBody('Stair', [...outline, [5 + steps * 0.5, 6 + steps * 0.4], [0, 6 + steps * 0.4]], 20));
      const [cos, sin] = [Math.cos(Math.PI / 12), Math.sin(Math.PI / 12)];
      const positions = Float32Array.from(mesh.positions, (_, i) => (i % 3 === 0 ? cos * (mesh.positions[i] ?? 0) - sin * (mesh.positions[i + 1] ?? 0) : i % 3 === 1 ? sin * (mesh.positions[i - 1] ?? 0) + cos * (mesh.positions[i] ?? 0) : (mesh.positions[i] ?? 0)));
      return { ...mesh, positions };
    };
    expect(fastest(stairOf(740))).toBeLessThan(Math.max(5, fastest(stairOf(185))) * 40);
  });

  it('takes a triangle that comes twice, and says so when a mesh with a hole is followed along its faces instead', () => {
    const outline: [number, number][] = [[0, 0], [5, 0], [5, 4]];
    for (let step = 1; step <= 20; step += 1) outline.push([5 + step * 1.7, 3 + step], [5 + step * 1.7, 4 + step]);
    const stair = meshOf(prismBody('Stair', [...outline, [39, 26], [0, 26]], 20));
    const whole = check(stair);
    expect(whole.layered).toBe(true);
    expect(whole.area[Overhang.Support]).toBeCloseTo(19 * 34, 0);
    const twice = check({ ...stair, index: Uint32Array.from([...stair.index, ...stair.index.slice(0, 3)]) });
    expect(twice.layered).toBe(true);
    expect(twice.area[Overhang.Support]).toBeGreaterThanOrEqual(19 * 34);
    // shortcut: with a triangle missing the stair passes as it did before the layers; `layered` says so.
    expect(check({ ...stair, index: stair.index.slice(3) }).layered).toBe(false);
  });

  it('lets a bridge carry what is built on it, and a reported ceiling not', () => {
    expect(check(headOnBridge(8)).area[Overhang.Support]).toBeLessThan(1);
    // The ceiling of 12 × 30 and the two undersides of the head, 1.5 × 3 each.
    expect(check(headOnBridge(12)).area[Overhang.Support]).toBeCloseTo(360 + 9, 0);
  });

  it('cuts a closed bolt of 260 ribs, 100 000 triangles, without taking seconds', { timeout: 120_000 }, () => {
    // Ribs like the turns of a thread: 0.6 out over 0.3, back over 0.7; closed on the axis at both ends.
    const boltOf = (count: number) => {
      const ribs = Array.from({ length: count }, (_, k): [number, number][] => [[4.6, k + 0.3], [4, k + 1]]).flat();
      return revolved([[0, 0], [4, 0], ...ribs, [0, count]], [-1, ...ribs.map(() => 0), 1]);
    };
    // The fastest of three runs: one run alone says more about the runner than about the check.
    const timed = (mesh: RawMesh) => {
      let ms = Infinity;
      let map = check(mesh);
      for (let run = 0; run < 3; run += 1) {
        const start = performance.now();
        map = check(mesh);
        ms = Math.min(ms, performance.now() - start);
      }
      return { ms, map };
    };
    const bolt = boltOf(260);
    const quarter = timed(boltOf(65));
    const { ms, map } = timed(bolt);
    expect(bolt.index.length / 3).toBe(100_224);
    expect(Math.round(map.area[Overhang.Support])).toBe(0);
    expect(map.area[Overhang.Borderline]).toBeGreaterThan(4700);
    // Held by its growth, not in seconds (0.9 s on the build server, 3.5 s on a busy runner, 2026-11-12):
    // four times the bolt may take twelve times as long; quadratic would be sixteen.
    expect(ms / quarter.ms).toBeLessThan(12);
  });
});
