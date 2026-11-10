import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchApp } from './launch';
import { answerRound, converse, waitForTurn } from './practice';

// Practice run (decided 2026-11-04): five real parts, built with the user's own Claude Code
// through PartBuddy, to see what gets in the way. It spends Claude subscription usage, so it runs
// only with PARTBUDDY_PRACTICE=1. The window stays off screen; SolidCraft runs headless in its own
// folders. Each part writes report.json and pictures to its test output folder.
test.skip(process.env.PARTBUDDY_PRACTICE !== '1' && !process.env.PARTBUDDY_PRACTICE_PHOTO && process.env.PARTBUDDY_PRACTICE_RESEARCH !== '1', 'spends Claude usage; set PARTBUDDY_PRACTICE=1');
test.describe.configure({ mode: 'serial' });

interface Part {
  id: string;
  request: string;
  /** What to answer when the assistant asks (a button whose label contains it, else typed). */
  answer?: string;
}

const PARTS: Part[] = [
  {
    id: '1-distanzhuelsen',
    request:
      'Baue ein Set aus drei Distanzhülsen: innen 8 mm, außen 12 mm, Längen 5, 10 und 15 mm, nebeneinander mit 5 mm Abstand. ' +
      'Lege Innen- und Außendurchmesser als Parameter an, damit ich sie später ändern kann.',
  },
  {
    id: '2-drehknopf',
    request:
      'Baue einen Drehknopf mit 30 mm Durchmesser und 15 mm Höhe für eine 6-mm-D-Welle (Abflachung auf 4,5 mm). ' +
      'Die Bohrung soll 12 mm tief sein und gut auf der Welle klemmen. Außen 24 Griffrillen.',
  },
  {
    id: '3-kabelklemme',
    request: 'Baue eine Kabelklemme für die Tischkante: eine U-Klemme für die Tischplatte, oben drei Clips für Kabel mit 6 mm Durchmesser.',
    answer: '20 mm',
  },
  {
    id: '4-wandhalter',
    request:
      'Baue einen Wandhalter für einen Akkuschrauber: eine Platte zum Anschrauben mit zwei Senkkopfschrauben 4 mm und einen nach oben ' +
      'gebogenen Haken, in den der Griff (etwa 35 mm breit) gehängt wird. Er soll das Gewicht sicher tragen.',
  },
  {
    id: '5-gehaeuse',
    request:
      'Baue ein Gehäuse mit Schiebedeckel für eine Platine 50 × 30 × 15 mm. Innen vier Schraubdome für M2,5 in den Ecken der Platine ' +
      '(Lochabstand 44 × 24 mm), Wandstärke 2 mm. Der Deckel soll mit 0,2 mm Spiel in einer Nut gleiten.',
  },
  // Parts that move (ADR 0027): the request names no tool; the report says whether the assistant took partbuddy_mechanism.
  {
    id: '6-klappdose',
    request:
      'Baue eine flache Dose 60 × 40 × 20 mm mit einem Deckel, der über ein Scharnier an einer langen Seite aufklappt. ' +
      'Dose und Deckel sollen zusammen in einem Stück druckbar sein, ohne Stützmaterial.',
  },
];

const PRINT_CHECK =
  'Prüfe, ob das Teil gut druckbar ist (Überhänge, Wandstärken, Passungen, Spiel), und nenne die beste Druckausrichtung. Ändere nichts.';

