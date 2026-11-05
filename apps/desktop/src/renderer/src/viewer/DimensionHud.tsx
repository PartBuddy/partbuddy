import { parseTagged3mf, type ViewerModel } from '@partbuddy/geometry';
import { IconArrowUp, IconBolt, IconSparkles } from '@tabler/icons-react';
import { FacePrintActions } from '../print/FacePrintActions';
import { FitPanel } from '../print/FitPanel';
import { ActionPanel, MeasureLine } from './SelectionActions';
import { NoteComposer } from '../notes/NoteComposer';
import { sendToAssistant } from '../assistant/send';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, TextField } from 'react-aria-components';
import { BufferAttribute, BufferGeometry, type Color } from 'three';

import type { DimensionProbeResult, DimensionTarget } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { parseLength } from './lengthInput';
import { blendWeights, GHOST_OPACITY } from './blend';
import { SelectionInfo } from './SelectionInfo';
import { edgeLabel, selectionName, selectionOf, selectionsOf } from './viewState';

/** Quiet time after typing before PartBuddy tries the value in SolidCraft. */
const PROBE_DELAY_MS = 250;

type Shown = 'length' | 'diameter' | 'radius';

export interface Dimension {
  shown: Shown;
  /** The value as shown (a diameter is twice the radius SolidCraft is asked about). */
  value: number;
  target: DimensionTarget;
  /** From the shown value to the value of the target's measure. */
  scale: number;
}

/** True when the face's own edges include a closed loop: a full hole or boss, shown as a diameter. */
function hasClosedLoop(model: ViewerModel, face: number): boolean {
  for (let e = 0; e < model.edgeLengths.length; e += 1) {
    if (model.edgeFaces[e * 2] !== face && model.edgeFaces[e * 2 + 1] !== face) continue;
    const first = model.edgeRanges[e * 2] ?? 0;
    const count = model.edgeRanges[e * 2 + 1] ?? 0;
    const start = model.edgeSegments.subarray(first * 6, first * 6 + 3);
    const end = model.edgeSegments.subarray((first + count) * 6 - 3, (first + count) * 6);
    if (count > 2 && start.every((value, i) => Math.abs(value - (end[i] ?? 0)) < 1e-6)) return true;
  }
  return false;
}

function radiusDimension(model: ViewerModel, body: string, face: number): Dimension | null {
  const info = model.table.faces[face];
  if (!info?.cylinder) return null;
  const full = hasClosedLoop(model, face);
  return {
    shown: full ? 'diameter' : 'radius',
    value: full ? info.cylinder.radius * 2 : info.cylinder.radius,
    target: { measure: 'radius', body, face: info.name },
    scale: full ? 0.5 : 1,
  };
}

/** What the dimension field edits for a selection: an edge length, or the radius of a cylinder. */
export function dimensionOf(bodies: BodyModel[], pick: Pick): Dimension | null {
  const body = bodies[pick.body];
  if (!body) return null;
  const model = body.model;
  if (pick.kind === 'face') return radiusDimension(model, body.name, pick.face);
  if (pick.kind !== 'edge') return null;
  for (const face of [model.edgeFaces[pick.edge * 2], model.edgeFaces[pick.edge * 2 + 1]]) {
    if (face !== undefined && model.table.faces[face]?.cylinder) return radiusDimension(model, body.name, face);
  }
  const length = model.edgeLengths[pick.edge] ?? 0;
  if (!(length > 0)) return null;
  return { shown: 'length', value: length, target: { measure: 'length', body: body.name, edge: edgeLabel(model, pick.edge).name, point: pick.point }, scale: 1 };
}

