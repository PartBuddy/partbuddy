/* eslint-disable no-restricted-syntax -- SVG fills are the drawing's own data, not interface colours */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drawingColours, drawingFacts, drawingPieces, drawingSize, drawingSvg, flatten, mergedColours, naturalWidth, openedControls, parseDrawing, parsePathData, shapesOverlap, type Drawing, type Shape } from '../src/shared/svgDrawing';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'svg', name), 'utf8');

function drawing(text: string): Drawing {
  const result = parseDrawing(text);
  if (!result.ok) throw new Error(`${result.problem}: ${result.detail}`);
  return result.drawing;
}

describe('SVG drawings', () => {
  it('reads an "O" exactly: 40 mm wide, the hole stays a hole, the curves within 0.05 mm', () => {
    const o = drawing(fixture('logo-o.svg'));
    // 100 units over 20 mm: the file says 20 mm, the user scales it to 40.
    expect(naturalWidth(o)).toBe(20);
    const facts = drawingFacts(o, 40);
    expect(facts).toMatchObject({ width: 40, height: 40, loops: 2, holes: 1 });
    expect(facts.colours[0]?.fill).toBe('#e30613');
    // Ring area π(20² − 12²) mm².
    expect(facts.colours[0]?.area).toBeCloseTo(Math.PI * (400 - 144), 0);
    // Read the clean SVG back as SolidCraft gets it and measure every point's distance to the true circles.
    const clean = drawing(drawingSvg(o, 40));
    expect(naturalWidth(clean)).toBe(40);
    const [outer, inner] = clean.shapes[0]?.loops ?? [];
    let worst = 0;
    for (const [loop, radius] of [[outer, 20], [inner, 12]] as const) {
      for (const [x, y] of flatten(loop as NonNullable<typeof loop>, 0.001)) worst = Math.max(worst, Math.abs(Math.hypot(x - 20, y - 20) - radius));
    }
    expect(worst).toBeLessThan(0.05);
    expect(worst).toBeLessThan(0.01);
  });

  it('follows classes, style attributes, transforms, <use> and rounded corners, turns strokes into outlines and leaves out text', () => {
    const d = drawing(fixture('illustrator.svg'));
    // The black line and polyline (stroke 2, butt ends) come last, painted over the fills.
    expect(drawingColours(d)).toEqual(['#1d71b8', '#ffd500', '#e30613', '#000000']);
    expect(d.skipped).toEqual({ strokes: 0, texts: 1, images: 0, backgrounds: 0 });
    // px without a unit: no physical size.
    expect(naturalWidth(d)).toBeNull();
    // Butt ends reach past their end points by half the width across the line: the polyline's at (0, 0), the line's at (200, 100).
    expect(d.bounds.minX).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(d.bounds.maxX).toBeCloseTo(200 + 1 / Math.sqrt(5), 3);
    expect(d.bounds.maxY).toBeCloseTo(100 + 2 / Math.sqrt(5), 3);
    // At its own width one unit is one mm.
    const facts = drawingFacts(d, drawingSize(d).width);
    const area = (fill: string) => facts.colours.find((c) => c.fill === fill)?.area ?? 0;
    // A 80 × 80 square with 10 mm corners: 6400 − (4 − π)·100.
    expect(area('#1d71b8')).toBeCloseTo(6400 - (4 - Math.PI) * 100, 0);
    expect(area('#ffd500')).toBeCloseTo(3200, 0);
    expect(area('#e30613')).toBeCloseTo(Math.PI * 100, 0);
    // The line alone is 2 × 223.6 wide; the polyline adds a little where it leaves the line.
    expect(area('#000000')).toBeGreaterThan(2 * Math.hypot(200, 100));
    expect(area('#000000')).toBeLessThan(2 * Math.hypot(200, 100) + 2 * 2 * Math.hypot(10, 10));
    expect(drawingSvg(d, 180, ['#ffd500'])).toMatch(/^<svg [^>]*><path fill="#ffd500" fill-rule="evenodd" d="[^"]+"\/><\/svg>$/);
  });

  it('keeps holes by the fill rule: nonzero fills a same-way inner loop, evenodd cuts it', () => {
    const d = drawing(fixture('nonzero.svg'));
    expect(d.shapes.map((shape) => shape.loops.length)).toEqual([1, 2]);
    expect(drawingFacts(d, 300).holes).toBe(1);
  });

  it('turns every kind of path command into lines and cubics', () => {
    const [loop] = parsePathData('m10 10h10v10H10Z');
    expect(loop?.segments).toEqual([{ to: [20, 10] }, { to: [20, 20] }, { to: [10, 20] }, { to: [10, 10] }]);
    // Implicit lines after a moveto, compact arc flags, smooth curves; open subpaths are closed.
    const loops = parsePathData('M0,0 10,0 10,10 M20 20q5-5 10 0t10 0s5 5 10 0c0 5 -10 5 -10 0a5 5 0 0010 0');
    expect(loops).toHaveLength(2);
    expect(loops[0]?.segments.at(-1)).toEqual({ to: [0, 0] });
    expect(loops[1]?.segments.every((s) => 'c1' in s || s.to[0] === 20)).toBe(true);
    expect(() => parsePathData('M0 0 L10')).toThrow();
  });

  it('refuses scripts, foreign content, entities, references outside the file and big files without throwing', () => {
    expect(parseDrawing(fixture('script.svg'))).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing(fixture('external.svg'))).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing(fixture('entities.svg'))).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing(fixture('foreign.svg'))).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" onclick="x()"/></svg>')).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing('<svg><style>@import url(http://x/a.css);</style><rect width="1" height="1"/></svg>')).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing('<svg><rect width="1" height="1" fill="url(http://x/#g)"/></svg>')).toMatchObject({ ok: false, problem: 'unsafe' });
    expect(parseDrawing(`<svg>${' '.repeat(600 * 1024)}</svg>`)).toMatchObject({ ok: false, problem: 'tooBig' });
    expect(parseDrawing('<html><body/></html>')).toMatchObject({ ok: false, problem: 'notSvg' });
    expect(parseDrawing('<svg><rect></svg>')).toMatchObject({ ok: false, problem: 'notSvg' });
    expect(parseDrawing('<svg><line x2="10" y2="10"/></svg>')).toMatchObject({ ok: false, problem: 'empty' });
    // A <use> that draws itself ends at the depth limit instead of looping.
    expect(parseDrawing('<svg><g id="a"><rect width="1" height="1"/><use href="#a" x="2"/></g></svg>')).toMatchObject({ ok: true });
    expect(parseDrawing(`<svg>${'<g>'.repeat(100)}${'</g>'.repeat(100)}</svg>`)).toMatchObject({ ok: false, problem: 'tooComplex' });
  });

  it('leaves out hidden and unfilled shapes, takes rotate about a centre and the root\'s physical size', () => {
    const d = drawing(
      '<svg width="2in" height="1in" viewBox="0 0 200 100"><rect width="10" height="10" style="display:none"/><g visibility="hidden"><rect width="5" height="5"/></g>' +
        '<rect x="0" y="0" width="20" height="10" transform="rotate(90 10 5)"/></svg>',
    );
    expect(d.shapes).toHaveLength(1);
    expect(d.bounds).toMatchObject({ minX: expect.closeTo(5, 6) as number, minY: expect.closeTo(-5, 6) as number });
    expect(d.unitMm).toBeCloseTo(0.254, 9);
    expect(naturalWidth(d)).toBeCloseTo(2.54, 2);
  });
});

