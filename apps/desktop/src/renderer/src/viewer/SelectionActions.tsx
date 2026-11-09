import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Label, TextField, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import type { DesignAction, MeasureItem, MeasureResult } from '../../../shared/contract';
import { platform } from '../platform';
import { Button } from '../ui/Button';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { CadIcon } from '../ui/CadIcon';
import { actionsFor, type ActionKind } from './actionKinds';
import { useFacePosition } from './facePosition';
import { parseLength } from './lengthInput';
import { edgePoints, lineDirection, localMeasure, type MeasurePick } from './measure';
import { inputClass, fieldLabelClass } from '../ui/Field';
import { chipToggleClass } from '../ui/Choice';
import { Tip } from '../ui/Tooltip';

/** Starting sizes in mm, typical for FDM parts. */
const DEFAULT_SIZE: Record<ActionKind, number> = { fillet: 1, chamfer: 0.5, extrude: 5, hole: 3, shell: 1.6 };
const PREVIEW_DELAY_MS = 250;

const ICONS: Record<ActionKind, ReactNode> = {
  fillet: <CadIcon name="fillet" className="size-icon-sm" />,
  chamfer: <CadIcon name="chamfer" className="size-icon-sm" />,
  extrude: <CadIcon name="extrude" className="size-icon-sm" />,
  hole: <CadIcon name="hole" className="size-icon-sm" />,
  shell: <CadIcon name="shell" className="size-icon-sm" />,
};

function actionOf(kind: ActionKind, body: string, picks: Pick[], size: number, at: [number, number, number] | null): DesignAction {
  const points = picks.map((pick) => pick.point);
  const [first] = points as [[number, number, number]];
  switch (kind) {
    case 'extrude':
      return { action: 'extrude', body, points: [first], size };
    case 'hole':
      // Where the fields and arrows put it on the face; at first where it was clicked.
      return { action: 'hole', body, points: [at ?? first], size };
    default:
      return { action: kind, body, points, size };
  }
}

/**
 * Buttons for the actions that fit the selection; the chosen one opens a size field. Typing builds
 * it on trial for the ghost preview, Enter builds it for real, Escape closes it (M1b-2).
 */
