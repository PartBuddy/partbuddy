import type { AgentQuestion } from '../../../shared/contract';

export type Round = Extract<AgentQuestion, { kind: 'ask' }>;

/** The answer to each question as text: the picked labels, then what the user typed. */
export function roundAnswers(round: Round, picks: number[][], other: string[]): string[] {
  return round.questions.map((entry, i) =>
    [...(picks[i] ?? []).map((n) => entry.options[n]?.label ?? ''), other[i]?.trim() ?? ''].filter(Boolean).join(', '),
  );
}

/** The message a sent round becomes: the answer alone, or one line per question. */
export function roundMessage(round: Round, answers: string[]): string {
  if (round.questions.length === 1) return answers[0] ?? '';
  return round.questions.map((entry, i) => `${entry.header ?? entry.question}: ${answers[i] ?? ''}`).join('\n');
}
