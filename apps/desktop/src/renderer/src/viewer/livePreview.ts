import { useEffect, useEffectEvent, useRef } from 'react';

/** How long the first change of a burst waits, so quick typing is tried once, not per key. */
const GATHER_MS = 150;

/**
 * A preview that keeps up while something is dragged or typed (decided 2026-11-09): one request to
 * SolidCraft at a time, every answer shown as soon as it comes, and then the newest input tried
 * next; only the first change of a burst waits a moment to gather quick typing. A null input stops
 * it; an answer still on its way is then dropped.
 */
export function useLivePreview<Input, Result>(input: Input | null, run: (input: Input) => Promise<Result>, show: (input: Input, result: Result) => void): void {
  const runNow = useEffectEvent(run);
  const showNow = useEffectEvent(show);
  const state = useRef({ pending: null as Input | null, busy: false, round: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });

  useEffect(() => {
    const now = state.current;
    if (input === null) {
      now.pending = null;
      now.round += 1;
      clearTimeout(now.timer);
      now.timer = undefined;
      return;
    }
    now.pending = input;
    const pump = () => {
      const next = now.pending;
      if (next === null || now.busy) return;
      now.pending = null;
      now.busy = true;
      const round = now.round;
      runNow(next)
        .then((result) => {
          if (round === now.round) showNow(next, result);
        })
        .catch(() => undefined)
        .finally(() => {
          now.busy = false;
          pump();
        });
    };
    // Answers chain straight on while dragging; a fresh burst gathers first.
    if (!now.busy && now.timer === undefined) {
      now.timer = setTimeout(() => {
        now.timer = undefined;
        pump();
      }, GATHER_MS);
    }
  }, [input]);

  useEffect(
    () => () => {
      state.current.round += 1;
      state.current.pending = null;
      clearTimeout(state.current.timer);
    },
    [],
  );
}
