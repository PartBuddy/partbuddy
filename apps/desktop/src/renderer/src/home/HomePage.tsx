import { IconCube, IconFileImport, IconFilePlus, IconFolderOpen, IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Heading, Input, SearchField } from 'react-aria-components';

import type { ProjectCheck, ProjectEntry, ProjectInfo } from '../../../shared/contract';
import { platform } from '../platform';
import { useProjectSwitch } from '../shell/projectSwitch';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { StatusDot, type Tone } from '../ui/Feedback';
import { matching, relativeTime } from './projectTiles';

const CHECK_TONE: Record<ProjectCheck, Tone> = { ready: 'success', warn: 'warning', block: 'danger' };

/**
 * The start page (B3, decided 2026-11-05): the projects in the project folder as tiles with
 * preview, name, last change and ready-to-print light, a search, and new, open and import. The
 * logo in the title bar opens it over the work area, which stays as it is underneath; Escape or
 * the open project's tile goes back.
 */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const setHomeOpen = useStudio((s) => s.setHomeOpen);
  const run = useProjectSwitch();
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const [current, setCurrent] = useState<ProjectInfo>(null);
  const [query, setQuery] = useState('');
  const [now] = useState(() => Date.now());
  const ready = connection.state === 'connected' && connection.engine === 'headless';
  const api = platform().project;

  useEffect(() => {
    let live = true;
    void Promise.all([api.list(), api.info()])
      .then(([list, info]) => {
        if (!live) return;
        setProjects(list);
        setCurrent(info);
      })
      .catch(() => {
        if (live) setProjects([]);
      });
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setHomeOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [setHomeOpen]);

  const shown = useMemo(() => matching(projects ?? [], query), [projects, query]);
  const openProject = (project: ProjectEntry) => {
    if (current && current.folder === project.folder) {
      setHomeOpen(false);
      return;
    }
    run(() => api.openFolder(project.folder));
  };

  return (
    <section
      aria-labelledby="home-title"
      className="absolute inset-0 z-5 overflow-y-auto bg-canvas"
      data-testid="home-page"
    >
      <div className="mx-auto flex max-w-page-max flex-col gap-5 px-6 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Heading id="home-title" level={1} className="mr-auto font-display text-xl font-semibold text-text">
            {t('home.title')}
          </Heading>
          <SearchField aria-label={t('home.search')} value={query} onChange={setQuery} className="group relative flex w-search items-center">
            <IconSearch className="pointer-events-none absolute left-2 size-icon-sm text-text-subtle" aria-hidden />
            <Input
              placeholder={t('home.search')}
              className="h-control-md w-full rounded-md border border-border-strong bg-surface pr-6 pl-6 text-md text-text outline-none placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-search-cancel-button]:hidden"
              data-testid="home-search"
            />
            <AriaButton className="absolute right-1 flex size-control-sm items-center justify-center rounded-sm text-text-subtle outline-none group-empty:hidden hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus">
              <IconX className="size-icon-sm" aria-hidden />
            </AriaButton>
          </SearchField>
          <Button variant="primary" isDisabled={!ready} onPress={() => run(() => api.create())} data-testid="home-new">
            <IconFilePlus className="size-icon" aria-hidden />
            {t('project.new')}
          </Button>
          <Button isDisabled={!ready} onPress={() => run(() => api.open())} data-testid="home-open">
            <IconFolderOpen className="size-icon" aria-hidden />
            {t('project.open')}
          </Button>
          <Button isDisabled={!ready} onPress={() => run(() => api.import())} data-testid="home-import">
            <IconFileImport className="size-icon" aria-hidden />
            {t('home.import')}
          </Button>
        </div>

        {projects === null ? null : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-7 text-center" data-testid="home-empty">
            <p className="text-md font-semibold text-text">{t('home.emptyTitle')}</p>
            <p className="max-w-text-max text-sm text-text-muted">{t('home.emptyBody')}</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="py-7 text-center text-sm text-text-muted" role="status" data-testid="home-no-match">
            {t('home.noMatch', { query })}
          </p>
        ) : (
          <ul aria-label={t('home.list', { count: shown.length })} className="grid grid-cols-[repeat(auto-fill,minmax(var(--cs-size-tile),1fr))] gap-4" data-testid="home-projects">
            {shown.map((project) => (
              <li key={project.folder}>
                <ProjectTile
                  project={project}
                  open={current?.folder === project.folder}
                  disabled={!ready}
                  when={relativeTime(project.modified, now, i18n.language) ?? t('home.justNow')}
                  onOpen={() => {
                    openProject(project);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ProjectTile({ project, open, disabled, when, onOpen }: { project: ProjectEntry; open: boolean; disabled: boolean; when: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const light = project.check ? t(`home.check.${project.check}`) : null;
  return (
    <AriaButton
      onPress={onOpen}
      isDisabled={disabled && !open}
      className={`group flex w-full flex-col overflow-hidden rounded-lg border bg-surface text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default ${open ? 'border-accent' : 'border-border'}`}
      data-testid="home-tile"
      data-name={project.name}
      data-open={open}
    >
      <div className="flex aspect-[4/3] w-full items-center justify-center border-b border-border bg-surface-sunken">
        {project.preview ? (
          <img src={project.preview} alt="" className="size-full object-contain" draggable={false} data-testid="home-preview" />
        ) : (
          <IconCube className="size-control-lg text-text-subtle" stroke={1.25} aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-1 px-3 py-2">
        <span className="truncate text-md font-medium text-text" title={project.name}>
          {project.name}
        </span>
        <span className="flex items-center justify-between gap-2 text-xs text-text-subtle">
          <span className="truncate tabular-nums">{open ? t('home.openNow') : when}</span>
          {project.check && light ? <StatusDot tone={CHECK_TONE[project.check]} label={light} /> : null}
        </span>
      </div>
    </AriaButton>
  );
}
