import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, test, type ElectronApplication, type Page } from '@playwright/test';

export const appDir = resolve(__dirname, '..');

// The runner's service session has no mouse, so `@media (hover: hover)` is false there and nothing shown
// on hover ever appears (the eye of a body in the structure). Tests always run as on a PC with a mouse.
const HOVER = '--blink-settings=primaryHoverType=2,availableHoverTypes=2';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  controlDir: string;
  close(): Promise<void>;
}

/**
 * Starts the built app with its own control and cache folders, English UI and software WebGL
 * (SwiftShader), so the test sees only the SolidCraft it starts itself.
 */
export async function launchApp(
  options: {
    env?: Record<string, string>;
    isolated?: boolean;
    /** Reuse this work folder (profile, cache) and keep it on close. */
    work?: string;
    /**
     * Playwright emulates `prefers-color-scheme: light` by default, which hides the app's own
     * colour theme (`nativeTheme.themeSource`). `null` turns the emulation off.
     */
    colorScheme?: 'light' | 'dark' | null;
    /** More Chromium switches, e.g. `--force-device-scale-factor=1.5` for Windows scaling. */
    args?: string[];
  } = {},
): Promise<LaunchedApp> {
  const isolated = options.isolated ?? true;
  const work = options.work ?? mkdtempSync(join(tmpdir(), 'partbuddy-e2e-'));
  const controlDir = join(work, 'control');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PARTBUDDY_CACHE_DIR: join(work, 'cache'),
    // The log goes to the test's folder, never into a real profile.
    PARTBUDDY_LOG_FILE: join(work, 'partbuddy.log'),
    // Projects (B2) always go to the test's own folder, never into the user's documents.
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    // Most tests start in the work area with the last project; the start page tests turn it on (B3).
    PARTBUDDY_START_PAGE: '0',
    // The first-start setup (B9) only where a test asks for it.
    PARTBUDDY_FIRST_START: '0',
    // Beside all displays, without focus or taskbar button: tests never disturb the developer.
    // PARTBUDDY_WINDOW_DISPLAY=leftmost shows the window on purpose.
    PARTBUDDY_WINDOW_DISPLAY: process.env.PARTBUDDY_WINDOW_DISPLAY === 'leftmost' ? 'leftmost' : 'offscreen',
    ...(isolated
      ? {
          SOLIDCRAFT_CONTROL_DIR: controlDir,
          PARTBUDDY_SOLIDCRAFT_AUTOSTART: '0',
          // An existing file stands in for the SolidCraft executable; it is never started.
          PARTBUDDY_SOLIDCRAFT_EXE: process.execPath,
          // A fake Claude Code instead of the user's own program and subscription.
          // Own credential-store service: the user's ChatGPT sign-in stays invisible to tests.
          PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
          PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(appDir, 'test', 'fakeClaude.mjs')]),
        }
      : {}),
    ...options.env,
  };
  // The test doubles of Claude Code build in an empty design at once; a real assistant keeps "a plan with Go before a new part" (questions.ts).
  if (env.PARTBUDDY_CLAUDE_COMMAND && env.PARTBUDDY_PLAN_FIRST === undefined) env.PARTBUDDY_PLAN_FIRST = '0';
  // Nor do they review before "done" (review.ts), unless a test turns it on.
  if (env.PARTBUDDY_CLAUDE_COMMAND && env.PARTBUDDY_FINAL_REVIEW === undefined) env.PARTBUDDY_FINAL_REVIEW = '0';
  const app = await electron.launch({
    args: [appDir, '--lang=en-US', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${join(work, 'profile')}`, HOVER, ...(options.args ?? [])],
    cwd: appDir,
    env,
    colorScheme: options.colorScheme === undefined ? 'light' : options.colorScheme,
  });
  const page = await app.firstWindow();
  // The runner's desktop is 1024 × 768 and Windows shrinks the window to it: PARTBUDDY_E2E_WINDOW=1024x768 shows a test as it runs there.
  const size = process.env.PARTBUDDY_E2E_WINDOW?.split('x').map(Number);
  if (size?.length === 2) await app.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0]?.setSize(width ?? 0, height ?? 0), size);
  return {
    app,
    page,
    controlDir,
    async close() {
      await app.close();
      // The app's log goes to the test's results: a red run on the runner shows what the app did.
      try {
        appendFileSync(test.info().outputPath('partbuddy.log'), readFileSync(join(work, 'partbuddy.log')));
      } catch {
        // No log written, or called outside a test.
      }
      if (!options.work) rmSync(work, { recursive: true, force: true });
    },
  };
}

/**
 * Has the app look for SolidCraft now, as "Look again" does. Through the bridge, not the button:
 * the app often finds a just-started SolidCraft on its own first, the button is then gone, and a
 * click waited 30 s for it (flaky under load, 06.11.2026).
 */
export async function lookAgain(page: Page): Promise<void> {
  await page.evaluate(() => (globalThis as unknown as { partbuddy: { solidcraft: { retry(): Promise<unknown> } } }).partbuddy.solidcraft.retry());
}
