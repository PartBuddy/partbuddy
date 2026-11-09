import { IconAlertCircle, IconCircleCheck, IconX } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useStudio } from '../state/store';
import { IconButton } from '../ui/Button';

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
  useEffect(() => {
    if (notice?.tone !== 'success') return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, SUCCESS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice, setNotice]);
  const danger = notice?.tone === 'danger';
  return (
    // The live region stays mounted so screen readers announce every new text.
    <div role={danger ? 'alert' : 'status'} className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-center px-3">
      {notice ? (
        <div
          key={notice.text}
          className={`pointer-events-auto flex max-w-text-max animate-panel-in items-start gap-2 rounded-lg border bg-surface-raised py-2 pr-1 pl-3 text-sm text-text shadow-3 ${danger ? 'border-danger' : 'border-border'}`}
          data-tone={notice.tone}
        >
          {danger ? <IconAlertCircle className="mt-px size-icon-sm shrink-0 text-danger" aria-hidden /> : <IconCircleCheck className="mt-px size-icon-sm shrink-0 text-success" aria-hidden />}
          <span className="min-w-0 py-0.5" data-testid="notice">
            {notice.text}
          </span>
          <IconButton label={t('dialog.close')} onPress={() => setNotice(null)} data-testid="notice-close">
            <IconX className="size-icon-sm" aria-hidden />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
