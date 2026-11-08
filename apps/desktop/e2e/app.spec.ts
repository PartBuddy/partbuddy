import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { MATERIAL_CATALOG } from '../src/shared/materialCatalog';
import { FakeSolidCraft } from '../test/fakeSolidCraft';
import { countViewportPixels } from './pixels';
import { cameraOf, cameraSettled } from './view';
import { launchApp, lookAgain, type LaunchedApp } from './launch';

/**
 * What axe finds against WCAG 2.2 AA, in `include` or the whole window. Dialogs, menus and the chat
 * fade in; without motion axe measures them at rest, not text still half transparent (CI flakes on a
 * busy runner, 2026-11-08). Legacy mode runs axe in the page itself; Electron has no helper page.
 */
async function axeAtRest(page: Page, include?: string): Promise<string[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const builder = new AxeBuilder({ page }).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
  const results = await (include ? builder.include(include) : builder).analyze();
  await page.emulateMedia({ reducedMotion: null });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

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
  await lookAgain(launched.page);
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
    await expect(page.getByTestId('selected-face')).toHaveAttribute('data-name', /^F\d+:/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  // The selection goes with the next message to the assistant, as a short note.
  // A readable name; SolidCraft's name stays on hover and goes to the assistant (polish round 2).
  await expect(page.getByTestId('composer-selection')).toHaveText(/Selected face goes with the message: (Plane|Cylinder Ø [\d.]+ mm|Surface) · CableClip/);

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
  await lookAgain(page);
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 1');

  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
  await undo.click();
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 2', { timeout: 15_000 });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  // Ctrl+Y redoes, also from the keyboard.
  await page.getByTestId('viewport').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('connection-status')).toHaveText('SolidCraft · revision 3', { timeout: 15_000 });
  await expect(undo).toBeEnabled();

  // The save dialog is the system's; the test answers it with a file in its own folder.
  const target = join(mkdtempSync(join(tmpdir(), 'partbuddy-e2e-export-')), 'clip.3mf');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
  }, target);
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByTestId('export-3mf').click();
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
  // The camera frames the part as it arrives; points scanned before it stands still miss the part.
  await cameraSettled(page);

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
  const row = Array.from({ length: 200 }, (_, i) => ({ x: box.x + box.width * 0.2 + i * 3, y: box.y + box.height / 2 }));
  const edgeAt = await findKind('edge', row);
  expect(edgeAt, 'an edge on the middle row').not.toBeNull();
  await expect(page.getByTestId('selected-face')).toHaveAttribute('data-name', /^F\d+:[^|]+\|F\d+:/);
  await expect(page.getByTestId('selected-face')).toHaveText(/^Edge [\d.]+ mm$/);
  await expect(bar).toContainText(/Length/);
  await expect(page.getByTestId('composer-selection')).toHaveText(/Selected edge goes with the message: Edge [\d.]+ mm · CableClip/);
  await page.screenshot({ path: test.info().outputPath('edge-selected.png') });

  const grid: { x: number; y: number }[] = [];
  for (let y = 0.3; y <= 0.7; y += 0.025) for (let x = 0.25; x <= 0.75; x += 0.0125) grid.push({ x: box.x + box.width * x, y: box.y + box.height * y });
  expect(await findKind('vertex', grid), 'a visible vertex').not.toBeNull();
  await expect(page.getByTestId('composer-selection')).toHaveText(/Selected vertex goes with the message: Vertex · CableClip/);

  // Ctrl adds the edge: their distance shows at once from the view, SolidCraft's exact value when it answers.
  if (edgeAt) {
    await page.keyboard.down('Control');
    await page.mouse.click(edgeAt.x, edgeAt.y);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('hud-measure')).toContainText(/Distance [\d.,]+ mm/);
    // Ctrl again takes it away; the vertex stays.
    await page.keyboard.down('Control');
    await page.mouse.click(edgeAt.x, edgeAt.y);
    await page.keyboard.up('Control');
    await expect(page.getByTestId('hud-measure')).toHaveCount(0);
  }

  // Shift+F fits the selection: the camera moves in on the vertex (viewport CAD round).
  const before = await cameraOf(page);
  await page.keyboard.press('Shift+F');
  await page.waitForTimeout(1200);
  const fitted = await cameraOf(page);
  expect(before && fitted).toBeTruthy();
  if (before && fitted) {
    const distance = (c: { position: number[]; target: number[] }) => Math.hypot(...c.position.map((v, i) => v - (c.target[i] ?? 0)));
    expect(distance(fitted)).toBeLessThan(distance(before));
  }

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
  // The view cube: a click on its front face turns the camera to look from -Y, straight on.
  const cube = await page.locator('#view-cube').boundingBox();
  expect(cube).not.toBeNull();
  if (cube) {
    await page.getByRole('button', { name: 'Isometric' }).click();
    await page.waitForTimeout(1200);
    await page.locator('#view-cube [data-face="front"] button').nth(4).click();
    await page.waitForTimeout(1500);
    const front = await cameraOf(page);
    expect(front && front.position[1] < front.target[1] && Math.abs(front.position[0] - front.target[0]) < 1 && Math.abs(front.position[2] - front.target[2]) < 1).toBe(true);
  }
  // Ctrl+1 looks from the back: the camera stands on the +Y side of what it looks at.
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(1200);
  const back = await cameraOf(page);
  expect(back && back.position[1] > back.target[1]).toBe(true);
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
  await lookAgain(page);
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
  await lookAgain(page);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-sketches', '1');
  // Curves of a new revision are drawn in the colour of changes.
  const sketchPixels = async (border?: number) =>
    (await countViewportPixels(page, '--cs-viewer-sketch', 40, { border })) + (await countViewportPixels(page, '--cs-viewer-changed', 40, { border }));

  // The small first sketch fills the view instead of sitting as a speck in its middle.
  await expect(async () => {
    expect(await sketchPixels()).toBeGreaterThan(1500);
    expect(await sketchPixels(8)).toBe(0);
  }).toPass({ timeout: 30_000 });
  await page.getByTestId('viewport').screenshot({ path: test.info().outputPath('small-sketch.png') });

  // The design grows twentyfold: the camera follows, nothing touches the edges of the view.
  fake.sketchScale = 3;
  fake.change();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-revision', '2');
  await expect(async () => {
    expect(await sketchPixels()).toBeGreaterThan(1500);
    expect(await sketchPixels(8)).toBe(0);
  }).toPass({ timeout: 30_000 });
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
    // A size the assistant snapped to the printer (2026-11-07): the table names it instead of showing the mark.
    { ...user, name: 'boden', expression: '1 mm', value: 1, comment: 'Floor [auto 5×layer]', used_by: ['d3'] },
  ];
  solidcraft.change();

  const panel = page.getByTestId('parameters');
  await expect(panel.getByRole('treeitem', { name: 'Parameters (3)' })).toBeVisible();
  // Favourites first, one row each (name, value, unit); comment, range and formula show on hover.
  const rows = panel.getByTestId('parameter');
  await expect(rows.first()).toHaveAttribute('data-name', 'breite');
  await expect(rows.first()).toHaveAttribute('aria-label', 'breite, 40 mm');
  await expect(rows.first().locator('[title]').first()).toHaveAttribute('title', 'Plate width\nRange 30 to 60 mm');
  await expect(rows.nth(1).locator('[title]').first()).toHaveAttribute('title', /^= breite \/ 10\n/);
  const floorRow = panel.locator('[data-testid="parameter"][data-name="boden"]');
  await expect(floorRow.locator('[title]').first()).toHaveAttribute('title', "Floor\nChosen by the assistant, follows the printer's nozzle and layer height");
  await expect(panel.getByRole('textbox')).toHaveCount(0);
  // A formula stays as it is: a double click opens no field.
  await rows.nth(1).dblclick();
  await expect(panel.getByRole('textbox', { name: 'Change wand' })).toHaveCount(0);

  // A double click opens the value; a favourite with a range brings its slider while it is edited.
  await rows.first().dblclick();
  const field = panel.getByRole('textbox', { name: 'Change breite' });
  await expect(field).toHaveValue('40');
  await expect(field).toBeFocused();
  await expect(panel.getByRole('slider', { name: 'breite, slider' })).toBeVisible();
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
  await expect(rows.first()).toHaveAttribute('aria-label', 'breite, 50 mm');
  await expect(rows.first()).toBeFocused();

  // F2 opens it again; a value SolidCraft cannot build is refused before Enter; Escape keeps the current value.
  await page.keyboard.press('F2');
  await field.fill('2000');
  await expect(panel.getByText('SolidCraft cannot build the part with this value')).toBeVisible();
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(rows.first()).toHaveAttribute('aria-label', 'breite, 50 mm');

  // The user setting a snapped size makes it theirs: the mark goes, so a printer change leaves it alone.
  await floorRow.dblclick();
  const floor = panel.getByRole('textbox', { name: 'Change boden' });
  await floor.fill('2');
  await expect(panel.getByText('Preview in the view – Enter changes it, Escape cancels')).toBeVisible();
  await floor.press('Enter');
  await expect.poll(() => solidcraft.parameters.find((entry) => entry.name === 'boden')?.comment).toBe('Floor');
  await expect(floorRow.locator('[title]').first()).toHaveAttribute('title', 'Floor');
});

