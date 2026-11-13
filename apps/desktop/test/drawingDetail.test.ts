import { describe, expect, it } from 'vitest';

import { minimumWall, thinnestLine } from '@partbuddy/geometry';

import { detailCoarse, drawingDetail } from '../src/shared/drawingDetail';
import { parseDrawing } from '../src/shared/svgDrawing';

const drawing = (body: string) => {
  const read = parseDrawing(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">${body}</svg>`);
  if (!read.ok) throw new Error(read.detail);
  return read.drawing;
};

describe('details too fine to print', () => {
  it('passes plain shapes, square corners and a sharp star included', () => {
    expect(drawingDetail(drawing('<rect width="20" height="10"/>'), 20, 0.4)).toBeNull();
    expect(drawingDetail(drawing('<path d="M0 0H8V10H0Z M12 0H20V10H12Z"/>'), 20, 0.4)).toBeNull();
  });

  it('finds a stroke thinner than the nozzle and the width from which it prints', () => {
    // Two blocks joined by a bar 0.2 units high (off the blocks' middles): at 20 mm wide the bar is 0.2 mm.
    const detail = drawingDetail(drawing('<path d="M0 0H8V10H0Z M12 0H20V10H12Z M8 2.9H12V3.1H8Z"/>'), 20, 0.4);
    expect(detail?.places).toBe(1);
    expect(detail?.thinnest).toBeGreaterThan(0.15);
    expect(detail?.thinnest).toBeLessThan(0.25);
    // About 4.5 times as wide makes the bar two lines wide (0.9 mm at 0.4, and 10 % over).
    expect(detail?.stroke).toBe(minimumWall(0.4));
    expect(detail?.fineFrom).toBeGreaterThanOrEqual(90);
    expect(detail?.fineFrom).toBeLessThanOrEqual(110);
    // At that width nothing is too fine.
    expect(drawingDetail(drawing('<path d="M0 0H8V10H0Z M12 0H20V10H12Z M8 2.9H12V3.1H8Z"/>'), detail?.fineFrom ?? 0, 0.4)).toBeNull();
  });

  // Two blocks joined by a bar `bar` mm high (at 20 mm wide a unit is a millimetre), or parted by a slit `slit` mm wide.
  const bar = (high: number) => drawing(`<path d="M0 0H8V10H0Z M12 0H20V10H12Z M8 2.5H12V${String(2.5 + high)}H8Z"/>`);
  const slit = (wide: number) => drawing(`<path d="M0 0H${String(10 - wide / 2)}V10H0Z M${String(10 + wide / 2)} 0H20V10H${String(10 + wide / 2)}Z"/>`);

  it('holds a stroke to two lines and a gap to the narrowest line, on either side of each (audit T52)', () => {
    // 0.4 mm nozzle: a stroke needs 0.9 mm, a gap 0.42 mm. Before, both were held to the nozzle: 0.6 mm passed as a stroke.
    expect(drawingDetail(bar(0.6), 20, 0.4)?.places).toBe(1);
    expect(drawingDetail(bar(0.8), 20, 0.4)?.places).toBe(1);
    expect(drawingDetail(bar(1), 20, 0.4)).toBeNull();
    expect(drawingDetail(slit(0.3), 20, 0.4)?.places).toBe(1);
    expect(drawingDetail(slit(0.5), 20, 0.4)).toBeNull();
    // 0.6 mm nozzle: 1.35 mm and 0.62 mm.
    expect(drawingDetail(bar(1.2), 20, 0.6)?.stroke).toBe(minimumWall(0.6));
    expect(drawingDetail(bar(1.5), 20, 0.6)).toBeNull();
    expect(drawingDetail(slit(0.5), 20, 0.6)?.gap).toBe(thinnestLine(0.6));
    expect(drawingDetail(slit(0.7), 20, 0.6)).toBeNull();
  });

  it('finds a 0.45 mm stroke in a logo 400 mm wide, and says when the raster is too coarse to tell', () => {
    // The finding's case: the drawing at 400 mm, a bar 0.45 mm high (0.0225 units of the 20-unit drawing).
    expect(drawingDetail(bar(0.0225), 400, 0.4)?.places).toBe(1);
    // A pixel is a tenth of the nozzle up to 64 mm (1600 pixels); four pixels across the 0.42 mm gap up to 168 mm.
    expect(detailCoarse(bar(1), 20, 0.4)).toBeNull();
    expect(detailCoarse(bar(1), 168, 0.4)).toBeNull();
    expect(detailCoarse(bar(1), 169, 0.4)).toBeCloseTo(169 / 1600, 3);
    expect(detailCoarse(bar(1), 1000, 0.4)).toBe(0.625);
    // An empty width or nozzle says nothing.
    expect(detailCoarse(bar(1), 0, 0.4)).toBeNull();
    expect(detailCoarse(bar(1), 20, Number.NaN)).toBeNull();
  });

  it('finds a slit narrower than the nozzle, which would close up', () => {
    const detail = drawingDetail(drawing('<path d="M0 0H9.9V10H0Z M10.1 0H20V10H10.1Z"/>'), 20, 0.4);
    expect(detail?.places).toBe(1);
    expect(detail?.thinnest).toBeLessThan(0.3);
    // The marked pixels lie on the slit, in the middle of the picture.
    const mask = detail?.mask;
    if (!mask) throw new Error('no mask');
    const middle = Math.round(mask.pad + 10 / mask.mmPerPx);
    expect(mask.fine[Math.round(mask.height / 2) * mask.width + middle]).toBe(1);
  });
});
