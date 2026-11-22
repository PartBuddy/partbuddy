import { IconAlertCircle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button, IconButton } from '../ui/Button';

/** How long a success stays (Sonner, Carbon: 3–5 s); an error stays until it is closed or replaced. */
const SUCCESS_MS = 4000;

/**
 * The feedback of the last action (saved, inserted, failed) as a card above the timeline, with an icon
 * and a close button, instead of plain text at the right end of the status bar (audit X-05, M-10).
 */
export function Toast() {
  const { t } = useTranslation();
  const notice = useStudio((s) => s.notice);
  const setNotice = useStudio((s) => s.setNotice);
  // A new version found by the look after the start stays until it is closed: the user decides in the settings.
  useEffect(
    () =>
      platform().updates.onState((state) => {
        if (state.state === 'available')
          setNotice({
            tone: 'info',
            text: t('updates.notice', { version: state.version }),
            // Download at once; the settings show its progress and the install (usability U-16).
            action: {
              label: t('updates.download'),
              testId: 'notice-update',
              run: () => {
                void platform().updates.download();
                useStudio.getState().setSettingsSection('about');
              },
            },
          });
      }),
    [setNotice, t],
  );
  // Back after SolidCraft ended on its own (it is started again, usability U-24): say so once.
  const connection = useStudio((s) => s.connection.state);
  const lost = useRef(false);
  useEffect(() => {
    if (connection === 'lost') lost.current = true;
    if (connection === 'connected' && lost.current) {
      lost.current = false;
      setNotice({ tone: 'info', text: t('connection.restarted') });
    }
  }, [connection, setNotice, t]);
  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, notice.action ? SUCCESS_MS * 2 : SUCCESS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice, setNotice]);
  const danger = notice?.tone === 'danger';
  return (
    // The live region stays mounted so screen readers announce every new text.
    <div role={danger ? 'alert' : 'status'} className="pointer-events-none absolute inset-x-0 bottom-7 z-30 flex justify-center px-3">
      {notice ? (
        <div
          key={notice.text}
          className={`pointer-events-auto flex max-w-text-max animate-panel-in items-start gap-2 rounded-lg border bg-surface-raised py-2 pr-1 pl-3 text-sm text-text shadow-3 ${danger ? 'border-danger' : 'border-border'}`}
          data-tone={notice.tone}
        >
          {danger ? (
            <IconAlertCircle className="mt-px size-icon-sm shrink-0 text-danger" aria-hidden />
          ) : notice.tone === 'info' ? (
            <IconInfoCircle className="mt-px size-icon-sm shrink-0 text-accent" aria-hidden />
          ) : <IconCircleCheck className="mt-px size-icon-sm shrink-0 text-success" aria-hidden />}
          <span className="min-w-0 py-px" data-testid="notice">
            {notice.text}
          </span>
          {notice.action ? (
            <Button
              size="sm"
              onPress={() => {
                notice.action?.run();
                setNotice(null);
              }}
              data-testid={notice.action.testId ?? 'notice-action'}
            >
              {notice.action.label}
            </Button>
          ) : null}
          <IconButton label={t('dialog.close')} onPress={() => setNotice(null)} data-testid="notice-close">
            <IconX className="size-icon-sm" aria-hidden />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
