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

test('the user\'s Claude Code builds a part in SolidCraft through the gate proxy', async () => {
  // Uses the installed Claude Code with the user's own subscription; opt in separately with
  // PARTBUDDY_E2E_CLAUDE=1, because it spends subscription usage. SolidCraft runs as an own
  // instance with its own port and control folder and is closed without saving afterwards.
  test.skip(process.env.PARTBUDDY_E2E_CLAUDE !== '1', 'spends Claude usage; set PARTBUDDY_E2E_CLAUDE=1');
  test.setTimeout(360_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { ControlClient } = await import('../src/main/solidcraft/controlClient');
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-spike-'));
  const port = '7882';
  const launched = await launchApp({ isolated: false, env: { SOLIDCRAFT_CONTROL_DIR: controlDir, PARTBUDDY_SOLIDCRAFT_PORT: port } });
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · revision \d+/, { timeout: 90_000 });
    await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
    await page
      .getByRole('textbox', { name: 'Message to the assistant' })
      .fill('Build a 20 x 20 x 10 mm box as a new body (sketch a square on the XY plane, extrude it 10 mm). Then report its volume in mm³.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('tool-call').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 300_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(page.getByTestId('assistant-text').last()).toContainText(/4[ .,]?000/);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: test.info().outputPath('assistant-live.png') });
  } finally {
    await launched.close();
    // The design has changes, so SolidCraft would ask whether to save; this test instance is
    // closed without saving through its own control channel.
    try {
      const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
      const client = await ControlClient.open({ port: Number(port), token });
      await client.request('app.quit', { force: true }, 5000).catch(() => undefined);
      client.close();
    } catch {
      // Already closed.
    }
    rmSync(controlDir, { recursive: true, force: true });
  }
});

test('ChatGPT builds a part in SolidCraft with the user\'s plan', async () => {
  // Uses the ChatGPT sign-in stored in the Windows credential store; opt in with
  // PARTBUDDY_E2E_CHATGPT=1, because it spends ChatGPT plan usage. Own SolidCraft instance as above.
  test.skip(process.env.PARTBUDDY_E2E_CHATGPT !== '1', 'spends ChatGPT usage; set PARTBUDDY_E2E_CHATGPT=1');
  test.setTimeout(360_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { ControlClient } = await import('../src/main/solidcraft/controlClient');
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-spike-'));
  const port = '7883';
  const launched = await launchApp({ isolated: false, env: { SOLIDCRAFT_CONTROL_DIR: controlDir, PARTBUDDY_SOLIDCRAFT_PORT: port } });
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · revision \d+/, { timeout: 90_000 });
    await page.getByRole('radio', { name: 'ChatGPT' }).or(page.getByRole('button', { name: 'ChatGPT' })).click();
    await expect(page.getByTestId('agent-status')).toContainText('ChatGPT ·', { timeout: 30_000 });
    await page
      .getByRole('textbox', { name: 'Message to the assistant' })
      .fill('Build a 20 x 20 x 10 mm box as a new body (sketch a square on the XY plane, extrude it 10 mm). Then report its volume in mm³.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('tool-call').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden({ timeout: 300_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(page.getByTestId('assistant-text').last()).toContainText(/4[ .,]?000/);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: test.info().outputPath('chatgpt-live.png') });
  } finally {
    await launched.close();
    try {
      const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
      const client = await ControlClient.open({ port: Number(port), token });
      await client.request('app.quit', { force: true }, 5000).catch(() => undefined);
      client.close();
    } catch {
      // Already closed.
    }
    rmSync(controlDir, { recursive: true, force: true });
  }
});
