import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp } from './launch';

// Pictures for the UI upgrade (2026-11-07): the control gallery (`?gallery`, every control in every
// state) and the screens of the app that show them, light and dark. Opt in with PARTBUDDY_UI_SHOTS
// set to the folder the pictures go to; runs against the fake SolidCraft, so it works on any build
// (an old build without the gallery pictures the screens only).
const folder = process.env.PARTBUDDY_UI_SHOTS;
test.skip(!folder, 'pictures for the UI upgrade; set PARTBUDDY_UI_SHOTS to a folder');

async function shoot(page: Page, name: string, fullPage = false): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(folder ?? '', `${name}-${colorScheme}.png`), fullPage });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

test('control gallery and screens, light and dark', async () => {
  test.setTimeout(180_000);
  const launched = await launchApp({ env: { PARTBUDDY_START_PAGE: '1' } });
  const { app, page } = launched;
  try {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    });
    await expect(page.getByTestId('home-search')).toBeVisible({ timeout: 30_000 });
    await shoot(page, 'home');
    await page.getByTestId('home-button').click();
    await expect(page.getByTestId('composer')).toBeVisible();
    await shoot(page, 'work');

    // Print profiles (fields with units, list, tabs) and the settings (radios, checkbox, tabs).
    await page.getByTestId('material-chip').click();
    await page.waitForTimeout(400);
    await shoot(page, 'menu');
    await page.getByTestId('print-profiles-open').click();
    await page.waitForTimeout(500);
    await shoot(page, 'profiles');
    await page.keyboard.press('Escape');
    await page.getByTestId('settings').click();
    await page.waitForTimeout(500);
    await shoot(page, 'settings');
    await page.keyboard.press('Escape');

    const base = page.url().split('?')[0] ?? '';
    await page.goto(`${base}?gallery`);
    if (await page.getByTestId('ui-gallery').waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await shoot(page, 'gallery', true);
    }
  } finally {
    await launched.close();
  }
});
