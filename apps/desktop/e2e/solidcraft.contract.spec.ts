import { expect, test } from '@playwright/test';

import { launchApp } from './launch';

// Local contract test against the installed SolidCraft (ADR 0004). It uses the user's real
// control folder: it connects to a running SolidCraft or starts one. Opt in with
// PARTBUDDY_E2E_SOLIDCRAFT=1; CI has no SolidCraft.
test.skip(process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'needs SolidCraft; set PARTBUDDY_E2E_SOLIDCRAFT=1');

test('connects to SolidCraft and shows its design', async () => {
  const launched = await launchApp({ isolated: false });
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · revision \d+/, { timeout: 90_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('face', { timeout: 60_000 });
    // Give WebGL a moment to draw the first frames before the evidence screenshot.
    await page.waitForTimeout(2000);
    await page.screenshot({ path: test.info().outputPath('solidcraft-live.png') });
  } finally {
    await launched.close();
  }
});

test('starts SolidCraft when none runs and closes it again on quit', async () => {
  // Own control folder and port: SolidCraft inherits SOLIDCRAFT_CONTROL_DIR from PartBuddy, so
  // this instance never touches the user's running SolidCraft.
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-owned-'));
  const port = '7881';
  const launched = await launchApp({
    isolated: false,
    env: { SOLIDCRAFT_CONTROL_DIR: controlDir, PARTBUDDY_SOLIDCRAFT_PORT: port },
  });
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · revision \d+/, { timeout: 90_000 });
    await expect(page.getByText('No body in the design')).toBeVisible({ timeout: 30_000 });
    const pid = Number.parseInt(readFileSync(join(controlDir, `${port}.pid`), 'utf8'), 10);
    await launched.close();
    await expect
      .poll(
        () => {
          try {
            process.kill(pid, 0);
            return 'running';
          } catch {
            return 'exited';
          }
        },
        { timeout: 30_000 },
      )
      .toBe('exited');
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
  }
});
