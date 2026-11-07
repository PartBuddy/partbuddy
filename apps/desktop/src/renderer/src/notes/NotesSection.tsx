import { IconArrowBackUp, IconNote, IconPin } from '@tabler/icons-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { buttonClass } from '../ui/Button';

import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { surfaceKind } from '@partbuddy/geometry';

import { TreeEmpty, TreeExtra, TreeItem, TreeSection } from '../shell/Tree';
import { selectionOf } from '../viewer/viewState';
import { NoteStatus, useNoteCommand } from './NoteParts';

const small = buttonClass('quiet', 'sm');

/**
 * Notes in the structure tree (M2b, ADR 0020): every note of the design with where it stands,
 * foreign ones with "Accept", lost ones with "Pin to selection", and the notes undo or "go back"
 * removed, to put back.
 */
export function NotesSection() {
  const { t } = useTranslation();
  const state = useStudio((s) => s.notes);
  const model = useStudio((s) => s.model);
  const selection = useStudio((s) => s.selection);
  const selections = useStudio((s) => s.selections);
  const setOpenNote = useStudio((s) => s.setOpenNote);
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  const run = useNoteCommand();
  const target = selections.length === 1 ? selectionOf(model, selection) : null;
  // Where a note sits, readable like the status bar ("Ebene · Gehäuse"); SolidCraft's name on hover.
  const where = (note: (typeof state.notes)[number]): string => {
    const face = model.status === 'ready' ? model.bodies.find((body) => body.name === note.body)?.model.table.faces.find((entry) => entry.name === note.target) : undefined;
    const kind = face ? t(`viewer.surface.${surfaceKind(face)}`) : t(`viewer.kind.${note.kind === 'point' ? 'vertex' : note.kind}`);
    return `${kind} · ${note.body}`;
  };

  return (
    <TreeSection id="section:notes" icon={<IconNote className="size-icon-sm" aria-hidden />} title={t('notes.titleShort')} label={t('notes.title', { count: state.notes.length })} count={state.notes.length} testId="notes">
      {state.restorable.length > 0 ? (
        <TreeExtra className="mr-2 mb-2 ml-5 flex flex-col gap-1 rounded-md bg-info-subtle p-2" testId="notes-restorable">
          <p className="text-xs text-text">{t('notes.removed', { count: state.restorable.length })}</p>
          <ul className="flex flex-col gap-1">
            {state.restorable.map((entry) => (
              <li key={entry.id} className="flex items-center gap-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-text-muted" title={entry.text}>
                  {entry.text}
                </span>
                <AriaButton className={small} isDisabled={busy} onPress={() => void run(() => platform().notes.restore(entry.id))} data-testid="note-restore">
                  <IconArrowBackUp className="size-icon-sm" aria-hidden />
                  {t('notes.restore')}
                </AriaButton>
                <AriaButton className={small} onPress={() => void run(() => platform().notes.dismiss(entry.id))} aria-label={t('notes.dismiss', { text: entry.text.slice(0, 60) })}>
                  {t('notes.dismissShort')}
                </AriaButton>
              </li>
            ))}
          </ul>
        </TreeExtra>
      ) : null}
      {state.notes.length === 0 ? <TreeEmpty icon={<IconNote className="size-icon" aria-hidden />} text={t('notes.noneShort')} /> : null}
      {state.notes.map((note, i) => {
        const open = () => {
          setOpenNote(note.status === 'orphaned' ? null : note.id);
        };
        // A note that sits where it was pinned and is the user's own needs one line; the rest says what is up.
        const plain = note.own && note.status === 'attached';
        return (
          <Fragment key={note.id}>
            <TreeItem id={`note:${note.id}`} label={note.text} onSelect={open} onOpen={open} testId="note-row" data={{ note: note.id }}>
              <span
                className={`inline-flex size-icon shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${note.own ? 'bg-note text-on-accent' : 'border border-warning text-warning'}`}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate" title={`${note.text}\n${where(note)}`}>
                {note.text}
              </span>
              <span className={plain ? 'sr-only' : 'shrink-0'}>
                <NoteStatus note={note} />
                <span className="sr-only">{where(note)}</span>
              </span>
            </TreeItem>
            {!note.own || note.status === 'orphaned' || note.status === 'ambiguous' ? (
              <TreeExtra className="flex flex-wrap gap-1 pb-1 pl-6">
                {note.own ? null : (
                  <AriaButton className={small} isDisabled={busy} onPress={() => void run(() => platform().notes.accept(note.id))} data-testid="note-row-accept">
                    {t('notes.accept')}
                  </AriaButton>
                )}
                {note.status === 'orphaned' || note.status === 'ambiguous' ? (
                  <AriaButton
                    className={small}
                    isDisabled={busy || !target}
                    onPress={() => {
                      if (target) void run(() => platform().notes.reattach(note.id, target));
                    }}
                    data-testid="note-reattach"
                  >
                    <IconPin className="size-icon-sm" aria-hidden />
                    {t('notes.reattach')}
                  </AriaButton>
                ) : null}
              </TreeExtra>
            ) : null}
          </Fragment>
        );
      })}
      {state.unreadable > 0 ? (
        <TreeExtra className="flex items-center gap-1 pt-1 pl-5 text-xs text-text-subtle">
          <IconNote className="size-icon-sm" aria-hidden />
          {t('notes.unreadable', { count: state.unreadable })}
        </TreeExtra>
      ) : null}
    </TreeSection>
  );
}
