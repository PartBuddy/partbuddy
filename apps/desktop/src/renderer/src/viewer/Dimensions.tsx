import { Html } from '@react-three/drei';
import { IconBolt, IconSparkles, IconVariable } from '@tabler/icons-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Input, Label, TextField } from 'react-aria-components';
import { Raycaster, Vector2, Vector3, type Color, type Group, type Mesh, type Plane } from 'three';
import { useFrame, useThree } from '@react-three/fiber';

import type { DimensionMark } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { sendToAssistant } from '../assistant/send';
import { platform } from '../platform';
import { useStudio, type ModelState, type Pick } from '../state/store';
import { DimensionLines } from './DimensionLines';
import { Ghost } from './DimensionHud';
import { layoutLabels, type LabelBox } from './labelLayout';
import { parseLength } from './lengthInput';
import { keeps } from './section';
import { edgeLabel } from './viewState';

type MeshList = RefObject<(Mesh | null)[]>;
const PROBE_DELAY_MS = 250;
/** Longest formula a label shows in full; the field shows all of it. */
const FORMULA_CHARS = 18;
const PLAIN_NUMBER = /^\s*-?\d+(\.\d+)?\s*(mm|deg)?\s*$/;


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
          className="h-control-md w-full rounded-md border border-border-strong bg-surface px-2 text-md tabular-nums text-text outline-none focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
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
      className={`pointer-events-auto flex -translate-x-1/2 -translate-y-1/2 items-baseline gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-semibold tabular-nums text-text shadow-1 outline-none focus-visible:outline-2 focus-visible:outline-focus ${
        open ? 'border-dimension bg-surface-selected' : 'border-dimension/35 bg-surface-raised/95 hover:border-dimension'
      }`}
      data-testid="mark-label"
      data-mark={mark.id}
      data-parameter={mark.parameter}
    >
      {text.formula ? (
        <span className="font-normal text-text-subtle">{text.formula.length > FORMULA_CHARS ? `${text.formula.slice(0, FORMULA_CHARS - 1)}…` : text.formula}</span>
      ) : null}
      <span>{text.value}</span>
    </AriaButton>
  );
}

/** What the layout reaches of one mark: its label's wrapper and its lines. */
interface Slot {
  wrapper: HTMLDivElement | null;
  lines: Group | null;
}

type Shown = 'shown' | 'behind' | 'crowded';

/** What the layout keeps between frames; all of it lives in one ref. */
interface Layout {
  slots: Map<string, Slot>;
  /** Set when a label mounted or the marks changed: lay out on the next frame even if the view did not move. */
  dirty: boolean;
  last: Float64Array;
  raycaster: Raycaster;
  ndc: Vector3;
  pointer: Vector2;
  anchor: Vector3;
}

const newLayout = (): Layout => ({
  slots: new Map(),
  dirty: true,
  last: new Float64Array(33),
  raycaster: new Raycaster(),
  ndc: new Vector3(),
  pointer: new Vector2(),
  anchor: new Vector3(),
});

/**
 * Keeps the labels readable (UI upgrade step 10): a label whose anchor the part hides is left out
 * with its lines, labels that would cover each other move apart or, without room, are left out;
 * the open one always shows. Runs when the view, the marks or the open label change. Returns
 * the slot of a mark, for its label and lines to register in when they mount.
 */
