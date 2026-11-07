import { IconChevronDown, IconPuzzle } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, CheckboxButton, CheckboxField, FileTrigger, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, TextField, ToggleButton } from 'react-aria-components';

import { BLOCK_KINDS, defaultBlock, hasSize, HOOK_DIRECTIONS, hookVector, logoProblem, needsNormal, sizesOf, snapStrain, type BlockKind, type BlockSize, type FeatureBlock, type HookDirection } from '../../../shared/blocks';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { Button } from '../ui/Button';
import { parseLength } from './lengthInput';

const PREVIEW_DELAY_MS = 300;

function Choice({ label, value, items, onChange, testId }: { label: string; value: string; items: { id: string; label: string }[]; onChange: (id: string) => void; testId: string }) {
  return (
    <Select value={value} onChange={(key) => onChange(String(key))} className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <Label className="text-xs text-text-subtle">{label}</Label>
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
      <Input className="h-control-sm w-full rounded-md border border-border-strong bg-surface px-2 text-sm tabular-nums text-text outline-none focus-visible:focus-ring" />
    </TextField>
  );
}

function Words({ label, value, onChange, testId }: { label: string; value: string; onChange: (value: string) => void; testId: string }) {
  const [text, setText] = useState(value);
  return (
    <TextField
      value={text}
      onChange={(next) => {
        setText(next);
        if (next.trim()) onChange(next.trim().slice(0, 80));
      }}
      maxLength={80}
      className="col-span-2 flex min-w-0 flex-col gap-1"
      data-testid={testId}
    >
      <Label className="text-xs text-text-subtle">{label}</Label>
      <Input className="h-control-sm w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text outline-none focus-visible:focus-ring" />
    </TextField>
  );
}

function Check({ label, selected, onChange, testId }: { label: string; selected: boolean; onChange: (selected: boolean) => void; testId: string }) {
  return (
    <CheckboxField isSelected={selected} onChange={onChange} data-testid={testId}>
      <CheckboxButton className="group inline-flex items-center gap-2 text-sm text-text outline-none">
        <span
          aria-hidden
          className="flex size-icon-sm shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface group-selected:border-accent group-selected:bg-accent group-focus-visible:focus-ring"
        >
          <span className="hidden size-dot rounded-sm bg-surface group-selected:block" />
        </span>
        {label}
      </CheckboxButton>
    </CheckboxField>
  );
}

type Vec = [number, number, number];

/** One picked flat face of a body that is no standard part, or null. */
function flatFace(bodies: BodyModel[], picks: Pick[]): { body: string; point: Vec; normal: Vec } | null {
  const [pick] = picks;
  if (picks.length !== 1 || pick?.kind !== 'face') return null;
  const body = bodies[pick.body];
  const normal = body?.model.table.faces[pick.face]?.planeNormal;
  if (!body || !normal) return null;
  const model = useStudio.getState().model;
  if (model.status === 'ready' && model.structure.standardParts?.includes(body.name)) return null;
  return { body: body.name, point: pick.point, normal };
}

/** Above this strain at the arm's root, printed PLA tends to crack (PETG takes about 3 %). */
const SNAP_STRAIN_LIMIT = 2;

/** The catch's direction named by its world axis, so it matches the axes in the view. */
function hookLabel(vector: Vec, index: number, t: TFunction): string {
  const axis = vector.findIndex((value) => Math.abs(Math.abs(value) - 1) < 1e-6);
  if (axis < 0) return t('blocks.hooks.other', { n: index + 1 });
  const positive = (vector[axis] ?? 0) > 0;
  if (axis === 2) return t(positive ? 'blocks.hooks.up' : 'blocks.hooks.down');
  return t('blocks.hooks.axis', { axis: `${positive ? '+' : '−'}${'XY'[axis] ?? ''}` });
}

/**
 * Function blocks at a picked flat face (plan step F1): a tapped hole, a screw hole with room for
 * the head, a seat for a heat-set insert, a nut trap, a screw boss, a slot, text, a logo from an
 * SVG file, a lip or groove for a lid, and a snap fit. Sizes come from standard tables and stay editable; the ghost shows
 * the result before it is built.
 */
