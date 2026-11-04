import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, ListBox, ListBoxItem, SearchField } from 'react-aria-components';

import { projects } from '../mock/design';
import { useStudio } from '../state/store';
import { StatusDot, VerificationBadges, type Tone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Busy, EmptyState } from '../ui/Feedback';

const stateTone: Record<(typeof projects)[number]['state'], Tone> = {
  active: 'accent',
  waiting: 'warning',
  done: 'success',
};

export function ProjectsPanel() {
  const { t } = useTranslation();
  const projectsState = useStudio((s) => s.projectsState);
  const partLevels = useStudio((s) => s.partLevels);
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  if (projectsState === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Busy label={t('projects.loading')} />
      </div>
    );
  }
  if (projectsState === 'empty') {
    return (
      <EmptyState
        title={t('projects.emptyTitle')}
        body={t('projects.emptyBody')}
        action={
          <Button variant="primary" size="sm">
            <IconPlus className="size-icon-sm" aria-hidden />
            {t('projects.new')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <SearchField
          aria-label={t('projects.search')}
          value={query}
          onChange={setQuery}
          className="flex h-control-md flex-1 items-center gap-1 rounded-md border border-border-strong bg-surface px-2 focus-within:outline-2 focus-within:outline-focus"
        >
          <IconSearch className="size-icon-sm text-text-subtle" aria-hidden />
          <Input placeholder={t('projects.search')} className="min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-subtle" />
        </SearchField>
      </div>
      <ListBox
        aria-label={t('panels.projects')}
        selectionMode="single"
        defaultSelectedKeys={['cable-clip']}
        className="flex-1 overflow-auto p-1 outline-none"
        renderEmptyState={() => <p className="p-3 text-sm text-text-muted">{t('projects.noMatch')}</p>}
        items={visible}
      >
        {(project) => (
          <ListBoxItem
            id={project.id}
            textValue={project.name}
            className="flex cursor-default flex-col gap-1 rounded-md px-2 py-2 outline-none hovered:bg-surface-hover selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-md font-medium text-text">{project.name}</span>
              <StatusDot tone={stateTone[project.state]} label={t(`projects.state.${project.state}`)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-text-muted">
                {project.part} v{project.version}
              </span>
              <VerificationBadges
                levels={project.id === 'cable-clip' ? partLevels : project.levels}
                printRecords={project.printRecords}
              />
            </div>
          </ListBoxItem>
        )}
      </ListBox>
    </div>
  );
}
