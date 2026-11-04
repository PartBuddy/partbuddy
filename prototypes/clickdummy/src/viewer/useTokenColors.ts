import { useEffect, useState } from 'react';
import { Color } from 'three';

import { useStudio } from '../state/store';

const names = {
  background: '--cs-viewer-background',
  grid: '--cs-viewer-grid',
  body: '--cs-viewer-body',
  edge: '--cs-viewer-edge',
  hover: '--cs-viewer-hover',
  selection: '--cs-viewer-selection',
  note: '--cs-viewer-note',
  feature: '--cs-color-accent-subtle',
  cube: '--cs-color-surface-raised',
  cubeText: '--cs-color-text-muted',
  cubeStroke: '--cs-color-border-strong',
} as const;

export type ViewerColors = Record<keyof typeof names, Color>;

function read(): ViewerColors {
  const style = getComputedStyle(document.documentElement);
  const entries = Object.entries(names).map(([key, variable]) => [
    key,
    new Color(style.getPropertyValue(variable).trim()),
  ]);
  return Object.fromEntries(entries) as ViewerColors;
}

/** Viewer colours come from the design tokens and follow theme changes. */
export function useTokenColors(): ViewerColors {
  const theme = useStudio((s) => s.theme);
  const [colors, setColors] = useState<ViewerColors>(read);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setColors(read());
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [theme]);
  return colors;
}
