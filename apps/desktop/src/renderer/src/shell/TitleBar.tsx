import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConnectionStatus } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { StatusDot, type Tone } from '../ui/Feedback';
import { BrandMark } from './BrandMark';
import { DesignActions } from './DesignActions';
import { SettingsMenu } from './SettingsMenu';

function connectionTone(status: ConnectionStatus): Tone {
  if (status.state === 'connected') return status.mirror === 'failed' ? 'warning' : status.mirror === 'rebuilding' ? 'info' : 'success';
  if (status.state === 'failed' || status.state === 'notInstalled') return 'danger';
  if (status.state === 'lost' || status.state === 'notRunning') return 'warning';
  return 'neutral';
}

function connectionLabelKey(status: ConnectionStatus): string {
  if (status.state === 'connected' && status.mirror === 'rebuilding') return 'solidcraft.rebuilding';
  return `solidcraft.${status.state}`;
}

/**
 * Colours the system's window buttons like the title bar, from the design tokens, now and on
 * every theme change (the main process cannot read CSS).
 */
function useWindowButtonColors(): void {
  useEffect(() => {
    const report = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      const height = Number.parseInt(read('--cs-titlebar-height'), 10);
      const color = read('--cs-color-surface');
      const symbolColor = read('--cs-color-text');
      if (!Number.isInteger(height) || !color || !symbolColor) return;
      // One pixel less, so the bar's bottom border stays visible under the buttons.
      void platform().window.setTitleBarColors({ color, symbolColor, height: height - 1 });
    };
    report();
    const query = matchMedia('(prefers-color-scheme: dark)');
    const changed = () => {
      requestAnimationFrame(report);
    };
    query.addEventListener('change', changed);
    return () => {
      query.removeEventListener('change', changed);
    };
  }, []);
}

export function TitleBar() {
  useWindowButtonColors();
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const model = useStudio((s) => s.model);
  const designName = model.status === 'ready' && model.designName ? model.designName : t('app.noDesign');

  return (
    <header className="title-bar flex h-titlebar shrink-0 items-center gap-3 border-b border-border bg-surface select-none" data-testid="title-bar">
      <div className="flex items-center gap-2">
        <BrandMark />
        <span className="font-display text-lg font-semibold text-text">{t('app.name')}</span>
      </div>
      <nav aria-label={t('app.design')} className="flex min-w-0 items-center gap-2 text-md">
        <span className="text-text-subtle">/</span>
        <span className="truncate font-medium text-text" data-testid="design-name">
          {designName}
        </span>
      </nav>
      <DesignActions />
      <div className="ml-auto flex items-center gap-2" data-testid="connection-status" data-engine={connection.engine}>
        <StatusDot
          tone={connectionTone(connection)}
          label={t(connectionLabelKey(connection), { revision: connection.revision ?? 0 })}
        />
      </div>
      <SettingsMenu />
    </header>
  );
}