function useLabelLayout(marks: readonly DimensionMark[], meshes: MeshList, plane: Plane | null, openMark: string | null): (id: string) => Slot {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const layout = useRef<Layout>(newLayout());

  useEffect(() => {
    // Marks that left take their slots with them; new ones are laid out on the next frame.
    const { slots } = layout.current;
    for (const id of slots.keys()) if (!marks.some((mark) => mark.id === id)) slots.delete(id);
    layout.current.dirty = true;
  }, [marks, openMark]);

  useFrame(() => {
    const state = layout.current;
    // Skip frames in which nothing that moves a label changed.
    const view = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, size.width];
    if (!state.dirty && view.every((value, i) => state.last[i] === value)) return;
    state.last.set(view);
    state.dirty = false;

    const { raycaster, ndc, pointer, anchor, slots } = state;
    // With a section the first hit may lie in the part that is cut away; then every hit is needed.
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = plane === null;
    const bodies = meshes.current.filter((mesh): mesh is Mesh => mesh !== null);
    const hidden = new Map<string, Shown>();
    const boxes: (LabelBox & { distance: number; open: boolean })[] = [];
    for (const mark of marks) {
      const label = slots.get(mark.id)?.wrapper?.firstElementChild as HTMLElement | null | undefined;
      if (!mark.geometry || !label) continue;
      if (label.offsetWidth === 0) state.dirty = true;
      anchor.set(...mark.geometry.anchor);
      ndc.copy(anchor).project(camera);
      raycaster.setFromCamera(pointer.set(ndc.x, ndc.y), camera);
      const distance = raycaster.ray.origin.distanceTo(anchor);
      const open = mark.id === openMark;
      const hit = open || ndc.z > 1 ? null : raycaster.intersectObjects(bodies, false).find((entry) => keeps(plane, entry.point));
      if (hit && hit.distance < distance - Math.max(0.3, distance * 0.004)) {
        hidden.set(mark.id, 'behind');
        continue;
      }
      boxes.push({
        id: mark.id,
        x: ((ndc.x + 1) / 2) * size.width,
        y: ((1 - ndc.y) / 2) * size.height,
        width: label.offsetWidth,
        height: label.offsetHeight,
        distance,
        open,
      });
    }
    // The open label first, then the nearest: what the user looks at keeps its place.
    boxes.sort((a, b) => Number(b.open) - Number(a.open) || a.distance - b.distance);
    const placed = layoutLabels(boxes, size);
    for (const mark of marks) {
      const slot = slots.get(mark.id);
      if (!slot?.wrapper) continue;
      const place = placed.get(mark.id);
      const shown: Shown = hidden.get(mark.id) ?? (place ? 'shown' : 'crowded');
      slot.wrapper.style.transform = place ? `translate(${String(place.dx)}px, ${String(place.dy)}px)` : '';
      slot.wrapper.style.visibility = shown === 'shown' ? '' : 'hidden';
      slot.wrapper.dataset.shown = shown;
      if (slot.lines) slot.lines.visible = shown === 'shown';
    }
  });

  return (id) => {
    const { slots } = layout.current;
    const found = slots.get(id) ?? { wrapper: null, lines: null };
    slots.set(id, found);
    layout.current.dirty = true;
    return found;
  };
}

/** Dimension lines and labels in the 3D view; a label opens its field (M2b-3, ADR 0020). */
export function DimensionMarks({ color, ghostColor, meshes, plane }: { color: Color; ghostColor: Color; meshes: MeshList; plane: Plane | null }) {
  const marks = useStudio((s) => s.marks);
  const openMark = useStudio((s) => s.openMark);
  const setOpenMark = useStudio((s) => s.setOpenMark);
  const [ghost, setGhost] = useState<Uint8Array | null>(null);
  const slot = useLabelLayout(marks, meshes, plane, openMark);
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
        return (
          <group key={mark.id}>
            <group
              ref={(group) => {
                slot(mark.id).lines = group;
              }}
              // Hidden until the layout has placed the label, so nothing flashes on top of another.
              visible={false}
            >
              <DimensionLines geometry={g} kind={mark.kind} color={color} />
            </group>
            <Html position={g.anchor} zIndexRange={open ? [32, 26] : [16, 11]} style={{ pointerEvents: 'none' }}>
              <div
                className="relative"
                style={{ visibility: 'hidden' }}
                data-testid="mark-slot"
                ref={(wrapper) => {
                  slot(mark.id).wrapper = wrapper;
                }}
              >
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

/**
 * Inputs PartBuddy cannot place on the model (pattern counts, a countersink's tip angle …): a
 * section of the structure panel under the parameters, so no list covers the part (step 10).
 */
export function LooseDimensions() {
  const { t } = useTranslation();
  const all = useStudio((s) => s.marks);
  const marks = all.filter((mark) => mark.geometry === null);
  const openMark = useStudio((s) => s.openMark);
  const setOpenMark = useStudio((s) => s.setOpenMark);
  const text = useMarkText();
  if (marks.length === 0) return null;
  return (
    <section aria-labelledby="structure-loose" className="flex flex-col gap-1" data-testid="loose-dimensions">
      <h2 id="structure-loose" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {t('dimensions.loose')}
      </h2>
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
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
              data-testid="loose-mark"
            >
              <span className="truncate">{shown.name}</span>
              <span className="shrink-0 tabular-nums">{shown.formula ? `${shown.formula} = ${shown.value}` : shown.value}</span>
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
