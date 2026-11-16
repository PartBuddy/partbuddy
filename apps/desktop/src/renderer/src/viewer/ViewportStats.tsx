import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** What the probe in the canvas measured; the overlay beside the canvas reads it (like the view cube's link). */
const measured = { times: [] as number[], frameMs: 0, calls: 0, triangles: 0, started: 0 };

/**
 * Inside the canvas while the counters show (issue #484): times each frame from the first callback
 * to after the last scene is drawn, and sums draw calls and triangles of all its renders (the view,
 * the cube and the triad). three's counters reset per render, so they are summed by hand meanwhile.
 */
export function StatsProbe() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    // Read from the store inside the effect: the renderer is three.js state, not React state.
    const { info } = get().gl;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
    };
  }, [get]);
  useFrame(({ gl }) => {
    gl.info.reset();
    measured.started = performance.now();
  }, -1000);
  // After the recording tap (2), so every render of the frame is counted.
  useFrame(({ gl }) => {
    const now = performance.now();
    measured.frameMs = now - measured.started;
    measured.calls = gl.info.render.calls;
    measured.triangles = gl.info.render.triangles;
    measured.times.push(now);
    while (measured.times.length > 0 && (measured.times[0] ?? now) < now - 1000) measured.times.shift();
  }, 3);
  return null;
}

/** Frames per second (drawn in the last second: 0 while the view rests), frame time, draw calls and triangles. */
export function StatsOverlay() {
  const { t, i18n } = useTranslation();
  const [shown, setShown] = useState({ fps: 0, frameMs: 0, calls: 0, triangles: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      setShown({ fps: measured.times.filter((time) => time >= now - 1000).length, frameMs: measured.frameMs, calls: measured.calls, triangles: measured.triangles });
    }, 500);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const { fps } = shown;
  const number = new Intl.NumberFormat(i18n.language);
  const rows: [string, string][] = [
    [t('viewer.stats.fps'), number.format(fps)],
    [t('viewer.stats.frame'), `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(shown.frameMs)} ms`],
    [t('viewer.stats.calls'), number.format(shown.calls)],
    [t('viewer.stats.triangles'), number.format(shown.triangles)],
  ];
  return (
    <dl
      className="pointer-events-none absolute bottom-3 right-3 z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-md bg-surface-raised/90 px-2 py-1 text-xs text-text-muted tabular-nums shadow-2"
      data-testid="viewport-stats"
      data-fps={fps}
      data-view-overlay
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className="text-right text-text">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