export function BlockPanel({ bodies, picks, busy, onGhost }: { bodies: BodyModel[]; picks: Pick[]; busy: boolean; onGhost: (ghost: Uint8Array | null) => void }) {
  const { t, i18n } = useTranslation();
  const face = flatFace(bodies, picks);
  const [open, setOpen] = useState(false);
  // The block's values; body and point come from the picked face.
  const [spec, setBlock] = useState<FeatureBlock>(() => defaultBlock('tappedHole', '', [0, 0, 0], 'M3'));
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null);
  const [fileProblem, setFileProblem] = useState<'tooBig' | 'notSvg' | 'unreadable' | null>(null);
  const latest = useRef(0);
  const at = face ? `${face.body}\u0000${face.point.join(',')}\u0000${face.normal.join(',')}` : null;
  const block = useMemo<FeatureBlock | null>(() => {
    if (!at) return null;
    const [body = '', point = '', normal = ''] = at.split('\u0000');
    const vec = (text: string) => text.split(',').map(Number) as Vec;
    return { ...spec, body, point: vec(point), ...(needsNormal(spec.block) ? { normal: vec(normal) } : {}) };
  }, [spec, at]);

  // A logo waits for its file.
  const waiting = block?.block === 'logo' && !block.svg;

  useEffect(() => {
    if (!open || !block || busy || waiting) return;
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
  }, [open, block, busy, waiting, onGhost]);

  if (!face || !block) return null;
  const kind = (next: BlockKind) => {
    const sizes = sizesOf(next);
    setBlock(defaultBlock(next, face.body, face.point, sizes.includes(block.size) ? block.size : (sizes[2] ?? 'M3'), face.normal));
    setStatus(null);
    setFileProblem(null);
    onGhost(null);
  };
  const chooseLogo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || block.block !== 'logo') return;
    void file.text().then(
      (svg) => {
        const problem = logoProblem(svg);
        setFileProblem(problem);
        if (problem) return;
        setStatus(null);
        // The fields may have changed while the file was read.
        setBlock((current) => (current.block === 'logo' ? { ...current, svg, name: file.name.replace(/\.svg$/i, '').slice(0, 200) } : current));
      },
      () => setFileProblem('unreadable'),
    );
  };
  const size = (next: BlockSize) => {
    setBlock(block.block === 'screwHole' ? { ...block, size: next } : block.block === 'slot' ? { ...defaultBlock('slot', face.body, face.point, next, face.normal), length: block.length, depth: block.depth, along: block.along } as FeatureBlock : defaultBlock(block.block, face.body, face.point, next, face.normal));
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
        className="inline-flex h-control-sm items-center gap-1 self-start rounded-md border border-border px-2 text-xs text-text outline-none hover:bg-surface-hover selected:border-accent selected:bg-surface-selected focus-visible:focus-ring disabled:opacity-disabled"
        data-testid="action-block"
      >
        <IconPuzzle className="size-icon-sm" aria-hidden />
        {t('blocks.action')}
      </ToggleButton>
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2" data-testid="block-form">
          <div className="grid grid-cols-2 gap-2">
            <Choice label={t('blocks.kind')} value={block.block} items={BLOCK_KINDS.map((id) => ({ id, label: t(`blocks.kinds.${id}`) }))} onChange={(id) => kind(id as BlockKind)} testId="block-kind" />
            {hasSize(block.block) ? <Choice label={t('blocks.size')} value={block.size} items={sizes.map((id) => ({ id, label: id }))} onChange={(id) => size(id as BlockSize)} testId="block-size" /> : null}
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
          ) : block.block === 'boss' ? (
            <div className="grid grid-cols-2 gap-2" key={`${block.block}-${block.size}`}>
              <Length label={t('blocks.diameter')} value={block.diameter} onChange={(diameter) => setBlock({ ...block, diameter })} testId="block-diameter" />
              <Length label={t('blocks.height')} value={block.height} onChange={(height) => setBlock({ ...block, height })} testId="block-height" />
            </div>
          ) : block.block === 'nutTrap' ? (
            <div className="grid grid-cols-2 gap-2" key={`${block.block}-${block.size}`}>
              <Length label={t('blocks.flats')} value={block.flats} onChange={(flats) => setBlock({ ...block, flats })} testId="block-flats" />
              <Length label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" />
            </div>
          ) : block.block === 'slot' ? (
            <div className="grid grid-cols-2 gap-2" key={`${block.block}-${block.size}`}>
              <Length label={t('blocks.length')} value={block.length} onChange={(length) => setBlock({ ...block, length })} testId="block-length" />
              <Length label={t('blocks.width')} value={block.width} onChange={(width) => setBlock({ ...block, width })} testId="block-width" />
              <Choice label={t('blocks.along')} value={block.along} items={(['x', 'y'] as const).map((id) => ({ id, label: t(`blocks.alongs.${id}`) }))} onChange={(id) => setBlock({ ...block, along: id as 'x' | 'y' })} testId="block-along" />
              <div className="col-span-2">
                <Check label={t('blocks.through')} selected={block.depth === null} onChange={(through) => setBlock({ ...block, depth: through ? null : 5 })} testId="block-through" />
              </div>
              {block.depth !== null ? <Length label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" /> : null}
            </div>
          ) : block.block === 'text' ? (
            <div className="grid grid-cols-2 gap-2" key={block.block}>
              <Words label={t('blocks.text')} value={block.text} onChange={(text) => setBlock({ ...block, text })} testId="block-text" />
              <Choice label={t('blocks.textMode')} value={block.mode} items={(['deboss', 'emboss'] as const).map((id) => ({ id, label: t(`blocks.textModes.${id}`) }))} onChange={(id) => setBlock({ ...block, mode: id as 'emboss' | 'deboss', depth: id === 'emboss' ? 0.4 : 0.6 })} testId="block-mode" />
              <Length key={block.mode} label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" />
              <Length label={t('blocks.textHeight')} value={block.height} onChange={(height) => setBlock({ ...block, height })} testId="block-height" />
              <div className="flex items-end pb-1">
                <Check label={t('blocks.bold')} selected={block.bold} onChange={(bold) => setBlock({ ...block, bold })} testId="block-bold" />
              </div>
            </div>
          ) : block.block === 'logo' ? (
            <div className="grid grid-cols-2 gap-2" key={block.block} data-testid="block-logo">
              <div className="col-span-2 flex min-w-0 items-center gap-2">
                <FileTrigger acceptedFileTypes={['image/svg+xml', '.svg']} onSelect={chooseLogo}>
                  <Button data-testid="block-logo-file">{t(block.svg ? 'blocks.logoOther' : 'blocks.logoChoose')}</Button>
                </FileTrigger>
                {block.svg ? (
                  <span className="truncate text-sm text-text" title={block.name} data-testid="block-logo-name">
                    {block.name}
                  </span>
                ) : null}
              </div>
              {fileProblem ? (
                <p className="col-span-2 text-xs text-danger" role="alert" data-testid="block-logo-problem">
                  {t(`blocks.logoProblems.${fileProblem}`)}
                </p>
              ) : null}
              <Choice label={t('blocks.textMode')} value={block.mode} items={(['deboss', 'emboss'] as const).map((id) => ({ id, label: t(`blocks.textModes.${id}`) }))} onChange={(id) => setBlock({ ...block, mode: id as 'emboss' | 'deboss', depth: id === 'emboss' ? 0.4 : 0.6 })} testId="block-mode" />
              <Length key={block.mode} label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" />
              <Length label={t('blocks.width')} value={block.width} onChange={(width) => setBlock({ ...block, width })} testId="block-width" />
            </div>
          ) : block.block === 'snapFit' ? (
            <div className="grid grid-cols-2 gap-2" key={block.block}>
              <Length label={t('blocks.length')} value={block.length} onChange={(length) => setBlock({ ...block, length })} testId="block-length" />
              <Length label={t('blocks.thickness')} value={block.thickness} onChange={(thickness) => setBlock({ ...block, thickness })} testId="block-thickness" />
              <Length label={t('blocks.width')} value={block.width} onChange={(width) => setBlock({ ...block, width })} testId="block-width" />
              <Choice
                label={t('blocks.hook')}
                value={block.hook}
                items={HOOK_DIRECTIONS.map((id, index) => ({ id, label: hookLabel(hookVector(block.point, block.normal, id), index, t) }))}
                onChange={(id) => setBlock({ ...block, hook: id as HookDirection })}
                testId="block-hook"
              />
              <Length label={t('blocks.catchDepth')} value={block.catchDepth} onChange={(catchDepth) => setBlock({ ...block, catchDepth })} testId="block-catch-depth" />
              <Length label={t('blocks.catchLength')} value={block.catchLength} onChange={(catchLength) => setBlock({ ...block, catchLength })} testId="block-catch-length" />
              <p className={`col-span-2 text-xs ${snapStrain(block) > SNAP_STRAIN_LIMIT ? 'text-warning' : 'text-text-subtle'}`} data-testid="block-strain">
                {t(snapStrain(block) > SNAP_STRAIN_LIMIT ? 'blocks.strainHigh' : 'blocks.strain', { strain: snapStrain(block).toLocaleString(i18n.language, { maximumFractionDigits: 1 }) })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2" key={block.block}>
              <Choice label={t('blocks.lipType')} value={block.type} items={(['lip', 'groove'] as const).map((id) => ({ id, label: t(`blocks.lipTypes.${id}`) }))} onChange={(id) => setBlock({ ...block, type: id as 'lip' | 'groove' })} testId="block-lip-type" />
              <Length label={t('blocks.width')} value={block.width} onChange={(width) => setBlock({ ...block, width })} testId="block-width" />
              <Length label={t('blocks.height')} value={block.height} onChange={(height) => setBlock({ ...block, height })} testId="block-height" />
              {block.type === 'groove' ? <Length label={t('blocks.gap')} value={block.gap} onChange={(gap) => setBlock({ ...block, gap })} testId="block-gap" /> : null}
            </div>
          )}
          <p className="text-xs text-text-subtle">{t(`blocks.hint.${block.block}`)}</p>
          <p className="text-xs text-text-muted" role="status" data-testid="block-status" data-ok={status ? String(status.ok) : undefined}>
            {waiting ? t('blocks.logoWaiting') : !status ? t('hud.probing') : status.ok ? t('blocks.ready') : t('hud.actionRefused', { detail: status.error ?? '' })}
          </p>
          <Button variant="primary" isDisabled={busy || !status?.ok} onPress={apply} data-testid="block-apply">
            {t('blocks.apply')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