test('the structure tree folds, selects, frames, renames and hides by mouse and keyboard', async () => {
  const { app, fake: solidcraft } = await connectedApp();
  const { page } = app;
  solidcraft.sketches = [{ id: 1, name: 'Curves', visible: true }];
  solidcraft.change();
  const tree = page.getByRole('tree', { name: 'Structure' });
  const body = tree.getByTestId('structure-body');
  const sketch = tree.getByTestId('structure-sketch');
  // The change is mirrored first (exports and all), which takes longer on a busy runner.
  await expect(sketch).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');
  // Empty sections say so in a line and offer one action.
  await expect(tree.getByTestId('parameters-ask')).toBeVisible();
  await expect(tree.getByRole('treeitem', { name: 'Bodies (1)' })).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: test.info().outputPath('structure-tree.png') });

  // A click selects the body, a face picked in the view marks its row; a double click frames it.
  const before = await cameraOf(page);
  await body.click();
  await expect(body).toHaveAttribute('aria-selected', 'true');
  await body.dblclick();
  await expect.poll(async () => JSON.stringify(await cameraOf(page))).not.toBe(JSON.stringify(before));

  // Arrows move between rows, Left and Right fold a section, Space hides.
  await body.focus();
  await page.keyboard.press('ArrowDown');
  const sketches = tree.getByRole('treeitem', { name: 'Sketches (1)' });
  await expect(sketches).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(sketch).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(sketch).toBeFocused();
  await page.keyboard.press(' ');
  await expect(sketch).toHaveAttribute('data-visible', 'false', { timeout: 15_000 });
  await page.keyboard.press('ArrowLeft');
  await expect(sketches).toBeFocused();

  // F2 renames a body in place.
  await body.focus();
  await page.keyboard.press('F2');
  await tree.getByTestId('tree-rename').fill('Clip');
  await page.keyboard.press('Enter');
  await expect(body).toHaveAttribute('aria-label', 'Clip', { timeout: 15_000 });
  expect(solidcraft.bodies).toEqual(['Clip']);

  // The context menu hides it.
  await body.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Hide' }).click();
  await expect(body).toHaveAttribute('data-visible', 'false', { timeout: 15_000 });
  await expect(page.getByTestId('mesh-summary')).toBeHidden();
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
  // Every mode has a key: Shift+3 shows the hidden edges, Shift+5 the wireframe (viewport CAD round).
  for (const [key, name] of [['Shift+3', 'Hidden edges'], ['Shift+5', 'Wireframe'], ['Shift+2', 'Shaded']] as const) {
    await page.keyboard.press(key);
    await page.getByTestId('display-mode').click();
    await expect(page.getByRole('menuitemradio', { name, exact: true })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await shot(name.toLowerCase().replace(' ', '-'));
  }
  expect(await countViewportPixels(page, '--cs-viewer-body', 30)).toBeGreaterThan(500);
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

  // Aligned to a picked flat face: the cut starts at the face and moves along its normal.
  await page.getByTestId('section').click();
  const view = await page.getByTestId('viewport').boundingBox();
  if (!view) throw new Error('viewport not visible');
  for (const [x, y] of [[0.5, 0.6], [0.45, 0.65], [0.6, 0.6], [0.55, 0.7], [0.4, 0.6]] as const) {
    await page.mouse.click(view.x + view.width * x, view.y + view.height * y);
    await page.waitForTimeout(300);
    if ((await page.getByTestId('selected-face').count()) > 0 && /^Plane/.test((await page.getByTestId('selected-face').textContent()) ?? '')) break;
  }
  await page.getByTestId('section').click();
  await panel.getByTestId('section-face').click();
  await expect(panel.getByTestId('section-face')).toHaveAttribute('data-selected', 'true');
  await expect(panel.getByTestId('section-at')).toHaveText(/0 mm from the face/);
  await shot('section-face');

  // Off again: the panel goes.
  await page.getByTestId('section').click();
  await expect(panel).toHaveCount(0);
});

