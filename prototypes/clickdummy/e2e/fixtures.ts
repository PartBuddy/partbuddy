import { test as base, expect, type Page } from '@playwright/test';

/** Collects console errors and uncaught exceptions; every test asserts there are none. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await use(errors);
  },
});

export { expect };

/** Opens the prototype and waits until the mirrored model is rendered. */
export async function openStudio(page: Page, query = 'theme=light&lang=en') {
  await page.goto(`/?${query}`);
  await expect(page.getByText(/41 (faces|Flächen)/)).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  // Two animation frames after load so the first WebGL frame is on screen.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}
