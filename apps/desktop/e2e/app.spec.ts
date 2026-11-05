import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

test('the parameter panel lists the design parameters and changes a length with a preview first', async () => {
  const { app, fake: solidcraft } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 1');
  const user = { source: 'user' as const, error: null, favorite: false, comment: '', unit: 'mm' };
  solidcraft.parameters = [
    { ...user, name: 'wand', expression: 'breite / 10', value: 4, used_by: ['d3'] },
    { ...user, name: 'breite', expression: '40 mm', value: 40, favorite: true, comment: 'Plate width [30..60]', used_by: ['d1', 'wand'] },
  ];
  solidcraft.change();

  const panel = page.getByTestId('parameters');
  await expect(panel.getByRole('heading', { name: 'Parameters (2)' })).toBeVisible();
  // Favourites first; a formula is shown, not editable; the range in the comment becomes a hint.
  await expect(panel.getByTestId('parameter').first()).toHaveAttribute('data-name', 'breite');
  await expect(panel.getByText('= breite / 10')).toBeVisible();
  await expect(panel.getByText('Plate width', { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Change wand' })).toHaveCount(0);
  // A favourite with a range in its comment gets a slider and the range as its own line.
  await expect(panel.getByRole('slider', { name: 'breite, slider' })).toBeVisible();
  await expect(panel.getByText('Range 30 to 60 mm')).toBeVisible();

  const field = panel.getByRole('textbox', { name: 'Change breite' });
  await expect(field).toHaveValue('40');
  await field.fill('70');
  await expect(panel.getByText('Outside the intended range 30 to 60')).toBeVisible();

  // Typing tries the value in SolidCraft for the ghost; the design stays as it is.
  const ghosts = solidcraft.exports.length;
  await field.fill('50');
  await expect(panel.getByText('Preview in the view – Enter changes it, Escape cancels')).toBeVisible();
  await expect.poll(() => solidcraft.exports.length).toBeGreaterThan(ghosts);
  await page.screenshot({ path: test.info().outputPath('parameters-preview.png') });
  expect(solidcraft.parameters.find((entry) => entry.name === 'breite')?.value).toBe(40);

  await field.press('Enter');
  await expect.poll(() => solidcraft.parameters.find((entry) => entry.name === 'breite')?.value).toBe(50);
  await expect(field).toHaveValue('50');

  // A value SolidCraft cannot build is refused before Enter; Escape brings the current value back.
  await field.fill('2000');
  await expect(panel.getByText('SolidCraft cannot build the part with this value')).toBeVisible();
  await field.press('Escape');
  await expect(field).toHaveValue('50');
});

test('the view switches display modes and opens a section with its own controls', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  const shot = (name: string) => page.getByTestId('viewport').screenshot({ path: test.info().outputPath(`${name}.png`) });

  await page.getByTestId('display-mode').click();
  await expect(page.getByRole('menuitemradio', { name: 'Shaded with edges' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'X-ray' }).click();
  await page.getByTestId('display-mode').click();
  await expect(page.getByRole('menuitemradio', { name: 'X-ray' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await shot('xray');
  await page.getByTestId('display-mode').click();
  await page.getByRole('menuitemradio', { name: 'Shaded with edges' }).click();

  // A section across Z through the middle; the other side and another axis are one press away.
  await page.getByTestId('section').click();
  const panel = page.getByTestId('section-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('radio', { name: 'Cut across Z' })).toBeChecked();
  await shot('section-z');
  await panel.getByRole('radio', { name: 'Cut across X' }).click();
  await panel.getByTestId('section-flip').click();
  await expect(panel.getByRole('slider', { name: 'Where the section cuts' })).toHaveValue('50');
  await shot('section-x-flipped');

  // Off again: the panel goes.
  await page.getByTestId('section').click();
  await expect(panel).toHaveCount(0);
});

test('the colour theme can be chosen in the settings and is kept', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-theme-'));
  const dark = (page: LaunchedApp['page']) =>
    page.evaluate(() => (globalThis as unknown as { matchMedia(query: string): { matches: boolean } }).matchMedia('(prefers-color-scheme: dark)').matches);
  try {
    launched = await launchApp({ work, colorScheme: null });
    let { page } = launched;
    await page.getByTestId('settings').click();
    let themes = page.getByTestId('settings-theme');
    await expect(themes.getByRole('radio', { name: 'Like Windows' })).toBeChecked();
    await themes.getByText('Dark').click();
    await expect.poll(() => dark(page)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('theme-dark.png') });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="settings-dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    // The choice survives a restart.
    await launched.close();
    launched = await launchApp({ work, colorScheme: null });
    ({ page } = launched);
    await expect.poll(() => dark(page)).toBe(true);
    await page.getByTestId('settings').click();
    themes = page.getByTestId('settings-theme');
    await expect(themes.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await themes.getByText('Light').click();
    await expect.poll(() => dark(page)).toBe(false);
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
});

test('the settings switch the language at once and show the project folder and the licence (B6)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-settings-'));
  try {
    launched = await launchApp({ work });
    const { page } = launched;
    await page.getByTestId('settings').click();
    const dialog = page.getByTestId('settings-dialog');
    await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible();
    // Tests set the project folder themselves, so it cannot be changed here.
    await expect(dialog.getByTestId('settings-projects-folder')).toHaveText(join(work, 'projects'));
    await expect(dialog.getByTestId('settings-projects-choose')).toBeDisabled();
    await dialog.getByTestId('settings-language').getByText('Deutsch').click();
    await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    await expect(page.getByTestId('settings-about')).toHaveText('Über');
    await page.getByTestId('settings-about').click();
    await expect(dialog.getByTestId('settings-version')).toHaveText(/^Version \d/);
    await expect(dialog.getByTestId('settings-sponsor')).toHaveAttribute('href', 'https://github.com/sponsors/ManuelStaggl');
    await page.screenshot({ path: test.info().outputPath('settings-about.png') });
    await page.getByTestId('settings-general').click();
    await dialog.getByTestId('settings-language').getByText('English').click();
    await expect(dialog.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
});

test('the first start walks through SolidCraft, assistant, printer and project folder once (B9)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-first-'));
  try {
    launched = await launchApp({ work, env: { PARTBUDDY_FIRST_START: '1' } });
    let { page } = launched;
    const setup = page.getByTestId('first-start');
    await expect(setup).toHaveAttribute('data-step', 'solidcraft');
    await expect(setup.getByTestId('first-start-download')).toHaveAttribute('href', 'https://github.com/tangency-labs/solidcraft/releases');
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="first-start"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('first-start.png') });
    await setup.getByTestId('first-start-next').click();
    await expect(setup).toHaveAttribute('data-step', 'assistant');
    await expect(setup.getByRole('radio', { name: /^Claude Code/ })).toBeChecked();
    await setup.getByTestId('first-start-next').click();
    await expect(setup).toHaveAttribute('data-step', 'print');
    await setup.getByTestId('printer-name').getByRole('textbox').fill('Werkstatt');
    await setup.getByTestId('print-save').click();
    await expect(setup).toHaveAttribute('data-step', 'projects');
    await expect(setup.getByTestId('settings-projects-folder')).toHaveText(join(work, 'projects'));
    await setup.getByTestId('first-start-back').click();
    await expect(setup).toHaveAttribute('data-step', 'print');
    await setup.getByTestId('first-start-next').click();
    await setup.getByTestId('first-start-next').click();
    await expect(setup).toHaveCount(0);
    await expect(page.getByTestId('material-chip')).toContainText('Werkstatt');

    // Once done, it does not come back.
    await launched.close();
    launched = await launchApp({ work, env: { PARTBUDDY_FIRST_START: '1' } });
    ({ page } = launched);
    await expect(page.getByTestId('connection-status')).toBeVisible();
    await expect(page.getByTestId('first-start')).toHaveCount(0);
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
});

test('the settings show which SolidCraft runs and its version (R0)', async () => {
  launched = await launchApp();
  const { page } = launched;
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-solidcraft').click();
  const dialog = page.getByTestId('solidcraft-engine');
  await expect(dialog).toBeVisible();
  // The test environment names the program; it is no SolidCraft, so its version stays unknown.
  await expect(dialog.getByText('Set by the test environment')).toBeVisible();
  await expect(page.getByTestId('engine-version')).toHaveText('unknown');
  await expect(page.getByTestId('engine-support')).toHaveText('Unknown');
  await expect(page.getByTestId('engine-choose')).toBeDisabled();
  await expect(page.getByTestId('engine-restart')).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include('[data-testid="solidcraft-engine"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the chat is as wide as the user drags it, by mouse or keyboard, and stays so', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-chat-width-'));
  const width = async (page: LaunchedApp['page']) => (await page.getByTestId('assistant-panel').boundingBox())?.width ?? 0;
  try {
    launched = await launchApp({ work });
    let { page } = launched;
    const handle = page.getByRole('separator', { name: 'Chat width' });
    await expect(handle).toHaveAttribute('aria-valuenow', '420');
    const box = await handle.boundingBox();
    if (!box) throw new Error('no handle');
    // Dragging left widens the chat, as far as the window leaves the view its room.
    await page.mouse.move(box.x + box.width / 2, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + 200, { steps: 8 });
    await page.mouse.up();
    const max = Number(await handle.getAttribute('aria-valuemax'));
    expect(max).toBeGreaterThan(500);
    await expect.poll(() => width(page)).toBe(Math.min(580, max));
    await page.screenshot({ path: test.info().outputPath('chat-wide.png') });
    // The keyboard narrows it; it never gets narrower than the minimum.
    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', String(max));
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '320');
    await page.keyboard.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', '336');

    // The width survives a restart; a double-click brings back the standard width.
    await launched.close();
    launched = await launchApp({ work });
    ({ page } = launched);
    await expect(page.getByRole('separator', { name: 'Chat width' })).toHaveAttribute('aria-valuenow', '336');
    await page.getByRole('separator', { name: 'Chat width' }).dblclick();
    await expect(page.getByRole('separator', { name: 'Chat width' })).toHaveAttribute('aria-valuenow', '420');
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
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
    bridge: ['agent', 'appInfo', 'chat', 'design', 'mirror', 'notes', 'print', 'project', 'relaunch', 'settings', 'solidcraft', 'viewer', 'window'],
    solidcraft: ['chooseEngine', 'engine', 'onStatus', 'retry', 'start', 'status'],
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

test('model and effort are chosen at the chip and kept for new chats (B1)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-model-'));
  try {
    launched = await launchApp({ work });
    let { page } = launched;
    let chip = page.getByTestId('agent-status');
    await chip.click();
    const menu = page.getByTestId('agent-menu');
    // Only what the plan offers: the aliases, without pinned older versions.
    await expect(menu.getByTestId('model-option')).toHaveText([/^Default \(recommended\)/, /^Opus 9/, /^Sonnet 9/, /^Haiku 9/]);
    await menu.getByTestId('model-option').filter({ hasText: 'Sonnet 9' }).click();
    await menu.getByTestId('effort-option').filter({ hasText: /^Low$/ }).click();
    await expect(menu.getByRole('radio', { name: 'Low' })).toBeChecked();
    await expect(chip).toHaveText('Claude Code · Sonnet 9 · Low');
    await menu.getByTestId('model-keep').click();
    await expect(menu.getByTestId('model-is-default')).toBeVisible();
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="agent-menu"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('agent-model.png') });

    // Another model keeps the effort where it takes it; Haiku takes no "max". That a running
    // session switches mid-conversation is covered by the agent tests with the stream-json protocol.
    await menu.getByTestId('model-option').filter({ hasText: 'Haiku 9' }).click();
    await expect(menu.getByTestId('effort-option')).toHaveText(['Default', 'Low', 'Medium', 'High']);
    await expect(menu.getByTestId('model-keep')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chip).toHaveText('Claude Code · Haiku 9 · Low');

    // A new start begins with the choice kept for new chats.
    await launched.close();
    launched = await launchApp({ work });
    ({ page } = launched);
    chip = page.getByTestId('agent-status');
    await expect(chip).toHaveText('Claude Code · Sonnet 9 · Low', { timeout: 15_000 });
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
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

test('the part material is chosen in the status bar and the profiles are edited in a dialog (M7)', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  const chip = page.getByTestId('material-chip');
  await expect(chip).toHaveAttribute('data-material', 'pla');
  await expect(page.getByTestId('print-check')).toBeVisible();
  // The chips fit the status bar: the window never scrolls.
  const overflow = await page.evaluate(() => {
    const root = (globalThis as unknown as { document: { documentElement: { scrollHeight: number; clientHeight: number } } }).document.documentElement;
    return root.scrollHeight - root.clientHeight;
  });
  expect(overflow).toBe(0);

  // The part's material from the status bar.
  await chip.click();
  await page.getByTestId('material-option').filter({ hasText: /^PETG(?!-)/ }).click();
  await expect(chip).toHaveAttribute('data-material', 'petg');

  // The profiles in their dialog, opened from the settings; changes apply on save.
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  const dialog = page.getByTestId('print-profiles');
  await expect(dialog).toBeVisible();
  const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="print-profiles"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await dialog.getByTestId('printer-name').getByRole('textbox').fill('Werkstatt');
  await dialog.getByTestId('print-tab-material').click();
  await expect(dialog.getByTestId('materials-list').getByRole('option', { selected: true })).toContainText('PETG');
  const overhang = dialog.getByTestId('material-overhang').getByRole('textbox');
  await overhang.fill('35');
  await overhang.press('Tab');
  await page.screenshot({ path: test.info().outputPath('print-profiles.png') });
  await dialog.getByTestId('print-save').click();
  await expect(dialog).toHaveCount(0);
  await expect(chip).toContainText('Werkstatt');

  // Designing without support is on from the start (M7f); it sits with the assistant (B6) and is turned off there.
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-assistant').click();
  const assistant = page.getByTestId('settings-assistant-panel');
  const supportFree = assistant.getByTestId('support-free').getByRole('checkbox');
  await expect(supportFree).toBeChecked();
  await assistant.getByTestId('support-free').getByText('Design without support').click();
  await expect(supportFree).not.toBeChecked();

  // Cancel keeps what was saved, the switch included.
  await page.getByTestId('settings-print').click();
  await dialog.getByTestId('printer-name').getByRole('textbox').fill('Anders');
  await dialog.getByTestId('print-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(chip).toContainText('Werkstatt');
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-assistant').click();
  await expect(page.getByTestId('settings-assistant-panel').getByTestId('support-free').getByRole('checkbox')).not.toBeChecked();
  await page.keyboard.press('Escape');
});

test('the ready-to-print light follows the printer, points at its findings and asks before a red export (M7)', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  const light = page.getByTestId('print-check');
  await expect(light).toHaveAttribute('data-status', 'ready');
  await expect(light).toHaveText('Ready to print');

  // A printer too small for the 64 mm clip turns it red.
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  const dialog = page.getByTestId('print-profiles');
  for (const axis of ['x', 'y']) {
    const field = dialog.getByTestId(`printer-bed-${axis}`).getByRole('textbox');
    await field.fill('50');
    await field.press('Tab');
  }
  await dialog.getByTestId('print-save').click();
  await expect(light).toHaveAttribute('data-status', 'block');
  await expect(light).toHaveText('Not ready to print');
  await light.click();
  const panel = page.getByTestId('print-check-panel');
  await expect(panel.getByTestId('check-finding').first()).toHaveAttribute('data-kind', 'size');
  await expect(panel).toContainText('Too large for the build volume: 64 × 32 × 20 mm, the printer takes 50 × 50 × 256 mm');
  const axe = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="print-check-panel"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  await page.keyboard.press('Escape');

  // Exporting while red asks once; cancelling exports nothing.
  await page.getByTestId('export').click();
  await page.getByTestId('export-3mf').click();
  const confirm = page.getByTestId('export-confirm');
  await expect(confirm).toContainText('Too large for the build volume');
  await page.screenshot({ path: test.info().outputPath('export-confirm.png') });
  await confirm.getByTestId('export-confirm-cancel').click();
  await expect(confirm).toHaveCount(0);
});

test('a file dragged over the window says where it goes, and one without a place on disk is refused (B4)', async () => {
  launched = await launchApp();
  const { page } = launched;
  const drag = (type: string, name: string) =>
    page.evaluate(
      ({ kind, file }) => {
        // Runs in the renderer; typed loosely because this file is compiled for Node.
        const view = globalThis as unknown as {
          DataTransfer: new () => { items: { add(file: unknown): void } };
          File: new (parts: string[], name: string) => unknown;
          DragEvent: new (type: string, init: { dataTransfer: unknown; bubbles: boolean; cancelable: boolean }) => unknown;
          dispatchEvent(event: unknown): boolean;
        };
        const data = new view.DataTransfer();
        data.items.add(new view.File(['solid x'], file));
        view.dispatchEvent(new view.DragEvent(kind, { dataTransfer: data, bubbles: true, cancelable: true }));
      },
      { kind: type, file: name },
    );
  await expect(page.getByTestId('connection-status')).toBeVisible();
  await drag('dragenter', 'Platine.step');
  await expect(page.getByTestId('file-drop')).toHaveText(/Drop to insert into this project/);
  await drag('drop', 'Platine.step');
  await expect(page.getByTestId('file-drop')).toHaveCount(0);
  // A file made in the page has no path on disk, like one dragged out of a browser.
  await expect(page.getByTestId('notice')).toHaveText(/Save it first/);
  await drag('dragenter', 'notes.txt');
  await drag('drop', 'notes.txt');
  await expect(page.getByTestId('notice')).toHaveText(/PartBuddy imports STEP/);
});

test('PartBuddy starts on the start page with the projects, which searches and closes again (B3)', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-home-'));
  const projects = join(work, 'projects');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const seed = (name: string, ageMinutes: number, check?: string) => {
    mkdirSync(join(projects, name), { recursive: true });
    const design = join(projects, name, `${name}.sc`);
    writeFileSync(design, 'design');
    const time = (Date.now() - ageMinutes * 60_000) / 1000;
    utimesSync(design, time, time);
    if (check) {
      writeFileSync(join(projects, name, 'preview.png'), png);
      writeFileSync(join(projects, name, 'preview.json'), JSON.stringify({ check }));
    }
  };
  seed('Wall holder', 5, 'ready');
  seed('Cable clip', 60 * 30, 'block');
  seed('Übersicht', 60 * 24 * 3);
  try {
    launched = await launchApp({ work, env: { PARTBUDDY_START_PAGE: '1' } });
    const { page } = launched;
    // The window opens on the start page, without the logo.
    const home = page.getByTestId('home-page');
    await expect(home.getByRole('heading', { name: 'Projects' })).toBeVisible();
    const tiles = home.getByTestId('home-tile');
    await expect(tiles).toHaveCount(3);
    // Newest first, with the last change and the light at the last preview.
    await expect(tiles.nth(0)).toHaveAttribute('data-name', 'Wall holder');
    await expect(tiles.nth(0)).toContainText('5 minutes ago');
    await expect(tiles.nth(0)).toContainText('Ready to print');
    await expect(tiles.nth(0).getByTestId('home-preview')).toBeVisible();
    await expect(tiles.nth(1)).toContainText('Not ready to print');
    await expect(tiles.nth(2)).toHaveAttribute('data-name', 'Übersicht');
    await expect(tiles.nth(2).getByTestId('home-preview')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('home.png') });

    // The search ignores case and accents; nothing found says so.
    await page.getByTestId('home-search').fill('ubersicht');
    await expect(tiles).toHaveCount(1);
    await page.getByTestId('home-search').fill('lamp');
    await expect(page.getByTestId('home-no-match')).toHaveText('No project matches “lamp”.');
    await page.getByTestId('home-search').fill('');
    await expect(tiles).toHaveCount(3);

    const results = await new AxeBuilder({ page }).setLegacyMode(true).include('[data-testid="home-page"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    // Escape and the logo both go back to the work area.
    await page.keyboard.press('Escape');
    await expect(home).toHaveCount(0);
    await page.getByTestId('home-button').click();
    await expect(home).toBeVisible();
    await page.getByTestId('home-button').click();
    await expect(home).toHaveCount(0);
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
