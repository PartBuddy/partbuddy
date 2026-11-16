import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Usability walkthroughs (docs/usability-2026-11.md): tasks 1–7 of a maker without CAD experience, step by step in the
// real app with a headless SolidCraft and the fake Claude. Per step a picture, the time it took, axe (WCAG 2.2 AA),
// clipped texts, the notices and alerts on screen and, for the keyboard run, where the focus went.
// Opt in with PARTBUDDY_USABILITY set to the folder the pictures go to, and PARTBUDDY_E2E_SOLIDCRAFT=1.
const folder = process.env.PARTBUDDY_USABILITY;
test.skip(!folder || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'usability walkthroughs; set PARTBUDDY_USABILITY and PARTBUDDY_E2E_SOLIDCRAFT=1');
// A step that cannot find its control is a finding, not a hang.
test.use({ actionTimeout: 10_000 });

const fakeClaude = JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]);
const photo = join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png');
const stl = join(__dirname, '..', '..', '..', 'packages', 'geometry', 'fixtures', 'cable-clip.3mf');

interface Step {
  name: string;
  result: string;
  ms: number;
  shown: string[];
  axe: string[];
  clipped: string[];
  focus?: string[];
}

async function capture(app: ElectronApplication, path: string): Promise<void> {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]?.webContents.capturePage())?.toPNG().toString('base64') ?? '');
  writeFileSync(path, Buffer.from(png, 'base64'));
}

/** Notices, alerts, status lines and dialog headings on screen: what the user is told right now. */
async function shown(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"], [role="alertdialog"] h2, [role="dialog"] h2, [data-testid="notice"], [data-testid="assistant-notice"], [data-testid="turn-failed"], [data-testid="composer-offline"], [data-testid="home-connection"], [data-testid="view-hint"]'))
      .filter((element) => element.offsetParent !== null && element.innerText.trim())
      .map((element) => element.innerText.trim().replace(/\s+/g, ' ').slice(0, 240)),
  );
}

async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (element.children.length > 0 || !element.textContent.trim()) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || element.closest('[aria-hidden="true"]')) continue;
      if (element.scrollWidth > element.clientWidth + 1 && style.overflowX !== 'visible') found.push(element.textContent.trim().slice(0, 80));
    }
    return Array.from(new Set(found));
  });
}

