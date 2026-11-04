import { fileURLToPath } from 'node:url';

import { expect, openStudio, test } from './fixtures';

const screensDir = fileURLToPath(new URL('../../../docs/screens/', import.meta.url));

const sizes = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

for (const size of sizes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`main view ${size.width} ${theme}`, async ({ page, consoleErrors }) => {
      await page.setViewportSize(size);
      await openStudio(page, `theme=${theme}&lang=en`);

      const viewer = page.locator('canvas').first();
      const box = await viewer.boundingBox();
      if (!box) throw new Error('3D view has no size');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.getByRole('region', { name: 'Selected face' }).getByRole('button', { name: 'Add note' }).click();
      await page.getByRole('textbox', { name: 'Note' }).fill('Round this edge with R2 instead of R1');
      await page.getByRole('dialog').getByRole('button', { name: 'Add note' }).click();
      await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9);

      await page.screenshot({ path: `${screensDir}main-${size.width}-${theme}.png` });
      expect(consoleErrors).toEqual([]);
    });
  }
}

test('main view 1440 light in German', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStudio(page, 'theme=light&lang=de');
  await page.screenshot({ path: `${screensDir}main-1440-light-de.png` });
  expect(consoleErrors).toEqual([]);
});
