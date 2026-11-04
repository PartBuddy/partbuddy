import { IconCrosshair, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GridList, GridListItem, Label, TextArea, TextField } from 'react-aria-components';

import type { FaceTable } from '@partbuddy/geometry';
import { useStudio, type AnchorStatus } from '../state/store';
import { Badge, type Tone } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { ModalDialog } from '../ui/Dialog';
import { EmptyState } from '../ui/Feedback';

const statusTone: Record<AnchorStatus, Tone> = {
  attached: 'success',
  moved: 'info',
  ambiguous: 'warning',
  orphaned: 'danger',
};

export function NotesPanel() {
  const { t } = useTranslation();
  const notes = useStudio((s) => s.notes);
  const focusNoteId = useStudio((s) => s.focusNoteId);
  const focusNote = useStudio((s) => s.focusNote);
  const removeNote = useStudio((s) => s.removeNote);

  if (notes.length === 0) {
    return <EmptyState title={t('notes.emptyTitle')} body={t('notes.emptyBody')} />;
  }

  return (
    <GridList
      aria-label={t('panels.notes')}
      selectionMode="single"
      selectedKeys={focusNoteId ? [focusNoteId] : []}
      onSelectionChange={(keys) => {
        const [first] = keys === 'all' ? [] : [...keys];
        focusNote(typeof first === 'string' ? first : null);
      }}
      items={notes}
      className="h-full overflow-auto p-1 outline-none"
    >
      {(note) => (
        <GridListItem
          id={note.id}
          textValue={note.text}
          className="flex cursor-default flex-col gap-1 rounded-md px-2 py-2 outline-none hover:bg-surface-hover selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus"
        >
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-note font-mono text-xs font-semibold text-on-accent">
              {notes.indexOf(note) + 1}
            </span>
            <span className="flex-1 truncate font-mono text-xs text-text-muted">{note.anchor.faceName}</span>
            <Badge tone={statusTone[note.anchor.status]}>{t(`notes.status.${note.anchor.status}`)}</Badge>
            <IconButton
              size="sm"
              label={t('notes.showInView')}
              icon={<IconCrosshair className="size-icon-sm" aria-hidden />}
              onPress={() => {
                focusNote(note.id);
              }}
            />
            <IconButton
              size="sm"
              label={t('notes.delete')}
              icon={<IconTrash className="size-icon-sm" aria-hidden />}
              onPress={() => {
                removeNote(note.id);
              }}
            />
          </div>
          <p className="text-md text-text">{note.text}</p>
        </GridListItem>
      )}
    </GridList>
  );
}

/** Dialog for a new note on the picked face. */
export function NoteDialog({ table }: { table: FaceTable | null }) {
  const { t } = useTranslation();
  const draft = useStudio((s) => s.noteDraft);
  const cancelNote = useStudio((s) => s.cancelNote);
  const saveNote = useStudio((s) => s.saveNote);
  const [text, setText] = useState('');
  const face = draft && table ? table.faces[draft.face] : undefined;

  return (
    <ModalDialog
      isOpen={draft !== null}
      onOpenChange={(open) => {
        if (!open) {
          cancelNote();
          setText('');
        }
      }}
      title={t('notes.dialogTitle')}
    >
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!face || text.trim() === '') return;
          saveNote(text.trim(), face.name);
          setText('');
        }}
      >
        <p className="text-sm text-text-muted">
          {t('notes.anchorTo')} <span className="font-mono text-text">{face?.name}</span>
        </p>
        <TextField value={text} onChange={setText} autoFocus className="flex flex-col gap-1">
          <Label className="text-sm font-medium text-text">{t('notes.text')}</Label>
          <TextArea
            rows={3}
            placeholder={t('notes.placeholder')}
            className="rounded-md border border-border-strong bg-surface px-2 py-1 text-md text-text outline-none placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-focus"
          />
        </TextField>
        <p className="text-xs text-text-subtle">{t('notes.contextHint')}</p>
        <div className="flex justify-end gap-2">
          <Button
            variant="quiet"
            onPress={() => {
              cancelNote();
              setText('');
            }}
          >
            {t('actions.cancel')}
          </Button>
          <Button type="submit" variant="primary" isDisabled={text.trim() === ''}>
            {t('notes.save')}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
