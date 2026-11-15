import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { appDir, launchApp } from './launch';

// What PartBuddy sends a model per turn (issue #446), without a model: the real headless SolidCraft behind the gate
// proxy, and test/probeClaude.mjs instead of Claude Code, which records role, instructions, tools and messages.
// PROBE_OUT=<file> turns it on; tools/tokens.mjs counts the record.
const target = process.env.PROBE_OUT ?? '';
test.skip(target === '', 'set PROBE_OUT to the file for the record');

test('token probe: what one turn sends', async () => {
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
    const box = page.getByRole('textbox', { name: 'Message to the assistant' });
    for (const text of ['Build a wall hook for a 40 mm tube, screwed to the wall.', 'Make the hook 5 mm wider.']) {
      await box.fill(text);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByTestId('assistant-text').last()).toContainText('Recorded.', { timeout: 60_000 });
    }
  } finally {
    await launched.close();
  }
});
