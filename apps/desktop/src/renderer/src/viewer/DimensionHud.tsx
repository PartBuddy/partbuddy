import { parseTagged3mf } from '@partbuddy/geometry';
import { IconBolt, IconChevronDown, IconChevronUp, IconNote, IconSparkles, IconX } from '@tabler/icons-react';
import { BlockPanel, flatFace } from './BlockPanel';
import { LogoPanel, logoTitleOf, useLogoSpot } from './LogoPanel';
import { actionsFor } from './actionKinds';
import { PartPanel } from './PartPanel';
import { PrintFaceButton } from './PrintFaceButton';
import { ActionPanel, MeasureLine } from './SelectionActions';
import { MAX_NOTE_TEXT, useNoteCommand } from '../notes/NoteParts';
import { sendToAssistant } from '../assistant/send';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, RadioButton, RadioField, RadioGroup, TextField } from 'react-aria-components';
import { BufferAttribute, BufferGeometry, type Color } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { DimensionProbeResult } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { parseLength, stepLength } from './lengthInput';
import { blendWeights, GHOST_OPACITY, PREVIEW_BLEND } from './blend';
import { SelectionInfo } from './SelectionInfo';
import { selectionName, selectionOf, selectionsOf } from './viewState';
import { dimensionFor, handleOf } from './dimensionOf';
import { Button, IconButton, iconButtonClass } from '../ui/Button';
import { Tip } from '../ui/Tooltip';
import { inputClass, fieldLabelClass, UnitInput } from '../ui/Field';
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
      // The preview's mesh shares corners across edges; plain vertex normals would smear every sharp
      // edge (raised text looked melted). Creased normals keep edges sharp and curves smooth.
      const creased = toCreasedNormals(built, Math.PI / 6);
      built.dispose();
      return creased;
    } catch {
      return null;
    }
  }, [preview]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={3} name="dimension preview">
      {/* Pulled toward the camera: faces it shares with the part would flicker in stripes against them. */}
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
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
/** Kept in the renderer's localStorage: the dock folded to its head, so it covers less of the part. */
const DOCK_FOLDED_KEY = 'partbuddy.dockFolded';
function readFolded(): boolean {
  try {
    return window.localStorage.getItem(DOCK_FOLDED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Kept in the renderer's localStorage: the dock's first-pick hint was read. */
const DOCK_HINT_KEY = 'partbuddy.dockHintSeen';

/** Once, on the first pick: what the dock offers and where the explanations are. */
function DockHint() {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(() => window.localStorage.getItem(DOCK_HINT_KEY) === '1');
  if (seen) return null;
  return (
    // One short closable line, so the actions stay in view (audit N-12).
    <div className="flex items-center gap-1 rounded-md bg-accent-subtle py-0.5 pr-0.5 pl-2 text-xs text-text" role="note" data-testid="dock-hint">
      <span className="flex-1">{t('hud.firstHint')}</span>
      <IconButton
        label={t('hud.firstHintOk')}
        onPress={() => {
          window.localStorage.setItem(DOCK_HINT_KEY, '1');
          setSeen(true);
        }}
        data-testid="dock-hint-ok"
      >
        <IconX className="size-icon-sm" aria-hidden />
      </IconButton>
    </div>
  );
}

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
  const [folded, setFolded] = useState(readFolded);
  // The same words kept as a note on the one picked spot, for later or for the assistant to read.
  const runNote = useNoteCommand();
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
  const keep = async () => {
    const text = wish.trim();
    if (!text || picks.length !== 1) return;
    if (await runNote(() => platform().notes.add(current, text))) setWish('');
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
      // Bottom right, clear of the axis triad (bottom left); it stops 10rem under the top so the view
      // tools and the view cube stay free (audit N-06). In a narrow view it is a sheet along the bottom
      // that leaves the upper half to the part (B-05). Scrolls inside.
      // z-40: above the labels, pins and drag arrows drawn into the view (drei Html, z 11–32), which would cover its fields.
      className="pointer-events-auto absolute right-3 bottom-3 z-40 flex max-h-[calc(100%_-_10rem)] w-dialog-sm max-w-[calc(100%_-_1.5rem)] animate-panel-in flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface-raised p-3 shadow-2 @max-[40rem]:left-3 @max-[40rem]:max-h-[45%] @max-[40rem]:w-auto"
      data-testid="selection-hud"
      data-view-overlay
    >
      <div className="flex items-start justify-between gap-3">
        {logo ? (
          <div className="flex min-w-0 flex-col" data-testid="logo-picked">
            <span className="truncate text-sm font-medium text-text">{t(logo.text ? 'logoMove.titleText' : 'logoMove.title', { name: logoTitleOf(logo) })}</span>
            <span className="text-xs text-text-subtle">{t('logoMove.exactHint')}</span>
          </div>
        ) : (
          <SelectionInfo bodies={bodies} selection={selection} />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {picks.length > 1 ? (
            <span className={badgeClass('accent')} data-testid="hud-count">
              {t('hud.selected', { count: picks.length })}
            </span>
          ) : null}
          {/* Folded to its head the dock leaves the part free; it stays so until unfolded. */}
          <Tip label={t(folded ? 'hud.unfold' : 'hud.fold')}>
            <AriaButton
              aria-label={t(folded ? 'hud.unfold' : 'hud.fold')}
              aria-expanded={!folded}
              onPress={() => {
                const next = !folded;
                setFolded(next);
                try {
                  window.localStorage.setItem(DOCK_FOLDED_KEY, next ? '1' : '0');
                } catch {
                  // Not kept: the dock still folds for now.
                }
              }}
              className={iconButtonClass('sm')}
              data-testid="hud-fold"
            >
              {folded ? <IconChevronUp className="size-icon-sm" aria-hidden /> : <IconChevronDown className="size-icon-sm" aria-hidden />}
            </AriaButton>
          </Tip>
        </div>
      </div>
      {folded ? null : (
      <>
      <DockHint />
      {picks.length === 2 ? <MeasureLine bodies={bodies} picks={picks} /> : null}
      <div className="flex flex-wrap items-start gap-3">
        {dimension && !logo ? (
          <TextField value={text} onChange={setText} inputMode="decimal" isDisabled={busy} className="flex w-field-dock flex-col gap-1" data-testid="dimension-field">
            <Label className={fieldLabelClass}>{t(`hud.field.${dimension.shown}`)}</Label>
            <UnitInput
              ref={field}
              unit={t('units.mmShort')}
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
      {/* One field for what should happen here: done now by the assistant, or kept as a note on the spot. */}
      <div className="flex flex-col gap-1" data-testid="hud-wish">
        <TextField value={wish} onChange={setWish} maxLength={MAX_NOTE_TEXT} isDisabled={busy} className="flex flex-col gap-1">
          <Label className={fieldLabelClass}>{t('hud.wish')}</Label>
          <Input
            placeholder={t('hud.wishExample')}
            className={inputClass('sm')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                ask();
              }
            }}
            data-testid="hud-ask"
          />
        </TextField>
        <div className="flex flex-wrap gap-1">
          <Button variant="primary" size="sm" isDisabled={busy || !assistantReady || wish.trim() === ''} onPress={ask} data-testid="hud-do">
            <IconSparkles className="size-icon-sm" aria-hidden />
            {t('hud.doNow')}
          </Button>
          {picks.length === 1 ? (
            <Button size="sm" isDisabled={busy || wish.trim() === ''} onPress={() => void keep()} data-testid="hud-note">
              <IconNote className="size-icon-sm" aria-hidden />
              {t('hud.keepNote')}
            </Button>
          ) : null}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
