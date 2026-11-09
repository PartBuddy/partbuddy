import { describe, expect, it } from 'vitest';

import { drawingDetail } from '../src/shared/drawingDetail';
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
    // About twice as wide makes the bar a nozzle wide.
    expect(detail?.fineFrom).toBeGreaterThanOrEqual(36);
    expect(detail?.fineFrom).toBeLessThanOrEqual(48);
    // At that width nothing is too fine.
    expect(drawingDetail(drawing('<path d="M0 0H8V10H0Z M12 0H20V10H12Z M8 2.9H12V3.1H8Z"/>'), detail?.fineFrom ?? 0, 0.4)).toBeNull();
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
