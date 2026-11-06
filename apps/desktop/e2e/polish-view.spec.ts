import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Polish round 2 (decided 2026-11-06): pictures of the 3D view and the editing tools, in German,
// light and dark, at a wide and a narrow window. A template project with two bodies and parameters
// in a headless SolidCraft; no assistant runs. Each step is tried on its own; a step that fails is
// pictured as such and the round goes on. Only on request: PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'pictures for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900, port: '7923' },
  { name: 'narrow', width: 1100, height: 800, port: '7924' },
] as const;

/** Spots in the viewport where the housing usually shows a face. */
const SPOTS = [
  [0.5, 0.5],
  [0.45, 0.4],
  [0.55, 0.6],
  [0.4, 0.55],
] as const;

async function pickFace(page: Page): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const bar = page.getByTestId('selection-bar');
  for (const [x, y] of SPOTS) {
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(400);
    if ((await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === 'face') return;
  }
  throw new Error('no face found');
}

for (const size of WIDTHS) {
  test(`3D view and editing in every state (${size.name})`, async () => {
    test.setTimeout(420_000);
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-polish-view-'));
    let launched: LaunchedApp | null = null;
    try {
      launched = await launchApp({
        isolated: false,
        work,
        env: {
          SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
          PARTBUDDY_SOLIDCRAFT_PORT: size.port,
          PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
          PARTBUDDY_START_PAGE: '1',
          PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
        },
      });
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }, { width, height }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(width, height);
      }, size);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 60_000 });
      await page.getByTestId('settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.getByTestId('settings-language').getByText('Deutsch').click();
      await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
      await page.keyboard.press('Escape');

      const shot = async (name: string) => {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.waitForTimeout(500);
          await page.screenshot({ path: test.info().outputPath(`${name}-${size.name}-${scheme}.png`) });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      };
      const step = async (name: string, run: () => Promise<void>) => {
        try {
          await run();
          await shot(name);
        } catch (error) {
          await page.screenshot({ path: test.info().outputPath(`${name}-${size.name}-failed.png`) }).catch(() => undefined);
          console.log(`polish step ${name} failed: ${(error as Error).message.split('\n')[0] ?? ''}`);
        }
        await page.keyboard.press('Escape');
      };

      const home = page.getByTestId('home-page');
      await home.locator('[data-template="housing"]').click();
      await expect(home).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId('mesh-summary')).toContainText('2', { timeout: 60_000 });

      await step('01-view', async () => {
        await page.waitForTimeout(1000);
      });
      await step('02-face', () => pickFace(page));
      await step('03-fillet', async () => {
        await pickFace(page);
        await page.getByTestId('action-fillet').click();
        await expect(page.getByTestId('action-field')).toBeVisible();
        await page.waitForTimeout(1500);
      });
      await step('04-measure', async () => {
        await pickFace(page);
        await page.getByTestId('hud-measure').click();
        await page.waitForTimeout(1000);
      });
      await step('05-blocks', async () => {
        await pickFace(page);
        await page.getByTestId('action-block').click();
        await expect(page.getByTestId('block-panel')).toBeVisible();
      });
      await step('06-parts', async () => {
        await pickFace(page);
        await page.getByTestId('action-part').click();
        await expect(page.getByTestId('part-panel')).toBeVisible();
      });
      await step('07-dimensions', async () => {
        await page.getByTestId('dimensions-all').click();
        await page.waitForTimeout(1000);
      });
      await page.getByTestId('dimensions-all').click().catch(() => undefined);
      await step('08-parameter-preview', async () => {
        const field = page.getByTestId('parameters').getByRole('textbox').first();
        await field.fill('100');
        await page.waitForTimeout(1500);
      });
      await step('09-timeline', async () => {
        await page.getByTestId('timeline').click();
        await page.waitForTimeout(500);
      });
      await step('10-section', async () => {
        await page.getByTestId('section').click();
        await expect(page.getByTestId('section-panel')).toBeVisible();
      });
      await page.getByTestId('section').click().catch(() => undefined);
      await step('11-explode', async () => {
        await page.getByTestId('explode').click();
        await expect(page.getByTestId('explode-panel')).toBeVisible();
        await page.getByTestId('explode-amount').fill('0.8').catch(() => undefined);
        await page.waitForTimeout(800);
      });
      await page.getByTestId('explode').click().catch(() => undefined);
      await step('12-display-mode', async () => {
        await page.getByTestId('display-mode').click();
        await page.waitForTimeout(500);
      });
      await step('13-projection', async () => {
        await page.getByTestId('projection').click();
        await page.waitForTimeout(800);
      });
      await step('14-structure', async () => {
        await page.getByTestId('structure').hover();
      });
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}
