import { IconAlertCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Group, Input, Text, type InputProps } from 'react-aria-components';

export type FieldSize = 'sm' | 'md';

/** Label above or beside a field: one tone everywhere (was muted in some places, subtle in others). */
export const fieldLabelClass = 'text-xs font-medium text-text-muted';

const boxSizes: Record<FieldSize, string> = { sm: 'h-control-sm text-sm', md: 'h-control-md text-md' };

/**
 * The frame of a text field (Fluent 2, Linear): the border darkens on hover, focus draws the
 * focus ring over the border (no jump), invalid turns it red, read-only sinks, disabled fades.
 * The state attributes come from React Aria (`data-focused`, `data-invalid`, …) on the input,
 * or on a `Group` that holds the input and its unit.
 */
export const fieldBox =
  'rounded-md border border-border-strong bg-surface text-text outline-none transition-colors ' +
  'hover:border-text-subtle focus:border-focus focus:focus-ring-inset focus-within:border-focus focus-within:focus-ring-inset ' +
  'invalid:border-danger invalid:focus:outline-danger invalid:focus-within:outline-danger ' +
  '[&[readonly]]:border-border [&[readonly]]:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-disabled';

/** Class of a single-line input. */
export function inputClass(size: FieldSize = 'md'): string {
  return `w-full min-w-0 px-2 placeholder:text-text-subtle ${boxSizes[size]} ${fieldBox}`;
}

/** Class of a multi-line input. */
export const textAreaClass = `w-full min-w-0 resize-none px-2 py-1 text-sm placeholder:text-text-subtle ${fieldBox}`;

/** A hint under a field, or its error once there is one; both are tied to the input (aria-describedby). */
export function FieldMessage({ error, hint, testId }: { error?: ReactNode; hint?: ReactNode; testId?: string }) {
  if (error) {
    return (
      <Text slot="errorMessage" role="alert" className="flex items-start gap-1 text-xs text-danger" data-testid={testId}>
        <IconAlertCircle className="mt-hairline size-icon-sm shrink-0" aria-hidden />
        <span>{error}</span>
      </Text>
    );
  }
  return hint ? (
    <Text slot="description" className="text-xs text-text-subtle">
      {hint}
    </Text>
  ) : null;
}

/**
 * A number input with its unit inside the frame (Onshape, Fusion: "12 mm"), for a NumberField or
 * a TextField. The unit is part of the label for screen readers through the field's own label.
 */
export function UnitInput({ unit, size = 'sm', className, ...props }: Omit<InputProps, 'className' | 'size'> & { unit: string; size?: FieldSize; className?: string }) {
  return (
    <Group className={`flex items-center gap-1 pr-2 ${boxSizes[size]} ${fieldBox} ${className ?? ''}`}>
      <Input {...props} className="h-full w-full min-w-0 bg-transparent pl-2 text-right tabular-nums outline-none placeholder:text-text-subtle" />
      <span aria-hidden className="shrink-0 text-xs text-text-subtle">
        {unit}
      </span>
    </Group>
  );
}
