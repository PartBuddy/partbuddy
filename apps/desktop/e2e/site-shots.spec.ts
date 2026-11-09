import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp } from './launch';

// The pictures of the website (partbuddy.github.io), taken from the running app: English UI,
// 1440 × 900 at device scale 2, light and dark, SolidCraft headless in its own folders, the scripted assistant of
// test/siteClaude.mjs and the synthetic cable clip of tools/fixtures. Run with `pnpm site:shots`
// (tools/site-shots.mjs), which sets PARTBUDDY_SITE_SHOTS to the folder the pictures go to.
// Each picture is tried on its own; what fails is listed at the end instead of stopping the run.
const folder = process.env.PARTBUDDY_SITE_SHOTS;
test.skip(!folder, 'needs SolidCraft; run pnpm site:shots');
// `pnpm site:shots --only clarify,view`: just these pictures and the steps they build on.
const ONLY = new Set((process.env.PARTBUDDY_SITE_SHOTS_ONLY ?? '').split(',').map((part) => part.trim()).filter(Boolean));
// What a step leaves behind for later pictures: the template projects, the cable clip and its
// version, the first note, the inserted board, the answered questions, the seated screw.
const LATER: Record<string, string[]> = {
  projects: ['start', 'import'],
  clip: ['params', 'blocks', 'section', 'export', 'share', 'versions', 'model', 'start', 'view'],
  versions: ['start', 'view'],
  view: ['notes'],
  import: ['clarify'],
  clarify: ['research'],
  research: ['explode', 'plate', 'assembly'],
  sketch: ['sketch-chat'],
};
const wanted = (step: string): boolean => ONLY.size === 0 || ONLY.has(step) || (LATER[step] ?? []).some(wanted);

// Its own port, beside the contract tests (7881–7930) and other sessions' SolidCraft.
const PORT = '7951';
const CLI = process.env.SOLIDCRAFT_CLI ?? 'C:\\Program Files\\SolidCraft\\solidcraft-cli.exe';
// With the cable clip, four projects fill one row of the start page.
const TEMPLATES = [
  ['housing', 'Housing'],
  ['boxWithLid', 'Box with lid'],
  ['wallHolder', 'Wall holder'],
] as const;
// A synthetic circuit board of 50 × 30 mm with mounting holes, chips, a pin header and two capacitors,
// placed to sit in the middle of the housing template.
const onBoard = { operation: 'join', targets: ['Circuit board'] };
const BOARD = [
  { command: 'solid.box', params: { length: 50, width: 30, height: 1.6, corner: [15, 15, 2], operation: 'new', body_name: 'Circuit board', name: 'Board' } },
  { command: 'solid.fillet', params: { edges: [[15, 15, 2.8], [65, 15, 2.8], [15, 45, 2.8], [65, 45, 2.8]], radius: 2, body: 'Circuit board', name: 'Board corners' } },
  ...[[18, 18], [62, 18], [18, 42], [62, 42]].map(([x, y], i) => ({ command: 'solid.cylinder', params: { diameter: 2.7, height: 3, base: [x, y, 1], operation: 'cut', targets: ['Circuit board'], name: `Mounting hole ${i + 1}` } })),
  { command: 'solid.box', params: { length: 12, width: 12, height: 1.2, corner: [34, 24, 3.6], ...onBoard, name: 'Chip' } },
  { command: 'solid.box', params: { length: 7.5, width: 9, height: 3.2, corner: [15, 25.5, 3.6], ...onBoard, name: 'USB-C' } },
  { command: 'solid.box', params: { length: 25.4, width: 2.5, height: 2.5, corner: [27.3, 40, 3.6], ...onBoard, name: 'Header' } },
  ...Array.from({ length: 10 }, (_, i) => ({ command: 'solid.box', params: { length: 0.64, width: 0.64, height: 6, corner: [28.25 + i * 2.54, 40.93, 3.6], ...onBoard, name: `Pin ${i + 1}` } })),
  ...[[56, 24], [56, 33]].map(([x, y], i) => ({ command: 'solid.cylinder', params: { diameter: 5, height: 7, base: [x, y, 3.6], ...onBoard, name: `Capacitor ${i + 1}` } })),
  ...[[26, 20], [26, 23], [26, 26], [49, 20], [49, 36]].map(([x, y], i) => ({ command: 'solid.box', params: { length: 2, width: 1.25, height: 0.6, corner: [x, y, 3.6], ...onBoard, name: `Resistor ${i + 1}` } })),
  { command: 'solid.box', params: { length: 5, width: 5, height: 2, corner: [26, 30, 3.6], ...onBoard, name: 'Sensor' } },
];

