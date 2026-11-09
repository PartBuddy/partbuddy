import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type ElectronApplication, type Page } from '@playwright/test';

import { launchApp, type LaunchedApp } from './launch';

// UI/UX audit (2026-11-09), measured values: start time, reaction time of overlays, fps while
// orbiting, React commits while an answer streams, and memory over a long working session
// (PARTBUDDY_AUDIT_SOAK_MIN minutes, default 60). Headless SolidCraft, fake Claude. The window runs
// off screen with software WebGL (SwiftShader) like every test, so fps is a floor, not the GPU value.
const folder = process.env.PARTBUDDY_AUDIT;
test.skip(!folder || process.env.PARTBUDDY_E2E_SOLIDCRAFT !== '1', 'audit measurements; set PARTBUDDY_AUDIT and PARTBUDDY_E2E_SOLIDCRAFT=1');

const SOAK_MIN = Number(process.env.PARTBUDDY_AUDIT_SOAK_MIN ?? '60');
const fakeClaude = JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]);

/**
 * Installed before React loads: counts commits and which components rendered in them. Only the
 * parts of the tree that this commit touched are walked (as React DevTools does): a subtree React
 * skipped keeps its old fibers, whose "performed work" flag is left over from an earlier commit.
 * The first audit walked the whole tree and counted those, so every commit looked like a full
 * render (P-01).
 */
const COMMIT_COUNTER = `(() => {
  const counts = {}; let commits = 0;
  const visit = (fiber) => {
    for (let node = fiber; node; node = node.sibling) {
      const fresh = node.alternate === null;
      if ((node.tag === 0 || node.tag === 1 || node.tag === 11 || node.tag === 14 || node.tag === 15) && (fresh || (node.flags & 1))) {
        const name = node.type?.displayName || node.type?.name || node.type?.render?.name || 'anonymous';
        counts[name] = (counts[name] || 0) + 1;
      }
      if (node.child && (fresh || node.child !== node.alternate.child)) visit(node.child);
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(), inject() { return 1; }, checkDCE() {},
    onCommitFiberRoot(_id, root) { commits += 1; try { visit(root.current.child); } catch {} },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
  window.__auditCommits = { reset() { commits = 0; for (const k in counts) delete counts[k]; }, read() { return { commits, counts: { ...counts } }; } };
})();`;

async function launch(work: string, port: string): Promise<{ launched: LaunchedApp; started: number }> {
  const started = Date.now();
  const launched = await launchApp({
    isolated: false,
    work,
    args: ['--js-flags=--expose-gc'],
    env: {
      SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
      PARTBUDDY_SOLIDCRAFT_PORT: port,
      PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
      PARTBUDDY_START_PAGE: '1',
      PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
      PARTBUDDY_CLAUDE_COMMAND: fakeClaude,
    },
  });
  return { launched, started };
}

/** Time from the press of a control to the first painted frame with `selector` in the page. */
async function reaction(page: Page, trigger: string, selector: string): Promise<number> {
  await page.evaluate((target) => {
    const state = window as unknown as { __reaction?: Promise<number> };
    state.__reaction = new Promise<number>((done) => {
      document.addEventListener(
        'pointerdown',
        () => {
          const start = performance.now();
          const look = () => {
            if (document.querySelector(target)) requestAnimationFrame(() => done(performance.now() - start));
            else requestAnimationFrame(look);
          };
          look();
        },
        { once: true, capture: true },
      );
    });
  }, selector);
  await page.getByTestId(trigger).click();
  const ms = await page.evaluate(() => (window as unknown as { __reaction: Promise<number> }).__reaction);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return Math.round(ms);
}

/** Frames painted while the mouse orbits the view for `seconds`. */
async function orbit(page: Page, seconds: number): Promise<{ fps: number; p95FrameMs: number }> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('viewport not visible');
  await page.evaluate(() => {
    const state = window as unknown as { __frames: number[]; __counting: boolean };
    state.__frames = [];
    state.__counting = true;
    let last = performance.now();
    const tick = (now: number) => {
      state.__frames.push(now - last);
      last = now;
      if (state.__counting) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const end = Date.now() + seconds * 1000;
  let angle = 0;
  while (Date.now() < end) {
    angle += 0.15;
    await page.mouse.move(cx + Math.cos(angle) * box.width * 0.25, cy + Math.sin(angle) * box.height * 0.2);
  }
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const state = window as unknown as { __frames: number[]; __counting: boolean };
    state.__counting = false;
    return state.__frames.slice(2);
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((sum, ms) => sum + ms, 0);
  return { fps: Math.round((frames.length / total) * 1000 * 10) / 10, p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0) };
}

async function memory(app: ElectronApplication, page: Page): Promise<Record<string, number>> {
  const heap = await page.evaluate(() => {
    (globalThis as unknown as { gc?: () => void }).gc?.();
    return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  });
  const metrics = await app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics().map((metric) => ({ type: metric.type, kb: metric.memory.workingSetSize })));
  const byType: Record<string, number> = { rendererHeapMB: Math.round(heap / 1048576) };
  for (const metric of metrics) byType[`${metric.type}MB`] = Math.round(((byType[`${metric.type}MB`] ?? 0) + metric.kb / 1024) * 10) / 10;
  return byType;
}

