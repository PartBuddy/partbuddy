import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { launchApp } from './launch';

// Chat polish (2026-11-07): how a long conversation behaves – the 400 entries a project keeps –
// when it comes back, scrolls and gets a streamed answer. Numbers for the polish round, not a
// gate: they land in the report. Only on request: PARTBUDDY_POLISH=1 with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_POLISH !== '1' || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'measurements for a polish round; set PARTBUDDY_POLISH=1 and PARTBUDDY_E2E_SOLIDCRAFT=1');

const ANSWER = [
  'Die Platte bekommt zwei **Senkbohrungen** für M4 und eine Verrundung an der Hakenwurzel.',
  '',
  '| Teil | Breite | Höhe |',
  '| --- | ---: | ---: |',
  '| Grundplatte | 80 mm | 40 mm |',
  '| Haken | 35 mm | 25 mm |',
  '',
  '- Liegend drucken, keine Stützen',
  '- PETG hält Wärme besser',
].join('\n');

/** The design files of the work folder's projects, found after the first start saved one. */
function designsIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.sc'))
    .map((name) => join(folder, name))
    .filter((path) => statSync(path).isFile());
}

/** Frame times while `action` runs, from requestAnimationFrame in the page. */
type FrameWindow = { requestAnimationFrame: (tick: (now: number) => void) => number; __frames: { times: number[]; run: boolean } };

async function frames(page: Page, action: () => Promise<void>): Promise<{ frames: number; worstMs: number; over50: number }> {
  await page.evaluate(() => {
    const win = globalThis as unknown as FrameWindow;
    const state = { times: [] as number[], run: true };
    win.__frames = state;
    let last = performance.now();
    const tick = (now: number) => {
      state.times.push(now - last);
      last = now;
      if (state.run) win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  });
  await action();
  return page.evaluate(() => {
    const state = (globalThis as unknown as FrameWindow).__frames;
    state.run = false;
    const times = state.times.slice(1);
    return { frames: times.length, worstMs: Math.round(Math.max(...times)), over50: times.filter((ms) => ms > 50).length };
  });
}

test('a conversation of 400 entries comes back, scrolls and streams smoothly', async () => {
  test.setTimeout(240_000);
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-long-chat-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7923',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  try {
    // First start: one request, so the project has a design the chat is kept next to.
    let launched = await launchApp({ isolated: false, work, env });
    let page = launched.page;
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build a box');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('mesh-summary')).toContainText('1', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    const idle = await frames(page, () => page.waitForTimeout(3000));
    const shortStream = await frames(page, async () => {
      await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Take your time');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.getByText('Done, slowly.')).toBeVisible({ timeout: 30_000 });
    });
    await page.waitForTimeout(1500);
    await launched.close();

    const [design] = designsIn(join(work, 'projects'));
    if (!design) throw new Error('no design was saved');
    const items = Array.from({ length: 200 }, (_, i) => [
      { kind: 'user', text: `Frage ${String(i + 1)}: wie dick soll die Platte werden?` },
      { kind: 'assistant', text: ANSWER },
    ]).flat();
    writeFileSync(design.replace(/\.sc$/, '.chat.json'), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), items }));

    // Second start: the 400 entries come back.
    const started = Date.now();
    launched = await launchApp({ isolated: false, work, env });
    page = launched.page;
    await expect(page.getByTestId('earlier-session')).toBeVisible({ timeout: 60_000 });
    const restoreMs = Date.now() - started;
    const list = page.getByTestId('chat-list');
    await expect(page.getByTestId('chat-to-latest')).toHaveCount(0);
    // The view compiles its shaders and draws the project picture after a start; that is not the chat.
    await page.waitForTimeout(4000);

    // Up to the first message and back with the wheel, as a person scrolls.
    await list.hover();
    const scroll = await frames(page, async () => {
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(25);
      }
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(25);
      }
    });

    // A streamed answer at the end of the long chat.
    await page.getByTestId('chat-to-latest').click().catch(() => undefined);
    const stream = await frames(page, async () => {
      await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Take your time');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      // Waited for through the newest answer alone: a page-wide text search over 400 entries costs more than the chat.
      await expect(page.getByTestId('assistant-text').last()).toContainText('Done, slowly.', { timeout: 30_000 });
    });
    // The chat followed the stream to its end.
    await expect(page.getByTestId('chat-to-latest')).toHaveCount(0);

    const report = { entries: items.length, idle, shortStream, restoreMs, scroll, stream };
    console.log(`long chat: ${JSON.stringify(report)}`);
    writeFileSync(test.info().outputPath('long-chat.json'), JSON.stringify(report, null, 2));
    await page.screenshot({ path: test.info().outputPath('long-chat.png') });
    await launched.close();
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
