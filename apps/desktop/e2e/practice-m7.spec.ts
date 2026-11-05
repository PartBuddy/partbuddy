import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { launchApp } from './launch';
import { converse, waitForTurn } from './practice';

// Practice run M7 (decided 2026-11-05): before the user prints, three real parts are built with the
// user's own Claude Code and taken through ready-to-print: the printer profile of the user's
// Bambu Lab H2S, the light with its findings, the orientation proposal, the fit assistant and the
// turned 3MF export, which Bambu Studio then slices without a window. It spends Claude subscription
// usage, so it runs only with PARTBUDDY_PRACTICE=1. Each part writes report.json and pictures.
test.skip(process.env.PARTBUDDY_PRACTICE !== '1', 'spends Claude usage; set PARTBUDDY_PRACTICE=1');
test.describe.configure({ mode: 'serial' });

type FitKind = 'clamp' | 'push' | 'slide' | 'turn';

interface Part {
  id: string;
  request: string;
  /** What to answer when the assistant asks (a button whose label contains it, else typed). */
  answer?: string;
  /** A hole drawn for a counterpart of `mating` mm (as drawn or already with clearance) is fitted to it. */
  fit?: { mating: number; kind: FitKind };
}

const PARTS: Part[] = [
  {
    id: '1-distanzhuelsen',
    request:
      'Baue ein Set aus drei Distanzhülsen für M8-Schrauben: außen 12 mm, Längen 5, 10 und 15 mm, nebeneinander mit 5 mm Abstand. ' +
      'Lege Innen- und Außendurchmesser als Parameter an, damit ich sie später ändern kann.',
    fit: { mating: 8, kind: 'slide' },
  },
  {
    id: '2-wandhalter',
    request:
      'Baue einen Wandhalter für einen Akkuschrauber: eine Platte zum Anschrauben mit zwei Senkkopfschrauben 4 mm und einen nach oben ' +
      'gebogenen Haken, in den der Griff (etwa 35 mm breit) gehängt wird. Er soll das Gewicht sicher tragen.',
  },
  {
    id: '3-gehaeuse',
    request:
      'Baue ein Gehäuse mit Schiebedeckel für eine Platine 50 × 30 × 15 mm. Innen vier Schraubdome für M2,5 in den Ecken der Platine ' +
      '(Lochabstand 44 × 24 mm), Wandstärke 2 mm. Der Deckel soll in einer Nut gleiten.',
  },
];

/**
 * M7f (designing without support, decided 2026-11-05): parts that need the rules, a lying hole too
 * wide to bridge and countersinks that open towards the bed. PARTBUDDY_PRACTICE_SET=m7f picks them.
 */
const PARTS_M7F: Part[] = [
  {
    id: 'f1-rohrhalter',
    request:
      'Baue einen Halter für ein Rohr mit 20 mm Durchmesser: einen Block 40 × 30 × 30 mm, der flach auf dem Druckbett liegt, mit einer waagrechten ' +
      'Durchgangsbohrung für das Rohr (gleitend) und zwei senkrechten Bohrungen für M4-Schrauben daneben.',
  },
  {
    id: 'f2-montageplatte',
    request:
      'Baue eine Montageplatte 80 × 50 × 8 mm mit vier Senkbohrungen für M4-Senkkopfschrauben, 8 mm vom Rand. Die Schrauben kommen von unten, ' +
      'die Senkungen liegen also auf der Unterseite. Runde alle Außenkanten mit 3 mm ab.',
  },
];
const SELECTED = process.env.PARTBUDDY_PRACTICE_SET === 'm7f' ? PARTS_M7F : PARTS;

/** Manuel's printer (OrcaSlicer settings, 2026-11-05): Bambu Lab H2S, 340 × 320 × 340 mm, 0.4 mm nozzle. */
const PRINTER = { name: 'Bambu Lab H2S', bed: { x: '340', y: '320', z: '340' } };

const BAMBU_STUDIO = process.env.PARTBUDDY_BAMBU_STUDIO ?? 'C:\\Program Files\\Bambu Studio\\bambu-studio.exe';

