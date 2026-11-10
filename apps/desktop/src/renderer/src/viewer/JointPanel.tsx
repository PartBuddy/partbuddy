import { IconArrowsLeftRight, IconArrowsRight, IconListNumbers, IconPlayerPause, IconPlayerPlay, IconRepeat, IconVideo } from '@tabler/icons-react';
import type { PrintFinding } from '@partbuddy/geometry';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label, Slider, SliderOutput, ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import type { Joint } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';
import { Button, IconButton } from '../ui/Button';
import { segmentClass, segmentGroupClass, SliderBar } from '../ui/Choice';
import { recordView, type Recording } from './recording';
import { playRange, playStep, TRAVEL_SECONDS, type JointPreview } from './jointPose';

type JointValue = Joint['values'][number];
type PlayMode = 'bounce' | 'loop';
type PlayOrder = 'together' | 'inTurn';
type Blocked = Extract<PrintFinding, { kind: 'blocked' }>;
const NO_FINDINGS: PrintFinding[] = [];

const SPEEDS = [0.5, 1, 2];
/** A recording never runs longer than this (seconds): many joints one after the other at half speed would. */
const MAX_RECORDING = 30;
const segment = segmentClass('sm');
const keyOf = (joint: number, index: number) => `${String(joint)}-${String(index)}`;

/** The slider's ends: the joint's limits, and where a side has none a half turn or 100 mm, widened to hold the value. */
export function jointRange(value: JointValue): [number, number] {
  const open = value.unit === 'deg' ? 180 : 100;
  return [Math.min(value.limits?.[0] ?? -open, value.value), Math.max(value.limits?.[1] ?? open, value.value)];
}

/** A joint value that can play: the mirror gave its joint an axis, so its bodies move in the view. */
export function playableValues(joints: Joint[]): { key: string; joint: Joint; index: number; value: JointValue; range: [number, number] }[] {
  return joints.flatMap((joint) => (joint.axis && joint.origin ? joint.values.map((value, index) => ({ key: keyOf(joint.id, index), joint, index, value, range: jointRange(value) })) : []));
}

/**
 * Parts that move (ADR 0027): one slider per joint value, a button that plays the joint through its
 * range, and one that plays all of them. While they play or are dragged the joints' bodies follow in
 * the view only (G4); pausing or letting go drives the joints in SolidCraft, and the next revision
 * of the mirror shows where the parts stand and gives the sliders the values SolidCraft kept them
 * at. Closing the panel while joints play leaves them where the mirror has them.
 *
 * Where the check found parts in a joint's way (`blocked`, from `joint.sweep`), the playback stops:
 * the parts stand at the touch in the view, the panel says which parts meet, and nothing is driven.
 *
 * The video button records the view while the joints run once through their way and saves it as a
 * file (MP4, or WebM where the system records no MP4).
 *
 * All joints play together by default: the whole mechanism shows in the time one joint takes, however
 * many there are, and no order has to be made up. One after the other is the choice beside it.
 */
