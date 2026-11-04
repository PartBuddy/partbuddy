import { useEffect, useState } from 'react';
import { Color } from 'three';


const names = {
  background: '--cs-viewer-background',
  grid: '--cs-viewer-grid',
  body: '--cs-viewer-body',
  edge: '--cs-viewer-edge',
  hover: '--cs-viewer-hover',
  selection: '--cs-viewer-selection',
  note: '--cs-viewer-note',
  // Faces the latest step added or changed (#14).
  changed: '--cs-viewer-changed',
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
/** Viewer colours come from the design tokens and follow the system theme. */
export function useTokenColors(): ViewerColors {
  const [colors, setColors] = useState<ViewerColors>(read);
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      requestAnimationFrame(() => {
        setColors(read());
      });
    };
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);
  return colors;
}
