import { IconCheck, IconChevronDown, IconMinus } from '@tabler/icons-react';
import {
  Button as AriaButton,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  SliderThumb,
  SliderTrack,
  type Key,
} from 'react-aria-components';

import { pressable } from './Button';
import type { FieldSize } from './Field';
import { fieldLabelClass } from './Field';
import { popoverClass } from './Overlay';

/**
 * A row that holds a radio or checkbox mark and its text (Fluent 2 option, Linear menu-like
 * choice): the whole row is the target, at least 24 px high.
 */
export const choiceRowClass =
  'group flex min-h-control-sm cursor-default items-start gap-2 rounded-md px-2 py-1 outline-none transition-colors ' +
  'hover:bg-surface-hover pressed:bg-surface-pressed selected:bg-surface-selected focus-visible:focus-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-disabled';

/** A mark and its label without a row fill (settings, profile options); the mark carries the focus ring. */
export const choiceInlineClass =
  'group inline-flex min-h-control-sm cursor-default items-center gap-2 text-sm text-text outline-none disabled:cursor-not-allowed disabled:opacity-disabled';

const markBase =
  'inline-flex size-icon shrink-0 items-center justify-center border border-border-strong bg-surface transition-colors ' +
  'group-hover:border-text-subtle group-pressed:bg-surface-pressed group-focus-visible:focus-ring group-invalid:border-danger';

/** The radio's circle; the dot grows in when it is chosen. */
export function RadioMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`${markBase} rounded-full group-selected:border-accent ${className}`}>
      <span className="size-dot scale-0 rounded-full bg-accent transition-transform group-selected:scale-100" />
    </span>
  );
}

/** The checkbox's box with a check, or a dash when only some are chosen. */
export function CheckMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`${markBase} rounded-sm text-on-accent group-selected:border-accent group-selected:bg-accent group-indeterminate:border-accent group-indeterminate:bg-accent ${className}`}
    >
      <IconCheck className="hidden size-icon-sm group-selected:block group-indeterminate:hidden" stroke={3} />
      <IconMinus className="hidden size-icon-sm group-indeterminate:block" stroke={3} />
    </span>
  );
}

/** The switch's track and thumb (Apple HIG, Fluent 2): the thumb slides to the end and the track fills. */
export function SwitchMark() {
  return (
    <span
      aria-hidden
      className="inline-flex h-icon w-control-md shrink-0 items-center rounded-full border border-border-strong bg-surface p-hairline transition-colors group-hover:border-text-subtle group-selected:border-accent group-selected:bg-accent group-focus-visible:focus-ring"
    >
      <span className="size-3 rounded-full bg-text-subtle transition-transform group-selected:translate-x-3 group-selected:bg-on-accent" />
    </span>
  );
}

/** A choice as a small framed chip that stays on (filters, part kinds). */
export const chipToggleClass =
  'inline-flex h-control-sm shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface px-2 text-xs text-text ' +
  'hover:bg-surface-hover pressed:bg-surface-pressed selected:border-accent selected:bg-accent-subtle selected:text-accent-text ' +
  pressable;

/** The well of a segmented control (Apple HIG, Linear): one of a few, side by side. */
export const segmentGroupClass = 'inline-flex shrink-0 items-center gap-hairline rounded-md bg-surface-sunken p-hairline';

/** One segment: quiet until chosen, then raised like a key that is down. */
export function segmentClass(size: FieldSize = 'sm'): string {
  return (
    `inline-flex ${size === 'sm' ? 'h-control-sm text-sm' : 'h-control-md text-md'} items-center justify-center gap-1 whitespace-nowrap rounded-sm px-2 text-text-muted ` +
    'hover:text-text pressed:bg-surface-pressed selected:bg-surface-raised selected:text-text selected:shadow-1 ' +
    pressable
  );
}

/** The trigger of a select, framed like a field. */
export function selectTriggerClass(size: FieldSize = 'sm'): string {
  return (
    `inline-flex ${size === 'sm' ? 'h-control-sm text-sm' : 'h-control-md text-md'} min-w-0 items-center justify-between gap-1 rounded-md border border-border-strong bg-surface px-2 text-text ` +
    'hover:border-text-subtle hover:bg-surface-hover pressed:bg-surface-pressed open:border-focus ' +
    pressable
  );
}

/** An option in a list: the check marks the chosen one, not the weight alone. */
export const listItemClass =
  'group flex min-h-control-sm cursor-default items-center gap-2 rounded-sm px-2 py-1 text-sm text-text outline-none ' +
  'focus:bg-surface-hover pressed:bg-surface-pressed disabled:opacity-disabled';

export function ListCheck() {
  return <IconCheck aria-hidden className="size-icon-sm shrink-0 text-accent-text opacity-0 group-selected:opacity-100" />;
}

export interface SelectFieldProps<T extends string> {
  label?: string;
  'aria-label'?: string;
  value: T;
  items: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
  size?: FieldSize;
  className?: string;
  testId?: string;
}

/** A select with its label, a framed trigger and a list with a check at the chosen entry. */
export function SelectField<T extends string>({ label, value, items, onChange, size = 'sm', className, testId, ...props }: SelectFieldProps<T>) {
  return (
    <Select
      {...(props['aria-label'] ? { 'aria-label': props['aria-label'] } : {})}
      value={value}
      onChange={(key: Key | null) => {
        const next = items.find((item) => item.id === key);
        if (next) onChange(next.id);
      }}
      className={`flex min-w-0 flex-col gap-1 ${className ?? ''}`}
      data-testid={testId}
    >
      {label ? <Label className={fieldLabelClass}>{label}</Label> : null}
      <AriaButton className={selectTriggerClass(size)}>
        <SelectValue className="truncate">{({ selectedText }) => selectedText}</SelectValue>
        <IconChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
      </AriaButton>
      <Popover offset={4} className={popoverClass}>
        <ListBox className="max-h-menu-max overflow-auto outline-none">
          {items.map((item) => (
            <ListBoxItem key={item.id} id={item.id} textValue={item.label} className={listItemClass}>
              <ListCheck />
              <span className="truncate">{item.label}</span>
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}

/**
 * Track, fill and thumb of a slider. The thumb is 16 px with a 24 px grip around it (WCAG 2.5.8).
 */
export function SliderBar() {
  return (
    <SliderTrack className="relative h-control-sm w-full">
      {({ state, isDisabled }) => (
        <>
          <span aria-hidden className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-sunken" />
          <span
            aria-hidden
            className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${isDisabled ? 'bg-border-strong' : 'bg-accent'}`}
            style={{ width: `${String(state.getThumbPercent(0) * 100)}%` }}
          />
          <SliderThumb
            className={
              'top-1/2 size-icon rounded-full border-2 border-accent bg-surface shadow-1 outline-none transition-colors ' +
              "before:absolute before:-inset-1 before:rounded-full before:content-[''] hover:bg-accent-subtle dragging:bg-accent-subtle " +
              'focus-visible:focus-ring disabled:border-border-strong disabled:shadow-none'
            }
          />
        </>
      )}
    </SliderTrack>
  );
}
