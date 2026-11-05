import { IconSettings } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { useStudio } from '../state/store';

/** The gear in the title bar opens the settings (B6) at their first section. */
export function SettingsMenu() {
  const { t } = useTranslation();
  const setSection = useStudio((s) => s.setSettingsSection);
  return (
    <AriaButton
      aria-label={t('settings.title')}
      onPress={() => {
        setSection('general');
      }}
      className="inline-flex size-control-sm items-center justify-center rounded-md text-text outline-none hover:bg-surface-hover pressed:bg-surface-selected focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      data-testid="settings"
    >
      <IconSettings className="size-icon-sm" aria-hidden />
    </AriaButton>
  );
}
