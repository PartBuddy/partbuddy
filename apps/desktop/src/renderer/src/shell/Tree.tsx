import { IconChevronRight } from '@tabler/icons-react';
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Menu, MenuItem, Popover } from 'react-aria-components';
import { ChatResizer } from './ChatResizer';
import { pressable } from '../ui/Button';
import { fieldBox } from '../ui/Field';
import { POPOVER_OFFSET, menuClass, menuItemClass, popoverClass } from '../ui/Overlay';
import { Shortcut } from '../ui/Tooltip';

/**
 * The structure tree's frame (CAD-style browser): one ARIA tree with a roving tab stop, sections
 * that fold, rows with a context menu and in-place renaming. Arrow keys move between rows, Home
 * and End jump; each row handles its own Enter, F2, Space, Left and Right.
 */
const Roving = createContext<{ current: string; setCurrent: (id: string) => void }>({ current: '', setCurrent: () => undefined });
/** The level of the row whose group the content sits in (a section 1, a folder its own), for a TreeExtra's level. */
const Depth = createContext(1);

/** Kept in the renderer's localStorage: which sections and groups are open and how high a section was dragged. */
function useStored<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Without storage it lasts until the window closes.
    }
  };
  return [value, set];
}

/** The smallest a section dragged up may be: its head and one row. */
const LEAST_SECTION = 56;

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
      {/* Each open section scrolls on its own, heads stay in sight; the tree scrolls only when the window is too low for all of them. */}
      <div ref={stop} role="tree" aria-label={label} onKeyDown={onKeyDown} className="flex w-full min-w-0 flex-col overflow-y-auto border-r border-border bg-surface py-1" data-testid={testId}>
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

/**
 * A folding section: chevron, type icon, name and a count badge; Left and Right fold it. Open or closed and a height
 * dragged at its lower edge are remembered (decided 2026-11-14); without a dragged height it is as high as its rows
 * and gives way with a scrollbar of its own when the sections do not fit, the more the more rows it has, keeping up
 * to five rows in sight; an empty one does not give way. An empty section starts folded, its head and its 0 only,
 * and opens once it has rows, unless the user opened or closed it: that choice is kept (decided 2026-11-14).
 */
export function TreeSection({
  id,
  icon,
  title,
  label,
  count,
  empty = count === 0,
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
  /** Nothing to show but its hint (default: a count of 0). */
  empty?: boolean;
  meta?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  // null: the user has not chosen, so it is open when it has something to show.
  const [chosen, choose] = useStored<boolean | null>(`partbuddy.tree.${id}.open`, null);
  const open = chosen ?? !empty;
  // A choice the default makes anyway is not kept, so a section closed while empty opens with its first row.
  const setOpen = (next: boolean) => {
    choose(next === !empty ? null : next);
  };
  const [height, setHeight] = useStored<number | null>(`partbuddy.tree.${id}.height`, null);
  const box = useRef<HTMLDivElement>(null);
  // The height on screen, for the divider's value while the section is as high as its rows.
  const [actual, setActual] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setActual(Math.round(entry?.borderBoxSize[0]?.blockSize ?? 0));
    });
    observer.observe(box.current);
    return () => {
      observer.disconnect();
    };
  }, []);
  const row = useRow(id);
  const room = () => box.current?.parentElement?.clientHeight ?? 2000;
  const shown = Math.min(Math.max(count, 1), 5);
  return (
    <div
      ref={box}
      className="relative flex min-h-0 flex-col border-border not-first:border-t"
      style={open ? (height === null ? { flex: `0 ${String(count)} auto`, minHeight: `calc(var(--spacing-row) + ${String(shown)} * var(--spacing-control-sm) + 0.25rem)` } : { flex: `0 0 ${String(height)}px` }) : { flex: 'none' }}
      data-testid={testId}
    >
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
        className="flex h-row shrink-0 cursor-default items-center gap-2 pr-2 pl-1 text-sm font-semibold text-text outline-none transition-colors select-none hover:bg-surface-hover active:bg-surface-pressed focus-visible:focus-ring-inset"
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
        <div role="group" className="min-h-0 animate-fade-in overflow-y-auto" style={{ scrollbarWidth: 'thin' }} data-testid={testId ? `${testId}-body` : undefined}>
          <div className="relative pb-1 before:absolute before:top-0 before:bottom-1 before:left-3 before:border-l before:border-border">
            <Depth.Provider value={1}>{children}</Depth.Provider>
          </div>
        </div>
      ) : null}
      {open ? (
        // A tree holds only rows, so the divider sits in one, left out of the arrow keys and reached with Tab.
        <TreeExtra level={2} className="relative h-0 shrink-0">
          <ChatResizer
            edge="bottom"
            // Home, Enter and a double click go back to as high as its rows (0).
            width={height ?? actual}
            // Dragging and the keys start from the height on screen, read when they begin (the observer may lag behind).
            measure={() => box.current?.getBoundingClientRect().height ?? 0}
            min={0}
            max={window.innerHeight}
            standard={0}
            onChange={(next) => {
              setHeight(next <= 0 ? null : Math.round(Math.min(room(), Math.max(LEAST_SECTION, next))));
            }}
            label={t('structure.sectionHeight', { name: title })}
            hint={t('structure.sectionHeightHint')}
            testId={testId ? `${testId}-resizer` : 'section-resizer'}
          />
        </TreeExtra>
      ) : null}
    </div>
  );
}