type Bridge = { partbuddy: { design: { insert(path?: string): Promise<unknown>; insertPart(part: unknown): Promise<{ body: string | null }> } } };
type Shape = { tool: 'line' | 'rect' | 'circle' | 'dimension' | 'text'; from: [number, number]; to?: [number, number]; value?: string };
// Two sheets (F9, F10): the side view bent with R 3, then a 40 mm plate with an Ø 8 hole and an
// M3 hole on the free sheet, which the picture shows.
const SHEETS: { sheet: 'side' | 'free'; shapes: Shape[] }[] = [
  {
    sheet: 'side',
    shapes: [
      { tool: 'line', from: [0.4, 0.15], to: [0.4, 0.75] },
      { tool: 'line', from: [0.4, 0.75], to: [0.7, 0.75] },
      { tool: 'dimension', from: [0.4, 0.67], to: [0.45, 0.75], value: 'R 3' },
    ],
  },
  {
    sheet: 'free',
    shapes: [
      { tool: 'rect', from: [0.2, 0.2], to: [0.68, 0.7] },
      { tool: 'circle', from: [0.35, 0.45], to: [0.41, 0.45] },
      { tool: 'circle', from: [0.55, 0.45], to: [0.58, 0.45] },
      { tool: 'dimension', from: [0.2, 0.8], to: [0.68, 0.8], value: '40' },
      { tool: 'dimension', from: [0.29, 0.3], to: [0.41, 0.3], value: 'Ø 8' },
      { tool: 'text', from: [0.52, 0.56], value: 'M3 hole' },
    ],
  },
];

