import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { useStudio } from '../state/store';
import { Menu, MenuButton, MenuItem, MenuSection } from '../ui/Menu';

/** Theme, language and the prototype's simulated states (connection, loading, empty). */
export function SettingsMenu() {
  const { t } = useTranslation();
  const store = useStudio();

  const states: { section: string; items: { id: string; label: string; active: boolean; run: () => void }[] }[] = [
    {
      section: t('settings.theme'),
      items: (['light', 'dark'] as const).map((theme) => ({
        id: `theme-${theme}`,
        label: t(`settings.themes.${theme}`),
        active: store.theme === theme,
        run: () => {
          store.setTheme(theme);
        },
      })),
    },
    {
      section: t('settings.language'),
      items: (['en', 'de'] as const).map((locale) => ({
        id: `locale-${locale}`,
        label: t(`settings.languages.${locale}`),
        active: store.locale === locale,
        run: () => {
          store.setLocale(locale);
        },
      })),
    },
    {
      section: t('settings.simulate.solidcraft'),
      items: (['connected', 'rebuilding', 'disconnected'] as const).map((state) => ({
        id: `solidcraft-${state}`,
        label: t(`settings.simulate.solidcraftStates.${state}`),
        active: store.solidcraft === state,
        run: () => {
          store.setSolidcraft(state);
        },
      })),
    },
    {
      section: t('settings.simulate.local'),
      items: (['ready', 'processing', 'unreachable'] as const).map((state) => ({
        id: `local-${state}`,
        label: t(`settings.simulate.localStates.${state}`),
        active: store.localServer === state,
        run: () => {
          store.setLocalServer(state);
        },
      })),
    },
    {
      section: t('settings.simulate.projects'),
      items: (['ready', 'loading', 'empty'] as const).map((state) => ({
        id: `projects-${state}`,
        label: t(`settings.simulate.projectStates.${state}`),
        active: store.projectsState === state,
        run: () => {
          store.setProjectsState(state);
        },
      })),
    },
  ];
  return (
    <MenuButton
      trigger={
        <AriaButton
          aria-label={t('settings.label')}
          className="flex size-control-md items-center justify-center rounded-md text-text-muted outline-none hovered:bg-surface-hover hovered:text-text focus-visible:outline-2 focus-visible:outline-focus"
        >
          <IconAdjustmentsHorizontal className="size-icon" aria-hidden />
        </AriaButton>
      }
    >
      <Menu aria-label={t('settings.label')} shouldCloseOnSelect>
        {states.map((group) => (
          <MenuSection
            key={group.section}
            title={group.section}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={group.items.filter((item) => item.active).map((item) => item.id)}
            onSelectionChange={(keys) => {
              const [key] = keys === 'all' ? [] : [...keys];
              group.items.find((item) => item.id === key)?.run();
            }}
          >
            {group.items.map((item) => (
              <MenuItem key={item.id} id={item.id}>
                <span
                  aria-hidden
                  className={`size-dot rounded-full ${item.active ? 'bg-accent' : 'border border-border-strong'}`}
                />
                {item.label}
              </MenuItem>
            ))}
          </MenuSection>
        ))}
      </Menu>
    </MenuButton>
  );
}
