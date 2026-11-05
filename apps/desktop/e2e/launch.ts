import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export const appDir = resolve(__dirname, '..');

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
  } = {},
): Promise<LaunchedApp> {
  const isolated = options.isolated ?? true;
  const work = options.work ?? mkdtempSync(join(tmpdir(), 'partbuddy-e2e-'));
  const controlDir = join(work, 'control');
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PARTBUDDY_CACHE_DIR: join(work, 'cache'),
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
  const app = await electron.launch({
    args: [appDir, '--lang=en-US', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${join(work, 'profile')}`],
    cwd: appDir,
    env,
    colorScheme: options.colorScheme === undefined ? 'light' : options.colorScheme,
  });
  const page = await app.firstWindow();
  return {
    app,
    page,
    controlDir,
    async close() {
      await app.close();
      if (!options.work) rmSync(work, { recursive: true, force: true });
    },
  };
}
