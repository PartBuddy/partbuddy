import { IconCommand } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { designRevision } from '../mock/design';
import { useStudio } from '../state/store';
import { Badge, StatusDot, VerificationBadges, type Tone } from '../ui/Badge';
import { IconButton } from '../ui/Button';
import { ProviderMenu } from './ProviderMenu';
import { SettingsMenu } from './SettingsMenu';

const solidcraftTone: Record<string, Tone> = { connected: 'success', rebuilding: 'info', disconnected: 'warning' };

export function TitleBar() {
  const { t } = useTranslation();
  const solidcraft = useStudio((s) => s.solidcraft);
  const partLevels = useStudio((s) => s.partLevels);
  const setPaletteOpen = useStudio((s) => s.setPaletteOpen);

  return (
    <header className="flex h-titlebar shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <div className="flex items-center gap-2">
        <span className="font-display text-lg font-semibold text-text">CAD-Studio</span>
        <Badge>{t('app.prototype')}</Badge>
      </div>
      <nav aria-label={t('app.breadcrumb')} className="flex min-w-0 items-center gap-2 text-md">
        <span className="text-text-muted">{t('app.project')}</span>
        <span className="text-text-subtle">/</span>
        <span className="truncate font-medium text-text">cable-clip v0.1.0</span>
        <VerificationBadges levels={partLevels} />
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <StatusDot
          tone={solidcraftTone[solidcraft] ?? 'neutral'}
          label={t(`solidcraft.${solidcraft}`, { revision: designRevision })}
        />
        <ProviderMenu />
        <IconButton
          label={t('palette.label')}
          shortcut="Ctrl K"
          icon={<IconCommand className="size-icon" aria-hidden />}
          onPress={() => {
            setPaletteOpen(true);
          }}
        />
        <SettingsMenu />
      </div>
    </header>
  );
}