export function ActionPanel({ bodies, picks, busy, onGhost }: { bodies: BodyModel[]; picks: Pick[]; busy: boolean; onGhost: (ghost: Uint8Array | null) => void }) {
  const { t, i18n } = useTranslation();
  const setNotice = useStudio((s) => s.setNotice);
  const kinds = actionsFor(bodies, picks);
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<{ text: string; ok: boolean; error?: string } | null>(null);
  const latest = useRef(0);
  const body = bodies[picks[0]?.body ?? -1]?.name;
  const decimal = (1.5).toLocaleString(i18n.language).charAt(1);
  // Extrude also takes a negative distance (a cut); the others are positive lengths.
  const size = open === 'extrude' && text.trim().startsWith('-') ? -parseLength(text.trim().slice(1)) : parseLength(text);
  const valid = Number.isFinite(size) && size !== 0;
  // A hole is placed on its face before it is drilled (Manuel 2026-11-09), like a block.
  const { centre, controls: position } = useFacePosition({ bodies, picks, active: open === 'hole', busy, testId: 'hole' });
  const mm3 = (value: number) => Math.round(value * 1000) / 1000;
  const at = open === 'hole' && centre ? (centre.map(mm3) as [number, number, number]) : null;

  useEffect(() => {
    if (!open || !body || !valid || busy) return;
    const id = ++latest.current;
    const typed = text;
    const timer = setTimeout(() => {
      platform()
        .design.previewAction(actionOf(open, body, picks, size, at))
        .then((result) => {
          if (latest.current !== id) return;
          setState(result.ok ? { text: typed, ok: true } : { text: typed, ok: false, error: result.error });
          onGhost(result.ok ? result.preview : null);
        })
        .catch(() => {
          if (latest.current === id) onGhost(null);
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
    // at is derived from centre; its array is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, body, picks, size, valid, busy, text, onGhost, at?.join()]);

  if (kinds.length === 0 || !body) return null;
  const current = state?.text === text ? state : null;

  const choose = (kind: ActionKind | null) => {
    setOpen(kind);
    setState(null);
    onGhost(null);
    setText(kind ? String(DEFAULT_SIZE[kind]).replace('.', decimal) : '');
  };

  const apply = () => {
    if (!open || !valid || busy || !current?.ok) return;
    const action = actionOf(open, body, picks, size, at);
    choose(null);
    void platform()
      .design.applyAction(action)
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  return (
    <div className="flex flex-col gap-1" data-testid="hud-actions">
      <ToggleButtonGroup
        aria-label={t('hud.actions')}
        selectionMode="single"
        selectedKeys={open ? [open] : []}
        onSelectionChange={(keys) => {
          choose(([...keys][0] as ActionKind | undefined) ?? null);
        }}
        isDisabled={busy}
        className="flex flex-wrap gap-1"
      >
        {kinds.map((kind) => (
          <Tip key={kind} label={t(`hud.actionHint.${kind}`)}>
            <ToggleButton id={kind} className={chipToggleClass} data-testid={`action-${kind}`}>
              {ICONS[kind]}
              {t(`hud.action.${kind}`)}
            </ToggleButton>
          </Tip>
        ))}
      </ToggleButtonGroup>
      {open === 'hole' ? position : null}
      {open ? (
        <TextField value={text} onChange={setText} inputMode="decimal" isDisabled={busy} className="flex flex-col gap-1" data-testid="action-field">
          <Label className={fieldLabelClass}>
            {t(`hud.size.${open}`)} · {t('units.mmShort')}
          </Label>
          <Input
            autoFocus
            className={`${inputClass('md')} tabular-nums`}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                choose(null);
              }
            }}
          />
          <p className="text-xs text-text-muted" role="status" data-testid="action-status" data-ok={current ? String(current.ok) : undefined}>
            {!valid ? t('hud.invalid') : !current ? t('hud.probing') : current.ok ? t('hud.actionReady') : t('hud.actionRefused', { detail: current.error ?? '' })}
          </p>
          {/* Enter and Esc do the same; the buttons show that there is a way on and a way back. */}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" isDisabled={busy || !valid || !current?.ok} onPress={apply} className="flex-1" data-testid="action-apply">
              {t('hud.apply')}
            </Button>
            <Button size="sm" onPress={() => choose(null)} data-testid="action-cancel">
              {t('hud.cancel')}
            </Button>
          </div>
        </TextField>
      ) : null}
    </div>
  );
}

/** A pick as the local measure sees it: plane normal of a flat face, axis of a cylinder, direction of a straight edge. */
function measurePick(bodies: BodyModel[], pick: Pick): MeasurePick {
  const model = bodies[pick.body]?.model;
  if (!model) return { point: pick.point };
  if (pick.kind === 'face') {
    const face = model.table.faces[pick.face];
    return { point: pick.point, normal: face?.planeNormal, direction: face?.cylinder?.axis };
  }
  if (pick.kind === 'edge') return { point: pick.point, direction: lineDirection(edgePoints(model.edgeSegments, model.edgeRanges, pick.edge)) };
  return { point: pick.point };
}

/**
 * Distance and angle between two selections: read from the mirrored geometry at once (marked ≈),
 * then SolidCraft's exact measure in its place when it answers.
 */
export function MeasureLine({ bodies, picks }: { bodies: BodyModel[]; picks: Pick[] }) {
  const { t, i18n } = useTranslation();
  const [exact, setResult] = useState<{ picks: Pick[]; result: MeasureResult } | null>(null);
  const [a, b] = picks;
  const local = picks.length === 2 && a && b ? localMeasure(measurePick(bodies, a), measurePick(bodies, b)) : null;
  const result = exact?.picks === picks && exact.result.distance !== null ? exact.result : local;
  useEffect(() => {
    const items: MeasureItem[] = [];
    for (const pick of picks) {
      const body = bodies[pick.body]?.name;
      if (body) items.push({ type: pick.kind, body, point: pick.point });
    }
    if (items.length !== 2) return;
    let live = true;
    platform()
      .design.measure(items)
      .then((measured) => {
        if (live) setResult({ picks, result: measured });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [bodies, picks]);
  if (!result || result.distance === null) return null;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const approximate = result === local;
  return (
    <p className="text-sm tabular-nums text-text" data-testid="hud-measure" data-exact={String(!approximate)} title={approximate ? t('hud.approximate') : undefined}>
      {approximate ? '≈ ' : ''}
      {t('hud.distance', { value: number.format(result.distance) })}
      {result.angle !== null ? ` · ${t('hud.angle', { value: number.format(result.angle) })}` : ''}
    </p>
  );
}