export function JointPanel({ joints, autoPlay = false }: { joints: Joint[]; autoPlay?: boolean }) {
  const { t, i18n } = useTranslation();
  const playable = useMemo(() => playableValues(joints), [joints]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The joint values that play, by key. */
  const [play, setPlay] = useState<string[] | null>(() => (autoPlay && playable.length > 0 ? playable.map((entry) => entry.key) : null));
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<PlayMode>('bounce');
  const [order, setOrder] = useState<PlayOrder>('together');
  const directions = useRef(new Map<string, 1 | -1>());
  /** One after the other: whose turn it is, and how often it has turned at an end. */
  const turn = useRef({ at: 0, turns: 0 });
  /** Joint values on their way to SolidCraft: their preview stays until the mirror shows them there. */
  const pending = useRef(new Set<string>());
  /** The touch the playback stopped at. */
  const [stopped, setStopped] = useState<Blocked | null>(null);
  const findings = useStudio((s) => s.printCheck?.result.findings ?? NO_FINDINGS);
  const requestFocus = useStudio((s) => s.requestFocus);
  // shortcut: a stop is matched to its joint by name and unit, which a joint with two values of one unit shares; give the finding the value's index when such joints get limits.
  const stops = useMemo(() => findings.filter((finding): finding is Blocked => finding.kind === 'blocked'), [findings]);
  /** The recording that runs, and what became of the last one: the file's name, or why there is none. */
  const recording = useRef<Recording | null>(null);
  const [recordingNow, setRecordingNow] = useState(false);
  const [video, setVideo] = useState<{ saved: string } | { failed: string } | null>(null);
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
  const playing = play !== null;
  const playingNow = useRef(playing);
  playingNow.current = playing;
  // The playback ended (paused, or parts touched): the recording ends with it and is saved. Closing the panel drops it.
  useEffect(() => {
    if (!playing) recording.current?.stop();
  }, [playing]);
  useEffect(
    () => () => {
      recording.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (playingNow.current) return;
    const kept = (useStudio.getState().jointPreview ?? []).filter((entry) => pending.current.has(keyOf(entry.joint, entry.index)));
    setPreview(kept.length > 0 ? kept : null);
    setStopped(null);
  }, [joints, setPreview]);

  useEffect(() => {
    if (!play) return;
    const targets = playable
      .filter((entry) => play.includes(entry.key))
      .map((entry) => ({ ...entry, full: entry.range[1] - entry.range[0], ...playRange(entry.range, entry.value.value, stops.filter((stop) => stop.joint === entry.joint.name && stop.unit === entry.value.unit)) }));
    if (targets.length === 0) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      const shown = useStudio.getState().jointPreview ?? [];
      const mine = order === 'inTurn' ? targets[turn.current.at % targets.length] : null;
      let hit: Blocked | undefined;
      setPreview(
        targets.map((target) => {
          const [min, max] = target.range;
          const from = shown.find((entry) => entry.joint === target.joint.id && entry.index === target.index)?.value ?? target.value.value;
          if (mine && target !== mine) return { joint: target.joint.id, index: target.index, value: from };
          // Towards the end that is further away first.
          const direction = directions.current.get(target.key) ?? (max - from >= from - min ? 1 : -1);
          // As fast as with nothing in the way: the speed is that of the joint's whole range, not of what the stop leaves of it.
          const step = playStep(from, direction, target.range, (seconds * speed * target.full) / TRAVEL_SECONDS, mode);
          directions.current.set(target.key, step.direction);
          // The end it reached is where parts touch: it stands there, and from there it can only go back.
          const touch = step.turned ? (direction === 1 ? target.high : target.low) : undefined;
          if (touch) {
            hit = touch;
            directions.current.set(target.key, direction === 1 ? -1 : 1);
            return { joint: target.joint.id, index: target.index, value: touch.at };
          }
          // There and back (or once through, starting over), then the next joint.
          if (mine && step.turned && (turn.current.turns += 1) >= (mode === 'bounce' ? 2 : 1)) turn.current = { at: turn.current.at + 1, turns: 0 };
          return { joint: target.joint.id, index: target.index, value: step.value };
        }),
      );
      if (hit) {
        setStopped(hit);
        setPlay(null);
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [play, playable, stops, speed, mode, order, setPreview]);

  const start = (keys: string[]) => {
    // From a touch the joints go on the way back; otherwise towards the end that is further away.
    if (!stopped) directions.current.clear();
    turn.current = { at: 0, turns: 0 };
    setStopped(null);
    setPlay(keys);
  };

  const drive = (moves: { joint: Joint; index: number; value: number }[]) => {
    setBusy(true);
    setError(null);
    pending.current = new Set(moves.map((move) => keyOf(move.joint.id, move.index)));
    void (async () => {
      try {
        for (const { joint, index, value } of moves) {
          await platform().design.driveJoint({ joint: joint.id, index, value, unit: joint.values[index]?.unit ?? 'deg', name: joint.name });
          pending.current.delete(keyOf(joint.id, index));
        }
      } catch (cause) {
        setError((cause as Error).message.slice(0, 200));
        setPreview(null);
      } finally {
        pending.current.clear();
        setBusy(false);
      }
    })();
  };

  /** Ends the playback and holds every joint where the view shows it: driven there, as a slider let go. */
  const hold = (taken?: JointPreview) => {
    setStopped(null);
    setPlay(null);
    const shown = [...(useStudio.getState().jointPreview ?? []).filter((entry) => !(taken && entry.joint === taken.joint && entry.index === taken.index)), ...(taken ? [taken] : [])];
    const moves = shown.flatMap((entry) => {
      const joint = joints.find((candidate) => candidate.id === entry.joint);
      const value = Math.round(entry.value * 10) / 10;
      return joint && joint.values[entry.index] && value !== joint.values[entry.index]?.value ? [{ joint, index: entry.index, value }] : [];
    });
    if (moves.length > 0) drive(moves);
    else setPreview(null);
  };

  /** Records the view while the joints that play (or all of them) run once through their way, then asks where to save it. */
  const record = (keys: string[]) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewport"] canvas');
    if (!canvas) return;
    const once = ((mode === 'bounce' ? 2 : 1) * TRAVEL_SECONDS) / speed;
    if (!play) start(keys);
    setVideo(null);
    setRecordingNow(true);
    const take = recordView(canvas, Math.min(MAX_RECORDING, once * (order === 'inTurn' ? keys.length : 1)) * 1000);
    recording.current = take;
    void take.done
      .then((taken) => (taken ? platform().design.saveVideo(taken) : null))
      .then(
        (result) => {
          if (result) setVideo({ saved: result.file });
        },
        (cause: unknown) => {
          setVideo({ failed: (cause as Error).message.slice(0, 200) });
        },
      )
      .finally(() => {
        recording.current = null;
        setRecordingNow(false);
      });
  };

  const away = joints.flatMap((joint) => joint.values.flatMap((value, index) => (Math.abs(value.value) > 1e-6 ? [{ joint, index, value: 0 }] : [])));
  const speedLabel = new Intl.NumberFormat(i18n.language);
  const all = playable.map((entry) => entry.key);
  const allPlaying = play !== null && play.length === all.length;

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
          const key = keyOf(joint.id, index);
          const shown = preview?.find((entry) => entry.joint === joint.id && entry.index === index)?.value ?? value.value;
          const plays = play?.includes(key) ?? false;
          const name = joint.values.length > 1 ? `${joint.name} ${String(index + 1)}` : joint.name;
          return (
            <Slider
              key={key}
              value={Math.min(max, Math.max(min, Math.round(shown / step) * step))}
              minValue={min}
              maxValue={max}
              step={step}
              isDisabled={busy}
              formatOptions={value.unit === 'deg' ? { style: 'unit', unit: 'degree', unitDisplay: 'narrow', maximumFractionDigits: 1 } : { style: 'unit', unit: 'millimeter', maximumFractionDigits: 1 }}
              onChange={(next) => {
                // Taking a slider ends the playback; the others stay where the view shows them. The bodies follow at once (G4).
                if (play) setPlay(null);
                setStopped(null);
                setPreview([...(useStudio.getState().jointPreview ?? []).filter((entry) => !(entry.joint === joint.id && entry.index === index)), { joint: joint.id, index, value: next }]);
              }}
              onChangeEnd={(next) => {
                // SolidCraft is driven when the slider is let go.
                hold({ joint: joint.id, index, value: next });
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
                    label={t(plays ? 'viewer.joints.pause' : 'viewer.joints.play', { name })}
                    isDisabled={busy || (play !== null && !plays)}
                    onPress={() => {
                      // Paused, the joints are held where they stand.
                      if (plays) hold();
                      else start([key]);
                    }}
                    data-testid="joint-play"
                    data-playing={String(plays)}
                  >
                    {plays ? <IconPlayerPause className="size-icon-sm" aria-hidden /> : <IconPlayerPlay className="size-icon-sm" aria-hidden />}
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
      {all.length > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            className="min-w-0 flex-1"
            isDisabled={busy || (play !== null && !allPlaying)}
            onPress={() => {
              if (allPlaying) hold();
              else start(all);
            }}
            data-testid="joint-play-all"
            data-playing={String(allPlaying)}
          >
            {allPlaying ? <IconPlayerPause className="size-icon-sm shrink-0" aria-hidden /> : <IconPlayerPlay className="size-icon-sm shrink-0" aria-hidden />}
            <span className="truncate">{t(allPlaying ? 'viewer.joints.pauseAll' : 'viewer.joints.playAll')}</span>
          </Button>
          <ToggleButtonGroup
            aria-label={t('viewer.joints.order')}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[order]}
            onSelectionChange={(keys) => {
              turn.current = { at: 0, turns: 0 };
              setOrder([...keys][0] === 'inTurn' ? 'inTurn' : 'together');
            }}
            className={segmentGroupClass}
          >
            <ToggleButton id="together" aria-label={t('viewer.joints.together')} className={segment} data-testid="joint-order-together">
              <IconArrowsRight className="size-icon-sm" aria-hidden />
            </ToggleButton>
            <ToggleButton id="inTurn" aria-label={t('viewer.joints.inTurn')} className={segment} data-testid="joint-order-in-turn">
              <IconListNumbers className="size-icon-sm" aria-hidden />
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
      ) : null}
      {all.length > 0 ? (
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
          <IconButton
            label={t(recordingNow ? 'viewer.joints.recording' : 'viewer.joints.record')}
            isDisabled={busy || recordingNow}
            onPress={() => {
              record(play ?? all);
            }}
            className={recordingNow ? 'text-danger' : ''}
            data-testid="joint-record"
            data-recording={String(recordingNow)}
          >
            <IconVideo className="size-icon-sm" aria-hidden />
          </IconButton>
        </div>
      ) : null}
      <Button
        size="sm"
        isDisabled={busy || (away.length === 0 && !preview)}
        onPress={() => {
          setPlay(null);
          setStopped(null);
          setPreview(null);
          if (away.length > 0) drive(away);
        }}
        data-testid="joint-reset"
      >
        {t('viewer.joints.reset')}
      </Button>
      {recordingNow ? (
        <p role="status" className="text-xs text-text-muted" data-testid="joint-recording">
          {t('viewer.joints.recording')}
        </p>
      ) : video ? (
        <p role={'failed' in video ? 'alert' : 'status'} className={`text-xs ${'failed' in video ? 'text-danger' : 'text-text-muted'}`} data-testid="joint-video">
          {'failed' in video ? t('viewer.joints.videoFailed', { reason: video.failed }) : t('actions.exported', { file: video.saved })}
        </p>
      ) : null}
      {stopped ? (
        <div role="status" className="flex flex-col items-start gap-1 text-xs text-warning" data-testid="joint-stopped">
          <p>
            {t('viewer.joints.stopped', {
              a: stopped.bodies[0],
              b: stopped.bodies[1],
              at: new Intl.NumberFormat(i18n.language, stopped.unit === 'deg' ? { style: 'unit', unit: 'degree', unitDisplay: 'narrow', maximumFractionDigits: 1 } : { style: 'unit', unit: 'millimeter', maximumFractionDigits: 1 }).format(stopped.at),
            })}
          </p>
          {stopped.box ? (
            <Button
              size="sm"
              variant="quiet"
              onPress={() => {
                if (stopped.box) requestFocus(stopped.box);
              }}
              data-testid="joint-stopped-show"
            >
              {t('viewer.joints.showTouch')}
            </Button>
          ) : null}
        </div>
      ) : null}
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
