import { IconAlertTriangle, IconArrowsDownUp, IconArrowsSort, IconChevronDown, IconCopy, IconCube, IconDots, IconFileExport, IconFileImport, IconFilePlus, IconFolderOpen, IconFolderSearch, IconPencil, IconSearch, IconStar, IconStarFilled, IconTags, IconTrash, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Heading, Input, ListBox, ListBoxItem, Menu, MenuItem, MenuTrigger, Popover, SearchField, Select, SelectValue, Separator, ToggleButton } from 'react-aria-components';

import type { ProjectCheck, ProjectEntry, ProjectInfo, TrashEntry } from '../../../shared/contract';
import { TEMPLATE_IDS, type TemplateId } from '../../../shared/templates';
import { platform } from '../platform';
import { useFileImport } from '../shell/fileImport';
import { exportProject, RenameDialog, TrashDialog } from '../shell/ProjectMenu';
import { useProjectSwitch } from '../shell/projectSwitch';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { Busy, StatusDot, type Tone } from '../ui/Feedback';
import { Tip } from '../ui/Tooltip';
import { TagsDialog } from './TagsDialog';
import { TrashSection } from './TrashSection';
import { matching, PROJECT_SORTS, relativeTime, sortProjects, tagsOf, type ProjectSort } from './projectTiles';
import hingedBox from './templates/hingedBox.png';
import housing from './templates/housing.png';
import sign from './templates/sign.png';
import slideStop from './templates/slideStop.png';
import wallHolder from './templates/wallHolder.png';
import { iconButtonClass, pressable } from '../ui/Button';
import { inputClass } from '../ui/Field';
import { chipToggleClass, ListCheck, listItemClass, selectTriggerClass } from '../ui/Choice';
import { POPOVER_OFFSET, menuClass, menuItemClass, menuSeparatorClass, popoverClass } from '../ui/Overlay';

/** Pictures of the templates, rendered by SolidCraft (tools/templates/render-previews.mjs). */
const TEMPLATE_PICTURES: Record<TemplateId, string> = { hingedBox, slideStop, housing, sign, wallHolder };

const CHECK_TONE: Record<ProjectCheck, Tone> = { ready: 'success', warn: 'warning', block: 'danger' };

/** The chosen order of the start page, kept in the renderer's localStorage (P1). */
const SORT_KEY = 'partbuddy.home.sort';
function storedSort(): ProjectSort {
  try {
    const stored = window.localStorage.getItem(SORT_KEY);
    return PROJECT_SORTS.find((sort) => sort === stored) ?? 'modified';
  } catch {
    return 'modified';
  }
}
const REVERSED_KEY = 'partbuddy.homeSortReversed';
function storedReversed(): boolean {
  try {
    return window.localStorage.getItem(REVERSED_KEY) === '1';
  } catch {
    return false;
  }
}
function keepReversed(reversed: boolean): void {
  try {
    window.localStorage.setItem(REVERSED_KEY, reversed ? '1' : '0');
  } catch {
    // Without storage the direction is only kept until the window closes.
  }
}
function keepSort(sort: ProjectSort): void {
  try {
    window.localStorage.setItem(SORT_KEY, sort);
  } catch {
    // Without storage the order is only kept until the window closes.
  }
}

const itemClass = menuItemClass;

