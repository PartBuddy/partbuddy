import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// UI/UX audit (2026-11-09): every surface of the inventory (docs/audits/ui-inventar-*.md) opened in
// the real app with a headless SolidCraft and the fake Claude, pictured light and dark at 960×600
// and 1440×900, with axe (WCAG 2.2 AA), console errors, clipped texts and the app's log per run.
// Opt in with PARTBUDDY_AUDIT set to the folder the pictures go to, and PARTBUDDY_E2E_SOLIDCRAFT=1.
const folder = process.env.PARTBUDDY_AUDIT;
test.skip(!folder || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'audit pictures; set PARTBUDDY_AUDIT to a folder and PARTBUDDY_E2E_SOLIDCRAFT=1');

const RUNS = [
  { name: 'de-narrow', lang: 'de', width: 960, height: 600, port: '7941' },
  { name: 'de-wide', lang: 'de', width: 1440, height: 900, port: '7942' },
  { name: 'en-narrow', lang: 'en', width: 960, height: 600, port: '7943' },
  // Full HD, maximised at 100 % (the taskbar takes 48 px): how most people see the app.
  { name: 'de-fullhd', lang: 'de', width: 1920, height: 1032, port: '7947' },
] as const;

const fakeClaude = JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]);

interface Report {
  steps: Record<string, string>;
  axe: string[];
  console: string[];
  clipped: Record<string, string[]>;
  timings: Record<string, number>;
}

function newReport(): Report {
  return { steps: {}, axe: [], console: [], clipped: {}, timings: {} };
}

async function launch(work: string, port: string, extra: Record<string, string> = {}, args: string[] = []): Promise<LaunchedApp> {
  return launchApp({
    isolated: false,
    work,
    args,
    env: {
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_PORT: port,
      PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
      PARTBUDDY_START_PAGE: '1',
      PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
      PARTBUDDY_CLAUDE_COMMAND: fakeClaude,
      ...extra,
    },
  });
}

/** Texts cut off by their box (ellipsis or hidden overflow), as the eye sees them. */
async function clippedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (element.children.length > 0 || !element.textContent.trim()) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || element.closest('[aria-hidden="true"]')) continue;
      const wide = element.scrollWidth > element.clientWidth + 1 && style.overflowX !== 'visible';
      const tall = element.scrollHeight > element.clientHeight + 1 && style.overflowY !== 'visible' && style.overflowY !== 'auto' && style.overflowY !== 'scroll';
      if (wide || tall) found.push(element.textContent.trim().slice(0, 80));
    }
    return Array.from(new Set(found));
  });
}

/**
 * The whole window as Electron paints it. Playwright's screenshot cuts the picture to the CSS
 * viewport, which at an interface size other than 100 % is smaller than the window.
 */
async function capture(app: ElectronApplication, path: string): Promise<void> {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]?.webContents.capturePage())?.toPNG().toString('base64') ?? '');
  writeFileSync(path, Buffer.from(png, 'base64'));
}

function recorder(app: ElectronApplication, page: Page, report: Report, dir: string) {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') report.console.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => report.console.push(`pageerror: ${error.message.slice(0, 300)}`));

  const shot = async (name: string) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.waitForTimeout(450);
      await capture(app, join(dir, `${name}-${scheme}.png`));
      // Legacy mode: Electron cannot open the extra page axe uses for frames.
      const axe = await new AxeBuilder({ page })
        .setLegacyMode(true)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        // The 3D canvas has no text; the fade-ins are off (reduced motion), so contrast is measured at rest.
        .exclude('canvas')
        .analyze()
        .catch((error: unknown) => {
          report.axe.push(`${name} ${scheme}: axe did not run: ${(error as Error).message.slice(0, 200)}`);
          return null;
        });
      if (axe) report.timings.axeChecks = (report.timings.axeChecks ?? 0) + 1;
      for (const violation of axe?.violations ?? []) {
        for (const node of violation.nodes.slice(0, 4)) report.axe.push(`${name} ${scheme}: ${violation.id} ${node.target.join(' ')} ${node.html.slice(0, 160)} — ${node.failureSummary?.split('\n')[1]?.trim() ?? ''}`.slice(0, 400));
      }
    }
    const clipped = await clippedTexts(page);
    if (clipped.length) report.clipped[name] = clipped;
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  };
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
      await shot(name);
      report.steps[name] = 'ok';
    } catch (error) {
      report.steps[name] = (error as Error).message.split('\n')[0]?.slice(0, 300) ?? 'failed';
      await capture(app, join(dir, `${name}-failed.png`)).catch(() => undefined);
    }
    // Close only what the step opened: Escape also leaves the start page and ends the first start.
    const open = page.locator(':is([role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"], [data-testid="note-card"]):not([data-testid="first-start"], [data-testid="first-start"] *)');
    for (let tries = 0; tries < 3 && (await open.count()) > 0; tries += 1) {
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(200);
    }
    const size = page.viewportSize();
    if (size) await page.mouse.move(size.width - 4, size.height - 3).catch(() => undefined);
  };
  return { shot, step };
}

