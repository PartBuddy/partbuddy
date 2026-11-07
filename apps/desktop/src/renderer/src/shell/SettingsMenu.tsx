import { IconSettings } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { useStudio } from '../state/store';
import { IconButton } from '../ui/Button';

/** The gear in the title bar opens the settings (B6) at their first section. */
export function SettingsMenu() {
  const { t } = useTranslation();
  const setSection = useStudio((s) => s.setSettingsSection);
  return (
    <IconButton
      label={t('settings.title')}
      onPress={() => {
        setSection('general');
      }}
      data-testid="settings"
    >
      <IconSettings className="size-icon-sm" aria-hidden />
    </IconButton>
  );
}
