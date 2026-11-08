import { IconCheck, IconFocusCentered, IconLayoutAlignCenter, IconLayoutAlignMiddle } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Label, NumberField } from 'react-aria-components';

import type { LogoMoveRequest, LogoSpot } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio, type DraggedDimension, type Pick } from '../state/store';
import { buttonClass } from '../ui/Button';
import { fieldLabelClass, UnitInput } from '../ui/Field';

/** Quiet time after a change before PartBuddy tries the move in SolidCraft. */
const PREVIEW_DELAY_MS = 250;

const round = (value: number) => Math.round(value * 1000) / 1000 || 0;

/**
 * Moving a placed logo exactly (decided 2026-11-08): picked on the part, the dock shows where its
 * middle sits from the face's middle, across and up as the logo reads, and how deep or high it is
 * (one value for every extrusion of it, a body per colour included). A changed value shows as a
 * ghost and "Move" applies it; the two arrows on the part move it by dragging and apply when let
 * go; the centre buttons put it onto the face's middle. Pocket, cut and colour bodies follow.
 */
export function LogoPanel({ picks, busy, onGhost }: { picks: Pick[]; busy: boolean; onGhost: (ghost: Uint8Array | null) => void }) {
  const { t } = useTranslation();
  const setNotice = useStudio((s) => s.setNotice);
  const setLogoHandles = useStudio((s) => s.setLogoHandles);
  const [pick] = picks;
  const point = picks.length === 1 ? pick?.point : undefined;
  const [spot, setSpot] = useState<LogoSpot | null>(null);
  const [value, setValue] = useState<[number, number]>([0, 0]);
  const [depth, setDepth] = useState<number | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (!point) return;
    let live = true;
    platform()
      .design.logoAt(point)
      .then((found) => {
        if (!live) return;
        setSpot(found);
        if (found) setValue(found.offset ?? [0, 0]);
        setDepth(found?.depth?.value ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [point]);

  const base = spot?.offset ?? [0, 0];
  const by: [number, number] = [round(value[0] - base[0]), round(value[1] - base[1])];
  const moved = by[0] !== 0 || by[1] !== 0;
  const deeper = depth !== null && spot?.depth != null && depth > 0 && Math.abs(depth - spot.depth.value) > 1e-6;
  const changed = moved || deeper;
  const request = (): Omit<LogoMoveRequest, 'logo'> => ({ by: moved ? by : null, centre: null, depth: deeper ? depth : null });

  const move = (request: Omit<LogoMoveRequest, 'logo'>) => {
    if (!spot || busy) return;
    void platform()
      .design.moveLogo({ logo: spot.logo, ...request })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  // The ghost of a changed value, tried once the typing or dragging pauses.
  useEffect(() => {
    if (!spot || busy) return;
    if (!changed) {
      if (shown.current) onGhost(null);
      shown.current = false;
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      platform()
        .design.previewLogoMove({ logo: spot.logo, ...request() })
        .then((result) => {
          if (!live) return;
          shown.current = true;
          onGhost(result.ok ? result.preview : null);
        })
        .catch(() => undefined);
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The request is derived from value, depth and spot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, busy, value[0], value[1], depth]);

  // The arrows on the part: across and up.
  useEffect(() => {
    if (!spot || busy) {
      setLogoHandles([]);
      return;
    }
    const drag = (axis: 0 | 1) => (dragged: number, done: boolean) => {
      const next: [number, number] = axis === 0 ? [dragged, value[1]] : [value[0], dragged];
      setValue(next);
      if (done) move({ by: [round(next[0] - base[0]), round(next[1] - base[1])], centre: null });
    };
    // Each just outside the drawing on its own line, so neither covers the logo or the other arrow.
    const at = (direction: [number, number, number], reach: number) => spot.origin.map((value, i) => value + (direction[i] ?? 0) * (reach + 2)) as [number, number, number];
    const handles: DraggedDimension[] = [
      { origin: at(spot.xDir, spot.box[2]), direction: spot.xDir, perMm: 1, signed: true, value: value[0], onDrag: drag(0) },
      { origin: at(spot.yDir, spot.box[3]), direction: spot.yDir, perMm: 1, signed: true, value: value[1], onDrag: drag(1) },
    ];
    if (spot.depth && depth !== null) {
      // At the middle, along the face's normal: out of the face for a raised logo, into it for an engraved one.
      const [x, y] = [spot.xDir, spot.yDir];
      const normal = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      const way = spot.depth.raised ? 1 : -1;
      handles.push({
        origin: spot.origin.map((value, i) => value + (normal[i] ?? 0) * way * depth) as [number, number, number],
        direction: normal.map((value) => value * way) as [number, number, number],
        perMm: 1,
        raised: spot.depth.raised,
        value: depth,
        onDrag: (dragged, done) => {
          setDepth(dragged);
          if (done) move({ by: null, centre: null, depth: dragged });
        },
      });
    }
    setLogoHandles(handles);
    return () => {
      setLogoHandles([]);
    };
    // move and base follow spot; value is what the arrows start from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, busy, value[0], value[1], depth, setLogoHandles]);

  if (!spot) return null;
  const field = (axis: 0 | 1) => (
    <NumberField
      value={value[axis]}
      step={1}
      isDisabled={busy}
      formatOptions={{ maximumFractionDigits: 2 }}
      onChange={(next) => {
        if (Number.isFinite(next)) setValue(axis === 0 ? [next, value[1]] : [value[0], next]);
      }}
      className="flex w-field-dock flex-col gap-1"
      data-testid={axis === 0 ? 'logo-x' : 'logo-y'}
    >
      <Label className={fieldLabelClass}>{t(axis === 0 ? 'logoMove.across' : 'logoMove.up')}</Label>
      <UnitInput unit={t('units.mmShort')} />
    </NumberField>
  );
  const centre = (axis: 'x' | 'y' | 'both', Icon: typeof IconFocusCentered, label: string, testId: string) => (
    <AriaButton isDisabled={busy} onPress={() => move({ by: null, centre: axis })} className={buttonClass('secondary', 'sm')} data-testid={testId}>
      <Icon className="size-icon-sm" aria-hidden />
      {label}
    </AriaButton>
  );
  return (
    <section aria-label={t('logoMove.title', { name: spot.logo.replace(/^Logo /, '') })} className="flex flex-col gap-2 border-t border-border pt-2" data-testid="logo-move">
      <div className="flex flex-col gap-hairline">
        <h3 className="text-sm font-medium text-text">{t('logoMove.title', { name: spot.logo.replace(/^Logo /, '') })}</h3>
        <p className="text-xs text-text-muted">{spot.offset ? t('logoMove.hint') : t('logoMove.hintNoFace')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {field(0)}
        {field(1)}
        {spot.depth && depth !== null ? (
          <NumberField
            value={depth}
            minValue={0.1}
            maxValue={50}
            step={0.1}
            isDisabled={busy}
            formatOptions={{ maximumFractionDigits: 2 }}
            onChange={(next) => {
              if (Number.isFinite(next) && next > 0) setDepth(next);
            }}
            className="flex w-field-dock flex-col gap-1"
            data-testid="logo-depth"
          >
            <Label className={fieldLabelClass}>{t(spot.depth.raised ? 'logoMove.height' : 'logoMove.depth')}</Label>
            <UnitInput unit={t('units.mmShort')} />
          </NumberField>
        ) : null}
        <AriaButton isDisabled={busy || !changed} onPress={() => move(request())} className={buttonClass('primary', 'sm')} data-testid="logo-move-apply">
          <IconCheck className="size-icon-sm" aria-hidden />
          {t('logoMove.apply')}
        </AriaButton>
      </div>
      {spot.offset ? (
        <div className="flex flex-wrap gap-1">
          {centre('x', IconLayoutAlignCenter, t('logoMove.centreAcross'), 'logo-centre-x')}
          {centre('y', IconLayoutAlignMiddle, t('logoMove.centreUp'), 'logo-centre-y')}
          {centre('both', IconFocusCentered, t('logoMove.centre'), 'logo-centre')}
        </div>
      ) : null}
    </section>
  );
}