export function Ghost({ preview, color }: { preview: Uint8Array; color: Color }) {
  const blend = useStudio((s) => s.previewBlend);
  const opacity = blendWeights(blend).after * GHOST_OPACITY;
  const geometry = useMemo(() => {
    try {
      const mesh = parseTagged3mf(preview);
      const built = new BufferGeometry();
      built.setAttribute('position', new BufferAttribute(Float32Array.from(mesh.positions), 3));
      built.setIndex(new BufferAttribute(mesh.indices, 1));
      built.computeVertexNormals();
      return built;
    } catch {
      return null;
    }
  }, [preview]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={3} name="dimension preview">
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

const round = (value: number) => Math.round(value * 1000) / 1000;


/** The ghost of what the selection dock tries, drawn in the 3D view (UI upgrade step 11). */
export function SelectionGhost({ color }: { color: Color }) {
  const ghost = useStudio((s) => s.selectionGhost);
  return ghost ? <Ghost preview={ghost} color={color} /> : null;
}

/**
 * The selection dock (M1b, docked in UI upgrade step 11): at the bottom of the view instead of on
 * the part, what is selected with its measures, the dimension field (one edge or cylinder),
 * actions with a preview (fillet, chamfer, extrude, hole, shell), a note, the distance and angle
 * between two selections, and a text field that sends any wish about the selection to the
 * assistant. The part stays visible; the ghost of a tried value shows on it.
 */
export function SelectionDock({ bodies }: { bodies: BodyModel[] }) {
  const selection = useStudio((s) => s.selection);
  const selections = useStudio((s) => s.selections);
  if (!selection) return null;
  // A new selection gets a fresh dock that starts from its current size.
  const key = selections.map((pick) => `${pick.kind}:${pick.body}:${pick.kind === 'face' ? pick.face : pick.kind === 'edge' ? pick.edge : pick.vertex}`).join(',');
  return <HudCard key={key} bodies={bodies} selection={selection} picks={selections} />;
}

function HudCard({ bodies, selection, picks }: { bodies: BodyModel[]; selection: Pick; picks: Pick[] }) {
  const { t, i18n } = useTranslation();
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  const assistant = selectedStatus(useAssistant((s) => s.state));
  const busy = assistant.state === 'busy';
  const assistantReady = assistant.state === 'ready';
  // The dimension field belongs to a single selection.
  const dimension = useMemo(() => (picks.length === 1 ? dimensionOf(bodies, selection) : null), [bodies, selection, picks.length]);
  const decimal = (1.5).toLocaleString(i18n.language).charAt(1);
  const show = (number: number) => String(round(number)).replace('.', decimal);
  // The field's text; every keystroke tries the new value, not only leaving the field.
  const [text, setText] = useState(() => (dimension ? show(dimension.value) : ''));
  const value = parseLength(text);
  // The newest probe answer and the value it was for; an answer for another value is outdated.
  const [probe, setProbe] = useState<{ value: number; result: DimensionProbeResult } | null>(null);
  // The ghost of an open action, which takes the place of the dimension preview.
  const [actionGhost, setActionGhost] = useState<Uint8Array | null>(null);
  const [wish, setWish] = useState('');
  const latest = useRef(0);

  const changed = dimension !== null && Number.isFinite(value) && value > 0 && Math.abs(value - dimension.value) > 1e-6;

  useEffect(() => {
    if (!dimension || !changed || busy) return;
    const id = ++latest.current;
    const timer = setTimeout(() => {
      platform()
        .design.probeDimension({ target: dimension.target, current: dimension.value * dimension.scale, value: value * dimension.scale })
        .then((result) => {
          if (latest.current === id) setProbe({ value, result });
        })
        .catch(() => {
          if (latest.current === id) setProbe({ value, result: { mode: 'assistant', reason: 'noDriver' } });
        });
    }, PROBE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [dimension, value, changed, busy]);

  const result = probe !== null && probe.value === value ? probe.result : null;
  const ghost = actionGhost ?? (result?.mode === 'direct' ? result.preview : null);
  const setSelectionGhost = useStudio((s) => s.setSelectionGhost);
  useEffect(() => {
    setSelectionGhost(ghost);
  }, [ghost, setSelectionGhost]);
  useEffect(
    () => () => {
      setSelectionGhost(null);
    },
    [setSelectionGhost],
  );

  const current = selectionOf(model, selection);
  const all = selectionsOf(model, picks);
  if (!current) return null;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 });

  const apply = () => {
    if (!dimension || !changed || busy) return;
    if (result?.mode === 'direct') {
      void platform()
        .design.applyDimension({ parameter: result.parameter, value: value * dimension.scale, factor: result.factor, label: result.label })
        .catch((error: unknown) => {
          setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
        });
      return;
    }
    if (result?.mode === 'assistant' && assistantReady) {
      const request = t('hud.assistantRequest', {
        what: t(`hud.${dimension.shown}`),
        name: selectionName(current),
        from: number.format(round(dimension.value)),
        to: number.format(value),
      });
      void platform().agent.send(request, [current]);
    }
  };

  const ask = () => {
    const message = wish.trim();
    if (!message || !assistantReady) return;
    setWish('');
    void sendToAssistant(message, all);
  };

  let status: string | null = null;
  if (changed) {
    if (!result) status = t('hud.probing');
    else if (result.mode === 'direct') status = t('hud.direct', { label: result.label });
    else status = assistantReady ? t(`hud.assistant.${result.reason}`) : t('hud.noAssistant');
  }
  return (
    <div
      role="region"
      aria-label={t('hud.dock')}
      // Docked at the bottom of the view, clear of the axis triad and the view cube on either side.
      className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex w-dock -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 shadow-2"
      style={{ maxWidth: 'calc(100% - 12rem)' }}
      data-testid="selection-hud"
      data-view-overlay
    >
      <div className="flex items-start justify-between gap-3">
        <SelectionInfo bodies={bodies} selection={selection} />
        {picks.length > 1 ? (
          <span className="shrink-0 rounded-full bg-accent-subtle px-2 text-xs text-accent" data-testid="hud-count">
            {t('hud.selected', { count: picks.length })}
          </span>
        ) : null}
      </div>
      {picks.length === 2 ? <MeasureLine bodies={bodies} picks={picks} /> : null}
      <div className="flex flex-wrap items-start gap-3">
        {dimension ? (
          <TextField value={text} onChange={setText} inputMode="decimal" isDisabled={busy} className="flex w-field-dock flex-col gap-1" data-testid="dimension-field">
            <Label className="text-xs text-text-subtle">
              {t(`hud.${dimension.shown}`)} · {t('units.mmShort')}
            </Label>
            <Input
              className="h-control-sm w-full rounded-md border border-border-strong bg-surface px-2 text-sm tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  apply();
                } else if (event.key === 'Escape' && changed) {
                  event.preventDefault();
                  event.stopPropagation();
                  setText(show(dimension.value));
                }
              }}
            />
          </TextField>
        ) : null}
        <div className={`flex min-w-0 flex-1 flex-wrap items-start gap-1 ${dimension ? 'pt-5' : ''}`}>
          <ActionPanel bodies={bodies} picks={picks} busy={busy} onGhost={setActionGhost} />
          {picks.length === 1 ? <NoteComposer selection={current} busy={busy} /> : null}
          <FacePrintActions bodies={bodies} picks={picks} />
        </div>
      </div>
      <FitPanel bodies={bodies} picks={picks} busy={busy} />
      {status ? (
        <p className="flex items-center gap-1 text-xs text-text-muted" role="status" data-testid="dimension-status" data-mode={result?.mode ?? 'probing'}>
          {result?.mode === 'direct' ? <IconBolt className="size-icon-sm text-accent" aria-hidden /> : null}
          {result?.mode === 'assistant' ? <IconSparkles className="size-icon-sm text-accent" aria-hidden /> : null}
          {status}
        </p>
      ) : null}
      <TextField value={wish} onChange={setWish} aria-label={t('hud.ask')} isDisabled={!assistantReady} className="flex items-center gap-1">
        <Input
          placeholder={t('hud.ask')}
          className="h-control-sm min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-text outline-none placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              ask();
            }
          }}
          data-testid="hud-ask"
        />
        <AriaButton
          aria-label={t('assistant.send')}
          isDisabled={!assistantReady || wish.trim() === ''}
          onPress={ask}
          className="inline-flex size-control-sm items-center justify-center rounded-md bg-accent text-on-accent outline-none hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
        >
          <IconArrowUp className="size-icon-sm" aria-hidden />
        </AriaButton>
      </TextField>
    </div>
  );
}
