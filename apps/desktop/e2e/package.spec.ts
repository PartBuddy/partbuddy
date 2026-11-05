import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { appDir } from './launch';

// The packaged app (B10) from `pnpm dist:dir`: it starts, shows its window and loads the native
// credential store from outside the asar. Opt in with PARTBUDDY_E2E_PACKAGED=1 after a build.
test.skip(process.env.PARTBUDDY_E2E_PACKAGED !== '1', 'needs dist/win-unpacked; set PARTBUDDY_E2E_PACKAGED=1');

test('the packaged app starts with its bundled main process and the native credential store (B10)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-packaged-'));
  const app = await electron.launch({
    executablePath: join(appDir, 'dist', 'win-unpacked', 'PartBuddy.exe'),
    args: ['--lang=en-US', `--user-data-dir=${join(work, 'profile')}`],
    env: {
      ...(process.env as Record<string, string>),
      PARTBUDDY_WINDOW_DISPLAY: 'offscreen',
      PARTBUDDY_CACHE_DIR: join(work, 'cache'),
      PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
      PARTBUDDY_FIRST_START: '0',
      PARTBUDDY_START_PAGE: '0',
      PARTBUDDY_UPDATES: '0',
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_AUTOSTART: '0',
      PARTBUDDY_SOLIDCRAFT_EXE: process.execPath,
      PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
      PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(appDir, 'test', 'fakeClaude.mjs')]),
    },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByTestId('title-bar')).toBeVisible({ timeout: 30_000 });
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
    // The assistant chip reads the ChatGPT sign-in through the credential store: the native module loaded.
    await page.getByTestId('agent-status').click();
    await page.getByTestId('agent-menu').getByText('ChatGPT', { exact: true }).click();
    await expect(page.getByTestId('agent-status')).toHaveText('ChatGPT · not signed in', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('settings').click();
    await page.getByTestId('settings-about').click();
    await expect(page.getByTestId('settings-version')).toHaveText(/^Version \d/);
    await page.screenshot({ path: test.info().outputPath('packaged.png') });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    rmSync(work, { recursive: true, force: true });
  }
});
