import type { ReactNode } from 'react';
import { ProgressBar } from 'react-aria-components';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

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