async function setPrinter(page: Page): Promise<void> {
  await page.getByTestId('settings').click();
  await page.getByTestId('settings-print').click();
  const dialog = page.getByTestId('print-profiles');
  await dialog.getByTestId('printer-name').getByRole('textbox').fill(PRINTER.name);
  for (const [axis, value] of Object.entries(PRINTER.bed)) {
    const field = dialog.getByTestId(`printer-bed-${axis}`).getByRole('textbox');
    await field.fill(value);
    await field.press('Tab');
  }
  await dialog.getByTestId('print-save').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('material-chip')).toContainText(PRINTER.name);
}

/** The light and what it found, as the user sees it in its panel. */
async function readLight(page: Page, picture: string): Promise<Record<string, unknown>> {
  const light = page.getByTestId('print-check');
  // The check runs after every revision; give the last one time to land.
  await expect(light).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const status = await light.getAttribute('data-status');
  const text = await light.textContent();
  await light.click();
  const panel = page.getByTestId('print-check-panel');
  await expect(panel).toBeVisible();
  const findings = [];
  for (const finding of await panel.getByTestId('check-finding').all()) {
    findings.push({ kind: await finding.getAttribute('data-kind'), severity: await finding.getAttribute('data-severity'), text: (await finding.textContent())?.trim() });
  }
  await page.screenshot({ path: test.info().outputPath(picture) });
  await page.keyboard.press('Escape');
  return { status, text, findings };
}

/** Asks for the orientation proposal and lays the part the recommended way. */
async function orient(page: Page): Promise<Record<string, unknown>> {
  await page.getByTestId('print-check').click();
  const section = page.getByTestId('orientation');
  await section.getByTestId('orientation-propose').click();
  const options = section.getByTestId('orientation-option');
  await expect(options.first()).toBeVisible({ timeout: 30_000 });
  const proposal = [];
  for (const option of await options.all()) {
    proposal.push({ down: await option.getAttribute('data-down'), text: (await option.textContent())?.trim() });
  }
  await page.screenshot({ path: test.info().outputPath('orientation.png') });
  const apply = options.first().getByTestId('orientation-apply');
  let applied = false;
  if (await apply.isEnabled()) {
    await apply.click();
    applied = true;
    await page.waitForTimeout(1500);
  }
  const current = await section.getByTestId('orientation-current').textContent().catch(() => null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath('oriented.png') });
  return { proposal, applied, current };
}

/** Scans the view for a hole of the drawn diameter, then sizes it with the fit assistant. */
async function fitHole(page: Page, fit: NonNullable<Part['fit']>): Promise<Record<string, unknown>> {
  await page.keyboard.press('0');
  await page.waitForTimeout(1000);
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  const field = page.getByTestId('dimension-field');
  const seen = new Set<string>();
  let found: string | null = null;
  for (let y = 0.2; y <= 0.8 && !found; y += 0.03) {
    for (let x = 0.2; x <= 0.8 && !found; x += 0.02) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      if ((await page.getByTestId('fit-open').count()) === 0) continue;
      const label = (await field.textContent({ timeout: 300 }).catch(() => null)) ?? '';
      const value = Number((await field.getByRole('textbox').inputValue({ timeout: 300 }).catch(() => '')).replace(',', '.'));
      const diameter = /radius/i.test(label) ? value * 2 : value;
      const name = (await page.getByTestId('selected-face').textContent({ timeout: 300 }).catch(() => null)) ?? '?';
      seen.add(`${name} Ø${diameter}`);
      if (diameter > fit.mating - 0.1 && diameter < fit.mating + 1.5) found = name;
    }
  }
  const result: Record<string, unknown> = { wanted: fit, seen: [...seen] };
  if (!found) return { ...result, failure: 'no hole of that size found by clicking the view' };
  result.face = found;
  await page.getByTestId('fit-open').click();
  const panel = page.getByTestId('fit-panel');
  const mating = panel.getByTestId('fit-mating').getByRole('textbox');
  result.matingSuggested = await mating.inputValue();
  await mating.fill(String(fit.mating));
  await panel.getByTestId(`fit-${fit.kind}`).click();
  const status = panel.getByTestId('fit-status');
  await expect(status).not.toHaveAttribute('data-mode', 'probing', { timeout: 15_000 }).catch(() => undefined);
  result.target = await panel.getByTestId('fit-target').textContent();
  result.mode = await status.getAttribute('data-mode');
  result.status = await status.textContent();
  await page.screenshot({ path: test.info().outputPath('fit.png') });
  const apply = panel.getByTestId('fit-apply');
  if (!(await apply.isEnabled())) return { ...result, applied: false };
  const answersBefore = await page.getByTestId('assistant-text').count();
  await apply.click();
  if (result.mode === 'assistant') {
    await waitForTurn(page);
    result.answer = (await page.getByTestId('assistant-text').allTextContents()).slice(answersBefore).join('\n---\n').slice(0, 3000);
  } else {
    await page.waitForTimeout(3000);
  }
  result.applied = true;
  result.notice = await page.getByTestId('notice').textContent();
  await page.screenshot({ path: test.info().outputPath('fitted.png') });
  return result;
}

