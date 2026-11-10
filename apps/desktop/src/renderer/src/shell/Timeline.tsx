import { IconAlertCircle, IconAlertTriangle, IconBox, IconCylinder, IconPlayerTrackNext, IconPoint } from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Tooltip, TooltipTrigger } from 'react-aria-components';

import type { TimelineCommand, TimelineFeature } from '../../../shared/contract';
import { selectedStatus, useAssistant } from '../assistant/store';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { CadIcon, type CadIconName } from '../ui/CadIcon';
import { buttonClass, pressable } from '../ui/Button';
import { tooltipClass } from '../ui/Tooltip';
import { POPOVER_OFFSET, menuClass, menuHeaderClass, menuItemClass, popoverClass } from '../ui/Overlay';

/** "ExtrudeFeature" → "Extrude": the kind of step, as the timeline names it. */
export function featureKind(type: string): string {
  return type.replace(/Feature$/, '');
}

/** CAD operations by feature kind (ADR 0023); primitives keep Tabler's box and cylinder. */
const CAD_ICONS: Record<string, CadIconName> = {
  Sketch: 'sketch',
  Extrude: 'extrude',
  Revolve: 'revolve',
  Sweep: 'sweep',
  Loft: 'loft',
  Fillet: 'fillet',
  Chamfer: 'chamfer',
  Hole: 'hole',
  Shell: 'shell',
  Mirror: 'mirror',
  Split: 'split',
  Thread: 'helix',
  Helix: 'helix',
  Combine: 'union',
  Plane: 'plane',
  ConstructionPlane: 'plane',
};

function iconOf(feature: TimelineFeature): ReactNode {
  if (feature.error) return <IconAlertCircle className="size-icon-sm text-danger" aria-hidden />;
  if (feature.warning) return <IconAlertTriangle className="size-icon-sm text-warning" aria-hidden />;
  const kind = featureKind(feature.type);
  if (kind === 'Box') return <IconBox className="size-icon-sm" aria-hidden />;
  if (kind === 'Cylinder') return <IconCylinder className="size-icon-sm" aria-hidden />;
  if (kind.includes('Pattern')) {
    return <CadIcon name={kind.includes('Circular') ? 'patternCircular' : 'patternLinear'} className="size-icon-sm" />;
  }
  const name = CAD_ICONS[kind];
  return name ? <CadIcon name={name} className="size-icon-sm" /> : <IconPoint className="size-icon-sm" aria-hidden />;
}

/** Room between two steps, where the rollback bar sits (CSS px; matches `gap-2`). */
const SLOT_GAP = 8;
// The gap at the rollback bar is widened to the bar's 24 px target (WCAG 2.5.8, audit AX-02).
const HANDLE_EXTRA = 16;

/**
 * The rollback bar (UI upgrade step 14): drag it between the steps, or move it with the arrow keys
 * and press Enter, to roll the design back to that place; at the end every step is active. It is
 * one element laid over the list and follows the pointer; the steps after it fade while it moves.
 * SolidCraft is asked once, when it is let go, since a rebuild can take long.
 */
