import { IconNote } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleButton } from 'react-aria-components';

import type { Selection } from '../../../shared/contract';
import { platform } from '../platform';
import { NoteForm, useNoteCommand } from './NoteParts';
import { chipToggleClass } from '../ui/Choice';

/** "Note" in the selection HUD: pins a note to the selected face, edge or vertex (M2b). */
export function NoteComposer({ selection, busy }: { selection: Selection; busy: boolean }) {
  const { t } = useTranslation();
  const run = useNoteCommand();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <ToggleButton
        isSelected={open}
        onChange={setOpen}
        isDisabled={busy}
        className={`${chipToggleClass} w-fit`}
        data-testid="hud-note"
      >
        <IconNote className="size-icon-sm" aria-hidden />
        {t('notes.add')}
      </ToggleButton>
      {open ? (
        <NoteForm
          label={t('notes.newLabel')}
          disabled={busy}
          testId="note-new"
          onCancel={() => {
            setOpen(false);
          }}
          onSave={async (text) => {
            const ok = await run(() => platform().notes.add(selection, text));
            if (ok) setOpen(false);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}
