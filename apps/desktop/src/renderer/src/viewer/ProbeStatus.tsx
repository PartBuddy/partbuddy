import { IconAlertCircle, IconLoader2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { refusalKind, refusalText } from './refusal';

/**
 * The line under a field that SolidCraft checks: a spinner while it checks (B-07), the ready hint, or
 * a red refusal in words with the raw message behind "Details" (B-01).
 */
export function ProbeStatus({ state, error, ready, testId }: { state: 'invalid' | 'probing' | 'ready' | 'refused'; error?: string | null | undefined; ready?: string; testId: string }) {
  const { t } = useTranslation();
  const raw = error ?? '';
  return (
    <div className="flex flex-col gap-1 text-xs" role="status" data-testid={testId} data-ok={state === 'ready' ? 'true' : state === 'refused' ? 'false' : undefined}>
      <p className={`flex items-start gap-1 ${state === 'refused' || state === 'invalid' ? 'text-danger' : 'text-text-muted'}`}>
        {state === 'probing' ? <IconLoader2 className="mt-px size-icon-sm shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden /> : null}
        {state === 'refused' ? <IconAlertCircle className="mt-px size-icon-sm shrink-0" aria-hidden /> : null}
        <span>{state === 'invalid' ? t('hud.invalid') : state === 'probing' ? t('hud.probing') : state === 'ready' ? (ready ?? t('hud.actionReady')) : refusalText(t, raw)}</span>
      </p>
      {state === 'refused' && raw && refusalKind(raw) !== 'limit' ? (
        <details className="text-text-subtle">
          <summary className="cursor-default">{t('hud.refused.details')}</summary>
          <p className="break-words">{raw}</p>
        </details>
      ) : null}
    </div>
  );
}