test('a print of two parts switches to the plate, explodes along its assembly and plays the assembly', async () => {
  launched = await launchApp();
  fake = new FakeSolidCraft({ controlDir: launched.controlDir });
  fake.bodies = ['CableClip', 'Second clip'];
  await fake.start();
  const { page } = launched;
  await lookAgain(page);
  await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies');
  const shot = (name: string) => page.getByTestId('viewer').screenshot({ path: test.info().outputPath(`${name}.png`) });

  // The plate: both clips laid out on the printer's bed in a worker, with the bed's size.
  await page.getByTestId('view-plate').click();
  await expect(page.getByTestId('plate-label')).toHaveText('Plate 1 of 1', { timeout: 20_000 });
  await expect(page.getByTestId('plate-bed')).toContainText(/\d+ × \d+ × \d+ mm/);
  await expect(page.getByTestId('bed-width')).toBeVisible();
  await expect(page.getByTestId('plate-misfits')).toHaveCount(0);
  await page.waitForTimeout(800);
  await shot('plate');
  // Back to assembled: the bar goes, the selection works again.
  await page.getByTestId('view-assembled').click();
  await expect(page.getByTestId('plate-bar')).toHaveCount(0);

  // Exploded along the joining directions; closing it glides the parts back.
  await page.getByTestId('explode').click();
  await expect(page.getByTestId('explode-panel')).toBeVisible();
  await page.waitForTimeout(800);
  await shot('exploded');
  await page.getByTestId('explode').click();

  // The assembly plays at once, step by step, with the steps named; back and forward land on steps.
  await page.getByTestId('assembly').click();
  const panel = page.getByTestId('assembly-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('assembly-step')).toHaveCount(2);
  await expect(panel.getByTestId('assembly-source')).toHaveAttribute('data-source', 'suggested');
  await expect(panel.getByTestId('assembly-play')).toHaveAttribute('data-playing', 'false', { timeout: 30_000 });
  await expect(panel).toHaveAttribute('data-position', '2.00');
  await panel.getByTestId('assembly-prev').click();
  await expect(panel).toHaveAttribute('data-position', '1.00');
  await expect(panel.getByTestId('assembly-step').first()).toHaveAttribute('data-active', 'true');
  await shot('assembly');
  await panel.getByTestId('assembly-next').click();
  await expect(panel).toHaveAttribute('data-position', '2.00');
  await page.getByTestId('assembly').click();
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
    expect(await axeAtRest(page, '[data-testid="settings-dialog"]')).toEqual([]);

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
    await expect(dialog.getByTestId('settings-sponsor')).toHaveAttribute('href', 'https://ko-fi.com/partbuddy');
    // A development build does not update itself (B10).
    await expect(dialog.getByTestId('updates')).toHaveAttribute('data-state', 'unavailable');
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
    await expect(setup.getByTestId('first-start-download')).toHaveAttribute('href', 'https://github.com/tangency-labs/solidcraft/releases/tag/v0.40.0-rc.3');
    expect(await axeAtRest(page, '[data-testid="first-start"]')).toEqual([]);
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

test('the settings open with Ctrl+comma, find every option by search and open one directly', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-settings-search-'));
  try {
    launched = await launchApp({ work });
    const { page } = launched;
    const dialog = page.getByTestId('settings-dialog');
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.keyboard.press('Control+Comma');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('settings-general')).toHaveAttribute('aria-selected', 'true');
    // The arrow keys move through the sections.
    await page.getByTestId('settings-general').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('settings-solidcraft')).toHaveAttribute('aria-selected', 'true');

    // Search across sections; Enter opens the first hit and highlights it.
    const search = dialog.getByTestId('settings-search');
    await search.fill('dark');
    const results = dialog.getByTestId('settings-search-results');
    await expect(results.getByRole('option')).toHaveCount(1);
    await expect(results.getByRole('option')).toContainText('Appearance');
    await search.press('Enter');
    await expect(page.getByTestId('settings-general')).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-setting="theme"]')).toHaveAttribute('data-highlighted', 'true');
    await expect(dialog.locator('[data-setting="theme"]')).not.toHaveAttribute('data-highlighted', 'true', { timeout: 5000 });

    // Down from the field into the results, Enter on one opens its section.
    await search.fill('web');
    await search.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('settings-assistant')).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-setting="research"]')).toBeInViewport();
    await search.fill('nothing like this');
    await expect(dialog.getByTestId('settings-search-empty')).toBeVisible();
    // Esc clears the search first, then closes the settings.
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Every option opens directly from anywhere in the app (deep link).
    await page.keyboard.press('Control+Comma');
    await search.fill('materials');
    await results.getByRole('option').first().click();
    await expect(page.getByTestId('settings-print')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('print-tab-material')).toHaveAttribute('aria-selected', 'true');
    await dialog.getByTestId('dialog-close').click();
    await expect(dialog).toHaveCount(0);
    // The assistant chip links to its options in the settings.
    await page.getByTestId('agent-status').click();
    await page.getByTestId('agent-settings').click();
    await expect(page.getByTestId('settings-assistant')).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('[data-setting="research"]')).toHaveAttribute('data-highlighted', 'true');
    await expect(dialog.getByTestId('research').getByRole('switch')).toBeFocused();
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
});

