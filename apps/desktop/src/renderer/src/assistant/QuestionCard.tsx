import { IconCheck, IconHelpCircle, IconListCheck, IconPencil, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { MessageAnswer } from '../../../shared/contract';
import { Button } from '../ui/Button';
import type { ConversationItem } from './store';

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

  if (question.kind === 'ask') {
    const picked = item.choice !== null ? question.options[Number(item.choice)] : undefined;
    return (
      <section aria-labelledby={headingId} data-testid="question-card" data-kind="ask" className="flex flex-col gap-2 rounded-md border border-accent bg-accent-subtle p-3">
        <p id={headingId} className="flex items-center gap-1 text-xs font-medium text-text-muted">
          <IconHelpCircle className="size-icon-sm" aria-hidden />
          {t('assistant.question.title')}
        </p>
        <p className="text-md text-text">{question.question}</p>
        {open ? (
          <>
            <div className="flex flex-col gap-1">
              {question.options.map((option, i) => (
                <div key={i} className="flex flex-col gap-hairline">
                  <Button
                    isDisabled={!ready}
                    onPress={() => {
                      answer(option.label, { question: question.id, choice: String(i) });
                    }}
                  >
                    {option.label}
                  </Button>
                  {option.detail ? <span className="px-1 text-xs text-text-muted">{option.detail}</span> : null}
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted">{t('assistant.question.typeInstead')}</p>
          </>
        ) : (
          <Answered text={picked ? t('assistant.question.answeredWith', { answer: picked.label }) : t('assistant.question.answered')} />
        )}
      </section>
    );
  }

  const outcome = item.choice === 'go' ? 'go' : item.choice === 'cancel' ? 'cancel' : 'change';
  return (
    <section aria-labelledby={headingId} data-testid="question-card" data-kind="plan" className="flex flex-col gap-2 rounded-md border border-accent bg-accent-subtle p-3">
      <p id={headingId} className="flex items-center gap-1 text-xs font-medium text-text-muted">
        <IconListCheck className="size-icon-sm" aria-hidden />
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
