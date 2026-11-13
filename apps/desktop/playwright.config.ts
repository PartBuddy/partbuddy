import { defineConfig } from '@playwright/test';

// Electron end-to-end tests (Playwright's Electron support is experimental). They run against
// the built app in `out/`, so `pnpm build` comes first.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  // A loaded CI runner renders in software: a parse or a frame can take longer than the default 5 s (13 November 2026).
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