function RollbackBar({
  shown,
  position,
  count,
  names,
  busy,
  list,
  onMove,
  onRoll,
}: {
  shown: number;
  position: number;
  count: number;
  names: string[];
  busy: boolean;
  list: React.RefObject<HTMLOListElement | null>;
  onMove: (position: number | null) => void;
  onRoll: (position: number) => void;
}) {
  const { t } = useTranslation();
  const dragging = useRef(false);
  const clamp = (value: number) => Math.min(count, Math.max(1, value));
  const buttons = () => [...(list.current?.querySelectorAll<HTMLElement>('[data-testid="timeline-feature"]') ?? [])];
  const commit = (value: number) => {
    onMove(null);
    if (value !== position) onRoll(value);
  };
  // The position under the pointer: how many steps lie left of it.
  const at = (x: number) =>
    clamp(
      buttons().filter((button) => {
        const box = button.getBoundingClientRect();
        return box.left + box.width / 2 < x;
      }).length,
    );
  return (
    <span
      // In the middle of the widened gap after the last active step. Every step is a button of the
      // same width, so the place follows from the count alone: nothing to measure, right from the
      // first frame. The list's own padding (`px-1`) is half a gap, which takes the half gap off again.
      style={{ left: `calc(${String(shown)} * (var(--cs-control-sm) + ${String(SLOT_GAP)}px) + ${String(HANDLE_EXTRA / 2)}px)` }}
      role="slider"
      tabIndex={busy ? -1 : 0}
      aria-label={t('timeline.handle')}
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={shown}
      aria-valuetext={shown === count ? t('timeline.handleEnd') : t('timeline.handleAfter', { name: names[shown - 1] ?? '' })}
      aria-disabled={busy}
      title={t('timeline.handleHint')}
      className={`group absolute top-1/2 flex h-control-sm w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-sm outline-none focus-visible:focus-ring ${busy ? 'opacity-disabled' : ''}`}
      data-testid="timeline-handle"
      data-position={shown}
      onPointerDown={(event) => {
        if (busy || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        onMove(position);
      }}
      onPointerMove={(event) => {
        if (dragging.current) onMove(at(event.clientX));
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        commit(at(event.clientX));
      }}
      onPointerCancel={() => {
        dragging.current = false;
        onMove(null);
      }}
      onKeyDown={(event) => {
        if (busy) return;
        if (event.key === 'ArrowLeft') onMove(clamp(shown - 1));
        else if (event.key === 'ArrowRight') onMove(clamp(shown + 1));
        else if (event.key === 'Home') onMove(1);
        else if (event.key === 'End') onMove(count);
        else if (event.key === 'Enter') commit(shown);
        else if (event.key === 'Escape') onMove(null);
        else return;
        event.preventDefault();
      }}
      onBlur={() => {
        if (!dragging.current) onMove(null);
      }}
    >
      <span aria-hidden className={`h-full w-1 rounded-full ${shown !== position ? 'bg-accent-hover' : 'bg-accent group-hover:bg-accent-hover'}`} />
    </span>
  );
}

/**
 * The timeline under the view (M1c, compact in UI upgrade step 14): every step of the design in
 * order as an icon with its name in a tooltip, errors and warnings marked, suppressed and
 * rolled-back steps faded, and the rollback bar after the last active step. A step's menu rolls
 * the design back to it or suppresses it; "To the end" brings back every step.
 */
export function Timeline() {
  const { t } = useTranslation();
  const model = useStudio((s) => s.model);
  const setNotice = useStudio((s) => s.setNotice);
  const busy = selectedStatus(useAssistant((s) => s.state)).state === 'busy';
  const list = useRef<HTMLOListElement>(null);
  // Where the rollback bar is while the user moves it; null when it rests at the design's place.
  const [moving, setMoving] = useState<number | null>(null);
  if (model.status !== 'ready' || model.structure.features.length === 0) return null;
  const { features, marker } = model.structure;
  const position = marker ?? features.length;
  const shown = moving ?? position;

  const run = (command: TimelineCommand) => {
    void platform()
      .design.timeline(command)
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  return (
    <section aria-label={t('timeline.title')} className="flex h-control-lg shrink-0 items-center gap-2 border-t border-border bg-surface px-2" data-testid="timeline" data-marker={marker ?? 'end'}>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-subtle">{t('timeline.title')}</span>
      <ol ref={list} className="relative flex min-w-0 flex-1 scroll-px-2 items-center gap-2 overflow-x-auto px-1" style={{ scrollbarWidth: 'thin' }}>
        {features.map((feature, index) => {
          // While the bar moves, the steps it would roll back fade already.
          const faded = feature.suppressed || (moving === null ? feature.rolledBack : index + 1 > moving);
          const kind = featureKind(feature.type);
          return (
            <li key={feature.id} className="flex shrink-0 items-center gap-1" style={index === shown && index > 0 ? { marginLeft: HANDLE_EXTRA } : undefined}>
              <MenuTrigger>
                <TooltipTrigger delay={500} closeDelay={0}>
                <AriaButton
                  className={`relative inline-flex size-control-sm items-center justify-center rounded-md border hover:bg-surface-hover pressed:bg-surface-pressed ${pressable} ${
                    feature.error ? 'border-danger text-danger' : feature.warning ? 'border-warning text-text' : 'border-transparent text-text'
                  } ${faded ? 'opacity-40' : ''}`}
                  aria-label={t('timeline.step', { name: feature.name, kind: t(`timeline.kind.${kind}`, { defaultValue: kind }) })}
                  data-testid="timeline-feature"
                  data-state={feature.error ? 'error' : feature.warning ? 'warning' : feature.suppressed ? 'suppressed' : feature.rolledBack ? 'rolledBack' : 'ok'}
                >
                  {iconOf(feature)}
                  {/* The name in the tooltip for the eye, in the text for tests and search. */}
                  <span className="sr-only">{feature.name}</span>
                  {feature.suppressed ? <span aria-hidden className="pointer-events-none absolute h-hairline w-4 rotate-45 bg-text-subtle" /> : null}
                </AriaButton>
                <Tooltip placement="top" offset={6} className={tooltipClass}>
                  {feature.name}
                  <span className="text-text-subtle"> · {t(`timeline.kind.${kind}`, { defaultValue: kind })}</span>
                </Tooltip>
                </TooltipTrigger>
                <Popover placement="top start" offset={POPOVER_OFFSET} className={`${popoverClass} max-w-text-max`}>
                  <Menu
                    aria-label={feature.name}
                    className={menuClass}
                    onAction={(key) => {
                      if (key === 'roll') run({ action: 'rollTo', position: index + 1 });
                      if (key === 'end') run({ action: 'rollTo', position: 'end' });
                      if (key === 'suppress') run({ action: 'suppress', feature: feature.id, suppressed: !feature.suppressed });
                    }}
                    disabledKeys={busy ? ['roll', 'end', 'suppress'] : marker === null ? ['end'] : []}
                  >
                    <MenuSection>
                      <Header className={menuHeaderClass} title={t('timeline.rebuild', { ms: Math.round(feature.ms) })}>
                        {feature.name} · {t(`timeline.kind.${kind}`, { defaultValue: kind })}
                      </Header>
                      {feature.error || feature.warning ? (
                        <Header className={`px-2 pb-1 text-xs ${feature.error ? 'text-danger' : 'text-warning'}`} data-testid="timeline-problem">
                          {feature.error ?? feature.warning}
                        </Header>
                      ) : null}
                    </MenuSection>
                    <MenuSection>
                      <MenuItem id="roll" className={menuItemClass}>
                        {t('timeline.rollTo')}
                      </MenuItem>
                      <MenuItem id="end" className={menuItemClass}>
                        {t('timeline.toEnd')}
                      </MenuItem>
                      <MenuItem id="suppress" className={menuItemClass}>
                        {feature.suppressed ? t('timeline.unsuppress') : t('timeline.suppress')}
                      </MenuItem>
                    </MenuSection>
                  </Menu>
                </Popover>
              </MenuTrigger>
            </li>
          );
        })}
        {/* A list holds only items (audit AX-02); `contents` keeps the bar placed against the list. */}
        <li className="contents">
        <RollbackBar
          shown={shown}
          position={position}
          count={features.length}
          names={features.map((entry) => entry.name)}
          busy={busy}
          list={list}
          onMove={setMoving}
          onRoll={(next) => {
            run({ action: 'rollTo', position: next === features.length ? 'end' : next });
          }}
        />
        </li>
      </ol>
      {marker !== null ? (
        <AriaButton
          isDisabled={busy}
          onPress={() => {
            run({ action: 'rollTo', position: 'end' });
          }}
          className={`${buttonClass('quiet', 'sm')} border border-accent`}
          data-testid="timeline-end"
        >
          <IconPlayerTrackNext className="size-icon-sm" aria-hidden />
          {t('timeline.toEnd')}
        </AriaButton>
      ) : null}
    </section>
  );
}
