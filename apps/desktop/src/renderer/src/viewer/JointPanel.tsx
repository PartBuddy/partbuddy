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
import { Tip } from '../ui/Tooltip';
import { canRecord, recordView, type Recording, type RecordingFault } from './recording';
import { playRange, playStep, TRAVEL_SECONDS, type JointPreview } from './jointPose';

type JointValue = Joint['values'][number];
type PlayMode = 'bounce' | 'loop';
type PlayOrder = 'together' | 'inTurn';
type Blocked = Extract<PrintFinding, { kind: 'blocked' }>;

const SPEEDS = [0.5, 1, 2];
/** A recording never runs longer than this (seconds): many joints one after the other at half speed would. */
const MAX_RECORDING = 30;
const FAULTS: RecordingFault[] = ['unsupported', 'empty', 'failed'];
const segment = segmentClass('sm');
const keyOf = (joint: number, index: number) => `${String(joint)}-${String(index)}`;
const stepOf = (value: JointValue) => (value.unit === 'deg' ? 1 : 0.5);
const formatOf = (unit: JointValue['unit']): Intl.NumberFormatOptions =>
  unit === 'deg' ? { style: 'unit', unit: 'degree', unitDisplay: 'narrow', maximumFractionDigits: 1 } : { style: 'unit', unit: 'millimeter', maximumFractionDigits: 1 };

/** The slider's ends: the joint's limits, and where a side has none a half turn or 100 mm, widened to hold the value. */
export function jointRange(value: JointValue): [number, number] {
  const open = value.unit === 'deg' ? 180 : 100;
  return [Math.min(value.limits?.[0] ?? -open, value.value), Math.max(value.limits?.[1] ?? open, value.value)];
}

/** A joint value that can play: the mirror gave its joint an axis, so its bodies move in the view, and it has a way to go. */
export function playableValues(joints: Joint[]): { key: string; joint: Joint; index: number; value: JointValue; range: [number, number] }[] {
  return joints.flatMap((joint) =>
    joint.axis && joint.origin ? joint.values.map((value, index) => ({ key: keyOf(joint.id, index), joint, index, value, range: jointRange(value) })).filter((entry) => entry.range[1] > entry.range[0]) : [],
  );
}

/**
 * Parts that move (ADR 0027): one slider per joint value, a button that plays the joint through its
 * range, and one that plays all of them.
 *
 * Playing is for looking: the joints' bodies move in the view only, paused they stay where the view
 * shows them, and the design is as it was. "Keep this position" drives the joints there in
 * SolidCraft, as letting go of a slider does; "As designed" puts everything back. Closing the panel
 * leaves the joints where the mirror has them.
 *
 * Several joints play one after the other by default: each goes there and back while the others
 * stand, which is the way the check ran them (`joint.sweep` moves one joint at a time). So where the
 * check found parts in a joint's way (`blocked`), the playback stops and says which parts meet.
 * Played together, the whole mechanism moves at once, but what touches then is not checked, and the
 * panel says so.
 */
