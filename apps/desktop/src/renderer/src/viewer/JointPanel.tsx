import { IconArrowsLeftRight, IconPlayerPause, IconPlayerPlay, IconRepeat } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label, Slider, SliderOutput, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import type { Joint } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button, IconButton } from '../ui/Button';
import { segmentClass, segmentGroupClass, SliderBar } from '../ui/Choice';
import { playStep, TRAVEL_SECONDS } from './jointPose';

type JointValue = Joint['values'][number];
type PlayMode = 'bounce' | 'loop';

const SPEEDS = [0.5, 1, 2];
const segment = segmentClass('sm');

/** The slider's ends: the joint's limits, and where a side has none a half turn or 100 mm, widened to hold the value. */
export function jointRange(value: JointValue): [number, number] {
  const open = value.unit === 'deg' ? 180 : 100;
  return [Math.min(value.limits?.[0] ?? -open, value.value), Math.max(value.limits?.[1] ?? open, value.value)];
}

/**
 * Parts that move (ADR 0027): one slider per joint value, and a button that plays the joint through
 * its range. While it plays or is dragged the joint's bodies follow in the view only (G4); pausing or
 * letting go drives the joint in SolidCraft, and the next revision of the mirror shows where the
 * parts stand and gives the slider the value SolidCraft kept it at. Closing the panel while a joint
 * plays leaves it where the mirror has it.
 */
export function JointPanel({ joints }: { joints: Joint[] }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [play, setPlay] = useState<{ joint: number; index: number } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<PlayMode>('bounce');
  const direction = useRef<1 | -1>(1);
  const preview = useStudio((s) => s.jointPreview);
  const setPreview = useStudio((s) => s.setJointPreview);
  // The bodies go back to where the mirror has them when the panel closes.
  useEffect(
    () => () => {
      setPreview(null);
    },
    [setPreview],
  );
  // A new state of the mirror (clamped by SolidCraft, or moved by the assistant) is where the sliders stand.
  useEffect(() => {
    if (!play) setPreview(null);
    // Only a new mirror clears the preview, not the end of a playback: that one is driven first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joints, setPreview]);

  useEffect(() => {
    if (!play) return;
    const value = joints.find((joint) => joint.id === play.joint)?.values[play.index];
    if (!value) return;
    const range = jointRange(value);
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      const shown = useStudio.getState().jointPreview;
      const from = shown?.joint === play.joint && shown.index === play.index ? shown.value : value.value;
      const step = playStep(from, direction.current, range, (seconds * speed * (range[1] - range[0])) / TRAVEL_SECONDS, mode);
      direction.current = step.direction;
      setPreview({ joint: play.joint, index: play.index, value: step.value });
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [play, joints, speed, mode, setPreview]);

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

  const shownOf = (joint: Joint, index: number, value: JointValue) => (preview?.joint === joint.id && preview.index === index ? preview.value : value.value);
  const away = joints.flatMap((joint) => joint.values.flatMap((value, index) => (Math.abs(value.value) > 1e-6 ? [{ joint, index, value: 0 }] : [])));
  const speedLabel = new Intl.NumberFormat(i18n.language);

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
          const step = value.unit === 'deg' ? 1 : 0.5;
          const shown = shownOf(joint, index, value);
          const playing = play?.joint === joint.id && play.index === index;
          const name = joint.values.length > 1 ? `${joint.name} ${String(index + 1)}` : joint.name;
          return (
            <Slider
              key={`${String(joint.id)}-${String(index)}`}
              value={Math.min(max, Math.max(min, Math.round(shown / step) * step))}
              minValue={min}
              maxValue={max}
              step={step}
              isDisabled={busy}
              formatOptions={value.unit === 'deg' ? { style: 'unit', unit: 'degree', unitDisplay: 'narrow', maximumFractionDigits: 1 } : { style: 'unit', unit: 'millimeter', maximumFractionDigits: 1 }}
              onChange={(next) => {
                // Taking the slider takes the joint from the playback. The bodies follow in the view at once (G4).
                if (playing) setPlay(null);
                setPreview({ joint: joint.id, index, value: next });
              }}
              onChangeEnd={(next) => {
                // SolidCraft is driven when the slider is let go.
                if (next !== value.value) drive([{ joint, index, value: next }]);
                else setPreview(null);
              }}
              className="w-full"
              data-testid="joint-value"
              data-shown={shown.toFixed(2)}
            >
              <div className="flex justify-between gap-2 text-xs text-text-muted">
                <Label className="truncate">{name}</Label>
                <SliderOutput className="tabular-nums" />
              </div>
              <div className="flex items-center gap-1">
                {/* Without an axis from the mirror nothing would move in the view: no playback then. */}
                {joint.axis && joint.origin ? (
                  <IconButton
                    label={t(playing ? 'viewer.joints.pause' : 'viewer.joints.play', { name })}
                    // One joint plays at a time.
                    isDisabled={busy || (play !== null && !playing)}
                    onPress={() => {
                      if (playing) {
                        // Paused, the joint is held where it stands: driven there like a slider let go.
                        setPlay(null);
                        const held = Math.round(shown * 10) / 10;
                        if (held !== value.value) drive([{ joint, index, value: held }]);
                        else setPreview(null);
                        return;
                      }
                      // Towards the end that is further away first.
                      direction.current = max - shown >= shown - min ? 1 : -1;
                      setPlay({ joint: joint.id, index });
                    }}
                    data-testid="joint-play"
                    data-playing={String(playing)}
                  >
                    {playing ? <IconPlayerPause className="size-icon-sm" aria-hidden /> : <IconPlayerPlay className="size-icon-sm" aria-hidden />}
                  </IconButton>
                ) : null}
                <div className="min-w-0 flex-1">
                  <SliderBar />
                </div>
              </div>
            </Slider>
          );
        }),
      )}
      {joints.some((joint) => joint.axis && joint.origin) ? (
        <div className="flex items-center justify-between gap-2">
          <ToggleButtonGroup
            aria-label={t('viewer.joints.speed')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[String(speed)]}
            onSelectionChange={(keys) => {
              setSpeed(Number([...keys][0] ?? 1));
            }}
            className={segmentGroupClass}
          >
            {SPEEDS.map((factor) => (
              <ToggleButton key={factor} id={String(factor)} className={`${segment} tabular-nums`} data-testid="joint-speed">
                {`${speedLabel.format(factor)}×`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <ToggleButtonGroup
            aria-label={t('viewer.joints.mode')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[mode]}
            onSelectionChange={(keys) => {
              setMode([...keys][0] === 'loop' ? 'loop' : 'bounce');
            }}
            className={segmentGroupClass}
          >
            <ToggleButton id="bounce" aria-label={t('viewer.joints.bounce')} className={segment} data-testid="joint-mode-bounce">
              <IconArrowsLeftRight className="size-icon-sm" aria-hidden />
            </ToggleButton>
            <ToggleButton id="loop" aria-label={t('viewer.joints.loop')} className={segment} data-testid="joint-mode-loop">
              <IconRepeat className="size-icon-sm" aria-hidden />
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
      ) : null}
      <Button
        size="sm"
        isDisabled={busy || away.length === 0}
        onPress={() => {
          setPlay(null);
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