for (const part of process.env.PARTBUDDY_PRACTICE === '1' ? PARTS.filter((entry) => !process.env.PARTBUDDY_PRACTICE_PART || entry.id === process.env.PARTBUDDY_PRACTICE_PART) : []) {
  test(`practice: ${part.id}`, async () => {
    test.setTimeout(45 * 60 * 1000);
    const work = mkdtempSync(join(tmpdir(), `partbuddy-practice-${part.id}-`));
    const launched = await launchApp({
      isolated: false,
      work,
      env: { SOLIDCRAFT_CONTROL_DIR: join(work, 'control'), PARTBUDDY_SOLIDCRAFT_PORT: String(7920 + PARTS.indexOf(part)), PARTBUDDY_PROJECTS_DIR: join(work, 'projects') },
    });
    const { page } = launched;
    const report: Record<string, unknown> = { part: part.id, request: part.request };
    try {
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
      await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
      report.build = await converse(page, part.request, part.answer);
      report.mesh = await page.getByTestId('mesh-summary').textContent();
      await page.screenshot({ path: test.info().outputPath('built.png') });
      // Parts that move: the joints with their ranges, and the steps of the work log that made them.
      report.steps = await page.getByText(/with its joint|Joint “|parts that can move/).allInnerTexts();
      if ((await page.getByTestId('joints').count()) > 0) {
        await page.getByTestId('joints').click();
        const sliders = page.getByTestId('joint-panel').getByRole('slider');
        const joints: unknown[] = [];
        for (let i = 0; i < (await sliders.count()); i += 1) {
          const slider = sliders.nth(i);
          joints.push({ name: await slider.getAttribute('aria-label'), min: await slider.getAttribute('min'), max: await slider.getAttribute('max'), value: await slider.inputValue() });
        }
        report.joints = joints;
        await page.screenshot({ path: test.info().outputPath('joints.png') });
        // Opened as far as it goes, to see the lid stand.
        if ((await sliders.count()) > 0) {
          const first = sliders.first();
          const start = await first.inputValue();
          await first.focus();
          await page.keyboard.press((await first.getAttribute('max')) === start ? 'Home' : 'End');
          await expect(page.getByTestId('joint-reset')).toBeEnabled({ timeout: 60_000 });
          await page.waitForTimeout(2000);
          await page.screenshot({ path: test.info().outputPath('joint-at-end.png') });
          await page.getByTestId('joint-reset').click();
          // The button is disabled while it works too: the slider back at its start says it is done.
          await expect(sliders.first()).toHaveValue(start, { timeout: 60_000 });
          await page.waitForTimeout(2000);
        }
        await page.getByTestId('joints').click();
      } else {
        report.joints = [];
      }
      await page.getByTestId('print-check').click();
      report.findings = await page.getByTestId('print-check-panel').locator('[data-kind]').allInnerTexts();
      await page.keyboard.press('Escape');
      await page.keyboard.press('0');
      await page.waitForTimeout(800);
      await page.screenshot({ path: test.info().outputPath('built-iso.png') });
      // The dimensions of the last feature, as the user would see them.
      await page.getByTestId('dimensions').click();
      await page.waitForTimeout(1500);
      report.dimensions = await page.getByTestId('mark-label').allTextContents();
      await page.screenshot({ path: test.info().outputPath('dimensions.png') });
      await page.getByTestId('dimensions').click();
      report.printCheck = await converse(page, PRINT_CHECK, undefined);
      report.meshAfterCheck = await page.getByTestId('mesh-summary').textContent();
      await page.screenshot({ path: test.info().outputPath('print-check.png') });
    } catch (error) {
      report.failure = (error as Error).message.slice(0, 1000);
      await page.screenshot({ path: test.info().outputPath('failed.png') }).catch(() => undefined);
    } finally {
      writeFileSync(test.info().outputPath('report.json'), JSON.stringify(report, null, 2));
      await launched.close();
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    }
  });
}

/**
 * One part designed in question rounds with the real assistant: every round is answered with its
 * recommendations, the plan with Go. Keeps a picture of every card, the sources the assistant
 * looked at, its answers and the parameters with their values in report.json.
 */
