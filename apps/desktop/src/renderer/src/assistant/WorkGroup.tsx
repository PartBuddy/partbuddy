import { IconChevronRight, IconTool } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import type { WorkEntry } from './rows';
import { Details, StepCard, useStepLines, type StepItem } from './StepCard';
import { ToolCall, type ToolItem } from './ToolCall';

/** Tool calls that only read, folded into one line with their details on demand. */
export function Queries({ tools }: { tools: ToolItem[] }) {
  const { t } = useTranslation();
  const running = tools.some((tool) => tool.ok === undefined);
  return (
    <div data-testid="tool-queries">
      <Details label={t(running ? 'assistant.queriesRunning' : 'assistant.queries', { count: tools.length })}>
        {tools.map((tool) => (
          <ToolCall key={tool.key} item={tool} />
        ))}
      </Details>
    </div>
  );
}

function Latest({ item }: { item: StepItem }) {
  const { lines } = useStepLines(item);
  return <span className="min-w-0 flex-1 truncate text-text-muted">{lines[0] ?? ''}</span>;
}

/**
 * Every step of one request as one line (UI upgrade, chat): how many steps, the newest one while
 * the assistant works, and "current state" when the design stands at one of them. A click opens
 * the steps as quiet lines.
 */
export function WorkGroup({ entries, live, disabled }: { entries: WorkEntry[]; live: boolean; disabled: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const body = useId();
  const steps = entries.flatMap((entry) => (entry.kind === 'step' ? [entry.item] : []));
  const queries = entries.reduce((sum, entry) => sum + (entry.kind === 'queries' ? entry.tools.length : 0), 0);
  const newest = steps.at(-1);
  const current = steps.some((step) => step.current);
  return (
    <section className={`flex flex-col rounded-md border ${open ? 'border-border' : 'border-transparent'}`} data-testid="work-group" data-open={open}>
      <AriaButton
        aria-expanded={open}
        aria-controls={body}
        onPress={() => {
          setOpen(!open);
        }}
        className="flex min-h-control-sm min-w-0 items-center gap-2 rounded-md px-1 text-left text-sm text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
        data-testid="work-summary"
      >
        <IconChevronRight className={`size-icon-sm shrink-0 text-text-subtle transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
        <IconTool className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
        <span className="shrink-0 font-medium">
          {t('assistant.work.steps', { count: steps.length })}
          {queries > 0 ? <span className="font-normal text-text-subtle"> · {t('assistant.work.queries', { count: queries })}</span> : null}
        </span>
        {live && newest ? <Latest item={newest} /> : <span className="flex-1" />}
        {current && !live ? (
          <span className="shrink-0 rounded-full bg-accent-subtle px-2 text-xs text-accent">{t('assistant.step.current')}</span>
        ) : null}
      </AriaButton>
      <div id={body} hidden={!open} className="flex flex-col gap-0 pb-1 pl-4">
        {entries.map((entry) =>
          entry.kind === 'step' ? (
            <StepCard key={entry.item.key} item={entry.item} tools={entry.tools} disabled={disabled} />
          ) : (
            <div key={entry.tools[0]?.key} className="px-1">
              <Queries tools={entry.tools} />
            </div>
          ),
        )}
      </div>
    </section>
  );
}