async function toGerman(page: Page): Promise<void> {
  await page.getByTestId('settings').click();
  const dialog = page.getByTestId('settings-dialog');
  await dialog.getByTestId('settings-language').getByText('Deutsch').click();
  await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
  await page.keyboard.press('Escape');
}

async function pick(page: Page, kind: 'face' | 'edge'): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const bar = page.getByTestId('selection-bar');
  for (let y = 0.35; y <= 0.65; y += 0.05) {
    for (let x = 0.3; x <= 0.7; x += kind === 'face' ? 0.05 : 0.006) {
      await page.keyboard.press('Escape');
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.waitForTimeout(kind === 'face' ? 250 : 50);
      if ((await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === kind) return;
    }
  }
  throw new Error(`no ${kind} found`);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId('composer').getByRole('textbox').first().fill(text);
  await page.getByTestId('composer-send').click();
}

async function turnEnded(page: Page): Promise<void> {
  await expect(page.getByTestId('composer-stop')).toBeHidden({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

async function hover(locator: Locator): Promise<void> {
  await locator.hover();
  await locator.page().waitForTimeout(900);
}

function finish(report: Report, dir: string, work: string): void {
  if (existsSync(join(work, 'partbuddy.log'))) copyFileSync(join(work, 'partbuddy.log'), join(dir, 'partbuddy.log'));
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
}

for (const run of RUNS) {
  test(`audit: every surface (${run.name})`, async () => {
    test.setTimeout(30 * 60_000);
    const dir = join(folder ?? '', run.name);
    mkdirSync(dir, { recursive: true });
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-audit-'));
    const report = newReport();
    let launched: LaunchedApp | null = null;
    try {
      launched = await launch(work, run.port, { PARTBUDDY_FIRST_START: '1' });
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows()[0]?.setSize(width, height), run);
      const { step } = recorder(app, page, report, dir);

      // Erststart, before the language switch (it starts in the system language).
      const setup = page.getByTestId('first-start');
      for (const index of [1, 2, 3, 4]) {
        await step(`first-start-${String(index)}`, async () => {
          await expect(setup).toBeVisible({ timeout: 30_000 });
        });
        await setup.getByTestId('first-start-next').click().catch(() => undefined);
      }
      await setup.getByTestId('first-start-skip').click().catch(() => undefined);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
      if (run.lang === 'de') await toGerman(page);

      // Startseite.
      const home = page.getByTestId('home-page');
      await step('home-empty', () => expect(home).toBeVisible());
      await step('home-sort', async () => {
        await home.getByTestId('home-sort').click();
        await expect(page.getByTestId('home-sort-option').first()).toBeVisible();
      });
      await step('tooltip-home-new', () => hover(home.getByTestId('home-new')));
      for (const id of ['housing', 'boxWithLid']) {
        if ((await home.count()) === 0) await page.getByTestId('home-button').click();
        const started = Date.now();
        await home.locator(`[data-template="${id}"]`).click();
        await expect(home).toHaveCount(0, { timeout: 90_000 });
        report.timings[`template-${id}-ms`] = Date.now() - started;
        await page.waitForTimeout(2000);
      }
      await step('home-projects', async () => {
        await page.getByTestId('home-button').click();
        await expect(home.getByTestId('home-tile')).not.toHaveCount(0);
      });
      await step('home-tile-hover', () => hover(home.getByTestId('home-tile').first()));
      await step('home-tile-menu', async () => {
        await home.getByTestId('home-tile').first().hover();
        await home.getByTestId('home-tile-menu').first().click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      await step('home-tags-dialog', async () => {
        await home.getByTestId('home-tile-menu').first().click();
        await page.getByTestId('home-tile-tags').first().click({ timeout: 3000 }).catch(async () => {
          await page.getByRole('menuitem').filter({ hasText: /Tag|Schlagw/ }).first().click();
        });
        await expect(page.getByTestId('project-tags-dialog')).toBeVisible();
        await page.getByTestId('project-tags-input').fill('Werkstatt, Halter');
      });
      await step('home-search', () => home.getByTestId('home-search').fill('Box'));
      await step('home-no-match', async () => {
        await home.getByTestId('home-search').fill('Rakete');
        await expect(home.getByTestId('home-no-match')).toBeVisible();
      });
      await home.getByTestId('home-search').fill('');
      await step('home-trash', async () => {
        // The trash shows once a project is in it: the second template project goes there.
        await home.getByTestId('home-tile').last().hover();
        await home.getByTestId('home-tile-menu').last().click();
        await page.getByTestId('home-tile-trash').click();
        await page.getByRole('alertdialog').getByRole('button').last().click();
        await home.getByTestId('home-trash-toggle').click();
        await page.waitForTimeout(300);
      });
      await step('home-scrolled', () => home.evaluate((element) => element.scrollTo(0, element.scrollHeight)));

      // Arbeitsbereich mit dem Gehäuse.
      await home.locator('[data-template="housing"]').click().catch(async () => home.getByTestId('home-tile').first().click());
      await expect(home).toHaveCount(0, { timeout: 90_000 });
      await expect(page.getByTestId('mesh-summary')).not.toBeEmpty({ timeout: 60_000 });
      await page.waitForTimeout(2000);
      await step('work', () => Promise.resolve());

      // Titelleiste und Menüs.
      await step('tooltip-home-button', () => hover(page.getByTestId('home-button')));
      await step('project-menu', async () => {
        await page.getByTestId('project-menu').click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      await step('project-rename-invalid', async () => {
        await page.getByTestId('project-menu').click();
        await page.getByTestId('project-rename').click();
        await page.getByTestId('project-name-input').fill('a/b');
        await page.waitForTimeout(300);
      });
      await step('project-trash-dialog', async () => {
        await page.getByTestId('project-menu').click();
        await page.getByTestId('project-trash').click();
        await expect(page.getByTestId('project-trash-dialog')).toBeVisible();
      });
      await step('versions-empty', async () => {
        await page.getByTestId('versions-button').click();
        await expect(page.getByTestId('versions-dialog')).toBeVisible();
      });
      await step('versions-one', async () => {
        await page.getByTestId('versions-button').click();
        await page.getByTestId('version-name').fill('Erster Druck mit einem sehr langen Namen, der nicht in die Zeile passt');
        await page.getByTestId('version-save').click();
        await expect(page.getByTestId('version')).not.toHaveCount(0);
      });
      await step('versions-restore-confirm', async () => {
        await page.getByTestId('versions-button').click();
        await page.getByTestId('version-restore').first().click();
        await page.waitForTimeout(300);
      });
      await step('export-menu', async () => {
        await page.getByTestId('export').click();
        await expect(page.getByTestId('export-share')).toBeVisible();
      });
      await step('save-state', () => hover(page.getByTestId('save-state')));

      // Einstellungen.
      const settings = page.getByTestId('settings-dialog');
      for (const section of ['general', 'solidcraft', 'assistant', 'print', 'shortcuts', 'about']) {
        await step(`settings-${section}`, async () => {
          if ((await settings.count()) === 0) await page.getByTestId('settings').click();
          await page.getByTestId(`settings-${section}`).click();
          await page.waitForTimeout(300);
        });
      }
      await step('settings-search', async () => {
        await page.getByTestId('settings').click();
        await page.getByTestId('settings-search').fill(run.lang === 'de' ? 'Farbe' : 'colour');
        await page.waitForTimeout(300);
      });
      await step('settings-search-empty', async () => {
        await page.getByTestId('settings').click();
        await page.getByTestId('settings-search').fill('xyzzy');
        await expect(page.getByTestId('settings-search-empty')).toBeVisible();
      });
      await step('settings-reset-confirm', async () => {
        await page.getByTestId('settings').click();
        await page.getByTestId('settings-general').click();
        await page.getByTestId('settings-reset-general').click();
        await expect(page.getByTestId('settings-reset-confirm')).toBeVisible();
      });

      // Druck: Material, Profile, Toleranz, Prüfung.
      await step('material-menu', async () => {
        await page.getByTestId('material-chip').click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      for (const tab of ['printer', 'material']) {
        await step(`print-profiles-${tab}`, async () => {
          if ((await page.getByTestId('print-tab-printer').count()) === 0) {
            await page.getByTestId('material-chip').click();
            await page.getByTestId('print-profiles-open').click();
          }
          await page.getByTestId(`print-tab-${tab}`).click({ timeout: 3000 });
          await page.waitForTimeout(300);
        });
      }
      await step('print-catalog', async () => {
        await page.getByTestId('material-chip').click();
        await page.getByTestId('print-profiles-open').click();
        await page.getByTestId('print-tab-printer').click();
        await page.getByTestId('printers-add').click();
        await page.waitForTimeout(400);
      });
      await step('tolerance-assistant', async () => {
        await page.getByTestId('material-chip').click();
        await page.getByTestId('print-profiles-open').click();
        await page.getByTestId('print-tab-material').click();
        await page.getByTestId('tolerance-start').click({ timeout: 5000 });
        await expect(page.getByTestId('tolerance-assistant')).toBeVisible();
      });
      await step('print-check', async () => {
        await page.getByTestId('print-check').click();
        await expect(page.getByTestId('print-check-panel')).toBeVisible();
      });

      // Assistent: Modell-Chip, leerer Chat, Arbeit, Rückfragen, Plan, Fehler, Skizze.
      await step('agent-menu', async () => {
        await page.getByTestId('agent-status').click();
        await expect(page.getByTestId('agent-menu')).toBeVisible();
      });
      await step('chat-empty', () => expect(page.getByTestId('composer')).toBeVisible());
      await step('tooltip-composer-sketch', () => hover(page.getByTestId('composer-sketch-open')));
      await step('chat-streaming', async () => {
        await send(page, 'Take your time');
        await page.waitForTimeout(2000);
      });
      await turnEnded(page).catch(() => undefined);
      await step('chat-answer', () => Promise.resolve());
      await step('question-card', async () => {
        await send(page, 'phone holder');
        await expect(page.getByTestId('question-card').last()).toBeVisible({ timeout: 30_000 });
        await page.getByTestId('question-card').last().scrollIntoViewIfNeeded();
      });
      await step('question-answered', async () => {
        const card = page.getByTestId('question-card').last();
        await card.getByRole('radio').first().click().catch(() => undefined);
        await card.getByRole('button').last().click();
        await turnEnded(page);
      });
      await step('plan-card', async () => {
        await send(page, 'plan a box');
        await expect(page.getByTestId('plan-steps').last()).toBeVisible({ timeout: 30_000 });
        await page.getByTestId('question-card').last().scrollIntoViewIfNeeded();
      });
      await step('plan-built', async () => {
        await page.getByTestId('question-card').last().getByRole('button').first().click();
        await turnEnded(page);
      });
      await step('chat-long-answer', async () => {
        await send(page, 'Long answer');
        await turnEnded(page);
      });
      await step('chat-failed', async () => {
        await send(page, 'Make it fail');
        await expect(page.getByTestId('turn-failed').last()).toBeVisible({ timeout: 30_000 });
      });
      await step('chat-work-log', async () => {
        const fold = page.locator('[data-testid="chat-list"] summary, [data-testid="chat-list"] [aria-expanded="false"]').first();
        await fold.click({ timeout: 3000 });
        await page.waitForTimeout(300);
      });
      await step('chat-message-actions', () => hover(page.getByTestId('assistant-text').last()));
      await step('chat-scrolled-up', async () => {
        await page.getByTestId('chat-list').evaluate((element) => element.scrollTo(0, 0));
        await page.waitForTimeout(400);
      });
      await page.getByTestId('chat-to-latest').click().catch(() => undefined);
      await step('sketch-pad', async () => {
        await page.getByTestId('composer-sketch-open').click();
        await expect(page.getByTestId('sketch-pad')).toBeVisible();
      });
      await step('sketch-drawn', async () => {
        await page.getByTestId('composer-sketch-open').click();
        const pad = page.getByTestId('sketch-pad');
        const box = await pad.getByTestId('sketch-canvas').boundingBox();
        if (!box) throw new Error('no canvas');
        await pad.getByTestId('sketch-tool-rect').click();
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
        await page.mouse.up();
        await pad.getByTestId('sketch-tool-dimension').click();
        await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.65);
        await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.65);
        await page.waitForTimeout(300);
      });
      await step('sketch-kept-menu', async () => {
        await page.getByTestId('composer-sketch-open').click();
        await page.getByTestId('sketch-kept').click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(300);
      });
      await step('sketch-photo', async () => {
        await page.getByTestId('composer-sketch-open').click();
        const pad = page.getByTestId('sketch-pad');
        await pad.getByTestId('sketch-photo-file').setInputFiles(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png'));
        await page.waitForTimeout(800);
      });
      await step('composer-photo', async () => {
        await page.getByTestId('composer-photo-input').setInputFiles(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png'));
        await expect(page.getByTestId('composer-photo')).toBeVisible();
      });
      await step('photo-large', async () => {
        await page.getByTestId('composer-photo').locator('button, img').first().click();
        await page.waitForTimeout(400);
      });
      await page.getByTestId('composer-photo-remove').click().catch(() => undefined);

      // 3D-Ansicht.
      await page.getByTestId('viewport').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
      await page.keyboard.press('0').catch(() => undefined);
      await page.waitForTimeout(800);
      await step('view-tools-tooltip', () => hover(page.getByTestId('section')));
      await step('display-menu', async () => {
        await page.getByTestId('display-mode').click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      await step('view-ortho', async () => {
        await page.getByTestId('projection').click();
        await page.waitForTimeout(800);
      });
      await page.getByTestId('projection').click().catch(() => undefined);
      await step('section-panel', async () => {
        await page.getByTestId('section').click();
        await expect(page.getByTestId('section-panel')).toBeVisible();
      });
      await page.getByTestId('section').click().catch(() => undefined);
      await step('explode-panel', async () => {
        await page.getByTestId('explode').click();
        await expect(page.getByTestId('explode-panel')).toBeVisible();
        await page.getByTestId('explode-amount').fill('0.8').catch(() => undefined);
        await page.waitForTimeout(600);
      });
      await page.getByTestId('explode').click().catch(() => undefined);
      await step('assembly-panel', async () => {
        await page.getByTestId('assembly').click();
        await expect(page.getByTestId('assembly-panel')).toBeVisible();
      });
      await page.getByTestId('assembly').click().catch(() => undefined);
      await step('plate', async () => {
        await page.getByTestId('view-plate').click();
        await expect(page.getByTestId('plate-bar')).toBeVisible();
      });
      await page.getByTestId('view-assembled').click().catch(() => undefined);
      await step('dimensions', async () => {
        await page.getByTestId('dimensions').click();
        await page.waitForTimeout(1200);
      });
      await step('dimensions-all', async () => {
        await page.getByTestId('dimensions-all').click();
        await page.waitForTimeout(1200);
      });
      await step('dimension-edit', async () => {
        await page.getByTestId('mark-label').first().click({ force: true });
        await expect(page.getByTestId('mark-input').first()).toBeVisible();
      });
      await page.getByTestId('dimensions').click().catch(() => undefined);
      await step('dock-hint', async () => {
        await pick(page, 'face');
        await expect(page.getByTestId('dock-hint')).toBeVisible({ timeout: 3000 });
      });
      await page.getByTestId('dock-hint-ok').click().catch(() => undefined);
      await step('face-selected', () => pick(page, 'face'));
      await step('hud-actions', async () => {
        await pick(page, 'face');
        await page.getByTestId('hud-actions').click();
        await page.waitForTimeout(300);
      });
      await step('action-extrude', async () => {
        await pick(page, 'face');
        await page.getByTestId('hud-actions').click().catch(() => undefined);
        await page.getByTestId('action-extrude').click();
        await expect(page.getByTestId('action-field')).toBeVisible();
      });
      await step('block-panel', async () => {
        await pick(page, 'face');
        await page.getByTestId('hud-actions').click().catch(() => undefined);
        await page.getByTestId('action-block').click();
        await expect(page.getByTestId('block-panel')).toBeVisible();
      });
      await step('block-screw-hole', async () => {
        await page.getByTestId('block-tile-screwHole').click();
        await page.waitForTimeout(1500);
      });
      await step('block-text-font', async () => {
        await page.getByTestId('block-tile-text').click({ timeout: 3000 });
        await page.getByTestId('block-font').locator('button').first().click();
        await page.waitForTimeout(400);
      });
      await step('part-panel', async () => {
        // The standard part offers itself on a hole: click across the view until one is picked.
        const box = await page.getByTestId('viewport').boundingBox();
        if (!box) throw new Error('viewport not visible');
        const found = async () => (await page.getByTestId('action-part').count()) > 0;
        for (let y = 0.25; y <= 0.75 && !(await found()); y += 0.025) {
          for (let x = 0.2; x <= 0.8 && !(await found()); x += 0.01) {
            await page.keyboard.press('Escape');
            await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
            await page.waitForTimeout(60);
          }
        }
        await page.getByTestId('action-part').click();
        await expect(page.getByTestId('part-panel')).toBeVisible();
      });
      await step('note-composer', async () => {
        await pick(page, 'face');
        await page.getByTestId('hud-ask').fill('Hier 3 mm Wand lassen – der Schraubenkopf sitzt darauf.');
      });
      await step('note-pin', async () => {
        await page.getByTestId('hud-note').click();
        await expect(page.getByTestId('note-pin')).not.toHaveCount(0, { timeout: 15_000 });
      });
      await step('note-card', async () => {
        await page.getByTestId('note-pin').first().click();
        await expect(page.getByTestId('note-card')).toBeVisible();
      });
      await step('edge-selected', () => pick(page, 'edge'));
      await step('dimension-preview', async () => {
        await page.getByTestId('dimension-field').getByRole('textbox').fill('45');
        await page.waitForTimeout(2500);
      });
      await step('viewcube-hover', async () => {
        const cube = page.locator('[data-testid="viewer"] [aria-label*="Cube"], [data-testid="viewer"] [role="group"]').first();
        await hover(cube);
      });

      // Struktur, Parameter, Notizen, Zeitleiste.
      await step('tree-context-menu', async () => {
        await page.getByTestId('structure-body').first().click({ button: 'right' });
        await expect(page.getByTestId('tree-menu')).toBeVisible();
      });
      await step('tree-rename', async () => {
        await page.getByTestId('structure-body').first().click();
        await page.keyboard.press('F2');
        await expect(page.getByTestId('tree-rename')).toBeVisible();
      });
      await step('parameter-edit', async () => {
        await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
        await page.waitForTimeout(300);
      });
      await step('parameter-invalid', async () => {
        await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
        await page.getByTestId('parameters').getByRole('textbox').first().fill('-5');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      });
      await step('notes-section', async () => {
        await page.getByTestId('notes').click();
        await page.waitForTimeout(300);
      });
      await step('part-details', async () => {
        await page.getByTestId('part-expand').first().click({ timeout: 3000 });
        await page.waitForTimeout(300);
      });
      await step('timeline-tooltip', () => hover(page.getByTestId('timeline-feature').first()));
      await step('timeline-menu', async () => {
        await page.getByTestId('timeline-feature').nth(1).click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      await step('timeline-rolled-back', async () => {
        await page.getByTestId('timeline-feature').nth(1).click();
        await page.getByRole('menuitem').first().click();
        await page.waitForTimeout(1500);
      });
      await page.getByTestId('timeline-end').click().catch(() => undefined);

      // Ablegen einer Datei.
      await step('file-drop', async () => {
        await page.evaluate(() => {
          const transfer = new DataTransfer();
          transfer.items.add(new File(['solid'], 'teil.stl'));
          window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }));
          document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }));
        });
        await expect(page.getByTestId('file-drop')).toBeVisible({ timeout: 3000 });
      });
      await page.evaluate(() => document.body.dispatchEvent(new DragEvent('dragleave', { bubbles: true }))).catch(() => undefined);

      // Windows-Kontrastdesign (forced colors).
      await step('forced-colors-work', async () => {
        await page.emulateMedia({ forcedColors: 'active' });
        await page.waitForTimeout(400);
        await capture(app, join(dir, 'forced-colors-work.png'));
        await page.getByTestId('settings').click();
        await page.waitForTimeout(400);
        await capture(app, join(dir, 'forced-colors-settings.png'));
        await page.keyboard.press('Escape');
        await page.emulateMedia({ forcedColors: 'none' });
      });

      // Interface-Größen aus den Einstellungen.
      for (const zoom of [0.9, 1.25]) {
        await step(`zoom-${String(zoom)}`, async () => {
          await page.evaluate((value) => (globalThis as unknown as { partbuddy: { settings: { setApp(v: unknown): Promise<unknown> } } }).partbuddy.settings.setApp({ key: 'zoom', value }), zoom);
          await page.waitForTimeout(800);
        });
      }
      await page.evaluate(() => (globalThis as unknown as { partbuddy: { settings: { setApp(v: unknown): Promise<unknown> } } }).partbuddy.settings.setApp({ key: 'zoom', value: 1 })).catch(() => undefined);
    } finally {
      await launched?.close().catch(() => undefined);
      finish(report, dir, work);
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}

// Windows-Skalierung 125 % und 150 %: the same window at the device scale factor of the display.
for (const scale of [1.25, 1.5]) {
  test(`audit: Windows scaling ${String(scale * 100)} %`, async () => {
    test.setTimeout(6 * 60_000);
    const dir = join(folder ?? '', `scale-${String(scale * 100)}`);
    mkdirSync(dir, { recursive: true });
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-audit-'));
    const report = newReport();
    let launched: LaunchedApp | null = null;
    try {
      launched = await launch(work, scale === 1.25 ? '7944' : '7945', {}, [`--force-device-scale-factor=${String(scale)}`]);
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
      const { step } = recorder(app, page, report, dir);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
      await toGerman(page);
      await step('home', () => expect(page.getByTestId('home-page')).toBeVisible());
      await page.getByTestId('home-page').locator('[data-template="housing"]').click();
      await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 90_000 });
      await page.waitForTimeout(2500);
      await step('work', () => Promise.resolve());
      await step('settings', () => page.getByTestId('settings').click());
      await step('project-menu', () => page.getByTestId('project-menu').click());
    } finally {
      await launched?.close().catch(() => undefined);
      finish(report, dir, work);
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}

// States without SolidCraft or a working assistant (offline, error, signed out).
test('audit: offline and error states', async () => {
  test.setTimeout(5 * 60_000);
  const dir = join(folder ?? '', 'offline');
  mkdirSync(dir, { recursive: true });
  const report = newReport();
  const launched = await launchApp({ env: { PARTBUDDY_START_PAGE: '1' } });
  try {
    const { app, page } = launched;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
    const { step } = recorder(app, page, report, dir);
    await step('home-no-solidcraft', () => expect(page.getByTestId('connection-status')).toHaveText('SolidCraft not running', { timeout: 30_000 }));
    await step('connection-tooltip', () => hover(page.getByTestId('connection-status')));
    await step('settings-solidcraft-missing', async () => {
      await page.getByTestId('settings').click();
      await page.getByTestId('settings-solidcraft').click();
    });
    await step('agent-menu-chatgpt', async () => {
      await page.getByTestId('home-new').click({ timeout: 2000 }).catch(() => undefined);
      await page.getByTestId('agent-status').click();
      await page.getByTestId('agent-menu').getByText('ChatGPT', { exact: true }).click();
      await page.keyboard.press('Escape');
    });
    await step('composer-offline', () => expect(page.getByTestId('composer-offline').or(page.getByTestId('assistant-notice')).first()).toBeVisible({ timeout: 10_000 }));
  } finally {
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
