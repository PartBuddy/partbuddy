import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { ControlClient } from '../src/main/solidcraft/controlClient';
import { countViewportPixels } from './pixels';
import { launchApp } from './launch';

// Issue #14: a scripted multi-step design is followed in the view step by step, with measured
// latency. Runs the synthetic cable clip (tools/fixtures) in an own SolidCraft window (driven over
// its control channel, so PARTBUDDY_SOLIDCRAFT_WINDOW=1); opt in
// with PARTBUDDY_E2E_SOLIDCRAFT=1.
test.skip(process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'needs SolidCraft; set PARTBUDDY_E2E_SOLIDCRAFT=1');
test.skip(process.env.PARTBUDDY_E2E_SOLIDCRAFT_WINDOW !== '1', 'opens the SolidCraft window, which cannot be kept off screen; set PARTBUDDY_E2E_SOLIDCRAFT_WINDOW=1');

interface StepTiming {
  step: number;
  command: string;
  revision: number;
  /** SolidCraft's reply to the command (rebuild included). */
  engineMs: number;
  /** From sending the command until PartBuddy shows that revision. */
  visibleMs: number;
  faces: string;
}

test('a scripted design is followed step by step in the view', async () => {
  test.setTimeout(600_000);
  const script = JSON.parse(readFileSync(resolve(__dirname, '../../../tools/fixtures/cable-clip.script.json'), 'utf8')) as {
    commands: { command: string; params: Record<string, unknown> }[];
  };
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-live-'));
  const renderDir = mkdtempSync(join(tmpdir(), 'partbuddy-render-'));
  const port = '7885';
  const launched = await launchApp({ isolated: false, env: { SOLIDCRAFT_CONTROL_DIR: controlDir, PARTBUDDY_SOLIDCRAFT_PORT: port, PARTBUDDY_SOLIDCRAFT_WINDOW: '1' } });
  let client: ControlClient | null = null;
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/^SolidCraft( \S+)?$/, { timeout: 90_000 });
    const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
    client = await ControlClient.open({ port: Number(port), token });

    const timings: StepTiming[] = [];
    for (const [index, step] of script.commands.entries()) {
      const sent = performance.now();
      await client.request('engine.execute', { command: step.command, params: step.params }, 120_000);
      const replied = performance.now();
      const { revision } = await client.request<{ revision: number }>('document.revision');
      // Runs in the renderer; typed loosely because this file is compiled for Node. A string
      // predicate would need 'unsafe-eval', which the app's content security policy refuses.
      await page.waitForFunction(
        (wanted) => {
          const view = globalThis as unknown as { document: { querySelector(selector: string): { dataset: Record<string, string | undefined> } | null } };
          return Number(view.document.querySelector('[data-testid=viewer]')?.dataset.revision ?? -1) >= wanted;
        },
        revision,
        { polling: 'raf', timeout: 60_000 },
      );
      const visible = performance.now();
      const faces = (await page.getByTestId('mesh-summary').textContent({ timeout: 100 }).catch(() => null)) ?? '–';
      timings.push({
        step: index + 1,
        command: step.command,
        revision,
        engineMs: Math.round(replied - sent),
        visibleMs: Math.round(visible - sent),
        faces,
      });
    }
    await expect(page.getByTestId('mesh-summary')).toContainText('41 faces');

    // Fallback check: SolidCraft's own render of the model, without a window.
    const pngPath = join(renderDir, 'render.png');
    const renderStart = performance.now();
    const render = await client.request<Record<string, unknown>>(
      'ui.render',
      { path: pngPath, width: 960, height: 600, allow_paths: [renderDir] },
      60_000,
    );
    const renderMs = Math.round(performance.now() - renderStart);

    const report = { timings, render: { ms: renderMs, bytes: statSync(pngPath).size, renderer: render.renderer } };
    writeFileSync(test.info().outputPath('live-view-latency.json'), JSON.stringify(report, null, 2));
    console.table(timings);
    console.log('ui.render', report.render);
    await page.screenshot({ path: test.info().outputPath('live-view-final.png') });
    writeFileSync(test.info().outputPath('solidcraft-render.png'), readFileSync(pngPath));

    // Geometry steps must reach the view within the small-part budget (< 0.6 s after the step).
    const geometry = timings.filter((t) => t.command.startsWith('solid.'));
    const afterEngine = geometry.map((t) => t.visibleMs - t.engineMs).sort((a, b) => a - b);
    expect(afterEngine[Math.floor(afterEngine.length / 2)]).toBeLessThan(600);
  } finally {
    client?.close();
    await launched.close();
    try {
      const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
      const quit = await ControlClient.open({ port: Number(port), token });
      await quit.request('app.quit', { force: true }, 5000).catch(() => undefined);
      quit.close();
    } catch {
      // Already closed.
    }
    rmSync(controlDir, { recursive: true, force: true });
    rmSync(renderDir, { recursive: true, force: true });
  }
});

