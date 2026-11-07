/**
 * The surface of every popover, menu and list that opens from a trigger (Linear, Figma): raised,
 * framed, it rises in from its trigger and fades out.
 */
export const popoverClass =
  'min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2 outline-none ' +
  'entering:animate-pop-in exiting:animate-pop-out placement-top:[--cs-pop-y:var(--cs-motion-offset)]';

/** A popover that holds a small dialog (status, model choice) rather than a list. */
export const popoverPanelClass =
  'w-dialog-sm max-w-full rounded-lg border border-border bg-surface-raised shadow-2 outline-none ' +
  'entering:animate-pop-in exiting:animate-pop-out placement-top:[--cs-pop-y:var(--cs-motion-offset)]';

/** The same distance between every trigger and what it opens. */
export const POPOVER_OFFSET = 4;

/** The menu list: scrolls when it is taller than most of the window. */
export const menuClass = 'max-h-menu-max overflow-auto outline-none';

/**
 * A menu entry (macOS, Fluent 2): the row lights when pointed at or reached with the arrow keys
 * (React Aria's `data-focused` follows both), darker while pressed, faded when not available.
 */
export const menuItemClass =
  'group flex min-h-control-sm cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm text-text outline-none ' +
  'focus:bg-surface-hover pressed:bg-surface-pressed disabled:cursor-not-allowed disabled:opacity-disabled';

/** An entry with a name and a line of explanation under it. */
export const menuItemTwoLineClass = `${menuItemClass.replace('items-center', 'items-start')} flex-col gap-0`;

/** The heading of a menu section. */
export const menuHeaderClass = 'px-2 pt-1 pb-hairline text-xs font-semibold text-text-muted';

export const menuSeparatorClass = 'mx-1 my-1 border-t border-border';
