import type { ReactNode } from 'react';
import { ProgressBar } from 'react-aria-components';

import type { Tone } from './Badge';

/** Designed empty state: what is missing, why, and the next action. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center">
      <p className="text-md font-semibold text-text">{title}</p>
      <p className="max-w-text-max text-sm text-text-muted">{body}</p>
      {action}
    </div>
  );
}

/** Indeterminate progress with an accessible label. */
export function Busy({ label }: { label: string }) {
  return (
    <ProgressBar isIndeterminate aria-label={label} className="flex items-center gap-2 text-sm text-text-muted">
      <span aria-hidden className="relative h-1 w-progress overflow-hidden rounded-full bg-surface-sunken">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-progress rounded-full bg-accent" />
      </span>
      {label}
    </ProgressBar>
  );
}

/** Inline banner for connection and capability problems. */
export function Banner({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: 'border-border bg-surface-sunken text-text',
    accent: 'border-transparent bg-accent-subtle text-text',
    success: 'border-transparent bg-success-subtle text-text',
    warning: 'border-transparent bg-warning-subtle text-text',
    danger: 'border-transparent bg-danger-subtle text-text',
    info: 'border-transparent bg-info-subtle text-text',
  };
  const titleTone: Record<Tone, string> = {
    neutral: 'text-text',
    accent: 'text-accent-text',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  };
  return (
    <div role="status" className={`rounded-md border px-3 py-2 text-sm ${styles[tone]}`}>
      <p className={`font-semibold ${titleTone[tone]}`}>{title}</p>
      {children ? <div className="mt-1 text-text-muted">{children}</div> : null}
    </div>
  );
}
