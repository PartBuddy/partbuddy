import { expect, test, type Page } from '@playwright/test';

import { launchApp } from './launch';

// Pictures of the 3D view (UI upgrade, view look): the wall holder built
// in the headless SolidCraft, the same views light and dark. Opt in with PARTBUDDY_LOOK_SHOTS set
// to the folder the pictures go to; needs SolidCraft.
const folder = process.env.PARTBUDDY_LOOK_SHOTS;
test.skip(!folder, 'needs SolidCraft; set PARTBUDDY_LOOK_SHOTS to a folder');

async function shoot(page: Page, name: string): Promise<void> {
  const { join } = await import('node:path');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(folder ?? '', `${name}-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(300);
}

test('the view of the wall holder, light and dark', async () => {
  test.setTimeout(240_000);
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = mkdtempSync(join(tmpdir(), 'partbuddy-look-'));
  const env = {
    SOLIDCRAFT_CONTROL_DIR: join(work, 'control'),
    PARTBUDDY_SOLIDCRAFT_PORT: '7907',
    PARTBUDDY_PROJECTS_DIR: join(work, 'projects'),
    PARTBUDDY_KEYRING_SERVICE: 'PartBuddy-e2e',
    PARTBUDDY_CLAUDE_COMMAND: JSON.stringify([process.execPath, join(__dirname, '..', 'test', 'fakeClaude.mjs')]),
  };
  const launched = await launchApp({ isolated: false, work, env });
  const { page } = launched;
  try {
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-engine', 'headless', { timeout: 30_000 });
    await page.getByRole('textbox', { name: 'Message to the assistant' }).fill('Build the wall holder');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('The wall holder is built.')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await shoot(page, '1-built');

    // A face of the wall plate, picked in the middle of the view.
    const view = await page.getByTestId('viewport').boundingBox();
    if (view) await page.mouse.click(view.x + view.width * 0.42, view.y + view.height * 0.45);
    await page.waitForTimeout(600);
    await shoot(page, '2-face');
    await page.keyboard.press('Escape');

    await page.getByTestId('dimensions').click();
    await page.waitForTimeout(800);
    await shoot(page, '3-dimensions');
    await page.getByTestId('dimensions').click();

    await page.getByTestId('overhang').click();
    await page.waitForTimeout(600);
    await shoot(page, '5-overhang');
    await page.getByTestId('overhang').click();

    await page.keyboard.press('1');
    await page.keyboard.press('5');
    await page.waitForTimeout(1200);
    await shoot(page, '4-front-ortho');
  } finally {
    await launched.close();
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
});
