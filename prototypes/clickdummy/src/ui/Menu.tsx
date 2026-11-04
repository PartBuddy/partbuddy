import type { ReactNode } from 'react';
import {
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Popover,
  Separator,
  type MenuItemProps,
  type MenuSectionProps,
  type MenuProps,
} from 'react-aria-components';

export const popoverClass =
  'min-w-menu rounded-lg border border-border bg-surface-raised p-1 shadow-3 outline-none entering:animate-none';

export function MenuButton({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <MenuTrigger>
      {trigger}
      <Popover placement="bottom end" offset={4} className={popoverClass}>
        {children}
      </Popover>
    </MenuTrigger>
  );
}

export function Menu<T extends object>(props: MenuProps<T>) {
  return <AriaMenu {...props} className="max-h-menu-max overflow-auto outline-none" />;
}

export function MenuItem({ children, ...props }: Omit<MenuItemProps, 'className'> & { children: ReactNode }) {
  return (
    <AriaMenuItem
      {...props}
      className="group flex min-h-control-md cursor-default items-center gap-2 rounded-md px-2 py-1 text-md text-text outline-none focused:bg-surface-hover selected:font-medium disabled:text-text-subtle"
    >
      {children}
    </AriaMenuItem>
  );
}

export function MenuSection({
  title,
  children,
  ...props
}: { title: string; children: ReactNode } & Omit<MenuSectionProps<object>, 'children' | 'className'>) {
  return (
    <AriaMenuSection {...props}>
      <Header className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">{title}</Header>
      {children}
    </AriaMenuSection>
  );
}

export function MenuSeparator() {
  return <Separator className="mx-1 my-1 border-t border-border" />;
}
