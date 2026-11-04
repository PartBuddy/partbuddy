import { Html, Line } from '@react-three/drei';
import { IconBolt, IconSparkles, IconVariable } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, TextField } from 'react-aria-components';
import type { Color } from 'three';

import type { DimensionMark } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { sendToAssistant } from '../assistant/send';
import { platform } from '../platform';
import { useStudio, type ModelState, type Pick } from '../state/store';
import { Ghost } from './DimensionHud';
import { parseLength } from './lengthInput';
import { edgeLabel } from './viewState';

type Vec3 = [number, number, number];
const PROBE_DELAY_MS = 250;
const PLAIN_NUMBER = /^\s*-?\d+(\.\d+)?\s*(mm|deg)?\s*$/;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The feature a picked face or edge belongs to: the number in SolidCraft's face name (`F5:…`). */
function featureOfPick(model: ModelState, pick: Pick | null): number | null {
  if (!pick || model.status !== 'ready') return null;
  const viewer = model.bodies[pick.body]?.model;
  if (!viewer) return null;
  const name = pick.kind === 'face' ? viewer.table.faces[pick.face]?.name : pick.kind === 'edge' ? edgeLabel(viewer, pick.edge).name : undefined;
  const found = name ? /F(\d+)/.exec(name) : null;
  return found ? Number(found[1]) : null;
}

/**
 * Keeps the store's dimensions in step (M2b-3): those of the feature the user picked a face or
 * edge of (kept while nothing is selected), else of the newest active feature, or all.
 */
export function useDimensionMarks(): void {
  const mode = useStudio((s) => s.dimensions);
  const model = useStudio((s) => s.model);
  const selection = useStudio((s) => s.selection);
  const setMarks = useStudio((s) => s.setMarks);
  // The last picked feature stays the target while nothing is selected (a change clears the selection).
  const [remembered, setRemembered] = useState<number | null>(null);
  const picked = featureOfPick(model, selection);
  if (picked !== null && picked !== remembered) setRemembered(picked);
  const features = model.status === 'ready' ? model.structure.features.filter((feature) => !feature.suppressed && !feature.rolledBack) : [];
  const target = remembered !== null && features.some((feature) => feature.id === remembered) ? remembered : (features.at(-1)?.id ?? null);
  const revision = model.status === 'ready' ? `${model.documentId}:${String(model.revision)}` : null;

  useEffect(() => {
    if (mode === 'off' || revision === null || (mode === 'feature' && target === null)) {
      setMarks([]);
      return;
    }
    let live = true;
    platform()
      .design.dimensions(mode === 'all' ? 'all' : [target ?? 0])
      .then((marks) => {
        if (live) setMarks(marks);
      })
      .catch(() => {
        if (live) setMarks([]);
      });
    return () => {
      live = false;
    };
  }, [mode, target, revision, setMarks]);
}

/** The label of a dimension: `40`, `Ø10`, `R2`, `30°`, and the formula when one drives it. */
export function useMarkText(): (mark: DimensionMark) => { value: string; formula: string | null; name: string } {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  return (mark) => {
    const shown = mark.value;
    const prefix = mark.kind === 'diameter' ? 'Ø' : mark.kind === 'radius' ? 'R' : '';
    const value = `${prefix}${number.format(shown)}${mark.unit === 'deg' ? '°' : ''}`;
    const key = `dimensions.label.${mark.label.toLowerCase()}`;
    const label = i18n.exists(key) ? t(key) : mark.label;
    return { value, formula: PLAIN_NUMBER.test(mark.expression) ? null : mark.expression, name: `${mark.feature.name} · ${label}` };
  };
}

/**
 * The field of one dimension: typing tries the value in SolidCraft (ghost preview), Enter changes
 * it. A plain number is changed directly; a dimension that follows one user parameter changes
 * that parameter; a formula is never overwritten and goes to the assistant (ADR 0017).
 */