describe('pieces of a drawing', () => {
  it('splits shapes into pieces that hang together and tells overlapping pieces from pieces apart', () => {
    const d = drawing(
      '<svg><rect width="10" height="10" fill="red"/><rect x="5" y="5" width="10" height="10" fill="blue"/><rect x="30" width="5" height="5" fill="green"/>' +
        '<rect x="2" y="2" width="2" height="2" fill="yellow"/></svg>',
    );
    const [red, blue, green, yellow] = drawingPieces(d).map((piece) => [piece]) as [Shape[], Shape[], Shape[], Shape[]];
    expect(shapesOverlap(d, red, blue)).toBe(true);
    expect(shapesOverlap(d, red, green)).toBe(false);
    expect(shapesOverlap(d, red, yellow)).toBe(true);
    expect(shapesOverlap(d, blue, yellow)).toBe(false);
    // A ring with an island in its hole: the ring with its hole, and the island on its own.
    const ring = drawing('<svg><path fill-rule="evenodd" d="M0 0H30V30H0Z M5 5H25V25H5Z M10 10H20V20H10Z"/></svg>');
    expect(drawingPieces(ring).map((piece) => piece.loops.length)).toEqual([2, 1]);
    // The fox: two ears, two inner ears, the head, the muzzle, and eyes and nose in one path.
    expect(drawingPieces(drawing(fixture('twemoji-fox.svg')))).toHaveLength(9);
  });
});

describe('line icons', () => {
  it('builds a stroke-only icon at its stroke width, round caps and joins, as one outline per colour', () => {
    // Tabler "rocket": three stroked paths (width 2 on a 24 grid) and an invisible frame without fill or stroke.
    const d = drawing(fixture('tabler-rocket.svg'));
    expect(drawingColours(d)).toEqual(['#000000']);
    expect(d.shapes).toHaveLength(1);
    expect(d.skipped).toEqual({ strokes: 1, texts: 0, images: 0, backgrounds: 0 });
    // The drawn lines run from about 4 to 20; a stroke 2 wide reaches one further each way.
    expect(Math.abs(d.bounds.minX - 3)).toBeLessThan(0.1);
    expect(Math.abs(d.bounds.maxX - 21)).toBeLessThan(0.1);
    // The window of the rocket (a ring with a hole) and the space inside the body are holes.
    expect(drawingFacts(d, 24).holes).toBeGreaterThanOrEqual(2);
  });

  it('keeps open and closed strokes apart: a closed square gets mitred corners, an open one butt ends', () => {
    const closed = drawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" fill="none" stroke="#000" stroke-width="2"/></svg>');
    // A ring: 12 × 12 outside, 8 × 8 inside.
    expect(drawingFacts(closed, 12).colours[0]?.area).toBeCloseTo(144 - 64, 0);
    const open = drawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polyline points="5,5 15,5" fill="none" stroke="#000" stroke-width="2"/></svg>');
    expect(drawingSize(open).width).toBeCloseTo(10, 6);
    expect(drawingSize(open).height).toBeCloseTo(2, 6);
  });
});

