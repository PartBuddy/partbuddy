import { IconX } from '@tabler/icons-react';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { OverlayTriggerStateContext } from 'react-aria-components';

import { IconButton } from './Button';

export type DialogSize = 'sm' | 'lg' | 'xl';

/** The dimmed backdrop: fades in, closes at once (like menus, so a click after Esc never meets a closing layer); the dialog sits a little above the middle (macOS, Fluent 2). */
export const overlayClass =
  'fixed inset-0 z-10 flex items-start justify-center bg-overlay px-4 pt-dialog-offset entering:animate-fade-in';

const widths: Record<DialogSize, string> = { sm: 'w-dialog-sm', lg: 'w-dialog-lg', xl: 'w-dialog-xl' };

/** The dialog surface: grows in slightly from 97 %. */
export function modalClass(size: DialogSize = 'sm'): string {
  return `${widths[size]} max-w-full rounded-lg border border-border bg-surface-raised shadow-3 outline-none entering:animate-dialog-in`;
}

export const dialogTitleClass = 'text-lg font-semibold text-text';

/** The close button of a dialog's head; Escape does the same. */
export function DialogClose({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const state = useContext(OverlayTriggerStateContext);
  return (
    <IconButton label={t('dialog.close')} shortcut="Esc" onPress={onPress ?? (() => state?.close())} data-testid="dialog-close">
      <IconX className="size-icon-sm" aria-hidden />
    </IconButton>
  );
}
