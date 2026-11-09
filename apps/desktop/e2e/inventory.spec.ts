import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { FakeSolidCraft } from '../test/fakeSolidCraft';
import { launchApp, lookAgain } from './launch';
import { answerRound } from './practice';

// UI inventory (decided 2026-11-04): pictures of every area and state, light and dark, as the
// basis for the UI upgrade. The real part spends Claude subscription usage, so it runs only with
// PARTBUDDY_INVENTORY=1. The window stays off screen; SolidCraft runs headless in its own folders.
// Each step is tried on its own: a step that fails is noted in report.json, the rest goes on.
test.skip(process.env.PARTBUDDY_INVENTORY !== '1', 'spends Claude usage; set PARTBUDDY_INVENTORY=1');
test.describe.configure({ mode: 'serial' });

const SCHEMES = ['light', 'dark'] as const;
const TURN_TIMEOUT_MS = 12 * 60 * 1000;

const REQUEST =
  'Baue einen Wandhalter für einen Akkuschrauber: eine Platte zum Anschrauben mit zwei Senkkopfschrauben 4 mm und einen nach oben ' +
  'gebogenen Haken, in den der Griff (etwa 35 mm breit) gehängt wird. Lege Plattenhöhe und Hakenweite als Parameter an.';
const QUESTION = 'Ist das Teil gut druckbar? Nenne kurz die beste Ausrichtung. Ändere nichts.';

