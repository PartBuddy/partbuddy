import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Polish round 4 (decided 2026-11-06): pictures of the settings, the print profiles and check,
// export and the sharing package, in German, light and dark, at a wide and a narrow window. A
// template project in a headless SolidCraft, no assistant. Each step is tried on its own; a step
// that fails is pictured as such. Only on request: PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'pictures for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900, port: '7927' },
  { name: 'narrow', width: 1100, height: 800, port: '7928' },
] as const;

for (const size of WIDTHS) {
  test(`settings, print, export and sharing (${size.name})`, async () => {
    test.setTimeout(420_000);
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-polish-settings-'));
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
      };

      await page.getByTestId('settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.getByTestId('settings-language').getByText('Deutsch').click();
      await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
      for (const section of ['general', 'solidcraft', 'assistant', 'print', 'about']) {
        await step(`0-settings-${section}`, async () => {
          await page.getByTestId(`settings-${section}`).click();
          await page.waitForTimeout(400);
        });
      }
      await page.keyboard.press('Escape');

      const home = page.getByTestId('home-page');
      await home.locator('[data-template="housing"]').click();
      await expect(home).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId('mesh-summary')).toContainText('2', { timeout: 60_000 });
      await page.waitForTimeout(1500);

      await step('1-material-menu', async () => {
        await page.getByTestId('material-chip').click();
        await page.waitForTimeout(300);
      });
      await page.keyboard.press('Escape');
      await step('2-print-check', async () => {
        await page.getByTestId('print-check').click();
        await expect(page.getByTestId('print-check-panel')).toBeVisible();
      });
      await page.keyboard.press('Escape');
      await step('3-export-menu', async () => {
        await page.getByTestId('export').click();
        await expect(page.getByTestId('export-share')).toBeVisible();
      });
      await page.keyboard.press('Escape');
      await step('4-share', async () => {
        await page.getByTestId('export').click();
        await page.getByTestId('export-share').click();
        await page.waitForTimeout(6000);
      });
      await page.keyboard.press('Escape');
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}