/** The focused element as a screen reader names it, with whether a focus ring is visible. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return '(body)';
    const style = getComputedStyle(element);
    const ring = style.outlineStyle !== 'none' && style.outlineWidth !== '0px' ? 'ring' : style.boxShadow !== 'none' ? 'shadow' : 'NO RING';
    const name = element.getAttribute('aria-label') ?? element.innerText.trim().split('\n')[0] ?? '';
    return `${element.tagName.toLowerCase()}${element.getAttribute('role') ? `[${element.getAttribute('role') ?? ''}]` : ''} "${name.slice(0, 50)}" ${element.dataset.testid ?? ''} ${ring}`;
  });
}

function walker(app: ElectronApplication, page: Page, dir: string, steps: Step[]) {
  let index = 0;
  return async (name: string, run: () => Promise<void>, options: { tabs?: number } = {}) => {
    index += 1;
    const file = `${String(index).padStart(2, '0')}-${name}`;
    const started = Date.now();
    const step: Step = { name: file, result: 'ok', ms: 0, shown: [], axe: [], clipped: [] };
    try {
      await run();
    } catch (error) {
      step.result = (error as Error).message.split('\n')[0]?.slice(0, 300) ?? 'failed';
    }
    step.ms = Date.now() - started;
    await page.waitForTimeout(400);
    if (options.tabs) {
      step.focus = [];
      for (let tab = 0; tab < options.tabs; tab += 1) {
        await page.keyboard.press('Tab');
        step.focus.push(await focused(page));
      }
    }
    await capture(app, join(dir, `${file}.png`)).catch(() => undefined);
    step.shown = await shown(page).catch(() => []);
    step.clipped = await clipped(page).catch(() => []);
    // Measured at rest, as the audit did: fade-ins off, else axe reads a half-faded text as low contrast (usability U-26).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page }).setLegacyMode(true).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('canvas').analyze().catch(() => null);
    for (const violation of axe?.violations ?? []) {
      for (const node of violation.nodes.slice(0, 3)) step.axe.push(`${violation.id} ${node.target.join(' ')} ${node.html.slice(0, 120)}`);
    }
    steps.push(step);
  };
}

async function launch(work: string, port: string, extra: Record<string, string> = {}): Promise<LaunchedApp> {
  return launchApp({
    isolated: false,
    work,
    env: {
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_PORT: port,
      PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
      PARTBUDDY_START_PAGE: '1',
      PARTBUDDY_FIRST_START: '1',
      PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
      PARTBUDDY_CLAUDE_COMMAND: fakeClaude,
      ...extra,
    },
  });
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByTestId('composer').getByRole('textbox').first().fill(text);
  await page.getByTestId('composer-send').click();
}

async function turnEnded(page: Page): Promise<void> {
  await expect(page.getByTestId('composer-stop')).toBeHidden({ timeout: 90_000 });
  await page.waitForTimeout(800);
}

async function closeOverlays(page: Page): Promise<void> {
  const open = page.locator('[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]');
  for (let tries = 0; tries < 3 && (await open.count()) > 0; tries += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

/** The SolidCraft this test started, ended hard: the headless one names the test's work folder (`--allow-path`). */
function killSolidCraft(work: string): void {
  const command = `Get-CimInstance Win32_Process -Filter "Name like 'solid%'" | Where-Object { $_.CommandLine.Contains('${work.replace(/'/g, "''")}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }`;
  const killed = execFileSync('pwsh', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
  if (!killed.trim()) throw new Error(`no SolidCraft for ${work} found`);
}

const RUNS = [
  { name: 'de-wide', lang: 'de', width: 1440, height: 900, port: '7951' },
  { name: 'en-wide', lang: 'en', width: 1440, height: 900, port: '7952' },
  { name: 'de-narrow', lang: 'de', width: 960, height: 600, port: '7953' },
] as const;

for (const run of RUNS) {
  test(`walkthrough: tasks 1–6 (${run.name})`, async () => {
    test.setTimeout(30 * 60_000);
    const dir = join(folder ?? '', run.name);
    mkdirSync(dir, { recursive: true });
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-usability-'));
    const steps: Step[] = [];
    let launched: LaunchedApp | null = null;
    try {
      launched = await launch(work, run.port, run.lang === 'de' ? { LANG: 'de_AT' } : {});
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows()[0]?.setSize(width, height), run);
      const step = walker(app, page, dir, steps);
      const de = run.lang === 'de';

      // 1 · Erster Start. The setup starts in the system language (English here): the language is set on its first page if it offers that.
      const setup = page.getByTestId('first-start');
      await step('t1-first-start-solidcraft', () => expect(setup).toBeVisible({ timeout: 30_000 }));
      await step('t1-first-start-assistant', () => setup.getByTestId('first-start-next').click());
      await step('t1-first-start-print', () => setup.getByTestId('first-start-next').click());
      await step('t1-first-start-projects', () => setup.getByTestId('first-start-next').click());
      await step('t1-first-start-done', async () => {
        await setup.getByTestId('first-start-next').click();
        await expect(setup).toHaveCount(0);
      });
      await step('t1-waiting-for-solidcraft', () => Promise.resolve());
      await step('t1-solidcraft-ready', () => expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 120_000 }));
      if (de) {
        await step('t1-language-german', async () => {
          await page.getByTestId('settings').click();
          await page.getByTestId('settings-dialog').getByTestId('settings-language').getByText('Deutsch').click();
          await page.keyboard.press('Escape');
        });
      }
      await step('t1-home', () => expect(page.getByTestId('home-page')).toBeVisible());
      await step('t1-agent-menu', async () => {
        await page.getByTestId('agent-status').click();
        await expect(page.getByTestId('agent-menu')).toBeVisible();
      });
      await closeOverlays(page);

      // 2 · Erstes Teil per Chat: Wandhaken, Maß ändern, Druckprüfung.
      await step('t2-new-project', async () => {
        await page.getByTestId('home-new').click();
        await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 60_000 });
      });
      await step('t2-chat-empty', () => expect(page.getByTestId('composer')).toBeVisible());
      await step('t2-ask-wall-hook', async () => {
        await send(page, de ? 'Bau mir einen Wandhaken (wall holder) für eine Jacke' : 'Build me a wall holder for a jacket');
        await page.waitForTimeout(1500);
      });
      await step('t2-wall-hook-built', () => turnEnded(page));
      await step('t2-parameters', async () => {
        await page.getByTestId('parameters').scrollIntoViewIfNeeded();
      });
      await step('t2-parameter-edit', async () => {
        await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
        await page.waitForTimeout(300);
      });
      await step('t2-parameter-changed', async () => {
        await page.getByTestId('parameters').getByRole('textbox').first().fill('120');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
      });
      await step('t2-ask-change-by-chat', async () => {
        await send(page, de ? 'Mach die Platte 8 mm dick' : 'Make the plate 8 mm thick');
        await turnEnded(page);
      });
      await step('t2-dimensions', async () => {
        await page.getByTestId('dimensions').click();
        await page.waitForTimeout(1500);
      });
      await page.getByTestId('dimensions').click().catch(() => undefined);
      await step('t2-print-check', async () => {
        await page.getByTestId('print-check').click();
        await expect(page.getByTestId('print-check-panel')).toBeVisible();
        await page.waitForTimeout(1500);
      });
      await closeOverlays(page);
      await step('t2-export-menu', async () => {
        await page.getByTestId('export').click();
        await page.waitForTimeout(400);
      });
      await closeOverlays(page);

      // 3 · Vorlage öffnen und anpassen; Scharnier bewegen.
      await step('t3-home-templates', async () => {
        await page.getByTestId('home-button').click();
        await expect(page.getByTestId('home-page')).toBeVisible();
      });
      await step('t3-template-building', async () => {
        await page.getByTestId('home-page').locator('[data-template="hingedBox"]').click();
        await page.waitForTimeout(1500);
      });
      await step('t3-template-open', async () => {
        await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 120_000 });
        await expect(page.getByTestId('mesh-summary')).not.toBeEmpty({ timeout: 60_000 });
        await page.waitForTimeout(2000);
      });
      await step('t3-template-parameter', async () => {
        await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
        await page.waitForTimeout(300);
      });
      await closeOverlays(page);
      await step('t3-joints-panel', async () => {
        await page.getByTestId('joints').click();
        await expect(page.getByTestId('joint-panel')).toBeVisible();
      });
      await step('t3-joint-moved', async () => {
        const slider = page.getByTestId('joint-panel').getByRole('slider').first();
        await slider.focus();
        for (let i = 0; i < 10; i += 1) await page.keyboard.press('PageUp');
        await page.waitForTimeout(2500);
      });
      await step('t3-joint-play', async () => {
        await page.getByTestId('joint-play-all').or(page.getByTestId('joint-play')).first().click();
        await page.waitForTimeout(2500);
      });
      await page.getByTestId('joints').click().catch(() => undefined);
      await step('t3-ask-hinge', async () => {
        await send(page, de ? 'Bau ein Scharnier (a hinge) aus zwei Platten' : 'Build a hinge from two plates');
        await turnEnded(page);
      });

      // 4 · Foto bzw. Skizze als Vorlage.
      await step('t4-photo-attached', async () => {
        await page.getByTestId('composer-photo-input').setInputFiles(photo);
        await expect(page.getByTestId('composer-photo')).toBeVisible();
      });
      await step('t4-photo-sent', async () => {
        await send(page, de ? 'Bau das nach' : 'Build this');
        await turnEnded(page);
      });
      await step('t4-sketch-pad', async () => {
        await page.getByTestId('composer-sketch-open').click();
        await expect(page.getByTestId('sketch-pad')).toBeVisible();
      });
      await step('t4-sketch-drawn', async () => {
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
        await page.waitForTimeout(400);
      });
      await step('t4-sketch-photo', async () => {
        await page.getByTestId('sketch-pad').getByTestId('sketch-photo-file').setInputFiles(photo);
        await page.waitForTimeout(800);
      });
      await step('t4-sketch-attached', async () => {
        await page.getByTestId('sketch-attach').click();
        await page.waitForTimeout(400);
      });
      await step('t4-sketch-sent', async () => {
        await send(page, de ? 'So ungefähr, 40 mm breit' : 'Roughly like this, 40 mm wide');
        await turnEnded(page);
      });

      // 5 · Projekte verwalten.
      await step('t5-project-menu', async () => {
        await page.getByTestId('project-menu').click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      await step('t5-rename', async () => {
        await page.getByTestId('project-rename').click();
        await page.getByTestId('project-name-input').fill(de ? 'Scharnierbox Werkstatt' : 'Workshop hinge box');
      });
      await step('t5-renamed', async () => {
        await page.getByTestId('project-rename-save').click();
        await page.waitForTimeout(500);
      });
      await step('t5-versions', async () => {
        await page.getByTestId('versions-button').click();
        await expect(page.getByTestId('versions-dialog')).toBeVisible();
      });
      await step('t5-version-saved', async () => {
        await page.getByTestId('version-name').fill(de ? 'Erster Druck' : 'First print');
        await page.getByTestId('version-save').click();
        await expect(page.getByTestId('version')).not.toHaveCount(0);
      });
      await closeOverlays(page);
      await step('t5-switch-home', async () => {
        await page.getByTestId('home-button').click();
        await expect(page.getByTestId('home-tile')).not.toHaveCount(0);
      });
      await step('t5-switch-open-other', async () => {
        const started = Date.now();
        await page.getByTestId('home-tile').last().click();
        await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 60_000 });
        await expect(page.getByTestId('mesh-summary')).not.toBeEmpty({ timeout: 60_000 });
        steps.push({ name: 'switch-ms', result: String(Date.now() - started), ms: 0, shown: [], axe: [], clipped: [] });
      });
      await step('t5-import', async () => {
        await app.evaluate(({ dialog }, file) => {
          dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
        }, stl);
        await page.getByTestId('home-button').click();
        await page.getByTestId('home-import').click();
        await page.waitForTimeout(6000);
      });
      await step('t5-export-stl', async () => {
        const target = join(work, 'export.stl');
        await app.evaluate(({ dialog }, filePath) => {
          dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
        }, target);
        await page.getByTestId('export').click();
        await page.waitForTimeout(500);
        await page.getByRole('menuitem').first().click();
        await page.waitForTimeout(4000);
        if (!existsSync(target)) throw new Error('no export file written');
      });
      await closeOverlays(page);
      await step('t5-trash', async () => {
        await page.getByTestId('project-menu').click();
        await page.getByTestId('project-trash').click();
        await expect(page.getByTestId('project-trash-dialog')).toBeVisible();
      });
      await step('t5-trashed', async () => {
        await page.getByTestId('project-trash-confirm').click();
        await page.waitForTimeout(1500);
      });
      await step('t5-trash-list', async () => {
        if ((await page.getByTestId('home-page').count()) === 0) await page.getByTestId('home-button').click();
        await page.getByTestId('home-trash-toggle').click();
        await page.waitForTimeout(400);
      });
      await step('t5-restored', async () => {
        await page.getByTestId('home-trash-restore').first().click();
        await page.waitForTimeout(800);
      });

      // 6 · Drucker und Material, Einstellungen, Update-Hinweis.
      await page.getByTestId('home-tile').first().click().catch(() => undefined);
      await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 60_000 }).catch(() => undefined);
      await step('t6-material-menu', async () => {
        await page.getByTestId('material-chip').click();
        await expect(page.getByRole('menu')).toBeVisible();
      });
      await step('t6-print-profiles-printer', async () => {
        await page.getByTestId('print-profiles-open').click();
        await page.getByTestId('print-tab-printer').click();
      });
      await step('t6-printer-catalog', async () => {
        await page.getByTestId('printers-add').click();
        await page.waitForTimeout(400);
      });
      await closeOverlays(page);
      await step('t6-print-profiles-material', async () => {
        await page.getByTestId('material-chip').click();
        await page.getByTestId('print-profiles-open').click();
        await page.getByTestId('print-tab-material').click();
      });
      await step('t6-tolerance', async () => {
        await page.getByTestId('tolerance-start').click({ timeout: 5000 });
        await expect(page.getByTestId('tolerance-assistant')).toBeVisible();
      });
      await closeOverlays(page);
      for (const section of ['general', 'solidcraft', 'assistant', 'print', 'about']) {
        await step(`t6-settings-${section}`, async () => {
          if ((await page.getByTestId('settings-dialog').count()) === 0) await page.getByTestId('settings').click();
          await page.getByTestId(`settings-${section}`).click();
        });
      }
      await closeOverlays(page);
      await step('t6-update-notice', async () => {
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updates:state-changed', { state: 'available', version: '0.4.0' }));
        await expect(page.getByTestId('notice')).toBeVisible({ timeout: 5000 });
      });

      // 7 (with SolidCraft running): invalid input and a crashed SolidCraft.
      await step('t7-parameter-invalid', async () => {
        await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
        await page.getByTestId('parameters').getByRole('textbox').first().fill('-5');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      });
      await step('t7-rename-invalid', async () => {
        await page.getByTestId('project-menu').click();
        await page.getByTestId('project-rename').click();
        await page.getByTestId('project-name-input').fill('a/b:*?');
        await page.waitForTimeout(300);
      });
      await closeOverlays(page);
      await step('t7-chat-limit', async () => {
        await send(page, 'Hit my limit');
        await turnEnded(page);
      });
      await step('t7-chat-offline', async () => {
        await send(page, 'Go offline');
        await turnEnded(page);
      });
      await step('t7-chat-expired', async () => {
        await send(page, 'Expire my sign-in');
        await turnEnded(page);
      });
      await step('t7-chat-failed', async () => {
        await send(page, 'Make it fail');
        await turnEnded(page);
      });
      await step('t7-solidcraft-crashed', async () => {
        killSolidCraft(work);
        await page.waitForTimeout(4000);
      });
      await step('t7-solidcraft-after-crash', async () => {
        await page.waitForTimeout(15_000);
      });
      await step('t7-chat-after-crash', async () => {
        await send(page, 'Make it a box');
        await turnEnded(page);
      });
    } finally {
      await launched?.close().catch(() => undefined);
      writeFileSync(join(dir, 'steps.json'), JSON.stringify(steps, null, 2));
      // The app's log beside the pictures: a step that went wrong is read there first.
      if (existsSync(join(work, 'partbuddy.log'))) copyFileSync(join(work, 'partbuddy.log'), join(dir, 'partbuddy.log'));
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}