/** Exports the 3MF the way the user would; a red light asks first, and the run goes ahead. */
async function export3mf(app: ElectronApplication, page: Page, target: string): Promise<Record<string, unknown>> {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
  }, target);
  await page.getByTestId('export').click();
  await page.getByTestId('export-3mf').click();
  const confirm = page.getByTestId('export-confirm');
  let asked: string | null = null;
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
    asked = await confirm.textContent();
    await confirm.getByTestId('export-confirm-go').click();
  }
  await expect(page.getByTestId('notice')).toHaveText(`Saved as ${basename(target)}`, { timeout: 60_000 });
  return { asked, notice: await page.getByTestId('notice').textContent(), bytes: readFileSync(target).length };
}

/** Slices the export with Bambu Studio's command line, no window, H2S 0.4 · 0.20 mm Standard · Bambu PLA Basic. */
async function slice(file: string, out: string): Promise<Record<string, unknown>> {
  if (!existsSync(BAMBU_STUDIO)) return { skipped: `no Bambu Studio at ${BAMBU_STUDIO}` };
  const profiles = join(dirname(BAMBU_STUDIO), 'resources', 'profiles', 'BBL');
  const settings = [join(profiles, 'machine', 'Bambu Lab H2S 0.4 nozzle.json'), join(profiles, 'process', '0.20mm Standard @BBL H2S.json')].join(';');
  const filament = join(profiles, 'filament', 'Bambu PLA Basic @BBL H2S.json');
  mkdirSync(out, { recursive: true });
  const plain = await runSlicer(['--slice', '0', '--load-settings', settings, '--load-filaments', filament, '--outputdir', out, file], out);
  // Once more in each of Bambu's support modes, at its default threshold: does the slicer agree with
  // the light? The modes disagree (M7f, 2026-11-05): tree supports prop up every flat bridge, even a
  // 4.5 mm slot; normal supports that leave bridges alone prop up the tops of small round holes and a
  // 1 mm groove ceiling. Both print fine without support, so the slicer "needs support" only where
  // both modes put some (a hook laid on its side: both do).
  const standard = JSON.parse(readFileSync(join(profiles, 'process', '0.20mm Standard @BBL H2S.json'), 'utf8')) as Record<string, unknown>;
  const machine = join(profiles, 'machine', 'Bambu Lab H2S 0.4 nozzle.json');
  const withSupport = async (mode: string, settings: Record<string, string>) => {
    const modeOut = `${out}-${mode}`;
    mkdirSync(modeOut, { recursive: true });
    const processFile = join(modeOut, 'process.json');
    writeFileSync(processFile, JSON.stringify({ ...standard, name: `0.20mm Standard ${mode} support check`, enable_support: '1', ...settings }));
    return runSlicer(['--slice', '0', '--load-settings', [machine, processFile].join(';'), '--load-filaments', filament, '--outputdir', modeOut, file], modeOut);
  };
  const tree = await withSupport('tree', { support_type: 'tree(auto)' });
  const normal = await withSupport('normal', { support_type: 'normal(auto)', bridge_no_support: '1' });
  const treeLines = Number(tree.supportLines ?? 0);
  const normalLines = Number(normal.supportLines ?? 0);
  return { ...plain, supportTree: treeLines, supportNormal: normalLines, slicerNeedsSupport: treeLines > 0 && normalLines > 0, supportFailure: tree.failure ?? normal.failure };
}