/**
 * A group of rows inside a section (the parameters' groups, their computed values): a row with a chevron, the
 * name and a count, its rows one level deeper. Right and Left open and close it, Enter and Space too; whether
 * it is open is remembered by `id`.
 */
export function TreeFolder({
  id,
  title,
  count,
  level = 2,
  initiallyOpen = true,
  children,
  testId,
}: {
  id: string;
  title: string;
  count: number;
  level?: number;
  initiallyOpen?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useStored(`partbuddy.tree.${id}.open`, initiallyOpen);
  const row = useRow(id);
  return (
    <div data-testid={testId} data-group={title}>
      <div
        {...row}
        role="treeitem"
        aria-level={level}
        aria-expanded={open}
        aria-selected={false}
        onClick={() => {
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ' || (event.key === 'ArrowLeft' && open) || (event.key === 'ArrowRight' && !open)) {
            event.preventDefault();
            setOpen(!open);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            (event.currentTarget.nextElementSibling?.querySelector('[role="treeitem"]:not([data-extra])') as HTMLElement | null)?.focus();
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            toParent(event.currentTarget)?.focus();
          }
        }}
        className="relative mr-1 flex h-control-sm cursor-default items-center gap-1 rounded-r-sm pr-1 pl-4 text-xs font-medium text-text-muted outline-none select-none hover:bg-surface-hover focus-visible:focus-ring-inset"
      >
        <IconChevronRight className={`size-icon-sm shrink-0 text-text-subtle transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {title}
          <span className="sr-only">{` (${String(count)})`}</span>
        </span>
        <span className="shrink-0 text-text-subtle tabular-nums" aria-hidden>
          {count}
        </span>
      </div>
      {open ? (
        <div role="group" className="relative pl-2">
          <Depth.Provider value={level}>{children}</Depth.Provider>
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
export function TreeExtra({ className, children, testId, level }: { className?: string; children: ReactNode; testId?: string; level?: number }) {
  const depth = useContext(Depth);
  return (
    <div role="treeitem" aria-level={level ?? depth + 1} aria-selected={false} data-extra className={className} data-testid={testId}>
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
  level = 2,
  className = '',
}: {
  id: string;
  /** The row's name; without one, its visible text names it (WCAG 2.5.3: the name contains what is shown). */
  label?: string;
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
  /** Deeper inside a group (TreeFolder). */
  level?: number;
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
        aria-level={level}
        {...(label === undefined ? {} : { 'aria-label': label })}
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
            aria-label={label ?? id}
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
                {action.shortcut ? <Shortcut keys={action.shortcut} className="text-xs" /> : null}
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