test('an old profile opens with its settings, and reset puts a section back to the defaults', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-settings-old-'));
  const profile = join(work, 'profile');
  mkdirSync(profile, { recursive: true });
  // The three files of PartBuddy before one settings file, with a value from a newer version.
  writeFileSync(join(profile, 'general.json'), JSON.stringify({ language: 'de', setupDone: true }));
  writeFileSync(join(profile, 'appearance.json'), JSON.stringify({ theme: 'dark' }));
  writeFileSync(join(profile, 'assistant-settings.json'), JSON.stringify({ webResearch: false, models: { chatgpt: { model: 'from-the-future', effort: null } } }));
  try {
    launched = await launchApp({ work });
    let { page } = launched;
    const dialog = page.getByTestId('settings-dialog');
    await page.getByTestId('settings').click();
    // The test launcher fixes the window language with --lang; the choice itself is what was stored.
    await expect(dialog.getByTestId('settings-language').getByRole('radio', { name: 'Deutsch' })).toBeChecked();
    await expect(dialog.getByTestId('settings-theme').getByRole('radio', { name: 'Dark' })).toBeChecked();
    await page.getByTestId('settings-assistant').click();
    await expect(dialog.getByTestId('research').getByRole('switch')).not.toBeChecked();
    const stored = JSON.parse(readFileSync(join(profile, 'settings.json'), 'utf8')) as Record<string, unknown>;
    expect(stored).toMatchObject({ language: 'de', theme: 'dark', webResearch: false, models: { chatgpt: { model: 'from-the-future', effort: null } } });
    expect(existsSync(join(profile, 'general.json'))).toBe(true);

    // Reset of the general section: language and theme back, the assistant untouched; asked first.
    await page.getByTestId('settings-general').click();
    await dialog.getByTestId('settings-reset-general').click();
    await expect(page.getByTestId('settings-reset-confirm')).toContainText('project folder');
    await page.getByTestId('settings-reset-go').click();
    // "Like Windows" may now show in German, as Windows' own language.
    await expect(dialog.getByTestId('settings-language').getByRole('radio').first()).toBeChecked();
    await expect(dialog.getByTestId('settings-theme').getByRole('radio').first()).toBeChecked();

    // Survives a restart.
    await launched.close();
    launched = await launchApp({ work });
    ({ page } = launched);
    const again = page.getByTestId('settings-dialog');
    await page.getByTestId('settings').click();
    await expect(again.getByTestId('settings-theme').getByRole('radio').first()).toBeChecked();
    await page.getByTestId('settings-assistant').click();
    await expect(again.getByTestId('research').getByRole('switch')).not.toBeChecked();
    await again.getByTestId('settings-reset-assistant').click();
    await page.getByTestId('settings-reset-go').click();
    await expect(again.getByTestId('research').getByRole('switch')).toBeChecked();
    await expect(again.getByTestId('support-free').getByRole('switch')).toBeChecked();
    await expect(again.getByTestId('design-rounding').getByRole('switch')).toBeChecked();
  } finally {
    await launched?.close();
    launched = null;
    rmSync(work, { recursive: true, force: true });
  }
});

