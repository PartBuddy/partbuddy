import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label, Slider, SliderOutput } from 'react-aria-components';

import type { Joint } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button } from '../ui/Button';
import { SliderBar } from '../ui/Choice';

type JointValue = Joint['values'][number];

/** The slider's ends: the joint's limits, and where a side has none a half turn or 100 mm, widened to hold the value. */
export function jointRange(value: JointValue): [number, number] {
  const open = value.unit === 'deg' ? 180 : 100;
  return [Math.min(value.limits?.[0] ?? -open, value.value), Math.max(value.limits?.[1] ?? open, value.value)];
}

/**
 * Parts that move (ADR 0027): one slider per joint value. While it is dragged the joint's bodies
 * follow in the view (G4); letting go drives the joint in SolidCraft, and the next revision of the
 * mirror shows where the parts stand and gives the slider the value SolidCraft kept it at.
 */
export function JointPanel({ joints }: { joints: Joint[] }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPreview = useStudio((s) => s.setJointPreview);
  // The bodies go back to where the mirror has them when the panel closes.
  useEffect(
    () => () => {
      setPreview(null);
    },
    [setPreview],
  );

  const drive = (moves: { joint: Joint; index: number; value: number }[]) => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        for (const { joint, index, value } of moves) {
          await platform().design.driveJoint({ joint: joint.id, index, value, unit: joint.values[index]?.unit ?? 'deg', name: joint.name });
        }
      } catch (cause) {
        setError((cause as Error).message.slice(0, 200));
        setPreview(null);
      } finally {
        setBusy(false);
      }
    })();
  };

  const away = joints.flatMap((joint) => joint.values.flatMap((value, index) => (Math.abs(value.value) > 1e-6 ? [{ joint, index, value: 0 }] : [])));

  return (
    <div
      role="group"
      aria-label={t('viewer.joints.title')}
      className="pointer-events-auto flex w-menu animate-pop-in flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-view-overlay
      data-testid="joint-panel"
    >
      {joints.flatMap((joint) =>
        joint.values.map((value, index) => {
          const [min, max] = jointRange(value);
          return (
            <Slider
              // A new value from SolidCraft (clamped, or moved by the assistant) starts the slider there.
              key={`${String(joint.id)}-${String(index)}-${String(value.value)}`}
              defaultValue={value.value}
              minValue={min}
              maxValue={max}
              step={value.unit === 'deg' ? 1 : 0.5}
              isDisabled={busy}
              formatOptions={value.unit === 'deg' ? { style: 'unit', unit: 'degree', unitDisplay: 'narrow', maximumFractionDigits: 1 } : { style: 'unit', unit: 'millimeter', maximumFractionDigits: 1 }}
              onChange={(next) => {
                // The bodies follow in the view at once (G4); SolidCraft is driven when the slider is let go.
                setPreview({ joint: joint.id, index, value: next });
              }}
              onChangeEnd={(next) => {
                if (next !== value.value) drive([{ joint, index, value: next }]);
                else setPreview(null);
              }}
              className="w-full"
              data-testid="joint-value"
            >
              <div className="flex justify-between gap-2 text-xs text-text-muted">
                <Label className="truncate">{joint.values.length > 1 ? `${joint.name} ${String(index + 1)}` : joint.name}</Label>
                <SliderOutput className="tabular-nums" />
              </div>
              <SliderBar />
            </Slider>
          );
        }),
      )}
      <Button
        size="sm"
        isDisabled={busy || away.length === 0}
        onPress={() => {
          setPreview(null);
          drive(away);
        }}
        data-testid="joint-reset"
      >
        {t('viewer.joints.reset')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger" data-testid="joint-error">
          {t('viewer.joints.failed', { reason: error })}
        </p>
      ) : (
        <p className="text-xs text-text-muted">{t('viewer.joints.hint')}</p>
      )}
    </div>
  );
}
