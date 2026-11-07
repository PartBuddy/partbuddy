import { IconFocus2, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SwitchButton, SwitchField } from 'react-aria-components';

import { useStudio } from '../state/store';
import { BuildLine } from './BuildStatus';
import { IconButton } from '../ui/Button';
import { choiceInlineClass, SwitchMark } from '../ui/Choice';

/** How many faces and sketch curves the latest step changed, with the camera follow switch. */
/** Glow after a change: held, then faded out in small steps (none under reduced motion). */
const GLOW = { holdMs: 900, fadeMs: 700, stepMs: 70 };

function useChangeGlow(serial: number | null, hovered: boolean): void {
  useEffect(() => {
    const set = useStudio.getState().setChangeGlow;
    if (serial === null) {
      set(0);
      return;
    }
    if (hovered) {
      set(1);
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(0);
      return;
    }
    set(1);
    let timer = 0;
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started - GLOW.holdMs;
      const glow = elapsed <= 0 ? 1 : Math.max(0, 1 - elapsed / GLOW.fadeMs);
      set(Math.round(glow * 20) / 20);
      if (glow > 0) timer = window.setTimeout(tick, elapsed <= 0 ? GLOW.holdMs : GLOW.stepMs);
    };
    timer = window.setTimeout(tick, GLOW.holdMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [serial, hovered]);
}

function Changes() {
  const { t } = useTranslation();
  const changes = useStudio((s) => s.changes);
  const [hovered, setHovered] = useState(false);
  useChangeGlow(changes?.serial ?? null, hovered);
  const follow = useStudio((s) => s.followChanges);
  const setFollow = useStudio((s) => s.setFollowChanges);
  const clear = useStudio((s) => s.clearChanges);
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-md bg-surface-raised px-2 py-1 text-sm text-text shadow-2">
      {changes ? (
        <span
          role="status"
          className="flex items-center gap-1"
          data-testid="live-changes"
          title={t('live.showChanged')}
          onPointerEnter={() => {
            setHovered(true);
          }}
          onPointerLeave={() => {
            setHovered(false);
          }}
        >
          <span aria-hidden className="size-dot rounded-full bg-changed" />
          {[
            changes.count > 0 ? t('live.changed', { count: changes.count }) : null,
            changes.sketchCurves > 0 ? t('live.sketchChanged', { count: changes.sketchCurves }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          <IconButton label={t('live.clear')} onPress={clear} className="-my-1">
            <IconX className="size-icon-sm" aria-hidden />
          </IconButton>
        </span>
      ) : null}
      <SwitchField isSelected={follow} onChange={setFollow}>
        <SwitchButton className={choiceInlineClass}>
        <SwitchMark />
        <IconFocus2 className="size-icon-sm text-text-subtle" aria-hidden />
        {t('live.follow')}
        </SwitchButton>
      </SwitchField>
    </div>
  );
}

export function LiveBar() {
  const ready = useStudio((s) => s.model.status === 'ready' && (s.model.bodies.length > 0 || s.model.sketches.length > 0));
  if (!ready) return null;
  return (
    <div className="flex flex-col items-start gap-2" data-view-overlay>
      <BuildLine />
      <Changes />
    </div>
  );
}
