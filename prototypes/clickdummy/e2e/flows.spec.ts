import AxeBuilder from '@axe-core/playwright';

import { expect, openStudio, test } from './fixtures';

test.describe('main view', () => {
  test('a note can be pinned to a picked face', async ({ page, consoleErrors }) => {
    await openStudio(page);
    const viewer = page.locator('canvas').first();
    const box = await viewer.boundingBox();
    if (!box) throw new Error('3D view has no size');

    // The camera frames the part; the centre of the view lies on the clip block.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const selection = page.getByRole('region', { name: 'Selected face' });
    await expect(selection).toBeVisible();

    await selection.getByRole('button', { name: 'Add note' }).click();
    const dialog = page.getByRole('dialog', { name: 'Note on face' });
    await dialog.getByRole('textbox', { name: 'Note' }).fill('Round this edge with R2 instead of R1');
    await dialog.getByRole('button', { name: 'Add note' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Note 1: Round this edge with R2 instead of R1' })).toBeVisible();
    await page.getByRole('tab', { name: 'Notes' }).click();
    await expect(page.getByRole('row', { name: /Round this edge/ })).toBeVisible();
    await expect(page.getByText('1 note as context')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('a clarification answer drives the proposed change', async ({ page, consoleErrors }) => {
    await openStudio(page);
    const card = page.getByRole('region', { name: /How wide should the snap opening be/ });
    await expect(card.getByRole('radio', { name: /7\.5 mm/ })).toBeChecked();

    await card.getByText('Other value').click();
    const other = card.getByRole('textbox', { name: /Opening between/ });
    await other.fill('12');
    await expect(card.getByText(/Enter a value from 5 mm/)).toBeVisible();
    await expect(card.getByRole('button', { name: 'Answer' })).toBeDisabled();

    await card.getByText('8 mm', { exact: true }).click();
    await expect(card.getByRole('radio', { name: /^8 mm/ })).toBeChecked();
    await card.getByRole('button', { name: 'Answer' }).click();

    await expect(page.getByText('Answered:')).toBeVisible();
    const proposal = page.getByRole('region', { name: 'Proposed change' });
    await expect(proposal.getByRole('row', { name: /slot_width 9 mm 8 mm/ })).toBeVisible();
    await expect(proposal.getByRole('row', { name: /cable_d_nominal 12 mm 10 mm/ })).toBeVisible();
    await proposal.getByRole('button', { name: 'Apply' }).click();
    await expect(proposal.getByText('Applied: cable 10 mm, snap opening 8 mm.')).toBeVisible();
    await expect(page.getByText('Prototype: the change is simulated; the 3D model does not change.')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('the model can be switched between cloud and local providers with honest states', async ({
    page,
    consoleErrors,
  }) => {
    await openStudio(page);
    const modelMenu = page.getByRole('button', { name: /model menu/ });

    await modelMenu.click();
    await page.getByRole('menuitemradio', { name: /GPT-6\.1 Sol/ }).click();
    await expect(modelMenu).toHaveAccessibleName(/^GPT-6\.1 Sol OpenAI, model menu, ready$/);

    await modelMenu.click();
    await page.getByRole('menuitemradio', { name: /Qwen3\.8-Flash-Next/ }).click();
    await expect(modelMenu).toHaveAccessibleName(/^Qwen3\.8-Flash-Next local, model menu, ready$/);

    await page.getByRole('button', { name: 'View and prototype states' }).click();
    await page.getByRole('menuitemradio', { name: 'Not reachable' }).click();
    await expect(page.getByText('Strata is not reachable at 127.0.0.1:8080')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled();

    await modelMenu.click();
    await page.getByRole('menuitemradio', { name: /Claude Opus 5\.5/ }).click();
    await expect(page.getByText('Strata is not reachable at 127.0.0.1:8080')).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test('local capability problems are explained before a session starts', async ({ page, consoleErrors }) => {
    await openStudio(page);
    const modelMenu = page.getByRole('button', { name: /model menu/ });

    await modelMenu.click();
    await page.getByRole('menuitemradio', { name: /qwen3\.8:27b/ }).click();
    await expect(page.getByText(/Context too small: 4,096 tokens/)).toBeVisible();

    await modelMenu.click();
    await page.getByRole('menuitemradio', { name: /Gemma 4 31B/ }).click();
    await expect(page.getByText('Gemma 4 31B cannot call tools')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('simulated failures show designed states', async ({ page, consoleErrors }) => {
    await openStudio(page);
    const settings = page.getByRole('button', { name: 'View and prototype states' });
    const simulate = async (option: string) => {
      await settings.click();
      await page.getByRole('menuitemradio', { name: option }).click();
    };

    await simulate('API key missing');
    await expect(page.getByText('No API key for Anthropic')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message to the assistant' })).toBeDisabled();

    await simulate('Feature fails');
    await expect(page.getByText('1 error', { exact: true })).toBeVisible();
    await expect(page.getByText(/Fillet does not fit/)).toBeVisible();

    await simulate('File unreadable');
    await expect(page.getByText('The model could not be read').first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard focus in menus is visible', async ({ page }) => {
    await openStudio(page);
    const modelMenu = page.getByRole('button', { name: /model menu/ });
    await modelMenu.focus();
    await page.keyboard.press('Enter');
    const focused = page.getByRole('menuitemradio').first();
    await expect(focused).toBeFocused();
    const background = await focused.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the main view has no WCAG 2.2 AA violations that axe can detect', async ({ page }) => {
    await openStudio(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const report = results.violations.flatMap((v) =>
      v.nodes.map((node) => `${v.id} ${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
    );
    expect(report).toEqual([]);
  });
});
