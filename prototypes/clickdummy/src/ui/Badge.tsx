import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { verificationLevels, type VerificationLevel } from '../mock/design';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-muted border-border',
  accent: 'bg-accent-subtle text-accent-text border-transparent',
  success: 'bg-success-subtle text-success border-transparent',
  warning: 'bg-warning-subtle text-warning border-transparent',
  danger: 'bg-danger-subtle text-danger border-transparent',
  info: 'bg-info-subtle text-info border-transparent',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Status dot with a text label; colour is never the only signal. */
export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  const dot: Record<Tone, string> = {
    neutral: 'bg-text-subtle',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  };
  return (
    <span className="inline-flex items-center gap-1 text-sm text-text-muted">
      <span aria-hidden className={`size-dot rounded-full ${dot[tone]}`} />
      {label}
    </span>
  );
}

/**
 * Verification levels R · L · TG · SC · SL · PD. A level is filled only when its proof exists;
 * PD shows the number of print records.
 */
export function VerificationBadges({
  levels,
  printRecords = 0,
}: {
  levels: VerificationLevel[];
  printRecords?: number;
}) {
  const { t } = useTranslation();
  const reached = new Set(levels);
  const summary = verificationLevels
    .filter((level) => reached.has(level))
    .map((level) => t(`verification.${level}.name`))
    .join(', ');
  return (
    <span
      role="img"
      aria-label={t('verification.summary', { levels: summary || t('verification.none') })}
      className="inline-flex items-center gap-hairline"
    >
      {verificationLevels.map((level) => {
        const on = reached.has(level);
        return (
          <span
            key={level}
            className={`inline-flex h-4 items-center justify-center rounded-sm font-mono text-xs px-1 ${
              on ? 'bg-accent-subtle text-accent-text' : 'text-text-subtle'
            }`}
          >
            {level}
            {level === 'PD' && on && printRecords > 0 ? <span className="ml-hairline">·{printRecords}</span> : null}
          </span>
        );
      })}
    </span>
  );
}
