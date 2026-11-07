import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// Polish round 1 (decided 2026-11-06): pictures of every chat and assistant state, in German,
// light and dark, at a wide and a narrow window, as the basis for the list of flaws. The fake
// Claude Code plays the assistant (test/fakeClaude.mjs), SolidCraft runs headless; nothing spends
// a subscription. Only on request: PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'pictures for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const WIDTHS = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 960, height: 600 },
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

      const findings: string[] = [];
      const shot = async (name: string) => {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.waitForTimeout(400);
          await page.screenshot({ path: test.info().outputPath(`${name}-${size.name}-${scheme}.png`) });
          findings.push(...(await axeFindings(page)).map((finding) => `${name} ${scheme}: ${finding}`));
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
      // The keyboard goes from the text to the composer's tools in reading order (chat polish).
      await composer.focus();
      for (const id of ['composer-sketch-open', 'composer-photo-open', 'agent-status']) {
        await page.keyboard.press('Tab');
        await expect(page.getByTestId(id)).toBeFocused();
      }
      // With text, Send is the next stop after the route chip.
      await composer.fill('Hallo');
      await page.keyboard.press('Tab', { delay: 20 });
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('composer-send')).toBeFocused();
      await composer.fill('');
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
      // Mid-answer: the words of the slow turn arrive over four seconds.
      await page.waitForTimeout(1500);
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

      // Last, since it signs the assistant out: an expired sign-in shows only the German card.
      await send('Expire my sign-in');
      await expect(page.getByTestId('turn-failed')).toHaveCount(2, { timeout: 30_000 });
      await expect(page.getByText('Failed to authenticate')).toHaveCount(0);
      await expect(page.getByTestId('turn-sign-in')).toBeVisible();
      await shot('14-sign-in-expired');
      // WCAG 2.2 AA as far as axe sees it, in every state above (chat polish).
      expect(findings).toEqual([]);
    } finally {
      await launched?.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}

/** What axe finds against WCAG 2.2 AA in the chat; the fade-ins are off, so contrast is measured at rest. */
async function axeFindings(page: Page): Promise<string[]> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .include('[data-testid="assistant-panel"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => `${node.target.join(' ')}${violation.id === 'color-contrast' ? ` ${JSON.stringify(node.any[0]?.data)}` : ''}`).join(', ')}`);
}

/** The conversation from its start, to see the first messages after a long chat. */
async function scrollChatTop(page: Page): Promise<void> {
  await page.getByTestId('chat-list').hover();
  await page.mouse.wheel(0, -100_000);
  await page.waitForTimeout(300);
}

// States without a working assistant (chat polish): signed out, offline, and a program that does
// not start; in the narrow window, German, light and dark.
test('chat states without a working assistant', async () => {
  test.setTimeout(120_000);
  for (const state of ['signed-out', 'unavailable'] as const) {
    const launched = await launchApp({
      env:
        state === 'signed-out'
          ? { FAKE_CLAUDE_SIGNED_OUT: '1' }
          : { PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, 'no-such-claude.mjs')]) },
    });
    try {
      const { app, page } = launched;
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(960, 600);
      });
      await page.getByTestId('settings').click();
      const dialog = page.getByTestId('settings-dialog');
      await dialog.getByTestId('settings-language').getByText('Deutsch').click();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('assistant-notice')).toBeVisible({ timeout: 30_000 });
      const shot = async (name: string) => {
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.waitForTimeout(400);
          await page.screenshot({ path: test.info().outputPath(`${name}-narrow-${scheme}.png`) });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      };
      await shot(`12-${state}`);
      if (state === 'signed-out') {
        // Offline as Chromium sees it: navigator.onLine turns false and the window hears it.
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await expect(page.getByTestId('composer-offline')).toBeVisible();
        await shot('13-offline');
      }
    } finally {
      await launched.close();
    }
  }
});
