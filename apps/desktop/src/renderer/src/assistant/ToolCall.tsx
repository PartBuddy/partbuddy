import { IconCheck, IconShieldX, IconTool, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { ConversationItem } from './store';

export type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

/** One tool call with its decision and result; inside a step card or a group of queries. */
export function ToolCall({ item }: { item: ToolItem }) {
  const { t } = useTranslation();
  const icon =
    item.decision === 'denied' ? (
      <IconShieldX className="size-icon-sm text-warning" aria-hidden />
    ) : item.ok === undefined ? (
      <IconTool className="size-icon-sm text-text-subtle" aria-hidden />
    ) : item.ok ? (
      <IconCheck className="size-icon-sm text-success" aria-hidden />
    ) : (
      <IconX className="size-icon-sm text-danger" aria-hidden />
    );
  const state =
    item.decision === 'denied'
      ? t('assistant.tool.denied')
      : item.ok === undefined
        ? t('assistant.tool.running')
        : item.ok
          ? t('assistant.tool.done')
          : t('assistant.tool.failed');
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface-sunken px-2 py-1 text-sm" data-testid="tool-call">
      <span className="flex items-center gap-1 text-text">
        {icon}
        <span className="font-medium">{item.name}</span>
        <span className="text-text-subtle">· {state}</span>
      </span>
      {item.reason ? <span className="text-text-muted">{item.reason}</span> : null}
      <span className="truncate text-xs text-text-subtle" title={item.summary}>
        {item.summary}
      </span>
    </div>
  );
}
