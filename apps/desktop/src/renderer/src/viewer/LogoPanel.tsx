import { IconCheck, IconFocusCentered, IconLayoutAlignCenter, IconLayoutAlignMiddle, IconRotate, IconRotateClockwise } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Label, NumberField } from 'react-aria-components';

import type { LogoMoveRequest, LogoSpot } from '../../../shared/contract';
import { LOGO_PREFIX, type Vec3 } from '../../../shared/drawingPlacement';
import { platform } from '../platform';
import { useStudio, type DraggedDimension, type Pick } from '../state/store';
import { buttonClass } from '../ui/Button';
import { fieldLabelClass, UnitInput } from '../ui/Field';

/** Quiet time after a change before PartBuddy tries the move in SolidCraft. */
const PREVIEW_DELAY_MS = 250;

const round = (value: number) => Math.round(value * 1000) / 1000 || 0;
/** The drawing's width as the dock shows it, to a hundredth of a mm. */
const widthOf = (spot: LogoSpot) => Math.round((spot.box[2] - spot.box[0]) * 100) / 100;
/** An angle as the shortest turn, −180 to 180 degrees. */
const shortest = (degrees: number) => round(((((degrees + 180) % 360) + 360) % 360) - 180);

/**
 * Moving a placed logo exactly (decided 2026-11-08): picked on the part, the dock shows where its
 * middle sits from the face's middle, across and up as the logo reads, and how deep or high it is
 * (one value for every extrusion of it, a body per colour included). A changed value shows as a
 * ghost and "Move" applies it; the two arrows on the part move it by dragging and apply when let
 * go; the centre buttons put it onto the face's middle. Pocket, cut and colour bodies follow.
 */
