import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { FakeSolidCraft } from '../test/fakeSolidCraft';
import { countViewportPixels } from './pixels';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp | null = null;
let fake: FakeSolidCraft | null = null;

test.afterEach(async () => {
  await launched?.close();
  await fake?.stop();
  launched = null;
  fake = null;
});

async function connectedApp(): Promise<{ app: LaunchedApp; fake: FakeSolidCraft }> {
  launched = await launchApp();
  fake = new FakeSolidCraft({ controlDir: launched.controlDir });
  await fake.start();
  await launched.page.getByRole('button', { name: 'Look again' }).click();
  return { app: launched, fake };
}

test('the mirrored model appears and follows design changes', async () => {
  const { app, fake: solidcraft } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 1');
  await expect(page.getByTestId('design-name')).toHaveText('Cable clip');
  await expect(page.getByTestId('mesh-summary')).toContainText('1 body · 41 faces');

  // A click on the middle of the part selects a face and shows its SolidCraft name.
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  // The first frames may still be framing the camera, so the click is repeated until it hits.
  await expect(async () => {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('selected-face')).toHaveText(/^F\d+:/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  // The selection goes with the next message to the assistant, as a short note.
  await expect(page.getByTestId('composer-selection')).toHaveText(/Selected face goes with the message: F\d+:.* · CableClip/);

  solidcraft.change();
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 2');
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
});

test('the user undoes, redoes and exports without the assistant (ADR 0016)', async () => {
  launched = await launchApp();
  fake = new FakeSolidCraft({ controlDir: launched.controlDir });
  fake.undoDepth = 1;
  await fake.start();
  const { page, app } = launched;
  await page.getByRole('button', { name: 'Look again' }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 1');

  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 2');
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  // Ctrl+Y redoes, also from the keyboard.
  await page.getByTestId('viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 3');
  await expect(undo).toBeEnabled();

  // The save dialog is the system's; the test answers it with a file in its own folder.
  const target = join(mkdtempSync(join(tmpdir(), 'partbuddy-e2e-export-')), 'clip.3mf');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
  }, target);
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /3MF/ }).click();
  await expect(page.getByTestId('notice')).toHaveText('Saved as clip.3mf');
  expect(readFileSync(target, 'utf8')).toBe('fake 3mf');
  rmSync(dirname(target), { recursive: true, force: true });

  // "Open in SolidCraft" exists only while PartBuddy runs SolidCraft without a window.
  await expect(page.getByRole('button', { name: 'Open in SolidCraft' })).toHaveCount(0);
});

test('the view highlights the faces a step changed and can follow them', async () => {
  const { app, fake: solidcraft } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  await expect(page.getByTestId('mirror-latency')).toHaveText(/^mirrored in [\d,]+ ms$/);
  await expect(page.getByTestId('live-changes')).toBeHidden();

  solidcraft.change({ moveFaces: ['F1:+z', 'F1:-z'] });
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('live-changes')).toHaveText('2 faces changed');
  const follow = page.getByRole('switch', { name: 'Camera follows changes' });
  await page.getByText('Camera follows changes').click();
  await expect(follow).toBeChecked();

  // Moving the faces back is a change again; a revision without geometry changes clears it.
  solidcraft.change();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-revision', '3');
  await expect(page.getByTestId('live-changes')).toHaveText('2 faces changed');
  solidcraft.change();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-revision', '4');
  await expect(page.getByTestId('live-changes')).toBeHidden();
});


test('a sketch without a body is drawn in the view (#21)', async () => {
  launched = await launchApp();
  fake = new FakeSolidCraft({ controlDir: launched.controlDir });
  fake.bodies = [];
  fake.sketches = [{ id: 1, name: 'Curves', visible: true }];
  fake.activeSketch = 1;
  await fake.start();
  const { page } = launched;
  await page.getByRole('button', { name: 'Look again' }).click();
  await expect(page.getByTestId('sketch-summary')).toHaveText('1 sketch · editing Curves');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-sketches', '1');
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect(page.getByTestId('mesh-summary')).toBeHidden();
  await expect(page.getByText('No body in the design')).toBeHidden();
  // The sketch is drawn: the canvas shows sketch-coloured pixels (software WebGL, so wait for frames).
  await expect(async () => {
    expect(await countViewportPixels(page, '--cs-viewer-sketch')).toBeGreaterThan(200);
  }).toPass({ timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath('sketch-only.png') });

  // Finishing the sketch and consuming it in a feature hides it, as SolidCraft does.
  fake.bodies = ['CableClip'];
  fake.sketches = [{ id: 1, name: 'Curves', visible: false }];
  fake.activeSketch = null;
  fake.change();
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-sketches', '0');
  await expect(page.getByTestId('sketch-summary')).toBeHidden();
});

