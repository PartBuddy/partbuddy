/**
 * The surface of every popover, menu and list that opens from a trigger (Linear, Figma): raised,
 * framed, it rises in from its trigger and fades out.
 */
export const popoverClass =
  'min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2 outline-none ' +
  'entering:animate-pop-in exiting:animate-pop-out placement-top:[--cs-pop-y:var(--cs-motion-offset)]';