describe('shapes that touch', () => {
  it('keeps a shape another one meets right at the middle of its longest side', () => {
    // Two blocks joined by a bar at half height: the bar touches the middle of each block's inner side.
    const d = drawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0H8V10H0Z M12 0H20V10H12Z M8 4.9H12V5.1H8Z"/></svg>');
    expect(d.shapes[0]?.loops).toHaveLength(3);
    expect(d.bounds.minX).toBeCloseTo(0, 6);
    expect(d.bounds.maxX).toBeCloseTo(20, 6);
  });
});

describe('colours for the filaments', () => {
  const shades = (fills: string[]) =>
    drawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(fills.length * 10)} 10">${fills.map((fill, i) => `<rect x="${String(i * 10)}" width="${String(i === 0 ? 10 : 9)}" height="10" fill="${fill}"/>`).join('')}</svg>`);

  it('merges fills that look the same, the larger area keeping its colour', () => {
    // Two blues off by one in a byte, as an export rounds them, and a red.
    const d = shades(['#1d71b8', '#1d71b9', '#e30613']);
    expect(drawingColours(d)).toEqual(['#1d71b8', '#e30613']);
  });

  it('brings a drawing down to a number of filaments by merging the nearest colours', () => {
    const d = shades(['#1d71b8', '#5bc0eb', '#e30613', '#ffd500']);
    expect(drawingColours(d)).toHaveLength(4);
    // The two blues are nearest; the first, larger one stays.
    expect(drawingColours(mergedColours(d, 3))).toEqual(['#1d71b8', '#e30613', '#ffd500']);
    expect(drawingColours(mergedColours(d, 2))).toHaveLength(2);
    expect(mergedColours(d, 9)).toBe(d);
  });
});

describe('backgrounds and frames', () => {
  const svg = (body: string) => drawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`);
  const star = '<path fill="#000000" d="M50 10L61 40H90L66 58L75 88L50 70L25 88L34 58L10 40H39Z"/>';

  it('leaves out a white sheet behind the logo and a thin frame around it, and says so', () => {
    const sheet = svg(`<rect width="100" height="100" fill="#ffffff"/>${star}`);
    expect(drawingColours(sheet)).toEqual(['#000000']);
    expect(sheet.skipped.backgrounds).toBe(1);
    expect(sheet.bounds.minY).toBeCloseTo(10, 3);
    // A frame drawn as a stroke along the edge, black like the star.
    const framed = svg(`<rect x="1" y="1" width="98" height="98" fill="none" stroke="#000000" stroke-width="2"/>${star}`);
    expect(framed.skipped.backgrounds).toBe(1);
    expect(framed.bounds.minX).toBeCloseTo(10, 3);
  });

  it('keeps a coloured plate, a light shape that is part of the logo, and a drawing that is only a sheet', () => {
    expect(svg(`<rect width="100" height="100" fill="#1d71b8"/>${star.replace('#000000', '#ffffff')}`).skipped.backgrounds).toBe(0);
    expect(svg(`<circle cx="50" cy="50" r="50" fill="#ffffff"/>${star}`).skipped.backgrounds).toBe(0);
    expect(svg('<rect width="100" height="100" fill="#ffffff"/>').shapes).toHaveLength(1);
  });
});

describe('near-cusps in curves (colour logo, 2026-11-10)', () => {
  it('moves a control point off its end, keeping the tangent, and leaves good curves alone', () => {
    // c2 on the end, as twemoji-fox writes it: c2 moves a tenth of the way towards c1.
    const close = (got: readonly number[], want: readonly number[]) => {
      want.forEach((value, i) => {
        expect(got[i]).toBeCloseTo(value, 9);
      });
    };
    const opened = openedControls([0, 0], [3, 3], [6, 0], [6, 0]);
    expect(opened.c1).toEqual([3, 3]);
    close(opened.c2, [5.7, 0.3]);
    close(openedControls([0, 0], [0, 0.001], [6, 3], [6, 0]).c1, [0.6, 0.3]);
    expect(openedControls([0, 0], [2, 3], [4, 3], [6, 0])).toEqual({ c1: [2, 3], c2: [4, 3] });
    // A straight piece with both controls on its ends stays as it is.
    expect(openedControls([0, 0], [0, 0], [6, 0], [6, 0])).toEqual({ c1: [0, 0], c2: [6, 0] });
    // Through the parser: "S" after a line takes the pen as its first control and is opened too.
    const [loop] = parsePathData('M0 0 L10 0 S20 10 20 0 Z');
    const curve = loop?.segments[1];
    expect(curve && 'c1' in curve ? curve.c1 : null).not.toEqual([10, 0]);
  });
});
