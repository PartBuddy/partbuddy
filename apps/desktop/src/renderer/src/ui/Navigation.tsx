import { pressable } from './Button';

export type TabOrientation = 'horizontal' | 'vertical';

/** The strip of tabs: an underlined row (Fluent 2, GitHub) or a side list (macOS settings, Linear). */
export function tabListClass(orientation: TabOrientation = 'horizontal'): string {
  return orientation === 'horizontal' ? 'flex gap-1 border-b border-border' : 'flex flex-col gap-hairline';
}

/**
 * One tab. Horizontal: the chosen one carries an accent underline; vertical: a quiet fill, like a
 * selected list row. Both have hover, pressed, focus ring and disabled; the label never changes
 * weight, so nothing shifts when the choice moves.
 */
export function tabClass(orientation: TabOrientation = 'horizontal'): string {
  return orientation === 'horizontal'
    ? `-mb-px inline-flex h-control-md cursor-default items-center gap-2 border-b-2 border-transparent px-3 text-sm text-text-muted hover:border-border-strong hover:text-text pressed:text-text selected:border-accent selected:text-text ${pressable}`
    : `flex min-h-control-md cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm text-text-muted hover:bg-surface-hover hover:text-text pressed:bg-surface-pressed selected:bg-surface-selected selected:text-text ${pressable}`;
}

/** A selectable row in a list (profiles, assembly steps, findings): hover, pressed, selected, ring inside. */
export const listRowClass =
  'flex min-h-control-sm cursor-default items-center gap-2 rounded-sm px-2 py-1 text-left text-sm text-text outline-none transition-colors ' +
  'hover:bg-surface-hover pressed:bg-surface-pressed selected:bg-surface-selected focus-visible:focus-ring-inset disabled:opacity-disabled';
