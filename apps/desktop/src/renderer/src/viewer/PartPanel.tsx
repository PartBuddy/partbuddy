import { IconChevronDown, IconNut } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, ToggleButton } from 'react-aria-components';

import type { PartFamily, PartsLibrary } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { Button } from '../ui/Button';
import { hasLength, suggestLength, suggestSize } from './partChoice';
import { fieldLabelClass } from '../ui/Field';

/** The diameter of the hole whose wall is picked, or null when the pick is no cylinder. */
function holeDiameter(bodies: BodyModel[], picks: Pick[]): number | null {
  const [pick] = picks;
  if (picks.length !== 1 || pick?.kind !== 'face') return null;
  const radius = bodies[pick.body]?.model.table.faces[pick.face]?.cylinder?.radius;
  return radius ? radius * 2 : null;
}

function Choice({ label, value, items, onChange, testId }: { label: string; value: string; items: { id: string; label: string }[]; onChange: (id: string) => void; testId: string }) {
  return (
    <Select value={value} onChange={(key) => onChange(String(key))} className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <Label className={fieldLabelClass}>{label}</Label>
      <AriaButton className="inline-flex h-control-sm items-center justify-between gap-1 rounded-md border border-border-strong bg-surface px-2 text-sm text-text outline-none hover:bg-surface-hover focus-visible:focus-ring">
        <SelectValue className="truncate" />
        <IconChevronDown className="size-icon-sm shrink-0 text-text-subtle" aria-hidden />
      </AriaButton>
      <Popover className="min-w-menu rounded-md border border-border bg-surface-raised p-1 shadow-2">
        <ListBox className="max-h-menu-max overflow-auto outline-none">
          {items.map((item) => (
            <ListBoxItem key={item.id} id={item.id} textValue={item.label} className="cursor-default rounded-sm px-2 py-1 text-sm text-text outline-none focus:bg-surface-hover selected:font-medium">
              {item.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}

/**
 * A standard part in the picked hole (plan step B7): screw, nut, washer, pin or bearing from
 * SolidCraft's library, the size suggested from the hole's diameter. The part is a counterpart:
 * it shows in the view but is not exported or checked for printing.
 */
export function PartPanel({ bodies, picks, busy }: { bodies: BodyModel[]; picks: Pick[]; busy: boolean }) {
  const { t } = useTranslation();
  const hole = holeDiameter(bodies, picks);
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<PartsLibrary | null>(null);
  const [family, setFamily] = useState<PartFamily>('socket_head_cap_screw');
  const [size, setSize] = useState<string | null>(null);
  const [length, setLength] = useState<number | null>(null);

  useEffect(() => {
    if (!open || library) return;
    let live = true;
    void platform()
      .design.partsLibrary()
      .then((loaded) => {
        if (!live) return;
        setLibrary(loaded);
        // The first suggestion from the hole's diameter.
        if (hole !== null) {
          const suggested = suggestSize(loaded, family, hole);
          setSize(suggested);
          setLength(suggested ? suggestLength(loaded, family, suggested) : null);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, library, hole, family]);

  const choose = (next: PartFamily) => {
    setFamily(next);
    const list = library;
    if (!list || hole === null) return;
    const suggested = suggestSize(list, next, hole);
    setSize(suggested);
    setLength(suggested ? suggestLength(list, next, suggested) : null);
  };
  if (hole === null) return null;
  const entry = library?.find((candidate) => candidate.family === family);
  const point = picks[0]?.point;
  const insert = () => {
    if (!size || !point) return;
    setOpen(false);
    void platform()
      .design.insertPart({ family, size, ...(length && library && hasLength(library, family) ? { length } : {}), point })
      .then((result) => {
        useStudio.getState().setNotice({ tone: 'success', text: t('parts.inserted', { name: result.body ?? size }) });
      })
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="part-panel">
      <ToggleButton
        isSelected={open}
        onChange={setOpen}
        isDisabled={busy}
        className="inline-flex h-control-sm items-center gap-1 self-start rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover selected:border-accent selected:bg-surface-selected focus-visible:focus-ring disabled:opacity-disabled"
        data-testid="action-part"
      >
        <IconNut className="size-icon-sm" aria-hidden />
        {t('parts.action')}
      </ToggleButton>
      {open && library && entry ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2" data-testid="part-form">
          <p className="text-xs text-text-muted tabular-nums">{t('parts.hole', { diameter: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(hole) })}</p>
          <div className="grid grid-cols-3 gap-2">
            <Choice
              label={t('parts.family')}
              value={family}
              items={library.map((item) => ({ id: item.family, label: t(`parts.families.${item.family}`) }))}
              onChange={(id) => choose(id as PartFamily)}
              testId="part-family"
            />
            <Choice
              label={t('parts.size')}
              value={size ?? ''}
              items={entry.sizes.map((item) => ({ id: item.size, label: item.size }))}
              onChange={(id) => {
                setSize(id);
                setLength(suggestLength(library, family, id));
              }}
              testId="part-size"
            />
            {entry.lengths ? (
              <Choice
                label={t('parts.length')}
                value={length === null ? '' : String(length)}
                items={entry.lengths.map((item) => ({ id: String(item), label: `${String(item)} mm` }))}
                onChange={(id) => setLength(Number(id))}
                testId="part-length"
              />
            ) : null}
          </div>
          <p className="text-xs text-text-subtle">{t('parts.hint')}</p>
          <Button variant="primary" isDisabled={!size || busy} onPress={insert} data-testid="part-insert">
            {t('parts.insert')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
