import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip as AriaTooltip, TooltipTrigger, type TooltipProps } from 'react-aria-components';

/** The tooltip surface (Linear, Fluent 2): small, raised, framed so it reads on white panels too. */
export const tooltipClass =
  'max-w-text-max rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text shadow-2 ' +
  'entering:animate-pop-in exiting:animate-pop-out placement-bottom:[--cs-pop-y:calc(var(--cs-motion-offset)*-1)] ' +
  'placement-top:[--cs-pop-y:var(--cs-motion-offset)] placement-left:[--cs-pop-x:var(--cs-motion-offset)] placement-left:[--cs-pop-y:0] ' +
  'placement-right:[--cs-pop-x:calc(var(--cs-motion-offset)*-1)] placement-right:[--cs-pop-y:0]';

/**
 * A shortcut such as "Ctrl+N" as the reader's keyboard names it ("Strg+N" in German), in the interface
 * font with even digits: one look in menus and tooltips (audit X-01, A-11).
 */
export function Shortcut({ keys, className }: { keys: string; className?: string }) {
  const { t } = useTranslation();
  const label = keys
    .split('+')
    .map((key) => (key.length > 1 ? t(`settings.keys.token.${key.toLowerCase()}`, { defaultValue: key }) : key))
    .join('+');
  return <kbd className={`font-sans text-text-subtle tabular-nums ${className ?? ''}`}>{label}</kbd>;
}

/** Label and, when there is one, the shortcut beside it in a quieter tone. */
export function TipText({ label, shortcut }: { label: ReactNode; shortcut?: string | undefined }) {
  return (
    <>
      {label}
      {shortcut ? <Shortcut keys={shortcut} className="ml-2" /> : null}
    </>
  );
}

export interface TipProps extends Omit<TooltipProps, 'children' | 'className' | 'placement'> {
  placement?: TooltipProps['placement'] | undefined;
  /** The element that shows the tooltip; it must be focusable (a React Aria button or link). */
  children: ReactElement;
  label: ReactNode;
  shortcut?: string | undefined;
  delay?: number;
  isDisabled?: boolean;
}

/** A tooltip for one control, shown on hover after a short delay and on keyboard focus at once. */
export function Tip({ children, label, shortcut, delay = 500, isDisabled, offset = 6, placement, ...props }: TipProps) {
  return (
    <TooltipTrigger delay={delay} closeDelay={0} isDisabled={isDisabled ?? false}>
      {children}
      <AriaTooltip offset={offset} placement={placement ?? 'top'} {...props} className={tooltipClass}>
        <TipText label={label} shortcut={shortcut} />
      </AriaTooltip>
    </TooltipTrigger>
  );
}
