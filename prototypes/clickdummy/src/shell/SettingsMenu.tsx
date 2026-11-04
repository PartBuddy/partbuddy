import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';
import { useShallow } from 'zustand/react/shallow';

import { useStudio, type AnchorStatus } from '../state/store';
import { Menu, MenuButton, MenuItem, MenuSection } from '../ui/Menu';

interface Group {
  id: string;
  title: string;
  options: readonly string[];
  labelKey: string;
  active: string;
  select: (value: string) => void;
}

/** Theme, language and the prototype's simulated states (connections, loading, errors). */
export function SettingsMenu() {
  const { t } = useTranslation();
  const state = useStudio(
    useShallow((s) => ({
      theme: s.theme,
      locale: s.locale,
      solidcraft: s.solidcraft,
      localServer: s.localServer,
      cloud: s.cloud,
      projectsState: s.projectsState,
      timelineState: s.timelineState,
      modelFault: s.modelFault,
      anchorStatus: s.notes[0]?.anchor.status ?? 'attached',
    })),
  );
  const actions = useStudio.getState();

  const groups: Group[] = [
    { id: 'theme', title: t('settings.theme'), options: ['light', 'dark'], labelKey: 'settings.themes', active: state.theme, select: (v) => actions.setTheme(v as 'light' | 'dark') },
    { id: 'locale', title: t('settings.language'), options: ['en', 'de'], labelKey: 'settings.languages', active: state.locale, select: (v) => actions.setLocale(v as 'en' | 'de') },
    { id: 'solidcraft', title: t('settings.simulate.solidcraft'), options: ['connected', 'rebuilding', 'disconnected'], labelKey: 'settings.simulate.solidcraftStates', active: state.solidcraft, select: (v) => actions.setSolidcraft(v as typeof state.solidcraft) },
    { id: 'model', title: t('settings.simulate.model'), options: ['none', 'unreadable'], labelKey: 'settings.simulate.modelStates', active: state.modelFault, select: (v) => actions.setModelFault(v as typeof state.modelFault) },
    { id: 'timeline', title: t('settings.simulate.timeline'), options: ['ok', 'featureError'], labelKey: 'settings.simulate.timelineStates', active: state.timelineState, select: (v) => actions.setTimelineState(v as typeof state.timelineState) },
    { id: 'anchors', title: t('settings.simulate.anchors'), options: ['attached', 'moved', 'ambiguous', 'orphaned'], labelKey: 'settings.simulate.anchorStates', active: state.anchorStatus, select: (v) => actions.setAnchorStatus(v as AnchorStatus) },
    { id: 'cloud', title: t('settings.simulate.cloud'), options: ['ready', 'missingKey', 'rateLimited'], labelKey: 'settings.simulate.cloudStates', active: state.cloud, select: (v) => actions.setCloud(v as typeof state.cloud) },
    { id: 'local', title: t('settings.simulate.local'), options: ['ready', 'processing', 'unreachable'], labelKey: 'settings.simulate.localStates', active: state.localServer, select: (v) => actions.setLocalServer(v as typeof state.localServer) },
    { id: 'projects', title: t('settings.simulate.projects'), options: ['ready', 'loading', 'empty'], labelKey: 'settings.simulate.projectStates', active: state.projectsState, select: (v) => actions.setProjectsState(v as typeof state.projectsState) },
  ];

  return (
    <MenuButton
      trigger={
        <AriaButton
          aria-label={t('settings.label')}
          className="flex size-control-md items-center justify-center rounded-md text-text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
        >
          <IconAdjustmentsHorizontal className="size-icon" aria-hidden />
        </AriaButton>
      }
    >
      <Menu aria-label={t('settings.label')} shouldCloseOnSelect>
        {groups.map((group) => (
          <MenuSection
            key={group.id}
            title={group.title}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[`${group.id}:${group.active}`]}
            onSelectionChange={(keys) => {
              const [key] = keys === 'all' ? [] : [...keys];
              if (typeof key === 'string') group.select(key.slice(group.id.length + 1));
            }}
          >
            {group.options.map((option) => (
              <MenuItem key={option} id={`${group.id}:${option}`}>
                <span
                  aria-hidden
                  className={`size-dot rounded-full ${option === group.active ? 'bg-accent' : 'border border-border-strong'}`}
                />
                {t(`${group.labelKey}.${option}`)}
              </MenuItem>
            ))}
          </MenuSection>
        ))}
      </Menu>
    </MenuButton>
  );
}
