/* eslint-disable no-restricted-syntax -- SVG fills are the drawing's own data, not interface colours */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { drawingColours, drawingFacts, drawingPieces, drawingSvg, flatten, naturalWidth, parseDrawing, parsePathData, shapesOverlap, type Drawing, type Shape } from '../src/shared/svgDrawing';

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

  it('follows classes, style attributes, transforms, <use> and rounded corners, and leaves out strokes and text', () => {
    const d = drawing(fixture('illustrator.svg'));
    expect(drawingColours(d)).toEqual(['#1d71b8', '#ffd500', '#e30613']);
    expect(d.skipped).toEqual({ strokes: 2, texts: 1, images: 0 });
    // px without a unit: no physical size.
    expect(naturalWidth(d)).toBeNull();
    // From the rect at x 10 to the dot's right edge at 160.
    expect(d.bounds.minX).toBeCloseTo(10, 6);
    expect(d.bounds.maxX).toBeCloseTo(190, 6);
    expect(d.bounds.maxY).toBeCloseTo(100, 6);
    const facts = drawingFacts(d, 180);
    const area = (fill: string) => facts.colours.find((c) => c.fill === fill)?.area ?? 0;
    // A 80 × 80 square with 10 mm corners: 6400 − (4 − π)·100.
    expect(area('#1d71b8')).toBeCloseTo(6400 - (4 - Math.PI) * 100, 0);
    expect(area('#ffd500')).toBeCloseTo(3200, 0);
    expect(area('#e30613')).toBeCloseTo(Math.PI * 100, 0);
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
    expect(parseDrawing('<svg><line x2="10" y2="10" stroke="black"/></svg>')).toMatchObject({ ok: false, problem: 'empty' });
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
