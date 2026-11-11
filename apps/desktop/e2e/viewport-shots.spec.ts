import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Pictures and measures of the 3D view for a before/after comparison (viewport CAD round,
// 2026-11-07): a one-body template (wall holder) and a two-body one (housing) in a headless
// SolidCraft, light and dark, plus frame time and draw calls while orbiting. Opt in with
// PARTBUDDY_VIEWPORT_SHOTS set to the folder the pictures and `measures.json` go to.
const folder = process.env.PARTBUDDY_VIEWPORT_SHOTS;
test.skip(!folder, 'needs SolidCraft; set PARTBUDDY_VIEWPORT_SHOTS to a folder');

const TEMPLATES = [
  { id: 'wallHolder', bodies: '1', port: '7961' },
  { id: 'housing', bodies: '6', port: '7962' },
] as const;

async function shoot(page: Page, name: string): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForTimeout(900);
    await page.getByTestId('viewer').screenshot({ path: join(folder ?? '', `${name}-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(300);
}

interface Tally {
  frames: number;
  calls: number;
  triangles: number;
  ms: number;
}

/** The browser side of the measure; this file compiles for Node, so the few browser APIs are typed here. */
interface MeasureWindow {
  document: { querySelector(selector: string): { __r3f?: () => { gl: Renderer; scene: unknown } } | null };
  performance: { now(): number };
  __tally?: Tally;
  __restore?: () => void;
}
interface Renderer {
  info: { render: { calls: number; triangles: number } };
  render: (scene: unknown, camera: unknown) => void;
  getContext(): { RGBA: number; UNSIGNED_BYTE: number; readPixels(x: number, y: number, w: number, h: number, format: number, type: number, out: Uint8Array): void };
}

/**
 * Orbits for two seconds and counts the renders of the main scene, with their draw calls,
 * triangles and time (the view cube and the axis triad render their own small scenes and are left out).
 */
async function measure(page: Page): Promise<{ frames: number; renderMs: number; callsPerFrame: number; trianglesPerFrame: number }> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  await page.evaluate(() => {
    const browser = globalThis as unknown as MeasureWindow;
    const state = browser.document.querySelector('[data-testid="viewport"] canvas')?.__r3f?.();
    if (!state) return;
    const { gl } = state;
    const tally: Tally = { frames: 0, calls: 0, triangles: 0, ms: 0 };
    const original = gl.render;
    browser.__tally = tally;
    // Put back after the measure: the patched render leaves the view blank on later requests.
    browser.__restore = () => {
      gl.render = original;
    };
    gl.render = (scene, camera) => {
      const started = browser.performance.now();
      original.call(gl, scene, camera);
      if (scene !== state.scene) return;
      // Wait for the GPU with a one-pixel read, so the time is the drawing and not only handing it over.
      const context = gl.getContext();
      context.readPixels(0, 0, 1, 1, context.RGBA, context.UNSIGNED_BYTE, new Uint8Array(4));
      tally.ms += browser.performance.now() - started;
      tally.frames += 1;
      // info resets at the start of each render, so after it holds this render's counts alone.
      tally.calls += gl.info.render.calls;
      tally.triangles += gl.info.render.triangles;
    };
  });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i < 40; i += 1) {
    await page.mouse.move(box.x + box.width * (0.5 + 0.2 * Math.sin(i / 6)), box.y + box.height * (0.5 + 0.1 * Math.cos(i / 6)));
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  const tally = await page.evaluate(() => {
    const browser = globalThis as unknown as MeasureWindow;
    browser.__restore?.();
    return browser.__tally ?? { frames: 0, calls: 0, triangles: 0, ms: 0 };
  });
  const per = (value: number) => (tally.frames ? Math.round((value / tally.frames) * 10) / 10 : 0);
  // With software WebGL (SwiftShader) the time is the drawing itself, on the CPU.
  return { frames: tally.frames, renderMs: per(tally.ms), callsPerFrame: per(tally.calls), trianglesPerFrame: per(tally.triangles) };
}

test('viewport before/after pictures and measures', async () => {
  test.setTimeout(600_000);
  mkdirSync(folder ?? '', { recursive: true });
  const measures: Record<string, unknown> = {};
  for (const template of TEMPLATES) {
    // The long path: SolidCraft refuses short (8.3) names such as ADMINI~1 in TEMP.
    const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'partbuddy-viewport-')));
    let launched: LaunchedApp | null = null;
    try {
      launched = await launchApp({
        isolated: false,
        work,
        env: {
          SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
          PARTBUDDY_SOLIDCRAFT_PORT: template.port,
          PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
          PARTBUDDY_START_PAGE: '1',
          PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
        },
      });
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
      });
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 60_000 });
      const home = page.getByTestId('home-page');
      await home.locator(`[data-template="${template.id}"]`).click();
      await expect(home).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId('mesh-summary')).toContainText(template.bodies, { timeout: 120_000 }).catch(async (error: unknown) => {
        await page.screenshot({ path: join(folder ?? '', `${template.id}-failed.png`) });
        throw error;
      });
      await page.waitForTimeout(1500);
      await shoot(page, `${template.id}-1-iso`);
      measures[template.id] = await measure(page);
      await page.keyboard.press('0');
      await page.waitForTimeout(1200);
      const view = await page.getByTestId('viewport').boundingBox();
      if (view) await page.mouse.click(view.x + view.width * 0.5, view.y + view.height * 0.5);
      await page.waitForTimeout(600);
      await shoot(page, `${template.id}-2-pick`);
      await page.keyboard.press('Escape');
      // Extra views a later round adds (plate, assembly); missing ones are skipped.
      if ((await page.getByTestId('view-plate').count()) > 0) {
        await page.getByTestId('view-plate').click();
        await expect(page.getByTestId('plate-label')).toContainText(/Plate 1 of/, { timeout: 30_000 });
        await page.waitForTimeout(1500);
        await shoot(page, `${template.id}-3-plate`);
        await page.getByTestId('view-assembled').click();
        await page.waitForTimeout(1000);
        await page.getByTestId('explode').click();
        await page.waitForTimeout(1500);
        await shoot(page, `${template.id}-4-exploded`);
        await page.getByTestId('explode').click();
        await page.getByTestId('assembly').click();
        await page.waitForTimeout(1200);
        await page.getByTestId('assembly-play').click();
        await shoot(page, `${template.id}-5-assembly`);
        await page.getByTestId('assembly').click();
        await page.waitForTimeout(800);
      }
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  }
  writeFileSync(join(folder ?? '', 'measures.json'), JSON.stringify(measures, null, 2));
});
