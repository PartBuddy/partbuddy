import { IconCheck, IconHelpCircle, IconListCheck, IconPencil, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckboxButton, CheckboxField, Input, RadioButton, RadioField, RadioGroup, TextField } from 'react-aria-components';

import type { MessageAnswer } from '../../../shared/contract';
import { Button } from '../ui/Button';
import { radioClass, RadioMark } from './AgentChip';
import { card } from './Fold';
import { roundAnswers, roundMessage, type Round } from './round';
import type { ConversationItem } from './store';
import { inputClass } from '../ui/Field';

export type QuestionItem = Extract<ConversationItem, { kind: 'question' }>;

interface Props {
  item: QuestionItem;
  /** False while the assistant works or SolidCraft is not connected. */
  ready: boolean;
  answer: (text: string, answer: MessageAnswer) => void;
  /** "Change": the user writes what to change in the composer. */
  change: () => void;
}

function Answered({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1 text-sm text-text-muted" data-testid="question-answered">
      <IconCheck className="size-icon-sm text-success" aria-hidden />
      {text}
    </p>
  );
}

/**
 * A question or plan of the assistant (M2a) with buttons for the answer. The answer is the next
 * message; typing one works as well. PartBuddy refuses changes to the design until then.
 */
export function QuestionCard({ item, ready, answer, change }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const { question } = item;
  const open = !item.answered;

  if (question.kind === 'ask') return <RoundCard round={question} open={open} ready={ready} answer={answer} />;

  const outcome = item.choice === 'go' ? 'go' : item.choice === 'cancel' ? 'cancel' : 'change';
  return (
    <section aria-labelledby={headingId} data-testid="question-card" data-kind="plan" className={`${card} gap-2 p-3 ${open ? 'border-accent' : 'border-border'}`}>
      <p id={headingId} className="flex items-center gap-1 text-xs font-medium text-text-muted">
        <IconListCheck className={`size-icon-sm ${open ? 'text-accent' : ''}`} aria-hidden />
        {t('assistant.planCard.title')}
      </p>
      <p className="text-md text-text">{question.summary}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-md text-text" data-testid="plan-steps">
        {question.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      {open ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            isDisabled={!ready}
            onPress={() => {
              answer(t('assistant.planCard.goMessage'), { question: question.id, choice: 'go' });
            }}
          >
            <IconPlayerPlay className="size-icon-sm" aria-hidden />
            {t('assistant.planCard.go')}
          </Button>
          <Button isDisabled={!ready} onPress={change}>
            <IconPencil className="size-icon-sm" aria-hidden />
            {t('assistant.planCard.change')}
          </Button>
          <Button
            isDisabled={!ready}
            onPress={() => {
              answer(t('assistant.planCard.cancelMessage'), { question: question.id, choice: 'cancel' });
            }}
          >
            <IconX className="size-icon-sm" aria-hidden />
            {t('assistant.planCard.cancel')}
          </Button>
        </div>
      ) : (
        <Answered text={t(`assistant.planCard.outcome.${outcome}`)} />
      )}
    </section>
  );
}

type Option = Round['questions'][number]['options'][number];

function OptionText({ option }: { option: Option }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-1 text-sm text-text">
        {option.label}
        {option.recommended ? (
          <span className="rounded-full bg-accent px-2 text-xs font-medium text-on-accent" data-testid="option-recommended">
            {t('assistant.question.recommended')}
          </span>
        ) : null}
      </span>
      {option.detail ? <span className="text-xs text-text-muted">{option.detail}</span> : null}
    </span>
  );
}

/**
 * A round of up to four questions (decided 2026-11-06): the recommended answers come preselected,
 * a question with multiSelect takes several, and each has a field for a different answer. One
 * button sends all answers as the next message.
 */