test('interface size, start behaviour and update check are kept, and the shortcuts are listed', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-settings-basics-'));
  const zoom = (app: LaunchedApp['app']) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor());
  try {
    launched = await launchApp({ work });
    let { app, page } = launched;
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.keyboard.press('Control+Comma');
    let dialog = page.getByTestId('settings-dialog');
    await dialog.getByTestId('settings-zoom').getByText('125 %').click();
    await expect.poll(() => zoom(app)).toBe(1.25);
    await dialog.getByTestId('settings-start-page').getByText('Last project').click();
    await page.getByTestId('settings-about').click();
    const check = dialog.getByTestId('settings-check-updates').getByRole('switch', { name: 'Check for updates automatically' });
    await expect(check).toBeChecked();
    await check.press('Space');
    await expect(check).not.toBeChecked();

    // The shortcuts, found by what they do.
    await dialog.getByTestId('settings-search').fill('undo');
    await dialog.getByTestId('settings-search-results').getByRole('option', { name: /Undo/ }).click();
    await expect(page.getByTestId('settings-shortcuts')).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByTestId('shortcut-redo')).toContainText('Ctrl');
    await page.screenshot({ path: test.info().outputPath('settings-shortcuts.png') });

    await launched.close();
    launched = await launchApp({ work });
    ({ app, page } = launched);
    await expect.poll(() => zoom(app)).toBe(1.25);
    await page.getByTestId('settings').click();
    dialog = page.getByTestId('settings-dialog');
    await expect(dialog.getByTestId('settings-start-page').getByRole('radio', { name: 'Last project' })).toBeChecked();
    await page.getByTestId('settings-about').click();
    await expect(dialog.getByTestId('settings-check-updates').getByRole('switch')).not.toBeChecked();
    // Reset of the general section brings the size back at once.
    await page.getByTestId('settings-general').click();
    await dialog.getByTestId('settings-reset-general').click();
    await page.getByTestId('settings-reset-go').click();
    await expect.poll(() => zoom(app)).toBe(1);
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
  expect(await axeAtRest(page, '[data-testid="solidcraft-engine"]')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('the chat is as wide as the user drags it, by mouse or keyboard, and stays so', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-e2e-chat-width-'));
  // Rounded: with display scaling the box measures a fraction of a pixel off (580.00006).
  const width = async (page: LaunchedApp['page']) => Math.round((await page.getByTestId('assistant-panel').boundingBox())?.width ?? 0);
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
  await lookAgain(page);
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
    bridge: ['agent', 'appInfo', 'assembly', 'chat', 'design', 'mirror', 'notes', 'print', 'project', 'relaunch', 'settings', 'sketches', 'solidcraft', 'updates', 'viewer', 'window'],
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
  // The plan's default model with a named effort; the plan itself is in the menu.
  await expect(chip).toHaveText('Claude Code · Default · Medium');
  await chip.click();
  await expect(page.getByTestId('agent-detail')).toHaveText('Claude Code 9.9.9 · Claude subscription');
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
    // A long model name stays on one line, without the plan's remark in brackets (seen 2026-11-06).
    await menu.getByTestId('model-option').filter({ hasText: 'Default (recommended)' }).click();
    await expect(chip).toHaveText('Claude Code · Default · Low');
    expect((await chip.boundingBox())?.height ?? 99).toBeLessThan(40);
    await menu.getByTestId('model-option').filter({ hasText: 'Sonnet 9' }).click();
    await expect(chip).toHaveText('Claude Code · Sonnet 9 · Low');
    await menu.getByTestId('model-keep').click();
    await expect(menu.getByTestId('model-is-default')).toBeVisible();
    expect(await axeAtRest(page, '[data-testid="agent-menu"]')).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('agent-model.png') });

    // Another model keeps the effort where it takes it; Haiku takes no "max". That a running
    // session switches mid-conversation is covered by the agent tests with the stream-json protocol.
    await menu.getByTestId('model-option').filter({ hasText: 'Haiku 9' }).click();
    await expect(menu.getByTestId('effort-option')).toHaveText(['Low', 'Medium', 'High']);
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
  await expect(chip).toHaveText('Claude Code · API key · Default · Medium');
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
  expect(await axeAtRest(app.page)).toEqual([]);
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
  expect(await axeAtRest(page, '[data-testid="print-profiles"]')).toEqual([]);
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
  const supportFree = assistant.getByTestId('support-free').getByRole('switch', { name: 'Design without support' });
  await expect(supportFree).toBeChecked();
  await supportFree.press('Space');
  await expect(supportFree).not.toBeChecked();
  // The design rule groups (2026-11-07) are on from the start; each turns off on its own.
  for (const rule of ['rounding', 'printInPlace', 'details', 'snap']) await expect(assistant.getByTestId(`design-${rule}`).getByRole('switch')).toBeChecked();
  const rounding = assistant.getByTestId('design-rounding').getByRole('switch', { name: 'Fillets and chamfers' });
  await rounding.press('Space');
  await expect(rounding).not.toBeChecked();
  await expect(assistant.getByTestId('design-snap').getByRole('switch')).toBeChecked();

  // Cancel keeps what was saved, the switch included.
  await page.getByTestId('settings-print').click();
  await dialog.getByTestId('printer-name').getByRole('textbox').fill('Anders');
  await dialog.getByTestId('print-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(chip).toContainText('Werkstatt');
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-assistant').click();
  await expect(page.getByTestId('settings-assistant-panel').getByTestId('support-free').getByRole('switch')).not.toBeChecked();
  await expect(page.getByTestId('settings-assistant-panel').getByTestId('design-rounding').getByRole('switch')).not.toBeChecked();
  await expect(page.getByTestId('settings-assistant-panel').getByTestId('design-details').getByRole('switch')).toBeChecked();
  await page.keyboard.press('Escape');
});

