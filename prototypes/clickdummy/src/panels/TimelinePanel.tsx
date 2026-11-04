import {
  IconBorderCorners,
  IconBorderRadius,
  IconCircleDashed,
  IconCube,
  IconCylinder,
  IconNotes,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ListBox, ListBoxItem } from 'react-aria-components';

import { designRevision, timeline, type FeatureKind } from '../mock/design';
import { useStudio } from '../state/store';
import { Badge } from '../ui/Badge';

const icons: Record<FeatureKind, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  box: IconCube,
  fillet: IconBorderRadius,
  chamfer: IconBorderCorners,
  cylinder: IconCylinder,
  hole: IconCircleDashed,
};

export function TimelinePanel() {
  const { t } = useTranslation();
  const highlightFeature = useStudio((s) => s.highlightFeature);
  const setHighlightFeature = useStudio((s) => s.setHighlightFeature);
  const notes = useStudio((s) => s.notes);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-text-muted">
        <span>{t('timeline.revision', { revision: designRevision })}</span>
        <Badge tone="success">{t('timeline.noErrors')}</Badge>
      </div>
      <ListBox
        aria-label={t('panels.timeline')}
        selectionMode="single"
        selectedKeys={highlightFeature ? [highlightFeature] : []}
        onSelectionChange={(keys) => {
          const [first] = keys === 'all' ? [] : [...keys];
          setHighlightFeature(typeof first === 'string' ? first : null);
        }}
        className="flex-1 overflow-auto p-1 outline-none"
        items={timeline}
      >
        {(feature) => {
          const Icon = icons[feature.kind];
          const noteCount = notes.filter((n) => n.anchor.faceName.startsWith(`${feature.id}:`)).length;
          return (
            <ListBoxItem
              id={feature.id}
              textValue={feature.name}
              className="flex h-row cursor-default items-center gap-2 rounded-md px-2 outline-none hovered:bg-surface-hover selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="w-index-column font-mono text-xs text-text-subtle">{feature.id}</span>
              <Icon className="size-icon text-text-muted" aria-hidden />
              <span className="flex-1 truncate text-md text-text">{feature.name}</span>
              {feature.operation !== 'new' ? (
                <span className="text-xs text-text-subtle">{t(`timeline.operation.${feature.operation}`)}</span>
              ) : null}
              {noteCount > 0 ? (
                <span className="flex items-center gap-1 text-xs text-note" aria-label={t('timeline.notes', { count: noteCount })}>
                  <IconNotes className="size-icon-sm" aria-hidden />
                  {noteCount}
                </span>
              ) : null}
            </ListBoxItem>
          );
        }}
      </ListBox>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <span aria-hidden className="h-1 flex-1 rounded-full bg-accent" />
        <span className="text-xs text-text-muted">{t('timeline.rollbackEnd')}</span>
      </div>
    </div>
  );
}
