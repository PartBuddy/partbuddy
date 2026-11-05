import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { execFileSync } from 'node:child_process';

import { launchApp } from './launch';

/** A renderer element in evaluate callbacks, typed loosely because this file is compiled for Node. */
interface LooseRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface LooseElement {
  getAttribute(name: string): string | null;
  firstElementChild: LooseElement | null;
  getBoundingClientRect(): LooseRect;
}

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
      await expect(second.page.getByTestId('design-name')).toHaveText('New part');
    } finally {
      await second.close();
    }
  } finally {
    // Electron may hold its profile a moment after closing.
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the user undoes, exports and opens the headless design in the SolidCraft window, and PartBuddy takes it back', async () => {
  test.skip(process.env.PARTBUDDY_E2E_SOLIDCRAFT_WINDOW !== '1', 'opens the SolidCraft window, which cannot be kept off screen; set PARTBUDDY_E2E_SOLIDCRAFT_WINDOW=1');
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

test('the dimension field changes the driving parameter directly, with a preview first (M1b)', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-dimension-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7891',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // The test double of Claude Code builds a 20 x 20 x 10 mm box.
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await page.waitForTimeout(800);

    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    const bar = page.getByTestId('selection-bar');
    // Pick edges along rows until one of the given length is selected.
    const pickEdge = async (length: string) => {
      for (let y = 0.3; y <= 0.75; y += 0.05) {
        for (let x = 0.2; x <= 0.8; x += 0.01) {
          await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
          // The bar may go between two reads when the click selected nothing; a short timeout keeps that from stalling.
          const kind = await bar.getAttribute('data-kind', { timeout: 500 }).catch(() => null);
          const text = kind === 'edge' ? await bar.textContent({ timeout: 500 }).catch(() => null) : null;
          if (text?.includes(length)) return true;
        }
      }
      return false;
    };
    expect(await pickEdge('20 mm'), 'a 20 mm edge').toBe(true);

    const field = page.getByTestId('dimension-field').getByRole('textbox');
    await expect(field).toHaveValue('20');
    await field.fill('32');
    // Length and width are both 20 mm: the probe in SolidCraft found the one that moves this edge.
    const status = page.getByTestId('dimension-status');
    await expect(status).toHaveAttribute('data-mode', 'direct', { timeout: 15_000 });
    await expect(status).toContainText(/Enter changes it directly: Box1 · (Length|Width)/);
    await page.screenshot({ path: test.info().outputPath('dimension-preview.png') });
    const revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await field.press('Enter');
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces');
    // The part has a 32 mm edge now, and Undo takes the change back.
    expect(await pickEdge('32 mm'), 'the changed 32 mm edge').toBe(true);
    await page.screenshot({ path: test.info().outputPath('dimension-applied.png') });

    // The work log (M2a): the assistant's box and the user's own change, each a card with a picture.
    const cards = page.getByTestId('step-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0).getByTestId('step-text')).toHaveText('Box 20 × 20 × 10 mm');
    await expect(cards.nth(1).getByRole('img', { name: 'By you' })).toBeVisible();
    await expect(cards.nth(1).getByTestId('step-text')).toHaveText(/Dimension Box1 · (Length|Width) set to 32 mm/);
    await expect(cards.nth(1)).toHaveAttribute('data-current', 'true');
    await expect(cards.nth(0).getByTestId('step-preview')).toHaveAttribute('src', /^data:image\//, { timeout: 10_000 });
    await expect(page.getByTestId('tool-call')).toBeHidden();
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .include('aside')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    // Back to the box: the user's change is undone, and its card can bring it back.
    await page.keyboard.press('Escape');
    await cards.nth(0).getByRole('button', { name: 'Go back to this state' }).click();
    await expect(cards.nth(1)).toHaveAttribute('data-state', 'undone', { timeout: 15_000 });
    await expect(cards.nth(0)).toHaveAttribute('data-current', 'true');
    expect(await pickEdge('20 mm'), 'back at the box').toBe(true);
    await page.screenshot({ path: test.info().outputPath('work-log-back.png') });
    const axeUndone = await new AxeBuilder({ page }).setLegacyMode(true).include('aside').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axeUndone.violations.map((v) => v.id)).toEqual([]);
    await page.keyboard.press('Escape');
    await cards.nth(1).getByRole('button', { name: 'Bring back this state' }).click();
    await expect(cards.nth(1)).toHaveAttribute('data-current', 'true', { timeout: 15_000 });
    expect(await pickEdge('32 mm'), 'the change is back').toBe(true);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.keyboard.press('Escape');
    expect(await pickEdge('20 mm'), 'back to 20 mm').toBe(true);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('dimension-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('two edges are selected with Ctrl, measured, and rounded together with a preview first (M1b-2)', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-actions-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7893',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await page.waitForTimeout(800);
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');

    // Find two different edges by hovering: the status bar names what is under the pointer.
    const edges: { x: number; y: number; name: string }[] = [];
    for (let y = 0.3; y <= 0.75 && edges.length < 6; y += 0.05) {
      for (let x = 0.2; x <= 0.8 && edges.length < 6; x += 0.01) {
        const point = { x: box.x + box.width * x, y: box.y + box.height * y };
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(30);
        const name = (await page.getByTestId('focus-name').count()) > 0 ? ((await page.getByTestId('focus-name').textContent()) ?? '') : '';
        if (name.includes('|') && !edges.some((edge) => edge.name === name)) edges.push({ ...point, name });
      }
    }
    // The HUD opens to the right of the first pick, so the second edge lies left of it.
    const first = edges.reduce((a, b) => (b.x > a.x ? b : a), edges[0] ?? { x: 0, y: 0, name: '' });
    const second = edges.find((edge) => edge.name !== first.name && edge.x < first.x - 40);
    if (!second) throw new Error(`no second edge left of the first among ${edges.map((edge) => edge.name).join(', ')}`);
    await page.mouse.click(first.x, first.y);
    await page.keyboard.down('Control');
    await page.mouse.click(second.x, second.y);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('hud-count')).toHaveText('2 elements selected');
    await expect(page.getByTestId('hud-measure')).toContainText(/Distance [\d.]+ mm/, { timeout: 15_000 });
    await expect(page.getByTestId('composer-selections')).toContainText('2 elements go with the message:');

    // Round both edges: a preview first, Enter builds it, each fillet adds one face.
    await page.getByTestId('action-fillet').click();
    await expect(page.getByTestId('action-status')).toHaveAttribute('data-ok', 'true', { timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath('fillet-preview.png') });
    await page.getByTestId('action-field').getByRole('textbox').press('Enter');
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 8 faces', { timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath('fillet-applied.png') });

  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('actions-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the structure tree hides a body, and the timeline suppresses, rolls back and returns to the end (M1c)', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-timeline-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7895',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    const summary = page.getByTestId('mesh-summary');
    await expect(summary).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(page.getByTestId('timeline-feature')).toHaveText(['Box1']);

    // A second step: round one edge through the HUD.
    await page.waitForTimeout(800);
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    let picked = false;
    for (let y = 0.3; y <= 0.75 && !picked; y += 0.05) {
      for (let x = 0.2; x <= 0.8 && !picked; x += 0.01) {
        await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
        picked = (await page.getByTestId('selection-bar').count()) > 0 && (await page.getByTestId('selection-bar').getAttribute('data-kind')) === 'edge';
      }
    }
    expect(picked, 'an edge').toBe(true);
    await page.getByTestId('action-fillet').click();
    await expect(page.getByTestId('action-status')).toHaveAttribute('data-ok', 'true', { timeout: 15_000 });
    await page.getByTestId('action-field').getByRole('textbox').press('Enter');
    await expect(summary).toContainText('1 body · 7 faces', { timeout: 15_000 });
    await expect(page.getByTestId('timeline-feature')).toHaveText(['Box1', 'Fillet1']);

    // Roll back to the box: the fillet is rolled back, the part has 6 faces, a marker shows where.
    await page.getByTestId('timeline-feature').first().click();
    await page.getByRole('menuitem', { name: 'Roll back to here' }).click();
    await expect(summary).toContainText('1 body · 6 faces', { timeout: 15_000 });
    await expect(page.getByTestId('timeline-feature').last()).toHaveAttribute('data-state', 'rolledBack');
    const handle = page.getByTestId('timeline-handle');
    await expect(handle).toHaveAttribute('data-position', '1');
    await page.screenshot({ path: test.info().outputPath('timeline-rolled-back.png') });
    await page.getByTestId('timeline-end').click();
    await expect(summary).toContainText('1 body · 7 faces', { timeout: 15_000 });
    await expect(handle).toHaveAttribute('data-position', '2');

    // The rollback bar: dragged left of the fillet it rolls the fillet back; the keyboard brings it to the end again.
    const fillet = await page.getByTestId('timeline-feature').last().boundingBox();
    const bar = await handle.boundingBox();
    if (!fillet || !bar) throw new Error('timeline not visible');
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(fillet.x - 2, bar.y + bar.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(summary).toContainText('1 body · 6 faces', { timeout: 15_000 });
    await expect(handle).toHaveAttribute('data-position', '1');
    await handle.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(summary).toContainText('1 body · 7 faces', { timeout: 15_000 });
    await expect(handle).toHaveAttribute('data-position', '2');

    // Suppress the fillet and activate it again.
    await page.getByTestId('timeline-feature').last().click();
    await page.getByRole('menuitem', { name: 'Suppress' }).click();
    await expect(page.getByTestId('timeline-feature').last()).toHaveAttribute('data-state', 'suppressed', { timeout: 15_000 });
    await expect(summary).toContainText('1 body · 6 faces');
    await page.getByTestId('timeline-feature').last().click();
    await page.getByRole('menuitem', { name: 'Activate again' }).click();
    await expect(summary).toContainText('1 body · 7 faces', { timeout: 15_000 });

    // Hide the body in the structure tree, then show it again.
    const body = page.getByTestId('structure-body');
    await expect(body).toHaveAttribute('data-visible', 'true');
    await page.getByRole('button', { name: 'Hide Body1' }).click();
    await expect(body).toHaveAttribute('data-visible', 'false', { timeout: 15_000 });
    await expect(summary).toBeHidden();
    await page.getByRole('button', { name: 'Show Body1' }).click();
    await expect(summary).toContainText('1 body · 7 faces', { timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath('structure-timeline.png') });
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('timeline-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a plan waits for Go: PartBuddy refuses building before the answer (M2a)', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-plan-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7897',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    // The test double shows a plan for "plan" and then tries to build anyway (test/fakeClaude.mjs).
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Make a plan first');
    await page.getByRole('button', { name: 'Send' }).click();
    const card = page.getByTestId('question-card');
    await expect(card).toHaveAttribute('data-kind', 'plan', { timeout: 30_000 });
    await expect(card.getByTestId('plan-steps')).toHaveText('Box 20 × 20 × 10 mm');
    await expect(page.getByTestId('assistant-text').last()).toHaveText('Plan shown; building waits for the answer.');
    await expect(page.getByTestId('step-card')).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('aside').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('plan-card.png') });

    await card.getByRole('button', { name: 'Go' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(page.getByTestId('step-card').getByTestId('step-text')).toHaveText('Box 20 × 20 × 10 mm');
    await expect(page.getByTestId('step-card').getByTestId('step-preview')).toHaveAttribute('src', /^data:image\//, { timeout: 10_000 });
    await expect(card.getByTestId('question-answered')).toHaveText('Approved, the assistant builds it');
    await expect(card.getByRole('button', { name: 'Go' })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('plan-approved.png') });
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('plan-failed.png') }).catch(() => undefined);
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
    await expect(page.getByTestId('tool-queries').or(page.getByTestId('step-card')).first()).toBeVisible({ timeout: 120_000 });
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
    await expect(page.getByTestId('tool-queries').or(page.getByTestId('step-card')).first()).toBeVisible({ timeout: 120_000 });
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

test('a note on a face stays with the design, out of the assistant\'s reach, and comes back after undo (M2b-1)', async () => {
  test.setTimeout(180_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-notes-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7899',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    // "notes" makes the test double read inspect_design and try an undo (test/fakeClaude.mjs).
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  let launched = await launchApp({ isolated: false, work, env });
  let { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await page.waitForTimeout(800);

    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    const bar = page.getByTestId('selection-bar');
    let picked = false;
    // The camera frames the new box first; then a few points across the middle, with time between
    // the clicks so that none counts as a double click.
    await page.waitForTimeout(1000);
    for (const [x, y] of [[0.59, 0.49], [0.68, 0.39], [0.5, 0.5], [0.75, 0.47], [0.62, 0.45]] as const) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.waitForTimeout(300);
      picked = (await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === 'face';
      if (picked) break;
    }
    expect(picked, 'a face of the box').toBe(true);
    const face = await page.getByTestId('selected-face').textContent();

    await page.getByTestId('hud-note').click();
    await page.getByTestId('note-new-text').fill('Wall 2 mm here');
    await page.getByTestId('note-new-save').click();
    const pin = page.getByTestId('note-pin');
    await expect(pin).toHaveCount(1, { timeout: 15_000 });
    const row = page.getByTestId('note-row');
    await expect(row).toContainText('Wall 2 mm here');
    await expect(row.getByTestId('note-status')).toHaveAttribute('data-status', 'attached');
    await expect(row.getByTestId('note-status')).toHaveAttribute('data-own', 'true');
    await expect(row).toContainText(face ?? '');
    await pin.click();
    await expect(page.getByTestId('note-card').getByTestId('note-text')).toHaveText('Wall 2 mm here');
    await page.screenshot({ path: test.info().outputPath('note-card.png') });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="structure"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.keyboard.press('Escape');

    // The assistant hears about the note with its next message, but inspect_design hides the
    // text, and its undo may not take the user's note away.
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Check the notes');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('assistant-text').last()).toHaveText('inspect hides the note; undo refused; the message quotes the note', { timeout: 30_000 });
    await expect(pin).toHaveCount(1);

    // The user's own Undo removes the note; PartBuddy offers it for restoring.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(pin).toHaveCount(0, { timeout: 15_000 });
    const restorable = page.getByTestId('notes-restorable');
    await expect(restorable).toContainText('1 note removed by undo or going back');
    await page.screenshot({ path: test.info().outputPath('note-restorable.png') });
    await restorable.getByTestId('note-restore').click();
    await expect(pin).toHaveCount(1, { timeout: 15_000 });
    await expect(restorable).toHaveCount(0);

    // The note is in the design file: after a restart it is there again, still the user's own.
    await page.waitForTimeout(2500);
    await launched.close();
    launched = await launchApp({ isolated: false, work, env });
    page = launched.page;
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(page.getByTestId('note-row')).toContainText('Wall 2 mm here', { timeout: 15_000 });
    await expect(page.getByTestId('note-row').getByTestId('note-status')).toHaveAttribute('data-own', 'true');
    await expect(page.getByTestId('note-pin')).toHaveCount(1);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('notes-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a loop drawn on the top face reaches the assistant as words and, when asked, as a picture (M2b-2)', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-drawing-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7903',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    // "What did I draw" makes the test double repeat how the drawing arrived (test/fakeClaude.mjs).
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');

    await page.getByTestId('pen').click();
    await expect(page.getByTestId('pen-hint')).toContainText('Draw on the view');
    // A small circle on the top face of the box (where the face pick of the notes test lands).
    const cx = box.x + box.width * 0.68;
    const cy = box.y + box.height * 0.39;
    const r = 22;
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    for (let i = 1; i <= 36; i += 1) {
      const a = (i / 36) * 2 * Math.PI;
      await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    await page.mouse.up();
    await expect(page.getByTestId('pen-hint')).toContainText('1 stroke goes to the assistant');
    await expect(page.getByTestId('composer-drawing')).toContainText('1 stroke goes along');
    // Drawing never selects anything.
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('drawing.png') });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('aside').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    await page.getByTestId('drawing-image').click();
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('What did I draw');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('assistant-text').last()).toHaveText('a loop on the top face with a picture', { timeout: 30_000 });
    await expect(page.getByTestId('message-drawing').last()).toHaveText('with drawing (1 stroke) and image');
    await expect(page.getByTestId('composer-drawing')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pen-hint')).toHaveCount(0);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('drawing-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the dimensions of the box show in the view, and its height changes through its label (M2b-3)', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-marks-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7905',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });

    await page.getByTestId('dimensions').click();
    const labels = page.getByTestId('mark-label');
    // Box1: length, width and height, each a label on the model.
    await expect(labels).toHaveCount(3, { timeout: 15_000 });
    await expect(labels).toHaveText(['20', '20', '10']);
    // The framing fits the box tightly: a label beside it lies off the view and waits until the
    // user zooms out, rather than covering the panel next to the view (UI upgrade step 10).
    const viewport = await page.getByTestId('viewport').boundingBox();
    if (viewport) await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
    await page.mouse.wheel(0, 800);
    const shown = () => page.getByTestId('mark-slot').evaluateAll((all) => (all as unknown as LooseElement[]).map((slot) => slot.getAttribute('data-shown')));
    // The width runs along the far side of the box, hidden by it in the iso view.
    await expect.poll(shown, { timeout: 10_000 }).toEqual(['shown', 'behind', 'shown']);
    await page.screenshot({ path: test.info().outputPath('dimensions.png') });

    await labels.nth(2).click();
    const field = page.getByTestId('mark-field');
    await expect(field).toHaveAttribute('data-mode', 'direct');
    await expect(page.getByTestId('mark-input')).toHaveValue('10');
    await page.getByTestId('mark-input').fill('15');
    await expect(page.getByTestId('mark-status')).toHaveAttribute('data-ok', 'true', { timeout: 15_000 });
    await expect(page.getByTestId('mark-status')).toHaveText('Preview in the view – Enter changes it directly');
    // While a value is tried, a slider weighs the part against the preview (UI upgrade step 13).
    await expect(page.getByTestId('compare')).toHaveAttribute('data-mode', 'preview');
    await page.screenshot({ path: test.info().outputPath('dimension-label-preview.png') });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="viewer"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.getByTestId('mark-input').press('Enter');

    await expect(labels).toHaveText(['20', '20', '15'], { timeout: 15_000 });
    const cards = page.getByTestId('step-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1).getByTestId('step-text')).toHaveText('Dimension Box1 · Height set to 15 mm');

    // Before/after: the box as it was (10 mm) fades into the new one (15 mm) along the slider.
    await page.getByTestId('compare-start').click();
    const slider = page.getByTestId('compare-slider').getByRole('slider');
    await expect(page.getByTestId('compare')).toHaveAttribute('data-mode', 'compare');
    await expect(slider).toHaveValue('0');
    await page.screenshot({ path: test.info().outputPath('compare-before.png') });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(slider).toHaveValue('100');
    await page.getByTestId('compare-close').click();
    await expect(page.getByTestId('compare')).toHaveCount(0);

    // "All" shows every dimension of the design; off hides them.
    await page.getByTestId('dimensions-all').click();
    await expect(labels).toHaveCount(3);
    await page.keyboard.press('m');
    await expect(labels).toHaveCount(0);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('dimensions-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the dimensions of the wall holder neither cover each other nor show through the part (UI upgrade step 10)', async () => {
  test.setTimeout(180_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-tidy-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7906',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build the wall holder');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('The wall holder is built.')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 30_000 });

    // The chat holds the whole build as one line that opens to its steps (UI upgrade, chat).
    const group = page.getByTestId('work-group');
    await expect(group).toHaveCount(1);
    await expect(page.getByTestId('work-summary')).toContainText(/\d+ steps/);
    await expect(page.getByTestId('work-summary')).toContainText('current state');
    const cards = group.getByTestId('step-card');
    expect(await cards.count()).toBeGreaterThan(6);
    await expect(cards.first()).toBeHidden();
    await page.screenshot({ path: test.info().outputPath('chat-folded.png') });
    await page.getByTestId('work-summary').click();
    await expect(cards.first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('chat-open.png') });
    await page.getByTestId('work-summary').click();

    await page.getByTestId('dimensions').click();
    await page.getByTestId('dimensions-all').click();
    const slots = page.getByTestId('mark-slot');
    // Every input of the three boxes, the two countersunk holes and the two fillets has a place on
    // the model: boxes on formula corners too, the countersink angle at its rim.
    await expect(slots).toHaveCount(17, { timeout: 20_000 });
    await expect(page.getByTestId('loose-dimensions')).toHaveCount(0);
    await expect.poll(() => slots.evaluateAll((all) => (all as unknown as LooseElement[]).every((slot) => slot.getAttribute('data-shown') !== null)), { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath('dimensions-all.png') });

    // Runs in the renderer; typed loosely because this file is compiled for Node.
    const layout = await slots.evaluateAll((found) => {
      const all = found as unknown as LooseElement[];
      const page = globalThis as unknown as { document: { querySelector(selector: string): LooseElement | null } };
      const viewer = page.document.querySelector('[data-testid="viewport"]')?.getBoundingClientRect();
      const shown = all.filter((slot) => slot.getAttribute('data-shown') === 'shown').flatMap((slot) => (slot.firstElementChild ? [slot.firstElementChild.getBoundingClientRect()] : []));
      const overlaps = shown.flatMap((a, i) => shown.slice(i + 1).filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).map(() => i));
      const outside = viewer ? shown.filter((r) => r.left < viewer.left || r.top < viewer.top || r.right > viewer.right || r.bottom > viewer.bottom).length : -1;
      return { shown: shown.length, behind: all.filter((slot) => slot.getAttribute('data-shown') === 'behind').length, overlaps: overlaps.length, outside };
    });
    expect(layout.overlaps).toBe(0);
    expect(layout.outside).toBe(0);
    expect(layout.shown).toBeGreaterThan(5);

    // Seen from the right, the dimensions on the far side of the part are hidden by it.
    await page.keyboard.press('3');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: test.info().outputPath('dimensions-all-right.png') });
    const behind = await slots.evaluateAll((all) => (all as unknown as LooseElement[]).filter((slot) => slot.getAttribute('data-shown') === 'behind').length);
    test.info().annotations.push({ type: 'layout', description: JSON.stringify({ ...layout, behindFromRight: behind }) });
    expect(behind).toBeGreaterThan(0);

    // The overhang view (UI upgrade step 12): the bottom of plate and hook lies on the bed, the
    // upper halves of the horizontal countersunk holes overhang and need support.
    await page.getByTestId('dimensions').click();
    await page.getByTestId('overhang').click();
    const legend = page.getByTestId('overhang-legend');
    await expect(legend).toBeVisible();
    expect(Number(await page.getByTestId('overhang-bed').getAttribute('data-area'))).toBeGreaterThan(2000);
    expect(Number(await page.getByTestId('overhang-support').getAttribute('data-area'))).toBeGreaterThan(0);
    await page.keyboard.press('0');
    await page.waitForTimeout(800);
    await page.screenshot({ path: test.info().outputPath('overhang.png') });
    await page.getByTestId('overhang').click();
    await expect(legend).toBeHidden();
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('tidy-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