test('audit: start, reaction, orbit, commits, memory', async () => {
  test.setTimeout((SOAK_MIN + 15) * 60_000);
  const dir = join(folder ?? '', 'performance');
  mkdirSync(dir, { recursive: true });
  const result: Record<string, unknown> = {};
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-audit-perf-'));
  let launched: LaunchedApp | null = null;
  try {
    // Start time: cold (fresh profile) and warm (same profile again).
    for (const round of ['cold', 'warm']) {
      const { launched: run, started } = await launch(work, '7946');
      launched = run;
      await expect(run.page.getByTestId('title-bar')).toBeVisible({ timeout: 60_000 });
      const shell = Date.now() - started;
      await expect(run.page.getByTestId('home-page')).toBeVisible({ timeout: 60_000 });
      const home = Date.now() - started;
      await expect(run.page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
      result[`start-${round}`] = { titleBarMs: shell, homeMs: home, solidcraftReadyMs: Date.now() - started };
      if (round === 'cold') {
        await run.app.close();
        launched = null;
      }
    }
    if (!launched) throw new Error('no app');
    const { app, page } = launched;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
    await app.context().addInitScript(COMMIT_COUNTER);
    await page.reload();
    await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 90_000 });
    const opened = Date.now();
    await page.getByTestId('home-page').locator('[data-template="housing"]').click();
    await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 90_000 });
    await expect(page.getByTestId('mesh-summary')).not.toBeEmpty({ timeout: 60_000 });
    result.templateOpenMs = Date.now() - opened;
    await page.waitForTimeout(2000);
    await page.getByTestId('dock-hint-ok').click().catch(() => undefined);

    result.reactionMs = {
      projectMenu: await reaction(page, 'project-menu', '[role="menu"]'),
      settings: await reaction(page, 'settings', '[data-testid="settings-dialog"]'),
      materialMenu: await reaction(page, 'material-chip', '[role="menu"]'),
      agentMenu: await reaction(page, 'agent-status', '[data-testid="agent-menu"]'),
      exportMenu: await reaction(page, 'export', '[role="menu"]'),
      displayMenu: await reaction(page, 'display-mode', '[role="menu"]'),
      sectionPanel: await reaction(page, 'section', '[data-testid="section-panel"]'),
    };
    await page.getByTestId('section').click().catch(() => undefined);
    result.orbit = await orbit(page, 4);
    await page.getByTestId('explode').click();
    await page.getByTestId('explode-amount').fill('0.8').catch(() => undefined);
    result.orbitExploded = await orbit(page, 4);
    await page.getByTestId('explode').click();

    // Commits while the slow answer streams (about 4 s of words).
    await page.evaluate(() => (window as unknown as { __auditCommits: { reset(): void } }).__auditCommits.reset());
    await page.getByTestId('composer').getByRole('textbox').first().fill('Take your time');
    await page.getByTestId('composer-send').click();
    await expect(page.getByTestId('composer-stop')).toBeHidden({ timeout: 60_000 });
    const commits = await page.evaluate(() => (window as unknown as { __auditCommits: { read(): { commits: number; counts: Record<string, number> } } }).__auditCommits.read());
    result.streamingCommits = {
      commits: commits.commits,
      top: Object.entries(commits.counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25),
    };
    // The same while the user only orbits: renders that the view should not cause.
    await page.evaluate(() => (window as unknown as { __auditCommits: { reset(): void } }).__auditCommits.reset());
    await orbit(page, 3);
    const orbitCommits = await page.evaluate(() => (window as unknown as { __auditCommits: { read(): { commits: number; counts: Record<string, number> } } }).__auditCommits.read());
    result.orbitCommits = { commits: orbitCommits.commits, top: Object.entries(orbitCommits.counts).sort((a, b) => b[1] - a[1]).slice(0, 15) };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(result, null, 2));

    // A working session: menus, selection, orbit, view tools, chat, settings, project switches.
    const samples: Record<string, number | string>[] = [{ minute: 0, ...(await memory(app, page)) }];
    const end = Date.now() + SOAK_MIN * 60_000;
    let loop = 0;
    let nextSample = Date.now() + 60_000;
    while (Date.now() < end) {
      loop += 1;
      try {
        await orbit(page, 1);
        for (const id of ['project-menu', 'material-chip', 'display-mode', 'export']) {
          await page.getByTestId(id).click();
          await page.waitForTimeout(150);
          await page.keyboard.press('Escape');
        }
        for (const id of ['section', 'explode', 'dimensions']) {
          await page.getByTestId(id).click();
          await page.waitForTimeout(400);
          await page.getByTestId(id).click();
        }
        const box = await page.getByTestId('viewport').boundingBox();
        if (box) await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.getByTestId('settings').click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        if (loop % 5 === 0) {
          await page.getByTestId('composer').getByRole('textbox').first().fill('Take your time');
          await page.getByTestId('composer-send').click();
          await expect(page.getByTestId('composer-stop')).toBeHidden({ timeout: 60_000 });
        }
        if (loop % 12 === 0) {
          await page.getByTestId('home-button').click();
          await page.getByTestId('home-tile').first().click();
          await expect(page.getByTestId('home-page')).toHaveCount(0, { timeout: 90_000 });
          await page.waitForTimeout(1500);
        }
      } catch (error) {
        samples.push({ minute: Math.round((SOAK_MIN * 60_000 - (end - Date.now())) / 60_000), error: (error as Error).message.split('\n')[0] ?? '' });
        await page.keyboard.press('Escape').catch(() => undefined);
      }
      if (Date.now() >= nextSample) {
        nextSample += 60_000;
        samples.push({ minute: Math.round((SOAK_MIN * 60_000 - (end - Date.now())) / 60_000), loop, ...(await memory(app, page)) });
        writeFileSync(join(dir, 'memory.json'), JSON.stringify(samples, null, 2));
      }
    }
    result.soak = { minutes: SOAK_MIN, loops: loop, first: samples[0], last: samples[samples.length - 1] };
    writeFileSync(join(dir, 'memory.json'), JSON.stringify(samples, null, 2));
    writeFileSync(join(dir, 'report.json'), JSON.stringify(result, null, 2));
  } finally {
    await launched?.close().catch(() => undefined);
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