function RoundCard({ round, open, ready, answer }: { round: Round; open: boolean; ready: boolean; answer: Props['answer'] }) {
  const { t } = useTranslation();
  const baseId = useId();
  const [picks, setPicks] = useState<number[][]>(() =>
    round.questions.map((entry) => {
      const recommended = entry.options.flatMap((option, n) => (option.recommended ? [n] : []));
      return entry.multiSelect ? recommended : recommended.slice(0, 1);
    }),
  );
  const [other, setOther] = useState<string[]>(() => round.questions.map(() => ''));
  const answers = roundAnswers(round, picks, other);
  const complete = answers.every((text) => text.length > 0);
  const setAt = <T,>(list: T[], i: number, value: T) => list.map((entry, n) => (n === i ? value : entry));

  return (
    <section aria-labelledby={`${baseId}-title`} data-testid="question-card" data-kind="ask" className={`${card} gap-3 p-3 ${open ? 'border-accent' : 'border-border'}`}>
      <p id={`${baseId}-title`} className="flex items-center gap-1 text-xs font-medium text-text-muted">
        <IconHelpCircle className={`size-icon-sm ${open ? 'text-accent' : ''}`} aria-hidden />
        {t('assistant.question.title', { count: round.questions.length })}
      </p>
      {round.questions.map((entry, i) => {
        const labelId = `${baseId}-q${String(i)}`;
        const picked = picks[i] ?? [];
        return (
          <div key={i} className="flex flex-col gap-1" data-testid="round-question">
            {entry.header ? <span className="text-xs font-medium uppercase text-text-muted">{entry.header}</span> : null}
            <p id={labelId} className="text-md text-text">
              {entry.question}
              {entry.multiSelect && open ? <span className="text-xs text-text-muted"> · {t('assistant.question.several')}</span> : null}
            </p>
            {!open ? null : entry.multiSelect ? (
              <div role="group" aria-labelledby={labelId} className="flex flex-col gap-hairline">
                {entry.options.map((option, n) => (
                  <CheckboxField
                    key={n}
                    isSelected={picked.includes(n)}
                    onChange={(selected) => {
                      setPicks(setAt(picks, i, selected ? [...picked, n].sort() : picked.filter((x) => x !== n)));
                    }}
                  >
                    <CheckboxButton className={radioClass}>
                      <span
                        aria-hidden
                        className="mt-1 flex size-icon-sm shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface group-selected:border-accent group-selected:bg-accent"
                      >
                        <span className="hidden size-dot rounded-sm bg-surface group-selected:block" />
                      </span>
                      <OptionText option={option} />
                    </CheckboxButton>
                  </CheckboxField>
                ))}
              </div>
            ) : (
              <RadioGroup
                aria-labelledby={labelId}
                value={picked[0] !== undefined ? String(picked[0]) : null}
                onChange={(value) => {
                  setPicks(setAt(picks, i, [Number(value)]));
                  // One answer only: a pick replaces a typed one.
                  setOther(setAt(other, i, ''));
                }}
                className="flex flex-col gap-hairline"
              >
                {entry.options.map((option, n) => (
                  <RadioField key={n} value={String(n)}>
                    <RadioButton className={radioClass}>
                      <RadioMark />
                      <OptionText option={option} />
                    </RadioButton>
                  </RadioField>
                ))}
              </RadioGroup>
            )}
            {open ? (
              <TextField
                aria-label={t('assistant.question.other', { question: entry.header ?? entry.question })}
                value={other[i] ?? ''}
                onChange={(text) => {
                  setOther(setAt(other, i, text));
                  if (!entry.multiSelect && text.trim()) setPicks(setAt(picks, i, []));
                }}
              >
                <Input
                  placeholder={t('assistant.question.otherPlaceholder')}
                  className={inputClass('sm')}
                />
              </TextField>
            ) : null}
          </div>
        );
      })}
      {open ? (
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            isDisabled={!ready || !complete}
            onPress={() => {
              answer(roundMessage(round, answers), { question: round.id, choice: 'answered' });
            }}
          >
            <IconCheck className="size-icon-sm" aria-hidden />
            {t('assistant.question.send')}
          </Button>
          {!complete ? <span className="text-xs text-text-muted">{t('assistant.question.incomplete')}</span> : null}
        </div>
      ) : (
        <Answered text={t('assistant.question.answered')} />
      )}
    </section>
  );
}
