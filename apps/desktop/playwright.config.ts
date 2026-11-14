import { defineConfig } from '@playwright/test';

// Electron end-to-end tests (Playwright's Electron support is experimental). They run against
// the built app in `out/`, so `pnpm build` comes first.
export default defineConfig({
  testDir: 'e2e',
  // Every test starts its own app with its own profile, control folder and fake SolidCraft, so CI can split
  // a file across shards and workers (`--shard`, `--workers`). Locally one worker keeps the load low.
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  // A loaded CI runner renders in software: a parse or a frame can take longer than the default 5 s (13 November 2026).
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'app', testIgnore: /\.contract\.spec\.ts$/ },
    // The real SolidCraft wobbles at times: one more try, and the report still lists the test as flaky.
    { name: 'contract', testMatch: /\.contract\.spec\.ts$/, retries: 1 },
  ],
});
