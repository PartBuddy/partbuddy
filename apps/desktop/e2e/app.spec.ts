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

test('edges and vertices can be picked, and the view switches projection and standard views (M1a)', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const bar = page.getByTestId('selection-bar');

  // Scan across the middle of the part until an edge is under the pointer.
  const findKind = async (kind: string, points: { x: number; y: number }[]) => {
    for (const point of points) {
      await page.mouse.click(point.x, point.y);
      // Read without waiting: the bar is hidden while nothing is selected.
      const found = (await bar.count()) > 0 ? await bar.getAttribute('data-kind') : null;
      if (found === kind) return point;
    }
    return null;
  };
  await page.waitForTimeout(500);
  const row = Array.from({ length: 200 }, (_, i) => ({ x: box.x + box.width * 0.2 + i * 3, y: box.y + box.height / 2 }));
  expect(await findKind('edge', row), 'an edge on the middle row').not.toBeNull();
  await expect(page.getByTestId('selected-face')).toHaveText(/^F\d+:[^|]+\|F\d+:/);
  await expect(bar).toContainText(/Length/);
  await expect(page.getByTestId('composer-selection')).toHaveText(/Selected edge goes with the message: F\d+:.*\|.* · CableClip/);
  await page.screenshot({ path: test.info().outputPath('edge-selected.png') });

  const grid: { x: number; y: number }[] = [];
  for (let y = 0.3; y <= 0.7; y += 0.025) for (let x = 0.25; x <= 0.75; x += 0.0125) grid.push({ x: box.x + box.width * x, y: box.y + box.height * y });
  expect(await findKind('vertex', grid), 'a visible vertex').not.toBeNull();
  await expect(page.getByTestId('composer-selection')).toHaveText(/Selected vertex goes with the message: [-\d. ]+ · CableClip/);

  // Escape clears the selection; a click into empty space too.
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();

  // Orthographic projection with the 5 key, front view with 1.
  await page.keyboard.press('5');
  await expect(page.getByTestId('projection')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('1');
  await page.waitForTimeout(800);
  expect(await countViewportPixels(page, '--cs-viewer-edge')).toBeGreaterThan(200);
  await page.screenshot({ path: test.info().outputPath('ortho-front.png') });
  await page.getByRole('button', { name: 'Isometric' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath('ortho-iso.png') });
});

test('the view highlights the faces a step changed and can follow them', async () => {
  const { app, fake: solidcraft } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  // Triangles and mirror time are details for the curious, in the tooltip of the summary.
  await expect(page.getByTestId('mesh-summary')).toHaveAttribute('title', /triangles · mirrored in [\d,]+ ms$/);
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

test('the camera keeps a growing design in view until the user moves it', async () => {
  // The assistant starts with a small sketch; what follows is much larger.
  launched = await launchApp();
  fake = new FakeSolidCraft({ controlDir: launched.controlDir });
  fake.bodies = [];
  fake.sketches = [{ id: 1, name: 'Curves', visible: true }];
  fake.activeSketch = 1;
  fake.sketchScale = 0.15;
  await fake.start();
  const { page } = launched;
  await page.getByRole('button', { name: 'Look again' }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-sketches', '1');
  // Curves of a new revision are drawn in the colour of changes.
  const sketchPixels = async (border?: number) =>
    (await countViewportPixels(page, '--cs-viewer-sketch', 40, { border })) + (await countViewportPixels(page, '--cs-viewer-changed', 40, { border }));

  // The small first sketch fills the view instead of sitting as a speck in its middle.
  await expect(async () => {
    expect(await sketchPixels()).toBeGreaterThan(1500);
    expect(await sketchPixels(8)).toBe(0);
  }).toPass({ timeout: 15_000 });
  await page.getByTestId('viewport').screenshot({ path: test.info().outputPath('small-sketch.png') });

  // The design grows twentyfold: the camera follows, nothing touches the edges of the view.
  fake.sketchScale = 3;
  fake.change();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-revision', '2');
  await expect(async () => {
    expect(await sketchPixels()).toBeGreaterThan(1500);
    expect(await sketchPixels(8)).toBe(0);
  }).toPass({ timeout: 15_000 });
  await page.getByTestId('viewport').screenshot({ path: test.info().outputPath('grown-sketch.png') });

  // Once the user turns the view, the camera is theirs: growing further does not move it, so the
  // doubled sketch runs out of the view.
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height * 0.9, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  fake.sketchScale = 6;
  fake.change();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-revision', '3');
  await page.waitForTimeout(1500);
  expect(await sketchPixels(8)).toBeGreaterThan(0);
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
  // Test windows open beside all displays, without focus: nothing of a test run is seen.
  const bounds = await launched.app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      right: (window?.getBounds().x ?? 0) + (window?.getBounds().width ?? 0),
      leftmost: Math.min(...screen.getAllDisplays().map((display) => display.bounds.x)),
      focused: window?.isFocused() ?? true,
    };
  });
  if (process.env.PARTBUDDY_WINDOW_DISPLAY !== 'leftmost') expect(bounds.right).toBeLessThan(bounds.leftmost);
  expect(bounds.focused).toBe(false);
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
    bridge: ['agent', 'appInfo', 'design', 'mirror', 'notes', 'solidcraft', 'viewer', 'window'],
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
  // The route sits as a small chip beside the composer; its menu holds the full status.
  const chip = page.getByTestId('agent-status');
  await expect(chip).toHaveText('Claude Code · Max');
  await chip.click();
  await expect(page.getByTestId('agent-detail')).toHaveText('Claude Code 9.9.9 · max subscription');
  await expect(page.getByRole('radio', { name: /^Claude Code/ })).toBeChecked();
  await page.screenshot({ path: test.info().outputPath('agent-menu.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('agent-menu')).toBeHidden();
  await expect(page.getByText('Connect SolidCraft first; the assistant works on the open design.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled();
});

test('Claude Code with an API key runs only when the user allows it', async () => {
  launched = await launchApp({ env: { FAKE_CLAUDE_API_KEY: '1' } });
  const { page } = launched;
  const chip = page.getByTestId('agent-status');
  await expect(chip).toHaveText('Claude Code · no subscription');
  await expect(page.getByText('Sign in to Claude Code with your Claude subscription')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled();

  // Allowed on purpose, the API key is used and clearly labelled; it can be taken back in the menu.
  await page.getByRole('button', { name: 'Use the API key anyway (billed separately)' }).click();
  await expect(chip).toHaveText('Claude Code · API key');
  await chip.click();
  await expect(page.getByTestId('agent-detail')).toContainText('API key, billed separately');
  await page.getByRole('button', { name: 'Use the subscription only' }).click();
  await expect(page.getByTestId('agent-detail')).toHaveText('Claude Code is not using a Claude subscription');
  await expect(chip).toHaveText('Claude Code · no subscription');
});

test('the ChatGPT route offers the sign-in when no account is stored', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByTestId('agent-status').click();
  await page.getByTestId('agent-menu').getByText('ChatGPT', { exact: true }).click();
  await expect(page.getByTestId('agent-detail')).toHaveText('Not signed in to ChatGPT');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('agent-status')).toHaveText('ChatGPT · not signed in');
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
