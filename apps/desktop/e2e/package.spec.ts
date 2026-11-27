import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { appDir } from './launch';

// The packaged app (B10) from `dist:dir` or `dist:linux:dir`: it starts, shows its window and loads the native
// credential store from outside the asar. Opt in with PARTBUDDY_E2E_PACKAGED=1 after a build.
test.skip(process.env.PARTBUDDY_E2E_PACKAGED !== '1', 'needs a packaged app; set PARTBUDDY_E2E_PACKAGED=1');

const executablePath = process.env.PARTBUDDY_E2E_EXECUTABLE ?? (process.platform === 'linux'
  ? join(appDir, 'dist', 'linux-unpacked', 'partbuddy')
  : join(appDir, 'dist', 'win-unpacked', 'PartBuddy.exe'));

test('the packaged app starts with its bundled main process and the native credential store (B10)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-packaged-'));
  const launch = () => electron.launch({
    executablePath,
    chromiumSandbox: process.platform === 'linux',
    // Exercise the normal startup path, including the app's own choice of Linux display backend.
    args: ['--lang=en-US', `--user-data-dir=${join(work, 'profile')}`],
    env: {
      ...(process.env as Record<string, string>),
      PARTBUDDY_WINDOW_DISPLAY: 'offscreen',
      PARTBUDDY_CACHE_DIR: join(work, 'cache'),
      PARTBUDDY_LOG_FILE: join(work, 'partbuddy.log'),
      PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
      PARTBUDDY_FIRST_START: '0',
      PARTBUDDY_START_PAGE: '0',
      PARTBUDDY_UPDATES: '0',
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_AUTOSTART: '0',
      PARTBUDDY_SOLIDCRAFT_EXE: process.execPath,
      PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
      PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(appDir, 'test', 'fakeClaude.mjs')]),
      PARTBUDDY_OPENCODE_COMMAND: JSON.stringify([process.execPath, join(appDir, 'test', 'fakeOpenCode.mjs')]),
    },
  });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByTestId('title-bar')).toBeVisible({ timeout: 30_000 });
    // A renderer can load while its native Wayland window stays hidden (NVIDIA startup regression).
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)).toBe(true);
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true);
    if (process.platform === 'linux') expect(await app.evaluate(({ app: electronApp }) => electronApp.commandLine.hasSwitch('no-sandbox'))).toBe(false);
    // The licence texts of the bundled libraries lie next to the asar (ADR 0007).
    const resources = await app.evaluate(() => process.resourcesPath);
    const notices = readFileSync(join(resources, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
    expect(notices).toContain('react-aria-components');
    expect(notices).toContain('Zoo Design Studio');
    // A read alone hides an unavailable credential backend. Exercise the packaged native module
    // against the desktop's credential service, using a unique entry that is always removed.
    expect(await app.evaluate(({ app: electronApp }, account) => {
      const { createRequire } = process.getBuiltinModule('module');
      const { Entry } = createRequire(`${electronApp.getAppPath()}/package.json`)('@napi-rs/keyring') as typeof import('@napi-rs/keyring');
      const entry = new Entry('PartBuddy-e2e', account);
      try {
        entry.setSecret(Buffer.from('packaged credential round trip'));
        const secret = entry.getSecret();
        return secret === null ? null : Buffer.from(secret).toString('utf8');
      } finally {
        entry.deleteCredential();
      }
    }, `packaged-${process.pid}-${Date.now()}`)).toBe('packaged credential round trip');
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
    await app.close();
    app = await launch();
    const restarted = await app.firstWindow();
    await expect(restarted.getByTestId('agent-status')).toHaveText('ChatGPT · not signed in', { timeout: 15_000 });
    await restarted.getByTestId('settings').click();
    await restarted.getByTestId('settings-assistant').click();
    await restarted.getByTestId('settings-reset-assistant').click();
    await restarted.getByTestId('settings-reset-go').click();
    await expect(restarted.getByTestId('agent-status')).toContainText('Claude Code');
  } finally {
    await app.close();
    rmSync(work, { recursive: true, force: true });
  }
});
