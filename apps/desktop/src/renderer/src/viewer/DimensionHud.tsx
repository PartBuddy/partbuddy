import { parseTagged3mf } from '@partbuddy/geometry';
import { IconArrowUp, IconBolt, IconSparkles } from '@tabler/icons-react';
import { BlockPanel, flatFace } from './BlockPanel';
import { LogoPanel, logoTitleOf, useLogoSpot } from './LogoPanel';
import { actionsFor } from './actionKinds';
import { PartPanel } from './PartPanel';
import { PrintFaceButton } from './PrintFaceButton';
import { ActionPanel, MeasureLine } from './SelectionActions';
import { NoteComposer } from '../notes/NoteComposer';
import { sendToAssistant } from '../assistant/send';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, RadioButton, RadioField, RadioGroup, TextField } from 'react-aria-components';
import { BufferAttribute, BufferGeometry, type Color } from 'three';

import type { DimensionProbeResult } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { parseLength, stepLength } from './lengthInput';
import { blendWeights, GHOST_OPACITY, PREVIEW_BLEND } from './blend';
import { SelectionInfo } from './SelectionInfo';
import { selectionName, selectionOf, selectionsOf } from './viewState';
import { dimensionFor, handleOf } from './dimensionOf';
import { buttonVariants, pressable } from '../ui/Button';
import { Tip } from '../ui/Tooltip';
import { inputClass, fieldLabelClass } from '../ui/Field';
import { badgeClass } from '../ui/Feedback';
import { RadioMark, choiceRowClass } from '../ui/Choice';

/** Quiet time after typing before PartBuddy tries the value in SolidCraft. */
const PROBE_DELAY_MS = 250;

export function Ghost({ preview, color }: { preview: Uint8Array; color: Color }) {
  const opacity = blendWeights(PREVIEW_BLEND).after * GHOST_OPACITY;
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

/** One group of the dock's actions under a small heading. */
function DockGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1" data-testid="dock-group">
      <h4 className="text-xs font-medium text-text-subtle">{title}</h4>
      {children}
    </section>
  );
}

