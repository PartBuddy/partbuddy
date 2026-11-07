import { IconCheck, IconCopy, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '../ui/Button';

function Action({ label, onPress, isDisabled, children, testId }: { label: string; onPress: () => void; isDisabled?: boolean; children: React.ReactNode; testId: string }) {
  return (
    <IconButton label={label} onPress={onPress} isDisabled={isDisabled ?? false} tooltipPlacement="bottom" data-testid={testId}>
      {children}
    </IconButton>
  );
}

/**
 * Copy (and for the user's own messages: send again) under a message, shown while the pointer or
 * the keyboard focus is on it (chat polish), so a finished conversation stays calm.
 */
export function MessageActions({ text, resend }: { text: string; resend?: (() => void) | null }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
      },
      (error: unknown) => {
        console.warn('PartBuddy: copying a message failed', error);
      },
    );
  };
  return (
    <div
      role="toolbar"
      aria-label={t('assistant.message.actions')}
      className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100"
      data-testid="message-actions"
    >
      <Action label={copied ? t('assistant.message.copied') : t('assistant.message.copy')} onPress={copy} testId="message-copy">
        {copied ? <IconCheck className="size-icon-sm text-success" aria-hidden /> : <IconCopy className="size-icon-sm" aria-hidden />}
      </Action>
      {resend !== undefined ? (
        <Action label={t('assistant.message.resend')} onPress={() => resend?.()} isDisabled={!resend} testId="message-resend">
          <IconRefresh className="size-icon-sm" aria-hidden />
        </Action>
      ) : null}
    </div>
  );
}
