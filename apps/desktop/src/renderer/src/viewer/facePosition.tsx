import { IconFocusCentered, IconLayoutAlignCenter, IconLayoutAlignMiddle } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Label, NumberField } from 'react-aria-components';

import { planeAt } from '../../../shared/blocks';
import { useStudio, type BodyModel, type Pick } from '../state/store';
import { buttonClass } from '../ui/Button';
import { fieldLabelClass, UnitInput } from '../ui/Field';

type Vec = [number, number, number];

const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/**
 * Where something can go on its face (decided 2026-11-09, like a logo): the face's own frame (the
 * one a block is built in, planeAt) and the face's middle in it, from the face's mesh points,
 * as an offset from the clicked point, and its size across and up.
 */
export function facePlace(body: BodyModel, face: number, point: Vec, normal: Vec): { x: Vec; y: Vec; middle: [number, number]; size: [number, number] } {
  const { x_dir: x, y_dir: y } = planeAt(point, normal);
  const positions = body.model.geometry.getAttribute('position');
  const faces = body.model.vertexFaces;
  let [minU, minV, maxU, maxV] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < faces.length; i += 1) {
    if (faces[i] !== face) continue;
    const [dx, dy, dz] = [positions.getX(i) - point[0], positions.getY(i) - point[1], positions.getZ(i) - point[2]];
    const [u, v] = [dx * x[0] + dy * x[1] + dz * x[2], dx * y[0] + dy * y[1] + dz * y[2]];
    [minU, minV, maxU, maxV] = [Math.min(minU, u), Math.min(minV, v), Math.max(maxU, u), Math.max(maxV, v)];
  }
  if (!Number.isFinite(minU)) return { x, y, middle: [0, 0], size: [0, 0] };
  return { x, y, middle: [(minU + maxU) / 2, (minV + maxV) / 2], size: [maxU - minU, maxV - minV] };
}

export interface FacePosition {
  /** The face's frame and middle, or null for a face that is not flat. */
  place: ReturnType<typeof facePlace> | null;
  /** Where it sits now, in world mm: the clicked point moved by the fields and arrows. */
  centre: Vec | null;
  /** Across and up from the face's middle, mm. */
  offset: [number, number];
  /** The fields and centre buttons. */
  controls: ReactNode;
}

/**
 * Placing something on a picked flat face before it is built (a block, a hole): across and up from
 * the face's middle in fields, centre buttons, and two drag arrows on the part while `active`.
 * At first it sits where the face was clicked. `testId` prefixes the fields' and arrows' test ids.
 */
export function useFacePosition({ bodies, picks, active, busy, testId }: { bodies: BodyModel[]; picks: Pick[]; active: boolean; busy: boolean; testId: string }): FacePosition {
  const { t } = useTranslation();
  const [pick] = picks;
  const normal = pick?.kind === 'face' && picks.length === 1 ? bodies[pick.body]?.model.table.faces[pick.face]?.planeNormal : undefined;
  // Keyed by plain values: the picks and bodies arrays are new on every store change (the arrows write to it).
  const at = pick && normal ? `${pick.point.join(',')}\u0000${normal.join(',')}` : null;
  const faceIndex = pick?.kind === 'face' ? pick.face : -1;
  const model = pick ? bodies[pick.body] : undefined;
  const place = useMemo(() => {
    if (!at || !model || faceIndex < 0) return null;
    const [point = '', facing = ''] = at.split('\u0000');
    return facePlace(model, faceIndex, point.split(',').map(Number) as Vec, facing.split(',').map(Number) as Vec);
  }, [at, model, faceIndex]);
  const [offset, setOffset] = useState<[number, number]>(() => (place ? [round2(-place.middle[0]), round2(-place.middle[1])] : [0, 0]));
  const centre = useMemo<Vec | null>(() => {
    if (!at) return null;
    const clicked = (at.split('\u0000')[0] ?? '').split(',').map(Number) as Vec;
    if (!place) return clicked;
    const [u, v] = [place.middle[0] + offset[0], place.middle[1] + offset[1]];
    return clicked.map((value, i) => value + u * (place.x[i] ?? 0) + v * (place.y[i] ?? 0)) as Vec;
  }, [at, place, offset]);

  // Two arrows on the part move it across and up its face while active; an inactive one leaves them alone.
  const setHandles = useStudio((s) => s.setLogoHandles);
  useEffect(() => {
    if (!active || !place || !centre || busy) return;
    const arrow = (axis: 0 | 1) => {
      const direction = axis === 0 ? place.x : place.y;
      return {
        origin: centre.map((value, i) => value + (direction[i] ?? 0) * 6) as Vec,
        direction,
        perMm: 1,
        signed: true,
        value: offset[axis],
        label: t(axis === 0 ? 'blocks.dragAcross' : 'blocks.dragUp'),
        testId: `${testId}-arrow-${axis === 0 ? 'x' : 'y'}`,
        onDrag: (dragged: number) => {
          setOffset(axis === 0 ? [dragged, offset[1]] : [offset[0], dragged]);
        },
      };
    };
    setHandles([arrow(0), arrow(1)]);
    return () => {
      setHandles([]);
    };
  }, [active, place, busy, offset, centre, setHandles, t, testId]);

  const controls = place ? (
    <div className="flex flex-col gap-1" data-testid={`${testId}-position`}>
      <span className={fieldLabelClass}>{t('blocks.position')}</span>
      <div className="flex flex-wrap items-end gap-2">
        {([0, 1] as const).map((axis) => (
          <NumberField
            key={axis}
            value={offset[axis]}
            step={0.1}
            isDisabled={busy}
            formatOptions={{ maximumFractionDigits: 2 }}
            onChange={(next) => {
              if (Number.isFinite(next)) setOffset(axis === 0 ? [next, offset[1]] : [offset[0], next]);
            }}
            className="flex w-field-dock flex-col gap-1"
            data-testid={`${testId}-${axis === 0 ? 'x' : 'y'}`}
          >
            <Label className={fieldLabelClass}>{t(axis === 0 ? 'logoMove.across' : 'logoMove.up')}</Label>
            <UnitInput unit={t('units.mmShort')} />
          </NumberField>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['x', IconLayoutAlignCenter, 'logoMove.centreAcross'],
            ['y', IconLayoutAlignMiddle, 'logoMove.centreUp'],
            ['both', IconFocusCentered, 'logoMove.centre'],
          ] as const
        ).map(([axis, Icon, label]) => (
          <AriaButton
            key={axis}
            isDisabled={busy}
            onPress={() => {
              setOffset([axis === 'y' ? offset[0] : 0, axis === 'x' ? offset[1] : 0]);
            }}
            className={buttonClass('secondary', 'sm')}
            data-testid={`${testId}-centre-${axis}`}
          >
            <Icon className="size-icon-sm" aria-hidden />
            {t(label)}
          </AriaButton>
        ))}
      </div>
    </div>
  ) : null;

  return { place, centre, offset, controls };
}