function HudCard({ bodies, selection, picks }: { bodies: BodyModel[]; selection: Pick; picks: Pick[] }) {
  const { t, i18n } = useTranslation();
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  const assistant = selectedStatus(useAssistant((s) => s.state));
  const busy = assistant.state === 'busy';
  const assistantReady = assistant.state === 'ready';
  // A plain click on a placed logo picks the whole logo: its controls instead of the face's or edge's.
  const logo = useLogoSpot(picks);
  const dimension = useMemo(() => dimensionFor(bodies, picks), [bodies, picks]);
  const decimal = (1.5).toLocaleString(i18n.language).charAt(1);
  const show = useCallback((number: number) => String(round(number)).replace('.', decimal), [decimal]);
  // The field's text; every keystroke tries the new value, not only leaving the field.
  const [text, setText] = useState(() => (dimension ? show(dimension.value) : ''));
  const value = parseLength(text);
  // The newest probe answer and the value it was for; an answer for another value is outdated.
  const [probe, setProbe] = useState<{ value: number; result: DimensionProbeResult } | null>(null);
  // The ghost of an open action, which takes the place of the dimension preview.
  const [actionGhost, setActionGhost] = useState<Uint8Array | null>(null);
  const [wish, setWish] = useState('');
  const latest = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  // The value the drag arrow was let go at, before SolidCraft had tried it.
  const letGo = useRef<number | null>(null);
  const applyDirect = useCallback(
    (driver: { parameter: string; factor: 1 | 2; label: string }, shown: number) => {
      if (!dimension) return;
      void platform()
        .design.applyDimension({ parameter: driver.parameter, value: shown * dimension.scale, factor: driver.factor, label: driver.label })
        .catch((error: unknown) => {
          setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
        });
    },
    [dimension, setNotice, t],
  );

  // Against the value as the field shows it: an arc of 7.8539… mm reads 7.854 and is unchanged.
  const changed = dimension !== null && Number.isFinite(value) && value > 0 && Math.abs(value - round(dimension.value)) > 1e-6;

  useEffect(() => {
    if (!dimension || !changed || busy) return;
    const id = ++latest.current;
    const timer = setTimeout(() => {
      platform()
        .design.probeDimension({ target: dimension.target, current: dimension.value * dimension.scale, value: value * dimension.scale })
        .then((result) => {
          if (latest.current !== id) return;
          setProbe({ value, result });
          // A change only the assistant can make waits for Enter, like a typed one.
          if (letGo.current === value && result.mode === 'direct') applyDirect(result, value);
          if (letGo.current === value) letGo.current = null;
        })
        .catch(() => {
          if (latest.current === id) setProbe({ value, result: { mode: 'assistant', reason: 'noDriver' } });
        });
    }, PROBE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [dimension, value, changed, busy, applyDirect]);

  const result = probe !== null && probe.value === value ? probe.result : null;
  // Several parameters drive it: the one the user picked, for this value only.
  const [chosen, setChosen] = useState<{ value: number; parameter: string } | null>(null);
  const option = result?.mode === 'choice' && chosen?.value === value ? (result.options.find((entry) => entry.parameter === chosen.parameter) ?? null) : null;
  const [choiceGhost, setChoiceGhost] = useState<{ value: number; parameter: string; preview: Uint8Array | null } | null>(null);
  useEffect(() => {
    if (!dimension || !option || busy) return;
    let live = true;
    platform()
      .design.probeParameter(option.parameter, value * dimension.scale * option.factor, dimension.target.body)
      .then((answer) => {
        if (live) setChoiceGhost({ value, parameter: option.parameter, preview: answer.ok ? answer.preview : null });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [dimension, option, value, busy]);
  const optionGhost = option && choiceGhost?.value === value && choiceGhost.parameter === option.parameter ? choiceGhost.preview : null;
  const ghost = actionGhost ?? (result?.mode === 'direct' ? result.preview : optionGhost);
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

  // The drag arrow on the part (step 4): placed while the field can change something, its value fills the field.
  const setDimensionHandle = useStudio((s) => s.setDimensionHandle);
  const handle = useMemo(() => (dimension ? handleOf(bodies, picks, dimension) : null), [bodies, picks, dimension]);
  useEffect(() => {
    if (!handle || !dimension || busy) {
      setDimensionHandle(null);
      return;
    }
    setDimensionHandle({
      ...handle,
      value: dimension.value,
      onDrag: (dragged, done) => {
        setText(show(dragged));
        // Let go: apply at once when SolidCraft has tried this value already, else when its answer comes.
        const tried = probe?.value === dragged ? probe.result : null;
        letGo.current = null;
        if (!done) return;
        if (tried?.mode === 'direct') applyDirect(tried, dragged);
        else if (!tried) letGo.current = dragged;
      },
    });
    return () => {
      setDimensionHandle(null);
    };
  }, [handle, dimension, busy, probe, setDimensionHandle, show, applyDirect]);

  const current = selectionOf(model, selection);
  const all = selectionsOf(model, picks);
  if (!current) return null;
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 });

  const apply = () => {
    if (!dimension || !changed || busy) return;
    const driver = result?.mode === 'direct' ? result : option;
    if (driver) {
      applyDirect(driver, value);
      return;
    }
    if (result?.mode === 'assistant' && assistantReady) {
      const request = t('hud.assistantRequest', {
        what: t(`hud.${dimension.shown}`),
        name: all.map(selectionName).join(' – '),
        from: number.format(round(dimension.value)),
        to: number.format(value),
      });
      void platform().agent.send(request, all);
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
    else if (result.mode === 'choice') status = option ? t('hud.direct', { label: option.label }) : t('hud.choose');
    else status = assistantReady ? t(`hud.assistant.${result.reason}`) : t('hud.noAssistant');
  }
  return (
    <div
      role="region"
      aria-label={t('hud.dock')}
      // Bottom right, clear of the axis triad (bottom left) and the view cube (top right); narrow and
      // scrolling, so an open building block does not cover the part (polish round 2).
      // z-40: above the labels, pins and drag arrows drawn into the view (drei Html, z 11–32), which would cover its fields.
      className="pointer-events-auto absolute bottom-3 right-3 z-40 flex max-h-[calc(100%_-_1.5rem)] w-dialog-sm max-w-[calc(100%_-_1.5rem)] flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface-raised p-3 shadow-2"
      data-testid="selection-hud"
      data-view-overlay
    >
      <div className="flex items-start justify-between gap-3">
        {logo ? (
          <div className="flex min-w-0 flex-col" data-testid="logo-picked">
            <span className="truncate text-sm font-medium text-text">{t('logoMove.title', { name: logoTitleOf(logo) })}</span>
            <span className="text-xs text-text-subtle">{t('logoMove.exactHint')}</span>
          </div>
        ) : (
          <SelectionInfo bodies={bodies} selection={selection} />
        )}
        {picks.length > 1 ? (
          <span className={badgeClass('accent')} data-testid="hud-count">
            {t('hud.selected', { count: picks.length })}
          </span>
        ) : null}
      </div>
      {picks.length === 2 ? <MeasureLine bodies={bodies} picks={picks} /> : null}
      <div className="flex flex-wrap items-start gap-3">
        {dimension && !logo ? (
          <TextField value={text} onChange={setText} inputMode="decimal" isDisabled={busy} className="flex w-field-dock flex-col gap-1" data-testid="dimension-field">
            <Label className={fieldLabelClass}>
              {t(`hud.${dimension.shown}`)} · {t('units.mmShort')}
            </Label>
            <Input
              ref={field}
              className={`${inputClass('sm')} tabular-nums`}
              aria-keyshortcuts="ArrowUp ArrowDown"
              onKeyDown={(event) => {
                const stepped = stepLength(text, event.key, event, decimal);
                if (stepped !== null) {
                  event.preventDefault();
                  setText(stepped);
                } else if (event.key === 'Enter') {
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
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* What the pick allows, in three groups (decided 2026-11-09): change it, add to it, print on it. */}
          {logo === null && actionsFor(bodies, picks).length > 0 ? (
            <DockGroup title={t('hud.group.change')}>
              <ActionPanel bodies={bodies} picks={picks} busy={busy} onGhost={setActionGhost} />
            </DockGroup>
          ) : null}
          {logo === null && flatFace(bodies, picks) ? (
            <>
              <DockGroup title={t('hud.group.add')}>
                <BlockPanel bodies={bodies} picks={picks} busy={busy} onGhost={setActionGhost} />
                <PartPanel bodies={bodies} picks={picks} busy={busy} />
              </DockGroup>
              <DockGroup title={t('hud.group.print')}>
                <PrintFaceButton bodies={bodies} picks={picks} busy={busy} />
              </DockGroup>
            </>
          ) : null}
          {picks.length === 1 ? <NoteComposer selection={current} busy={busy} /> : null}
        </div>
      </div>
      {logo ? <LogoPanel key={`${logo.logo}|${logo.origin.join()}|${String(logo.angle)}|${logo.box.join()}|${String(logo.depth?.value)}`} spot={logo} busy={busy} onGhost={setActionGhost} /> : null}
      {status && !logo ? (
        <p className="flex items-center gap-1 text-xs text-text-muted" role="status" data-testid="dimension-status" data-mode={result?.mode ?? 'probing'}>
          {result?.mode === 'direct' ? <IconBolt className="size-icon-sm text-accent" aria-hidden /> : null}
          {result?.mode === 'assistant' ? <IconSparkles className="size-icon-sm text-accent" aria-hidden /> : null}
          {status}
        </p>
      ) : null}
      {result?.mode === 'choice' && !logo ? (
        <RadioGroup
          aria-label={t('hud.choose')}
          value={option?.parameter ?? null}
          onChange={(parameter) => {
            setChosen({ value, parameter });
            // Back to the field, where Enter applies the pick.
            field.current?.focus();
          }}
          isDisabled={busy}
          className="flex flex-col gap-hairline"
          data-testid="dimension-choice"
        >
          {result.options.map((entry) => (
            <RadioField key={entry.parameter} value={entry.parameter}>
              <RadioButton className={choiceRowClass}>
                <RadioMark />
                <span className="text-sm text-text">{entry.label}</span>
              </RadioButton>
            </RadioField>
          ))}
        </RadioGroup>
      ) : null}
      <TextField value={wish} onChange={setWish} aria-label={t('hud.ask')} isDisabled={!assistantReady} className="flex items-center gap-1">
        <Input
          placeholder={t('hud.ask')}
          className={`${inputClass('sm')} flex-1`}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              ask();
            }
          }}
          data-testid="hud-ask"
        />
        <Tip label={t('assistant.send')}>
          <AriaButton
            aria-label={t('assistant.send')}
            isDisabled={!assistantReady || wish.trim() === ''}
            onPress={ask}
            className={`inline-flex size-control-sm shrink-0 items-center justify-center rounded-md ${buttonVariants.primary} ${pressable}`}
          >
            <IconArrowUp className="size-icon-sm" aria-hidden />
          </AriaButton>
        </Tip>
      </TextField>
    </div>
  );
}
