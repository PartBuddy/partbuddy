import { IconPlayerPause, IconPlayerPlay, IconPlayerTrackNext, IconPlayerTrackPrev } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button as AriaButton, Slider, SliderThumb, SliderTrack } from 'react-aria-components';

import type { PlayStep } from '../../../shared/assembly';
import { useStudio } from '../state/store';
import { activeStep } from './explode';

const tool =
  'inline-flex size-control-md items-center justify-center rounded-md text-text outline-none transition-colors hover:bg-surface-hover pressed:bg-surface-selected ' +
  'disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus';

/**
 * The assembly playback (ADR 0026): play and pause, a step back and forward, a timeline and the
 * steps by name; the camera follows the step that plays and its part stands out in the view.
 * Sub-assemblies play first, then go into the main assembly. Docked at the bottom in place of the
 * selection dock (nothing is picked while it plays).
 */
export function AssemblyPlayer({ steps, source }: { steps: PlayStep[]; source: 'assistant' | 'suggested' }) {
  const { t } = useTranslation();
  const playback = useStudio((s) => s.playback);
  const setPlayback = useStudio((s) => s.setPlayback);
  if (!playback) return null;
  const count = steps.length;
  const current = activeStep(playback.position, count);
  // Where a step is done: a step back or forward lands on the end of a step.
  const done = Math.floor(playback.position + 1e-6);
  const go = (position: number) => {
    setPlayback({ position: Math.min(count, Math.max(0, position)), playing: false });
  };
  return (
    <div
      role="group"
      aria-label={t('assembly.title')}
      className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex w-dialog-sm max-w-[calc(100%_-_1.5rem)] -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-2"
      data-view-overlay
      data-testid="assembly-panel"
      data-step={current}
      data-position={playback.position.toFixed(2)}
    >
      <div className="flex items-center gap-1">
        <AriaButton aria-label={t('assembly.previous')} className={tool} isDisabled={playback.position <= 0} onPress={() => { go(done - (playback.position - done < 1e-6 ? 1 : 0)); }} data-testid="assembly-prev">
          <IconPlayerTrackPrev className="size-icon-sm" aria-hidden />
        </AriaButton>
        <AriaButton
          aria-label={playback.playing ? t('assembly.pause') : t('assembly.play')}
          className={tool}
          onPress={() => {
            // At the end, play starts over.
            setPlayback({ position: playback.position >= count ? 0 : playback.position, playing: !playback.playing });
          }}
          data-testid="assembly-play"
          data-playing={String(playback.playing)}
        >
          {playback.playing ? <IconPlayerPause className="size-icon-sm" aria-hidden /> : <IconPlayerPlay className="size-icon-sm" aria-hidden />}
        </AriaButton>
        <AriaButton aria-label={t('assembly.next')} className={tool} isDisabled={playback.position >= count} onPress={() => { go(done + 1); }} data-testid="assembly-next">
          <IconPlayerTrackNext className="size-icon-sm" aria-hidden />
        </AriaButton>
        <Slider
          aria-label={t('assembly.timeline')}
          value={Math.round(playback.position * 100)}
          minValue={0}
          maxValue={count * 100}
          onChange={(value) => {
            go(value / 100);
          }}
          className="mx-2 flex-1"
          data-testid="assembly-timeline"
        >
          <SliderTrack className="relative h-4 w-full">
            {({ state }) => (
              <>
                <span aria-hidden className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-surface-sunken" />
                <span aria-hidden className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent" style={{ width: `${String(state.getThumbPercent(0) * 100)}%` }} />
                <SliderThumb className="top-1/2 size-3 rounded-full border-2 border-accent bg-surface shadow-1 outline-none dragging:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-focus" />
              </>
            )}
          </SliderTrack>
        </Slider>
        <span className="shrink-0 text-xs tabular-nums text-text-muted" data-testid="assembly-count">
          {t('assembly.stepOf', { step: Math.max(1, current + 1), steps: count })}
        </span>
      </div>
      <ol className="flex max-h-40 flex-col overflow-y-auto" aria-label={t('assembly.steps')}>
        {steps.map((step, k) => (
          <li key={`${step.name}-${String(k)}`}>
            <button
              type="button"
              onClick={() => {
                go(k + 1);
              }}
              aria-current={k === current ? 'step' : undefined}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus ${k === current ? 'bg-accent-subtle text-accent-text' : k < done ? 'text-text' : 'text-text-muted'}`}
              data-testid="assembly-step"
              data-active={String(k === current)}
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-text-subtle">{k + 1}</span>
              <span className="min-w-0 flex-1 truncate">{step.name}</span>
              {step.group ? <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-xs text-text-muted">{step.group}</span> : null}
            </button>
          </li>
        ))}
      </ol>
      <p className="px-1 text-xs text-text-subtle" data-testid="assembly-source" data-source={source}>
        {t(source === 'assistant' ? 'assembly.fromAssistant' : 'assembly.suggested')}
      </p>
    </div>
  );
}
