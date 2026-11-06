import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp } from './launch';

// The pictures of the website (partbuddy.github.io), taken from the running app: English UI,
// 1440 × 900 at device scale 2, SolidCraft headless in its own folders, the scripted assistant of
// test/siteClaude.mjs and the synthetic cable clip of tools/fixtures. Run with `pnpm site:shots`
// (tools/site-shots.mjs), which sets PARTBUDDY_SITE_SHOTS to the folder the pictures go to.
// Each picture is tried on its own; what fails is listed at the end instead of stopping the run.
const folder = process.env.PARTBUDDY_SITE_SHOTS;
test.skip(!folder, 'needs SolidCraft; run pnpm site:shots');

// Its own port, beside the contract tests (7881–7930) and other sessions' SolidCraft.
const PORT = '7951';
// With the cable clip, four projects fill one row of the start page.
const TEMPLATES = [
  ['housing', 'Housing'],
  ['boxWithLid', 'Box with lid'],
  ['wallHolder', 'Wall holder'],
] as const;
// An L-shaped bracket, drawn on the sketch pad.
const BRACKET: [number, number][] = [[0.25, 0.15], [0.25, 0.8], [0.75, 0.8], [0.75, 0.68], [0.37, 0.68], [0.37, 0.15], [0.25, 0.15]];

