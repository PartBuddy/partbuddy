import { IconArrowBackUp, IconChevronRight, IconSparkles, IconUser } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MAX_STEP_PHRASES } from '../../../shared/stepPhrases';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import type { ConversationItem } from './store';
import { ToolCall, type ToolItem } from './ToolCall';

export type StepItem = Extract<ConversationItem, { kind: 'step' }>;

/** Tool details on demand, closed by default (M2a: the card speaks plainly first). */
export function Details({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group flex flex-col gap-1 text-sm">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-text-muted outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <IconChevronRight className="size-icon-sm transition-transform group-open:rotate-90" aria-hidden />
        {label}
      </summary>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
    </details>
  );
}

/**
 * One step of the work log (M2a): a picture of the view after the step, what it did in plain
 * words, the faces it changed lighting up while the pointer is on the card, the tool details on
 * demand, and "go back to this state".
 */
export function StepCard({ item, tools, disabled }: { item: StepItem; tools: ToolItem[]; disabled: boolean }) {
  const { t } = useTranslation();
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  const setNotice = useStudio((s) => s.setNotice);
  const [going, setGoing] = useState(false);
  const { step, state, current } = item;
  const lines = step.phrases.slice(0, MAX_STEP_PHRASES).map((phrase) => t(`steps.${phrase.key}`, phrase.values));
  const more = step.phrases.length - lines.length;
  const highlight = () => {
    if (item.changed && item.changed.length > 0 && state === 'applied') setStepHighlight(item.changed);
  };
  const unhighlight = () => {
    setStepHighlight(null);
  };
  const goTo = () => {
    setGoing(true);
    platform()
      .design.goToStep(step.id)
      .catch(() => {
        setNotice({ tone: 'danger', text: t('assistant.step.goToFailed') });
      })
      .finally(() => {
        setGoing(false);
      });
  };

  return (
    <article
      aria-label={t('assistant.step.label', { text: lines[0] ?? '' })}
      data-testid="step-card"
      data-state={state}
      data-current={current}
      onPointerEnter={highlight}
      onPointerLeave={unhighlight}
      onFocus={highlight}
      onBlur={unhighlight}
      className={`flex flex-col gap-2 rounded-md border bg-surface p-2 ${current ? 'border-accent' : state === 'applied' ? 'border-border' : 'border-dashed border-border-strong'}`}
    >
      <div className="flex gap-2">
        {item.preview ? (
          <img
            src={item.preview}
            alt=""
            data-testid="step-preview"
            className={`aspect-[16/10] w-step-preview shrink-0 rounded-sm border border-border object-cover ${state === 'applied' ? '' : 'opacity-50 grayscale'}`}
          />
        ) : (
          <div className="aspect-[16/10] w-step-preview shrink-0 rounded-sm border border-border bg-surface-sunken" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1 text-xs text-text-muted">
            {step.source === 'user' ? <IconUser className="size-icon-sm" aria-hidden /> : <IconSparkles className="size-icon-sm" aria-hidden />}
            {step.source === 'user' ? t('assistant.step.byYou') : t('assistant.step.byAssistant')}
            {state !== 'applied' ? <span data-testid="step-state">· {t(`assistant.step.state.${state}`)}</span> : null}
            {current ? <span>· {t('assistant.step.current')}</span> : null}
          </span>
          <ul className="flex flex-col text-md text-text" data-testid="step-text">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
            {more > 0 ? <li className="text-sm text-text-muted">{t('assistant.step.more', { count: more })}</li> : null}
          </ul>
        </div>
      </div>
      {tools.length > 0 || (!current && state !== 'discarded') ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {tools.length > 0 ? (
            <Details label={t('assistant.step.details', { count: tools.length })}>
              {tools.map((tool) => (
                <ToolCall key={tool.key} item={tool} />
              ))}
            </Details>
          ) : (
            <span />
          )}
          {!current && state !== 'discarded' ? (
            <Button onPress={goTo} isDisabled={disabled || going}>
              <IconArrowBackUp className="size-icon-sm" aria-hidden />
              {state === 'undone' ? t('assistant.step.restore') : t('assistant.step.goTo')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