export function JointPanel({ joints }: { joints: Joint[] }) {
  const { t, i18n } = useTranslation();
  const playable = useMemo(() => playableValues(joints), [joints]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const play = useStudio((s) => s.jointPlay);
  const setPlay = useStudio((s) => s.setJointPlay);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState<PlayMode>('bounce');
  const [order, setOrder] = useState<PlayOrder>('inTurn');
  const directions = useRef(new Map<string, 1 | -1>());
  /** One after the other: whose turn it is, and how often it has reached an end. */
  const turn = useRef({ at: 0, ends: 0 });
  /** Joint values on their way to SolidCraft: their preview stays until the mirror shows them there. */
  const pending = useRef(new Set<string>());
  /** The recording that runs, and what became of the last one. */
  const recording = useRef<Recording | null>(null);
  const [video, setVideo] = useState<{ state: 'recording' | 'saving' | 'cancelled' } | { state: 'saved'; file: string } | { state: 'failed'; fault: RecordingFault } | null>(null);
  /** The touch the playback stopped at. */
  const [stopped, setStopped] = useState<Blocked | null>(null);
  const check = useStudio((s) => s.printCheck);
  const requestFocus = useStudio((s) => s.requestFocus);
  // While SolidCraft still measures the joints' ways for a new revision, the stops of the last one hold: a
  // playback started in between would run through the parts.
  const measured = useRef<Blocked[]>([]);
  // shortcut: a stop is matched to its joint by name and unit, which two joints of one name or a joint with two values of one unit share; give the finding the joint's id and the value's index when that comes up.
  const stops = useMemo(() => {
    if (check && !check.measuring) measured.current = check.result.findings.filter((finding): finding is Blocked => finding.kind === 'blocked');
    return measured.current;
  }, [check]);
  const preview = useStudio((s) => s.jointPreview);
  const setPreview = useStudio((s) => s.setJointPreview);
  // Closing the panel ends the playback and drops a recording; the bodies go back to where the mirror has them.
  useEffect(
    () => () => {
      recording.current?.cancel();
      setPlay(null);
      setPreview(null);
    },
    [setPlay, setPreview],
  );
  // The playback ended (paused, or parts touched): the recording ends with it and is saved.
  const playing = play !== null;
  useEffect(() => {
    if (!playing) recording.current?.stop();
  }, [playing]);
  // A new state of the mirror (moved by the assistant, or driven from here) is where the sliders stand.
  useEffect(() => {
    if (useStudio.getState().jointPlay) return;
    const kept = (useStudio.getState().jointPreview ?? []).filter((entry) => pending.current.has(keyOf(entry.joint, entry.index)));
    setPreview(kept.length > 0 ? kept : null);
    setStopped(null);
  }, [joints, setPreview]);

  useEffect(() => {
    if (!play) return;
    // Stops are those of a joint moved alone: they hold while one joint moves at a time.
    const alone = play.length === 1 || order === 'inTurn';
    const targets = playable
      .filter((entry) => play.includes(entry.key))
      .map((entry) => ({ ...entry, full: entry.range[1] - entry.range[0], ...playRange(entry.range, entry.value.value, alone ? stops.filter((stop) => stop.joint === entry.joint.name && stop.unit === entry.value.unit) : []) }));
    // The joints that played are gone (the assistant rebuilt them): nothing plays.
    if (targets.length === 0) {
      setPlay(null);
      return;
    }
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      const shown = useStudio.getState().jointPreview ?? [];
      const mine = order === 'inTurn' ? targets[turn.current.at % targets.length] : null;
      let hit: Blocked | undefined;
      const next = targets.map((target) => {
        const [min, max] = target.range;
        const from = shown.find((entry) => entry.joint === target.joint.id && entry.index === target.index)?.value ?? target.value.value;
        if (mine && target !== mine) return { joint: target.joint.id, index: target.index, value: from };
        // A way of nothing: the parts touch where the joint stands.
        if (!(max > min)) {
          hit = target.high ?? target.low;
          return { joint: target.joint.id, index: target.index, value: from };
        }
        // Towards the end that is further away first; as fast as with nothing in the way (the speed is that of the whole range).
        const step = playStep(from, directions.current.get(target.key) ?? (max - from >= from - min ? 1 : -1), target.range, (seconds * speed * target.full) / TRAVEL_SECONDS, mode);
        directions.current.set(target.key, step.direction);
        // The end it reached is where parts touch: it stands there.
        if (step.turned) hit = (step.direction === 1 ? target.high : target.low) ?? hit;
        // There and back (or once through), then the next joint, and this one waits where it started.
        // A touch counts as an end reached: played on, the joint goes back and the next one follows.
        if (mine && step.turned) turn.current.ends += 1;
        if (mine && step.turned && !hit && turn.current.ends >= (mode === 'bounce' ? 2 : 1)) {
          turn.current = { at: turn.current.at + 1, ends: 0 };
          if (mode === 'loop') return { joint: target.joint.id, index: target.index, value: step.direction === 1 ? min : max };
        }
        return { joint: target.joint.id, index: target.index, value: step.value };
      });
      setPreview(next);
      if (hit) {
        setStopped(hit);
        setPlay(null);
        return;
      }
      setStopped(null);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [play, playable, stops, speed, mode, order, setPlay, setPreview]);

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
        // The mirror may have shown the new values before the last answer came: what was driven is no preview any more.
        if (!useStudio.getState().jointPlay) {
          const left = (useStudio.getState().jointPreview ?? []).filter((entry) => !moves.some((move) => move.joint.id === entry.joint && move.index === entry.index));
          setPreview(left.length > 0 ? left : null);
        }
      }
    })();
  };

  /** What the view shows away from the mirror, to the tenth the panel reads it at: what is kept is what was read. */
  const shownAway = (taken?: JointPreview) =>
    [...(preview ?? []).filter((entry) => !(taken && entry.joint === taken.joint && entry.index === taken.index)), ...(taken ? [taken] : [])].flatMap((entry) => {
      const joint = joints.find((candidate) => candidate.id === entry.joint);
      const current = joint?.values[entry.index];
      if (!joint || !current) return [];
      const value = Math.round(entry.value * 10) / 10;
      return value !== current.value ? [{ joint, index: entry.index, value }] : [];
    });

  /** Keeps the joints where the view shows them: driven there in SolidCraft. */
  const keep = (taken?: JointPreview) => {
    setPlay(null);
    setStopped(null);
    const moves = shownAway(taken);
    if (moves.length > 0) drive(moves);
    else setPreview(null);
  };

  /** Records the view while the joints that play (or all of them) run once through their way, then asks where to save it. */
  const record = (keys: string[]) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="viewport"] canvas');
    if (!canvas || !canRecord()) {
      setVideo({ state: 'failed', fault: 'unsupported' });
      return;
    }
    // One whole round from wherever the joints stand: there and back, or once through.
    const once = ((mode === 'bounce' ? 2 : 1) * TRAVEL_SECONDS) / speed;
    if (!play) setPlay(keys);
    setVideo({ state: 'recording' });
    const take = recordView(canvas, Math.min(MAX_RECORDING, once * (order === 'inTurn' ? keys.length : 1)) * 1000);
    recording.current = take;
    void take.done
      .then((taken) => {
        recording.current = null;
        if (!taken) return undefined;
        setVideo({ state: 'saving' });
        return platform().design.saveVideo(taken);
      })
      .then(
        (result) => {
          // undefined: the panel closed and dropped the recording; null: the user closed the save dialog.
          if (result !== undefined) setVideo(result ? { state: 'saved', file: result.file } : { state: 'cancelled' });
        },
        (cause: unknown) => {
          recording.current = null;
          const fault = (cause as Error).message as RecordingFault;
          console.warn(`recording: no video saved (${(cause as Error).message})`);
          setVideo({ state: 'failed', fault: FAULTS.includes(fault) ? fault : 'failed' });
        },
      );
  };

  const away = joints.flatMap((joint) => joint.values.flatMap((value, index) => (Math.abs(value.value) > 1e-6 ? [{ joint, index, value: 0 }] : [])));
  const number = new Intl.NumberFormat(i18n.language);
  const all = playable.map((entry) => entry.key);
  const allPlaying = play !== null && all.every((key) => play.includes(key));
  const recordingNow = video?.state === 'recording' || video?.state === 'saving';
  // Shown in the view only, and not on its way to SolidCraft: the user says what becomes of it.
  const inViewOnly = !playing && !busy && shownAway().length > 0;

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
          const step = stepOf(value);
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
              formatOptions={formatOf(value.unit)}
              onChange={(next) => {
                // Taking a slider ends the playback; the others stay where the view shows them. The bodies follow at once (G4).
                if (play) setPlay(null);
                setStopped(null);
                setPreview([...(useStudio.getState().jointPreview ?? []).filter((entry) => !(entry.joint === joint.id && entry.index === index)), { joint: joint.id, index, value: next }]);
              }}
              onChangeEnd={(next) => {
                // Letting go keeps the position: SolidCraft is driven.
                keep({ joint: joint.id, index, value: next });
              }}
              className="w-full"
              data-testid="joint-value"
              data-shown={shown.toFixed(2)}
            >
              <div className="flex justify-between gap-2 text-xs text-text-muted">
                <Label className="truncate">{name}</Label>
                {/* Standing still in the view it reads to a tenth, as the touch is named; running, in the slider's steps. */}
                <SliderOutput className="tabular-nums">{({ state }) => (plays ? state.getThumbValueLabel(0) : new Intl.NumberFormat(i18n.language, formatOf(value.unit)).format(Math.round(shown * 10) / 10))}</SliderOutput>
              </div>
              <div className="flex items-center gap-1">
                {/* Without an axis from the mirror nothing would move in the view: no playback then. */}
                {all.includes(key) ? (
                  <IconButton
                    label={t(plays ? 'viewer.joints.pause' : 'viewer.joints.play', { name })}
                    isDisabled={busy || (play !== null && !plays)}
                    onPress={() => {
                      setPlay(plays ? null : [key]);
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
              setPlay(allPlaying ? null : all);
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
              turn.current = { at: 0, ends: 0 };
              setOrder([...keys][0] === 'together' ? 'together' : 'inTurn');
            }}
            className={segmentGroupClass}
          >
            <Tip label={t('viewer.joints.inTurn')}>
              <ToggleButton id="inTurn" aria-label={t('viewer.joints.inTurn')} className={segment} data-testid="joint-order-in-turn">
                <IconListNumbers className="size-icon-sm" aria-hidden />
              </ToggleButton>
            </Tip>
            <Tip label={t('viewer.joints.together')}>
              <ToggleButton id="together" aria-label={t('viewer.joints.together')} className={segment} data-testid="joint-order-together">
                <IconArrowsRight className="size-icon-sm" aria-hidden />
              </ToggleButton>
            </Tip>
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
                {`${number.format(factor)}×`}
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
            <Tip label={t('viewer.joints.bounce')}>
              <ToggleButton id="bounce" aria-label={t('viewer.joints.bounce')} className={segment} data-testid="joint-mode-bounce">
                <IconArrowsLeftRight className="size-icon-sm" aria-hidden />
              </ToggleButton>
            </Tip>
            <Tip label={t('viewer.joints.loop')}>
              <ToggleButton id="loop" aria-label={t('viewer.joints.loop')} className={segment} data-testid="joint-mode-loop">
                <IconRepeat className="size-icon-sm" aria-hidden />
              </ToggleButton>
            </Tip>
          </ToggleButtonGroup>
          <IconButton
            label={t('viewer.joints.record')}
            isDisabled={busy || recordingNow}
            onPress={() => {
              record(play ?? all);
            }}
            className={video?.state === 'recording' ? 'text-danger' : ''}
            data-testid="joint-record"
            data-recording={String(video?.state === 'recording')}
          >
            <IconVideo className="size-icon-sm" aria-hidden />
          </IconButton>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {inViewOnly ? (
          <Button
            size="sm"
            onPress={() => {
              keep();
            }}
            data-testid="joint-keep"
          >
            <span className="truncate">{t('viewer.joints.keep')}</span>
          </Button>
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
          <span className="truncate">{t('viewer.joints.reset')}</span>
        </Button>
      </div>
      {/* One live region that stays, so a screen reader hears what comes into it. */}
      <div role="status" className="flex flex-col items-start gap-1 text-xs text-text-muted empty:hidden" data-testid="joint-status">
        {stopped ? (
          <p className="text-warning" data-testid="joint-stopped">
            {t('viewer.joints.stopped', { a: stopped.bodies[0], b: stopped.bodies[1], at: new Intl.NumberFormat(i18n.language, formatOf(stopped.unit)).format(stopped.at) })}
          </p>
        ) : null}
        {stopped?.box ? (
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
        {playing && play.length > 1 && order === 'together' ? <p data-testid="joint-unchecked">{t('viewer.joints.unchecked')}</p> : null}
        {inViewOnly ? <p data-testid="joint-view-only">{t('viewer.joints.viewOnly')}</p> : null}
        {video ? (
          <p className={video.state === 'failed' ? 'text-danger' : ''} data-testid="joint-video" data-state={video.state}>
            {video.state === 'saved' ? t('actions.exported', { file: video.file }) : video.state === 'failed' ? t(`viewer.joints.video.${video.fault}`) : t(`viewer.joints.video.${video.state}`)}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger" data-testid="joint-error">
          {t('viewer.joints.failed', { reason: error })}
        </p>
      ) : inViewOnly || stopped ? null : (
        <p className="text-xs text-text-muted">{t('viewer.joints.hint')}</p>
      )}
    </div>
  );
}