test('website pictures', async () => {
  test.setTimeout(20 * 60 * 1000);
  const out = folder ?? '';
  mkdirSync(out, { recursive: true });
  // The long form of the temp folder: SolidCraft refuses short (8.3) names such as ADMINI~1.
  const work = mkdtempSync(join(realpathSync.native(tmpdir()), 'partbuddy-site-'));
  const projects = join(work, 'projects');
  const board = join(work, 'Circuit board.step');
  writeFileSync(join(work, 'board.json'), JSON.stringify({ commands: [...BOARD, { command: 'file.export', params: { path: board, format: 'step' } }] }));
  execFileSync(CLI, ['run', join(work, 'board.json'), '--quiet'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const launched = await launchApp({
    isolated: false,
    work,
    env: {
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_PORT: PORT,
      PARTBUDDY_PROJECTS_DIR: projects,
      PARTBUDDY_START_PAGE: '1',
      PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
      PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'siteClaude.mjs')]),
    },
  });
  const { page } = launched;
  const report: Record<string, string> = {};
  // The dock's one-time hint is for a first start; the pictures show the dock as it is used.
  await page.evaluate(() => {
    (globalThis as unknown as { localStorage: { setItem: (key: string, value: string) => void } }).localStorage.setItem('partbuddy.dockHintSeen', '1');
  });
  const home = page.getByTestId('home-page');
  const name = page.getByTestId('design-name');
  const logs: string[] = [];
  launched.app.process().stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));

  // The window itself may be smaller than 1440 × 900 on this display; the renderer is told the size,
  // and CDP takes the picture at that scale (Playwright's screenshot uses the display's own).
  const cdp = await page.context().newCDPSession(page);
  // Every picture light and dark (`<name>-dark.png`): the website follows the viewer's theme.
  const shot = async (file: string) => {
    // A step that runs only for a later picture takes none of its own.
    if (ONLY.size > 0 && !ONLY.has(file)) return;
    await page.mouse.move(0, 450);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(900);
      // A fixed wait once caught the switch halfway (light 3D view in a dark picture, 2026-11-08):
      // take pictures until two in a row are the same, at most ten times.
      let { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      for (let i = 0; i < 10; i += 1) {
        await page.waitForTimeout(400);
        const next = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
        if (next === data) break;
        data = next;
      }
      writeFileSync(join(out, `${file}${scheme === 'dark' ? '-dark' : ''}.png`), Buffer.from(data, 'base64'));
    }
    await page.emulateMedia({ colorScheme: 'light' });
  };
  const step = async (file: string, run: () => Promise<void>) => {
    if (!wanted(file)) return;
    try {
      await run();
      report[file] = 'ok';
    } catch (error) {
      // eslint-disable-next-line no-control-regex -- Playwright colours its messages
      report[file] = (error as Error).message.replace(/\u001b\[\d+m/g, '').split('\n')[0]?.slice(0, 300) ?? 'failed';
      await page.screenshot({ path: test.info().outputPath(`${file}-failed.png`) }).catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  };
  const send = async (text: string) => {
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 120_000 });
  };
  const open = async (title: string) => {
    if ((await home.count()) === 0) await page.getByTestId('home-button').click();
    await home.getByTestId('home-tile').filter({ hasText: title }).click();
    // Right after another project SolidCraft starts again with this design, which took over 30 s.
    await expect(name).toHaveText(title, { timeout: 90_000 });
    await page.waitForTimeout(1000);
  };
  const fresh = async () => {
    if ((await home.count()) === 0) await page.getByTestId('home-button').click();
    await home.getByTestId('home-new').click();
    await expect(name).toHaveText(/^New part/, { timeout: 30_000 });
  };
  // Only a project with a design can be renamed; its chat so far then shows as an earlier session.
  const rename = async (title: string) => {
    // PartBuddy names a new project after its first body; renaming before that is overwritten.
    await expect(name).not.toHaveText(/^New part/, { timeout: 30_000 });
    await page.getByTestId('project-menu').click();
    await page.getByTestId('project-rename').click();
    await page.getByTestId('project-name-input').fill(title);
    await page.getByTestId('project-rename-save').click();
    await expect(name).toHaveText(title, { timeout: 15_000 });
  };
  const sketch = async () => {
    await page.getByTestId('composer-sketch-open').click();
    const pad = page.getByTestId('sketch-pad');
    const box = await pad.getByTestId('sketch-canvas').boundingBox();
    if (!box) throw new Error('sketch canvas not visible');
    const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
    for (const { sheet, shapes } of SHEETS) {
      await pad.getByTestId(`sketch-sheet-${sheet}`).click();
      for (const shape of shapes) {
        await pad.getByTestId(`sketch-tool-${shape.tool}`).click();
        await page.mouse.move(...at(shape.from));
        await page.mouse.down();
        await page.mouse.move(...at(shape.to ?? shape.from), { steps: 8 });
        await page.mouse.up();
        if (shape.value) {
          await pad.getByTestId('sketch-value').fill(shape.value);
          await page.keyboard.press('Enter');
        }
      }
      await expect(pad.getByTestId(`sketch-sheet-${sheet}`)).toContainText(String(shapes.length));
    }
    // A scale makes the squares a length: one square is 5 mm.
    await pad.getByTestId('sketch-scale').fill('5');
    await page.mouse.move(0, 450);
  };

  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await page.waitForTimeout(500);
    const size = await page.evaluate(() => {
      const view = globalThis as unknown as { innerWidth: number; innerHeight: number; devicePixelRatio: number };
      return [view.innerWidth, view.innerHeight, Math.round(view.devicePixelRatio * 100) / 100];
    });
    expect(size, 'window 1440 × 900 at scale 2').toEqual([1440, 900, 2]);

    await step('templates', async () => {
      await expect(home.getByTestId('home-template')).toHaveCount(5);
      await expect(home.getByTestId('home-empty')).toBeVisible();
      await shot('templates');
    });

    // A few projects from the templates, each with its picture for the start page.
    for (const [id, title] of wanted('projects') ? TEMPLATES : []) {
      if ((await home.count()) === 0) await page.getByTestId('home-button').click();
      await home.locator(`[data-template="${id}"]`).click();
      await expect(name).toHaveText(title, { timeout: 60_000 });
      await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 60_000 });
      await expect.poll(() => existsSync(join(projects, title, 'preview.png')), { timeout: 30_000 }).toBe(true);
    }

    // The cable clip, built by the assistant step by step.
    if (wanted('clip')) {
      await fresh();
      await send('Build a cable clip for a 12 mm cable that I can screw under my desk');
      await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 60_000 });
      await rename('Cable clip');
      await page.keyboard.press('0');
    }

    await step('params', async () => {
      // A favourite opened for editing shows its slider, as the website's picture of the parameters.
      await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
      await expect(page.getByTestId('parameters').getByTestId('parameter-slider')).not.toHaveCount(0);
      await shot('params');
    });
    await step('blocks', async () => {
      // The top of the base plate, as in the view picture: a seat for an insert belongs there.
      await pickFace(page, PLATE_TOP);
      await page.getByTestId('action-block').click();
      await page.getByTestId('block-kind').click();
      await page.getByRole('option', { name: 'Heat-set insert seat' }).click();
      await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 30_000 });
      await shot('blocks');
      await page.getByTestId('action-block').click();
      await page.keyboard.press('Escape');
    });
    await step('section', async () => {
      await page.getByTestId('section').click();
      await expect(page.getByTestId('section-panel')).toBeVisible();
      await page.getByTestId('section-panel').getByRole('radio', { name: 'Cut across Y' }).click();
      await shot('section');
      await page.getByTestId('section').click();
    });
    await step('export', async () => {
      await page.getByTestId('export').click();
      await expect(page.getByTestId('export-share')).toBeVisible();
      await expect(page.getByTestId('export-slicer')).not.toHaveCount(0);
      await shot('export');
      await page.keyboard.press('Escape');
    });
    // The package itself: its description goes beside the pictures, the notice is the picture.
    await step('share', async () => {
      await page.getByTestId('export').click();
      await page.getByTestId('export-share').click();
      await expect(page.getByText(/Sharing package saved in exports/)).toBeVisible({ timeout: 60_000 });
      await shot('share');
      const exports = join(projects, 'Cable clip', 'exports');
      const [made] = readdirSync(exports);
      copyFileSync(join(exports, made ?? '', 'description.md'), join(out, 'share-description.md'));
      copyFileSync(join(exports, made ?? '', 'Cable clip-iso.png'), join(out, 'share-iso.png'));
    });
    await step('versions', async () => {
      const dialog = page.getByTestId('versions-dialog');
      await page.getByTestId('versions-button').click();
      await dialog.getByTestId('version-name').fill('First print');
      await dialog.getByTestId('version-save').click();
      await page.keyboard.press('Escape');
      const lengthRow = page.locator('[data-testid="parameter"][data-name="base_length"]');
      await lengthRow.dblclick();
      const length = lengthRow.getByTestId('parameter-field').getByRole('textbox');
      await length.fill('80');
      await length.press('Enter');
      await expect(lengthRow).toHaveAttribute('aria-label', 'base_length, 80 mm', { timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.getByTestId('versions-button').click();
      const first = dialog.getByTestId('version').filter({ hasText: 'First print' });
      await first.getByTestId('version-compare').click();
      await expect(first.getByTestId('version-change')).not.toHaveCount(0, { timeout: 60_000 });
      await shot('versions');
      // Escape alone left the dialog open once; its close button always shuts it.
      await dialog.getByRole('button', { name: 'Close versions' }).click();
      await expect(dialog).toHaveCount(0);
    });
    await step('model', async () => {
      await page.getByTestId('agent-status').click();
      await expect(page.getByTestId('agent-menu').getByTestId('model-option')).toHaveCount(4);
      await expect(page.getByTestId('agent-usage')).toBeVisible();
      await shot('model');
      await page.keyboard.press('Escape');
    });
    // Before any note: its pin would show through the start page.
    await step('start', async () => {
      await page.getByTestId('home-button').click();
      await expect(home.getByTestId('home-tile')).toHaveCount(4);
      await expect(home.getByTestId('home-preview')).toHaveCount(4, { timeout: 30_000 });
      await shot('start');
    });
    await step('view', async () => {
      await open('Cable clip');
      await pickFace(page);
      await page.getByTestId('hud-ask').fill('Keep 3 mm of wall here – the screw head sits on it.');
      await page.getByTestId('hud-note').click();
      await expect(page.getByTestId('note-pin')).toHaveCount(1, { timeout: 15_000 });
      // The face picked again beside the pin: its name shows with the selection.
      await pickFace(page, PLATE_TOP);
      await shot('view');
      await page.keyboard.press('Escape');
    });
    // Notes on the model (ADR 0006, 0020): one more on an edge and one on the plate's top, all three in the list.
    await step('notes', async () => {
      const note = async (text: string) => {
        await page.getByTestId('hud-ask').fill(text);
        await page.getByTestId('hud-note').click();
      };
      await pickFace(page, EDGE_SWEEP, 'edge');
      await note('This edge R2 instead of R1.');
      await expect(page.getByTestId('note-pin')).toHaveCount(2, { timeout: 15_000 });
      await pickFace(page, PLATE_TOP);
      await note('Make this plate 1 mm thicker.');
      await expect(page.getByTestId('note-pin')).toHaveCount(3, { timeout: 15_000 });
      await page.keyboard.press('Escape');
      await page.getByTestId('notes').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('note-row')).toHaveCount(3);
      await shot('notes');
    });

    // The housing around an imported circuit board.
    await step('import', async () => {
      await open('Housing');
      await page.evaluate((path) => (globalThis as unknown as Bridge).partbuddy.design.insert(path), board);
      await expect(page.getByTestId('structure-body')).toHaveCount(3, { timeout: 30_000 });
      await page.keyboard.press('0');
      await shot('import');
    });
    await step('clarify', async () => {
      await send('Fit this housing to the circuit board');
      await expect(page.getByTestId('question-card')).toHaveAttribute('data-kind', 'ask', { timeout: 30_000 });
      await shot('clarify');
    });
    await step('research', async () => {
      await send('Research the M3 screws for the lid');
      await expect(page.getByTestId('source-card')).toHaveCount(2, { timeout: 30_000 });
      // The standard part the answer speaks of, in the lid hole nearest the camera (lid beside the housing).
      const inserted = await page.evaluate(() =>
        (globalThis as unknown as Bridge).partbuddy.design.insertPart({ family: 'socket_head_cap_screw', size: 'M3', length: 10, point: [76.2, 75.5, 1] }),
      );
      if (!inserted.body) throw new Error('no screw inserted');
      await expect(page.getByTestId('structure-body').filter({ hasText: 'standard part' })).toHaveCount(1, { timeout: 30_000 });
      await shot('research');
    });
    await step('explode', async () => {
      await page.getByTestId('explode').click();
      await page.getByTestId('explode-panel').getByRole('slider').focus();
      await page.keyboard.press('End');
      // The view is not fitted to the parts apart; a little farther away they all show.
      const view = await page.getByTestId('viewport').boundingBox();
      if (view) await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(1000);
      await shot('explode');
      await page.getByTestId('explode').click();
    });
    // Viewport CAD round (2026-11-07): the parts nested on the printer's bed, and the assembly halfway.
    await step('plate', async () => {
      await page.getByTestId('view-plate').click();
      await expect(page.getByTestId('plate-label')).toContainText(/Plate 1 of/, { timeout: 30_000 });
      await page.waitForTimeout(1500);
      await shot('plate');
      await page.getByTestId('view-assembled').click();
      await page.waitForTimeout(800);
    });
    await step('assembly', async () => {
      await page.getByTestId('assembly').click();
      const panel = page.getByTestId('assembly-panel');
      await expect(panel).toBeVisible();
      await panel.getByTestId('assembly-play').click();
      const steps = await panel.getByTestId('assembly-step').count();
      // Paused in the middle of the last step but one: earlier parts placed, one coming in.
      await panel.getByTestId('assembly-timeline').getByRole('slider').focus();
      await page.keyboard.press('Home');
      // The timeline counts hundredths of a step.
      await page.keyboard.press('ArrowRight', { delay: 0 });
      for (let i = 1; i < Math.max(1, (steps - 1.5) * 100); i += 1) await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1500);
      await shot('assembly');
      await page.getByTestId('assembly').click();
      await page.waitForTimeout(800);
    });

    await step('printready', async () => {
      await fresh();
      await send('Build a case and a lid for it');
      await expect(page.getByTestId('mesh-summary')).toContainText('2 bodies', { timeout: 60_000 });
      await page.keyboard.press('0');
      await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
      await page.getByTestId('print-check').click();
      await expect(page.getByTestId('print-check-panel').locator('[data-kind="tight"], [data-kind="overlap"]')).not.toHaveCount(0, { timeout: 30_000 });
      await shot('printready');
      await page.keyboard.press('Escape');
    });
    await step('photo', async () => {
      await fresh();
      // No photo of a real object here; a rendered template picture stands in for one.
      await page.getByTestId('composer-photo-input').setInputFiles(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'boxWithLid.png'));
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByTestId('question-card')).toHaveAttribute('data-kind', 'ask', { timeout: 30_000 });
      await shot('photo');
    });
    await step('sketch', async () => {
      await fresh();
      await sketch();
      await shot('sketch');
    });
    await step('sketch-chat', async () => {
      await page.getByTestId('sketch-pad').getByTestId('sketch-attach').click();
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByTestId('question-card')).toHaveAttribute('data-kind', 'ask', { timeout: 30_000 });
      await shot('sketch-chat');
    });
    await step('tolerance', async () => {
      await page.getByTestId('settings').click();
      await page.getByTestId('settings-print').click();
      const profiles = page.getByTestId('print-profiles');
      await profiles.getByTestId('print-tab-material').click();
      await profiles.getByTestId('tolerance-start').click();
      const assistant = page.getByTestId('tolerance-assistant');
      await assistant.getByTestId('tolerance-next').click();
      await expect(assistant.getByTestId('tolerance-picture')).toBeVisible({ timeout: 120_000 });
      await shot('tolerance');
      await assistant.getByTestId('tolerance-cancel').click();
      await expect(assistant).toHaveCount(0);
      await page.getByTestId('dialog-close').click();
      await expect(profiles).toHaveCount(0);
    });
    // 0.2.0's main feature: a logo and a text on the wall holder's plate, each picked with its own
    // controls in the dock. The fox is Twemoji (CC-BY 4.0, test/fixtures/svg/twemoji-fox.LICENSE).
    const wallHolder = async () => {
      const before = (await name.textContent()) ?? '';
      if ((await home.count()) === 0) await page.getByTestId('home-button').click();
      await home.locator('[data-template="wallHolder"]').click();
      // A new project each time ("Wall holder", then "Wall holder 2"), in the template's own slanted view.
      await expect(name).toHaveText(/^Wall holder/, { timeout: 60_000 });
      await expect(name).not.toHaveText(before, { timeout: 60_000 });
      await page.getByTestId('viewport').hover();
      await page.keyboard.press('0');
      // The template's own slanted view shows the whole plate beside the dock.
      await page.waitForTimeout(1500);
    };
    // A plain click on the built logo or text picks it whole; the camera may still settle.
    const pickPlaced = async (panel: string, spots: readonly (readonly [number, number])[]) => {
      const view = await page.getByTestId('viewport').boundingBox();
      if (!view) throw new Error('viewport not visible');
      let n = 0;
      await expect(async () => {
        const [x, y] = spots[n++ % spots.length] ?? [0.36, 0.5];
        await page.keyboard.press('Escape');
        await page.mouse.click(view.x + view.width * x, view.y + view.height * y);
        await expect(page.getByTestId(panel)).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 60_000, intervals: [500] });
      // Pan the part left of the dock (right-drag, above the dock), so the dock covers none of it.
      await page.mouse.move(view.x + view.width * 0.55, view.y + view.height * 0.25);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(view.x + view.width * 0.38, view.y + view.height * 0.25, { steps: 12 });
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(800);
    };
    await step('logo', async () => {
      await wallHolder();
      await pickFace(page, PLATE_FRONT);
      await page.getByTestId('block-tile-logo').click();
      await page.getByTestId('block-logo').locator('input[type=file]').setInputFiles(join(__dirname, '..', 'test', 'fixtures', 'svg', 'twemoji-fox.svg'));
      await page.getByTestId('block-mode').getByRole('button').click();
      await page.getByRole('option', { name: 'Embossed' }).click();
      await page.getByTestId('block-width').getByRole('textbox').fill('30');
      await page.getByTestId('block-colours').click();
      // Three filaments: the fox's nearest colours merge, and the preview comes quicker.
      await page.getByTestId('block-colours-most').getByRole('button').click();
      await page.getByRole('option', { name: '3', exact: true }).click();
      await page.getByTestId('block-centre').click();
      await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 180_000 });
      await page.getByTestId('block-apply').click();
      await expect(page.getByText('SVG-Logo twemoji-fox', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      await pickPlaced('logo-move', [[0.36, 0.5], [0.34, 0.52], [0.38, 0.48], [0.36, 0.46], [0.33, 0.5], [0.39, 0.53]]);
      await shot('logo');
      await page.keyboard.press('Escape');
    });
    await step('text', async () => {
      await wallHolder();
      await pickFace(page, PLATE_FRONT);
      await page.getByTestId('block-tile-text').click();
      await page.getByTestId('block-text').getByRole('textbox').fill('Werkstatt');
      await page.getByTestId('block-mode').getByRole('button').click();
      await page.getByRole('option', { name: 'Embossed' }).click();
      await page.getByTestId('block-height').getByRole('textbox').fill('6');
      await page.getByTestId('block-font').getByRole('combobox').fill('Segoe UI');
      await page.getByRole('option', { name: 'Segoe UI', exact: true }).click();
      await page.getByTestId('block-centre-both').click();
      await expect(page.getByTestId('block-status')).toHaveAttribute('data-ok', 'true', { timeout: 180_000 });
      await page.getByTestId('block-apply').click();
      await expect(page.getByText('Text Werkstatt', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      // The letters run slanted below the plate's middle in this view.
      await pickPlaced('logo-text', [[0.3, 0.56], [0.35, 0.58], [0.4, 0.6], [0.28, 0.55], [0.33, 0.57], [0.38, 0.59]]);
      await shot('text');
      await page.keyboard.press('Escape');
    });
    await step('settings', async () => {
      await page.getByTestId('settings').click();
      // The assistant's page: the general page shows the projects folder with the account's name.
      await page.getByTestId('settings-assistant').click();
      await expect(page.getByTestId('settings-assistant-panel')).toBeVisible();
      await shot('settings');
      await page.keyboard.press('Escape');
    });
    // Last: it switches the assistant to the local model server of this computer.
    await step('local', async () => {
      await page.getByTestId('agent-status').click();
      await page.getByTestId('agent-menu').getByText('Local model', { exact: true }).click();
      await expect(page.getByTestId('agent-status')).toContainText(/Local model · \S+/, { timeout: 30_000 });
      await shot('local');
      await page.keyboard.press('Escape');
    });
  } finally {
    const missing = Object.entries(report).filter(([, result]) => result !== 'ok');
    writeFileSync(test.info().outputPath('site-shots.json'), JSON.stringify(report, null, 2));
    writeFileSync(test.info().outputPath('main.log'), logs.join(''));
    await page.screenshot({ path: test.info().outputPath('last.png') }).catch(() => undefined);
    console.log(`site shots in ${out}:\n${Object.entries(report).map(([file, result]) => `  ${file}: ${result}`).join('\n')}`);
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    expect(missing, 'pictures that failed').toEqual([]);
  }
});

/** The wall holder's plate in its template view, beside the dock. */
const PLATE_FRONT = [[0.36, 0.5], [0.38, 0.45], [0.34, 0.55]] as const;
const PLATE_TOP = [[0.62, 0.72], [0.7, 0.74], [0.45, 0.74]] as const;
// Down the middle of the view in small steps, until a click lands on an edge.
const EDGE_SWEEP = Array.from({ length: 80 }, (_, i) => [0.5, 0.4 + i * 0.005] as const);
const SPOTS = [[0.5, 0.62], [0.42, 0.6], [0.6, 0.62], [0.5, 0.55], [0.35, 0.55], [0.65, 0.55]] as const;

/** Clicks across the view until a face (or the given kind) is selected. */
async function pickFace(page: Page, points: readonly (readonly [number, number])[] = SPOTS, kind: 'face' | 'edge' = 'face'): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const bar = page.getByTestId('selection-bar');
  for (const [x, y] of points) {
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(400);
    if ((await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === kind) return;
  }
  throw new Error(`no ${kind} found`);
}