// Issue #21: a sketch drawn step by step is visible before it becomes a body, and disappears
// once a feature consumes it (SolidCraft hides it then).
test('a sketch is visible step by step before it becomes a body', async () => {
  test.setTimeout(300_000);
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-sketch-'));
  const port = '7886';
  const launched = await launchApp({ isolated: false, env: { SOLIDCRAFT_CONTROL_DIR: controlDir, PARTBUDDY_SOLIDCRAFT_PORT: port, PARTBUDDY_SOLIDCRAFT_WINDOW: '1' } });
  let client: ControlClient | null = null;
  try {
    const { page } = launched;
    await expect(page.getByTestId('connection-status')).toHaveText(/^SolidCraft( \S+)?$/, { timeout: 90_000 });
    const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
    client = await ControlClient.open({ port: Number(port), token });
    const steps: { command: string; params: Record<string, unknown> }[] = [
      { command: 'sketch.create', params: { plane: 'XY', name: 'Plate' } },
      { command: 'sketch.rectangle.rounded', params: { p0: [0, 0], p1: [40, 24], radius: 4 } },
      { command: 'sketch.circle.center', params: { center: [8, 12], radius: 2.5 } },
      { command: 'sketch.circle.center', params: { center: [32, 12], radius: 2.5 } },
      { command: 'sketch.line', params: { points: [[20, -4], [20, 28]], construction: true } },
    ];
    const timings: { command: string; revision: number; engineMs: number; visibleMs: number; summary: string }[] = [];
    for (const step of steps) {
      const sent = performance.now();
      await client.request('engine.execute', step, 60_000);
      const replied = performance.now();
      const { revision } = await client.request<{ revision: number }>('document.revision');
      await waitForRevision(page, revision);
      const visible = performance.now();
      timings.push({
        command: step.command,
        revision,
        engineMs: Math.round(replied - sent),
        visibleMs: Math.round(visible - sent),
        summary: (await page.getByTestId('sketch-summary').textContent()) ?? '–',
      });
    }
    console.table(timings);
    await expect(page.getByTestId('viewer')).toHaveAttribute('data-sketches', '1');
    await expect(page.getByTestId('sketch-summary')).toHaveText('1 sketch · editing Plate');
    await expect(page.getByTestId('live-changes')).toContainText('sketch curve');
    // The camera framed the sketch from above the grid, not from below (#21 found a sign bug).
    expect(await countViewportPixels(page, '--cs-viewer-sketch')).toBeGreaterThan(200);
    await page.screenshot({ path: test.info().outputPath('sketch-live.png') });
    writeFileSync(test.info().outputPath('sketch-latency.json'), JSON.stringify(timings, null, 2));
    // Every sketch step reached the view within the small-part budget after SolidCraft's reply.
    for (const t of timings) expect(t.visibleMs - t.engineMs, t.command).toBeLessThan(600);

    await client.request('engine.execute', { command: 'sketch.finish', params: {} });
    await client.request('engine.execute', { command: 'solid.extrude', params: { sketch: 'Plate', distance: '4 mm' } });
    const { revision } = await client.request<{ revision: number }>('document.revision');
    await waitForRevision(page, revision);
    await expect(page.getByTestId('mesh-summary')).toContainText('1 body');
    await expect(page.getByTestId('viewer')).toHaveAttribute('data-sketches', '0');
    await page.screenshot({ path: test.info().outputPath('sketch-extruded.png') });
  } finally {
    client?.close();
    await launched.close();
    await quitSolidCraft(controlDir, port);
    rmSync(controlDir, { recursive: true, force: true });
  }
});

async function waitForRevision(page: Page, revision: number): Promise<void> {
  // Runs in the renderer; a string predicate would need 'unsafe-eval', which the CSP refuses.
  await page.waitForFunction(
    (wanted) => {
      const view = globalThis as unknown as { document: { querySelector(selector: string): { dataset: Record<string, string | undefined> } | null } };
      return Number(view.document.querySelector('[data-testid=viewer]')?.dataset.revision ?? -1) >= wanted;
    },
    revision,
    { polling: 'raf', timeout: 60_000 },
  );
}

async function quitSolidCraft(controlDir: string, port: string): Promise<void> {
  try {
    const token = readFileSync(join(controlDir, `${port}.token`), 'utf8').trim();
    const quit = await ControlClient.open({ port: Number(port), token });
    await quit.request('app.quit', { force: true }, 5000).catch(() => undefined);
    quit.close();
  } catch {
    // Already closed.
  }
}