// Keyboard only: first start, a template, the chat, the settings, without the mouse. The focus path is recorded.
test('walkthrough: keyboard only (de-wide)', async () => {
  test.setTimeout(15 * 60_000);
  const dir = join(folder ?? '', 'keyboard');
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-usability-'));
  const steps: Step[] = [];
  let launched: LaunchedApp | null = null;
  try {
    launched = await launch(work, '7954');
    const { app, page } = launched;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    const step = walker(app, page, dir, steps);
    const setup = page.getByTestId('first-start');
    await expect(setup).toBeVisible({ timeout: 30_000 });
    await step('k1-first-start-tabs', () => Promise.resolve(), { tabs: 8 });
    await step('k1-first-start-enter-through', async () => {
      for (let i = 0; i < 4 && (await setup.count()) > 0; i += 1) {
        await setup.getByTestId('first-start-next').focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
      }
      await expect(setup).toHaveCount(0);
    });
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 120_000 });
    await step('k2-home-tabs', () => Promise.resolve(), { tabs: 16 });
    await step('k2-open-template-by-keyboard', async () => {
      const template = page.getByTestId('home-page').locator('[data-template="wallHolder"]');
      await template.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 120_000 });
      await page.waitForTimeout(2000);
    });
    await step('k3-work-tabs', () => Promise.resolve(), { tabs: 30 });
    await step('k3-chat-by-keyboard', async () => {
      await page.getByTestId('composer').getByRole('textbox').first().focus();
      await page.keyboard.type('Make it a box');
      await page.keyboard.press('Enter');
      await turnEnded(page);
    });
    await step('k4-settings-shortcut', async () => {
      await page.keyboard.press('Control+Comma');
      await expect(page.getByTestId('settings-dialog')).toBeVisible();
    }, { tabs: 10 });
    await step('k4-settings-escape', async () => {
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
    });
    await step('k5-shortcut-help', async () => {
      await page.keyboard.press('Shift+?');
      await page.waitForTimeout(500);
    });
  } finally {
    await launched?.close().catch(() => undefined);
    writeFileSync(join(dir, 'steps.json'), JSON.stringify(steps, null, 2));
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

// 7 · Without SolidCraft and signed out: what a newcomer sees when the setup is not complete.
test('walkthrough: no SolidCraft, signed out (de-narrow)', async () => {
  test.setTimeout(10 * 60_000);
  const dir = join(folder ?? '', 'missing');
  mkdirSync(dir, { recursive: true });
  const steps: Step[] = [];
  const launched = await launchApp({ env: { PARTBUDDY_START_PAGE: '1', PARTBUDDY_FIRST_START: '1', FAKE_CLAUDE_SIGNED_OUT: '1' } });
  try {
    const { app, page } = launched;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
    const step = walker(app, page, dir, steps);
    const setup = page.getByTestId('first-start');
    await step('m1-first-start-solidcraft-missing', () => expect(setup).toBeVisible({ timeout: 30_000 }));
    await step('m1-first-start-assistant-signed-out', () => setup.getByTestId('first-start-next').click());
    await step('m1-first-start-chatgpt', async () => {
      await setup.getByRole('radio', { name: /ChatGPT/ }).click();
      await page.waitForTimeout(500);
    });
    await setup.getByRole('radio', { name: /^Claude Code/ }).click().catch(() => undefined);
    await setup.getByTestId('first-start-skip').click().catch(() => undefined);
    await step('m2-home-without-solidcraft', () => expect(page.getByTestId('home-page')).toBeVisible());
    await step('m2-try-template', async () => {
      await page.getByTestId('home-page').locator('[data-template="wallHolder"]').click({ timeout: 3000 });
      await page.waitForTimeout(1500);
    });
    await step('m2-try-new', async () => {
      await page.getByTestId('home-new').click({ timeout: 3000 });
      await page.waitForTimeout(1500);
    });
    await step('m3-chat-signed-out', async () => {
      if ((await page.getByTestId('composer').count()) === 0) throw new Error('no chat reachable');
      await send(page, 'Build me a wall holder');
      await page.waitForTimeout(4000);
    });
    await step('m4-settings-solidcraft', async () => {
      await page.getByTestId('settings').click();
      await page.getByTestId('settings-solidcraft').click();
    });
    await step('m4-settings-assistant', () => page.getByTestId('settings-assistant').click());
  } finally {
    writeFileSync(join(dir, 'steps.json'), JSON.stringify(steps, null, 2));
    await launched.close();
  }
});

// Rechecks: SolidCraft ended hard while a project is open, and Escape in dialogs whose focus sits in a field or on the X.
test('walkthrough: crash and Escape rechecks (de-narrow)', async () => {
  test.setTimeout(10 * 60_000);
  const dir = join(folder ?? '', 'recheck');
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-usability-'));
  const steps: Step[] = [];
  let launched: LaunchedApp | null = null;
  try {
    launched = await launch(work, '7955', { PARTBUDDY_FIRST_START: '0' });
    const { app, page } = launched;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
    const step = walker(app, page, dir, steps);
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 120_000 });
    await page.getByTestId('home-page').locator('[data-template="wallHolder"]').click();
    await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 120_000 });
    await page.waitForTimeout(2000);
    await step('r1-versions-escape-after-save', async () => {
      await page.getByTestId('versions-button').click();
      await page.getByTestId('version-name').fill('Test');
      await page.getByTestId('version-save').click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('versions-dialog')).toHaveCount(0, { timeout: 3000 });
    });
    await closeOverlays(page);
    await page.getByTestId('dialog-close').click().catch(() => undefined);
    await step('r2-settings-escape-on-close', async () => {
      await page.getByTestId('settings').click();
      await page.getByTestId('dialog-close').focus();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('settings-dialog')).toHaveCount(0, { timeout: 3000 });
    });
    await page.getByTestId('dialog-close').click().catch(() => undefined);
    await step('r3-settings-escape-in-search', async () => {
      await page.getByTestId('settings').click();
      await page.getByTestId('settings-search').fill('x');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('settings-dialog')).toHaveCount(0, { timeout: 3000 });
    });
    await page.getByTestId('dialog-close').click().catch(() => undefined);
    // A crash a minute or more after the start is restarted (usability U-24); a sooner one would only crash again.
    await page.waitForTimeout(60_000);
    await step('r4-crash-2s', async () => {
      killSolidCraft(work);
      await page.waitForTimeout(2000);
    });
    await step('r5-crash-back', () => expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 }));
    await step('r6-crash-30s', () => page.waitForTimeout(20000));
    await step('r7-chat-after-crash', async () => {
      await send(page, 'Make it a box');
      await turnEnded(page);
    });
    await step('r8-parameter-after-crash', async () => {
      await page.getByTestId('parameters').getByTestId('parameter').first().dblclick();
      await page.getByTestId('parameters').getByRole('textbox').first().fill('90');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    });
  } finally {
    await launched?.close().catch(() => undefined);
    writeFileSync(join(dir, 'steps.json'), JSON.stringify(steps, null, 2));
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});