async function designInRounds(id: string, port: number, request: string, photo?: string): Promise<void> {
  test.setTimeout(60 * 60 * 1000);
  const work = mkdtempSync(join(tmpdir(), `partbuddy-practice-${id}-`));
  const launched = await launchApp({
    isolated: false,
    work,
    env: { SOLIDCRAFT_CONTROL_DIR: join(work, 'control'), PARTBUDDY_SOLIDCRAFT_PORT: String(port), PARTBUDDY_PROJECTS_DIR: join(work, 'projects') },
  });
  const { page } = launched;
  const rounds: unknown[] = [];
  const report: Record<string, unknown> = { request, rounds };
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
    if (photo) {
      await page.getByTestId('composer-photo-input').setInputFiles(photo);
      await expect(page.getByTestId('composer-photo')).toBeVisible();
    }
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill(request);
    await page.getByRole('button', { name: 'Send' }).click();
    await waitForTurn(page);
    for (let round = 1; round <= 10; round += 1) {
      const open = page.getByTestId('question-card').filter({ hasNot: page.getByTestId('question-answered') });
      if ((await open.count()) === 0) break;
      const card = open.first();
      const kind = (await card.getAttribute('data-kind')) ?? '?';
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: test.info().outputPath(`round-${String(round)}-${kind}.png`) });
      rounds.push({ round, kind, card: await card.innerText() });
      if (kind === 'plan') await card.getByRole('button', { name: 'Build' }).click();
      else await answerRound(card, undefined);
      await waitForTurn(page);
    }
    // innerText keeps the paragraphs apart; textContent runs them together.
    report.sources = await page.getByTestId('source-card').allInnerTexts();
    report.answers = await page.getByTestId('assistant-text').allInnerTexts();
    report.parameters = await page.getByTestId('parameter').allInnerTexts();
    report.steps = await page.getByTestId('step-text').allTextContents();
    report.mesh = await page.getByTestId('mesh-summary').textContent().catch(() => null);
    await page.screenshot({ path: test.info().outputPath('built.png') });
    await page.keyboard.press('0');
    await page.waitForTimeout(800);
    await page.screenshot({ path: test.info().outputPath('built-iso.png') });
  } catch (error) {
    report.failure = (error as Error).message.slice(0, 1000);
    await page.screenshot({ path: test.info().outputPath('failed.png') }).catch(() => undefined);
  } finally {
    writeFileSync(test.info().outputPath('report.json'), JSON.stringify(report, null, 2));
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}

// From a photo to a part in question rounds (decided 2026-11-06): the user's example, a holder for
// a Samsung Galaxy S25 Ultra on the part in the photo. Runs with PARTBUDDY_PRACTICE_PHOTO set to the photo.
test('practice: phone holder from a photo, in question rounds', async () => {
  const photo = process.env.PARTBUDDY_PRACTICE_PHOTO;
  test.skip(!photo, 'set PARTBUDDY_PRACTICE_PHOTO to a photo');
  await designInRounds('holder', 7930, 'Ich benötige eine Halterung für mein Samsung Galaxy S25 Ultra, die an diesem Teil festgemacht wird.', photo);
});

// Research check (decided 2026-11-06): values the assistant can only get right from sources.
// Known answers: Raspberry Pi 5 holes 58 × 49 mm for M2.5; ruthex M3 insert hole 4.0 mm, 5.7 mm long.
const RESEARCH: { id: string; request: string }[] = [
  { id: 'research-pi5', request: 'Baue eine Grundplatte mit vier Abstandshaltern, auf die ich meinen Raspberry Pi 5 schrauben kann.' },
  { id: 'research-insert', request: 'Baue einen Würfel mit 20 mm Kantenlänge mit einer Bohrung oben für einen ruthex-Gewindeeinsatz M3 (die Standardlänge).' },
  { id: 'research-concept', request: 'Ich brauche einen Wandhalter für meinen Akkuschrauber Bosch GSR 12V-15.' },
];
for (const [i, task] of RESEARCH.entries()) {
  test(`practice: ${task.id}`, async () => {
    test.skip(process.env.PARTBUDDY_PRACTICE_RESEARCH !== '1', 'spends Claude usage; set PARTBUDDY_PRACTICE_RESEARCH=1');
    await designInRounds(task.id, 7940 + i, task.request);
  });
}
