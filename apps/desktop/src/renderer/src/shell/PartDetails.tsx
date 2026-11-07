import { IconChevronRight, IconCircleCheckFilled, IconCircleDashed } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Group, Input, Label, NumberField, TextField, ToggleButton } from 'react-aria-components';

import type { PartNote, PartsState } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';

/** A body without an entry: one copy, none printed. */
export const NEW_PART: PartNote = { quantity: 1, printed: 0, filament: '', note: '' };

/**
 * The parts list of the open project (P6), read again when another design opens. `save` keeps
 * one body's note together with the printed bodies of now, for the count on the start page.
 */
export function useParts(documentId: string | null, printable: string[]): { parts: PartsState['parts']; save: (body: string, note: PartNote) => void } {
  const { t } = useTranslation();
  const [parts, setParts] = useState<PartsState['parts']>({});
  useEffect(() => {
    let live = true;
    void platform()
      .project.parts()
      .then((state) => {
        if (live) setParts(state.parts);
      })
      .catch(() => {
        if (live) setParts({});
      });
    return () => {
      live = false;
    };
  }, [documentId]);
  const save = (body: string, note: PartNote) => {
    setParts((current) => ({ ...current, [body]: note }));
    void platform()
      .project.setPart(body, note, printable)
      .then((state) => {
        setParts(state.parts);
      })
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('project.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  return { parts, save };
}

const fieldClass = 'h-control-sm w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text outline-none focus-visible:outline-2 focus-visible:outline-focus';

/** The printed switch beside a body: every copy printed, or none. */
export function PrintedToggle({ body, note, onChange }: { body: string; note: PartNote; onChange: (note: PartNote) => void }) {
  const { t } = useTranslation();
  const done = note.printed >= note.quantity;
  return (
    <ToggleButton
      isSelected={done}
      onChange={(next) => onChange({ ...note, printed: next ? note.quantity : 0 })}
      aria-label={t(done ? 'parts.markOpen' : 'parts.markPrinted', { name: body })}
      className={`inline-flex size-control-sm shrink-0 items-center justify-center rounded-md outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus ${done ? 'text-success' : 'text-text-subtle hover:text-text'}`}
      data-testid="part-printed"
    >
      {done ? <IconCircleCheckFilled className="size-icon-sm" aria-hidden /> : <IconCircleDashed className="size-icon-sm" aria-hidden />}
    </ToggleButton>
  );
}

export function ExpandToggle({ body, open, onToggle }: { body: string; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <AriaButton
      aria-label={t('parts.details', { name: body })}
      aria-expanded={open}
      onPress={onToggle}
      className="inline-flex size-control-sm shrink-0 items-center justify-center rounded-md text-text-subtle outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
      data-testid="part-expand"
    >
      <IconChevronRight className={`size-icon-sm transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
    </AriaButton>
  );
}

/** Copies, printed copies, filament and a note of one body; a standard part has the copies only. */
export function PartDetails({ body, note, standard, onChange }: { body: string; note: PartNote; standard: boolean; onChange: (note: PartNote) => void }) {
  const { t } = useTranslation();
  const [filament, setFilament] = useState(note.filament);
  const [text, setText] = useState(note.note);
  return (
    <li className="flex flex-col gap-2 rounded-md bg-surface-sunken px-2 py-2" data-testid="part-details" data-body={body}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField value={note.quantity} minValue={1} maxValue={999} onChange={(value) => Number.isFinite(value) && onChange({ ...note, quantity: value, printed: Math.min(note.printed, value) })} className="flex flex-col gap-1" data-testid="part-quantity">
          <Label className="text-xs text-text-muted">{t('parts.quantity')}</Label>
          <Group>
            <Input className={`${fieldClass} tabular-nums`} />
          </Group>
        </NumberField>
        {standard ? null : (
          <NumberField value={note.printed} minValue={0} maxValue={note.quantity} onChange={(value) => Number.isFinite(value) && onChange({ ...note, printed: value })} className="flex flex-col gap-1" data-testid="part-printed-count">
            <Label className="text-xs text-text-muted">{t('parts.printed')}</Label>
            <Group>
              <Input className={`${fieldClass} tabular-nums`} />
            </Group>
          </NumberField>
        )}
      </div>
      {standard ? null : (
        <TextField value={filament} onChange={setFilament} onBlur={() => filament !== note.filament && onChange({ ...note, filament })} maxLength={80} className="flex flex-col gap-1">
          <Label className="text-xs text-text-muted">{t('parts.filament')}</Label>
          <Input placeholder={t('parts.filamentPlaceholder')} className={fieldClass} data-testid="part-filament" />
        </TextField>
      )}
      <TextField value={text} onChange={setText} onBlur={() => text !== note.note && onChange({ ...note, note: text })} maxLength={500} className="flex flex-col gap-1">
        <Label className="text-xs text-text-muted">{t('parts.note')}</Label>
        <Input className={fieldClass} data-testid="part-note" />
      </TextField>
    </li>
  );
}