test('a printer from the catalog becomes an ordinary profile that can be changed', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  const dialog = page.getByTestId('print-profiles');
  await dialog.getByTestId('printers-add').click();
  const catalog = page.getByTestId('printer-catalog');
  // The search has the focus as the list comes in.
  await expect(catalog.getByTestId('printer-catalog-search')).toBeFocused();
  await page.keyboard.type('prusa');
  await expect(catalog.getByTestId('printer-catalog-option')).toHaveCount(4);
  // React Aria hides a popover while placing it; focusing too early used to leave it hidden.
  await expect(page.locator('[data-placement]', { has: catalog })).not.toHaveAttribute('style', /opacity: 0/);
  await page.screenshot({ path: test.info().outputPath('printer-catalog.png') });
  await catalog.getByTestId('printer-catalog-search').fill('prusa mk4');
  await expect(catalog.getByTestId('printer-catalog-option')).toHaveCount(1);
  await catalog.getByTestId('printer-catalog-search').press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(catalog).toHaveCount(0);

  await expect(dialog.getByTestId('printers-list').getByRole('option', { selected: true })).toContainText('Prusa MK4S');
  await expect(dialog.getByTestId('printer-name').getByRole('textbox')).toHaveValue('Prusa MK4S');
  await expect(dialog.getByTestId('printer-bed-x').getByRole('textbox')).toHaveValue('250');
  await expect(dialog.getByTestId('printer-bed-y').getByRole('textbox')).toHaveValue('210');
  await expect(dialog.getByTestId('printer-bed-z').getByRole('textbox')).toHaveValue('220');
  await expect(dialog.getByTestId('printer-layer').getByRole('textbox')).toHaveValue('0.2');
  const nozzle = dialog.getByTestId('printer-nozzle').getByRole('textbox');
  await expect(nozzle).toHaveValue('0.4');
  await nozzle.fill('0.6');
  await nozzle.press('Tab');
  await dialog.getByTestId('print-save').click();
  await expect(dialog).toHaveCount(0);

  const saved = await page.evaluate(() => (globalThis as unknown as { partbuddy: { print: { settings: () => Promise<{ printer: string; printers: { id: string; name: string; nozzle: number }[] }> } } }).partbuddy.print.settings());
  expect(saved.printers).toHaveLength(2);
  expect(saved.printers.find((item) => item.id === saved.printer)).toMatchObject({ name: 'Prusa MK4S', nozzle: 0.6 });
});

