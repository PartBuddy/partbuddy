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

interface ProgramWindow {
  linkedPrograms?: number;
  WebGL2RenderingContext: { prototype: { linkProgram: (this: unknown, program: unknown) => void } };
}

/**
 * Counts the shader programs every WebGL context of the window links from now on, the view's and the start page
 * picture's. In software WebGL (CI) linking one took a quarter of a second of the renderer, so a revision that
 * compiled them again held up every click (13 November 2026).
 */
export async function countLinkedPrograms(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const browser = globalThis as unknown as ProgramWindow;
    if (browser.linkedPrograms === undefined) {
      const link = browser.WebGL2RenderingContext.prototype.linkProgram;
      browser.WebGL2RenderingContext.prototype.linkProgram = function (this: unknown, program: unknown) {
        browser.linkedPrograms = (browser.linkedPrograms ?? 0) + 1;
        link.call(this, program);
      };
    }
    browser.linkedPrograms = 0;
  });
  return () => page.evaluate(() => (globalThis as unknown as ProgramWindow).linkedPrograms ?? 0);
}
