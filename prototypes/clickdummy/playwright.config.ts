import { defineConfig, devices } from '@playwright/test';

const port = 5180;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // Headless Chromium renders WebGL in software only with SwiftShader enabled.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'flows',
      testMatch: 'flows.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'screens',
      testMatch: 'screens.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
