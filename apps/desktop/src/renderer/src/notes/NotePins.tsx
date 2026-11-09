import { Html } from '@react-three/drei';
import { IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton } from 'react-aria-components';

import type { NoteView } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyModel } from '../state/store';
import { Button, IconButton } from '../ui/Button';
import { NoteForm, NoteStatus, useNoteCommand } from './NoteParts';

/** Pins sit a little in front of the face, so they do not sink into it. */
const LIFT_MM = 0.4;

function lifted(note: NoteView): [number, number, number] {
  const [x, y, z] = note.world;
  const [nx, ny, nz] = note.normal ?? [0, 0, 0];
  return [x + nx * LIFT_MM, y + ny * LIFT_MM, z + nz * LIFT_MM];
}

/** The card at an open pin: the text, where the note stands, and what the user can do with it. */
function NoteCard({ note, number, busy }: { note: NoteView; number: number; busy: boolean }) {
  const { t } = useTranslation();
  const setOpenNote = useStudio((s) => s.setOpenNote);
  const run = useNoteCommand();
  const [editing, setEditing] = useState(false);
  // Escape closes the card also when the focus is still on the pin that opened it.
  useEffect(() => {
    if (editing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenNote(null);
    };
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
    };
  }, [editing, setOpenNote]);
  return (
    <div
      role="dialog"
      aria-label={t('notes.card', { number })}
      className="pointer-events-auto absolute left-4 top-0 flex w-menu origin-left -translate-y-1/2 animate-pop-in flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2 [--cs-pop-x:calc(var(--cs-motion-offset)*-1)] [--cs-pop-y:0]"
      data-testid="note-card"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !editing) {
          event.stopPropagation();
          setOpenNote(null);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <NoteStatus note={note} />
        <IconButton
          label={t('notes.close')}
          shortcut="Esc"
          onPress={() => {
            setOpenNote(null);
          }}
        >
          <IconX className="size-icon-sm" aria-hidden />
        </IconButton>
      </div>
      {editing ? (
        <NoteForm
          initial={note.text}
          label={t('notes.editLabel')}
          disabled={busy}
          testId="note-edit"
          onCancel={() => {
            setEditing(false);
          }}
          onSave={async (text) => {
            const ok = await run(() => platform().notes.edit(note.id, text));
            if (ok) setEditing(false);
            return ok;
          }}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-text" data-testid="note-text">
          {note.text}
        </p>
      )}
      {editing ? null : (
        <div className="flex flex-wrap gap-1">
          {note.own ? (
            <Button
              isDisabled={busy}
              onPress={() => {
                setEditing(true);
              }}
            >
              {t('notes.edit')}
            </Button>
          ) : (
            <Button variant="primary" isDisabled={busy} onPress={() => void run(() => platform().notes.accept(note.id))} data-testid="note-accept">
              {t('notes.accept')}
            </Button>
          )}
          <Button variant="quiet" className="text-danger" isDisabled={busy} onPress={() => void run(() => platform().notes.delete(note.id))} data-testid="note-delete">
            {t('notes.delete')}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The notes on the model (M2b, ADR 0020): a numbered pin where each note sits, in the note
 * colour; foreign notes in the warning colour until the user accepts them. A click opens the card.
 */
export function NotePins({ bodies, busy }: { bodies: BodyModel[]; busy: boolean }) {
  const { t } = useTranslation();
  const notes = useStudio((s) => s.notes.notes);
  const openNote = useStudio((s) => s.openNote);
  const setOpenNote = useStudio((s) => s.setOpenNote);
  const shown = new Set(bodies.map((body) => body.name));
  // drei's Html attaches to the canvas's parent element once, when it mounts; in the scene's very
  // first render the canvas is not in the page yet, so pins join one frame later.
  const [attached, setAttached] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAttached(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  if (!attached) return null;
  return (
    <>
      {notes.map((note, i) => {
        // An orphaned note has no place on the model; it waits in the notes list.
        if (note.status === 'orphaned' || !shown.has(note.body)) return null;
        const open = openNote === note.id;
        const number = i + 1;
        return (
          <Html key={note.id} position={lifted(note)} zIndexRange={open ? [30, 25] : [18, 12]} style={{ pointerEvents: 'none' }}>
            {/* Zero-size anchor: the pin is centred on the note's point, the card opens to its right. */}
            <div className="relative">
              <AriaButton
                aria-label={t('notes.pin', { number, text: note.text.slice(0, 80) })}
                aria-expanded={open}
                onPress={() => {
                  setOpenNote(open ? null : note.id);
                }}
                className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 inline-flex size-control-sm items-center justify-center rounded-full border-2 text-xs font-semibold shadow-2 outline-none focus-visible:focus-ring ${
                  note.own ? 'border-surface bg-note text-on-accent' : 'border-warning bg-surface-raised text-warning'
                } ${note.status === 'attached' ? '' : 'ring-2 ring-warning'}`}
                data-testid="note-pin"
                data-note={note.id}
              >
                {number}
              </AriaButton>
              {open ? <NoteCard note={note} number={number} busy={busy} /> : null}
            </div>
          </Html>
        );
      })}
    </>
  );
}