/** Pictures the current state once per colour scheme, then returns to light. */
async function shot(page: Page, name: string): Promise<void> {
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(700);
    await page.screenshot({ path: test.info().outputPath(`${name}-${scheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(300);
}

async function step(report: Record<string, string>, name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    report[name] = 'ok';
  } catch (error) {
    report[name] = (error as Error).message.split('\n')[0]?.slice(0, 300) ?? 'failed';
  }
}

async function send(page: Page, message: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
}

async function turnEnded(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeHidden({ timeout: TURN_TIMEOUT_MS });
  await page.waitForTimeout(1500);
}

async function viewport(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  return box;
}

/** Clicks across the view until the selection is of the given kind. */
async function pick(page: Page, kind: 'face' | 'edge' | 'vertex'): Promise<void> {
  const box = await viewport(page);
  const bar = page.getByTestId('selection-bar');
  for (let y = 0.35; y <= 0.65; y += 0.05) {
    for (let x = 0.3; x <= 0.7; x += kind === 'face' ? 0.1 : 0.006) {
      await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.waitForTimeout(kind === 'face' ? 300 : 60);
      if ((await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === kind) return;
    }
  }
  throw new Error(`no ${kind} found`);
}

test('inventory: real part, every state, light and dark', async () => {
  test.setTimeout(40 * 60 * 1000);
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-inventory-'));
  const launched = await launchApp({
    isolated: false,
    work,
    env: { SOLIDCRAFT_CONTROL_DIR: join(work, 'control'), PARTBUDDY_SOLIDCRAFT_PORT: '7930', PARTBUDDY_PROJECTS_DIR: join(work, 'projects') },
  });
  const { page } = launched;
  const report: Record<string, string> = {};
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
    await step(report, '01-start', () => shot(page, '01-start'));

    await step(report, '02-working', async () => {
      await send(page, REQUEST);
      await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(6000);
      await shot(page, '02-working');
    });
    await step(report, '03-plan-card', async () => {
      // Every part in the practice run began with a plan card; other questions get the first answer.
      for (let round = 0; round < 4; round += 1) {
        await turnEnded(page);
        const open = page.getByTestId('question-card').filter({ hasNot: page.getByTestId('question-answered') });
        if ((await open.count()) === 0) break;
        const card = open.first();
        const kind = await card.getAttribute('data-kind');
        await card.scrollIntoViewIfNeeded();
        await shot(page, kind === 'plan' ? '03-plan-card' : `03-question-${round}`);
        if (kind === 'plan') await card.getByRole('button', { name: 'Go' }).click();
        else await answerRound(card, undefined);
        await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(12_000);
        await shot(page, `04-building-${round}`);
      }
    });
    await step(report, '05-built', async () => {
      await turnEnded(page);
      await shot(page, '05-built');
    });
    await step(report, '06-face', async () => {
      await page.keyboard.press('0');
      await page.waitForTimeout(800);
      await pick(page, 'face');
      await shot(page, '06-face');
    });
    await step(report, '07-actions', async () => {
      await page.getByTestId('hud-actions').click();
      await page.waitForTimeout(400);
      await shot(page, '07-actions');
      await page.keyboard.press('Escape');
    });
    await step(report, '08-edge', async () => {
      await pick(page, 'edge');
      await shot(page, '08-edge');
    });
    await step(report, '09-dimension-preview', async () => {
      const field = page.getByTestId('dimension-field').getByRole('textbox');
      await field.fill('45');
      await page.waitForTimeout(2500);
      await shot(page, '09-dimension-preview');
      await page.keyboard.press('Escape');
    });
    await step(report, '10-note', async () => {
      await pick(page, 'face');
      await page.getByTestId('hud-ask').fill('Hier 3 mm Wand, sonst bricht der Haken.');
      await shot(page, '10-note-composer');
      await page.getByTestId('hud-note').click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      await shot(page, '11-note-pin');
    });
    await step(report, '12-dimensions', async () => {
      await page.keyboard.press('Escape');
      await page.getByTestId('dimensions').click();
      await page.waitForTimeout(2000);
      await shot(page, '12-dimensions');
      await page.getByTestId('dimensions-all').click();
      await page.waitForTimeout(2000);
      await shot(page, '13-dimensions-all');
      const label = page.getByTestId('mark-label').first();
      await label.click();
      await page.waitForTimeout(800);
      await shot(page, '14-dimension-edit');
      await page.keyboard.press('Escape');
      await page.getByTestId('dimensions').click();
    });
    await step(report, '16-export', async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      await page.waitForTimeout(400);
      await shot(page, '16-export');
      await page.keyboard.press('Escape');
    });
    await step(report, '17-ortho', async () => {
      await page.getByTestId('viewport').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('5');
      await page.keyboard.press('1');
      await page.waitForTimeout(1000);
      await shot(page, '17-ortho-front');
      await page.keyboard.press('5');
      await page.keyboard.press('0');
    });
    await step(report, '18-timeline', async () => {
      await page.getByTestId('timeline-feature').nth(1).click();
      await page.waitForTimeout(500);
      await shot(page, '18-timeline');
      await page.keyboard.press('Escape');
    });
    await step(report, '19-answer', async () => {
      await send(page, QUESTION);
      await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 60_000 });
      await turnEnded(page);
      await shot(page, '19-answer');
    });
  } finally {
    writeFileSync(test.info().outputPath('report.json'), JSON.stringify(report, null, 2));
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

test('inventory: states without SolidCraft or sign-in, light and dark', async () => {
  const report: Record<string, string> = {};
  const plain = await launchApp();
  try {
    await expect(plain.page.getByTestId('connection-status')).toHaveText('SolidCraft not running');
    await step(report, '20-no-solidcraft', () => shot(plain.page, '20-no-solidcraft'));
    await step(report, '21-chatgpt-signin', async () => {
      await plain.page.getByTestId('agent-status').click();
      await plain.page.getByTestId('agent-menu').getByText('ChatGPT', { exact: true }).click();
      await shot(plain.page, '21-agent-menu');
      await plain.page.keyboard.press('Escape');
      await expect(plain.page.getByRole('button', { name: 'Continue with ChatGPT' })).toBeVisible();
      await shot(plain.page, '21-chatgpt-signin');
    });
  } finally {
    await plain.close();
  }

  const keyed = await launchApp({ env: { FAKE_CLAUDE_API_KEY: '1' } });
  const fake = new FakeSolidCraft({ controlDir: keyed.controlDir });
  try {
    await fake.start();
    await lookAgain(keyed.page);
    await expect(keyed.page.getByTestId('mesh-summary')).toContainText('41 faces');
    await step(report, '22-api-key', () => shot(keyed.page, '22-api-key'));
    await fake.stop();
    await step(report, '23-connection-lost', async () => {
      await expect(keyed.page.getByText('The connection to SolidCraft was lost')).toBeVisible();
      await shot(keyed.page, '23-connection-lost');
    });
  } finally {
    writeFileSync(test.info().outputPath('report.json'), JSON.stringify(report, null, 2));
    await keyed.close();
    await fake.stop().catch(() => undefined);
  }
});
