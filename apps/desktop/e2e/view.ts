import type { Page } from '@playwright/test';

type Vec3 = [number, number, number];

interface CameraWindow {
  document: {
    querySelector(selector: string): {
      __r3f?: () => { controls: { getPosition(out: unknown): { toArray(): Vec3 }; getTarget(out: unknown): { toArray(): Vec3 } } | null; camera: { position: { clone(): unknown } } };
    } | null;
  };
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
