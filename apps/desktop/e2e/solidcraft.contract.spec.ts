import { expect, test } from '@playwright/test';

import { execFileSync } from 'node:child_process';

import { launchApp } from './launch';

/** Running processes with this image name (Windows). */
function countProcesses(image: string): number {
  const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return out.split(/\r?\n/).filter((line) => line.toLowerCase().startsWith(`"${image}"`)).length;
}

// Local contract test against the installed SolidCraft (ADR 0004). It uses the user's real
// control folder: it connects to a running SolidCraft or starts one. Opt in with
// PARTBUDDY_E2E_SOLIDCRAFT=1; CI has no SolidCraft.
test.skip(process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'needs SolidCraft; set PARTBUDDY_E2E_SOLIDCRAFT=1');

test('connects to a SolidCraft window the user opened and shows its design', async () => {
  // Needs a SolidCraft window the user opened with a design that has a body; without one PartBuddy
  // starts its own headless engine (ADR 0016). Opt in with PARTBUDDY_E2E_OPEN_WINDOW=1.
  test.skip(process.env.PARTBUDDY_E2E_OPEN_WINDOW !== '1', 'needs an open SolidCraft window with a body; set PARTBUDDY_E2E_OPEN_WINDOW=1');
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

test('starts SolidCraft without a window when none runs, and ends it on quit (ADR 0016)', async () => {
  // Own control folder and port, so the user's running SolidCraft is never used or touched.
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-owned-'));
  const windows = countProcesses('solidcraft.exe');
  const engines = countProcesses('solidcraft-cli.exe');
  const launched = await launchApp({ isolated: false, env: { SOLIDCRAFT_CONTROL_DIR: controlDir, PARTBUDDY_SOLIDCRAFT_PORT: '7881' } });
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · revision \d+/, { timeout: 30_000 });
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless');
    await expect(page.getByText('Tell the assistant what you need.')).toBeVisible();
    // No SolidCraft window was opened; the engine runs as solidcraft-cli.
    expect(countProcesses('solidcraft.exe')).toBe(windows);
    expect(countProcesses('solidcraft-cli.exe')).toBeGreaterThan(engines);
    await launched.close();
    await expect.poll(() => countProcesses('solidcraft-cli.exe'), { timeout: 15_000 }).toBe(engines);
  } finally {
    rmSync(controlDir, { recursive: true, force: true });
  }
});

test('an assistant step changes the headless design, and it is back after a restart', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-autosave-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7887',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    // The test double of Claude Code builds a box when the message says "box" (test/fakeClaude.mjs).
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  try {
    const first = await launchApp({ isolated: false, work, env });
    try {
      const { page } = first;
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
      await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
      await page.screenshot({ path: test.info().outputPath('headless-box.png') });
    } catch (error) {
      await first.page.screenshot({ path: test.info().outputPath('headless-failed.png') }).catch(() => undefined);
      throw error;
    } finally {
      await first.close();
    }

    const second = await launchApp({ isolated: false, work, env });
    try {
      await expect(second.page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
      await expect(second.page.getByTestId('design-name')).toHaveText('Untitled');
    } finally {
      await second.close();
    }
  } finally {
    // Electron may hold its profile a moment after closing.
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the user undoes, exports and opens the headless design in the SolidCraft window, and PartBuddy takes it back', async () => {
  test.setTimeout(180_000);
  const { existsSync, mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { ControlClient } = await import('../src/main/solidcraft/controlClient');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-handoff-'));
  const controlDir = join(work, 'control');
  const projects = join(work, 'projects');
  const port = '7889';
  const env = {
    SOLIDCRAFT_CONTROL_DIR: controlDir,
    PARTBUDDY_SOLIDCRAFT_PORT: port,
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const windows = countProcesses('solidcraft.exe');
  const launched = await launchApp({ isolated: false, work, env });
  const { page, app } = launched;
  try {
    const status = page.getByTestId('connection-status');
    await expect(status).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });

    // Undo and redo in the real engine.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('mesh-summary')).toBeHidden({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 15_000 });

    // Export as STL to a folder SolidCraft may not write itself: PartBuddy copies the file there.
    const target = join(work, 'elsewhere', 'box.stl');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
    }, target);
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: /STL/ }).click();
    await expect(page.getByTestId('notice')).toHaveText('Saved as box.stl', { timeout: 30_000 });
    // Binary STL: 80-byte header, triangle count, 50 bytes per triangle; a box has 12.
    const stl = readFileSync(target);
    expect(stl.readUInt32LE(80)).toBe(12);
    expect(stl.length).toBe(84 + 12 * 50);

    // Open in SolidCraft: saved to the project folder, opened in the window, followed live.
    await page.getByRole('button', { name: 'Open in SolidCraft' }).click();
    await expect(status).toHaveAttribute('data-engine', 'window', { timeout: 90_000 });
    expect(existsSync(join(projects, 'Untitled.sc'))).toBe(true);
    expect(countProcesses('solidcraft.exe')).toBe(windows + 1);
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('handoff-window.png') });

    // The user closes the window; PartBuddy runs the engine again with the same file.
    const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
    const client = await ControlClient.open({ port: Number(port), token });
    await client.request('app.quit', { force: true }, 5000).catch(() => undefined);
    client.close();
    await expect(status).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect.poll(() => countProcesses('solidcraft.exe'), { timeout: 15_000 }).toBe(windows);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('handoff-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
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
