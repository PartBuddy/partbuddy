import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Polish round 1 (decided 2026-11-06): pictures of every chat and assistant state, in German,
// light and dark, at a wide and a narrow window, as the basis for the list of flaws. The fake
// Claude Code plays the assistant (test/fakeClaude.mjs), SolidCraft runs headless; nothing spends
// a subscription. Only on request: PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'pictures for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 1100, height: 800 },
] as const;

for (const size of WIDTHS) {
  test(`chat and assistant in every state (${size.name})`, async () => {
    test.setTimeout(300_000);
    const work = mkdtempSync(join(tmpdir(), 'partbuddy-polish-'));
    let launched: LaunchedApp | null = null;
    try {
      launched = await launchApp({
        isolated: false,
        work,
        env: {
          SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
          PARTBUDDY_SOLIDCRAFT_PORT: size.name === 'wide' ? '7921' : '7922',
          PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
          PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
        },
      });
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }, { width, height }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(width, height);
      }, size);
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
      // German, as Manuel uses it: switched in the settings, which apply it at once.
      await page.getByTestId('settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.getByTestId('settings-language').getByText('Deutsch').click();
      await expect(dialog.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      const shot = async (name: string) => {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.waitForTimeout(400);
          await page.screenshot({ path: test.info().outputPath(`${name}-${size.name}-${scheme}.png`) });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      };
      const composer = page.getByRole('textbox', { name: 'Nachricht an den Assistenten' });
      const send = async (text: string) => {
        await composer.fill(text);
        await page.getByRole('button', { name: 'Senden', exact: true }).click();
      };
      const settled = () => expect(page.getByRole('button', { name: 'Senden', exact: true })).toBeVisible({ timeout: 30_000 });

      await shot('01-empty');
      await page.getByTestId('agent-status').click();
      await shot('02-chip-menu');
      await page.keyboard.press('Escape');

      await send('Make a plan first');
      await expect(page.getByTestId('question-card')).toBeVisible({ timeout: 30_000 });
      await settled();
      await shot('03-plan-card');
      await page.getByTestId('question-card').getByRole('button', { name: 'Los' }).click();
      await settled();
      await expect(page.getByTestId('mesh-summary')).toContainText('1', { timeout: 30_000 });
      await shot('04-built');

      await send('I need a phone holder for this part');
      await expect(page.getByTestId('question-card').last()).toBeVisible({ timeout: 30_000 });
      await settled();
      await shot('05-question-round');

      await send('Long answer please');
      await settled();
      await shot('06-long-answer');

      await send('Make it fail');
      await settled();
      await shot('07-failed');

      await composer.fill('Take your time');
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Stopp' })).toBeVisible();
      await shot('08-busy');
      await settled();

      await page.getByTestId('composer-sketch-open').click();
      const pad = page.getByTestId('sketch-pad');
      const box = await pad.getByTestId('sketch-canvas').boundingBox();
      if (!box) throw new Error('sketch canvas not visible');
      await pad.getByTestId('sketch-tool-rect').click();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
      await page.mouse.up();
      await shot('09-sketch-pad');
      // A finding is pictured, not a failure: the round notes what cannot be reached.
      const attached = await pad
        .getByTestId('sketch-attach')
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (attached) {
        await shot('09-sketch-attached');
        await page.getByRole('button', { name: 'Senden', exact: true }).click();
        await settled();
        await shot('10-sketch-sent');
      } else {
        await page.keyboard.press('Escape');
      }
      await scrollChatTop(page);
      await shot('11-chat-top');
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}

/** The conversation from its start, to see the first messages after a long chat. */
async function scrollChatTop(page: Page): Promise<void> {
  await page.locator('[aria-live="polite"].overflow-y-auto').first().evaluate((element) => {
    (element as unknown as { scrollTop: number }).scrollTop = 0;
  });
}
