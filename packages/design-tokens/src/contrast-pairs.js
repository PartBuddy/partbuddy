/**
 * Foreground/background token pairs that carry text or essential UI and the WCAG 2.2 minimum
 * contrast they must meet (1.4.3 text: 4.5:1; 1.4.11 non-text: 3:1).
 */
export const contrastPairs = [
  { fg: '--cs-color-text', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-text', bg: '--cs-color-canvas', min: 4.5 },
  { fg: '--cs-color-text', bg: '--cs-color-surface-sunken', min: 4.5 },
  { fg: '--cs-color-text', bg: '--cs-color-surface-raised', min: 4.5 },
  { fg: '--cs-color-text', bg: '--cs-color-surface-selected', min: 4.5 },
  { fg: '--cs-color-text', bg: '--cs-color-surface-hover', min: 4.5 },
  { fg: '--cs-color-text-muted', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-text-muted', bg: '--cs-color-surface-sunken', min: 4.5 },
  { fg: '--cs-color-text-muted', bg: '--cs-color-canvas', min: 4.5 },
  { fg: '--cs-color-text-subtle', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-text-on-accent', bg: '--cs-color-accent', min: 4.5 },
  { fg: '--cs-color-text-on-accent', bg: '--cs-color-accent-hover', min: 4.5 },
  { fg: '--cs-color-accent-text', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-accent-text', bg: '--cs-color-accent-subtle', min: 4.5 },
  { fg: '--cs-color-accent-text', bg: '--cs-color-surface-raised', min: 4.5 },
  { fg: '--cs-color-accent', bg: '--cs-color-surface', min: 3 },
  { fg: '--cs-color-success', bg: '--cs-color-success-subtle', min: 4.5 },
  { fg: '--cs-color-warning', bg: '--cs-color-warning-subtle', min: 4.5 },
  { fg: '--cs-color-danger', bg: '--cs-color-danger-subtle', min: 4.5 },
  { fg: '--cs-color-info', bg: '--cs-color-info-subtle', min: 4.5 },
  { fg: '--cs-color-success', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-warning', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-danger', bg: '--cs-color-surface', min: 4.5 },
  { fg: '--cs-color-focus', bg: '--cs-color-surface', min: 3 },
  { fg: '--cs-color-border-strong', bg: '--cs-color-surface', min: 3 },
];