test('the tolerance assistant reads the test pieces into the material, which Save keeps', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  const dialog = page.getByTestId('print-profiles');
  await dialog.getByTestId('print-tab-material').click();
  await dialog.getByTestId('materials-list').getByRole('option', { name: /^PLA( |$)/ }).click();
  const assistant = page.getByTestId('tolerance-assistant');

  // Cancel leaves the material as it was.
  await dialog.getByTestId('tolerance-start').click();
  await expect(assistant).toHaveAttribute('data-step', 'material');
  await assistant.getByTestId('tolerance-cancel').click();
  await expect(assistant).toHaveCount(0);
  await expect(dialog.getByTestId('material-overhang').getByRole('textbox')).toHaveValue('45');
  // Escape then closes the settings, as anywhere else in them.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  await dialog.getByTestId('print-tab-material').click();

  await dialog.getByTestId('tolerance-start').click();
  await expect(assistant.getByTestId('tolerance-material')).toContainText('PLA');
  await assistant.getByTestId('tolerance-next').click();
  await expect(assistant).toHaveAttribute('data-step', 'pieces');
  await expect(assistant.getByTestId('tolerance-save')).toBeVisible();
  await assistant.getByTestId('tolerance-next').click();
  await expect(assistant).toHaveAttribute('data-step', 'results');
  const pick = async (testId: string, option: string) => {
    await assistant.getByTestId(testId).getByRole('button').click();
    await page.getByRole('option', { name: option, exact: true }).click();
    await expect(page.getByRole('option', { name: option, exact: true })).toHaveCount(0);
    await expect(assistant.getByTestId(testId)).toContainText(option);
  };
  await pick('tolerance-fit-clamp', '-0.05 mm');
  await pick('tolerance-fit-push', '0.1 mm');
  await pick('tolerance-fit-slide', '0.2 mm');
  await pick('tolerance-fit-turn', '0.3 mm');
  for (const [size, measured] of [['3', '2.75'], ['5', '4.75'], ['8', '7.75'], ['10', '9.75']] as const) {
    const field = assistant.getByTestId(`tolerance-hole-${size}`).getByRole('textbox');
    await field.fill(measured);
    await field.press('Tab');
  }
  await pick('tolerance-overhang', '50°');
  await assistant.getByTestId('tolerance-next').click();
  await expect(assistant).toHaveAttribute('data-step', 'preview');
  await expect(assistant.getByTestId('tolerance-row-overhang')).toContainText('45°');
  await expect(assistant.getByTestId('tolerance-row-overhang')).toContainText('50°');
  await expect(assistant.getByTestId('tolerance-row-hole')).toContainText('0.25 mm');
  await expect(assistant.getByTestId('tolerance-row-turn')).toHaveAttribute('data-changed', 'false');
  await page.screenshot({ path: test.info().outputPath('tolerance-preview.png') });
  await assistant.getByTestId('tolerance-next').click();
  await expect(assistant).toHaveCount(0);

  await expect(dialog.getByTestId('material-overhang').getByRole('textbox')).toHaveValue('50');
  await expect(dialog.getByTestId('material-hole').getByRole('textbox')).toHaveValue('0.25');
  await expect(dialog.getByTestId('material-fit-clamp').getByRole('textbox')).toHaveValue('-0.05');
  await dialog.getByTestId('print-save').click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => (globalThis as unknown as { partbuddy: { print: { settings: () => Promise<{ materials: { id: string; overhang: number; holeShrink: number; clearance: Record<string, number> }[] }> } } }).partbuddy.print.settings());
  expect(saved.materials.find((item) => item.id === 'pla')).toMatchObject({ overhang: 50, holeShrink: 0.25, clearance: { clamp: -0.05, push: 0.1, slide: 0.2, turn: 0.3 } });
});