// Task 5 rest: switch, import and export on their own (the main run stopped at a dialog left open).
test('walkthrough: switch, import, export (de-narrow)', async () => {
  test.setTimeout(10 * 60_000);
  const dir = join(folder ?? '', 'projects');
  mkdirSync(dir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-usability-'));
  const steps: Step[] = [];
  let launched: LaunchedApp | null = null;
  try {
    launched = await launch(work, '7956', { PARTBUDDY_FIRST_START: '0' });
    const { app, page } = launched;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
    const step = walker(app, page, dir, steps);
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 120_000 });
    for (const id of ['wallHolder', 'sign']) {
      if ((await page.getByTestId('home-page').count()) === 0) await page.getByTestId('home-button').click();
      await page.getByTestId('home-page').locator(`[data-template="${id}"]`).click();
      await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 120_000 });
      await page.waitForTimeout(2000);
    }
    await step('p1-home-two-projects', () => page.getByTestId('home-button').click());
    await step('p2-switch', async () => {
      await page.getByTestId('home-tile').last().click();
      await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId('mesh-summary')).not.toBeEmpty({ timeout: 60_000 });
    });
    await step('p3-export-menu', () => page.getByTestId('export').click());
    await step('p4-export-file', async () => {
      const target = join(work, 'export.stl');
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
      }, target);
      await page.getByRole('menuitem').first().click();
      await page.waitForTimeout(5000);
      if (!existsSync(target) && !existsSync(target.replace(/\.stl$/, '.3mf'))) throw new Error('no export file written');
    });
    await closeOverlays(page);
    await step('p5-import', async () => {
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [file] });
      }, stl);
      await page.getByTestId('home-button').click();
      await page.getByTestId('home-import').click();
      await page.waitForTimeout(8000);
    });
    await step('p6-imported-view', () => page.waitForTimeout(3000));
    await step('p7-hinged-box', async () => {
      await page.getByTestId('home-button').click();
      await page.getByTestId('home-page').locator('[data-template="hingedBox"]').click();
      await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 120_000 });
      await page.waitForTimeout(2500);
    });
    await step('p8-sketch-dark', async () => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.getByTestId('composer-sketch-open').click();
      await page.waitForTimeout(600);
    });
  } finally {
    await launched?.close().catch(() => undefined);
    writeFileSync(join(dir, 'steps.json'), JSON.stringify(steps, null, 2));
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
