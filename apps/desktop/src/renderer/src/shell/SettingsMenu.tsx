import { IconCheck, IconDeviceDesktop, IconMoon, IconSettings, IconSun } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';

import type { Theme } from '../../../shared/contract';
import { platform } from '../platform';

const THEMES: { theme: Theme; icon: typeof IconSun }[] = [
  { theme: 'system', icon: IconDeviceDesktop },
  { theme: 'light', icon: IconSun },
  { theme: 'dark', icon: IconMoon },
];

/**
 * Settings in the title bar (UI upgrade, 2026-11-04). For now the colour theme: follow Windows,
 * light or dark. The main process keeps the choice and sets Chromium's colour scheme, so the
 * design tokens, the 3D view and the window buttons all follow.
 */
export function SettingsMenu() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    let current = true;
    void platform()
      .window.theme()
      .then((stored) => {
        if (current) setTheme(stored);
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <MenuTrigger>
      <AriaButton
        aria-label={t('settings.title')}
        className="inline-flex size-control-sm items-center justify-center rounded-md text-text outline-none hover:bg-surface-hover pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        data-testid="settings"
      >
        <IconSettings className="size-icon-sm" aria-hidden />
      </AriaButton>
      <Popover placement="bottom end" offset={4} className="min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2">
        <Menu
          aria-label={t('settings.title')}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[theme]}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const [key] = [...keys];
            if (key !== 'system' && key !== 'light' && key !== 'dark') return;
            setTheme(key);
            void platform().window.setTheme(key);
          }}
          className="outline-none"
        >
          <MenuSection>
            <Header className="px-2 py-1 text-xs font-semibold text-text-muted">{t('settings.theme.title')}</Header>
            {THEMES.map(({ theme: id, icon: Icon }) => (
              <MenuItem
                key={id}
                id={id}
                textValue={t(`settings.theme.${id}`)}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm text-text outline-none focus:bg-surface-hover"
              >
                {({ isSelected }) => (
                  <>
                    <Icon className="size-icon-sm text-text-muted" aria-hidden />
                    <span className="flex-1">{t(`settings.theme.${id}`)}</span>
                    {isSelected ? <IconCheck className="size-icon-sm text-accent-text" aria-hidden /> : null}
                  </>
                )}
              </MenuItem>
            ))}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
