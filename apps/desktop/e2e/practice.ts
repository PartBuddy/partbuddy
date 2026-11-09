import { expect, type Page, type Locator } from '@playwright/test';

// Shared by the practice runs (practice.spec.ts): talk to the assistant like a
// user would and collect what happened.

const TURN_TIMEOUT_MS = 12 * 60 * 1000;

export interface Turn {
  message: string;
  seconds: number;
  cards: { kind: string; text: string; answered: string }[];
  steps: string[];
  answer: string;
  errors: string[];
}

export async function waitForTurn(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible({ timeout: 120_000 }).catch(() => undefined);
  await expect(stop).toBeHidden({ timeout: TURN_TIMEOUT_MS });
  await page.waitForTimeout(1500);
}

/**
 * Answers a round of questions like a user would: per question the option whose name holds
 * `answer`, else the preselected recommendation, else the first option; an answer that fits no
 * option goes into the first question's own field. Returns what the card sends.
 */
export async function answerRound(card: Locator, answer: string | undefined): Promise<string> {
  const questions = card.getByTestId('round-question');
  const count = await questions.count();
  let used = false;
  for (let q = 0; q < count; q += 1) {
    const entry = questions.nth(q);
    const options = entry.getByRole('radio').or(entry.getByRole('checkbox'));
    const wanted = answer ? entry.getByRole('radio', { name: answer }).or(entry.getByRole('checkbox', { name: answer })) : null;
    if (wanted && (await wanted.count()) > 0) {
      await wanted.first().check({ force: true });
      used = true;
    } else if ((await entry.getByRole('radio', { checked: true }).or(entry.getByRole('checkbox', { checked: true })).count()) === 0) {
      await options.first().check({ force: true });
    }
  }
  if (answer && !used) await questions.first().getByRole('textbox').fill(answer);
  const text = ((await card.textContent()) ?? '').slice(0, 600);
  await card.getByRole('button', { name: 'Answer' }).click();
  return text;
}

/** Sends a message and answers question and plan cards like a user would, up to four rounds. */
export async function converse(page: Page, message: string, answer: string | undefined): Promise<Turn> {
  const started = Date.now();
  const before = await page.getByTestId('step-card').count();
  const answersBefore = await page.getByTestId('assistant-text').count();
  const cardsBefore = await page.getByTestId('question-card').count();
  const composer = page.getByRole('textbox', { name: 'Message to the assistant' });
  await composer.fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await waitForTurn(page);
  const cards: Turn['cards'] = [];
  for (let round = 0; round < 4; round += 1) {
    const all = page.getByTestId('question-card');
    const count = await all.count();
    let handled = false;
    for (let i = cardsBefore; i < count; i += 1) {
      const card = all.nth(i);
      if ((await card.getByTestId('question-answered').count()) > 0) continue;
      const kind = (await card.getAttribute('data-kind')) ?? '?';
      const text = ((await card.textContent()) ?? '').slice(0, 600);
      let answered: string;
      if (kind === 'plan') {
        await card.getByRole('button', { name: 'Build' }).click();
        answered = 'Go';
      } else {
        await answerRound(card, answer);
        answered = `round answered${answer ? ` with "${answer}"` : ''}`;
      }
      cards.push({ kind, text, answered });
      handled = true;
      await waitForTurn(page);
      break;
    }
    if (!handled) break;
  }
  const steps = (await page.getByTestId('step-text').allTextContents()).slice(before);
  const answers = (await page.getByTestId('assistant-text').allTextContents()).slice(answersBefore);
  const errors = await page.getByRole('alert').allTextContents();
  return { message, seconds: Math.round((Date.now() - started) / 1000), cards, steps, answer: answers.join('\n---\n').slice(0, 6000), errors };
}
