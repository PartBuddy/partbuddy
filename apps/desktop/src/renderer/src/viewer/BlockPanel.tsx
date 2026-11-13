import { IconDots, IconNut, IconTypography, IconVectorBezier2 } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckboxButton, CheckboxField, FileTrigger, Input, Label, NumberField, TextField, ToggleButton } from 'react-aria-components';

import { BLOCK_KINDS, defaultBlock, hasSize, HOOK_DIRECTIONS, hookVector, logoFrom, needsNormal, sizesOf, SNAP_STRAIN_LIMIT, snapStrain, type BlockKind, type BlockSize, type FeatureBlock } from '../../../shared/blocks';
import { drawingColours, drawingSvg, mergedColours, naturalWidth, parseDrawing, type Drawing, type DrawingProblem } from '../../../shared/svgDrawing';
import { DrawingDetailNote } from '../assistant/DrawingDetailNote';
import { platform } from '../platform';
import { CadIcon } from '../ui/CadIcon';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { Button } from '../ui/Button';
import { Tip } from '../ui/Tooltip';
import { parseLength } from './lengthInput';
import { useLivePreview } from './livePreview';
import { useFacePosition } from './facePosition';
import { ProbeStatus } from './ProbeStatus';
import { useOneEditor } from './dockEditor';
import { boldable as canBold, FontChoice, setFont, useFontFaces } from './FontChoice';
import { inputClass, fieldLabelClass, UnitInput } from '../ui/Field';
import { CheckMark, choiceInlineClass, chipToggleClass, SelectField as Choice } from '../ui/Choice';

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
      <Label className={fieldLabelClass}>{label}</Label>
      <UnitInput unit={t('units.mmShort')} />
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
      <Label className={fieldLabelClass}>{label}</Label>
      <Input className={inputClass('sm')} />
    </TextField>
  );
}

function Check({ label, selected, onChange, testId, isDisabled }: { label: string; selected: boolean; onChange: (selected: boolean) => void; testId: string; isDisabled?: boolean }) {
  return (
    <CheckboxField isSelected={selected} onChange={onChange} isDisabled={isDisabled ?? false} data-testid={testId}>
      <CheckboxButton className={choiceInlineClass}>
        <CheckMark />
        {label}
      </CheckboxButton>
    </CheckboxField>
  );
}

type Vec = [number, number, number];

/** The holes that can be laid out as a row. */
const ROW_KINDS = new Set<BlockKind>(['tappedHole', 'screwHole', 'insertSeat']);

/** One picked flat face of a body that is no standard part, or null. */
export function flatFace(bodies: BodyModel[], picks: Pick[]): { body: string; point: Vec; normal: Vec } | null {
  const [pick] = picks;
  if (picks.length !== 1 || pick?.kind !== 'face') return null;
  const body = bodies[pick.body];
  const normal = body?.model.table.faces[pick.face]?.planeNormal;
  if (!body || !normal) return null;
  const model = useStudio.getState().model;
  if (model.status === 'ready' && model.structure.standardParts?.includes(body.name)) return null;
  return { body: body.name, point: pick.point, normal };
}

