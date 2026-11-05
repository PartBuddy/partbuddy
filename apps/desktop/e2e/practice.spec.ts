import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchApp } from './launch';
import { converse } from './practice';

// Practice run (decided 2026-11-04): five real parts, built with the user's own Claude Code
// through PartBuddy, to see what gets in the way. It spends Claude subscription usage, so it runs
// only with PARTBUDDY_PRACTICE=1. The window stays off screen; SolidCraft runs headless in its own
// folders. Each part writes report.json and pictures to its test output folder.
test.skip(process.env.PARTBUDDY_PRACTICE !== '1', 'spends Claude usage; set PARTBUDDY_PRACTICE=1');
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
];

const PRINT_CHECK =
  'Prüfe, ob das Teil gut druckbar ist (Überhänge, Wandstärken, Passungen, Spiel), und nenne die beste Druckausrichtung. Ändere nichts.';

for (const part of PARTS) {
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
