import { describe, expect, it } from 'vitest';

import { centring, faceExtent, hostFace, movedPlane, placedLogos, uniqueLogoName, type SketchPlane, type Vec3 } from '../src/shared/drawingPlacement';

const top: SketchPlane = { origin: [10, 10, 10], x_dir: [1, 0, 0], y_dir: [0, 1, 0] };
const line = (name: string, start: Vec3, end: Vec3) => ({
  name,
  start,
  end,
  mid: start.map((value, i) => (value + (end[i] ?? 0)) / 2) as Vec3,
  length: Math.hypot(...start.map((value, i) => value - (end[i] ?? 0))),
});

// The top face of a 40 × 40 × 10 box, its four edges as SolidCraft's model.edges names them.
const boxTop = [
  line('F1:+z|F1:-y', [0, 0, 10], [40, 0, 10]),
  line('F1:+x|F1:+z', [40, 0, 10], [40, 40, 10]),
  line('F1:+y|F1:+z', [40, 40, 10], [0, 40, 10]),
  line('F1:-x|F1:+z~1', [0, 40, 10], [0, 0, 10]),
  line('F1:+x|F1:-z', [40, 0, 0], [40, 40, 0]),
];

describe('placing a logo', () => {
  it('names a second logo of the same file apart', () => {
    expect(uniqueLogoName('badge.svg', [])).toBe('Logo badgesvg');
    expect(uniqueLogoName('Badge', ['Logo Badge'])).toBe('Logo Badge 2');
    expect(uniqueLogoName('Badge', ['Logo Badge', 'Logo Badge 2'])).toBe('Logo Badge 3');
  });

  it('groups the sketches of a logo in colours and skips other sketches', () => {
    const logos = placedLogos({
      sketches: [
        { id: 2, name: 'Logo Badge', plane: top },
        { id: 5, name: 'Logo Badge', plane: top },
        { id: 7, name: 'Sketch3', plane: top },
        { id: 8, name: 'Logo Broken' },
      ],
    });
    expect([...logos.keys()]).toEqual(['Logo Badge']);
    expect(logos.get('Logo Badge')?.map((sketch) => sketch.id)).toEqual([2, 5]);
  });

  it('moves the plane along its own axes', () => {
    const side: SketchPlane = { origin: [20, 0, 5], x_dir: [1, 0, 0], y_dir: [0, 0, 1] };
    expect(movedPlane(side, 3, -2).origin).toEqual([23, 0, 3]);
  });

  it('measures a face from its edges, the box top in the plane of a logo at (10, 10)', () => {
    expect(faceExtent(top, boxTop, 'F1:+z')).toEqual({ min: [-10, -10], max: [30, 30] });
  });

  it('takes a round face whole from its two half circles', () => {
    // A cylinder of radius 5 around (3, 4): SolidCraft splits the rim into two halves.
    const c = [3, 4] as const;
    const at = (deg: number): [number, number, number] => [c[0] + 5 * Math.cos((deg * Math.PI) / 180), c[1] + 5 * Math.sin((deg * Math.PI) / 180), 10];
    const half = (name: string, from: number) => ({ name, start: at(from), mid: at(from + 90), end: at(from + 180), length: 5 * Math.PI });
    const plane: SketchPlane = { origin: [0, 0, 10], x_dir: [1, 0, 0], y_dir: [0, 1, 0] };
    const extent = faceExtent(plane, [half('F1:top|F1:side#1', 35), half('F1:top|F1:side#2', 215)], 'F1:top');
    extent?.min.forEach((value, i) => expect(value).toBeCloseTo([-2, -1][i] ?? NaN, 9));
    extent?.max.forEach((value, i) => expect(value).toBeCloseTo([8, 9][i] ?? NaN, 9));
  });

  it('centres on the part face, not on a colour piece lying in the same plane', () => {
    const piece = [line('A:top|A:s1', [2, 6, 10], [18, 6, 10]), line('A:top|A:s2', [18, 6, 10], [18, 14, 10]), line('A:top|A:s3', [18, 14, 10], [2, 14, 10]), line('A:top|A:s4', [2, 14, 10], [2, 6, 10])];
    const faces = (list: { name: string; normal: number[]; point: number[] }[]) => ({ faces: list.map((face) => ({ name: face.name, plane_normal: face.normal, point: face.point })) });
    const host = hostFace(top, [
      { body: 'Badge 1d71b8 1', faces: faces([{ name: 'A:top', normal: [0, 0, 1], point: [5, 8, 10] }]), edges: { edges: piece } },
      { body: 'Box', faces: faces([{ name: 'F1:+z', normal: [0, 0, 1], point: [30, 30, 10] }, { name: 'F1:-z', normal: [0, 0, -1], point: [1, 1, 0] }]), edges: { edges: boxTop } },
    ]);
    expect(host).toEqual({ body: 'Box', face: 'F1:+z', extent: { min: [-10, -10], max: [30, 30] } });
    const extent: { min: [number, number]; max: [number, number] } = { min: [-10, -10], max: [30, 30] };
    expect(centring(extent, 'both')).toEqual([10, 10]);
    expect(centring(extent, 'x')).toEqual([10, 0]);
  });
});