export function MarkField({ mark, onGhost, onClose }: { mark: DimensionMark; onGhost: (ghost: Uint8Array | null) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const text = useMarkText()(mark);
  const setNotice = useStudio((s) => s.setNotice);
  const assistant = selectedStatus(useAssistant((s) => s.state));
  const busy = assistant.state === 'busy';
  const decimal = (1.5).toLocaleString(i18n.language).charAt(1);
  const [draft, setDraft] = useState(() => String(Math.round(mark.value * 1000) / 1000).replace('.', decimal));
  const [probe, setProbe] = useState<{ value: number; ok: boolean; error?: string } | null>(null);
  const latest = useRef(0);
  const value = parseLength(draft);
  const changed = Number.isFinite(value) && value > 0 && Math.abs(value - mark.value) > 1e-6;
  const direct = mark.unit === 'mm' && mark.edit.mode !== 'assistant';
  const parameter = mark.edit.mode === 'parameter' ? mark.edit.name : mark.parameter;

  useEffect(() => {
    if (!changed || !direct || busy) {
      onGhost(null);
      return;
    }
    const id = ++latest.current;
    const timer = setTimeout(() => {
      platform()
        .design.probeParameter(parameter, value, mark.body)
        .then((result) => {
          if (latest.current !== id) return;
          setProbe(result.ok ? { value, ok: true } : { value, ok: false, error: result.error });
          onGhost(result.ok ? result.preview : null);
        })
        .catch(() => {
          if (latest.current === id) onGhost(null);
        });
    }, PROBE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [changed, direct, busy, parameter, value, mark.body, onGhost]);

  const current = probe?.value === value ? probe : null;
  const apply = () => {
    if (!changed || busy) return;
    if (direct) {
      if (!current?.ok) return;
      onClose();
      void platform()
        .design.applyDimension({ parameter, value, factor: 1, label: text.name })
        .catch((error: unknown) => {
          setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
        });
      return;
    }
    if (assistant.state !== 'ready') return;
    onClose();
    void sendToAssistant(
      t('dimensions.assistantRequest', { name: text.name, expression: mark.expression, from: text.value, to: draft.trim(), unit: mark.unit === 'deg' ? '°' : ' mm' }),
    );
  };

  let status: string;
  if (!changed) status = mark.edit.mode === 'parameter' ? t('dimensions.followsParameter', { name: mark.edit.name, count: mark.edit.others }) : direct ? t('dimensions.typeNew') : t('dimensions.formula', { expression: mark.expression });
  else if (!direct) status = assistant.state === 'ready' ? t('dimensions.toAssistant') : t('hud.noAssistant');
  else if (!current) status = t('hud.probing');
  else if (!current.ok) status = t('hud.actionRefused', { detail: current.error ?? '' });
  else status = mark.edit.mode === 'parameter' ? t('dimensions.changesParameter', { name: mark.edit.name, count: mark.edit.others }) : t('dimensions.direct');

  return (
    <div
      className="pointer-events-auto flex w-menu flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-testid="mark-field"
      data-mode={mark.edit.mode}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <TextField value={draft} onChange={setDraft} inputMode="decimal" isDisabled={busy} className="flex flex-col gap-1">
        <Label className="text-xs text-text-subtle">
          {text.name} · {mark.unit === 'deg' ? '°' : t('units.mmShort')}
        </Label>
        <Input
          autoFocus
          className="h-control-md w-full rounded-md border border-border-strong bg-surface px-2 font-mono text-md tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
          data-testid="mark-input"
        />
      </TextField>
      <p className="flex items-center gap-1 text-xs text-text-muted" role="status" data-testid="mark-status" data-ok={current ? String(current.ok) : undefined}>
        {direct && mark.edit.mode === 'direct' ? <IconBolt className="size-icon-sm shrink-0 text-accent" aria-hidden /> : null}
        {mark.edit.mode === 'parameter' ? <IconVariable className="size-icon-sm shrink-0 text-accent" aria-hidden /> : null}
        {!direct ? <IconSparkles className="size-icon-sm shrink-0 text-accent" aria-hidden /> : null}
        {status}
      </p>
    </div>
  );
}

function MarkLabel({ mark, open, onToggle }: { mark: DimensionMark; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const text = useMarkText()(mark);
  return (
    <AriaButton
      aria-label={t('dimensions.edit', { name: text.name, value: text.value })}
      aria-expanded={open}
      onPress={onToggle}
      className={`pointer-events-auto -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border px-1 font-mono text-xs tabular-nums shadow-2 outline-none focus-visible:outline-2 focus-visible:outline-focus ${
        open ? 'border-accent bg-surface-selected text-text' : 'border-border bg-surface-raised text-text hover:border-accent'
      }`}
      data-testid="mark-label"
      data-mark={mark.id}
      data-parameter={mark.parameter}
    >
      {text.formula ? <span className="text-text-subtle">{text.formula} = </span> : null}
      {text.value}
    </AriaButton>
  );
}

/** Dimension lines and labels in the 3D view; a label opens its field (M2b-3, ADR 0020). */
export function DimensionMarks({ color, ghostColor }: { color: Color; ghostColor: Color }) {
  const marks = useStudio((s) => s.marks);
  const openMark = useStudio((s) => s.openMark);
  const setOpenMark = useStudio((s) => s.setOpenMark);
  const [ghost, setGhost] = useState<Uint8Array | null>(null);
  // Like the note pins: Html attaches one frame after the scene first mounts.
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
    <group name="dimensions">
      {ghost && openMark !== null ? <Ghost preview={ghost} color={ghostColor} /> : null}
      {marks.map((mark) => {
        const g = mark.geometry;
        if (!g) return null;
        const open = openMark === mark.id;
        const lines: [Vec3, Vec3][] =
          g.from[0] === g.to[0] && g.from[1] === g.to[1] && g.from[2] === g.to[2]
            ? []
            : g.offset.every((v) => v === 0)
              ? [[g.from, g.to]]
              : [
                  [g.from, add(g.from, g.offset)],
                  [g.to, add(g.to, g.offset)],
                  [add(g.from, g.offset), add(g.to, g.offset)],
                ];
        return (
          <group key={mark.id}>
            {lines.map((segment, i) => (
              <Line key={i} points={segment} color={color} lineWidth={i === lines.length - 1 ? 1.5 : 1} />
            ))}
            <Html position={g.anchor} zIndexRange={open ? [32, 26] : [16, 11]} style={{ pointerEvents: 'none' }}>
              <div className="relative">
                <MarkLabel
                  mark={mark}
                  open={open}
                  onToggle={() => {
                    setOpenMark(open ? null : mark.id);
                  }}
                />
                {open ? (
                  <div className="absolute left-4 top-0 -translate-y-1/2">
                    <MarkField
                      mark={mark}
                      onGhost={setGhost}
                      onClose={() => {
                        setOpenMark(null);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/** Inputs PartBuddy cannot place on the model (pattern counts and the like), as a list beside the view. */
export function LooseDimensions() {
  const { t } = useTranslation();
  const all = useStudio((s) => s.marks);
  const marks = all.filter((mark) => mark.geometry === null);
  const openMark = useStudio((s) => s.openMark);
  const setOpenMark = useStudio((s) => s.setOpenMark);
  const text = useMarkText();
  if (marks.length === 0) return null;
  return (
    <section
      aria-label={t('dimensions.loose')}
      className="pointer-events-auto flex max-w-menu flex-col gap-1 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-testid="loose-dimensions"
    >
      <h2 className="text-xs font-semibold text-text-subtle">{t('dimensions.loose')}</h2>
      {marks.map((mark) => {
        const shown = text(mark);
        const open = openMark === mark.id;
        return (
          <div key={mark.id} className="flex flex-col gap-1">
            <AriaButton
              aria-expanded={open}
              onPress={() => {
                setOpenMark(open ? null : mark.id);
              }}
              className="flex items-center justify-between gap-2 rounded-md px-1 text-left text-xs text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
              data-testid="loose-mark"
            >
              <span className="truncate">{shown.name}</span>
              <span className="font-mono tabular-nums">{shown.value}</span>
            </AriaButton>
            {open ? (
              <MarkField
                mark={mark}
                onGhost={() => undefined}
                onClose={() => {
                  setOpenMark(null);
                }}
              />
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
