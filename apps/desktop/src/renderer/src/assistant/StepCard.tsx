import { IconArrowBackUp, IconChevronRight, IconSparkles, IconUser } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { MAX_STEP_PHRASES } from '../../../shared/stepPhrases';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import type { ConversationItem } from './store';
import { Fold } from './Fold';
import { ToolCall, type ToolItem } from './ToolCall';

export type StepItem = Extract<ConversationItem, { kind: 'step' }>;

/** The plain words of a step, as many as a card shows. */
export function useStepLines(item: StepItem): { lines: string[]; more: number } {
  const { t } = useTranslation();
  const lines = item.step.phrases.slice(0, MAX_STEP_PHRASES).map((phrase) => t(`steps.${phrase.key}`, phrase.values));
  return { lines, more: item.step.phrases.length - lines.length };
}

/**
 * One step of the work log (M2a), as one quiet line (UI upgrade, chat): who made it and what it
 * did. The faces it changed light up while the pointer or focus is on it; "go back to this state"
 * shows on hover and focus. A click opens the picture of the view after the step, every phrase and
 * the tool details.
 */
export function StepCard({ item, tools, disabled }: { item: StepItem; tools: ToolItem[]; disabled: boolean }) {
  const { t } = useTranslation();
  const setStepHighlight = useStudio((s) => s.setStepHighlight);
  const setNotice = useStudio((s) => s.setNotice);
  const [going, setGoing] = useState(false);
  const [open, setOpen] = useState(false);
  const body = useId();
  const { step, state, current } = item;
  const { lines, more } = useStepLines(item);
  const highlight = () => {
    if (!item.archived && item.changed && item.changed.length > 0 && state === 'applied') setStepHighlight(item.changed);
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
  const summary = `${lines.join(' · ')}${more > 0 ? ` · ${t('assistant.step.more', { count: more })}` : ''}`;

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
      className={`group/step flex min-w-0 flex-col rounded-md ${open ? 'bg-surface-sunken' : 'hover:bg-surface-hover'} ${state === 'applied' ? '' : 'text-text-muted'}`}
    >
      <div className="flex min-w-0 items-center gap-1 px-1">
        <AriaButton
          aria-expanded={open}
          aria-controls={body}
          onPress={() => {
            setOpen(!open);
          }}
          className="flex min-h-control-sm min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-sm outline-none focus-visible:outline-2 focus-visible:outline-focus"
        >
          <IconChevronRight className={`size-icon-sm shrink-0 text-text-subtle transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
          {step.source === 'user' ? (
            <IconUser className="size-icon-sm shrink-0 text-text-subtle" role="img" aria-label={t('assistant.step.byYou')} />
          ) : (
            <IconSparkles className="size-icon-sm shrink-0 text-text-subtle" role="img" aria-label={t('assistant.step.byAssistant')} />
          )}
          <span className={`min-w-0 flex-1 truncate ${state === 'discarded' ? 'line-through' : ''}`} data-testid="step-text" title={summary}>
            {summary}
          </span>
          {current ? (
            <span className="shrink-0 rounded-full bg-accent-subtle px-2 text-xs text-accent-text" data-testid="step-current">
              {t('assistant.step.current')}
            </span>
          ) : null}
          {state !== 'applied' ? (
            <span className="shrink-0 text-xs text-text-subtle" data-testid="step-state">
              {t(`assistant.step.state.${state}`)}
            </span>
          ) : null}
        </AriaButton>
        {!current && state !== 'discarded' && !item.archived ? (
          <AriaButton
            aria-label={state === 'undone' ? t('assistant.step.restore') : t('assistant.step.goTo')}
            onPress={goTo}
            isDisabled={disabled || going}
            className="inline-flex size-control-sm shrink-0 items-center justify-center rounded-sm text-text-muted opacity-0 outline-none hover:bg-surface-hover hover:text-text focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus group-hover/step:opacity-100 disabled:opacity-0"
          >
            <IconArrowBackUp className="size-icon-sm" aria-hidden />
          </AriaButton>
        ) : null}
      </div>
      <div id={body} hidden={!open} className="flex flex-col gap-2 px-2 pb-2 pt-1">
        {item.preview ? (
          <img
            src={item.preview}
            alt=""
            data-testid="step-preview"
            className={`aspect-[16/10] w-full rounded-sm border border-border object-cover ${state === 'applied' ? '' : 'opacity-50 grayscale'}`}
          />
        ) : null}
        {lines.length > 1 || more > 0 ? (
          <ul className="flex list-disc flex-col pl-4 text-sm text-text">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : null}
        {tools.length > 0 ? (
          <Fold summary={t('assistant.step.details', { count: tools.length })}>
            {tools.map((tool) => (
              <ToolCall key={tool.key} item={tool} />
            ))}
          </Fold>
        ) : null}
      </div>
    </article>
  );
}
