import { IconListSearch, IconTool } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { Fold, LiveIcon } from './Fold';
import type { WorkEntry } from './rows';
import { StepCard, useStepLines, type StepItem } from './StepCard';
import { ToolCall, type ToolItem } from './ToolCall';

/** Tool calls that only read, folded into one line with their details on demand. */
export function Queries({ tools }: { tools: ToolItem[] }) {
  const { t } = useTranslation();
  const running = tools.some((tool) => tool.ok === undefined);
  return (
    <Fold
      testId="tool-queries"
      summary={
        <>
          <LiveIcon live={running} icon={IconListSearch} />
          <span className="min-w-0 truncate">{t(running ? 'assistant.queriesRunning' : 'assistant.queries', { count: tools.length })}</span>
        </>
      }
    >
      {tools.map((tool) => (
        <ToolCall key={tool.key} item={tool} />
      ))}
    </Fold>
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
  const steps = entries.flatMap((entry) => (entry.kind === 'step' ? [entry.item] : []));
  const queries = entries.reduce((sum, entry) => sum + (entry.kind === 'queries' ? entry.tools.length : 0), 0);
  const newest = steps.at(-1);
  const current = steps.some((step) => step.current);
  return (
    <Fold
      testId="work-group"
      summaryTestId="work-summary"
      summary={
        <>
          <LiveIcon live={live} icon={IconTool} />
          <span className="shrink-0 font-medium text-text">
            {t('assistant.work.steps', { count: steps.length })}
            {queries > 0 ? <span className="font-normal text-text-subtle"> · {t('assistant.work.queries', { count: queries })}</span> : null}
          </span>
          {live && newest ? <Latest item={newest} /> : <span className="flex-1" />}
          {current && !live ? <span className="shrink-0 rounded-full bg-accent-subtle px-2 text-xs text-accent-text">{t('assistant.step.current')}</span> : null}
        </>
      }
    >
      {entries.map((entry) =>
        entry.kind === 'step' ? (
          <StepCard key={entry.item.key} item={entry.item} tools={entry.tools} disabled={disabled} />
        ) : (
          <Queries key={entry.tools[0]?.key} tools={entry.tools} />
        ),
      )}
    </Fold>
  );
}
