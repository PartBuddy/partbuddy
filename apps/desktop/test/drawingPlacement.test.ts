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
    expect(uniqueLogoName('badge.svg', [])).toBe('SVG-Logo badgesvg');
    expect(uniqueLogoName('Badge', ['SVG-Logo Badge'])).toBe('SVG-Logo Badge 2');
    expect(uniqueLogoName('Badge', ['SVG-Logo Badge', 'SVG-Logo Badge 2'])).toBe('SVG-Logo Badge 3');
  });

  it('groups the sketches of a logo in colours and skips other sketches', () => {
    const logos = placedLogos({
      sketches: [
        { id: 2, name: 'SVG-Logo Badge', plane: top },
        { id: 5, name: 'SVG-Logo Badge', plane: top },
        { id: 7, name: 'Sketch3', plane: top },
        { id: 8, name: 'SVG-Logo Broken' },
      ],
    });
    expect([...logos.keys()]).toEqual(['SVG-Logo Badge']);
    expect(logos.get('SVG-Logo Badge')?.map((sketch) => sketch.id)).toEqual([2, 5]);
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

describe('logo colour bodies', () => {
  it('tells a colour piece of a logo from other bodies', async () => {
    const { isLogoColourBody } = await import('../src/shared/drawingPlacement');
    const sketches = ['Sketch1', 'SVG-Logo Badge', 'SVG-Logo twemoji-fox 2', 'SVG-Logo Badge 2', 'Text facade'];
    expect(isLogoColourBody('Badge 1d71b8 1', sketches)).toBe(true);
    expect(isLogoColourBody('twemoji-fox ff8b00 12 (2)', sketches)).toBe(true);
    // A file named "Badge 2" names its bodies so, and its sketch is "SVG-Logo Badge 2" as a second "Badge" would be.
    expect(isLogoColourBody('Badge 2 1d71b8 1', sketches)).toBe(true);
    expect(isLogoColourBody('Body1', sketches)).toBe(false);
    expect(isLogoColourBody('Lid 2', sketches)).toBe(false);
    // Audit H-27: a body named like a colour piece without a logo of that name is a part, measured like any other.
    expect(isLogoColourBody('Front facade 1', sketches)).toBe(false);
    expect(isLogoColourBody('Teil decade 1', ['SVG-Logo Haus'])).toBe(false);
    expect(isLogoColourBody('Badge 1d71b8 1', [])).toBe(false);
    expect(isLogoColourBody('Badge 1d71b8 1', ['Text Badge'])).toBe(false);
  });
});

describe('logo part bodies (design hints)', () => {
  it('tells a logo built as a body of its own from other bodies', async () => {
    const { isLogoPartBody, logoBase, uniqueLogoName } = await import('../src/shared/drawingPlacement');
    // The drawing tool names the body logoBase of its file and the sketch uniqueLogoName of it (drawingTool.ts).
    const sketches = ['Sketch1', uniqueLogoName('Badge', []), uniqueLogoName('Badge', ['SVG-Logo Badge']), 'Text facade'];
    expect(isLogoPartBody(logoBase('Badge'), sketches)).toBe(true);
    expect(isLogoPartBody('Badge 2', ['SVG-Logo Badge 2'])).toBe(true);
    expect(isLogoPartBody('Body1', sketches)).toBe(false);
    expect(isLogoPartBody('facade', sketches)).toBe(false);
    expect(isLogoPartBody('Badge', [])).toBe(false);
  });
});

describe('edge names', () => {
  it('splits an edge into its two faces outside the brackets of a changed face', async () => {
    const { faceNames } = await import('../src/shared/drawingPlacement');
    expect(faceNames('F1:+z|F1:-y')).toEqual(['F1:+z', 'F1:-y']);
    expect(faceNames('F1:-x|F1:-y#[F10:blend:F1:+x|F1:-z,F15:face:100]')).toEqual(['F1:-x', 'F1:-y#[F10:blend:F1:+x|F1:-z,F15:face:100]']);
    expect(faceNames('F2:+y~2|F3:-y')).toEqual(['F2:+y', 'F3:-y']);
  });
});