async function runSlicer(args: string[], out: string): Promise<Record<string, unknown>> {
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn(BAMBU_STUDIO, args, { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => child.kill(), 180_000);
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  const resultFile = join(out, 'result.json');
  if (!existsSync(resultFile)) return { code, failure: 'no result.json' };
  const result = JSON.parse(readFileSync(resultFile, 'utf8')) as {
    error_string?: string;
    sliced_plates?: { total_predication?: number; warning_message?: string; objects?: { name: string; bbox: Record<string, number> }[] }[];
  };
  const plate = result.sliced_plates?.[0];
  const gcode = readdirSync(out).find((name) => name.endsWith('.gcode'));
  const lines = gcode ? readFileSync(join(out, gcode), 'utf8').split('\n') : [];
  return {
    code,
    message: result.error_string,
    minutes: plate?.total_predication ? Math.round(plate.total_predication / 60) : null,
    warning: plate?.warning_message,
    objects: plate?.objects?.map((object) => ({ name: object.name, bbox: object.bbox })),
    layers: lines.filter((line) => line.startsWith('; CHANGE_LAYER')).length,
    supportLines: lines.filter((line) => line.startsWith('; FEATURE: Support')).length,
  };
}

/** Lays the part the way of a further proposal (not as designed), exports it turned and slices it. */
async function turnedExport(app: ElectronApplication, page: Page, id: string): Promise<Record<string, unknown>> {
  await page.getByTestId('print-check').click();
  const section = page.getByTestId('orientation');
  await section.getByTestId('orientation-propose').click();
  const options = section.getByTestId('orientation-option');
  await expect(options.first()).toBeVisible({ timeout: 30_000 });
  let chosen: string | null = null;
  // Prefer lying on a side: turned about X or Y, the slicer's height shows the turn even for parts that look the same upside down.
  const all = await options.all();
  const sideways = [];
  for (const option of all) if (!(await option.getAttribute('data-down'))?.startsWith('0,0,')) sideways.push(option);
  for (const option of [...sideways, ...all]) {
    const down = await option.getAttribute('data-down');
    const apply = option.getByTestId('orientation-apply');
    if (down !== '0,0,-1' && (await apply.isEnabled())) {
      chosen = (await option.textContent())?.trim() ?? down;
      await apply.click();
      break;
    }
  }
  if (!chosen) return { failure: 'no other orientation to apply' };
  await page.waitForTimeout(1500);
  const current = await section.getByTestId('orientation-current').textContent();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath('turned.png') });
  const file = test.info().outputPath(`${id}-turned.3mf`);
  const exported = await export3mf(app, page, file);
  const sliced = await slice(file, test.info().outputPath('sliced-turned'));
  return { chosen, current, exported, sliced };
}

for (const part of SELECTED) {
  test(`practice M7: ${part.id}`, async () => {
    test.setTimeout(45 * 60 * 1000);
    const work = mkdtempSync(join(tmpdir(), `partbuddy-practice-m7-${part.id}-`));
    const launched = await launchApp({
      isolated: false,
      work,
      env: { SOLIDCRAFT_CONTROL_DIR: join(work, 'control'), PARTBUDDY_SOLIDCRAFT_PORT: String(7930 + SELECTED.indexOf(part)), PARTBUDDY_PROJECTS_DIR: join(work, 'projects') },
    });
    const { app, page } = launched;
    const report: Record<string, unknown> = { part: part.id, request: part.request };
    const step = async (name: string, run: () => Promise<unknown>) => {
      try {
        report[name] = await run();
      } catch (error) {
        report[name] = { failure: (error as Error).message.slice(0, 1000) };
        await page.screenshot({ path: test.info().outputPath(`failed-${name}.png`) }).catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
      }
    };
    try {
      await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
      await expect(page.getByTestId('agent-status')).toContainText('Claude Code', { timeout: 30_000 });
      await step('printer', () => setPrinter(page));
      await step('build', () => converse(page, part.request, part.answer));
      report.mesh = await page.getByTestId('mesh-summary').textContent();
      await page.keyboard.press('0');
      await page.waitForTimeout(800);
      await page.screenshot({ path: test.info().outputPath('built.png') });
      await step('light', () => readLight(page, 'light.png'));
      if (part.fit) {
        const fit = part.fit;
        await step('fit', () => fitHole(page, fit));
        await step('lightAfterFit', () => readLight(page, 'light-after-fit.png'));
      }
      await step('orientation', () => orient(page));
      await step('lightOriented', () => readLight(page, 'light-oriented.png'));
      const file = test.info().outputPath(`${part.id}.3mf`);
      await step('export', () => export3mf(app, page, file));
      if (existsSync(file)) await step('slice', () => slice(file, test.info().outputPath('sliced')));
      await step('turned', () => turnedExport(app, page, part.id));
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
