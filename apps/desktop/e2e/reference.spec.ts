import { copyFileSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchApp } from './launch';
import { answerRound, waitForTurn } from './practice';

// Reference run for the design rules (decided 2026-11-07): typical requests that never say "make it
// nice", built with the user's own Claude Code, to compare a version before and after. It spends
// Claude subscription usage, so it runs only with PARTBUDDY_REFERENCE=1; PARTBUDDY_REFERENCE_ONLY
// picks requests by id (comma separated), PARTBUDDY_REFERENCE_PORT the first SolidCraft port. The
// window stays off screen; SolidCraft runs headless in its own folders. Each request writes
// report.json and a picture of the part to its test output folder.
test.skip(process.env.PARTBUDDY_REFERENCE !== '1', 'spends Claude usage; set PARTBUDDY_REFERENCE=1');

const REQUESTS = [
  { id: 'a-box', request: 'Baue eine Box mit aufsteckbarem Deckel, innen 80 × 60 × 40 mm.' },
  { id: 'b-phone', request: 'Baue eine Wandhalterung für mein Handy (75 × 160 × 9 mm), zum Anschrauben an die Wand.' },
  { id: 'c-hinge', request: 'Baue ein Elektronikgehäuse mit Klappdeckel (Scharnier) für eine Platine 60 × 40 × 20 mm.' },
  { id: 'd-clip', request: 'Baue einen Kabelclip für ein Kabel mit 6 mm Durchmesser, zum Aufkleben auf die Schreibtischkante.' },
  { id: 'e-no-fillets', request: 'Baue eine Box mit aufsteckbarem Deckel, innen 80 × 60 × 40 mm. Bitte keine Rundungen.' },
  { id: 'f-wall-1mm', request: 'Baue eine Box mit aufsteckbarem Deckel, innen 80 × 60 × 40 mm, Wand genau 1,0 mm.' },
];

// SolidCraft refuses 8.3 short paths such as ADMINI~1, which TEMP often holds; the long form goes everywhere.
const temp = realpathSync.native(tmpdir());
const only = (process.env.PARTBUDDY_REFERENCE_ONLY ?? '').split(',').filter(Boolean);
const firstPort = Number(process.env.PARTBUDDY_REFERENCE_PORT ?? '7960');

for (const [index, { id, request }] of REQUESTS.entries()) {
  if (only.length > 0 && !only.includes(id)) continue;
  test(`reference: ${id}`, async () => {
    test.setTimeout(60 * 60 * 1000);
    const work = mkdtempSync(join(temp, `partbuddy-reference-${id}-`));
    const launched = await launchApp({
      isolated: false,
      work,
      env: { TEMP: temp, TMP: temp, SOLIDCRAFT_CONTROL_DIR: join(work, 'control'), PARTBUDDY_SOLIDCRAFT_PORT: String(firstPort + index), PARTBUDDY_PROJECTS_DIR: join(work, 'projects') },
    });
    const { page } = launched;
    const rounds: unknown[] = [];
    const report: Record<string, unknown> = { request, rounds };
    const started = Date.now();
    try {
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
      await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
      // Two runs side by side can meet while Claude Code refreshes its sign-in; that passes within a minute.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(request);
        await page.getByRole('button', { name: 'Send' }).click();
        await waitForTurn(page);
        if (!/Failed to refresh OAuth token/.test((await page.getByTestId('assistant-text').last().textContent().catch(() => '')) ?? '')) break;
        await page.waitForTimeout(60_000);
      }
      // Every round is answered with its recommendations, a plan with Go, as a user in a hurry would.
      for (let round = 1; round <= 10; round += 1) {
        const open = page.getByTestId('question-card').filter({ hasNot: page.getByTestId('question-answered') });
        if ((await open.count()) === 0) break;
        const card = open.first();
        const kind = (await card.getAttribute('data-kind')) ?? '?';
        rounds.push({ round, kind, card: await card.innerText() });
        if (kind === 'plan') await card.getByRole('button', { name: 'Go' }).click();
        else await answerRound(card, undefined);
        await waitForTurn(page);
      }
      report.seconds = Math.round((Date.now() - started) / 1000);
      report.answers = await page.getByTestId('assistant-text').allInnerTexts();
      report.steps = await page.getByTestId('step-text').allTextContents();
      report.mesh = await page.getByTestId('mesh-summary').textContent({ timeout: 10_000 }).catch(() => null);
      report.parameters = await page.evaluate(() =>
        (globalThis as unknown as { partbuddy: { design: { parameters(): Promise<{ name: string; value: number; unit: string; comment: string }[]> } } }).partbuddy.design.parameters(),
      );
      await page.keyboard.press('0');
      await page.waitForTimeout(1500);
      await page.getByTestId('viewer').screenshot({ path: test.info().outputPath(`${id}.png`) });
    } catch (error) {
      report.failure = (error as Error).message.slice(0, 1000);
      await page.screenshot({ path: test.info().outputPath('failed.png') }).catch(() => undefined);
    } finally {
      writeFileSync(test.info().outputPath('report.json'), JSON.stringify(report, null, 2));
      await launched.close();
      // The design itself, so SolidCraft can render it afterwards even when the view lagged behind.
      for (const file of readdirSync(join(work, 'projects'), { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.sc')))
        copyFileSync(join(work, 'projects', file), test.info().outputPath(basename(file)));
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}
