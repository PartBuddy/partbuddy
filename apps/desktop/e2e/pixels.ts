import type { Page } from '@playwright/test';

interface Canvas2d {
  drawImage(image: unknown, x: number, y: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
}

interface BrowserImaging {
  document: { documentElement: unknown };
  getComputedStyle(element: unknown): { getPropertyValue(name: string): string };
  createImageBitmap(blob: Blob): Promise<{ width: number; height: number }>;
  OffscreenCanvas: new (width: number, height: number) => { getContext(kind: '2d'): Canvas2d | null };
}

/**
 * Counts pixels of the viewport close to a design-token colour (a `#rrggbb` custom property), to
 * see that the 3D view drew something in it. The colour is read from the running renderer, so
 * the check follows the token and the theme. The PNG is decoded in the renderer; this file compiles for
 * Node, so the browser APIs are typed here.
 */
export async function countViewportPixels(page: Page, token: string, tolerance = 40): Promise<number> {
  const png = await page.getByTestId('viewport').screenshot();
  return page.evaluate(
    async ({ bytes, token: name, tolerance: limit }) => {
      const browser = globalThis as unknown as BrowserImaging;
      const color = browser.getComputedStyle(browser.document.documentElement).getPropertyValue(name).trim();
      const rgb = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
      const bitmap = await browser.createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const context = new browser.OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) return 0;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if ([0, 1, 2].every((c) => Math.abs((data[i + c] ?? 0) - (rgb[c] ?? 0)) < limit)) count += 1;
      }
      return count;
    },
    { bytes: [...png], token, tolerance },
  );
}
