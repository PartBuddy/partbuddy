import { IconAlertTriangle, IconArrowsMove, IconLink, IconLinkOff, IconUserQuestion } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label, TextArea, TextField } from 'react-aria-components';

import type { NoteView } from '../../../shared/contract';
import { Button } from '../ui/Button';
import { useStudio } from '../state/store';

/** Same limit as the main process (ADR 0020). */
export const MAX_NOTE_TEXT = 1000;

/** Runs a note command and shows its error as a notice; returns whether it worked. */
export function useNoteCommand(): (command: () => Promise<void>) => Promise<boolean> {
  const { t } = useTranslation();
  const setNotice = useStudio((s) => s.setNotice);
  return async (command) => {
    try {
      await command();
      return true;
    } catch (error) {
      setNotice({ tone: 'danger', text: t('notes.failed', { detail: (error as Error).message.slice(0, 200) }) });
      return false;
    }
  };
}

/** Text field for a new or changed note: Ctrl+Enter saves, Escape cancels. */
export function NoteForm({
  initial = '',
  label,
  onSave,
  onCancel,
  disabled = false,
  testId,
}: {
  initial?: string;
  label: string;
  onSave: (text: string) => Promise<boolean> | boolean;
  onCancel: () => void;
  disabled?: boolean;
  testId: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const empty = text.trim() === '';
  const save = async () => {
    if (empty || saving || disabled) return;
    setSaving(true);
    const ok = await onSave(text);
    setSaving(false);
    if (ok) setText('');
  };
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <TextField value={text} onChange={setText} maxLength={MAX_NOTE_TEXT} isDisabled={disabled || saving} className="flex flex-col gap-1">
        <Label className="text-xs text-text-subtle">{label}</Label>
        <TextArea
          autoFocus
          rows={3}
          className="w-full resize-none rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-text outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void save();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          data-testid={`${testId}-text`}
        />
      </TextField>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-subtle">{t('notes.saveHint')}</span>
        <div className="flex gap-1">
          <Button onPress={onCancel}>{t('notes.cancel')}</Button>
          <Button variant="primary" isDisabled={empty || saving || disabled} onPress={() => void save()} data-testid={`${testId}-save`}>
            {t('notes.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Where the note stands: on its face, moved, ambiguous, lost; and whether it comes from someone else. */
export function NoteStatus({ note }: { note: NoteView }) {
  const { t } = useTranslation();
  const icon =
    note.status === 'attached' ? (
      <IconLink className="size-icon-sm" aria-hidden />
    ) : note.status === 'moved' ? (
      <IconArrowsMove className="size-icon-sm" aria-hidden />
    ) : note.status === 'ambiguous' ? (
      <IconAlertTriangle className="size-icon-sm text-warning" aria-hidden />
    ) : (
      <IconLinkOff className="size-icon-sm text-danger" aria-hidden />
    );
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-hairline text-xs text-text-subtle" data-testid="note-status" data-status={note.status} data-own={String(note.own)}>
      <span className="inline-flex items-center gap-1">
        {icon}
        {t(`notes.status.${note.status}`)}
      </span>
      {note.own ? null : (
        <span className="inline-flex items-center gap-1 rounded-sm bg-warning-subtle px-1 text-warning" title={t('notes.foreignHint')}>
          <IconUserQuestion className="size-icon-sm" aria-hidden />
          {t('notes.foreign')}
        </span>
      )}
    </span>
  );
}
