import { IconCheck, IconFocusCentered, IconLayoutAlignCenter, IconLayoutAlignMiddle, IconRotate, IconRotateClockwise } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, CheckboxButton, CheckboxField, Input, Label, NumberField, TextField } from 'react-aria-components';

import type { LogoMoveRequest, LogoSpot } from '../../../shared/contract';
import { BOLD_FONT } from '../../../shared/blocks';
import { isPlacedName, logoTitle, type Vec3 } from '../../../shared/drawingPlacement';
import { platform } from '../platform';
import { useStudio, type DraggedDimension, type Pick } from '../state/store';
import { buttonClass } from '../ui/Button';
import { CheckMark, choiceInlineClass } from '../ui/Choice';
import { fieldLabelClass, inputClass, UnitInput } from '../ui/Field';
import { boldable as canBold, FontChoice, setFont as fontFor, useFontFaces } from './FontChoice';
import { useLivePreview } from './livePreview';

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
  // A placed text: its words, font ("" the built-in one), capital height and boldness.
  const [words, setWords] = useState(() => spot.text?.words ?? '');
  const [font, setFont] = useState(() => spot.text?.font ?? '');
  const [tall, setTall] = useState(() => spot.text?.height ?? 0);
  const [bold, setBold] = useState(() => spot.text?.bold ?? false);
  // A font without a bold face cannot be set bold (SolidCraft refuses it).
  const faces = useFontFaces();
  const boldable = canBold(faces, font);
  // A text set in a bold face's full name reads back as its family and bold.
  const shownFont = spot.text?.font ? faces.familyOf.get(spot.text.font) : undefined;
  const now = spot.text && (shownFont ? { ...spot.text, font: shownFont, bold: true } : spot.text);
  // Once the installed fonts are read (state adjusted while rendering, as React advises over an effect).
  const [readAs, setReadAs] = useState<string | undefined>(undefined);
  if (shownFont !== readAs) {
    setReadAs(shownFont);
    if (shownFont) {
      setFont(shownFont);
      setBold(true);
    }
  }
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
  const resized = !spot.text && wide > 0 && Math.abs(wide - widthOf(spot)) > 0.005;
  const retext = now
    ? {
        ...(words.trim() && words.trim() !== now.words ? { words: words.trim() } : {}),
        ...(tall > 0 && Math.abs(tall - now.height) > 0.005 ? { height: tall } : {}),
        // The built-in font has no bold face: bold without a chosen font is set in Arial, as the block does.
        ...(font !== (now.font ?? '') || bold !== now.bold ? (font ? fontFor(faces, font, bold) : { font: bold ? BOLD_FONT : '', bold }) : {}),
      }
    : {};
  const retyped = Object.keys(retext).length > 0;
  const changed = moved || deeper || turn !== 0 || resized || retyped;
  const request = (): Omit<LogoMoveRequest, 'logo'> => ({
    by: moved ? by : null,
    centre: null,
    depth: deeper ? depth : null,
    rotate: turn !== 0 ? turn : null,
    width: resized ? wide : null,
    ...(retyped ? { text: retext } : {}),
  });

  const move = (request: Omit<LogoMoveRequest, 'logo'>) => {
    if (busy) return;
    void platform()
      .design.moveLogo({ logo: spot.logo, ...request })
      .catch((error: unknown) => {
        setNotice({ tone: 'danger', text: t('actions.failed', { detail: (error as Error).message.slice(0, 200) }) });
      });
  };

  // The ghost of a changed value keeps up while it is dragged or typed; back to unchanged, it goes.
  useEffect(() => {
    if (busy || changed) return;
    if (shown.current) onGhost(null);
    shown.current = false;
  }, [busy, changed, onGhost]);
  const tried = useMemo(
    () => (busy || !changed ? null : { logo: spot.logo, ...request() }),
    // The request is derived from value, depth, angle, width and the text's settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spot, busy, changed, value[0], value[1], depth, angle, wide, words, font, tall, bold],
  );
  useLivePreview(
    tried,
    (move) => platform().design.previewLogoMove(move),
    (_move, result) => {
      shown.current = true;
      onGhost(result.ok ? result.preview : null);
    },
  );

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
    // Size, from the drawing's lower right corner along its x: a logo grows about its middle, so
    // its width changes twice the drag; a text's height follows its width in proportion.
    const across = spot.box[2] - spot.box[0];
    if (across > 0) {
      const corner = spot.origin.map((value, i) => value + (spot.xDir[i] ?? 0) * (spot.box[2] + 2) + (spot.yDir[i] ?? 0) * (spot.box[1] - 2)) as [number, number, number];
      handles.push({
        origin: corner,
        direction: spot.xDir,
        perMm: spot.text ? (2 * spot.text.height) / across : 2,
        value: spot.text ? tall : wide,
        label: t('logoMove.dragSize'),
        testId: 'logo-arrow-size',
        onDrag: (dragged, done) => {
          if (dragged <= 0) return;
          const size = round(dragged);
          if (spot.text) setTall(size);
          else setWide(size);
          if (done) move(spot.text ? { by: null, centre: null, text: { height: size } } : { by: null, centre: null, width: size });
        },
      });
    }
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
        // Named here: since the size arrow it is the fourth, past the list of default names (#246).
        label: t(spot.depth.raised ? 'logoMove.dragHeight' : 'logoMove.dragDepth'),
        testId: 'logo-arrow-depth',
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
  }, [spot, busy, value[0], value[1], depth, wide, tall, setLogoHandles]);

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
    <section aria-label={t(spot.text ? 'logoMove.titleText' : 'logoMove.title', { name: logoTitleOf(spot) })} className="flex flex-col gap-2" data-testid="logo-move">
      <p className="text-xs text-text-muted">{spot.offset ? t(spot.text ? 'logoMove.hintText' : 'logoMove.hint') : t('logoMove.hintNoFace')}</p>
      {spot.text ? (
        <div className="grid grid-cols-2 gap-2" data-testid="logo-text">
          <TextField value={words} onChange={setWords} maxLength={80} isDisabled={busy} className="col-span-2 flex min-w-0 flex-col gap-1" data-testid="logo-words">
            <Label className={fieldLabelClass}>{t('logoMove.words')}</Label>
            <Input className={inputClass('sm')} />
          </TextField>
          <FontChoice
            value={font}
            onChange={(next, canBold) => {
              setFont(next);
              if (!canBold) setBold(false);
            }}
          />
          <NumberField
            value={tall}
            minValue={0.5}
            maxValue={500}
            step={0.5}
            isDisabled={busy}
            formatOptions={{ maximumFractionDigits: 2 }}
            onChange={(next) => {
              if (Number.isFinite(next) && next > 0) setTall(next);
            }}
            className="flex min-w-0 flex-col gap-1"
            data-testid="logo-text-height"
          >
            <Label className={fieldLabelClass}>{t('logoMove.textHeight')}</Label>
            <UnitInput unit={t('units.mmShort')} />
          </NumberField>
          <CheckboxField isSelected={bold} onChange={setBold} isDisabled={busy || !boldable} className="flex items-end pb-1" data-testid="logo-bold">
            <CheckboxButton className={choiceInlineClass}>
              <CheckMark />
              {t('logoMove.bold')}
            </CheckboxButton>
          </CheckboxField>
        </div>
      ) : null}
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
        {spot.text ? null : (
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
        )}
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
export const logoTitleOf = (spot: LogoSpot) => logoTitle(spot.logo);

/**
 * The logo under a single plain pick (decided 2026-11-09: a click on a logo picks the whole logo),
 * null when there is none or the design has no logos, undefined while it is being read. An
 * Alt+click picks exactly and leaves the logo out.
 */
export function useLogoSpot(picks: Pick[]): LogoSpot | null | undefined {
  const hasLogos = useStudio((s) => s.model.status === 'ready' && s.model.structure.sketches.some((sketch) => isPlacedName(sketch.name)));
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
