import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
const target = process.env.PROBE_OUT ?? '';
const real = process.env.PROBE_REAL === '1';
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

test('token probe: what one turn sends', async () => {
  test.skip(real, 'the real run is the other test');
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
  test.skip(!real, 'set PROBE_REAL=1: spends Claude usage');
  test.setTimeout(90 * 60 * 1000);
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-real-'));
  const launched = await launchApp({
    isolated: false,
    work,
    env: { SOLIDCRAFT_CONTROL_DIR: join(work, 'control'), PARTBUDDY_SOLIDCRAFT_PORT: '7952', PARTBUDDY_CLAUDE_TRACE: join(work, 'claude-trace.jsonl') },
  });
  const { page } = launched;
  const phases: { phase: string; lines: string[] }[] = [];
  const log = join(work, 'partbuddy.log');
  const tokenLines = () => readFileSync(log, 'utf8').split('\n').filter((line) => line.includes('turn tokens'));
  const mark = (phase: string, before: number) => phases.push({ phase, lines: tokenLines().slice(before) });
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
    await send(page, BUILD);
    await waitForTurn(page);
    mark('request', 0);
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
  } finally {
    writeFileSync(resolve(target), JSON.stringify({ work, phases }, null, 1));
    await launched.close();
  }
});
