import { IconArrowBackUp, IconNote, IconPin } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { selectionOf } from '../viewer/viewState';
import { NoteStatus, useNoteCommand } from './NoteParts';

const small =
  'inline-flex h-control-sm items-center gap-1 rounded-md px-2 text-xs text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50';

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

  return (
    <section aria-labelledby="structure-notes" data-testid="notes">
      <h2 id="structure-notes" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('notes.title', { count: state.notes.length })}
      </h2>
      {state.restorable.length > 0 ? (
        <div className="mx-1 mb-2 flex flex-col gap-1 rounded-md bg-info-subtle p-2" role="status" data-testid="notes-restorable">
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
        </div>
      ) : null}
      {state.notes.length === 0 ? <p className="px-2 text-xs text-text-subtle">{t('notes.none')}</p> : null}
      <ul className="flex flex-col gap-1">
        {state.notes.map((note, i) => (
          <li key={note.id} className="flex flex-col gap-1 rounded-md px-2 py-1 hover:bg-surface-hover" data-testid="note-row" data-note={note.id}>
            <AriaButton
              className="flex items-start gap-2 text-left text-sm text-text outline-none focus-visible:outline-2 focus-visible:outline-focus"
              onPress={() => {
                setOpenNote(note.status === 'orphaned' ? null : note.id);
              }}
            >
              <span className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${note.own ? 'bg-note text-on-accent' : 'border border-warning text-warning'}`} aria-hidden>
                {i + 1}
              </span>
              <span className="line-clamp-2 min-w-0 break-words">{note.text}</span>
            </AriaButton>
            <div className="flex flex-wrap items-center gap-1 pl-7">
              <NoteStatus note={note} />
              {note.target ? <span className="truncate font-mono text-xs text-text-subtle">{note.target}</span> : null}
            </div>
            {!note.own || note.status === 'orphaned' || note.status === 'ambiguous' ? (
              <div className="flex flex-wrap gap-1 pl-6">
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
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {state.unreadable > 0 ? (
        <p className="flex items-center gap-1 px-2 pt-1 text-xs text-text-subtle">
          <IconNote className="size-icon-sm" aria-hidden />
          {t('notes.unreadable', { count: state.unreadable })}
        </p>
      ) : null}
    </section>
  );
}