test('a material from the catalog becomes an ordinary profile with its starting values', async () => {
  const entry = MATERIAL_CATALOG.find((item) => item.name === 'PETG-CF');
  if (!entry) throw new Error('PETG-CF is missing from the catalog');
  const { app } = await connectedApp();
  const { page } = app;
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  const dialog = page.getByTestId('print-profiles');
  await dialog.getByTestId('print-tab-material').click();
  await dialog.getByTestId('materials-add').click();
  const catalog = page.getByTestId('material-catalog');
  await expect(catalog.getByTestId('material-catalog-search')).toBeFocused();
  await expect(page.locator('[data-placement]', { has: catalog })).not.toHaveAttribute('style', /opacity: 0/);
  await page.keyboard.type('petg-cf');
  await expect(catalog.getByTestId('material-catalog-option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(catalog).toHaveCount(0);

  // A second copy of a material the defaults already have: a new profile, the old one untouched.
  await expect(dialog.getByTestId('materials-list').getByRole('option', { selected: true })).toContainText('PETG-CF');
  await expect(dialog.getByTestId('material-name').getByRole('textbox')).toHaveValue('PETG-CF');
  await expect(dialog.getByTestId('material-overhang').getByRole('textbox')).toHaveValue(String(entry.overhang));
  await expect(dialog.getByTestId('material-hole').getByRole('textbox')).toHaveValue(String(entry.holeShrink));
  for (const fit of ['clamp', 'push', 'slide', 'turn'] as const) {
    await expect(dialog.getByTestId(`material-fit-${fit}`).getByRole('textbox')).toHaveValue(String(entry.clearance[fit]));
  }
  const slide = dialog.getByTestId('material-fit-slide').getByRole('textbox');
  await slide.fill('0.45');
  await slide.press('Tab');
  await dialog.getByTestId('print-save').click();
  await expect(dialog).toHaveCount(0);

  const saved = await page.evaluate(() => (globalThis as unknown as { partbuddy: { print: { settings: () => Promise<{ materials: { id: string; name: string; overhang: number; holeShrink: number; clearance: Record<string, number> }[] }> } } }).partbuddy.print.settings());
  const added = saved.materials.filter((item) => item.name === 'PETG-CF');
  expect(added).toHaveLength(2);
  expect(added[0]?.id).toBe('petg-cf');
  expect(added[1]).toMatchObject({ overhang: entry.overhang, holeShrink: entry.holeShrink, clearance: { ...entry.clearance, slide: 0.45 } });
});

test('the ready-to-print light follows the printer, points at its findings and asks before a red export (M7)', async () => {
  const { app } = await connectedApp();
  const { page } = app;
  const light = page.getByTestId('print-check');
  // The light comes with the first check of the mirrored part, later on a busy runner.
  await expect(light).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
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
  expect(await axeAtRest(page, '[data-testid="print-check-panel"]')).toEqual([]);
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

    // Sorting by name (P1), and a tile renamed and duplicated without opening it.
    await page.getByTestId('home-sort').getByRole('button').click();
    await page.locator('[data-testid="home-sort-option"][data-sort="name"]').click();
    await expect(tiles.nth(0)).toHaveAttribute('data-name', 'Cable clip');
    await expect(tiles.nth(2)).toHaveAttribute('data-name', 'Wall holder');
    const menuOf = async (name: string) => {
      const tile = home.locator('li', { has: page.locator(`[data-testid="home-tile"][data-name="${name}"]`) });
      await tile.hover();
      await tile.getByTestId('home-tile-menu').click();
    };
    await menuOf('Cable clip');
    await page.getByTestId('home-tile-rename').click();
    await page.getByTestId('project-name-input').fill('Cable holder');
    await page.getByTestId('project-rename-save').click();
    await expect(home.locator('[data-testid="home-tile"][data-name="Cable holder"]')).toBeVisible();
    expect(existsSync(join(projects, 'Cable holder', 'Cable holder.sc'))).toBe(true);
    await menuOf('Cable holder');
    await page.getByTestId('home-tile-duplicate').click();
    await expect(tiles).toHaveCount(4);
    await expect(home.locator('[data-testid="home-tile"][data-name="Cable holder copy"]')).toBeVisible();
    await expect(home).toBeVisible();

    // Deleted into PartBuddy's recycle bin (P2) and restored with everything in it.
    writeFileSync(join(projects, 'Cable holder copy', 'Cable holder copy.chat.json'), '[]');
    await menuOf('Cable holder copy');
    await page.getByTestId('home-tile-trash').click();
    await page.getByTestId('project-trash-confirm').click();
    await expect(tiles).toHaveCount(3);
    expect(existsSync(join(projects, 'Cable holder copy'))).toBe(false);
    await page.getByTestId('home-trash-toggle').click();
    const deleted = page.getByTestId('home-trash-entry');
    await expect(deleted).toHaveCount(1);
    await expect(deleted).toHaveAttribute('data-name', 'Cable holder copy');
    await deleted.getByTestId('home-trash-restore').click();
    await expect(tiles).toHaveCount(4);
    await expect(page.getByTestId('home-trash')).toHaveCount(0);
    expect(readFileSync(join(projects, 'Cable holder copy', 'Cable holder copy.chat.json'), 'utf8')).toBe('[]');

    // A favourite stays on top in every order; tags are kept in project.json and filter (P5).
    const tileOf = (name: string) => home.locator('li', { has: page.locator(`[data-testid="home-tile"][data-name="${name}"]`) });
    await tileOf('Wall holder').hover();
    await tileOf('Wall holder').getByTestId('home-tile-favorite').click();
    await expect(tiles.nth(0)).toHaveAttribute('data-name', 'Wall holder');
    await menuOf('Übersicht');
    await page.getByTestId('home-tile-tags').click();
    await page.getByTestId('project-tags-input').fill('Garage, Küche');
    await page.getByTestId('project-tags-save').click();
    await expect(tileOf('Übersicht').getByTestId('home-tile-tags')).toHaveText('Garage · Küche');
    expect(JSON.parse(readFileSync(join(projects, 'Übersicht', 'project.json'), 'utf8'))).toMatchObject({ tags: ['Garage', 'Küche'] });
    await page.locator('[data-testid="home-tag"][data-tag="Küche"]').click();
    await expect(tiles).toHaveCount(1);
    await page.locator('[data-testid="home-tag"][data-tag="Küche"]').click();
    await expect(tiles).toHaveCount(4);
    await page.getByTestId('home-search').fill('garage');
    await expect(tiles).toHaveCount(1);
    await page.getByTestId('home-search').fill('');

    expect(await axeAtRest(page, '[data-testid="home-page"]')).toEqual([]);

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