/** The blocks with a tile of their own in the dock (decided 2026-11-09); the rest are under "More …". */
const TILES = [
  { kind: 'logo', icon: <IconVectorBezier2 className="size-icon-sm" aria-hidden /> },
  { kind: 'text', icon: <IconTypography className="size-icon-sm" aria-hidden /> },
  { kind: 'screwHole', icon: <CadIcon name="hole" className="size-icon-sm" /> },
  { kind: 'insertSeat', icon: <IconNut className="size-icon-sm" aria-hidden /> },
] as const satisfies readonly { kind: BlockKind; icon: React.ReactNode }[];
const tiled = (kind: BlockKind) => TILES.some((tile) => tile.kind === kind);

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
  // SolidCraft's answer for a block; only the answer for the block as it is now counts (a moved one is tried anew).
  const [status, setStatus] = useState<{ ok: boolean; error?: string; block?: FeatureBlock; unmeasured?: boolean } | null>(null);
  const [fileProblem, setFileProblem] = useState<DrawingProblem | 'unreadable' | null>(null);
  const at = face ? `${face.body}\u0000${face.point.join(',')}\u0000${face.normal.join(',')}` : null;
  // Where the block sits on its face, from the face's middle; at first where it was clicked.
  const { place, centre, controls: position } = useFacePosition({ bodies, picks, active: open, busy, testId: 'block' });
  // A row of holes: how many across and up, and how far apart, laid out evenly around the position.
  const [row, setRow] = useState<{ count: [number, number]; pitch: [number, number] }>({ count: [1, 1], pitch: [10, 10] });
  const faces = useFontFaces();
  // A bold text goes to SolidCraft in its bold face's full name; the form keeps the family.
  const sent = (b: FeatureBlock): FeatureBlock => (b.block === 'text' && b.font ? { ...b, ...setFont(faces, b.font, b.bold) } : b);
  const block = useMemo<FeatureBlock | null>(() => {
    if (!at || !centre) return null;
    const [body = '', , normal = ''] = at.split('\u0000');
    const vec = (text: string) => text.split(',').map(Number) as Vec;
    const mm3 = (value: number) => Math.round(value * 1000) / 1000;
    if (!ROW_KINDS.has(spec.block)) return { ...spec, body, point: centre.map(mm3) as Vec, ...(needsNormal(spec.block) ? { normal: vec(normal) } : {}) };
    const points: Vec[] = [];
    const [nx, ny] = row.count;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const [u, v] = [(i - (nx - 1) / 2) * row.pitch[0], (j - (ny - 1) / 2) * row.pitch[1]];
        points.push(centre.map((value, k) => mm3(value + u * (place?.x[k] ?? 0) + v * (place?.y[k] ?? 0))) as Vec);
      }
    }
    return { ...spec, body, point: points[0] ?? centre, more: points.slice(1) } as FeatureBlock;
  }, [spec, at, centre, place, row]);

  // The fills of a logo's drawing: with two or more it can be built a body per colour.
  const logoSvg = spec.block === 'logo' ? spec.svg : '';
  const logoDrawing = useMemo(() => {
    const read = logoSvg ? parseDrawing(logoSvg) : null;
    return read?.ok ? read.drawing : null;
  }, [logoSvg]);
  const fills = useMemo(() => (logoDrawing ? drawingColours(logoDrawing) : []), [logoDrawing]);
  // The drawing as the file has it, before its colours were brought down to fewer filaments.
  const [logoFull, setLogoFull] = useState<Drawing | null>(null);
  // The file had a sheet or frame around the drawing, left out.
  const [backdrop, setBackdrop] = useState(false);
  const fullDrawing = logoFull ?? logoDrawing;
  const fullCount = useMemo(() => (fullDrawing ? drawingColours(fullDrawing).length : 0), [fullDrawing]);
  // The width field shows a width taken from the detail warning by starting afresh.
  const [widened, setWidened] = useState(0);
  // A logo waits for its file.
  const waiting = block?.block === 'logo' && !block.svg;

  // The ghost keeps up while the block is dragged or its values are typed.
  useLivePreview(
    open && block && !busy && !waiting ? block : null,
    (tried) => platform().design.previewBlock(sent(tried)),
    (tried, result) => {
      setStatus(result.ok ? { ok: true, block: tried, unmeasured: result.unmeasured === true } : { ok: false, error: result.error, block: tried });
      onGhost(result.ok ? result.preview : null);
    },
  );

  const tried = status && (!status.block || status.block === block) ? status : null;
  // A font without a bold face cannot be set bold (SolidCraft refuses it).
  const boldable = canBold(faces, spec.block === 'text' ? (spec.font ?? '') : '');
  useOneEditor('block', open, () => {
    setOpen(false);
    onGhost(null);
  });
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
      (text) => {
        const logo = logoFrom(text);
        setFileProblem('problem' in logo ? logo.problem : null);
        if ('problem' in logo) return;
        setStatus(null);
        const read = parseDrawing(logo.svg);
        setLogoFull(read.ok ? read.drawing : null);
        setBackdrop(logo.backgrounds > 0);
        // The fields may have changed while the file was read; a file with a size in mm keeps it.
        setBlock((current) => (current.block === 'logo' ? { ...current, svg: logo.svg, ...(logo.width ? { width: logo.width } : {}), name: file.name.replace(/\.svg$/i, '').slice(0, 200) } : current));
      },
      () => setFileProblem('unreadable'),
    );
  };
  const size = (next: BlockSize) => {
    setBlock(block.block === 'screwHole' ? { ...block, size: next } : block.block === 'slot' ? { ...defaultBlock('slot', face.body, face.point, next, face.normal), length: block.length, depth: block.depth, along: block.along } as FeatureBlock : defaultBlock(block.block, face.body, face.point, next, face.normal));
    setStatus(null);
  };
  const close = () => {
    setOpen(false);
    onGhost(null);
  };
  const apply = () => {
    if (!tried?.ok) return;
    setOpen(false);
    onGhost(null);
    void platform()
      .design.applyBlock(sent(block))
      .catch((error: unknown) => {
        useStudio.getState().setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };
  const sizes = sizesOf(block.block, block.block === 'screwHole' ? block.head : 'none');

  return (
    <div className="flex flex-col gap-2" data-testid="block-panel">
      {/* The usual blocks as tiles of their own, the rest behind "More …" with its chooser. */}
      <div className="flex flex-wrap gap-1">
        {TILES.map((tile) => (
          <Tip key={tile.kind} label={t(`blocks.tileHints.${tile.kind}`)}>
            <ToggleButton
              isSelected={open && block.block === tile.kind}
              onChange={(next) => {
                if (next) kind(tile.kind);
                else onGhost(null);
                setOpen(next);
              }}
              isDisabled={busy}
              className={chipToggleClass}
              data-testid={`block-tile-${tile.kind}`}
            >
              {tile.icon}
              {t(`blocks.tiles.${tile.kind}`)}
            </ToggleButton>
          </Tip>
        ))}
        <Tip label={t('blocks.moreHint')}>
          <ToggleButton
            isSelected={open && !tiled(block.block)}
            onChange={(next) => {
              if (next && tiled(block.block)) kind('tappedHole');
              if (!next) onGhost(null);
              setOpen(next);
            }}
            isDisabled={busy}
            className={chipToggleClass}
            data-testid="action-block"
          >
            <IconDots className="size-icon-sm" aria-hidden />
            {t('blocks.more')}
          </ToggleButton>
        </Tip>
      </div>
      {open ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2"
          data-testid="block-form"
          // Esc leaves the form and its preview, the face stays picked.
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            // Esc in a list or a field with a list closes only that list.
            if ((event.target as HTMLElement).closest('[role=combobox], [role=listbox], [role=option]')) return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
        >
          {/* The tiles choose their own kind; the list holds only the kinds behind "More …" (audit B-06). */}
          {tiled(block.block) && !hasSize(block.block) ? null : (
            <div className="grid grid-cols-2 gap-2">
              {tiled(block.block) ? null : <Choice label={t('blocks.kind')} value={block.block} items={BLOCK_KINDS.filter((id) => !tiled(id)).map((id) => ({ id, label: t(`blocks.kinds.${id}`) }))} onChange={(id) => kind(id)} testId="block-kind" />}
              {hasSize(block.block) ? <Choice label={t('blocks.size')} value={block.size} items={sizes.map((id) => ({ id, label: id }))} onChange={(id) => size(id)} testId="block-size" /> : null}
            </div>
          )}
          {position}
          {place && ROW_KINDS.has(block.block) ? (
            <div className="flex flex-col gap-1" data-testid="block-row">
              <span className={fieldLabelClass}>{t('blocks.row')}</span>
              <div className="flex flex-wrap items-end gap-2">
                {([0, 1] as const).map((axis) => (
                  <NumberField
                    key={`count-${String(axis)}`}
                    value={row.count[axis]}
                    minValue={1}
                    maxValue={10}
                    step={1}
                    isDisabled={busy}
                    onChange={(next) => {
                      if (!Number.isFinite(next)) return;
                      const count: [number, number] = axis === 0 ? [next, row.count[1]] : [row.count[0], next];
                      setRow({ ...row, count });
                    }}
                    className="flex w-field-dock flex-col gap-1"
                    data-testid={axis === 0 ? 'block-count-x' : 'block-count-y'}
                  >
                    <Label className={fieldLabelClass}>{t(axis === 0 ? 'blocks.countAcross' : 'blocks.countUp')}</Label>
                    <UnitInput unit="×" />
                  </NumberField>
                ))}
                {([0, 1] as const)
                  .filter((axis) => row.count[axis] > 1)
                  .map((axis) => (
                    <NumberField
                      key={`pitch-${String(axis)}`}
                      value={row.pitch[axis]}
                      minValue={0.5}
                      maxValue={500}
                      step={0.5}
                      isDisabled={busy}
                      formatOptions={{ maximumFractionDigits: 2 }}
                      onChange={(next) => {
                        if (!Number.isFinite(next)) return;
                        const pitch: [number, number] = axis === 0 ? [next, row.pitch[1]] : [row.pitch[0], next];
                        setRow({ ...row, pitch });
                      }}
                      className="flex w-field-dock flex-col gap-1"
                      data-testid={axis === 0 ? 'block-pitch-x' : 'block-pitch-y'}
                    >
                      <Label className={fieldLabelClass}>{t(axis === 0 ? 'blocks.pitchAcross' : 'blocks.pitchUp')}</Label>
                      <UnitInput unit={t('units.mmShort')} />
                    </NumberField>
                  ))}
              </div>
            </div>
          ) : null}
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
                  const head = id;
                  const allowed = sizesOf('screwHole', head);
                  setBlock({ ...block, head, size: allowed.includes(block.size) ? block.size : (allowed[0] ?? 'M3') });
                }}
                testId="block-head"
              />
              <Choice label={t('blocks.fit')} value={block.fit} items={(['close', 'normal', 'loose'] as const).map((id) => ({ id, label: t(`blocks.fits.${id}`) }))} onChange={(id) => setBlock({ ...block, fit: id })} testId="block-fit" />
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
              <Choice label={t('blocks.along')} value={block.along} items={(['x', 'y'] as const).map((id) => ({ id, label: t(`blocks.alongs.${id}`) }))} onChange={(id) => setBlock({ ...block, along: id })} testId="block-along" />
              <div className="col-span-2">
                <Check label={t('blocks.through')} selected={block.depth === null} onChange={(through) => setBlock({ ...block, depth: through ? null : 5 })} testId="block-through" />
              </div>
              {block.depth !== null ? <Length label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" /> : null}
            </div>
          ) : block.block === 'text' ? (
            <div className="grid grid-cols-2 gap-2" key={block.block}>
              <Words label={t('blocks.text')} value={block.text} onChange={(text) => setBlock({ ...block, text })} testId="block-text" />
              <Choice label={t('blocks.textMode')} value={block.mode} items={(['deboss', 'emboss'] as const).map((id) => ({ id, label: t(`blocks.textModes.${id}`) }))} onChange={(id) => setBlock({ ...block, mode: id, depth: id === 'emboss' ? 0.4 : 0.6 })} testId="block-mode" />
              <Length key={block.mode} label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" />
              <Length label={t('blocks.textHeight')} value={block.height} onChange={(height) => setBlock({ ...block, height })} testId="block-height" />
              <div className="flex items-end pb-1">
                <Check label={t('blocks.bold')} selected={block.bold && boldable} isDisabled={!boldable} onChange={(bold) => setBlock({ ...block, bold })} testId="block-bold" />
              </div>
              <FontChoice
                value={block.font ?? ''}
                onChange={(font, canBold) => setBlock({ ...block, font: font || undefined, bold: block.bold && canBold })}
              />
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
              {backdrop && block.svg ? (
                <p className="col-span-2 text-xs text-text-muted" data-testid="block-logo-backdrop">
                  {t('drawingDetail.backdrop')}
                </p>
              ) : null}
              {fileProblem ? (
                <p className="col-span-2 text-xs text-danger" role="alert" data-testid="block-logo-problem">
                  {t(`blocks.logoProblems.${fileProblem}`)}
                </p>
              ) : null}
              <Choice label={t('blocks.textMode')} value={block.mode} items={(['deboss', 'emboss'] as const).map((id) => ({ id, label: t(`blocks.textModes.${id}`) }))} onChange={(id) => setBlock({ ...block, mode: id, depth: id === 'emboss' ? 0.4 : 0.6 })} testId="block-mode" />
              <Length key={block.mode} label={t('blocks.depth')} value={block.depth} onChange={(depth) => setBlock({ ...block, depth })} testId="block-depth" />
              <Length key={widened} label={t('blocks.width')} value={block.width} onChange={(width) => setBlock({ ...block, width })} testId="block-width" />
              <div className="col-span-2">
                <DrawingDetailNote
                  drawing={logoDrawing}
                  width={block.width}
                  onWiden={(width) => {
                    setBlock({ ...block, width });
                    setWidened((n) => n + 1);
                  }}
                />
              </div>
              <div className="col-span-2 flex">
                <Check label={t('blocks.logoCentre')} selected={Boolean(block.centre)} onChange={(centre) => setBlock({ ...block, centre })} testId="block-centre" />
              </div>
              {fills.length > 1 ? (
                <div className="col-span-2 flex flex-col gap-1" data-testid="block-logo-colours">
                  <div className="flex items-center gap-2">
                    <Check label={t('blocks.logoColours', { count: fills.length })} selected={Boolean(block.colours)} onChange={(colours) => setBlock({ ...block, colours })} testId="block-colours" />
                    <span className="flex gap-1" aria-hidden>
                      {fills.map((fill) => (
                        <span key={fill} className="size-3 rounded-sm border border-border-strong" style={{ background: fill }} />
                      ))}
                    </span>
                  </div>
                  {block.colours && fullDrawing && fullCount > 2 ? (
                    <Choice
                      label={t('blocks.logoMost')}
                      value={String(fills.length)}
                      items={Array.from({ length: fullCount - 1 }, (_, k) => String(fullCount - k)).map((id) => ({ id, label: id }))}
                      onChange={(id) => {
                        // The nearest colours merge, the larger area keeping its colour; back up from the file as it was.
                        const merged = mergedColours(fullDrawing, Number(id));
                        setLogoFull(fullDrawing);
                        setBlock({ ...block, svg: drawingSvg(merged, naturalWidth(merged) ?? 100) });
                      }}
                      testId="block-colours-most"
                    />
                  ) : null}
                  {block.colours ? <p className="text-xs text-text-muted">{t(`blocks.logoColoursHint.${block.mode}`)}</p> : null}
                </div>
              ) : null}
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
                onChange={(id) => setBlock({ ...block, hook: id })}
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
              <Choice label={t('blocks.lipType')} value={block.type} items={(['lip', 'groove'] as const).map((id) => ({ id, label: t(`blocks.lipTypes.${id}`) }))} onChange={(id) => setBlock({ ...block, type: id })} testId="block-lip-type" />
              <Length label={t('blocks.width')} value={block.width} onChange={(width) => setBlock({ ...block, width })} testId="block-width" />
              <Length label={t('blocks.height')} value={block.height} onChange={(height) => setBlock({ ...block, height })} testId="block-height" />
              {block.type === 'groove' ? <Length label={t('blocks.gap')} value={block.gap} onChange={(gap) => setBlock({ ...block, gap })} testId="block-gap" /> : null}
            </div>
          )}
          <p className="text-xs text-text-subtle">{t(`blocks.hint.${block.block}`)}</p>
          {waiting ? (
            <p className="text-xs text-text-muted" role="status" data-testid="block-status">
              {t('blocks.logoWaiting')}
            </p>
          ) : (
            <ProbeStatus state={!tried ? 'probing' : tried.ok ? 'ready' : 'refused'} error={tried?.error} ready={tried?.unmeasured ? t('blocks.unmeasured') : t('blocks.ready')} testId="block-status" />
          )}
          <div className="flex gap-2">
            <Button variant="primary" isDisabled={busy || !tried?.ok} onPress={apply} className="flex-1" data-testid="block-apply">
              {t('blocks.apply')}
            </Button>
            <Button onPress={close} data-testid="block-cancel">
              {t('hud.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
