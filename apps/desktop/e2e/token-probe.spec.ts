import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { appDir, launchApp } from './launch';
import { answerRound } from './practice';

// What PartBuddy sends a model per turn (issue #446). PROBE_OUT=<file> turns the tests on.
// - "probe": no model. The real headless SolidCraft behind the gate proxy, and test/probeClaude.mjs instead of Claude
//   Code, which records role, instructions, tools and messages into PROBE_OUT.
// - "real" (PROBE_REAL=1 as well): the user's own Claude Code builds a wall hook and makes one change; the log's
//   "turn tokens" lines go into PROBE_OUT. Spends Claude usage; never run it beside another real run.
//   PROBE_ROUTE=chatgpt runs it on ChatGPT instead, in the profile of PROBE_WORK with its own credential store.
// - "sign in" (PROBE_SIGNIN=1 with PROBE_WORK): shows the app so the user signs in to ChatGPT in that profile once.
const target = process.env.PROBE_OUT ?? '';
const real = process.env.PROBE_REAL === '1';
const signIn = process.env.PROBE_SIGNIN === '1';
const chatgpt = process.env.PROBE_ROUTE === 'chatgpt' || signIn;
// The ChatGPT profile lasts across runs; the user's own sign-in in PartBuddy stays out of it.
const profileWork = process.env.PROBE_WORK ?? '';
const measureEnv = (work: string, port: string) => ({
  SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
  PARTBUDDY_SOLIDCRAFT_PORT: port,
  // Every run builds in a new, empty projects folder, so runs compare.
  PARTBUDDY_PROJECTS_DIR: join(work, `projects-${String(Date.now())}`),
  ...(chatgpt ? { PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-measure' } : { PARTBUDDY_CLAUDE_TRACE: join(work, 'claude-trace.jsonl') }),
});

/** The chip of a ChatGPT route that is signed in and names its model. */
const READY = /^ChatGPT · (?!not signed in|checking|not available|working)/;

async function pickChatGpt(page: Page): Promise<void> {
  await page.getByTestId('agent-status').click();
  await page.getByTestId('agent-menu').getByText('ChatGPT', { exact: true }).click();
  await page.keyboard.press('Escape');
}
test.skip(target === '', 'set PROBE_OUT to the file for the record');

const BUILD = 'Build a wall hook for a 40 mm tube, screwed to the wall.';
const CHANGE = 'Make the hook 5 mm wider.';

async function waitForTurn(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible({ timeout: 120_000 }).catch(() => undefined);
  await expect(stop).toBeHidden({ timeout: 40 * 60 * 1000 });
  await page.waitForTimeout(1500);
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

test('token probe: sign in to ChatGPT', async () => {
  test.skip(!signIn || profileWork === '', 'set PROBE_SIGNIN=1 and PROBE_WORK');
  test.setTimeout(20 * 60 * 1000);
  const launched = await launchApp({ isolated: false, work: profileWork, env: measureEnv(profileWork, '7953') });
  const { page } = launched;
  try {
    await pickChatGpt(page);
    await page.getByRole('button', { name: 'Continue with ChatGPT' }).click();
    // Signing in shows 'checking' first; only a ready route names its model.
    await expect(page.getByTestId('agent-status')).toHaveText(READY, { timeout: 15 * 60 * 1000 });
  } finally {
    await launched.close();
  }
});

test('token probe: what one turn sends', async () => {
  test.skip(real || signIn, 'the real run is the other test');
  test.setTimeout(5 * 60 * 1000);
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-probe-'));
  const launched = await launchApp({
    isolated: false,
    work,
    env: {
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_PORT: '7951',
      PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(appDir, 'test', 'probeClaude.mjs')]),
      PROBE_OUT: resolve(target),
    },
  });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    for (const text of [BUILD, CHANGE]) {
      await send(page, text);
      await expect(page.getByTestId('assistant-text').last()).toContainText('Recorded.', { timeout: 60_000 });
    }
  } finally {
    await launched.close();
  }
});

test('token probe: a real Claude Code build and change', async () => {
  test.skip(!real || signIn, 'set PROBE_REAL=1: spends plan usage');
  test.setTimeout(90 * 60 * 1000);
  const work = chatgpt ? profileWork : mkdtempSync(join(tmpdir(), 'partbuddy-real-'));
  test.skip(work === '', 'set PROBE_WORK to the profile signed in to ChatGPT');
  const launched = await launchApp({ isolated: false, work, env: measureEnv(work, '7952') });
  const { page } = launched;
  const phases: { phase: string; lines: string[] }[] = [];
  const result: Record<string, unknown> = {};
  const log = join(work, 'partbuddy.log');
  const tokenLines = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter((line) => line.includes('turn tokens'));
  const mark = (phase: string, before: number) => phases.push({ phase, lines: tokenLines().slice(before) });
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    if (chatgpt) await pickChatGpt(page);
    await expect(page.getByTestId('agent-status')).toContainText(chatgpt ? 'ChatGPT' : 'Claude Code', { timeout: 30_000 });
    await expect(page.getByTestId('agent-status')).not.toContainText('not signed in');
    const start = tokenLines().length;
    await send(page, BUILD);
    await waitForTurn(page);
    mark('request', start);
    for (let round = 1; round <= 6; round += 1) {
      const open = page.getByTestId('question-card').filter({ hasNot: page.getByTestId('question-answered') });
      if ((await open.count()) === 0) break;
      const card = open.first();
      const before = tokenLines().length;
      if ((await card.getAttribute('data-kind')) === 'plan') await card.getByRole('button', { name: 'Build' }).click();
      else await answerRound(card, undefined);
      await waitForTurn(page);
      mark(`round ${String(round)}`, before);
    }
    const before = tokenLines().length;
    await send(page, CHANGE);
    await waitForTurn(page);
    mark('change', before);
    // What came out, for comparing models by quality too: the check's findings, the parameters and a picture.
    result.answers = await page.getByTestId('assistant-text').allInnerTexts();
    result.parameters = await page.getByTestId('parameter').allInnerTexts();
    await page.getByTestId('print-check').click();
    result.findings = await page.getByTestId('print-check-panel').locator('[data-kind]').allInnerTexts();
    await page.keyboard.press('Escape');
    await page.keyboard.press('0');
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(work, 'built-iso.png') });
  } finally {
    writeFileSync(resolve(target), JSON.stringify({ work, phases, ...result }, null, 1));
    await launched.close();
  }
});
