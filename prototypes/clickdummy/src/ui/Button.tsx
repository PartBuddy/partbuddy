import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Tooltip,
  TooltipTrigger,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md font-medium text-md outline-none ' +
  'transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hovered:bg-accent-hover pressed:bg-accent-hover',
  secondary:
    'border border-border-strong bg-surface text-text hovered:bg-surface-hover pressed:bg-surface-selected',
  quiet: 'bg-transparent text-text hovered:bg-surface-hover pressed:bg-surface-selected',
  danger: 'border border-border-strong bg-surface text-danger hovered:bg-danger-subtle',
};

const sizes: Record<Size, string> = {
  sm: 'h-control-sm px-2 text-sm',
  md: 'h-control-md px-3',
};

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonProps) {
  return <AriaButton {...props} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} />;
}

export interface IconButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  selected?: boolean;
  size?: Size;
}

/** Square icon button with an accessible name and a tooltip. */
export function IconButton({ label, icon, shortcut, selected = false, size = 'md', ...props }: IconButtonProps) {
  const square = size === 'sm' ? 'size-control-sm' : 'size-control-md';
  return (
    <TooltipTrigger delay={500}>
      <AriaButton
        {...props}
        aria-label={label}
        {...(selected ? { 'aria-pressed': true } : {})}
        className={`${base} ${square} ${selected ? 'bg-surface-selected text-accent-text' : 'text-text-muted hovered:bg-surface-hover hovered:text-text'}`}
      >
        {icon}
      </AriaButton>
      <Tooltip
        offset={6}
        className="rounded-sm bg-surface-raised px-2 py-1 text-sm text-text shadow-2 border border-border entering:animate-none"
      >
        {label}
        {shortcut ? <kbd className="ml-2 font-mono text-xs text-text-muted">{shortcut}</kbd> : null}
      </Tooltip>
    </TooltipTrigger>
  );
}