test('the title bar is part of the window, with the system window buttons beside it', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByTestId('title-bar')).toContainText('PartBuddy');
  const overlay = await page.evaluate(() => {
    // Runs in the renderer; typed loosely because this file is compiled for Node.
    const view = globalThis as unknown as {
      innerWidth: number;
      navigator: { windowControlsOverlay?: { visible: boolean; getTitlebarAreaRect(): { width: number; height: number } } };
    };
    const overlay = view.navigator.windowControlsOverlay;
    return { visible: overlay?.visible ?? false, width: overlay?.getTitlebarAreaRect().width ?? 0, viewport: view.innerWidth };
  });
  expect(overlay.visible).toBe(true);
  // The window buttons take room at the side; the title bar keeps clear of them.
  expect(overlay.width).toBeGreaterThan(0);
  expect(overlay.width).toBeLessThan(overlay.viewport);
});

test('every connection state explains itself', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft not running');
  await expect(page.getByText('SolidCraft is not running')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start SolidCraft' })).toBeVisible();

  fake = new FakeSolidCraft({ controlDir: launched.controlDir });
  await fake.start();
  await page.getByRole('button', { name: 'Look again' }).click();
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 1');

  await fake.stop();
  await expect(page.getByText('The connection to SolidCraft was lost')).toBeVisible();
  // The last model stays visible while SolidCraft is away.
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
});

test('the renderer sees only the typed bridge', async () => {
  launched = await launchApp();
  const globals = await launched.page.evaluate(() => {
    // Runs in the renderer; typed loosely because this file is compiled for Node.
    const page = globalThis as unknown as { partbuddy?: { solidcraft?: object }; require?: unknown; process?: unknown };
    return {
      bridge: Object.keys(page.partbuddy ?? {}).sort(),
      solidcraft: Object.keys(page.partbuddy?.solidcraft ?? {}).sort(),
      require: typeof page.require,
      process: typeof page.process,
    };
  });
  expect(globals).toEqual({
    bridge: ['agent', 'appInfo', 'design', 'mirror', 'solidcraft', 'viewer', 'window'],
    solidcraft: ['onStatus', 'retry', 'start', 'status'],
    require: 'undefined',
    process: 'undefined',
  });
  const csp = await launched.page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
});

test('the assistant shows the signed-in plan and needs SolidCraft', async () => {
  launched = await launchApp();
  const { page } = launched;
  await expect(page.getByTestId('agent-status')).toHaveText('Claude Code 9.9.9 · max subscription');
  await expect(page.getByText('Connect SolidCraft first; the assistant works on the open design.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled();
});

test('Claude Code with an API key runs only when the user allows it', async () => {
  launched = await launchApp({ env: { FAKE_CLAUDE_API_KEY: '1' } });
  const { page } = launched;
  await expect(page.getByTestId('agent-status')).toHaveText('Claude Code is not using a Claude subscription');
  await expect(page.getByText('Sign in to Claude Code with your Claude subscription')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled();

  // Allowed on purpose, the API key is used and clearly labelled; it can be taken back.
  await page.getByRole('button', { name: 'Use the API key anyway (billed separately)' }).click();
  await expect(page.getByTestId('agent-status')).toContainText('API key, billed separately');
  await page.getByRole('button', { name: 'Use the subscription only' }).click();
  await expect(page.getByTestId('agent-status')).toContainText('Claude Code is not using a Claude subscription');
});

test('the ChatGPT route offers the sign-in when no account is stored', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByRole('radio', { name: 'ChatGPT' }).or(page.getByRole('button', { name: 'ChatGPT' })).click();
  await expect(page.getByTestId('agent-status')).toHaveText('Not signed in to ChatGPT');
  await expect(page.getByRole('button', { name: 'Continue with ChatGPT' })).toBeVisible();
});

test('the main view has no WCAG 2.2 AA violations that axe can detect', async () => {
  const { app } = await connectedApp();
  await expect(app.page.getByTestId('mesh-summary')).toBeVisible();
  // Legacy mode runs axe in the page itself; the default opens a helper page, which Electron lacks.
  const results = await new AxeBuilder({ page: app.page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
