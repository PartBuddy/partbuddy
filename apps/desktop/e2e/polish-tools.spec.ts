import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Polish round 6 (decided 2026-11-07): pictures of the tools the earlier rounds left out – notes on
// the model, the sketch sheet with every tool, scale and a photo beneath, the drop overlay and the
// smallest window – in German, light and dark. Headless SolidCraft, no assistant. Each step is tried
// on its own; a step that fails is pictured as such and the round goes on. Only on request:
// PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'pictures for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900, port: '7925' },
  { name: 'small', width: 960, height: 600, port: '7926' },
] as const;

const SPOTS = [
  [0.5, 0.5],
  [0.45, 0.4],
  [0.55, 0.6],
  [0.4, 0.55],
] as const;

async function pickFace(page: Page): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const bar = page.getByTestId('selection-bar');
  for (const [x, y] of SPOTS) {
    await page.keyboard.press('Escape');
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(400);
    if ((await bar.count()) > 0 && (await bar.getAttribute('data-kind')) === 'face') return;
  }
  throw new Error('no face found');
}

type Shape = { tool: string; from: [number, number]; to?: [number, number]; value?: string };
const SHAPES: Shape[] = [
  { tool: 'rect', from: [0.2, 0.2], to: [0.68, 0.7] },
  { tool: 'circle', from: [0.35, 0.45], to: [0.41, 0.45] },
  { tool: 'line', from: [0.75, 0.2], to: [0.75, 0.7] },
  { tool: 'arc', from: [0.8, 0.3], to: [0.9, 0.4] },
  { tool: 'pen', from: [0.25, 0.85], to: [0.6, 0.9] },
  { tool: 'dimension', from: [0.2, 0.78], to: [0.68, 0.78], value: '40' },
  { tool: 'text', from: [0.5, 0.55], value: 'M3' },
];

for (const size of WIDTHS) {
  test(`notes, sketch sheet and drop (${size.name})`, async () => {
    test.setTimeout(420_000);
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-polish-tools-'));
    let launched: LaunchedApp | null = null;
    try {
      launched = await launchApp({
        isolated: false,
        work,
        env: {
          SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
          PARTBUDDY_SOLIDCRAFT_PORT: size.port,
          PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
          PARTBUDDY_START_PAGE: '1',
          PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
        },
      });
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }, { width, height }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(width, height);
      }, size);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 60_000 });
      await page.getByTestId('settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.getByTestId('settings-language').getByText('Deutsch').click();
      await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
      await page.keyboard.press('Escape');

      const shot = async (name: string) => {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.waitForTimeout(500);
          await page.screenshot({ path: test.info().outputPath(`${name}-${size.name}-${scheme}.png`) });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      };
      const step = async (name: string, run: () => Promise<void>, close = true) => {
        try {
          await run();
          await shot(name);
        } catch (error) {
          await page.screenshot({ path: test.info().outputPath(`${name}-${size.name}-failed.png`) }).catch(() => undefined);
          console.log(`polish step ${name} failed: ${(error as Error).message.split('\n')[0] ?? ''}`);
        }
        if (close) await page.keyboard.press('Escape');
      };

      const home = page.getByTestId('home-page');
      await home.locator('[data-template="housing"]').click();
      await expect(home).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId('mesh-summary')).toContainText('2', { timeout: 60_000 });
      await page.waitForTimeout(1000);

      await step(
        '01-note-new',
        async () => {
          await pickFace(page);
          await page.getByTestId('hud-ask').fill('Hier 3 mm Wand lassen – der Schraubenkopf sitzt darauf.');
        },
        false,
      );
      await step('02-note-pinned', async () => {
        await page.getByTestId('hud-note').click();
        await expect(page.getByTestId('note-pin')).toHaveCount(1, { timeout: 15_000 });
      });
      await step(
        '03-note-card',
        async () => {
          await page.getByTestId('note-pin').first().click();
          await expect(page.getByTestId('note-card')).toBeVisible();
        },
        false,
      );
      await page.keyboard.press('Escape');
      await step('04-notes-list', async () => {
        await page.getByTestId('notes').click();
        await expect(page.getByTestId('note-row').first()).toBeVisible();
      });

      const pad = page.getByTestId('sketch-pad');
      await step(
        '05-sketch-tools',
        async () => {
          await page.getByTestId('composer-sketch-open').click();
          const box = await pad.getByTestId('sketch-canvas').boundingBox();
          if (!box) throw new Error('sketch canvas not visible');
          const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
          await pad.getByTestId('sketch-sheet-free').click();
          for (const shape of SHAPES) {
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
          await page.mouse.move(0, 300);
        },
        false,
      );
      await step(
        '06-sketch-value-open',
        async () => {
          const box = await pad.getByTestId('sketch-canvas').boundingBox();
          if (!box) throw new Error('sketch canvas not visible');
          await pad.getByTestId('sketch-tool-dimension').click();
          await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.15);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.15, { steps: 6 });
          await page.mouse.up();
          await expect(pad.getByTestId('sketch-value')).toBeVisible();
        },
        false,
      );
      await page.keyboard.press('Escape');
      await step(
        '07-sketch-scale',
        async () => {
          await pad.getByTestId('sketch-scale').fill('5');
          await page.mouse.move(0, 300);
        },
        false,
      );
      await step(
        '08-sketch-other-sheets',
        async () => {
          await pad.getByTestId('sketch-sheet-side').click();
          await page.waitForTimeout(300);
        },
        false,
      );
      await step(
        '09-sketch-photo',
        async () => {
          await pad.getByTestId('sketch-sheet-free').click();
          await pad.getByTestId('sketch-photo-file').setInputFiles(join(__dirname, '..', 'src', 'renderer', 'src', 'home', 'templates', 'housing.png'));
          await page.waitForTimeout(1000);
        },
        false,
      );
      await step('10-sketch-kept-menu', async () => {
        await pad.getByTestId('sketch-kept').click({ timeout: 2000 }).catch(() => undefined);
        await page.waitForTimeout(400);
      });
      await page.keyboard.press('Escape');

      const drag = (type: string, name: string) =>
        page.evaluate(
          ({ kind, file }) => {
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
      await step('11-file-drop', async () => {
        await drag('dragenter', 'Platine.step');
        await expect(page.getByTestId('file-drop')).toBeVisible();
      });
      await drag('dragleave', 'Platine.step').catch(() => undefined);
      await step('12-drop-notice', async () => {
        await drag('dragenter', 'notizen.txt');
        await drag('drop', 'notizen.txt');
        await expect(page.getByTestId('notice')).toBeVisible();
      });
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}