export function LogoPanel({ spot, busy, onGhost }: { spot: LogoSpot; busy: boolean; onGhost: (ghost: Uint8Array | null) => void }) {
  const { t } = useTranslation();
  const setNotice = useStudio((s) => s.setNotice);
  const setLogoHandles = useStudio((s) => s.setLogoHandles);
  const setLogoOutline = useStudio((s) => s.setLogoOutline);
  // The caller keys the panel by the spot, so a new reading starts the fields afresh.
  const [value, setValue] = useState<[number, number]>(() => spot.offset ?? [0, 0]);
  const [depth, setDepth] = useState<number | null>(() => spot.depth?.value ?? null);
  const [angle, setAngle] = useState(() => spot.angle);
  const [wide, setWide] = useState(() => widthOf(spot));
  const shown = useRef(false);

  // The whole logo drawn in the selection colour while it is picked.
  useEffect(() => {
    setLogoOutline(spot.outline);
    return () => {
      setLogoOutline(null);
    };
  }, [spot.outline, setLogoOutline]);

  const base = spot.offset ?? [0, 0];
  const by: [number, number] = [round(value[0] - base[0]), round(value[1] - base[1])];
  const moved = by[0] !== 0 || by[1] !== 0;
  const deeper = depth !== null && spot.depth != null && depth > 0 && Math.abs(depth - spot.depth.value) > 1e-6;
  const turn = shortest(angle - spot.angle);
  const resized = wide > 0 && Math.abs(wide - widthOf(spot)) > 0.005;
  const changed = moved || deeper || turn !== 0 || resized;
  const request = (): Omit<LogoMoveRequest, 'logo'> => ({ by: moved ? by : null, centre: null, depth: deeper ? depth : null, rotate: turn !== 0 ? turn : null, width: resized ? wide : null });

  const move = (request: Omit<LogoMoveRequest, 'logo'>) => {
    if (busy) return;
    void platform()
      .design.moveLogo({ logo: spot.logo, ...request })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  // The ghost of a changed value, tried once the typing or dragging pauses.
  useEffect(() => {
    if (busy) return;
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
  }, [spot, busy, value[0], value[1], depth, angle, wide]);

  // The arrows on the part: across and up.
  useEffect(() => {
    if (busy) {
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
    <section aria-label={t('logoMove.title', { name: logoTitleOf(spot) })} className="flex flex-col gap-2" data-testid="logo-move">
      <p className="text-xs text-text-muted">{spot.offset ? t('logoMove.hint') : t('logoMove.hintNoFace')}</p>
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
        <NumberField
          value={wide}
          maxValue={1000}
          step={0.1}
          isDisabled={busy}
          formatOptions={{ maximumFractionDigits: 2 }}
          onChange={(next) => {
            if (Number.isFinite(next) && next > 0) setWide(next);
          }}
          className="flex w-field-dock flex-col gap-1"
          data-testid="logo-width"
        >
          <Label className={fieldLabelClass}>{t('logoMove.width')}</Label>
          <UnitInput unit={t('units.mmShort')} />
        </NumberField>
        <NumberField
          value={angle}
          minValue={-360}
          maxValue={360}
          step={1}
          isDisabled={busy}
          formatOptions={{ maximumFractionDigits: 2 }}
          onChange={(next) => {
            if (Number.isFinite(next)) setAngle(next);
          }}
          className="flex w-field-dock flex-col gap-1"
          data-testid="logo-angle"
        >
          <Label className={fieldLabelClass}>{t('logoMove.angle')}</Label>
          <UnitInput unit="°" />
        </NumberField>
        <AriaButton isDisabled={busy || !changed} onPress={() => move(request())} className={buttonClass('primary', 'sm')} data-testid="logo-move-apply">
          <IconCheck className="size-icon-sm" aria-hidden />
          {t('logoMove.apply')}
        </AriaButton>
      </div>
      <div className="flex flex-wrap gap-1">
        {spot.offset ? (
          <>
            {centre('x', IconLayoutAlignCenter, t('logoMove.centreAcross'), 'logo-centre-x')}
            {centre('y', IconLayoutAlignMiddle, t('logoMove.centreUp'), 'logo-centre-y')}
            {centre('both', IconFocusCentered, t('logoMove.centre'), 'logo-centre')}
          </>
        ) : null}
        <AriaButton isDisabled={busy} onPress={() => move({ by: null, centre: null, rotate: 90 })} aria-label={t('logoMove.turnLeft')} className={buttonClass('secondary', 'sm')} data-testid="logo-turn-left">
          <IconRotate className="size-icon-sm" aria-hidden />
          90°
        </AriaButton>
        <AriaButton isDisabled={busy} onPress={() => move({ by: null, centre: null, rotate: -90 })} aria-label={t('logoMove.turnRight')} className={buttonClass('secondary', 'sm')} data-testid="logo-turn-right">
          <IconRotateClockwise className="size-icon-sm" aria-hidden />
          90°
        </AriaButton>
      </div>
    </section>
  );
}

/** The readable name of a picked logo, without the sketch prefix. */
export const logoTitleOf = (spot: LogoSpot) => (spot.logo.startsWith(LOGO_PREFIX) ? spot.logo.slice(LOGO_PREFIX.length) : spot.logo);

/**
 * The logo under a single plain pick (decided 2026-11-09: a click on a logo picks the whole logo),
 * null when there is none or the design has no logos, undefined while it is being read. An
 * Alt+click picks exactly and leaves the logo out.
 */
export function useLogoSpot(picks: Pick[]): LogoSpot | null | undefined {
  const hasLogos = useStudio((s) => s.model.status === 'ready' && s.model.structure.sketches.some((sketch) => sketch.name.startsWith(LOGO_PREFIX)));
  const [pick] = picks;
  const point = picks.length === 1 && pick && !pick.exact && hasLogos ? pick.point : undefined;
  const [found, setFound] = useState<{ point: Vec3; spot: LogoSpot | null } | null>(null);
  useEffect(() => {
    if (!point) return;
    let live = true;
    platform()
      .design.logoAt(point)
      .then((spot) => {
        if (live) setFound({ point, spot });
      })
      .catch(() => {
        if (live) setFound({ point, spot: null });
      });
    return () => {
      live = false;
    };
  }, [point]);
  if (!point) return null;
  return found?.point === point ? found.spot : undefined;
}
