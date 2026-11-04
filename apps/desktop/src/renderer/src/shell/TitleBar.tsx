import { useTranslation } from 'react-i18next';

import type { ConnectionStatus } from '../../../shared/contract';
import { useStudio } from '../state/store';
import { StatusDot, type Tone } from '../ui/Feedback';
import { BrandMark } from './BrandMark';

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

export function TitleBar() {
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const model = useStudio((s) => s.model);
  const designName = model.status === 'ready' && model.designName ? model.designName : t('app.noDesign');

  return (
    <header className="flex h-titlebar shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
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
      <div className="ml-auto flex items-center gap-2" data-testid="connection-status" data-engine={connection.engine}>
        <StatusDot
          tone={connectionTone(connection)}
          label={t(connectionLabelKey(connection), { revision: connection.revision ?? 0 })}
        />
      </div>
    </header>
  );
}
