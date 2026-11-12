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
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · Revision \d+/, { timeout: 90_000 });
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
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · Revision \d+/, { timeout: 30_000 });
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
      await expect(page.getByTestId('assistant-text').last()).toHaveText('The design has one body.');
      await page.screenshot({ path: test.info().outputPath('headless-box.png') });
      // The conversation is written next to the design a second after the chat went quiet.
      await page.waitForTimeout(2000);
    } catch (error) {
      await first.page.screenshot({ path: test.info().outputPath('headless-failed.png') }).catch(() => undefined);
      throw error;
    } finally {
      await first.close();
    }

    const second = await launchApp({ isolated: false, work, env });
    try {
      await expect(second.page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
      // The first body gave the design a project named "Part" (B2).
      await expect(second.page.getByTestId('design-name')).toHaveText('Part');
      // The conversation came back with the design, ending in a line; its step is read only.
      await expect(second.page.getByText('Build a box')).toBeVisible();
      await expect(second.page.getByTestId('earlier-session')).toBeVisible();
      await expect(second.page.getByTestId('step-card')).toHaveCount(1);
      await expect(second.page.getByTestId('step-card').getByRole('button', { name: 'Go back to this state' })).toHaveCount(0);
      await second.page.screenshot({ path: test.info().outputPath('chat-restored.png') });
      // A reopened design shows the rollback bar right after its last step from the first frame.
      const handle = second.page.getByTestId('timeline-handle');
      await expect(handle).toBeVisible();
      const last = await second.page.getByTestId('timeline-feature').last().boundingBox();
      const bar = await handle.boundingBox();
      // Its 24 px target starts where the last step ends (audit AX-02), so its middle is 12 px on.
      expect(bar && last ? Math.abs(bar.x + bar.width / 2 - (last.x + last.width + 12)) : 99).toBeLessThan(1.5);
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
    // The first save names the new part after its project (B2) and mirrors it once more; picks wait for that.
    await expect(page.getByTestId('design-name')).toHaveText('Part', { timeout: 15_000 });
    await page.waitForTimeout(800);

    // Two parallel faces: top and bottom are 10 mm apart, and only the box's height moves them.
    type Probe = { partbuddy: { design: { probeDimension(probe: unknown): Promise<{ mode: string; label?: string }> } } };
    const spacing = await page.evaluate(() =>
      (globalThis as unknown as Probe).partbuddy.design.probeDimension({ target: { measure: 'distance', body: 'Body1', faces: ['F1:+z', 'F1:-z'] }, current: 10, value: 14 }),
    );
    expect(spacing).toMatchObject({ mode: 'direct', label: 'Box1 · Height' });

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

    // The drag arrow (dimension round, step 4): pulled out along its line, the field follows in whole
    // mm, and let go, SolidCraft gets the new value.
    const arrow = page.getByTestId('dimension-arrow');
    await expect(arrow).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('dimension-arrow.png') });
    const style = (await arrow.locator('div').first().getAttribute('style')) ?? '';
    const turn = Number(/rotate\((-?[\d.e-]+)rad\)/.exec(style)?.[1] ?? Number.NaN);
    expect(Number.isFinite(turn), 'the arrow faces its edge on screen').toBe(true);
    const grip = await arrow.boundingBox();
    if (!grip) throw new Error('arrow not visible');
    const [gx, gy] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
    const dragged = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(gx + Math.cos(turn) * 6 * i, gy + Math.sin(turn) * 6 * i);
    const longer = Number(await field.inputValue());
    expect(longer, 'the field follows the arrow').toBeGreaterThan(32);
    expect(Number.isInteger(longer)).toBe(true);
    await page.mouse.up();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', dragged ?? '', { timeout: 15_000 });
    expect(await pickEdge(`${longer} mm`), 'the dragged edge').toBe(true);

    // The work log (M2a): the assistant's box and the user's own change, each a card with a picture.
    const cards = page.getByTestId('step-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0).getByTestId('step-text')).toHaveText('Box 20 × 20 × 10 mm');
    await expect(cards.nth(1).getByRole('img', { name: 'By you' })).toBeVisible();
    await expect(cards.nth(1).getByTestId('step-text')).toHaveText(/Dimension Box1 · (Length|Width) set to 32 mm/);
    await expect(cards.nth(2).getByTestId('step-text')).toHaveText(new RegExp(`Dimension Box1 · (Length|Width) set to ${longer} mm`));
    await expect(cards.nth(2)).toHaveAttribute('data-current', 'true');
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
    await page.getByTestId('undo').click();
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
        const name = (await page.getByTestId('focus-name').count()) > 0 ? ((await page.getByTestId('focus-name').getAttribute('data-name')) ?? '') : '';
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
    // The first save names the new part after its project (B2) and mirrors it once more; picks wait for that.
    await expect(page.getByTestId('design-name')).toHaveText('Part', { timeout: 15_000 });

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
    // While held, the bar follows the pointer and nothing is rolled back yet.
    await expect.poll(async () => (await handle.boundingBox())?.x ?? 0).toBeLessThan(fillet.x);
    await expect(handle).toHaveAttribute('data-position', '1');
    await expect(summary).toContainText('1 body · 7 faces');
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
    await body.hover();
    await page.getByRole('button', { name: 'Hide Body1' }).click();
    await expect(body).toHaveAttribute('data-visible', 'false', { timeout: 15_000 });
    await expect(summary).toBeHidden();
    await page.getByRole('button', { name: 'Show Body1' }).click();
    await expect(summary).toContainText('1 body · 7 faces', { timeout: 15_000 });
    // F2 renames the body in SolidCraft (body.rename).
    await body.focus();
    await page.keyboard.press('F2');
    await page.getByTestId('tree-rename').fill('Housing');
    await page.keyboard.press('Enter');
    await expect(body).toHaveAttribute('aria-label', 'Housing', { timeout: 15_000 });
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
    // An empty chat offers examples; one fills the input and sends nothing.
    await page.getByTestId('chat-example').first().click();
    await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toHaveValue(/^A wall holder for a cordless drill/);
    await expect(page.getByTestId('chat-start')).toBeVisible();
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Make a plan first');
    await page.getByRole('button', { name: 'Send' }).click();
    const card = page.getByTestId('question-card');
    await expect(card).toHaveAttribute('data-kind', 'plan', { timeout: 30_000 });
    await expect(card.getByTestId('plan-steps')).toHaveText('Box 20 × 20 × 10 mm');
    await expect(page.getByTestId('assistant-text').last()).toHaveText('Plan shown; building waits for the answer.');
    // The plan's limits from the answer show in the assistant menu.
    await page.getByTestId('agent-status').click();
    await expect(page.getByTestId('agent-usage')).toHaveText(/^Plan usage: 5 hours 23% \(resets .+\) · week 69% \(resets .+\)$/);
    await expect(page.getByTestId('agent-context')).toHaveText('Context: 22% of 200,000 tokens');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('step-card')).toHaveCount(0);
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('aside').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('plan-card.png') });

    await card.getByRole('button', { name: 'Build' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    // The first save names the new part after its project (B2) and mirrors it once more; picks wait for that.
    await expect(page.getByTestId('design-name')).toHaveText('Part', { timeout: 15_000 });
    await expect(page.getByTestId('step-card').getByTestId('step-text')).toHaveText('Box 20 × 20 × 10 mm');
    await expect(page.getByTestId('step-card').getByTestId('step-preview')).toHaveAttribute('src', /^data:image\//, { timeout: 10_000 });
    await expect(card.getByTestId('question-answered')).toHaveText(/^(Approved, the assistant builds it|Built)$/);
    await expect(card.getByRole('button', { name: 'Build' })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('plan-approved.png') });
    // While the assistant works, Stop takes Send's place and the chip keeps its name (it shrank to a dot beside both).
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Take your time');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);
    const chip = await page.getByTestId('agent-status').boundingBox();
    expect(chip?.width ?? 0).toBeGreaterThan(120);
    await page.screenshot({ path: test.info().outputPath('composer-busy.png') });
    // A message written meanwhile waits and goes once the run ends (decided 2026-11-10).
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('What about the holes?');
    await page.getByTestId('composer-queue').click();
    await expect(page.getByTestId('chat-queued')).toContainText('What about the holes?');
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('composer-queued.png') });
    await expect(page.getByText('Done, slowly.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('chat-queued')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('chat-list').getByText('What about the holes?', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 30_000 });
    // "Send now" stops the run and sends at once.
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Take your time');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Stop, make it taller');
    await page.getByTestId('composer-queue').click();
    await page.getByTestId('chat-queued-now').click();
    await expect(page.getByTestId('chat-queued')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('chat-list').getByText('Stop, make it taller', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 30_000 });
    // A failed turn says so, with its reason and the way to the log, and sends the message again on request.
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Make it fail');
    await page.getByRole('button', { name: 'Send' }).click();
    const failed = page.getByTestId('turn-failed');
    await expect(failed).toContainText('An error stopped the assistant while it worked.', { timeout: 30_000 });
    await expect(failed.getByTestId('turn-log')).toHaveText('Show log file');
    await failed.getByTestId('turn-retry').click();
    await expect(page.getByTestId('turn-failed')).toHaveCount(2, { timeout: 30_000 });
    // Only the newest failure offers to send again.
    await expect(page.getByTestId('turn-retry')).toHaveCount(1);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('plan-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a round of questions comes with the recommendation picked and answers in one message', async () => {
  test.setTimeout(120_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-round-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7919',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    // The test double asks a round for "phone holder" and repeats the answers (test/fakeClaude.mjs).
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('I need a phone holder for this part');
    await page.getByRole('button', { name: 'Send' }).click();
    const card = page.getByTestId('question-card');
    await expect(card).toHaveAttribute('data-kind', 'ask', { timeout: 30_000 });
    await expect(page.getByTestId('assistant-text').last()).toHaveText('Round shown; building waits for the answers.');
    await expect(card.getByTestId('round-question')).toHaveCount(2);
    // The recommendations come picked; the second question takes several answers.
    await expect(card.getByRole('radio', { name: /Clamp/ })).toBeChecked();
    await expect(card.getByRole('checkbox', { name: /USB-C/ })).toBeChecked();
    await expect(card.getByTestId('option-recommended')).toHaveCount(2);
    await card.getByRole('checkbox', { name: /Camera/ }).check({ force: true });
    await card.getByRole('textbox', { name: 'Other answer to Openings' }).fill('the speaker');
    // A typed answer to a one-answer question replaces the pick; clearing it needs a pick again.
    const mounting = card.getByRole('textbox', { name: 'Other answer to Mounting' });
    await mounting.fill('Magnet');
    await expect(card.getByRole('radio', { name: /Clamp/ })).not.toBeChecked();
    await mounting.fill('');
    await expect(card.getByRole('button', { name: 'Answer' })).toBeDisabled();
    await card.getByRole('radio', { name: /Screws/ }).check({ force: true });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('aside').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('round-card.png') });

    await card.getByRole('button', { name: 'Answer' }).click();
    await expect(page.getByTestId('assistant-text').last()).toHaveText('Got the card answers: Mounting: Screws | Openings: USB-C, Camera, the speaker', { timeout: 30_000 });
    await expect(card.getByTestId('question-answered')).toHaveText('Answered in the chat');
    await expect(card.getByRole('button', { name: 'Answer' })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('round-answered.png') });
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('round-failed.png') }).catch(() => undefined);
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
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · Revision \d+/, { timeout: 90_000 });
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
    await expect(page.getByTestId('connection-status')).toHaveText(/SolidCraft · Revision \d+/, { timeout: 90_000 });
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

    // One field for what should happen here: "Keep as a note" pins it.
    await page.getByTestId('hud-ask').fill('Wall 2 mm here');
    await page.getByTestId('hud-note').click();
    const pin = page.getByTestId('note-pin');
    await expect(pin).toHaveCount(1, { timeout: 15_000 });
    const row = page.getByTestId('note-row');
    await expect(row).toContainText('Wall 2 mm here');
    await expect(row.getByTestId('note-status')).toHaveAttribute('data-status', 'attached');
    await expect(row.getByTestId('note-status')).toHaveAttribute('data-own', 'true');
    // The row names the place readably (surface kind and body), not SolidCraft's face name.
    await expect(row).toContainText('Plane · Body1');
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
    await page.screenshot({ path: test.info().outputPath('dimension-label-preview.png') });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="viewer"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.getByTestId('mark-input').press('Enter');

    await expect(labels).toHaveText(['20', '20', '15'], { timeout: 15_000 });
    const cards = page.getByTestId('step-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1).getByTestId('step-text')).toHaveText('Dimension Box1 · Height set to 15 mm');

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

    await page.getByTestId('dimensions').click();

    // The ready-to-print check (M7, R1, ADR 0010 amendment 2026-11-08): the upper halves of the
    // lying 4.5 mm countersunk holes reach at most 1.6 mm past the bore's sides, a small overhang the
    // slicers print without support, so the wall holder is ready to print.
    await expect(page.getByTestId('print-check')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('tidy-failed.png') }).catch(() => undefined);
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a part becomes a project folder that is renamed, duplicated, opened, started anew and trashed (B2)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, copyFileSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-projects-'));
  const projects = join(work, 'projects');
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7899',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page, app } = launched;
  const name = page.getByTestId('design-name');
  const menu = page.getByTestId('project-menu');
  const logs: string[] = [];
  app.process().stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // An empty design is not saved; the first body gives it a project named "Part" (English UI).
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(name).toHaveText('Part', { timeout: 15_000 });
    await expect.poll(() => existsSync(join(projects, 'Part', 'Part.sc')), { timeout: 15_000 }).toBe(true);
    // The conversation is kept in the project, next to the design.
    await expect.poll(() => existsSync(join(projects, 'Part', 'Part.chat.json')), { timeout: 15_000 }).toBe(true);

    // Rename: folder and files follow; a taken name is refused.
    mkdirSync(join(projects, 'Taken'));
    await menu.click();
    await page.getByTestId('project-rename').click();
    const input = page.getByTestId('project-name-input');
    await input.fill('Taken');
    await page.getByTestId('project-rename-save').click();
    await expect(page.getByTestId('project-rename-error')).toHaveText('A project of this name exists already.');
    await input.fill('Wall holder');
    await page.getByTestId('project-rename-save').click();
    await expect(name).toHaveText('Wall holder', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Wall holder', 'Wall holder.sc'))).toBe(true);
    expect(existsSync(join(projects, 'Wall holder', 'Wall holder.chat.json'))).toBe(true);
    expect(existsSync(join(projects, 'Part'))).toBe(false);
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    // The conversation came along with the project.
    await expect(page.getByText('Build a box')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('project-renamed.png') });

    // Duplicate opens the copy.
    await menu.click();
    await page.getByTestId('project-duplicate').click();
    await expect(name).toHaveText('Wall holder copy', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Wall holder copy', 'Wall holder copy.sc'))).toBe(true);

    // New: an empty design and an empty conversation; nothing is saved until it has content.
    await page.keyboard.press('Control+n');
    await expect(name).toHaveText('New part', { timeout: 30_000 });
    await expect(page.getByText('Build a box')).toHaveCount(0);

    // Open a design from elsewhere: it is copied into a project of its own, the original stays.
    const outside = join(work, 'outside');
    mkdirSync(outside);
    copyFileSync(join(projects, 'Wall holder', 'Wall holder.sc'), join(outside, 'Bracket.sc'));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
    }, join(outside, 'Bracket.sc'));
    await page.keyboard.press('Control+o');
    await expect(name).toHaveText('Bracket', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Bracket', 'Bracket.sc'))).toBe(true);
    expect(existsSync(join(outside, 'Bracket.sc'))).toBe(true);

    // Trash: after a confirmation the folder goes whole into PartBuddy's recycle bin (P2).
    await menu.click();
    await page.getByTestId('project-trash').click();
    await expect(page.getByTestId('project-trash-dialog')).toContainText('Move "Bracket" to the recycle bin?');
    await page.getByTestId('project-trash-confirm').click();
    await expect(name).toHaveText('New part', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Bracket'))).toBe(false);
    // Then the start page with the bin, not a silent new part (audit A-22).
    await expect(page.getByTestId('home-page')).toBeVisible();
    const slots = readdirSync(join(projects, '.trash'));
    expect(slots.some((slot) => existsSync(join(projects, '.trash', slot, 'Bracket', 'Bracket.sc')))).toBe(true);
    expect(readFileSync(join(projects, 'Wall holder', 'Wall holder.sc')).length).toBeGreaterThan(0);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('projects-failed.png') }).catch(() => undefined);
    test.info().annotations.push({ type: 'main log', description: logs.join('').slice(-4000) });
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('PartBuddy starts on the start page with no project open; a saved part gets a preview, and tiles open and import projects (B3)', async () => {
  test.setTimeout(240_000);
  const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-home-'));
  const projects = join(work, 'projects');
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7901',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  let launched = await launchApp({ isolated: false, work, env });
  let { page, app } = launched;
  let name = page.getByTestId('design-name');
  let home = page.getByTestId('home-page');
  const logs: string[] = [];
  app.process().stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // The window opens on the start page; with no projects yet it says how to begin.
    await expect(home.getByTestId('home-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(home).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(name).toHaveText('Part', { timeout: 15_000 });
    // After the save the project gets its picture and the light it was taken with.
    const preview = join(projects, 'Part', 'preview.png');
    await expect.poll(() => existsSync(preview), { timeout: 15_000 }).toBe(true);
    expect(readFileSync(preview).subarray(1, 4).toString()).toBe('PNG');
    await expect.poll(() => (existsSync(join(projects, 'Part', 'preview.json')) ? (JSON.parse(readFileSync(join(projects, 'Part', 'preview.json'), 'utf8')) as { check: unknown }).check : null), { timeout: 15_000 }).toBe('ready');

    // A new project from the start page, then back to the first one through its tile.
    await page.getByTestId('home-button').click();
    await expect(home.getByTestId('home-tile')).toHaveCount(1);
    await expect(home.getByTestId('home-tile').first()).toHaveAttribute('data-open', 'true');
    await expect(home.getByTestId('home-preview')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('home-one-project.png') });
    await home.getByTestId('home-new').click();
    await expect(home).toHaveCount(0);
    await expect(name).toHaveText('New part', { timeout: 30_000 });
    await page.getByTestId('home-button').click();
    await home.getByTestId('home-tile').filter({ hasText: 'Part' }).click();
    await expect(home).toHaveCount(0);
    await expect(name).toHaveText('Part', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });

    // Import copies a design from elsewhere into a new project and opens it.
    const outside = join(work, 'outside');
    mkdirSync(outside);
    copyFileSync(join(projects, 'Part', 'Part.sc'), join(outside, 'Bracket.sc'));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
    }, join(outside, 'Bracket.sc'));
    await page.getByTestId('home-button').click();
    await home.getByTestId('home-import').click();
    await expect(name).toHaveText('Bracket', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Bracket', 'Bracket.sc'))).toBe(true);
    expect(existsSync(join(outside, 'Bracket.sc'))).toBe(true);
    await page.getByTestId('home-button').click();
    await expect(home.getByTestId('home-tile')).toHaveCount(2);
    await expect(home.getByTestId('home-tile').first()).toHaveAttribute('data-name', 'Bracket');

    // After a restart the start page shows again and no project is open until the user picks one.
    await launched.close();
    launched = await launchApp({ isolated: false, work, env });
    ({ page, app } = launched);
    name = page.getByTestId('design-name');
    home = page.getByTestId('home-page');
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await expect(home.getByTestId('home-tile')).toHaveCount(2);
    await expect(home.locator('[data-open="true"]')).toHaveCount(0);
    await expect(name).toHaveText('New part');
    await page.screenshot({ path: test.info().outputPath('home-after-restart.png') });
    await home.getByTestId('home-tile').filter({ hasText: 'Part' }).click();
    await expect(home).toHaveCount(0);
    await expect(name).toHaveText('Part', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('home-failed.png') }).catch(() => undefined);
    test.info().annotations.push({ type: 'main log', description: logs.join('').slice(-4000) });
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a STEP file becomes a project, meshes are inserted into it, converted to faces, and an open mesh is refused with its reason (B4)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-import-'));
  const projects = join(work, 'projects');
  const outside = join(work, 'outside');
  mkdirSync(outside);
  // A closed box of 20 × 10 × 5 mm as STL, and the same with two triangles missing.
  const v = [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0], [0, 0, 5], [20, 0, 5], [20, 10, 5], [0, 10, 5]];
  const triangles = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const stl = (list: number[][]) =>
    `solid box\n${list.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((i) => `vertex ${(v[i] ?? []).join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid box\n`;
  writeFileSync(join(outside, 'Deckel.stl'), stl(triangles));
  writeFileSync(join(outside, 'Kaputt.stl'), stl(triangles.slice(0, 10)));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7902',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page, app } = launched;
  const name = page.getByTestId('design-name');
  const home = page.getByTestId('home-page');
  const bodies = page.getByTestId('structure-body');
  const notice = page.getByTestId('notice');
  // The bridge as the renderer sees it, typed loosely because this file is compiled for Node.
  type Bridge = { partbuddy: { design: { export(format: string): Promise<unknown>; insert(path?: string): Promise<unknown> } } };
  const pick = (file: string) =>
    app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    }, file);
  const logs: string[] = [];
  app.process().stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // A STEP file to import: the assistant builds a box, PartBuddy exports it outside the projects.
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await pick(join(outside, 'Platine.step'));
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.export('step'));
    expect(existsSync(join(outside, 'Platine.step'))).toBe(true);

    // Import from the start page: the STEP file becomes a project named after it, with faces.
    await page.getByTestId('home-button').click();
    await home.getByTestId('home-import').click();
    await expect(home).toHaveCount(0);
    await expect(name).toHaveText('Platine', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Platine', 'Platine.sc'))).toBe(true);
    // The export names the part after the file the user chose, so the import does as well.
    await expect(bodies).toHaveCount(1);
    await expect(bodies.first()).toContainText('Platine');
    // SolidCraft has no repair for parts from STEP, so the imported part offers none.
    await expect(bodies.first().getByTestId('structure-convert')).toHaveCount(0);

    // Insert a closed mesh into the open project and convert it to faces.
    await pick(join(outside, 'Deckel.stl'));
    await page.getByTestId('project-menu').click();
    await page.getByTestId('project-insert').click();
    await expect(notice).toContainText('Inserted Deckel.stl', { timeout: 30_000 });
    await expect(bodies).toHaveCount(2, { timeout: 30_000 });
    const lid = bodies.filter({ hasText: 'Deckel' });
    await expect(lid).toContainText('mesh');
    await lid.getByTestId('structure-convert').click();
    await expect(notice).toContainText('now has faces', { timeout: 30_000 });
    await expect(lid).not.toContainText('mesh', { timeout: 15_000 });
    await expect(lid.getByTestId('structure-convert')).toHaveCount(0);

    // An open mesh stays a mesh; PartBuddy says why.
    await pick(join(outside, 'Kaputt.stl'));
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.insert());
    await expect(bodies).toHaveCount(3, { timeout: 30_000 });
    await bodies.filter({ hasText: 'Kaputt' }).getByTestId('structure-convert').click();
    await expect(notice).toContainText('is not closed', { timeout: 30_000 });
    await expect(bodies.filter({ hasText: 'Kaputt' })).toContainText('mesh');
    await page.screenshot({ path: test.info().outputPath('import-three-bodies.png') });

    // A file of another kind is refused before SolidCraft sees it.
    writeFileSync(join(outside, 'notes.txt'), 'x');
    await expect(page.evaluate((file) => (globalThis as unknown as Bridge).partbuddy.design.insert(file), join(outside, 'notes.txt'))).rejects.toThrow('cannot import');
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('import-failed.png') }).catch(() => undefined);
    test.info().annotations.push({ type: 'main log', description: logs.join('').slice(-4000) });
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('versions are saved by name, before requests and at exports, compared with now and restored (B5)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-versions-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7903',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page, app } = launched;
  const summary = page.getByTestId('mesh-summary');
  const dialog = page.getByTestId('versions-dialog');
  const versions = dialog.getByTestId('version');
  const ask = async (text: string, bodies: string) => {
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(summary).toContainText(bodies, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 30_000 });
  };
  const logs: string[] = [];
  app.process().stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await ask('Build a box', '1 body');
    await expect(page.getByTestId('design-name')).toHaveText('Part', { timeout: 15_000 });

    // A version with a name of the user's.
    await page.getByTestId('versions-button').click();
    await expect(dialog.getByTestId('versions-empty')).toBeVisible();
    await dialog.getByTestId('version-name').fill('First box');
    await dialog.getByTestId('version-save').click();
    await expect(versions).toHaveCount(1);
    await expect(versions.first().getByTestId('version-label')).toHaveText('First box');
    await page.keyboard.press('Escape');

    // Before a request: none while the design is as the newest version, one after a change.
    await ask('Build a box', '2 bodies');
    await ask('Build one more box', '3 bodies');
    await page.getByTestId('versions-button').click();
    await expect(versions).toHaveCount(2);
    await expect(versions.first()).toHaveAttribute('data-reason', 'assistant');
    await expect(versions.first().getByTestId('version-label')).toHaveText('Build one more box');

    // Compared with now: the first box is as it was, two boxes are new.
    const first = versions.filter({ hasText: 'First box' });
    await first.getByTestId('version-compare').click();
    const changes = first.getByTestId('version-change');
    await expect(changes).toHaveCount(3, { timeout: 60_000 });
    await expect(first.locator('[data-status="same"]')).toHaveCount(1);
    await expect(first.locator('[data-status="added"]')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('versions-compare.png') });

    // Restoring keeps the state before as a version and opens the first box again.
    await first.getByTestId('version-restore').click();
    await first.getByTestId('version-restore-confirm').click();
    await expect(dialog).toHaveCount(0);
    await expect(summary).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await page.getByTestId('versions-button').click();
    await expect(versions).toHaveCount(3);
    await expect(versions.first()).toHaveAttribute('data-reason', 'restore');
    await page.keyboard.press('Escape');

    // An export keeps a version as well.
    await app.evaluate(({ dialog: dialogs }, path) => {
      dialogs.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    }, join(work, 'Box.3mf'));
    await page.evaluate(() => (globalThis as unknown as { partbuddy: { design: { export(format: string): Promise<unknown> } } }).partbuddy.design.export('3mf'));
    await page.getByTestId('versions-button').click();
    await expect(versions).toHaveCount(4);
    await expect(versions.first()).toHaveAttribute('data-reason', 'export');
    await expect(versions.first().getByTestId('version-label')).toHaveText('Box.3mf');

    // An automatic version kept as a milestone (P4); the filter shows only the named ones.
    await versions.first().getByTestId('version-rename').click();
    await dialog.getByTestId('version-rename-input').fill('Printed box');
    await dialog.getByTestId('version-rename-save').click();
    await expect(versions.first().getByTestId('version-label')).toHaveText('Printed box');
    await expect(versions.first()).toHaveAttribute('data-reason', 'manual');
    await dialog.getByTestId('versions-milestones').click();
    await expect(versions).toHaveCount(2);
    await expect(dialog.getByTestId('versions-day')).toHaveCount(1);

    // A version opens as a project of its own; the original stays.
    await versions.filter({ hasText: 'First box' }).getByTestId('version-as-project').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('design-name')).toHaveText('Part First box', { timeout: 30_000 });
    await expect(summary).toContainText('1 body · 6 faces', { timeout: 30_000 });
    expect(existsSync(join(work, 'projects', 'Part', 'Part.sc'))).toBe(true);

    // The parts list in the structure tree (P6): two copies, one printed, kept in parts.json and counted on the start page.
    const body = page.getByTestId('structure-body').first();
    await body.getByTestId('part-expand').click();
    const details = page.getByTestId('part-details');
    await details.getByTestId('part-quantity').getByRole('textbox').fill('2');
    await details.getByTestId('part-quantity').getByRole('textbox').press('Tab');
    await details.getByTestId('part-filament').fill('PETG black');
    await details.getByTestId('part-filament').press('Tab');
    await details.getByTestId('part-printed-count').getByRole('textbox').fill('1');
    await details.getByTestId('part-printed-count').getByRole('textbox').press('Tab');
    await expect(page.getByTestId('parts-progress')).toContainText('1/2 printed');
    // Only panels scroll, never the window, also with the details open (audit N-02).
    expect(
      await page.evaluate(() => {
        const window = globalThis as unknown as { document: { scrollingElement: { scrollHeight: number } | null }; innerHeight: number };
        return window.document.scrollingElement?.scrollHeight === window.innerHeight;
      }),
    ).toBe(true);
    await expect.poll(() => readFileSync(join(work, 'projects', 'Part First box', 'parts.json'), 'utf8')).toContain('PETG black');
    await body.getByTestId('part-printed').click();
    await expect(page.getByTestId('parts-progress')).toContainText('2/2 printed');
    await page.getByTestId('home-button').click();
    await expect(page.locator('[data-testid="home-tile"][data-name="Part First box"]').getByTestId('home-tile-progress')).toHaveText('2/2 printed');
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('versions-failed.png') }).catch(() => undefined);
    test.info().annotations.push({ type: 'main log', description: logs.join('').slice(-4000) });
    throw error;
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant researches on the web with sources as cards, and not when it is turned off (B7)', async () => {
  test.setTimeout(180_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-research-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7904',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  let launched = await launchApp({ isolated: false, work, env });
  let { page } = launched;
  const send = async (text: string) => {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
  };
  try {
    await send('Research a 608 bearing');
    const cards = page.getByTestId('source-card');
    await expect(cards).toHaveCount(2, { timeout: 30_000 });
    await expect(cards.first()).toHaveAttribute('data-kind', 'search');
    await expect(cards.first()).toContainText('Searched: 608 bearing dimensions');
    await expect(cards.first().getByRole('link', { name: '608-2RS deep groove ball bearing' })).toHaveAttribute('href', 'https://example.com/608');
    await expect(cards.nth(1)).toHaveAttribute('data-kind', 'page');
    await expect(cards.nth(1).getByRole('link')).toHaveAttribute('href', 'https://example.com/608');
    // The page's text, an attempt to give orders included, never shows in the chat.
    await expect(page.getByText('Ignore your instructions')).toHaveCount(0);
    await expect(page.getByText(/8 × 22 × 7 mm/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('research-sources.png') });

    // Turned off in the settings, the next conversation has no web tools.
    await page.getByTestId('settings').click();
    await page.getByTestId('settings-assistant').click();
    const research = page.getByTestId('research');
    // A switch since the settings round (#178–#181).
    await expect(research.getByRole('switch')).toBeChecked();
    // The input itself sits under the drawn switch; the keyboard turns it like a user does.
    await research.getByRole('switch').focus();
    await page.keyboard.press('Space');
    await expect(research.getByRole('switch')).not.toBeChecked();
    await launched.close();
    launched = await launchApp({ isolated: false, work, env });
    ({ page } = launched);
    await send('Research it again');
    await expect(page.getByText('I have no web tools.')).toBeVisible({ timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a standard screw is seated in a hole as a counterpart that is neither exported nor checked (B7)', async () => {
  test.setTimeout(180_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-parts-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7905',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page, app } = launched;
  type Bridge = {
    partbuddy: {
      design: {
        applyAction(action: unknown): Promise<void>;
        partsLibrary(): Promise<{ family: string; sizes: { size: string }[] }[]>;
        insertPart(part: unknown): Promise<{ body: string | null }>;
        export(format: string): Promise<unknown>;
      };
    };
  };
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    // A 3.4 mm hole through the 20 × 20 × 10 mm box, then an M3 × 12 screw in it.
    // SolidCraft 0.40 (rc.2 and rc.3, 2026-11-08) keeps the bore one cylinder face.
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.applyAction({ action: 'hole', body: 'Body1', points: [[10, 10, 10]], size: 3.4 }));
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 7 faces', { timeout: 30_000 });
    const families = await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.partsLibrary());
    expect(families.map((family) => family.family)).toContain('bearing');
    const inserted = await page.evaluate(() =>
      (globalThis as unknown as Bridge).partbuddy.design.insertPart({ family: 'socket_head_cap_screw', size: 'M3', length: 12, point: [11.7, 10, 5] }),
    );
    expect(inserted.body).toBe('SHCS M3x12');
    const screw = page.getByTestId('structure-body').filter({ hasText: 'SHCS M3x12' });
    await expect(screw).toContainText('standard part', { timeout: 30_000 });
    await expect(page.getByTestId('print-check')).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath('standard-part.png') });

    // The export holds the box only.
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path });
    }, join(work, 'Box.step'));
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.export('step'));
    const step = readFileSync(join(work, 'Box.step'), 'utf8');
    expect(step).toContain('Body1');
    expect(step).not.toContain('SHCS');
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the export menu offers the slicers SolidCraft finds, and a print face is set (B8)', async () => {
  test.setTimeout(180_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-slicer-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7906',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = { partbuddy: { design: { slicers(): Promise<{ id: string; name: string }[]>; setPrintFace(body: string, point: number[] | null): Promise<void> } } };
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    const slicers = await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.slicers());
    // The menu lists exactly what SolidCraft found; nothing is sent here, so no slicer window opens.
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-slicer')).toHaveCount(slicers.length);
    for (const slicer of slicers) await expect(page.getByTestId('export-slicer').filter({ hasText: `Open in ${slicer.name}` })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('slicer-menu.png') });
    await page.keyboard.press('Escape');
    // The top face becomes the print face, one step of the work log; clearing it is another.
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.setPrintFace('Body1', [10, 10, 10]));
    await expect(page.getByText('Print face set')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.setPrintFace('Body1', null));
    await expect(page.getByText('Print face cleared')).toBeVisible({ timeout: 15_000 });
    await expect(page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.setPrintFace('Body1', [10, 10, 5]))).rejects.toThrow();
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('function blocks are previewed and built at a face: tapped hole, screw hole, insert seat and boss (F1)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-blocks-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7907',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = { partbuddy: { design: { previewBlock(block: unknown): Promise<{ ok: boolean; preview?: unknown; error?: string }>; applyBlock(block: unknown): Promise<void> } } };
  const preview = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.previewBlock(b).then((r) => ({ ok: r.ok, error: r.error ?? null })), block);
  const apply = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.applyBlock(b), block);
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    const top = (x: number, y: number) => ({ body: 'Body1', point: [x, y, 10] });
    const blocks = [
      { block: 'tappedHole', ...top(5, 5), size: 'M4', depth: 6, modeled: true, more: [[5, 10, 10]] },
      { block: 'screwHole', ...top(15, 5), size: 'M3', head: 'countersunk', fit: 'normal' },
      { block: 'insertSeat', ...top(5, 15), size: 'M3', diameter: 4, depth: 6.7 },
      { block: 'boss', ...top(15, 15), size: 'M2', diameter: 7.2, height: 6 },
    ];
    for (const block of blocks) {
      expect(await preview(block)).toEqual({ ok: true, error: null });
      await apply(block);
    }
    for (const line of ['Tapped hole M4', 'Screw hole M3', 'Hole ⌀ 4 mm, 6.7 mm deep', 'Screw boss ⌀ 7.2 mm']) {
      await expect(page.getByText(line)).toBeVisible({ timeout: 30_000 });
    }
    // The design changed only through the four blocks, the tapped hole twice (`more`): previews leave nothing
    // behind. All six by name: a count alone passed while the timeline was still one step behind.
    await expect(page.getByTestId('timeline-feature')).toHaveText(['Box1', 'Hole1', 'Hole2', 'Hole3', 'Hole4', 'Boss1'], { timeout: 30_000 });
    expect((await preview({ block: 'boss', body: 'Body1', point: [10, 10, 5], size: 'M3', diameter: 8, height: 5 })).ok).toBe(false);
    await page.screenshot({ path: test.info().outputPath('blocks.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('sketched blocks and a lip are previewed and built: text, nut trap, slot, lip (F1)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-blocks2-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7908',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = {
    partbuddy: {
      design: {
        previewBlock(block: unknown): Promise<{ ok: boolean; preview?: unknown; error?: string }>;
        applyBlock(block: unknown): Promise<void>;
        applyAction(action: unknown): Promise<void>;
      };
    };
  };
  const preview = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.previewBlock(b).then((r) => ({ ok: r.ok, error: r.error ?? null })), block);
  const apply = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.applyBlock(b), block);
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    // An open case with 3 mm walls: the 20 × 20 × 10 mm box without its top face.
    await page.evaluate(() => (globalThis as unknown as Bridge).partbuddy.design.applyAction({ action: 'shell', body: 'Body1', points: [[10, 10, 10]], size: 3 }));
    await expect(page.getByTestId('timeline-feature')).toHaveCount(2, { timeout: 30_000 });
    const blocks = [
      { block: 'text', body: 'Body1', point: [10, 0, 5], normal: [0, -1, 0], size: 'M3', text: 'PB', height: 4, depth: 0.6, mode: 'deboss', bold: true, font: 'Georgia' },
      { block: 'nutTrap', body: 'Body1', point: [10, 10, 0], normal: [0, 0, -1], size: 'M2', flats: 4.3, depth: 2 },
      { block: 'slot', body: 'Body1', point: [20, 10, 5], normal: [1, 0, 0], size: 'M3', length: 6, width: 3.4, depth: 3, along: 'x' },
      { block: 'lip', body: 'Body1', point: [1.5, 10, 10], size: 'M3', type: 'lip', width: 1.2, height: 2, gap: 0.2 },
    ];
    for (const block of blocks) {
      expect({ block: block.block, ...(await preview(block)) }).toEqual({ block: block.block, ok: true, error: null });
      await apply(block);
    }
    for (const line of ['Text “PB”', 'Nut trap M2', 'Slot 6 mm', 'Lip 1.2 mm']) {
      await expect(page.getByText(line)).toBeVisible({ timeout: 30_000 });
    }
    await page.screenshot({ path: test.info().outputPath('blocks-sketched.png') });

    // The same through the form: a flat face picked in the view, the face's own direction.
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    // Every new revision drops the selection (face indices change), so the model settles first:
    // all ten features mirrored and the design saved. Then pick until the form stays open.
    await expect(page.getByTestId('timeline-feature')).toHaveCount(10, { timeout: 30_000 });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const spots = [[0.5, 0.75], [0.35, 0.6], [0.7, 0.65], [0.5, 0.5], [0.6, 0.8]] as const;
    let spot = 0;
    await expect(async () => {
      const [x, y] = spots[spot++ % spots.length] ?? [0.5, 0.5];
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.getByTestId('action-block').click({ timeout: 1500 });
      await expect(page.getByTestId('block-form')).toBeVisible({ timeout: 1000 });
    }, 'a flat face of the case and its form').toPass({ timeout: 45_000, intervals: [500] });
    await page.getByTestId('block-tile-text').click();
    await expect(page.getByTestId('block-size')).toHaveCount(0);
    await page.getByTestId('block-text').getByRole('textbox').fill('UI');
    await page.getByTestId('block-height').getByRole('textbox').fill('3');
    await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('block-form-text.png') });
    await page.getByTestId('block-apply').click();
    await expect(page.getByText('Text “UI”')).toBeVisible({ timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a snap fit stands out of a face, its catch across the arm, with its strain in the form (F1)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-blocks3-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7909',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = { partbuddy: { design: { previewBlock(block: unknown): Promise<{ ok: boolean; preview?: unknown; error?: string }>; applyBlock(block: unknown): Promise<void> } } };
  const preview = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.previewBlock(b).then((r) => ({ ok: r.ok, error: r.error ?? null })), block);
  const apply = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.applyBlock(b), block);
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    const snap = { block: 'snapFit', body: 'Body1', size: 'M3', length: 10, thickness: 1.5, width: 5, catchDepth: 0.8, catchLength: 1.5 };
    // Up from the top face, and level out of a side face with the catch pointing up.
    for (const block of [
      { ...snap, point: [10, 10, 10], normal: [0, 0, 1], hook: 'y+' },
      { ...snap, point: [20, 10, 5], normal: [1, 0, 0], hook: 'y+', length: 8 },
    ]) {
      expect(await preview(block)).toEqual({ ok: true, error: null });
      await apply(block);
    }
    for (const line of ['Snap fit 10 mm', 'Snap fit 8 mm']) await expect(page.getByText(line)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('timeline-feature')).toHaveCount(3, { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('blocks-snap-fit.png') });

    // Through the form: the strain warns on a short arm and is fine again on a longer one.
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const spots = [[0.5, 0.75], [0.35, 0.6], [0.7, 0.65], [0.5, 0.5], [0.6, 0.8]] as const;
    let spot = 0;
    await expect(async () => {
      const [x, y] = spots[spot++ % spots.length] ?? [0.5, 0.5];
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.getByTestId('action-block').click({ timeout: 1500 });
      await expect(page.getByTestId('block-form')).toBeVisible({ timeout: 1000 });
    }, 'a flat face of the box and its form').toPass({ timeout: 45_000, intervals: [500] });
    await page.getByTestId('block-kind').getByRole('button').click();
    await page.getByRole('option', { name: 'Snap fit' }).click();
    await expect(page.getByTestId('block-size')).toHaveCount(0);
    await expect(page.getByTestId('block-strain')).toHaveText('About 1.4 % strain when it snaps in');
    await page.getByTestId('block-length').getByRole('textbox').fill('6');
    await expect(page.getByTestId('block-strain')).toContainText('About 6.5 % strain when it snaps in – more than printed PLA takes');
    await page.getByTestId('block-catch-depth').getByRole('textbox').fill('0.3');
    await expect(page.getByTestId('block-strain')).toContainText('About 2.4 % strain');
    await page.getByTestId('block-length').getByRole('textbox').fill('8');
    await expect(page.getByTestId('block-strain')).toHaveText('About 1.3 % strain when it snaps in');
    await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('block-form-snap-fit.png') });
    await page.getByTestId('block-apply').click();
    await expect(page.getByText('Snap fit 8 mm')).toHaveCount(2, { timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a logo from an SVG file is engraved and built up at a face, a ring keeping its hole, also through the form (F1)', async () => {
  test.setTimeout(360_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-blocks4-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7910',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = { partbuddy: { design: { previewBlock(block: unknown): Promise<{ ok: boolean; preview?: unknown; error?: string }>; applyBlock(block: unknown): Promise<void> } } };
  const preview = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.previewBlock(b).then((r) => ({ ok: r.ok, error: r.error ?? null })), block);
  const apply = (block: unknown) => page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.applyBlock(b), block);
  // A ring with a star inside its hole: three nested loops, the middle one empty.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5 A45 45 0 1 1 49.99 5 Z M50 20 A30 30 0 1 0 50.01 20 Z"/>' +
    '<polygon points="50,30 56,45 72,45 59,55 64,70 50,61 36,70 41,55 28,45 44,45"/></svg>';
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    const logo = { block: 'logo', body: 'Body1', size: 'M3', name: 'ring', svg, width: 12 };
    for (const block of [
      { ...logo, point: [10, 10, 10], normal: [0, 0, 1], depth: 0.6, mode: 'deboss' },
      { ...logo, point: [10, 0, 5], normal: [0, -1, 0], depth: 0.4, mode: 'emboss', width: 8 },
    ]) {
      expect(await preview(block)).toEqual({ ok: true, error: null });
      await apply(block);
    }
    for (const line of ['Logo “ring” engraved', 'Logo “ring” embossed']) await expect(page.getByText(line)).toBeVisible({ timeout: 30_000 });
    // A line icon (Tabler "rocket", strokes only, round caps and joins) is built at its stroke width, engraved in the side.
    const rocket = { ...logo, name: 'rocket', svg: readFileSync(join(__dirname, '..', 'test', 'fixtures', 'svg', 'tabler-rocket.svg'), 'utf8'), point: [20, 10, 5], normal: [1, 0, 0], depth: 0.6, mode: 'deboss', width: 8 };
    expect(await preview(rocket)).toEqual({ ok: true, error: null });
    await apply(rocket);
    await expect(page.getByText('Logo “rocket” engraved')).toBeVisible({ timeout: 30_000 });
    // A line without a stroke has nothing to build: PartBuddy turns it away before SolidCraft.
    const bare = { ...logo, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10"/></svg>', point: [10, 10, 10], normal: [0, 0, 1], depth: 0.6, mode: 'deboss' };
    expect(await preview(bare).catch(() => ({ ok: false }))).toMatchObject({ ok: false });
    // Once the rocket's sketch is listed, the view has it too.
    await expect(page.getByText('SVG-Logo rocket', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('blocks-logo.png') });

    // Through the form: no build before a file is chosen; a page that is no SVG is turned away.
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    await expect(page.getByTestId('timeline-feature')).toHaveCount(7, { timeout: 30_000 });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const spots = [[0.5, 0.75], [0.35, 0.6], [0.7, 0.65], [0.5, 0.5], [0.6, 0.8]] as const;
    let spot = 0;
    await expect(async () => {
      const [x, y] = spots[spot++ % spots.length] ?? [0.5, 0.5];
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      // The logo has a tile of its own in the dock's "Add" group.
      await page.getByTestId('block-tile-logo').click({ timeout: 1500 });
      await expect(page.getByTestId('block-form')).toBeVisible({ timeout: 1000 });
    }, 'a flat face of the box and its form').toPass({ timeout: 45_000, intervals: [500] });
    // A row of screw holes: a count across brings its spacing, the row is tried as one.
    await page.getByTestId('block-tile-screwHole').click();
    await expect(page.getByTestId('block-pitch-x')).toHaveCount(0);
    // Centred, so the row stays on the face; the clicked spot comes back for the logo (the middle holds a ring).
    const picked = [await page.getByTestId('block-x').getByRole('textbox').inputValue(), await page.getByTestId('block-y').getByRole('textbox').inputValue()];
    await page.getByTestId('block-centre-both').click();
    // Dragged out and back to where it was pressed, the arrow lands on its start value: no run-away while the panel follows.
    {
      // Centred first, so the arrow sits still and the start is a whole mm the drag grid can come back to.
      const field = page.getByTestId('block-y').getByRole('textbox');
      await expect(field).toHaveValue('0');
      const start = '0';
      const handle = page.getByTestId('block-arrow-y');
      const turn = Number(/rotate\((-?[\d.e-]+)rad\)/.exec((await handle.locator('div').first().getAttribute('style')) ?? '')?.[1] ?? 0);
      await handle.hover();
      const arrow = await handle.boundingBox();
      if (!arrow) throw new Error('arrow not visible');
      const [x, y] = [arrow.x + arrow.width / 2, arrow.y + arrow.height / 2];
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x + Math.cos(turn) * 8 * i, y + Math.sin(turn) * 8 * i, { steps: 2 });
      await expect(field).not.toHaveValue(start);
      for (let i = 7; i >= 0; i--) await page.mouse.move(x + Math.cos(turn) * 8 * i, y + Math.sin(turn) * 8 * i, { steps: 2 });
      await page.mouse.up();
      await expect(field).toHaveValue(start);
    }
    await page.getByTestId('block-count-x').getByRole('textbox').fill('3');
    await page.getByTestId('block-count-x').getByRole('textbox').press('Tab');
    await page.getByTestId('block-pitch-x').getByRole('textbox').fill('5');
    await page.getByTestId('block-pitch-x').getByRole('textbox').press('Tab');
    // The middle holds the ring built before: a preview through it takes SolidCraft up to half a minute, twice when the count and spacing come one after the other.
    await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 90_000 });
    await page.screenshot({ path: test.info().outputPath('block-form-row.png') });
    await page.getByTestId('block-x').getByRole('textbox').fill(picked[0] ?? '0');
    await page.getByTestId('block-y').getByRole('textbox').fill(picked[1] ?? '0');
    await page.getByTestId('block-y').getByRole('textbox').press('Tab');
    // A text's font: every installed family, each listed in its own face (SolidCraft setting it: the sketched blocks test).
    await page.getByTestId('block-tile-text').click();
    // In a low window the form scrolls to the field for the click, and a list closes when the page under it
    // scrolls: click again until it stays open.
    await expect(async () => {
      await page.getByTestId('block-font').getByRole('button').click();
      await expect(page.getByRole('option', { name: 'Arial', exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    // A few lines tall and as wide as the field, so it covers little.
    expect((await page.getByRole('listbox').boundingBox())?.height ?? 999).toBeLessThanOrEqual(270);
    // Esc closes the list, not the form.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('block-form')).toBeVisible();
    // Typing narrows the hundreds of fonts.
    await page.getByTestId('block-font').getByRole('combobox').fill('georg');
    await expect(page.getByRole('option', { name: 'Arial', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Georgia', exact: true }).click();
    await expect(page.getByTestId('block-font').getByRole('combobox')).toHaveValue('Georgia');
    // Impact has no bold face: bold goes off and cannot be set, so SolidCraft is not refused.
    await page.getByTestId('block-font').getByRole('combobox').fill('Impact');
    await page.getByRole('option', { name: 'Impact', exact: true }).click();
    await expect(page.getByTestId('block-bold').getByRole('checkbox')).not.toBeChecked();
    await expect(page.getByTestId('block-bold').getByRole('checkbox')).toBeDisabled();
    await page.getByTestId('block-tile-logo').click();
    // A way back: Cancel and Esc close the form, the face stays picked, the tile opens it again.
    await page.getByTestId('block-cancel').click();
    await expect(page.getByTestId('block-form')).toHaveCount(0);
    await page.getByTestId('block-tile-logo').click();
    await page.getByTestId('block-form').getByRole('button').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('block-form')).toHaveCount(0);
    await expect(page.getByTestId('selection-bar')).toBeVisible();
    await page.getByTestId('block-tile-logo').click();
    await expect(page.getByTestId('block-form')).toBeVisible();
    await expect(page.getByTestId('block-size')).toHaveCount(0);
    await expect(page.getByTestId('block-status')).toHaveText('Choose an SVG file for the logo');
    await expect(page.getByTestId('block-apply')).toBeDisabled();
    const input = page.getByTestId('block-logo').locator('input[type=file]');
    await input.setInputFiles({ name: 'page.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<html><body>no</body></html>') });
    await expect(page.getByTestId('block-logo-problem')).toHaveText('This is no SVG drawing.');
    await input.setInputFiles({ name: 'badge.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    await expect(page.getByTestId('block-logo-name')).toHaveText('badge');
    await expect(page.getByTestId('block-logo-problem')).toHaveCount(0);
    await page.getByTestId('block-width').getByRole('textbox').fill('6');
    await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    // Placed like a logo: across and up from the face's middle, with arrows on the part; "Centre" puts it on the middle.
    await expect(page.getByTestId('block-arrow-x')).toBeVisible();
    await expect(page.getByTestId('block-arrow-y')).toBeVisible();
    const across = page.getByTestId('block-x').getByRole('textbox');
    const up = page.getByTestId('block-y').getByRole('textbox');
    const clicked = [await across.inputValue(), await up.inputValue()];
    await page.getByTestId('block-centre-both').click();
    await expect(across).toHaveValue('0');
    await expect(up).toHaveValue('0');
    // Back to where the face was clicked: the middle holds the ring built up before, a slow overlap to try.
    await across.fill(clicked[0] ?? '0');
    await up.fill(clicked[1] ?? '0');
    await up.press('Tab');
    await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('block-form-logo.png') });
    await page.getByTestId('block-apply').click();
    await expect(page.getByText('Logo “badge” engraved')).toBeVisible({ timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a logo in colours becomes a coloured body per fill, inlaid flush in the face, for a multi-colour print', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-colours-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7933',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = { partbuddy: { design: { previewBlock(block: unknown): Promise<{ ok: boolean; error?: string }>; applyBlock(block: unknown): Promise<void> } } };
  const svg = readFileSync(join(__dirname, '..', 'test', 'fixtures', 'svg', 'two-colours.svg'), 'utf8');
  const say = async (text: string) => {
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
  };
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await say('Build a box');
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    // 16 mm wide on the top face of the 20 mm box, centred at (10, 10): the plate 16 × 8, the dot 4 across.
    const block = { block: 'logo', body: 'Body1', size: 'M3', name: 'Badge', svg, width: 16, point: [10, 10, 10], normal: [0, 0, 1], depth: 0.6, mode: 'deboss', colours: true };
    expect(await page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.previewBlock(b).then((r) => ({ ok: r.ok, error: r.error ?? null })), block)).toEqual({ ok: true, error: null });
    await page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.applyBlock(b), block);
    await expect(page.getByTestId('mesh-summary')).toContainText('3 bodies', { timeout: 30_000 });
    await say('Measure the bodies');
    const answer = page.getByText(/^Measured: /);
    await expect(answer).toBeVisible({ timeout: 30_000 });
    type Measured = { bodies: { name: string; volume_mm3: number; bbox: { min: number[]; max: number[] } }[] };
    const measured = JSON.parse(/\{.*\}/.exec((await answer.textContent()) ?? '')?.[0] ?? '{}') as Measured;
    const body = (name: string) => measured.bodies.find((entry) => entry.name === name);
    const blue = body('Badge 1d71b8 1');
    const yellow = body('Badge ffd500 1');
    // The plate without the dot, the dot alone, both 0.6 mm deep and flush with the top.
    expect(blue?.volume_mm3).toBeCloseTo((128 - Math.PI * 4) * 0.6, 1);
    expect(yellow?.volume_mm3).toBeCloseTo(Math.PI * 4 * 0.6, 1);
    for (const [entry, min, max] of [[blue, [2, 6, 9.4], [18, 14, 10]], [yellow, [8, 8, 9.4], [12, 12, 10]]] as const) {
      entry?.bbox.min.forEach((value, i) => expect(value).toBeCloseTo(min[i] ?? 0, 2));
      entry?.bbox.max.forEach((value, i) => expect(value).toBeCloseTo(max[i] ?? 0, 2));
    }
    // The box lost exactly the pocket the colours fill.
    expect(body('Body1')?.volume_mm3).toBeCloseTo(4000 - 128 * 0.6, 1);
    await page.screenshot({ path: test.info().outputPath('logo-colours.png') });

    // Moved exactly, then centred across: the pocket and both colour bodies follow in one step each.
    await say('Move the logo {"logo": "SVG-Logo Badge", "by": [3, -2]}');
    await expect(page.getByText(/^Logo: Moved SVG-Logo Badge .*\[13, 8, 10\] mm/)).toBeVisible({ timeout: 30_000 });
    await say('Move the logo {"logo": "Badge", "centre": "x"}');
    await expect(page.getByText(/^Logo: Moved SVG-Logo Badge by -3 mm along its x and 0 mm along its y on face .* of Body1; its middle is now at \[10, 8, 10\] mm/)).toBeVisible({ timeout: 30_000 });
    await say('Measure the bodies');
    const again = page.getByText(/^Measured: /).last();
    await expect(page.getByText(/^Measured: /)).toHaveCount(2, { timeout: 30_000 });
    const moved = JSON.parse(/\{.*\}/.exec((await again.textContent()) ?? '')?.[0] ?? '{}') as Measured;
    const after = (name: string) => moved.bodies.find((entry) => entry.name === name);
    for (const [entry, min, max] of [[after('Badge 1d71b8 1'), [2, 4, 9.4], [18, 12, 10]], [after('Badge ffd500 1'), [8, 6, 9.4], [12, 10, 10]]] as const) {
      entry?.bbox.min.forEach((value, i) => expect(value).toBeCloseTo(min[i] ?? 0, 2));
      entry?.bbox.max.forEach((value, i) => expect(value).toBeCloseTo(max[i] ?? 0, 2));
    }
    expect(after('Body1')?.volume_mm3).toBeCloseTo(4000 - 128 * 0.6, 1);

    // Turned a quarter left about its middle (10, 8): the 16 × 8 plate now stands 8 × 16, pocket and colours with it.
    await say('Move the logo {"logo": "Badge", "rotate": 90}');
    await expect(page.getByText(/^Logo: Moved SVG-Logo Badge .*turned by 90° \(now 90° from level\)/)).toBeVisible({ timeout: 30_000 });
    await say('Measure the bodies');
    await expect(page.getByText(/^Measured: /)).toHaveCount(3, { timeout: 30_000 });
    const turned = JSON.parse(/\{.*\}/.exec((await page.getByText(/^Measured: /).last().textContent()) ?? '')?.[0] ?? '{}') as Measured;
    const plate = turned.bodies.find((entry) => entry.name === 'Badge 1d71b8 1');
    plate?.bbox.min.forEach((value, i) => expect(value).toBeCloseTo([6, 0, 9.4][i] ?? 0, 2));
    plate?.bbox.max.forEach((value, i) => expect(value).toBeCloseTo([14, 16, 10][i] ?? 0, 2));
    expect(turned.bodies.find((entry) => entry.name === 'Body1')?.volume_mm3).toBeCloseTo(4000 - 128 * 0.6, 1);

    // Half as wide about its middle: the turned plate 4 × 8, the pocket a quarter of what it was.
    await say('Move the logo {"logo": "Badge", "width": 8}');
    await expect(page.getByText(/^Logo: Moved SVG-Logo Badge .*now 8 mm wide/)).toBeVisible({ timeout: 30_000 });
    await say('Measure the bodies');
    await expect(page.getByText(/^Measured: /)).toHaveCount(4, { timeout: 30_000 });
    const smaller = JSON.parse(/\{.*\}/.exec((await page.getByText(/^Measured: /).last().textContent()) ?? '')?.[0] ?? '{}') as Measured;
    const small = smaller.bodies.find((entry) => entry.name === 'Badge 1d71b8 1');
    small?.bbox.min.forEach((value, i) => expect(value).toBeCloseTo([8, 4, 9.4][i] ?? 0, 2));
    small?.bbox.max.forEach((value, i) => expect(value).toBeCloseTo([12, 12, 10][i] ?? 0, 2));
    expect(smaller.bodies.find((entry) => entry.name === 'Body1')?.volume_mm3).toBeCloseTo(4000 - 32 * 0.6, 1);

    // Through the form: a free multi-colour SVG (Twemoji fox, CC-BY 4.0) on the box's front face.
    await page.getByTestId('timeline-feature').first().waitFor();
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    const spots = [[0.4, 0.75], [0.35, 0.7], [0.45, 0.8], [0.3, 0.65]] as const;
    let spot = 0;
    await expect(async () => {
      const [x, y] = spots[spot++ % spots.length] ?? [0.4, 0.75];
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.getByTestId('action-block').click({ timeout: 1500 });
      await expect(page.getByTestId('block-form')).toBeVisible({ timeout: 1000 });
    }, 'a side face of the box and its form').toPass({ timeout: 45_000, intervals: [500] });
    await page.getByTestId('block-tile-logo').click();
    await page.getByTestId('block-logo').locator('input[type=file]').setInputFiles(join(__dirname, '..', 'test', 'fixtures', 'svg', 'twemoji-fox.svg'));
    await expect(page.getByTestId('block-logo-name')).toHaveText('twemoji-fox');
    await page.getByTestId('block-width').getByRole('textbox').fill('9');
    await expect(page.getByTestId('block-logo-colours')).toContainText('5 colours');
    await page.getByTestId('block-colours').click();
    // A printer with three filaments: the nearest colours merge, the fox keeps its three biggest.
    await page.getByTestId('block-colours-most').getByRole('button').click();
    await page.getByRole('option', { name: '3', exact: true }).click();
    await expect(page.getByTestId('block-logo-colours')).toContainText('3 colours');
    // Wherever the face was clicked, the fox goes onto its middle.
    await page.getByTestId('block-centre').click();
    await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('logo-colours-form.png') });
    await page.getByTestId('block-apply').click();
    await expect(page.getByTestId('mesh-summary')).not.toContainText('3 bodies', { timeout: 30_000 });
    // Every body but the box has its colour in the tree, also a piece a cut split in two.
    const count = await page.getByTestId('structure-body').count();
    await expect(page.getByTestId('structure-body-colour')).toHaveCount(count - 1);
    // Only the fox's bodies: the badge from before keeps its own two colours.
    const swatches = await page.getByTestId('structure-body').filter({ hasText: 'twemoji-fox' }).getByTestId('structure-body-colour').all();
    expect(new Set(await Promise.all(swatches.map((swatch) => swatch.getAttribute('title')))).size).toBe(3);
    type Logos = { partbuddy: { design: { logoAt(point: number[]): Promise<{ logo: string; offset: number[] | null } | null> } } };
    const fox = await page.evaluate(() => (globalThis as unknown as Logos).partbuddy.design.logoAt([10, 0, 5]));
    expect(fox?.logo).toBe('SVG-Logo twemoji-fox');
    fox?.offset?.forEach((value) => expect(value).toBeCloseTo(0, 2));
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.1);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: test.info().outputPath('logo-colours-fox.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the light measures parts against each other: an overlap and a gap under the push fit (F2)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-clearance-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7911',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // One part alone: nothing to measure against.
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    await expect(page.getByTestId('print-check')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });

    // A case, a lid sunk 1 mm into it and a clip 0.1 mm beside it (PLA's push fit is 0.15 mm).
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build parts that clash');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('4 bodies', { timeout: 30_000 });
    await page.getByTestId('print-check').click();
    const panel = page.getByTestId('print-check-panel');
    // The first box stands inside the case as well, so it overlaps the case and the lid too.
    await expect(panel.locator('[data-kind="overlap"]')).toHaveCount(3, { timeout: 30_000 });
    await expect(panel.locator('[data-kind="overlap"]', { hasText: 'Case and Lid overlap by 400 mm³' })).toHaveCount(1);
    await expect(panel.locator('[data-kind="tight"]')).toHaveCount(2);
    await expect(panel.locator('[data-kind="tight"]', { hasText: 'Case and Clip come within 0.1 mm without touching – under the push fit of 0.15 mm per side' })).toHaveCount(1);
    await expect(page.getByTestId('print-check')).toHaveAttribute('data-status', 'warn');
    await page.screenshot({ path: test.info().outputPath('clearance.png') });
    // The finding points at the place: the camera goes to the gap.
    await panel.locator('[data-kind="tight"]', { hasText: 'Case and Clip' }).getByRole('button').click();
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a template from the start page becomes a project whose sizes are its parameters (F3)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-templates-'));
  const projects = join(work, 'projects');
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7912',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  const home = page.getByTestId('home-page');
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await expect(home.getByTestId('home-template')).toHaveCount(5);
    await page.screenshot({ path: test.info().outputPath('home-templates.png') });
    await home.locator('[data-template="housing"]').click();
    // While SolidCraft builds it, its tile says so and the other templates wait (audit P-02).
    await expect(home.locator('[data-template="housing"]')).toHaveAttribute('data-building', 'true');
    await expect(home.locator('[data-template="housing"]').getByRole('progressbar')).toBeVisible();
    await expect(home.locator('[data-template="sign"]')).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath('home-template-building.png') });
    await expect(home).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('design-name')).toHaveText('Housing', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('6 bodies', { timeout: 30_000 });
    expect(existsSync(join(projects, 'Housing', 'Housing.sc'))).toBe(true);
    // Its sizes are parameters, each with what it means, and the light finds nothing to block.
    const parameters = page.getByTestId('parameter');
    await expect(parameters).toHaveCount(10, { timeout: 30_000 });
    await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 30_000 });
    // A size changes through its parameter, without the assistant.
    const lengthRow = page.locator('[data-testid="parameter"][data-name="length"]');
    await lengthRow.dblclick();
    const length = lengthRow.getByTestId('parameter-field').getByRole('textbox');
    await length.fill('100');
    await length.press('Enter');
    await expect(lengthRow).toHaveAccessibleName(/length.* 100 mm$/, { timeout: 30_000 });
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="ok"]').first()).toBeVisible();
    await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 30_000 });
    await page.getByTestId('print-check').click();
    // Assembled, the lid lies on the housing: the light says so, and nothing else.
    await expect(page.getByTestId('print-check-panel')).toContainText('Housing and Lid touch but are separate bodies');
    await page.screenshot({ path: test.info().outputPath('template-housing.png') });
    await page.keyboard.press('Escape');

    // Every other template builds as well.
    for (const [id, name, bodies] of [
      ['hingedBox', 'Hinged box', '2 bodies'],
      ['wallHolder', 'Wall holder', '1 body'],
      ['slideStop', 'Adjustable stop', '2 bodies'],
      ['sign', 'Sign with text', '1 body'],
    ] as const) {
      await page.getByTestId('home-button').click();
      await home.locator(`[data-template="${id}"]`).click();
      await expect(page.getByTestId('design-name')).toHaveText(name, { timeout: 30_000 });
      await expect(page.getByTestId('mesh-summary')).toContainText(bodies, { timeout: 30_000 });
      await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 30_000 });
      await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`template-${id}.png`) });
      if (id === 'slideStop') {
        // The stop came joined as a slider that stays on its rail.
        // The panel stays open from one project to the next.
        if (!(await page.getByTestId('joint-panel').isVisible())) await page.getByTestId('joints').click({ timeout: 30_000 });
        const guide = page.getByTestId('joint-panel').getByRole('slider', { name: 'Guide' });
        await expect(guide).toHaveAttribute('min', '-45');
        await expect(guide).toHaveAttribute('max', '45');
        await page.getByTestId('print-check').click();
        await expect(page.getByTestId('print-check-panel').locator('[data-kind="blocked"]')).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath('template-slideStop-check.png') });
        await page.keyboard.press('Escape');
        // On the plate the stop lies on its top, as its print face says: taller than wide it would stand otherwise.
        await page.getByRole('radio', { name: 'Plate' }).click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: test.info().outputPath('template-slideStop-plate.png') });
        await page.getByRole('radio', { name: 'Assembled' }).click();
      }
      if (id !== 'hingedBox') continue;
      // The hinge came joined and closes all the way: the bead of the closure pressing past the box's rim is a snap fit, no stop.
      if (!(await page.getByTestId('joint-panel').isVisible())) await page.getByTestId('joints').click({ timeout: 30_000 });
      const slider = page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' });
      await expect(slider).toHaveAttribute('max', '180');
      // Trying the closed pose for the snap left the lid open, as designed.
      await expect(slider).toHaveValue('0');
      await page.getByTestId('print-check').click();
      await expect(page.getByTestId('print-check-panel').locator('[data-kind="blocked"]')).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('template-hingedBox-check.png') });
      await page.keyboard.press('Escape');
      await slider.focus();
      await page.keyboard.press('End');
      await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' })).toHaveValue('180', { timeout: 30_000 });
      await page.screenshot({ path: test.info().outputPath('template-hingedBox-closed.png') });
      // While SolidCraft drives the joint the slider takes no keys: back once it is free again.
      const closed = page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' });
      await expect(closed).toBeEnabled({ timeout: 30_000 });
      await closed.focus();
      await page.keyboard.press('Home');
      await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' })).toHaveValue('0', { timeout: 30_000 });
    }
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a rough sketch drawn with the mouse goes to the assistant as a picture with its note (F4)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-sketch-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7913',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  // A low window, as on a laptop: the sketch must still show its buttons (polish round 1).
  await launched.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1100, 800);
  });
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByTestId('composer-sketch-open').click();
    const pad = page.getByTestId('sketch-pad');
    const canvas = pad.getByTestId('sketch-canvas');
    await expect(pad.getByTestId('sketch-attach')).toBeDisabled();
    // Wait until the dialog has grown in and takes the mouse: while it enters (since #176) a press
    // lands on the page behind it, which counts as a click beside the dialog and closes it.
    await canvas.hover();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not visible');
    // An L-shaped bracket, then a stray line that is taken back.
    const line = async (points: [number, number][]) => {
      const [first, ...rest] = points;
      if (!first) return;
      await page.mouse.move(box.x + box.width * first[0], box.y + box.height * first[1]);
      await page.mouse.down();
      for (const [x, y] of rest) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 8 });
      await page.mouse.up();
    };
    await line([[0.2, 0.2], [0.2, 0.8], [0.7, 0.8], [0.7, 0.7], [0.3, 0.7], [0.3, 0.2], [0.2, 0.2]]);
    await line([[0.8, 0.1], [0.9, 0.3]]);
    await expect(canvas).toHaveAttribute('data-items', '2');
    await pad.getByTestId('sketch-undo').click();
    await expect(canvas).toHaveAttribute('data-items', '1');
    await pad.getByTestId('sketch-redo').click();
    await expect(canvas).toHaveAttribute('data-items', '2');
    await pad.getByTestId('sketch-undo').click();
    // F9: a rectangle, a dimension with its value, a label; the tool keys choose the tools.
    await pad.getByTestId('sketch-tool-rect').click();
    await line([[0.5, 0.15], [0.9, 0.5]]);
    await page.keyboard.press('m');
    await expect(pad.getByTestId('sketch-tool-dimension')).toHaveAttribute('data-selected', 'true');
    await line([[0.5, 0.6], [0.9, 0.6]]);
    await pad.getByTestId('sketch-value').fill('40');
    await page.keyboard.press('Enter');
    await pad.getByTestId('sketch-tool-text').click();
    await line([[0.6, 0.3]]);
    await pad.getByTestId('sketch-value').fill('Lid');
    await page.keyboard.press('Enter');
    await expect(canvas).toHaveAttribute('data-items', '4');
    // Picked and deleted, then taken back.
    await pad.getByTestId('sketch-tool-select').click();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
    await expect(canvas).toHaveAttribute('data-selected', '1');
    await page.keyboard.press('Delete');
    await expect(canvas).toHaveAttribute('data-items', '3');
    await page.keyboard.press('Control+z');
    await expect(canvas).toHaveAttribute('data-items', '4');
    await page.screenshot({ path: test.info().outputPath('sketch-pad.png') });
    // F10: a front view on its own sheet, and a scale; undo and redo cover the sheets.
    await pad.getByTestId('sketch-sheet-front').click();
    await expect(canvas).toHaveAttribute('data-items', '0');
    await pad.getByTestId('sketch-tool-rect').click();
    await line([[0.2, 0.2], [0.6, 0.6]]);
    await expect(canvas).toHaveAttribute('data-items', '1');
    await expect(pad.getByTestId('sketch-sheet-free')).toContainText('4');
    await pad.getByTestId('sketch-scale').fill('x');
    await expect(pad.getByTestId('sketch-attach')).toBeDisabled();
    await pad.getByTestId('sketch-scale').fill('5');
    await page.screenshot({ path: test.info().outputPath('sketch-front.png') });
    await pad.getByTestId('sketch-attach').click();
    await expect(pad).toHaveCount(0);
    await expect(page.getByTestId('composer-sketch')).toBeVisible();
    // A sketch alone is a message: it asks for a part from it.
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('message-sketch')).toHaveText('With a sketch', { timeout: 30_000 });
    await expect(page.getByText('Make a part from my sketch.')).toBeVisible();
    await expect(page.getByText(/I see a PNG picture of \d+ KB with the sketch note, its dimension and its label on two sheets with a scale\./)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('composer-sketch')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('sketch-sent.png') });
    // The message shows the sketch it took along; a click opens it again to change it (polish round 1).
    await page.getByTestId('message-attachment').click();
    await expect(pad).toBeVisible();
    await expect(canvas).toHaveAttribute('data-items', '4');
    await pad.getByRole('button', { name: 'Cancel' }).click();
    await expect(pad).toHaveCount(0);
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a sharing package holds 3MF, STEP, four pictures and a description of the part (F5)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-share-'));
  const projects = join(work, 'projects');
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7914',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByTestId('home-page').locator('[data-template="housing"]').click();
    await expect(page.getByTestId('mesh-summary')).toContainText('6 bodies', { timeout: 30_000 });
    // The lid lying on the housing is the light's one warning.
    await expect(page.getByTestId('print-check')).toHaveAttribute('data-status', 'warn', { timeout: 30_000 });
    await page.getByTestId('export').click();
    await page.getByTestId('export-share').click();
    await expect(page.getByText(/Sharing package saved in exports\\Housing share \d{4}-\d{2}-\d{2}/)).toBeVisible({ timeout: 60_000 });
    const exports = join(projects, 'Housing', 'exports');
    const [folder] = readdirSync(exports);
    if (!folder) throw new Error('no package folder');
    const files = readdirSync(join(exports, folder)).sort();
    expect(files).toEqual(['Housing-front.png', 'Housing-iso.png', 'Housing-right.png', 'Housing-top.png', 'Housing.3mf', 'Housing.step', 'description.md']);
    expect(readFileSync(join(exports, folder, 'Housing-iso.png')).subarray(1, 4).toString()).toBe('PNG');
    expect(readFileSync(join(exports, folder, 'Housing.step'), 'utf8').startsWith('ISO-10303-21')).toBe(true);
    const description = readFileSync(join(exports, folder, 'description.md'), 'utf8');
    expect(description).toContain('# Housing');
    expect(description).toContain('- Supports: none needed, it prints as designed');
    expect(description).toContain('- Housing: 104 × 60 × 30 mm');
    expect(description).toContain('- `insert_hole` = 4 mm – Hole for an M3 heat-set insert (ruthex: 4 mm)');
    // A second package goes beside the first, never over it.
    await page.getByTestId('export').click();
    await page.getByTestId('export-share').click();
    await expect.poll(() => existsSync(join(exports, `${folder} (2)`, 'description.md')), { timeout: 60_000 }).toBe(true);
    expect(readdirSync(exports)).toHaveLength(2);
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a sent sketch is kept in the project, opens again, and a photo goes under a sheet (F10)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-kept-'));
  const projects = join(work, 'projects');
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7916',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    const home = page.getByTestId('home-page');
    await home.locator('[data-template="housing"]').click();
    await expect(home).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('6 bodies', { timeout: 30_000 });
    await page.getByTestId('composer-sketch-open').click();
    const pad = page.getByTestId('sketch-pad');
    const canvas = pad.getByTestId('sketch-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not visible');
    const drag = async (from: [number, number], to: [number, number]) => {
      await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
      await page.mouse.up();
    };
    // Nothing kept yet; then a rectangle with a scale, sent.
    await expect(pad.getByTestId('sketch-kept')).toBeDisabled();
    await pad.getByTestId('sketch-tool-rect').click();
    await drag([0.2, 0.2], [0.6, 0.6]);
    await pad.getByTestId('sketch-scale').fill('5');
    await pad.getByTestId('sketch-attach').click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/I see a PNG picture of \d+ KB with the sketch note\./)).toBeVisible({ timeout: 30_000 });
    const project = readdirSync(projects).find((name) => existsSync(join(projects, name, 'sketches')));
    expect(project).toBeDefined();
    expect(readdirSync(join(projects, project ?? '', 'sketches')).sort()).toEqual([expect.stringMatching(/^sketch-\d{8}-\d{6}\.json$/), expect.stringMatching(/^sketch-\d{8}-\d{6}\.png$/)]);

    // Opened again from the list: the rectangle and the scale are back.
    await page.getByTestId('composer-sketch-open').click();
    await expect(canvas).toHaveAttribute('data-items', '0');
    await pad.getByTestId('sketch-kept').click();
    const kept = page.getByTestId('sketch-kept-entry');
    await expect(kept).toHaveCount(1);
    await expect(kept).toContainText('1 element');
    await kept.click();
    await expect(canvas).toHaveAttribute('data-items', '1');
    await expect(pad.getByTestId('sketch-scale')).toHaveValue('5');
    // A photo under the top sheet, marked with a circle; the picture and the list say so.
    await pad.getByTestId('sketch-sheet-top').click();
    await pad.getByTestId('sketch-photo-file').setInputFiles(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png'));
    await expect(pad.getByTestId('sketch-photo-remove')).toBeVisible();
    await pad.getByTestId('sketch-tool-circle').click();
    await drag([0.5, 0.5], [0.56, 0.5]);
    await page.screenshot({ path: test.info().outputPath('sketch-photo.png') });
    await pad.getByTestId('sketch-attach').click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/I see a PNG picture of \d+ KB with the sketch note over a photo\./)).toBeVisible({ timeout: 30_000 });
    // The log file holds what happened, with times, and nothing of the messages.
    const { readFileSync } = await import('node:fs');
    const logged = readFileSync(join(work, 'partbuddy.log'), 'utf8');
    expect(logged).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \S/m);
    expect(logged).toContain('Claude Code session started');
    expect(logged).not.toContain('Make a part from my sketch');
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a photo goes to the assistant as a picture with its note and is kept in the project (F6)', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-photo-'));
  const projects = join(work, 'projects');
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7915',
    PARTBUDDY_PROJECTS_DIR: projects,
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // A project to keep the photo in: the housing template.
    const home = page.getByTestId('home-page');
    await home.locator('[data-template="housing"]').click();
    await expect(home).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('6 bodies', { timeout: 30_000 });
    // Any photo will do; a template picture stands in for one.
    await page.getByTestId('composer-photo-input').setInputFiles(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png'));
    await expect(page.getByTestId('composer-photo')).toBeVisible();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('message-photo')).toHaveText('With a photo', { timeout: 30_000 });
    await expect(page.getByText('Make a part that fits the object in the photo.')).toBeVisible();
    await expect(page.getByText(/I see a PNG picture of \d+ KB with the photo note and its file\./)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('composer-photo')).toHaveCount(0);
    // The message shows the photo; a click shows it large (polish round 1).
    await page.getByTestId('message-attachment').click();
    await expect(page.getByTestId('photo-large')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('photo-large')).toHaveCount(0);
    const project = readdirSync(projects).find((name) => existsSync(join(projects, name, 'photos')));
    expect(project).toBeDefined();
    expect(readdirSync(join(projects, project ?? '', 'photos'))).toEqual([expect.stringMatching(/^photo-\d{8}-\d{6}\.png$/)]);
    await page.screenshot({ path: test.info().outputPath('photo-sent.png') });

    // Several photos go along with one message, each kept in the project and shown in the chat.
    const pictures = ['housing', 'wallHolder'].map((name) => join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', `${name}.png`));
    await page.getByTestId('composer-photo-input').setInputFiles(pictures);
    await expect(page.getByTestId('composer-photo')).toHaveCount(2);
    // In the order they were chosen, though each is read on its own.
    await expect(page.getByTestId('composer-photo').nth(0)).toContainText('housing.png');
    await expect(page.getByTestId('composer-photo').nth(1)).toContainText('wallHolder.png');
    await page.getByTestId('composer').getByRole('textbox').first().fill('Both sides of the object');
    await page.getByTestId('composer-send').click();
    await expect(page.getByTestId('composer-stop')).toBeHidden({ timeout: 60_000 });
    await expect(page.getByTestId('message-attachment')).toHaveCount(3);
    await expect(page.getByTestId('message-photo').last()).toHaveText('With 2 photos');
    await expect(() => {
      expect(readdirSync(join(projects, project ?? '', 'photos')).filter((name) => /^photo-\d{8}-\d{6}(-2)?\.png$/.test(name))).toHaveLength(3);
    }).toPass({ timeout: 10_000 });
    await page.screenshot({ path: test.info().outputPath('photos-sent.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the exploded view pulls the parts of a print apart for looking (F7)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-explode-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7916',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_START_PAGE: '1',
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByTestId('home-page').locator('[data-template="housing"]').click();
    await expect(page.getByTestId('mesh-summary')).toContainText('6 bodies', { timeout: 30_000 });
    const viewport = page.getByTestId('viewport');
    await page.waitForTimeout(1_000);
    const assembled = await viewport.screenshot();
    // A section and the exploded view exclude each other.
    await page.getByTestId('section').click();
    await expect(page.getByTestId('section-panel')).toBeVisible();
    await page.getByTestId('explode').click();
    await expect(page.getByTestId('section-panel')).toHaveCount(0);
    const panel = page.getByTestId('explode-panel');
    await expect(panel).toBeVisible();
    await panel.getByRole('slider').focus();
    await page.keyboard.press('End');
    await expect(panel.getByRole('slider')).toHaveValue('100');
    await page.waitForTimeout(1_000);
    const apart = await viewport.screenshot();
    expect(apart.equals(assembled)).toBe(false);
    await page.screenshot({ path: test.info().outputPath('exploded.png') });
    // Closing puts the parts back together.
    await page.getByTestId('explode').click();
    await expect(panel).toHaveCount(0);
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

/** The browser's picture events, typed here because the E2E files compile without the DOM library. */
interface PictureEvents {
  DataTransfer: new () => { items: { add(file: unknown): void } };
  File: new (parts: Uint8Array[], name: string, options: { type: string }) => unknown;
  ClipboardEvent: new (type: string, init: object) => Event;
  DragEvent: new (type: string, init: object) => Event;
}

test('a picture pasted into the chat or dropped on it goes along like a photo', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-paste-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7917',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  // A template picture stands in for a screenshot or a photo.
  const bytes = [...readFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png'))];
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    const composer = page.getByRole('textbox', { name: 'Message to the assistant' });
    await expect(composer).toBeEnabled({ timeout: 30_000 });
    // Pasted from the clipboard into the input.
    await composer.evaluate((field, data) => {
      const view = globalThis as unknown as PictureEvents;
      const transfer = new view.DataTransfer();
      transfer.items.add(new view.File([new Uint8Array(data)], 'screenshot.png', { type: 'image/png' }));
      (field as unknown as EventTarget).dispatchEvent(new view.ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, bytes);
    await expect(page.getByTestId('composer-photo')).toBeVisible();
    await page.getByTestId('composer-photo-remove').click();
    await expect(page.getByTestId('composer-photo')).toHaveCount(0);
    // Dragged onto the input and dropped: the chat shows its own note, not the window's import.
    const drag = (types: string[]) =>
      composer.evaluate(
        (field, { data, types: kinds }) => {
          const view = globalThis as unknown as PictureEvents;
          const transfer = new view.DataTransfer();
          transfer.items.add(new view.File([new Uint8Array(data)], 'photo.png', { type: 'image/png' }));
          return kinds.map((type) => {
            const event = new view.DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true });
            (field as unknown as EventTarget).dispatchEvent(event);
            return event.defaultPrevented;
          });
        },
        { data: bytes, types },
      );
    await drag(['dragenter', 'dragover']);
    await expect(page.getByTestId('chat-drop')).toBeVisible();
    await expect(page.getByTestId('file-drop')).toHaveCount(0);
    expect(await drag(['dragover', 'drop'])).toEqual([true, true]);
    await expect(page.getByTestId('composer-photo')).toBeVisible();
    await expect(page.getByTestId('chat-drop')).toHaveCount(0);
    await expect(page.getByTestId('file-drop')).toHaveCount(0);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('message-photo')).toHaveText('With a photo', { timeout: 30_000 });
    await expect(page.getByText(/I see a PNG picture of \d+ KB with the photo note\./)).toBeVisible({ timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('an SVG dropped on the chat goes along exactly: an "O" at 40 mm, 2 mm high, keeps its hole; a harmful file is turned away', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-svg-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7932',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  const fixture = (name: string) => [...readFileSync(join(__dirname, '..', 'test', 'fixtures', 'svg', name))];
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    const composer = page.getByRole('textbox', { name: 'Message to the assistant' });
    await expect(composer).toBeEnabled({ timeout: 30_000 });
    const drop = (name: string, data: number[]) =>
      composer.evaluate(
        (field, file) => {
          const view = globalThis as unknown as PictureEvents;
          const transfer = new view.DataTransfer();
          transfer.items.add(new view.File([new Uint8Array(file.data)], file.name, { type: 'image/svg+xml' }));
          for (const type of ['dragover', 'drop']) (field as unknown as EventTarget).dispatchEvent(new view.DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
        },
        { name, data },
      );
    // A file with a script is turned away with a reason, and nothing goes along.
    await drop('evil.svg', fixture('script.svg'));
    await expect(page.getByTestId('composer-drawing-problem')).toContainText('for safety PartBuddy does not read it');
    await expect(page.getByTestId('composer-drawing')).toHaveCount(0);
    // SVG markup pasted from a drawing program becomes a drawing, not text in the message.
    await composer.evaluate((field, markup) => {
      const view = globalThis as unknown as { DataTransfer: new () => { setData(type: string, value: string): void }; ClipboardEvent: PictureEvents['ClipboardEvent'] };
      const transfer = new view.DataTransfer();
      transfer.setData('text/plain', markup);
      (field as unknown as EventTarget).dispatchEvent(new view.ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, readFileSync(join(__dirname, '..', 'test', 'fixtures', 'svg', 'illustrator.svg'), 'utf8'));
    await expect(page.getByTestId('composer-drawing-name')).toHaveText('Pasted drawing');
    await expect(composer).toHaveValue('');
    await page.getByTestId('composer-drawing-remove').click();
    // A white sheet behind a star is no part of the logo: left out, and the composer says so.
    await drop('star-on-sheet.svg', fixture('star-on-sheet.svg'));
    await expect(page.getByTestId('composer-drawing-backdrop')).toContainText('Background or frame around the drawing left out');
    await page.getByTestId('composer-drawing-remove').click();
    await expect(page.getByTestId('composer-drawing-backdrop')).toHaveCount(0);
    // A bar 0.2 mm high at 20 mm wide is narrower than the 0.4 mm nozzle: shown, marked, and widened on a click.
    await drop('thin-bar.svg', fixture('thin-bar.svg'));
    const detail = page.getByTestId('drawing-detail');
    await expect(detail).toContainText('One place is narrower than the nozzle (0.4 mm), the narrowest 0.2 mm');
    await page.getByTestId('drawing-detail-show').click();
    await expect(page.getByTestId('photo-large')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('svg-detail-marked.png') });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('svg-detail.png') });
    await page.getByTestId('drawing-detail-widen').click();
    await expect(page.getByTestId('composer-drawing-width').getByRole('textbox')).toHaveValue('44');
    await expect(detail).toHaveCount(0, { timeout: 5_000 });
    await page.getByTestId('composer-drawing-remove').click();
    // The "O" says 20 mm in its file; the user makes it 40.
    await drop('logo-o.svg', fixture('logo-o.svg'));
    const chip = page.getByTestId('composer-drawing');
    await expect(chip).toBeVisible();
    await expect(page.getByTestId('composer-drawing-problem')).toHaveCount(0);
    await expect(page.getByTestId('composer-drawing-name')).toHaveText('logo-o');
    const width = page.getByTestId('composer-drawing-width').getByRole('textbox');
    await expect(width).toHaveValue('20');
    await width.fill('40');
    await width.press('Tab');
    await expect(page.getByTestId('composer-drawing-height')).toHaveText('× 40 mm');
    await page.screenshot({ path: test.info().outputPath('svg-composer.png') });
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('message-drawing')).toHaveText('With SVG drawing', { timeout: 30_000 });
    const answer = page.getByText(/^Drawing: /);
    await expect(answer).toContainText('40 × 40 mm as the user sized it, 2 closed loops, 1 of them hole', { timeout: 60_000 });
    await expect(answer).toContainText('Built: yes');
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 30_000 });
    // The ring's volume π(20² − 12²)·2 = 1608.5 mm³; 0.05 mm off on both circles moves it by 20 mm³.
    const text = (await answer.textContent()) ?? '';
    const volume = Number(/"volume(?:_mm3)?"\s*:\s*([\d.]+)/.exec(text)?.[1] ?? /volume[^\d]*([\d.]+)/i.exec(text)?.[1]);
    expect(volume, text).toBeGreaterThan(1608.5 - 20);
    expect(volume, text).toBeLessThan(1608.5 + 20);
    await page.screenshot({ path: test.info().outputPath('svg-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('an SVG sent along is placed as a logo by partbuddy_place_drawing: engraved and centred on the face', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-place-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7934',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  const composer = page.getByRole('textbox', { name: 'Message to the assistant' });
  const say = async (text: string) => {
    await composer.fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
  };
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await say('Build a box');
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    const data = [...readFileSync(join(__dirname, '..', 'test', 'fixtures', 'svg', 'logo-o.svg'))];
    await composer.evaluate((field, bytes) => {
      const view = globalThis as unknown as PictureEvents;
      const transfer = new view.DataTransfer();
      transfer.items.add(new view.File([new Uint8Array(bytes)], 'logo-o.svg', { type: 'image/svg+xml' }));
      for (const type of ['dragover', 'drop']) (field as unknown as EventTarget).dispatchEvent(new view.DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, data);
    await expect(page.getByTestId('composer-drawing')).toBeVisible();
    // Put down off the middle of the 20 mm box's top face, then centred: the "O" 10 mm wide, 0.6 mm deep.
    await say('Place the logo {"drawing": "svg-1", "body": "Body1", "point": [4, 5, 10], "normal": [0, 0, 1], "mode": "deboss", "depth": 0.6, "width": 10, "centre": "both"}');
    await expect(page.getByText(/^Logo: Placed "SVG-Logo logo-o" on Body1 \(engraved 0\.6 mm, 10 mm wide\)\. Moved .*its middle is now at \[10, 10, 10\] mm/)).toBeVisible({ timeout: 60_000 });
    await say('Measure the bodies');
    const answer = page.getByText(/^Measured: /);
    await expect(answer).toBeVisible({ timeout: 30_000 });
    const measured = JSON.parse(/\{.*\}/.exec((await answer.textContent()) ?? '')?.[0] ?? '{}') as { bodies: { name: string; volume_mm3: number }[] };
    // The ring π(5² − 3²) = 16π mm², 0.6 mm deep, out of the 4000 mm³ box.
    expect(measured.bodies.find((entry) => entry.name === 'Body1')?.volume_mm3).toBeCloseTo(4000 - 16 * Math.PI * 0.6, 0);
    await page.screenshot({ path: test.info().outputPath('logo-placed.png') });

    // Picked on the part, the dock moves it: the distance from the face's middle, exactly, then centred again.
    await page.waitForTimeout(800);
    const view = await page.getByTestId('viewport').boundingBox();
    if (!view) throw new Error('viewport not visible');
    const panel = page.getByTestId('logo-move');
    let spotOnLogo: [number, number] = [0, 0];
    const pickLogo = async () => {
      for (let y = 0.3; y <= 0.7; y += 0.04) {
        for (let x = 0.3; x <= 0.7; x += 0.04) {
          await page.mouse.click(view.x + view.width * x, view.y + view.height * y);
          if (await panel.waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false)) {
            // The whole logo is picked: its name heads the dock, no face or edge, its contours drawn.
            await expect(page.getByTestId('logo-picked')).toBeVisible();
            await expect(page.getByTestId('selection-bar')).toHaveCount(0);
            spotOnLogo = [view.x + view.width * x, view.y + view.height * y];
            return true;
          }
        }
      }
      return false;
    };
    expect(await pickLogo(), 'a click on the logo').toBe(true);
    // Alt+click on the same spot picks exactly the face or edge there, without the logo controls.
    await page.keyboard.down('Alt');
    await page.mouse.click(...spotOnLogo);
    await page.keyboard.up('Alt');
    await expect(page.getByTestId('selection-bar')).toBeVisible();
    await expect(panel).toHaveCount(0);
    await page.mouse.click(...spotOnLogo);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    const across = page.getByTestId('logo-x').getByRole('textbox');
    await expect(across).toHaveValue('0');
    await expect(page.getByTestId('logo-arrow-x')).toBeVisible();
    await across.fill('3');
    await across.press('Tab');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('logo-move-preview.png') });
    let revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('logo-move-apply').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    type Logos = { partbuddy: { design: { logoAt(point: number[]): Promise<{ logo: string; offset: number[] | null } | null> } } };
    const at = (point: number[]) => page.evaluate((p) => (globalThis as unknown as Logos).partbuddy.design.logoAt(p), point);
    expect(await at([13, 10, 9.4])).toMatchObject({ logo: 'SVG-Logo logo-o', offset: [3, 0] });
    await expect(page.getByTestId('step-text').last()).toHaveText('Logo “logo-o” moved');

    expect(await pickLogo(), 'a click on the moved logo').toBe(true);
    await expect(page.getByTestId('logo-x').getByRole('textbox')).toHaveValue('3');
    revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('logo-centre').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    expect(await at([10, 10, 9.4])).toMatchObject({ offset: [0, 0] });

    // The arrow across: dragged, the field follows, and let go, the logo moves there.
    expect(await pickLogo(), 'a click on the centred logo').toBe(true);
    const arrow = page.getByTestId('logo-arrow-x');
    // The arrow turns to its line on the next frame: wait for that before reading it.
    const turnOf = async () => Number(/rotate\((-?[\d.e-]+)rad\)/.exec((await arrow.locator('div').first().getAttribute('style')) ?? '')?.[1] ?? Number.NaN);
    await expect.poll(turnOf, { timeout: 10_000 }).not.toBeNaN();
    const turn = await turnOf();
    const grip = await arrow.boundingBox();
    if (!grip) throw new Error('arrow not visible');
    const [gx, gy] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
    revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i += 1) await page.mouse.move(gx + Math.cos(turn) * 5 * i, gy + Math.sin(turn) * 5 * i);
    const dragged = Number(await page.getByTestId('logo-x').getByRole('textbox').inputValue());
    expect(dragged, 'the field follows the arrow').toBeGreaterThan(0);
    await page.mouse.up();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    expect(await at([10 + dragged, 10, 9.4])).toMatchObject({ offset: [dragged, 0] });
    await page.screenshot({ path: test.info().outputPath('logo-moved.png') });

    // Deeper through the field: 1 mm instead of 0.6, the box loses the ring 1 mm deep.
    expect(await pickLogo(), 'a click on the dragged logo').toBe(true);
    const depth = page.getByTestId('logo-depth').getByRole('textbox');
    await expect(depth).toHaveValue('0.6');
    await expect(page.getByTestId('logo-arrow-depth')).toBeVisible();
    await depth.fill('1');
    await depth.press('Tab');
    revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('logo-move-apply').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    await expect(page.getByTestId('step-text').last()).toHaveText('Logo “logo-o” set to 1 mm');
    await say('Measure the bodies');
    await expect(page.getByText(/^Measured: /)).toHaveCount(2, { timeout: 30_000 });
    const deeper = JSON.parse(/{.*}/.exec((await page.getByText(/^Measured: /).last().textContent()) ?? '')?.[0] ?? '{}') as { bodies: { name: string; volume_mm3: number }[] };
    expect(deeper.bodies.find((entry) => entry.name === 'Body1')?.volume_mm3).toBeCloseTo(4000 - 16 * Math.PI, 0);

    // A quarter turn left from the dock: the field reads level before and 90° after.
    expect(await pickLogo(), 'a click on the deeper logo').toBe(true);
    await expect(page.getByTestId('logo-angle').getByRole('textbox')).toHaveValue('0');
    await page.getByTestId('logo-move').screenshot({ path: test.info().outputPath('logo-dock.png') });
    revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('logo-turn-left').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    await expect(page.getByTestId('step-text').last()).toHaveText('Logo “logo-o” turned by 90°');
    expect(await at([10 + dragged, 10, 9]), 'the turned logo').toMatchObject({ angle: 90 });

    // Twice as wide through the field: the ring 20 mm across, still about its middle.
    expect(await pickLogo(), 'a click on the turned logo').toBe(true);
    const wide = page.getByTestId('logo-width').getByRole('textbox');
    await expect(wide).toHaveValue('10');
    await wide.fill('20');
    await wide.press('Tab');
    revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('logo-move-apply').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 15_000 });
    await expect(page.getByTestId('step-text').last()).toHaveText('Logo “logo-o” made 20 mm wide');
    const grown = (await at([10 + dragged, 10, 9])) as unknown as { box: number[] } | null;
    expect((grown?.box[2] ?? 0) - (grown?.box[0] ?? 0)).toBeCloseTo(20, 0);

    // The same drawing as a part of its own beside the box (a pendant): a new body, and a logo the dock can change.
    await say('Place the logo {"drawing": "svg-1", "mode": "part", "depth": 2, "width": 10, "point": [40, 0, 0]}');
    await expect(page.getByText(/^Logo: Built "SVG-Logo logo-o 2" \(a part of its own 2 mm, 10 mm wide\)/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    // No face under it to measure from; 2 mm high, standing up.
    expect(await at([42, 0, 2])).toMatchObject({ logo: 'SVG-Logo logo-o 2', offset: null, depth: { value: 2, raised: true } });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

// A real local model (F8): needs a local server with a tool-capable model; set PARTBUDDY_E2E_OLLAMA=1.
// PARTBUDDY_E2E_LOCAL_PICK picks a model by part of its name ("llama.cpp", "LM Studio", "vLLM").
test('a local model builds a part in SolidCraft through the policy (F8)', async () => {
  test.skip(process.env.PARTBUDDY_E2E_OLLAMA !== '1', 'needs a local model server; set PARTBUDDY_E2E_OLLAMA=1');
  test.setTimeout(900_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-local-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7918',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByTestId('agent-status').click();
    await page.getByTestId('agent-menu').getByText('Local model', { exact: true }).click();
    await expect(page.getByTestId('agent-status')).toContainText(/Local model · \S+/, { timeout: 30_000 });
    const pick = process.env.PARTBUDDY_E2E_LOCAL_PICK;
    if (pick) {
      await page.getByTestId('agent-menu').getByTestId('model-option').filter({ hasText: pick }).first().click();
      await expect(page.getByTestId('agent-status')).toContainText(pick);
    }
    await page.keyboard.press('Escape');
    const composer = page.getByRole('textbox', { name: 'Message to the assistant' });
    await composer.fill('Build a solid box 20 mm long, 20 mm wide and 10 mm high right away with the solidcraft tools. Do not ask questions.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 840_000 });
    await page.screenshot({ path: test.info().outputPath('local-model.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the tolerance assistant has SolidCraft build its test pieces and shows a picture of them', async () => {
  test.setTimeout(240_000);
  const { existsSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-test-pieces-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7931',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_CACHE_DIR: join(work, 'cache'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByTestId('settings').click();
    await page.getByTestId('settings-print').click();
    const dialog = page.getByTestId('print-profiles');
    await dialog.getByTestId('print-tab-material').click();
    await dialog.getByTestId('tolerance-start').click();
    const assistant = page.getByTestId('tolerance-assistant');
    await assistant.getByTestId('tolerance-next').click();
    await expect(assistant.getByTestId('tolerance-picture')).toBeVisible({ timeout: 120_000 });
    expect(existsSync(join(work, 'cache', 'test-pieces', 'test-pieces-0.4-0.2.sc'))).toBe(true);
    await page.screenshot({ path: test.info().outputPath('tolerance-pieces.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a built text is picked as a whole and changed afterwards: words, height and font, with a size arrow (F1)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-text-edit-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7935',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  type Bridge = { partbuddy: { design: { applyBlock(block: unknown): Promise<void> } } };
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 6 faces', { timeout: 30_000 });
    // Raised 0.6 mm on the top face's middle, the sketch named after its words.
    const text = { block: 'text', body: 'Body1', point: [10, 10, 10], normal: [0, 0, 1], size: 'M3', text: 'PB', height: 6, depth: 0.6, mode: 'emboss', bold: false };
    await page.evaluate((b) => (globalThis as unknown as Bridge).partbuddy.design.applyBlock(b), text);
    await expect(page.getByText('Text PB', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // Seen from the top (key 7), the letters lie flat in the middle.
    await page.getByTestId('viewport').hover();
    await page.keyboard.press('7');
    await page.waitForTimeout(1000);
    // A plain click on the letters picks the whole text: its own controls instead of the face's.
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    const spots = [[0.5, 0.5], [0.48, 0.5], [0.52, 0.5], [0.5, 0.48], [0.5, 0.52], [0.46, 0.5], [0.54, 0.5]] as const;
    let spot = 0;
    await expect(async () => {
      const [x, y] = spots[spot++ % spots.length] ?? [0.5, 0.5];
      await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await expect(page.getByTestId('logo-text')).toBeVisible({ timeout: 3000 });
    }, 'the built text under a click').toPass({ timeout: 60_000, intervals: [500] });
    await expect(page.getByTestId('logo-picked')).toContainText('Text “PB”');
    await expect(page.getByTestId('logo-words').getByRole('textbox')).toHaveValue('PB');
    await expect(page.getByTestId('logo-text-height').getByRole('textbox')).toHaveValue('6');
    await expect(page.getByTestId('logo-arrow-size')).toBeVisible();
    // New words, height and font: tried as a ghost, applied in its sketch.
    await page.getByTestId('logo-words').getByRole('textbox').fill('AB');
    await page.getByTestId('logo-text-height').getByRole('textbox').fill('4');
    await page.getByTestId('logo-text-height').getByRole('textbox').press('Tab');
    // Segoe Print's bold face is found only by its full name: set so, it builds.
    await page.getByTestId('block-font').getByRole('combobox').fill('Segoe Print');
    await page.getByRole('option', { name: 'Segoe Print', exact: true }).click();
    await page.getByTestId('logo-bold').getByText('Bold').click();
    await expect(page.getByTestId('logo-bold').getByRole('checkbox')).toBeChecked();
    const revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.screenshot({ path: test.info().outputPath('text-edit.png') });
    await page.getByTestId('logo-move-apply').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 30_000 });
    // Picked again, it reads back as changed.
    spot = 0;
    await expect(async () => {
      const [x, y] = spots[spot++ % spots.length] ?? [0.5, 0.5];
      await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await expect(page.getByTestId('logo-words').getByRole('textbox')).toHaveValue('AB', { timeout: 3000 });
    }, 'the changed text under a click').toPass({ timeout: 60_000, intervals: [500] });
    await expect(page.getByTestId('logo-text-height').getByRole('textbox')).toHaveValue('4');
    await expect(page.getByTestId('block-font').getByRole('combobox')).toHaveValue('Segoe Print');
    await expect(page.getByTestId('logo-bold').getByRole('checkbox')).toBeChecked();
    // Bahnschrift, a variable font, is set bold the other way (the family with bold): tried once, then applied.
    await page.getByTestId('block-font').getByRole('combobox').fill('Bahnschrift');
    await page.getByRole('option', { name: 'Bahnschrift', exact: true }).click();
    const before = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('logo-move-apply').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', before ?? '', { timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a hole is placed on its face before it is drilled: across and up from the middle, centred, with arrows', async () => {
  test.setTimeout(180_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-hole-place-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7936',
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
    await page.getByTestId('viewport').hover();
    await page.keyboard.press('7');
    await page.waitForTimeout(1000);
    const box = await page.getByTestId('viewport').boundingBox();
    if (!box) throw new Error('viewport not visible');
    await expect(async () => {
      await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);
      await page.getByTestId('action-hole').click({ timeout: 1500 });
    }, 'the top face and its hole button').toPass({ timeout: 30_000, intervals: [500] });
    // Placed like a block: fields from the face's middle, centre buttons, arrows on the part.
    await expect(page.getByTestId('hole-position')).toBeVisible();
    await expect(page.getByTestId('hole-arrow-x')).toBeVisible();
    await page.getByTestId('hole-centre-both').click();
    await expect(page.getByTestId('hole-x').getByRole('textbox')).toHaveValue('0');
    await page.getByTestId('hole-x').getByRole('textbox').fill('4');
    await page.getByTestId('hole-x').getByRole('textbox').press('Tab');
    await expect(page.getByTestId('action-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
    const revision = await page.getByTestId('viewer').getAttribute('data-revision');
    await page.getByTestId('action-apply').click();
    await expect(page.getByTestId('viewer')).not.toHaveAttribute('data-revision', revision ?? '', { timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).not.toContainText('· 6 faces', { timeout: 30_000 });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a hinge the assistant joined moves with its slider and goes back to as designed (ADR 0027)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-joints-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7937',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    // A part alone has no joint, so the tool is not there.
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a hinge');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    // The bodies keep their names as components, and the joint SolidCraft lists shows as a slider.
    await page.getByTestId('joints').click({ timeout: 30_000 });
    const slider = page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' });
    await expect(slider).toHaveValue('0');
    // The light swept the joint: folding down it lies flat on the base at the limit, upwards the flap's edge meets the base.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings.locator('[data-kind="blocked"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(findings.locator('[data-kind="blocked"]')).toContainText('Hinge: Flap and Base touch at 28.1° – the joint does not reach its limit of 90°');
    await page.screenshot({ path: test.info().outputPath('hinge-blocked.png') });
    // Escape reaches the findings only once they have the focus: again until they are gone.
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.screenshot({ path: test.info().outputPath('hinge-as-designed.png') });
    // Dragged, the flap follows in the view at once, before SolidCraft is asked: the revision stays, a body is turned.
    const turned = () =>
      page.evaluate(() => {
        interface Node3 {
          isGroup?: boolean;
          quaternion: { w: number };
        }
        const canvas = (globalThis as unknown as { document: { querySelector(selector: string): { __r3f?: () => { scene: { traverse(visit: (node: Node3) => void): void } } } | null } }).document.querySelector('[data-testid="viewport"] canvas');
        let count = 0;
        canvas?.__r3f?.().scene.traverse((node) => {
          if (node.isGroup && Math.abs(node.quaternion.w) < 0.9999) count += 1;
        });
        return count;
      });
    expect(await turned()).toBe(0);
    const revision = await page.getByTestId('connection-status').textContent();
    const track = await page.getByTestId('joint-value').locator('.relative').first().boundingBox();
    if (!track) throw new Error('the slider has no track');
    // The limits are -180° and 90°, so 0° is two thirds along the track.
    await page.mouse.move(track.x + (track.width * 2) / 3, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 3, track.y + track.height / 2, { steps: 8 });
    await expect.poll(turned).toBe(1);
    await page.waitForTimeout(600);
    await page.screenshot({ path: test.info().outputPath('hinge-dragging.png') });
    expect(await page.getByTestId('connection-status').textContent()).toBe(revision);
    // Let go: SolidCraft drives the joint, the mirror shows the flap there, and nothing is turned on top of it.
    await page.mouse.up();
    await expect(page.getByTestId('connection-status')).not.toHaveText(revision ?? '', { timeout: 30_000 });
    await expect.poll(turned, { timeout: 30_000 }).toBe(0);
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' })).toHaveValue(/^-(8\d|9\d)$/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: test.info().outputPath('hinge-dragged.png') });
    // To the lower limit: SolidCraft folds the flap onto the base, and the mirror brings the value back.
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' })).toHaveValue('-180', { timeout: 30_000 });
    await expect(page.getByTestId('joint-reset')).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('hinge-folded.png') });
    await page.getByTestId('print-check').click();
    await expect(findings.locator('[data-kind="posed"]')).toContainText('Hinge stands at -180°, not as designed', { timeout: 30_000 });
    // Escape reaches the findings only once they have the focus: again until they are gone.
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId('joint-reset').click();
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Hinge' })).toHaveValue('0', { timeout: 30_000 });
    await expect(page.getByTestId('joint-error')).toHaveCount(0);
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a hinge plays in the view, stops where SolidCraft found the parts touching, and is driven only when the position is kept (ADR 0027)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-joints-play-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7938',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a hinge');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    // The light swept the joint in SolidCraft: upwards the flap's edge meets the base at 28.1°.
    await page.getByTestId('print-check').click({ timeout: 30_000 });
    const findings = page.getByTestId('print-check-panel');
    await expect(findings.locator('[data-kind="blocked"]')).toContainText('Hinge: Flap and Base touch at 28.1°', { timeout: 30_000 });
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    const revision = await page.getByTestId('connection-status').textContent();
    // One click plays it: down to its limit first (the longer way), then up until the parts touch.
    await page.getByTestId('joints-play').click();
    const panel = page.getByTestId('joint-panel');
    await panel.getByRole('radio', { name: '2×' }).click();
    const shown = async () => Number(await panel.getByTestId('joint-value').getAttribute('data-shown'));
    await expect.poll(shown, { timeout: 30_000 }).toBeLessThan(-20);
    await page.screenshot({ path: test.info().outputPath('hinge-playing.png') });
    const stopped = panel.getByTestId('joint-stopped');
    await expect(stopped).toHaveText('Flap and Base touch here: at 28.1°. Playing goes back from there.', { timeout: 60_000 });
    expect(await shown()).toBeCloseTo(28.1);
    await page.screenshot({ path: test.info().outputPath('hinge-stopped.png') });
    // SolidCraft was not driven: the revision is the one before.
    await expect(page.getByTestId('connection-status')).toHaveText(revision ?? '');
    await expect(panel.getByTestId('joint-view-only')).toBeVisible();
    // Kept, SolidCraft drives the joint to what the panel reads, and the light says it stands there.
    await panel.getByTestId('joint-keep').click();
    await expect(page.getByTestId('connection-status')).not.toHaveText(revision ?? '', { timeout: 30_000 });
    await expect(panel.getByTestId('joint-value').locator('output')).toHaveText('28.1°', { timeout: 30_000 });
    await expect(panel.getByTestId('joint-keep')).toHaveCount(0);
    await page.getByTestId('print-check').click();
    await expect(findings.locator('[data-kind="posed"]')).toContainText('Hinge stands at 28.1°', { timeout: 30_000 });
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await panel.getByTestId('joint-reset').click();
    await expect(panel.getByRole('slider', { name: 'Hinge' })).toHaveValue('0', { timeout: 30_000 });
    await expect(panel.getByTestId('joint-error')).toHaveCount(0);
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true });
  }
});

test('the assistant builds a print-in-place hinge with one call: one piece per body, joined, limits where the parts meet (G3)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-hinge-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7938',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a hinged flap');
    await page.getByRole('button', { name: 'Send' }).click();
    // PartBuddy's answer to the tool: the gap is the nozzle of the printer in use, and the limits are where the plates meet.
    await expect(page.getByText(/Built the hinge "Flap hinge" between Base \(stays\) and Flap \(turns\): 3 knuckles, barrel 6 mm, pin 3 mm, gap 0\.4 mm everywhere\. It turns from -145° to 67°/)).toBeVisible({ timeout: 60_000 });
    // Knuckles and pin grew onto their bodies: still two bodies, none loose.
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    // The hinge is one step of the work log.
    await expect(page.getByText('Hinge “Flap hinge” between two parts, with its joint')).toHaveCount(1);
    await page.getByTestId('joints').click({ timeout: 30_000 });
    const slider = page.getByTestId('joint-panel').getByRole('slider', { name: 'Flap hinge' });
    await expect(slider).toHaveAttribute('min', '-145');
    await expect(slider).toHaveAttribute('max', '67');
    // The limits are clear of the contact, so the light has no joint that is stopped on its way, and nothing overlaps.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="blocked"], [data-kind="overlap"], [data-kind="tight"], [data-kind="posed"]')).toHaveCount(0);
    // The standard barrel keeps two lines over the roof of its bore: no thin wall.
    await expect(findings.locator('[data-kind="overhang"]')).toHaveCount(1);
    await expect(findings.locator('[data-kind="thinWall"]')).toHaveCount(0);
    // Escape reaches the findings only once they have the focus: again until they are gone.
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    // Opened as far as it goes, the flap stands where SolidCraft put it.
    await slider.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Flap hinge' })).toHaveValue('67', { timeout: 30_000 });
    await expect(page.getByTestId('joint-reset')).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('hinge-built-open.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant builds a dovetail guide with one call: joined as a slider that stays on its rail (G3)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-slide-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7939',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a sliding carriage');
    await page.getByRole('button', { name: 'Send' }).click();
    // The carriage lies over 20 to 40 mm of a 60 mm rail: 20 mm each way.
    await expect(page.getByText(/Built the guide "Carriage guide" between Base \(stays\) and Carriage \(slides\): a dovetail rail 6 mm wide at its foot and 3 mm high, gap 0\.4 mm everywhere\. It slides from -20 mm to 20 mm/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    await page.getByTestId('joints').click({ timeout: 30_000 });
    const slider = page.getByTestId('joint-panel').getByRole('slider', { name: 'Carriage guide' });
    await expect(page.getByText('Guide “Carriage guide” between two parts, with its joint')).toHaveCount(1);
    await expect(slider).toHaveAttribute('min', '-20');
    await expect(slider).toHaveAttribute('max', '20');
    // Rail and groove neither overlap nor come closer than the push fit, and nothing stops the travel.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="blocked"], [data-kind="overlap"], [data-kind="tight"], [data-kind="posed"]')).toHaveCount(0);
    // Escape reaches the findings only once they have the focus: again until they are gone.
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Carriage guide' })).toHaveValue('20', { timeout: 30_000 });
    await expect(page.getByTestId('joint-reset')).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('guide-built-moved.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant hangs a part on the wall with its blocks: keyhole slots on the back, countersunk holes and magnet pockets on the front', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-wall-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7956',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a wall plate');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built 2 keyhole slots for 4 mm wood screws in Plate: entry 9 mm for the head, a slot 4\.5 mm wide running 8 mm up .* Built 2 countersunk holes for 4 mm wood screws in Plate: 4\.7 mm through, countersink 8\.8 mm at 90°/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 30_000 });
    // Each block is one line of the work log, and no feature failed.
    await expect(page.getByText('Keyhole slot for a 4 mm screw, to hang on a wall')).toHaveCount(1);
    await expect(page.getByText('Countersunk hole for a 4 mm wood screw')).toHaveCount(1);
    await expect(page.getByText(/Built 2 pockets for 6 × 2 mm disc magnets in Plate: 6\.3 mm wide and 2\.2 mm deep/)).toBeVisible();
    await expect(page.getByText('Pocket for a 6 × 2 mm magnet')).toHaveCount(1);
    await expect(page.getByText(/SolidCraft warns:/)).toHaveCount(0);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('wall-plate-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant makes a knob for a D shaft with one call: a part of its own that prints on its top', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-knob-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7957',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a volume knob');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built the knob "Volume" for a 6 mm D shaft \(flat at 4\.5 mm\): the bore is 6\.2 mm wide and 11 mm deep, flat over its last 7 mm .* with a chamfered mouth, to push on.* with 11 flutes to grip/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/SolidCraft warns:/)).toHaveCount(0);
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 30_000 });
    await expect(page.getByText('Knob “Volume” for a shaft')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('knob-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant latches a lid onto its box: the arm grows out of the lid and its hook lies under the bead, no shared volume', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-latch-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7960',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a latched box');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built the latch "Front latch": an arm 10 mm wide and 1\.6 mm thick grows out of the wall of Lid \(the lid\), hangs 1\.5 mm off the wall over the joint and snaps with its hook under a bead 1\.2 mm high on Box/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Warning:/)).toHaveCount(0);
    await expect(page.getByText(/stand apart/)).toHaveCount(0);
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    await expect(page.getByText('Snap latch “Front latch” outside, between lid and box')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="overlap"]')).toHaveCount(0);
    // Bead and hook end in a flat crest, not a knife edge the nozzle cannot print.
    await expect(findings.locator('[data-kind="thinWall"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('latch-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant plugs the halves of a split block together: pegs in their pockets, no shared volume', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-plug-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7959',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a split block');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built 2 pegs "Alignment" on Left with their pockets in Right: 5 mm thick and 7\.5 mm long, 0\.2 mm clear per side/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Warning:/)).toHaveCount(0);
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    await expect(page.getByText('Plugged connection “Alignment” between two parts')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="overlap"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('plug-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant clips a cover onto its base with snap hooks: each hook catches in its window and the parts share no volume', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-snap-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7958',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a clipped cover');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built 1 snap hook "Back clip" on Base, each with its window through the 2 mm wall of Cover: an arm 12 mm long, 1\.5 mm thick and 5 mm wide, 0\.2 mm off the wall.* Built 1 snap hook "Front clip" on Base/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Warning:/)).toHaveCount(0);
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    await expect(page.getByText('Snap hooks “Back clip” with their windows')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    // Hooks and cover share no volume: each catch lies in its window.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="overlap"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('snap-hooks-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant makes a screw lid for a jar with one call: the threads mesh as built and the lid prints on its top', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-lid-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7955',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a jar with a screw lid');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built the screw lid "Jar lid" for Jar: a thread with 45° flanks on the neck, pitch 4 mm, 1\.2 mm deep, 1 start, and the same inside the lid, 0\.3 mm clear; it closes in 1\.75 turns/)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/Warning:/)).toHaveCount(0);
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    await expect(page.getByText('Screw lid “Jar lid” with its thread on the container')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    // The two threads share no volume: they were built to mesh.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="overlap"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('screw-lid-built.png') });
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(findings).toBeHidden({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    // On the plate the lid lies on its top, the jar stands: two parts side by side.
    await page.getByRole('radio', { name: 'Plate' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: test.info().outputPath('screw-lid-plate.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant builds a screw joint with one call: holes on one line in both parts and the screws as standard parts', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-screw-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7954',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a screwed plate');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built 2 screw joints "Plate screws" that hold Plate on Block: .* To buy: 2 × M3×8 socket head cap screws \(ISO 4762\) and 2 M3 heat-set inserts 5\.7 mm long/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Warning:/)).toHaveCount(0);
    // Block, plate and two screws, which the tree knows as standard parts.
    await expect(page.getByTestId('mesh-summary')).toContainText('4 bodies', { timeout: 30_000 });
    await expect(page.getByText('standard part', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Screw joint “Plate screws” between two parts')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    // The screws overlap nothing: every hole is where its screw is.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="overlap"]')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('screw-joint-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('the assistant builds a snap closure with one call: a lip in the lid, its bead in a rille of the box, no overlap (G3)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-closure-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7953',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a snap lid');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built the closure "Lid closure" between Box \(the box\) and Lid \(the lid\): a lip 1\.2 mm thick and 4 mm high inside the lid, 0\.25 mm clear of the box's wall, a bead that snaps 0\.25 mm into a rille/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Warning:/)).toHaveCount(0);
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 30_000 });
    // The closure is one step of the work log, and no feature of it failed.
    await expect(page.getByText('Snap closure “Lid closure” between lid and box')).toHaveCount(1);
    await expect(page.locator('[data-testid="timeline-feature"][data-state="error"]')).toHaveCount(0);
    // Lip and box neither overlap nor stop anything: there is no joint.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(findings.locator('[data-kind="blocked"], [data-kind="overlap"]')).toHaveCount(0);
    // What the light does say: the lid lies on the box, as it is built.
    await expect(findings).toContainText('Box and Lid touch but are separate bodies');
    await page.screenshot({ path: test.info().outputPath('closure-built.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a hinge whose line is out of reach of the bodies is taken back, with where the line goes (G3)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-hinge-far-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7940',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a flap out of reach');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Not built: 3 piece\(s\) did not touch their body and stand apart from it\. Put the hinge line within 2\.5 mm of both bodies .* Everything was taken back; call again with the line moved\./)).toBeVisible({ timeout: 60_000 });
    // The two plates are as they were: no knuckle, no cut, no joint.
    await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies · 12 faces', { timeout: 30_000 });
    await expect(page.getByTestId('joints')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('hinge-taken-back.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a hinge between bodies that are components already moves as a whole: its knuckles do not stay behind (G3)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-hinge-components-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7941',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a flap of components');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built the hinge "Flap hinge" between Base \(stays\) and Flap \(turns\).* It turns from -145° to 67°/)).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('joints').click({ timeout: 30_000 });
    const slider = page.getByTestId('joint-panel').getByRole('slider', { name: 'Flap hinge' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Flap hinge' })).toHaveValue('67', { timeout: 30_000 });
    await expect(page.getByTestId('joint-reset')).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: test.info().outputPath('hinge-components-open.png') });
    // Knuckles built from the design level would stay behind now: SolidCraft would warn that the flap is
    // in separate pieces, and they would cut into the turned flap.
    await page.getByTestId('print-check').click();
    const findings = page.getByTestId('print-check-panel');
    await expect(findings.locator('[data-kind="posed"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(findings.locator('[data-kind="feature"], [data-kind="overlap"]')).toHaveCount(0);
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('a slot built into a hinged flap stays in it when the flap turns (ADR 0027)', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-slot-flap-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7942',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a hinged flap');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Built the hinge "Flap hinge"/)).toBeVisible({ timeout: 60_000 });
    const summary = page.getByTestId('mesh-summary');
    await expect(summary).toContainText('2 bodies', { timeout: 30_000 });
    const before = (await summary.textContent()) ?? '';
    // The slot block, as the form sends it: a sketch on the flap's top face, cut through.
    await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { partbuddy: { design: { applyBlock(block: unknown): Promise<void> } } }).partbuddy;
      await bridge.design.applyBlock({ block: 'slot', body: 'Flap', point: [64, 15, 4], normal: [0, 0, 1], size: 'M3', length: 10, width: 3.4, depth: null, along: 'x' });
    });
    await expect(summary).not.toHaveText(before, { timeout: 30_000 });
    const slotted = (await summary.textContent()) ?? '';
    // Turned as far as it goes: the slot is still in the flap. Sketched at the design level it would
    // stay in the world, and the flap would be whole again.
    await page.getByTestId('joints').click({ timeout: 30_000 });
    const slider = page.getByTestId('joint-panel').getByRole('slider', { name: 'Flap hinge' });
    await slider.focus();
    await page.keyboard.press('End');
    await expect(page.getByTestId('joint-panel').getByRole('slider', { name: 'Flap hinge' })).toHaveValue('67', { timeout: 30_000 });
    await expect(page.getByTestId('joint-reset')).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    await expect(summary).toHaveText(slotted);
    await page.screenshot({ path: test.info().outputPath('slot-in-turned-flap.png') });
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
