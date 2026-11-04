import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { Busy, EmptyState } from '../ui/Feedback';

/**
 * Explains every connection state in place of the model or above it, with the next action
 * (feature catalogue: "no silent failures").
 */
export function ConnectionNotice() {
  const { t } = useTranslation();
  const connection = useStudio((s) => s.connection);
  const model = useStudio((s) => s.model);
  const hasModel = model.status === 'ready' && model.bodies.length > 0;

  const retry = (
    <Button
      onPress={() => {
        void platform().solidcraft.retry();
      }}
    >
      {t('connection.retry')}
    </Button>
  );
  const start = (
    <Button
      variant="primary"
      onPress={() => {
        void platform().solidcraft.start();
      }}
    >
      {t('connection.start')}
    </Button>
  );

  const card = (title: string, body: string | null, actions: ReactNode) => (
    <div
      role="status"
      className="pointer-events-auto flex max-w-text-max flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 shadow-2"
    >
      <p className="text-md font-semibold text-text">{title}</p>
      {body ? <p className="text-sm text-text-muted">{body}</p> : null}
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );

  switch (connection.state) {
    case 'searching':
    case 'connecting':
      return hasModel ? null : (
        <div className="pointer-events-auto rounded-md bg-surface-raised px-2 py-1 shadow-2">
          <Busy label={t(`solidcraft.${connection.state}`)} />
        </div>
      );
    case 'notInstalled':
      return card(t('connection.notInstalledTitle'), t('connection.notInstalledBody'), retry);
    case 'notRunning':
      return card(
        t('connection.notRunningTitle'),
        t('connection.notRunningBody'),
        <>
          {start}
          {retry}
        </>,
      );
    case 'starting':
      return card(t('connection.startingTitle'), t('connection.startingBody'), <Busy label={t('solidcraft.starting')} />);
    case 'lost':
      return card(t('connection.lostTitle'), t('connection.lostBody'), retry);
    case 'failed':
      return card(
        t('connection.failedTitle'),
        t('connection.failedBody', { detail: connection.detail ?? '–' }),
        <>
          {start}
          {retry}
        </>,
      );
    case 'connected':
      if (connection.mirror === 'failed') {
        return card(t('connection.mirrorFailedTitle'), t('connection.mirrorFailedBody', { detail: connection.detail ?? '–' }), null);
      }
      if (model.status === 'error') {
        return card(t('viewer.errorTitle'), t('viewer.errorBody', { message: model.message }), null);
      }
      if (model.status === 'ready' && model.bodies.length === 0) {
        return (
          <div className="pointer-events-auto flex w-full flex-1 items-center justify-center">
            <EmptyState title={t('connection.emptyTitle')} body={t('connection.emptyBody')} />
          </div>
        );
      }
      return model.status === 'waiting' ? (
        <div className="pointer-events-auto rounded-md bg-surface-raised px-2 py-1 shadow-2">
          <Busy label={t('viewer.loading')} />
        </div>
      ) : null;
  }
}
