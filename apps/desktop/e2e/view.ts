import type { Page } from '@playwright/test';

type Vec3 = [number, number, number];

interface CameraWindow {
  document: {
    querySelector(selector: string): {
      __r3f?: () => { controls: { getPosition(out: unknown): { toArray(): Vec3 }; getTarget(out: unknown): { toArray(): Vec3 } } | null; camera: { position: { clone(): unknown } } };
    } | null;
  };
}

/** Waits until the camera stands still, e.g. after it framed a part that just arrived (at most `timeoutMs`). */
export async function cameraSettled(page: Page, timeoutMs = 5000): Promise<void> {
  const end = Date.now() + timeoutMs;
  let last = JSON.stringify(await cameraOf(page));
  while (Date.now() < end) {
    await page.waitForTimeout(250);
    const now = JSON.stringify(await cameraOf(page));
    if (now === last && now !== 'null') return;
    last = now;
  }
}

/** Where the 3D view's camera stands and looks at, read from the canvas (Viewer exposes its R3F state). */
export async function cameraOf(page: Page): Promise<{ position: Vec3; target: Vec3 } | null> {
  return page.evaluate(() => {
    const browser = globalThis as unknown as CameraWindow;
    const state = browser.document.querySelector('[data-testid="viewport"] canvas')?.__r3f?.();
    if (!state?.controls) return null;
    const scratch = state.camera.position.clone();
    const position = state.controls.getPosition(scratch).toArray();
    const target = state.controls.getTarget(scratch).toArray();
    return { position, target };
  });
}

/** What {@link watchWebGl} counted since it started. */
export interface WebGlCounts {
  /** Shader programs linked, by any WebGL context of the window. */
  linked: number;
  /** Start page pictures drawn: PNGs read from a canvas outside the page (thumbnail.ts). */
  pictures: number;
  /** WebGL contexts lost (the GPU watchdog), which make every program be linked again. */
  lost: number;
}

interface WebGlWindow {
  webGlCounts?: WebGlCounts;
  addEventListener(type: string, listener: (event: { target: unknown }) => void, capture: boolean): void;
  WebGL2RenderingContext: { prototype: { linkProgram: (this: unknown, program: unknown) => void } };
  HTMLCanvasElement: {
    prototype: {
      toDataURL: (this: WebGlCanvas, type?: string, quality?: unknown) => string;
    };
  };
}

interface WebGlCanvas {
  isConnected: boolean;
  getContext(kind: 'webgl2'): { isContextLost(): boolean } | null;
}

/**
 * Counts from now on what the window's WebGL does: programs linked, start page pictures drawn and contexts lost.
 * In software WebGL (CI) linking one program took a quarter of a second of the renderer, so a revision that
 * compiled them again held up every click (13 November 2026). The picture's canvas is outside the page, so
 * its context loss is read when it is drawn.
 */
export async function watchWebGl(page: Page): Promise<() => Promise<WebGlCounts>> {
  await page.evaluate(() => {
    const browser = globalThis as unknown as WebGlWindow;
    if (browser.webGlCounts) return;
    const counts: WebGlCounts = { linked: 0, pictures: 0, lost: 0 };
    browser.webGlCounts = counts;
    const link = browser.WebGL2RenderingContext.prototype.linkProgram;
    browser.WebGL2RenderingContext.prototype.linkProgram = function (this: unknown, program: unknown) {
      counts.linked += 1;
      link.call(this, program);
    };
    const read = browser.HTMLCanvasElement.prototype.toDataURL;
    browser.HTMLCanvasElement.prototype.toDataURL = function (this: WebGlCanvas, type?: string, quality?: unknown) {
      // The step previews read WebP and the sketch pad draws in 2D; only the picture reads a PNG of a WebGL canvas.
      const gl = type === 'image/png' && !this.isConnected ? this.getContext('webgl2') : null;
      if (gl) {
        counts.pictures += 1;
        if (gl.isContextLost()) counts.lost += 1;
      }
      return read.call(this, type, quality);
    };
    browser.addEventListener('webglcontextlost', () => (counts.lost += 1), true);
  });
  return () => page.evaluate(() => ({ ...(globalThis as unknown as WebGlWindow).webGlCounts ?? { linked: 0, pictures: 0, lost: 0 } }));
}
