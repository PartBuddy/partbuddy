import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Polish round 3 (decided 2026-11-06): pictures of the start page, projects, versions and the first
// start, in German, light and dark, at a wide and a narrow window. Headless SolidCraft, no
// assistant. Each step is tried on its own; a step that fails is pictured as such and the round
// goes on. Only on request: PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'pictures for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900, port: '7925' },
  { name: 'narrow', width: 1100, height: 800, port: '7926' },
] as const;

for (const size of WIDTHS) {
  test(`start page, projects and first start (${size.name})`, async () => {
    test.setTimeout(420_000);
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-polish-home-'));
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
          PARTBUDDY_FIRST_START: '1',
          PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
        },
      });
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }, { width, height }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(width, height);
      }, size);

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

      // The first start, step by step, before the language switch (it starts in the system language).
      const setup = page.getByTestId('first-start');
      for (const index of [1, 2, 3, 4]) {
        await step(`0${String(index)}-first-start`, async () => {
          await expect(setup).toBeVisible({ timeout: 30_000 });
        });
        await setup.getByTestId('first-start-next').click().catch(() => undefined);
      }
      await setup.getByTestId('first-start-skip').click().catch(() => undefined);

      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 60_000 });
      await page.getByTestId('settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.getByTestId('settings-language').getByText('Deutsch').click();
      await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
      await page.keyboard.press('Escape');

      const home = page.getByTestId('home-page');
      await step('05-start-empty', async () => {
        await expect(home).toBeVisible();
      });
      for (const id of ['housing', 'hingedBox', 'cableClip']) {
        if ((await home.count()) === 0) await page.getByTestId('home-button').click();
        await home.locator(`[data-template="${id}"]`).click();
        await expect(home).toHaveCount(0, { timeout: 60_000 });
        await page.waitForTimeout(2500);
      }
      await step('06-start-projects', async () => {
        await page.getByTestId('home-button').click();
        await expect(home.getByTestId('home-tile')).not.toHaveCount(0);
        await page.waitForTimeout(800);
      });
      await step('07-start-search', async () => {
        await home.getByTestId('home-search').fill('Box');
        await page.waitForTimeout(400);
      });
      await step('08-start-no-match', async () => {
        await home.getByTestId('home-search').fill('Rakete');
        await expect(home.getByTestId('home-no-match')).toBeVisible();
      });
      await home.getByTestId('home-search').fill('');
      await home.getByTestId('home-tile').first().click();
      await expect(home).toHaveCount(0, { timeout: 60_000 });
      await step('09-project-menu', async () => {
        await page.getByTestId('project-menu').click();
        await page.waitForTimeout(300);
      });
      await step('10-rename', async () => {
        await page.getByTestId('project-rename').click();
        await expect(page.getByTestId('project-rename-dialog')).toBeVisible();
        await page.getByTestId('project-name-input').fill('a/b');
        await page.waitForTimeout(300);
      });
      await page.keyboard.press('Escape');
      await step('11-trash', async () => {
        await page.getByTestId('project-menu').click();
        await page.getByTestId('project-trash').click();
        await expect(page.getByTestId('project-trash-dialog')).toBeVisible();
      });
      await page.keyboard.press('Escape');
      await step('12-versions-empty', async () => {
        await page.getByTestId('versions-button').click();
        await expect(page.getByTestId('versions-dialog')).toBeVisible();
      });
      await step('13-versions', async () => {
        await page.getByTestId('version-name').fill('Erster Druck');
        await page.getByTestId('version-save').click();
        await expect(page.getByTestId('version')).not.toHaveCount(0);
      });
      await page.keyboard.press('Escape');
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}
