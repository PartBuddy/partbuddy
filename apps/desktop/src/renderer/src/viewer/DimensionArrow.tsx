import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { IconArrowsHorizontal } from '@tabler/icons-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Vector3 } from 'three';

import { useStudio } from '../state/store';
import { buttonVariants } from '../ui/Button';
import { draggedValue } from './dimensionOf';

/** Measured over this many mm along the arrow, so a short step on screen keeps its precision. */
const REACH_MM = 10;

/**
 * The drag arrow of the dimension field (dimension round, step 4): pulled along its line it sets
 * the field's value in whole mm (tenths with Alt), and when let go PartBuddy applies the value as
 * soon as SolidCraft has tried it. Pointer only: the field's arrow keys do the same by keyboard.
 */
export function DimensionArrow() {
  const { t } = useTranslation();
  const handle = useStudio((s) => s.dimensionHandle);
  const { camera, size } = useThree();
  const icon = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; step: { x: number; y: number }; value: number | null } | null>(null);

  // Where 1 mm along the arrow lands on screen, from its foot.
  const step = () => {
    if (!handle) return { x: 0, y: 0 };
    const foot = new Vector3(...handle.origin).project(camera);
    const tip = new Vector3(...handle.origin).addScaledVector(new Vector3(...handle.direction), REACH_MM).project(camera);
    return { x: ((tip.x - foot.x) / 2) * size.width / REACH_MM, y: ((foot.y - tip.y) / 2) * size.height / REACH_MM };
  };

  useFrame(() => {
    if (!icon.current || !handle) return;
    const s = step();
    icon.current.style.transform = `rotate(${Math.atan2(s.y, s.x)}rad)`;
  });

  if (!handle) return null;
  return (
    <Html position={handle.origin} center zIndexRange={[20, 15]}>
      <div
        aria-hidden
        title={t('hud.dragArrow')}
        data-testid="dimension-arrow"
        className={`flex size-control-sm cursor-grab touch-none items-center justify-center rounded-full shadow-2 active:cursor-grabbing ${buttonVariants.primary}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, step: step(), value: null };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          const value = draggedValue(handle.value, handle, start.step, { x: event.clientX - start.x, y: event.clientY - start.y }, event.altKey);
          if (value === null || value === start.value) return;
          start.value = value;
          handle.onDrag(value, false);
        }}
        onPointerUp={() => {
          const value = drag.current?.value ?? null;
          drag.current = null;
          if (value !== null) handle.onDrag(value, true);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div ref={icon} className="flex items-center justify-center">
          <IconArrowsHorizontal className="size-icon-sm" aria-hidden />
        </div>
      </div>
    </Html>
  );
}
