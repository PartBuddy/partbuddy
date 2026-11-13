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
 * Counts pixels of the viewport close to a design-token colour (a `#rrggbb` custom property), or to any of
 * several, to see that the 3D view drew something in it. A screenshot taken already (`png`) is counted
 * again instead of a new one: on a loaded runner one shot of the view took seconds. The colour is read from the running renderer, so
 * the check follows the token and the theme. The PNG is decoded in the renderer; this file compiles for
 * Node, so the browser APIs are typed here.
 */
export async function countViewportPixels(page: Page, token: string | string[], tolerance = 40, options: { border?: number | undefined; png?: Buffer } = {}): Promise<number> {
  const png = options.png ?? (await page.getByTestId('viewport').screenshot());
  return page.evaluate(
    async ({ bytes, tokens, tolerance: limit, border }) => {
      const browser = globalThis as unknown as BrowserImaging;
      const style = browser.getComputedStyle(browser.document.documentElement);
      const colors = tokens.map((name) => {
        const color = style.getPropertyValue(name).trim();
        return [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
      });
      const bitmap = await browser.createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const context = new browser.OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      if (!context) return 0;
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      let count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // With a border, only the strip of that width along the edges of the view counts.
        if (border !== undefined) {
          const x = (i / 4) % bitmap.width;
          const y = Math.floor(i / 4 / bitmap.width);
          if (x >= border && y >= border && x < bitmap.width - border && y < bitmap.height - border) continue;
        }
        if (colors.some((rgb) => [0, 1, 2].every((c) => Math.abs((data[i + c] ?? 0) - (rgb[c] ?? 0)) < limit))) count += 1;
      }
      return count;
    },
    { bytes: [...png], tokens: typeof token === 'string' ? [token] : token, tolerance, border: options.border },
  );
}