/**
 * The start page (B3, decided 2026-11-05): the projects in the project folder as tiles with
 * preview, name, last change and ready-to-print light, a search, and new, open and import, and
 * templates to start from (F3). The
 * logo in the title bar opens it over the work area, which stays as it is underneath; Escape or
 * the open project's tile goes back.
 */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const setHomeOpen = useStudio((s) => s.setHomeOpen);
  const run = useProjectSwitch();
  // The template SolidCraft is building: its tile says so, and the others wait (audit P-02).
  const [building, setBuilding] = useState<TemplateId | null>(null);
  const { asProject } = useFileImport();
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const [current, setCurrent] = useState<ProjectInfo>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectSort>(storedSort);
  const [reversed, setReversed] = useState(storedReversed);
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'trash' | 'tags'; project: ProjectEntry } | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const ready = connection.state === 'connected' && connection.engine === 'headless';
  const api = platform().project;

  const [loads, setLoads] = useState(0);
  const reload = useCallback(() => {
    setLoads((count) => count + 1);
  }, []);
  useEffect(() => {
    let live = true;
    void Promise.all([api.list(), api.info(), api.trashList().catch(() => [])])
      .then(([list, info, deleted]) => {
        if (!live) return;
        setNow(Date.now());
        setProjects(list);
        setCurrent(info);
        setTrash(deleted);
      })
      .catch(() => {
        if (live) setProjects([]);
      });
    return () => {
      live = false;
    };
  }, [api, loads]);
  const failed = (error: unknown) => {
    useStudio.getState().setNotice({ tone: 'danger', text: t('project.failed', { detail: (error as Error).message.slice(0, 200) }) });
  };
  const act = (project: ProjectEntry, action: string) => {
    if (action === 'open') openProject(project);
    else if (action === 'rename' || action === 'trash' || action === 'tags') setDialog({ kind: action, project });
    else if (action === 'duplicate') void api.duplicate(project.folder).then(reload, failed);
    else if (action === 'reveal') void api.reveal(project.folder).catch(failed);
    else if (action === 'export') exportProject(api.exportPackage(project.folder), t);
  };

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

  const tags = useMemo(() => tagsOf(projects ?? [], i18n.language), [projects, i18n.language]);
  const shown = useMemo(() => {
    const tagged = tag === null ? (projects ?? []) : (projects ?? []).filter((project) => project.tags.some((own) => own.toLocaleLowerCase() === tag.toLocaleLowerCase()));
    return sortProjects(matching(tagged, query), sort, i18n.language, reversed);
  }, [projects, query, sort, tag, reversed, i18n.language]);
  // The search narrows the templates too (audit A-16).
  const templates = useMemo(() => {
    const words = query.trim().toLocaleLowerCase(i18n.language);
    if (!words) return TEMPLATE_IDS;
    return TEMPLATE_IDS.filter((id) => `${t(`home.templates.items.${id}.name`)} ${t(`home.templates.items.${id}.body`)}`.toLocaleLowerCase(i18n.language).includes(words));
  }, [query, t, i18n.language]);
  const favorite = (project: ProjectEntry, next: boolean) => {
    void api.setMeta(project.folder, { favorite: next }).then(reload, failed);
  };
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
      className="absolute inset-0 z-5 animate-fade-in overflow-y-auto bg-canvas"
      data-testid="home-page"
    >
      <div className="mx-auto flex max-w-[100rem] flex-col gap-5 px-6 pb-6">
        {/* Stays on top while the page scrolls (audit A-33). */}
        <div className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-b border-border bg-canvas px-6 pt-6 pb-3">
          <Heading id="home-title" level={1} className="mr-auto font-display text-xl font-semibold text-text">
            {t('home.title')}
          </Heading>
          <SearchField aria-label={t('home.search')} value={query} onChange={setQuery} className="group relative flex w-search items-center">
            <IconSearch className="pointer-events-none absolute left-2 size-icon-sm text-text-subtle" aria-hidden />
            <Input
              placeholder={t('home.search')}
              className={`${inputClass('md')} pr-6 pl-6 [&::-webkit-search-cancel-button]:hidden`}
              data-testid="home-search"
            />
            <AriaButton aria-label={t('home.searchClear')} className={`absolute right-1 group-empty:hidden ${iconButtonClass('sm')}`}>
              <IconX className="size-icon-sm" aria-hidden />
            </AriaButton>
          </SearchField>
          <Select
            aria-label={t('home.sort')}
            value={sort}
            onChange={(key) => {
              const next = PROJECT_SORTS.find((item) => item === key) ?? 'modified';
              setSort(next);
              keepSort(next);
            }}
            data-testid="home-sort"
          >
            <Tip label={t('home.sort')}>
              <AriaButton className={selectTriggerClass('md')}>
                <IconArrowsSort className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
                <SelectValue className="truncate">{({ selectedText }) => selectedText}</SelectValue>
                <IconChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
              </AriaButton>
            </Tip>
            <Popover offset={4} className={popoverClass}>
              <ListBox className="max-h-menu-max overflow-auto outline-none">
                {PROJECT_SORTS.map((item) => (
                  <ListBoxItem key={item} id={item} textValue={t(`home.${item}`)} className={listItemClass} data-testid="home-sort-option" data-sort={item}>
                    <ListCheck />
                    {t(`home.${item}`)}
                  </ListBoxItem>
                ))}
              </ListBox>
            </Popover>
          </Select>
          <Tip label={t('home.reverse')}>
            <ToggleButton
              aria-label={t('home.reverse')}
              isSelected={reversed}
              onChange={(next) => {
                setReversed(next);
                keepReversed(next);
              }}
              className={`${iconButtonClass('md')} selected:bg-surface-selected selected:text-accent-text`}
              data-testid="home-sort-reverse"
            >
              <IconArrowsDownUp className="size-icon-sm" aria-hidden />
            </ToggleButton>
          </Tip>
          <Button variant="primary" isDisabled={!ready} onPress={() => run(() => api.create())} data-testid="home-new">
            <IconFilePlus className="size-icon" aria-hidden />
            {t('project.new')}
          </Button>
          <Button isDisabled={!ready} onPress={() => run(() => api.open())} data-testid="home-open">
            <IconFolderOpen className="size-icon" aria-hidden />
            {t('project.open')}
          </Button>
          <Button isDisabled={!ready} onPress={() => asProject()} data-testid="home-import">
            <IconFileImport className="size-icon" aria-hidden />
            {t('home.import')}
          </Button>
        </div>


        <HomeConnection />
        <Heading level={2} className="text-sm font-semibold text-text-muted" data-testid="home-mine">
          {query.trim() && projects?.length ? t('home.found', { count: shown.length }) : t('home.mine')}
        </Heading>
        {tags.length > 0 ? (
          <div role="group" aria-label={t('home.tags.filter')} className="flex flex-wrap items-center gap-2" data-testid="home-tags">
            <IconTags className="size-icon-sm text-text-subtle" aria-hidden />
            {tags.map((name) => (
              <ToggleButton
                key={name}
                isSelected={tag !== null && tag.toLocaleLowerCase() === name.toLocaleLowerCase()}
                onChange={(on) => setTag(on ? name : null)}
                className={chipToggleClass}
                data-testid="home-tag"
                data-tag={name}
              >
                {name}
              </ToggleButton>
            ))}
          </div>
        ) : null}

        {projects === null ? null : projects.length === 0 && !ready ? null : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-7 text-center" data-testid="home-empty">
            <p className="text-md font-semibold text-text">{t('home.emptyTitle')}</p>
            <p className="max-w-text-max text-sm text-text-muted">{t('home.emptyBody')}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-7 text-center" role="status" data-testid="home-no-match">
            <p className="text-sm text-text-muted">{t('home.noMatch', { query })}</p>
            <Button size="sm" onPress={() => setQuery('')} data-testid="home-no-match-clear">
              {t('home.searchClear')}
            </Button>
          </div>
        ) : (
          <ul aria-label={t('home.list', { count: shown.length })} className="grid grid-cols-[repeat(auto-fill,minmax(var(--cs-size-tile),1fr))] gap-4" data-testid="home-projects">
            {shown.map((project) => (
              <li key={project.folder} className="group/tile relative">
                <ProjectTile
                  project={project}
                  open={current?.folder === project.folder}
                  disabled={!ready}
                  when={relativeTime(project.modified, now, i18n.language) ?? t('home.justNow')}
                  onOpen={() => {
                    openProject(project);
                  }}
                />
                <ToggleButton
                  isSelected={project.favorite}
                  onChange={(next) => favorite(project, next)}
                  aria-label={t(project.favorite ? 'home.unfavorite' : 'home.favorite', { name: project.name })}
                  className={`absolute top-2 left-2 inline-flex size-control-sm items-center justify-center rounded-md border border-border bg-surface-raised text-text-muted shadow-1 transition-[opacity,background-color,color] hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed focus-visible:opacity-100 selected:text-accent-text ${pressable} ${project.favorite ? '' : 'opacity-0 group-hover/tile:opacity-100'}`}
                  data-testid="home-tile-favorite"
                >
                  {project.favorite ? <IconStarFilled className="size-icon-sm" aria-hidden /> : <IconStar className="size-icon-sm" aria-hidden />}
                </ToggleButton>
                <TileMenu
                  project={project}
                  ready={ready}
                  open={current?.folder === project.folder}
                  onAction={(action) => {
                    act(project, action);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {templates.length > 0 ? (
        <section aria-labelledby="home-templates-title" className="flex flex-col gap-2" data-testid="home-templates">
          <Heading id="home-templates-title" level={2} className="text-sm font-semibold text-text-muted">
            {t('home.templates.title')}
          </Heading>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(var(--cs-size-tile),1fr))] gap-4">
            {templates.map((id) => (
              <li key={id}>
                <AriaButton
                  isDisabled={!ready || building !== null}
                  onPress={() => {
                    setBuilding(id);
                    run(() =>
                      api.fromTemplate(id, t(`home.templates.items.${id}.name`)).finally(() => {
                        setBuilding(null);
                      }),
                    );
                  }}
                  data-building={building === id || undefined}
                  className="group flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface p-2 text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:focus-ring disabled:cursor-default disabled:opacity-disabled data-[building]:opacity-100"
                  data-testid="home-template"
                  data-template={id}
                >
                  <img src={TEMPLATE_PICTURES[id]} alt="" className="aspect-[4/3] w-1/3 shrink-0 rounded-md object-cover" draggable={false} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-text">{t(`home.templates.items.${id}.name`)}</span>
                    {building === id ? (
                      <Busy label={t('home.templates.building')} />
                    ) : (
                      <span className="line-clamp-3 text-xs text-text-subtle" title={t(`home.templates.items.${id}.body`)}>
                        {t(`home.templates.items.${id}.body`)}
                      </span>
                    )}
                  </span>
                </AriaButton>
              </li>
            ))}
          </ul>
        </section>
        ) : null}
        <TrashSection entries={trash} now={now} onChange={reload} />
      </div>
      {dialog?.kind === 'rename' ? <RenameDialog key={dialog.project.folder} open name={dialog.project.name} folder={dialog.project.folder} onClose={() => setDialog(null)} onDone={reload} /> : null}
      {dialog?.kind === 'tags' ? <TagsDialog project={dialog.project} onClose={() => setDialog(null)} onDone={reload} /> : null}
      {dialog?.kind === 'trash' ? (
        <TrashDialog
          open
          name={dialog.project.name}
          opensNew={current?.folder === dialog.project.folder}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            void api.trash(dialog.project.folder).then(reload, failed);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * Why the start page is greyed while SolidCraft is not there, and the way forward (audit A-07, A-19,
 * C-05): a busy line while it starts, otherwise a notice with "Start SolidCraft" and the settings.
 */
function HomeConnection() {
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  if (connection.state === 'connected') return null;
  if (connection.state === 'searching' || connection.state === 'connecting' || connection.state === 'starting') {
    return (
      <div className="flex items-center gap-2" role="status" data-testid="home-connection">
        <Busy label={t('home.offline.starting')} />
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning bg-warning-subtle px-4 py-3" data-testid="home-connection">
      <IconAlertTriangle className="size-icon shrink-0 text-warning" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-semibold text-text">{t('home.offline.title')}</p>
        <p className="text-sm text-text-muted">{t('home.offline.body')}</p>
      </div>
      {connection.state === 'notInstalled' ? null : (
        <Button
          variant="primary"
          onPress={() => {
            void platform().solidcraft.start();
          }}
          data-testid="home-connection-start"
        >
          {t('connection.start')}
        </Button>
      )}
      <Button
        onPress={() => {
          useStudio.getState().setSettingsSection('solidcraft');
        }}
        data-testid="home-connection-settings"
      >
        {t('home.offline.settings')}
      </Button>
    </div>
  );
}

/**
 * The "…" menu of a tile (P1): every project action without opening the project first. Only
 * opening and the open project's rename and delete switch the design and wait for SolidCraft.
 */
function TileMenu({ project, ready, open, onAction }: { project: ProjectEntry; ready: boolean; open: boolean; onAction: (action: string) => void }) {
  const { t } = useTranslation();
  const item = (id: string, icon: ReactNode, label: string) => (
    <MenuItem id={id} textValue={label} className={itemClass} data-testid={`home-tile-${id}`}>
      {icon}
      <span className="flex-1">{label}</span>
    </MenuItem>
  );
  return (
    <MenuTrigger>
      <AriaButton
        aria-label={t('home.actions', { name: project.name })}
        className={`absolute top-2 right-2 inline-flex size-control-sm items-center justify-center rounded-md border border-border bg-surface-raised text-text-muted opacity-0 shadow-1 transition-[opacity,background-color,color] group-hover/tile:opacity-100 hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed pressed:opacity-100 focus-visible:opacity-100 ${pressable}`}
        data-testid="home-tile-menu"
      >
        <IconDots className="size-icon-sm" aria-hidden />
      </AriaButton>
      <Popover placement="bottom end" offset={POPOVER_OFFSET} className={popoverClass}>
        <Menu aria-label={t('home.actions', { name: project.name })} className={menuClass} disabledKeys={ready ? [] : open ? ['rename', 'trash'] : ['open']} onAction={(key) => onAction(String(key))}>
          {item('open', <IconFolderOpen className="size-icon-sm text-text-muted" aria-hidden />, t('home.openProject'))}
          {item('rename', <IconPencil className="size-icon-sm text-text-muted" aria-hidden />, t('project.rename'))}
          {item('duplicate', <IconCopy className="size-icon-sm text-text-muted" aria-hidden />, t('project.duplicate'))}
          {item('reveal', <IconFolderSearch className="size-icon-sm text-text-muted" aria-hidden />, t('project.reveal'))}
          {item('tags', <IconTags className="size-icon-sm text-text-muted" aria-hidden />, t('home.tags.edit'))}
          {item('export', <IconFileExport className="size-icon-sm text-text-muted" aria-hidden />, t('project.exportPackage'))}
          <Separator className={menuSeparatorClass} />
          {item('trash', <IconTrash className="size-icon-sm text-text-muted" aria-hidden />, t('project.trash'))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

function ProjectTile({ project, open, disabled, when, onOpen }: { project: ProjectEntry; open: boolean; disabled: boolean; when: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const light = project.check ? t(`home.check.${project.check}`) : null;
  return (
    <AriaButton
      onPress={onOpen}
      isDisabled={disabled && !open}
      className={`group flex w-full flex-col overflow-hidden rounded-lg border bg-surface text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:focus-ring disabled:cursor-default ${open ? 'border-accent' : 'border-border'}`}
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
        {project.tags.length > 0 ? (
          <span className="truncate text-xs text-text-muted" data-testid="home-tile-tags">
            {project.tags.join(' · ')}
          </span>
        ) : null}
        <span className="flex items-center justify-between gap-2 text-xs text-text-subtle">
          <span className="truncate tabular-nums">{open ? t('home.openNow') : when}</span>
          {project.progress && project.progress.total > 0 ? (
            <span className="shrink-0 tabular-nums" data-testid="home-tile-progress">
              {t('parts.tile', project.progress)}
            </span>
          ) : null}
          {project.check && light ? <StatusDot tone={CHECK_TONE[project.check]} label={light} /> : null}
        </span>
      </div>
    </AriaButton>
  );
}
