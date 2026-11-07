import { IconLoader2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  ToggleButton as AriaToggleButton,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
  type ToggleButtonProps as AriaToggleButtonProps,
} from 'react-aria-components';

import { Tip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md';

/**
 * Shared by every pressable control (Fluent 2, Linear): hover, pressed, focus ring, disabled and
 * busy look the same everywhere. Disabled and busy controls get no hover (React Aria sets no
 * `data-hovered` on them).
 */
export const pressable =
  'outline-none transition-colors focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-disabled pending:cursor-wait';

const sizes: Record<ButtonSize, string> = {
  sm: 'h-control-sm gap-1 px-2 text-sm',
  md: 'h-control-md gap-1 px-3 text-md',
};

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover pressed:bg-accent-pressed',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-surface-hover pressed:bg-surface-pressed',
  quiet: 'text-text hover:bg-surface-hover pressed:bg-surface-pressed',
  danger: 'bg-danger-solid text-on-accent hover:bg-danger-solid-hover pressed:bg-danger-solid-pressed',
};

/** Class of a text button, for the few places that style a React Aria trigger themselves. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return `relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium ${sizes[size]} ${pressable} ${buttonVariants[variant]}`;
}

/** Spinner of a busy button: the label stays (and keeps the width), the spinner covers it. */
function Busy({ isPending, children }: { isPending: boolean; children: ReactNode }) {
  if (!isPending) return children;
  return (
    <>
      <span className="invisible contents">{children}</span>
      <span aria-hidden className="absolute inset-0 inline-flex items-center justify-center">
        <IconLoader2 className="size-icon animate-spin" />
      </span>
    </>
  );
}

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Extra layout classes (width, margin); never colours or states. */
  className?: string;
}

/** A text button: primary for the one main action of a view, secondary, quiet or danger. */
export function Button({ variant = 'secondary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <AriaButton {...props} className={`${buttonClass(variant, size)} ${className ?? ''}`}>
      {composeRenderProps(children, (content, { isPending }) => (
        <Busy isPending={isPending}>{content}</Busy>
      ))}
    </AriaButton>
  );
}

/**
 * A link or a button that reads like one (show more, keep as default, a source). Always underlined,
 * so colour is not the only sign (WCAG 1.4.1).
 */
export const linkClass = `rounded-sm text-accent-text underline underline-offset-2 hover:text-text pressed:text-text ${pressable}`;

const iconSizes: Record<ButtonSize, string> = { sm: 'size-control-sm', md: 'size-control-md' };

/** Class of an icon-only button (quiet: no frame until hovered). */
export function iconButtonClass(size: ButtonSize = 'sm', tone: 'quiet' | 'secondary' = 'quiet'): string {
  const look =
    tone === 'quiet'
      ? 'text-text-muted hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed pressed:text-text'
      : 'border border-border-strong bg-surface text-text hover:bg-surface-hover pressed:bg-surface-pressed';
  return `inline-flex shrink-0 items-center justify-center rounded-md ${iconSizes[size]} ${pressable} ${look}`;
}

export interface IconButtonProps extends Omit<AriaButtonProps, 'className' | 'aria-label'> {
  /** Accessible name and tooltip; icon-only buttons always have both. */
  label: string;
  shortcut?: string;
  /** Tooltip text when it should say more than the name (a hint, the state). */
  tooltip?: ReactNode;
  size?: ButtonSize;
  tone?: 'quiet' | 'secondary';
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

/** An icon-only button with its name as tooltip and the shortcut beside it (Figma, Linear). */
export function IconButton({ label, shortcut, tooltip, size = 'sm', tone = 'quiet', tooltipPlacement, className, ...props }: IconButtonProps) {
  return (
    <Tip label={tooltip ?? label} shortcut={shortcut} placement={tooltipPlacement}>
      <AriaButton aria-label={label} aria-keyshortcuts={shortcut} {...props} className={`${iconButtonClass(size, tone)} ${className ?? ''}`} />
    </Tip>
  );
}

/** Selected look of a toggle: the accent's quiet fill, as Fusion and Onshape mark an active tool. */
export const toggleSelected =
  'selected:bg-accent-subtle selected:text-accent-text selected:hover:bg-accent-subtle selected:pressed:bg-surface-selected';

export interface ToggleButtonProps extends Omit<AriaToggleButtonProps, 'className'> {
  size?: ButtonSize;
  className?: string;
}

/** A text button that stays pressed (on/off), framed like a secondary button. */
export function ToggleButton({ size = 'md', className, ...props }: ToggleButtonProps) {
  return (
    <AriaToggleButton
      {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border-strong bg-surface font-medium text-text hover:bg-surface-hover pressed:bg-surface-pressed selected:border-accent ${sizes[size]} ${pressable} ${toggleSelected} ${className ?? ''}`}
    />
  );
}

export interface IconToggleProps extends Omit<AriaToggleButtonProps, 'className' | 'aria-label'> {
  label: string;
  shortcut?: string;
  tooltip?: ReactNode;
  size?: ButtonSize;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

/** An icon-only toggle (a view tool that stays on), with tooltip. */
export function IconToggle({ label, shortcut, tooltip, size = 'sm', tooltipPlacement, className, ...props }: IconToggleProps) {
  return (
    <Tip label={tooltip ?? label} shortcut={shortcut} placement={tooltipPlacement}>
      <AriaToggleButton
        aria-label={label}
        aria-keyshortcuts={shortcut}
        {...props}
        className={`${iconButtonClass(size)} ${toggleSelected} ${className ?? ''}`}
      />
    </Tip>
  );
}
