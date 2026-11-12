import { describe, expect, it } from 'vitest';

import { BRIDGE_SPAN, Overhang, OVERHANG_LIMITS, overhangLimits, overhangOf, smallOverhangReach } from './overhang';

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

  it('leaves a bridge of up to 10 mm between two walls out, and keeps a wider one, a ceiling and an arm', () => {
    // A ceiling at z 8, 30 deep, over the inner faces of the walls named: at x 0, at x `span`, at y 0 and y 30.
    const roof = (span: number, walls: ('left' | 'right' | 'front' | 'back')[]) => {
      const inner = {
        left: { corners: [[0, 0, 0], [0, 30, 0], [0, 30, 8], [0, 0, 8]], normal: [1, 0, 0] },
        right: { corners: [[span, 0, 0], [span, 0, 8], [span, 30, 8], [span, 30, 0]], normal: [-1, 0, 0] },
        front: { corners: [[0, 0, 0], [0, 0, 8], [span, 0, 8], [span, 0, 0]], normal: [0, 1, 0] },
        back: { corners: [[0, 30, 0], [span, 30, 0], [span, 30, 8], [0, 30, 8]], normal: [0, -1, 0] },
      };
      const mesh = faces([{ corners: [[0, 0, 8], [0, 30, 8], [span, 30, 8], [span, 0, 8]], normal: [0, 0, -1] }, ...walls.map((wall) => inner[wall])]);
      return Math.round(overhangOf(mesh, 0, OVERHANG_LIMITS, smallOverhangReach(0.4)).area[Overhang.Support]);
    };
    expect(BRIDGE_SPAN).toBe(10);
    // Within reach of both walls, and bridged.
    expect(roof(3, ['left', 'right'])).toBe(0);
    expect(roof(8, ['left', 'right'])).toBe(0);
    expect(roof(10, ['left', 'right'])).toBe(0);
    // Audit MG-01, N-mechanik-1: every corner of these lies on a wall, so they counted as small
    // (a bridge of 40 mm, the 102 mm ceiling of a guide's groove, the ceiling of a box).
    expect(roof(12, ['left', 'right'])).toBe(360);
    expect(roof(40, ['left', 'right'])).toBe(1200);
    expect(roof(102, ['left', 'right'])).toBe(3060);
    expect(roof(40, ['left', 'right', 'front', 'back'])).toBe(1200);
    // An arm held on one side only is no bridge, however short.
    expect(roof(8, ['left'])).toBe(240);
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
});
