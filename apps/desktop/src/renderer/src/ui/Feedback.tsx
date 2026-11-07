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

/** The colour of a status dot by tone; used wherever a dot stands beside its text. */
export const dotTone: Record<Tone, string> = {
  neutral: 'bg-text-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

const badgeTone: Record<Tone, string> = {
  neutral: 'bg-surface-hover text-text-muted',
  accent: 'bg-accent-subtle text-accent-text',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
};

/** A small label for a state or a count (Linear, GitHub): quiet fill, text in the tone, 4.5:1 checked. */
export function badgeClass(tone: Tone = 'neutral', strong = false): string {
  const look = strong ? (tone === 'accent' ? 'bg-accent text-on-accent' : badgeTone[tone]) : badgeTone[tone];
  return `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium tabular-nums ${look}`;
}

/** Status dot with a text label; colour is never the only signal. */
export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-text-muted">
      <span aria-hidden className={`size-dot rounded-full ${dotTone[tone]}`} />
      {label}
    </span>
  );
}
