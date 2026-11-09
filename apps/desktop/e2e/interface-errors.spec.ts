import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

// A white window once left nothing in the log (2026-11-09): errors of the interface go there now.
test('an error in the interface lands in the log', async () => {
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-errors-'));
  let launched: LaunchedApp | null = null;
  try {
    launched = await launchApp({ work });
    await launched.page.evaluate(() => {
      console.error('probe from the interface');
    });
    await expect.poll(() => readFileSync(join(work, 'partbuddy.log'), 'utf8')).toContain('interface error: probe from the interface');
  } finally {
    await launched?.close();
    rmSync(work, { recursive: true, force: true });
  }
});
