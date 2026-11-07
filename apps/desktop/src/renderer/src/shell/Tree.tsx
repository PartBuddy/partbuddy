import { IconChevronRight } from '@tabler/icons-react';
import { createContext, useContext, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button as AriaButton, Menu, MenuItem, Popover } from 'react-aria-components';
import { pressable } from '../ui/Button';
import { fieldBox } from '../ui/Field';
import { POPOVER_OFFSET, menuClass, menuItemClass, popoverClass } from '../ui/Overlay';

/**
 * The structure tree's frame (CAD-style browser): one ARIA tree with a roving tab stop, sections
 * that fold, rows with a context menu and in-place renaming. Arrow keys move between rows, Home
 * and End jump; each row handles its own Enter, F2, Space, Left and Right.
 */
const Roving = createContext<{ current: string; setCurrent: (id: string) => void }>({ current: '', setCurrent: () => undefined });

const rows = (tree: Element) => [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]:not([data-extra])')];

export function Tree({ label, first, children, testId }: { label: string; first: string; children: ReactNode; testId: string }) {
  const [current, setCurrent] = useState(first);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!from || event.target !== from) return;
    const all = rows(event.currentTarget);
    const at = all.indexOf(from);
    const to = event.key === 'ArrowDown' ? all[at + 1] : event.key === 'ArrowUp' ? all[at - 1] : event.key === 'Home' ? all[0] : event.key === 'End' ? all.at(-1) : undefined;
    if (!to) return;
    event.preventDefault();
    to.focus();
  };
  // The tab stop falls back to the first row when the row that had it is gone.
  const stop = (tree: HTMLDivElement | null) => {
    if (tree && !tree.querySelector(`[data-tree-id="${CSS.escape(current)}"]`)) setCurrent(first);
  };
  return (
    <Roving.Provider value={{ current, setCurrent }}>
      <div ref={stop} role="tree" aria-label={label} onKeyDown={onKeyDown} className="flex w-menu shrink-0 flex-col overflow-y-auto border-r border-border bg-surface py-1" data-testid={testId}>
        {children}
      </div>
    </Roving.Provider>
  );
}

/** Tab stop, focus tracking and the move to the parent row (Left on a closed or leaf row). */
function useRow(id: string) {
  const { current, setCurrent } = useContext(Roving);
  return {
    'data-tree-id': id,
    tabIndex: current === id ? 0 : -1,
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setCurrent(id);
    },
  };
}

const toParent = (row: HTMLElement) => row.parentElement?.closest('[role="group"]')?.previousElementSibling as HTMLElement | null | undefined;