test('website pictures', async () => {
  test.setTimeout(15 * 60 * 1000);
  const out = folder ?? '';
  mkdirSync(out, { recursive: true });
  // The long form of the temp folder: SolidCraft refuses short (8.3) names such as ADMINI~1.
  const work = mkdtempSync(join(realpathSync.native(tmpdir()), 'partbuddy-site-'));
  const projects = join(work, 'projects');
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
  const home = page.getByTestId('home-page');
  const name = page.getByTestId('design-name');
  const logs: string[] = [];
  launched.app.process().stdout?.on('data', (chunk: Buffer) => logs.push(String(chunk)));

  const shot = async (file: string, scheme: 'light' | 'dark' = 'light') => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.mouse.move(0, 450);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(out, `${file}.png`) });
    await page.emulateMedia({ colorScheme: 'light' });
  };
  const step = async (file: string, run: () => Promise<void>) => {
    try {
      await run();
      report[file] = 'ok';
    } catch (error) {
      report[file] = (error as Error).message.split('\n')[0]?.slice(0, 300) ?? 'failed';
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
    await expect(name).toHaveText(title, { timeout: 30_000 });
    await page.waitForTimeout(1000);
  };
  const draw = async () => {
    const canvas = page.getByTestId('sketch-pad').getByTestId('sketch-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('sketch canvas not visible');
    const [first, ...rest] = BRACKET;
    if (!first) return;
    await page.mouse.move(box.x + box.width * first[0], box.y + box.height * first[1]);
    await page.mouse.down();
    for (const [x, y] of rest) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 10 });
    await page.mouse.up();
  };

  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    // The window itself may be smaller than 1440 × 900 on this display; the renderer is told the size.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    await page.waitForTimeout(500);
    const size = await page.evaluate(() => {
      const view = globalThis as unknown as { innerWidth: number; innerHeight: number; devicePixelRatio: number };
      return [view.innerWidth, view.innerHeight, Math.round(view.devicePixelRatio * 100) / 100];
    });
    expect(size, 'window 1440 × 900 at scale 2').toEqual([1440, 900, 2]);

    // A few projects from the templates, each with its picture for the start page.
    for (const [id, title] of TEMPLATES) {
      if ((await home.count()) === 0) await page.getByTestId('home-button').click();
      await home.locator(`[data-template="${id}"]`).click();
      await expect(name).toHaveText(title, { timeout: 60_000 });
      await expect(page.getByTestId('print-check')).not.toHaveAttribute('data-status', 'block', { timeout: 60_000 });
      await expect.poll(() => existsSync(join(projects, title, 'preview.png')), { timeout: 30_000 }).toBe(true);
    }

    // The cable clip, named first (a rename later starts a new chat session) and built by the assistant.
    await page.getByTestId('home-button').click();
    await home.getByTestId('home-new').click();
    await expect(name).toHaveText('New part', { timeout: 30_000 });
    await page.getByTestId('project-menu').click();
    await page.getByTestId('project-rename').click();
    await page.getByTestId('project-name-input').fill('Cable clip');
    await page.getByTestId('project-rename-save').click();
    await expect(name).toHaveText('Cable clip', { timeout: 15_000 });
    await send('Build a cable clip for a 12 mm cable that I can screw under my desk');
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body', { timeout: 60_000 });
    await page.keyboard.press('0');

    await step('params', async () => {
      const parameters = page.getByTestId('parameters');
      await expect(parameters.getByTestId('parameter-slider')).not.toHaveCount(0);
      await shot('params');
    });
    await step('printready', async () => {
      await expect(page.getByTestId('print-check')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
      await page.getByTestId('print-check').click();
      await expect(page.getByTestId('print-check-panel')).toBeVisible();
      await shot('printready');
      await page.keyboard.press('Escape');
    });
    await step('blocks', async () => {
      await pickFace(page);
      await page.getByTestId('action-block').click();
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
    await step('versions', async () => {
      const dialog = page.getByTestId('versions-dialog');
      await page.getByTestId('versions-button').click();
      await dialog.getByTestId('version-name').fill('First print');
      await dialog.getByTestId('version-save').click();
      await page.keyboard.press('Escape');
      const length = page.locator('[data-testid="parameter"][data-name="base_length"]').getByTestId('parameter-field').getByRole('textbox');
      await length.fill('80');
      await length.press('Enter');
      await expect(length).toHaveValue('80', { timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.getByTestId('versions-button').click();
      const first = dialog.getByTestId('version').filter({ hasText: 'First print' });
      await first.getByTestId('version-compare').click();
      await expect(first.getByTestId('version-change')).not.toHaveCount(0, { timeout: 60_000 });
      await shot('versions');
      await page.keyboard.press('Escape');
    });
    await step('research', async () => {
      await send('Research the 608 bearing, I want to hold one in a part');
      await expect(page.getByTestId('source-card')).toHaveCount(2, { timeout: 30_000 });
      await shot('research');
    });
    await step('model', async () => {
      await page.getByTestId('agent-status').click();
      await expect(page.getByTestId('agent-menu').getByTestId('model-option')).toHaveCount(4);
      await shot('model');
      await page.keyboard.press('Escape');
    });
    // Before the note: its pin would show through the start page.
    await step('start', async () => {
      await page.getByTestId('home-button').click();
      await expect(home.getByTestId('home-tile')).toHaveCount(4);
      await expect(home.getByTestId('home-preview')).toHaveCount(4, { timeout: 30_000 });
      await shot('start');
    });
    await step('view', async () => {
      await open('Cable clip');
      await pickFace(page);
      await page.getByTestId('hud-note').click();
      await page.getByTestId('note-new-text').fill('Keep 3 mm of wall here – the screw head sits on it.');
      await page.getByTestId('note-new-save').click();
      await expect(page.getByTestId('note-pin')).toHaveCount(1, { timeout: 15_000 });
      await shot('view');
      await page.keyboard.press('Escape');
    });
    await step('clarify', async () => {
      await open('Housing');
      await send('Fit this housing to a 50 × 30 mm circuit board');
      await expect(page.getByTestId('question-card')).toHaveAttribute('data-kind', 'ask', { timeout: 30_000 });
      await shot('clarify');
      await shot('clarify-dark', 'dark');
    });
    await step('explode', async () => {
      await page.getByTestId('explode').click();
      await page.getByTestId('explode-panel').getByRole('slider').focus();
      await page.keyboard.press('End');
      // The view is not fitted to the parts apart; a little farther away they all show.
      const view = await page.getByTestId('viewport').boundingBox();
      if (view) await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(1000);
      await shot('explode');
      await page.getByTestId('explode').click();
    });
    await step('sketch', async () => {
      await page.getByTestId('home-button').click();
      await home.getByTestId('home-new').click();
      await expect(name).toHaveText('New part', { timeout: 30_000 });
      await page.getByTestId('composer-sketch-open').click();
      await draw();
      await page.getByTestId('sketch-pad').getByTestId('sketch-attach').click();
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByTestId('question-card')).toHaveAttribute('data-kind', 'ask', { timeout: 30_000 });
      // The sketch itself shows only on its pad: open it again beside the question.
      await page.getByTestId('composer-sketch-open').click();
      await draw();
      await shot('sketch');
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

/** Clicks across the view until a face is selected. */
async function pickFace(page: Page): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const bar = page.getByTestId('selection-bar');
  for (const [x, y] of [[0.5, 0.62], [0.42, 0.6], [0.6, 0.62], [0.5, 0.55], [0.35, 0.55], [0.65, 0.55]] as const) {
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(400);
    if ((await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === 'face') return;
  }
  throw new Error('no face found');
}
