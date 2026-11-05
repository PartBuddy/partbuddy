import { describe, expect, it } from 'vitest';

import { Overhang, overhangOf } from '../src/renderer/src/viewer/overhang';

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
});