/** A folding section: chevron, type icon, name and a count badge; Left and Right fold it. */
export function TreeSection({
  id,
  icon,
  title,
  label,
  count,
  meta,
  children,
  testId,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  /** What a screen reader says for the head, the title with the count ("Bodies (3)"). */
  label: string;
  count: number;
  meta?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(true);
  const row = useRow(id);
  return (
    <div className="border-border not-first:border-t" data-testid={testId}>
      <div
        {...row}
        role="treeitem"
        aria-level={1}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ' || (event.key === 'ArrowLeft' && open) || (event.key === 'ArrowRight' && !open)) {
            event.preventDefault();
            setOpen(!open);
          } else if (event.key === 'ArrowRight' && open) {
            event.preventDefault();
            (event.currentTarget.nextElementSibling?.querySelector('[role="treeitem"]:not([data-extra])') as HTMLElement | null)?.focus();
          }
        }}
        className="flex h-row cursor-default items-center gap-2 pr-2 pl-1 text-sm font-semibold text-text outline-none select-none hover:bg-surface-hover focus-visible:focus-ring-inset"
      >
        <IconChevronRight className={`size-icon-sm shrink-0 text-text-subtle transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
        <span className="inline-flex shrink-0 text-text-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate">
          {title}
          <span className="sr-only">{label.slice(title.length)}</span>
        </span>
        {meta}
        <span className="inline-flex h-icon min-w-icon items-center justify-center rounded-full bg-surface-sunken px-1 text-xs font-medium text-text-muted tabular-nums" aria-hidden>
          {count}
        </span>
      </div>
      {open ? (
        <div role="group" className="relative pb-1 before:absolute before:top-0 before:bottom-1 before:left-3 before:border-l before:border-border">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** An empty section: icon, one short line and one action. */
export function TreeEmpty({ icon, text, action }: { icon: ReactNode; text: string; action?: { label: string; icon: ReactNode; onPress: () => void; testId: string } }) {
  return (
    <TreeExtra className="relative mr-2 mb-2 ml-5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-hairline rounded-md border border-dashed border-border bg-surface px-2 py-1 text-xs text-text-subtle">
      <span className="inline-flex text-text-subtle">{icon}</span>
      <span className="min-w-0">{text}</span>
      {action ? (
        <AriaButton
          onPress={action.onPress}
          className={`col-start-2 -ml-1 inline-flex h-control-sm items-center gap-1 justify-self-start rounded-sm px-1 font-medium text-accent-text hover:bg-accent-subtle pressed:bg-surface-pressed ${pressable}`}
          data-testid={action.testId}
        >
          {action.icon}
          {action.label}
        </AriaButton>
      ) : null}
    </TreeExtra>
  );
}

/**
 * Content under a row that is not a row itself (an empty state, the parts details, a note's
 * actions): a tree may only hold rows, so it is one, left out of the arrow keys and reached with Tab.
 */
export function TreeExtra({ className, children, testId }: { className?: string; children: ReactNode; testId?: string }) {
  return (
    <div role="treeitem" aria-level={3} aria-selected={false} data-extra className={className} data-testid={testId}>
      {children}
    </div>
  );
}

export interface TreeAction {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  onAction: () => void;
}

/**
 * One row: click selects, double-click runs `onOpen`, Enter selects (or `onEnter`), F2 renames,
 * Space toggles visibility, Right and Left open and close the row's details. The context menu
 * (right click, the menu key or Shift+F10) lists `actions`.
 */
export function TreeItem({
  id,
  label,
  selected,
  dimmed,
  expanded,
  onExpand,
  onSelect,
  onOpen,
  onEnter,
  onSpace,
  onRename,
  rename,
  actions,
  children,
  testId,
  data,
  className = '',
}: {
  id: string;
  label: string;
  selected?: boolean;
  dimmed?: boolean;
  expanded?: boolean;
  onExpand?: (open: boolean) => void;
  onSelect?: () => void;
  onOpen?: () => void;
  onEnter?: () => void;
  onSpace?: () => void;
  /** Starts renaming in place (F2 and the menu); `rename` then holds the field. */
  onRename?: () => void;
  rename?: ReactNode;
  actions?: TreeAction[];
  children: ReactNode;
  testId?: string;
  data?: Record<string, string | boolean>;
  className?: string;
}) {
  const row = useRow(id);
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const dataAttributes = Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, String(value)]));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const handled = (run: (() => void) | undefined) => {
      if (!run) return;
      event.preventDefault();
      run();
    };
    if (event.key === 'Enter') handled(onEnter ?? onSelect);
    else if (event.key === 'F2') handled(onRename);
    else if (event.key === ' ') handled(onSpace);
    else if (event.key === 'ArrowRight' && expanded === false) handled(() => onExpand?.(true));
    else if (event.key === 'ArrowLeft' && expanded === true) handled(() => onExpand?.(false));
    else if (event.key === 'ArrowLeft') handled(() => toParent(event.currentTarget)?.focus());
    else if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && actions?.length) handled(() => setMenu(true));
  };
  return (
    <>
      <div
        {...row}
        {...dataAttributes}
        ref={ref}
        role="treeitem"
        aria-level={2}
        aria-label={label}
        aria-selected={selected ?? false}
        {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
        onClick={(event) => {
          if (event.detail <= 1) onSelect?.();
        }}
        onDoubleClick={onOpen}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => {
          if (!actions?.length) return;
          event.preventDefault();
          onSelect?.();
          setMenu(true);
        }}
        className={`relative mr-1 flex h-control-sm cursor-default items-center gap-2 rounded-r-sm pr-1 pl-5 text-sm outline-none select-none focus-visible:focus-ring-inset ${
          selected ? 'bg-surface-selected before:absolute before:top-0 before:bottom-0 before:left-3 before:border-l-2 before:border-accent' : 'hover:bg-surface-hover'
        } ${dimmed ? 'text-text-subtle' : 'text-text'} ${className}`}
        data-testid={testId}
      >
        {rename ?? children}
      </div>
      {actions?.length ? (
        <Popover triggerRef={ref} isOpen={menu} onOpenChange={setMenu} placement="bottom start" offset={POPOVER_OFFSET} className={popoverClass}>
          <Menu
            aria-label={label}
            autoFocus="first"
            onAction={(key) => {
              actions.find((action) => action.id === key)?.onAction();
            }}
            onClose={() => {
              setMenu(false);
              ref.current?.focus();
            }}
            className={menuClass}
            data-testid="tree-menu"
          >
            {actions.map((action) => (
              <MenuItem key={action.id} id={action.id} textValue={action.label} className={menuItemClass}>
                <span className="inline-flex text-text-muted">{action.icon}</span>
                <span className="flex-1">{action.label}</span>
                {action.shortcut ? <span className="text-xs text-text-subtle">{action.shortcut}</span> : null}
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      ) : null}
    </>
  );
}

/** The name field of a row being renamed: Enter keeps the name, Escape and leaving cancel. */
export function RenameField({ name, label, onDone }: { name: string; label: string; onDone: (name: string | null) => void }) {
  return (
    <input
      aria-label={label}
      defaultValue={name}
      // renaming starts in the field, as in every file browser
      autoFocus
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          const next = event.currentTarget.value.trim();
          onDone(next && next !== name ? next : null);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onDone(null);
        }
      }}
      onBlur={() => {
        onDone(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      className={`h-control-sm min-w-0 flex-1 px-1 text-sm ${fieldBox}`}
      data-testid="tree-rename"
    />
  );
}
