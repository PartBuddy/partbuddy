import { IconChevronDown, IconPuzzle } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, CheckboxButton, CheckboxField, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, TextField, ToggleButton } from 'react-aria-components';

import { BLOCK_KINDS, defaultBlock, sizesOf, type BlockKind, type BlockSize, type FeatureBlock } from '../../../shared/blocks';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { Button } from '../ui/Button';
import { parseLength } from './lengthInput';

const PREVIEW_DELAY_MS = 300;

function Choice({ label, value, items, onChange, testId }: { label: string; value: string; items: { id: string; label: string }[]; onChange: (id: string) => void; testId: string }) {
  return (
    <Select value={value} onChange={(key) => onChange(String(key))} className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <Label className="text-xs text-text-subtle">{label}</Label>
      <AriaButton className="inline-flex h-control-sm items-center justify-between gap-1 rounded-md border border-border-strong bg-surface px-2 text-sm text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus">
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

function Length({ label, value, onChange, testId }: { label: string; value: number; onChange: (value: number) => void; testId: string }) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState(value.toLocaleString(i18n.language));
  return (
    <TextField
      value={text}
      onChange={(next) => {
        setText(next);
        const parsed = parseLength(next);
        if (Number.isFinite(parsed) && parsed > 0) onChange(parsed);
      }}
      inputMode="decimal"
      className="flex min-w-0 flex-col gap-1"
      data-testid={testId}
    >
      <Label className="text-xs text-text-subtle">
        {label} · {t('units.mmShort')}
      </Label>
      <Input className="h-control-sm w-full rounded-md border border-border-strong bg-surface px-2 text-sm tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus" />
    </TextField>
  );
}

function Check({ label, selected, onChange, testId }: { label: string; selected: boolean; onChange: (selected: boolean) => void; testId: string }) {
  return (
    <CheckboxField isSelected={selected} onChange={onChange} data-testid={testId}>
      <CheckboxButton className="group inline-flex items-center gap-2 text-sm text-text outline-none">
        <span
          aria-hidden
          className="flex size-icon-sm shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface group-selected:border-accent group-selected:bg-accent group-focus-visible:outline-2 group-focus-visible:outline-focus"
        >
          <span className="hidden size-dot rounded-sm bg-surface group-selected:block" />
        </span>
        {label}
      </CheckboxButton>
    </CheckboxField>
  );
}

/** One picked flat face of a body that is no standard part, or null. */
function flatFace(bodies: BodyModel[], picks: Pick[]): { body: string; point: [number, number, number] } | null {
  const [pick] = picks;
  if (picks.length !== 1 || pick?.kind !== 'face') return null;
  const body = bodies[pick.body];
  if (!body?.model.table.faces[pick.face]?.planeNormal) return null;
  const model = useStudio.getState().model;
  if (model.status === 'ready' && model.structure.standardParts?.includes(body.name)) return null;
  return { body: body.name, point: pick.point };
}

/**
 * Function blocks at a picked flat face (plan step F1): a tapped hole, a screw hole with room for
 * the head, a seat for a heat-set insert, a screw boss. Sizes come from standard tables and stay
 * editable; the ghost shows the result before it is built.
 */
export function BlockPanel({ bodies, picks, busy, onGhost }: { bodies: BodyModel[]; picks: Pick[]; busy: boolean; onGhost: (ghost: Uint8Array | null) => void }) {
  const { t } = useTranslation();
  const face = flatFace(bodies, picks);
  const [open, setOpen] = useState(false);
  // The block's values; body and point come from the picked face.
  const [spec, setBlock] = useState<FeatureBlock>(() => defaultBlock('tappedHole', '', [0, 0, 0], 'M3'));
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null);
  const latest = useRef(0);
  const at = face ? `${face.body}\u0000${face.point.join(',')}` : null;
  const block = useMemo<FeatureBlock | null>(() => {
    if (!at) return null;
    const [body = '', point = ''] = at.split('\u0000');
    return { ...spec, body, point: point.split(',').map(Number) as [number, number, number] };
  }, [spec, at]);

  useEffect(() => {
    if (!open || !block || busy) return;
    const id = ++latest.current;
    const timer = setTimeout(() => {
      void platform()
        .design.previewBlock(block)
        .then((result) => {
          if (latest.current !== id) return;
          setStatus(result.ok ? { ok: true } : { ok: false, error: result.error });
          onGhost(result.ok ? result.preview : null);
        })
        .catch(() => {
          if (latest.current === id) onGhost(null);
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [open, block, busy, onGhost]);

  if (!face || !block) return null;
  const kind = (next: BlockKind) => {
    const sizes = sizesOf(next);
    setBlock(defaultBlock(next, face.body, face.point, sizes.includes(block.size) ? block.size : (sizes[2] ?? 'M3')));
    setStatus(null);
  };
  const size = (next: BlockSize) => {
    setBlock(block.block === 'screwHole' ? { ...block, size: next } : defaultBlock(block.block, face.body, face.point, next));
    setStatus(null);
  };
  const apply = () => {
    if (!status?.ok) return;
    setOpen(false);
    onGhost(null);
    void platform()
      .design.applyBlock(block)
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  const sizes = sizesOf(block.block, block.block === 'screwHole' ? block.head : 'none');

  return (
    <div className="flex flex-col gap-2" data-testid="block-panel">
      <ToggleButton
        isSelected={open}
        onChange={(next) => {
          setOpen(next);
          if (!next) onGhost(null);
        }}
        isDisabled={busy}
        className="inline-flex h-control-sm items-center gap-1 self-start rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover selected:border-accent selected:bg-surface-selected focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
        data-testid="action-block"
      >
        <IconPuzzle className="size-icon-sm" aria-hidden />
        {t('blocks.action')}
      </ToggleButton>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2" data-testid="block-form">
          <div className="grid grid-cols-2 gap-2">
            <Choice label={t('blocks.kind')} value={block.block} items={BLOCK_KINDS.map((id) => ({ id, label: t(`blocks.kinds.${id}`) }))} onChange={(id) => kind(id as BlockKind)} testId="block-kind" />
            <Choice label={t('blocks.size')} value={block.size} items={sizes.map((id) => ({ id, label: id }))} onChange={(id) => size(id as BlockSize)} testId="block-size" />
          </div>
          {block.block === 'tappedHole' ? (
            <div className="flex flex-col gap-2" key={`${block.block}-${block.size}`}>
              <Check label={t('blocks.through')} selected={block.depth === null} onChange={(through) => setBlock({ ...block, depth: through ? null : 10 })} testId="block-through" />
              {block.depth !== null ? <Length label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" /> : null}
              <Check label={t('blocks.modeled')} selected={block.modeled} onChange={(modeled) => setBlock({ ...block, modeled })} testId="block-modeled" />
            </div>
          ) : block.block === 'screwHole' ? (
            <div className="grid grid-cols-2 gap-2">
              <Choice
                label={t('blocks.head')}
                value={block.head}
                items={(['cap', 'countersunk', 'none'] as const).map((id) => ({ id, label: t(`blocks.heads.${id}`) }))}
                onChange={(id) => {
                  const head = id as 'none' | 'cap' | 'countersunk';
                  const allowed = sizesOf('screwHole', head);
                  setBlock({ ...block, head, size: allowed.includes(block.size) ? block.size : (allowed[0] ?? 'M3') });
                }}
                testId="block-head"
              />
              <Choice label={t('blocks.fit')} value={block.fit} items={(['close', 'normal', 'loose'] as const).map((id) => ({ id, label: t(`blocks.fits.${id}`) }))} onChange={(id) => setBlock({ ...block, fit: id as 'close' | 'normal' | 'loose' })} testId="block-fit" />
            </div>
          ) : block.block === 'insertSeat' ? (
            <div className="grid grid-cols-2 gap-2" key={`${block.block}-${block.size}`}>
              <Length label={t('blocks.diameter')} value={block.diameter} onChange={(diameter) => setBlock({ ...block, diameter })} testId="block-diameter" />
              <Length label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2" key={`${block.block}-${block.size}`}>
              <Length label={t('blocks.diameter')} value={block.diameter} onChange={(diameter) => setBlock({ ...block, diameter })} testId="block-diameter" />
              <Length label={t('blocks.height')} value={block.height} onChange={(height) => setBlock({ ...block, height })} testId="block-height" />
            </div>
          )}
          <p className="text-xs text-text-subtle">{t(`blocks.hint.${block.block}`)}</p>
          <p className="text-xs text-text-muted" role="status" data-testid="block-status" data-ok={status ? String(status.ok) : undefined}>
            {!status ? t('hud.probing') : status.ok ? t('blocks.ready') : t('hud.actionRefused', { detail: status.error ?? '' })}
          </p>
          <Button variant="primary" isDisabled={busy || !status?.ok} onPress={apply} data-testid="block-apply">
            {t('blocks.apply')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
