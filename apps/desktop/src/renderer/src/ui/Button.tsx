import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex h-control-md items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 font-medium text-md outline-none ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover pressed:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-surface-hover pressed:bg-surface-selected',
};

export interface ButtonProps extends Omit<AriaButtonProps, 'className'> {
  variant?: Variant;
}

export function Button({ variant = 'secondary', ...props }: ButtonProps) {
  return <AriaButton {...props} className={`${base} ${variants[variant]}`} />;
}
