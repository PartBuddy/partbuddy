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
  // Sketch curves are graphic objects on the viewer background (1.4.11).
  { fg: '--cs-viewer-sketch', bg: '--cs-viewer-background', min: 3 },
  { fg: '--cs-viewer-sketch-constrained', bg: '--cs-viewer-background', min: 3 },
  { fg: '--cs-viewer-sketch-construction', bg: '--cs-viewer-background', min: 3 },
  { fg: '--cs-viewer-changed', bg: '--cs-viewer-background', min: 3 },
  // Edges outline the part on its faces (viewport CAD round); against the background the body sets the part apart.
  { fg: '--cs-viewer-edge', bg: '--cs-viewer-body', min: 3 },
  { fg: '--cs-viewer-misfit', bg: '--cs-viewer-bed', min: 3 },
];

/**
 * Brand colour pairs (docs/brand.md). Brand tokens are fixed across themes and live only in the
 * base block. The wordmark is text (4.5:1); the companion part of the mark is a graphic object
 * that identifies the logo (3:1, WCAG 2.2 1.4.11).
 */
export const brandContrastPairs = [
  { fg: '--cs-brand-ink', bg: '--cs-brand-paper', min: 4.5 },
  { fg: '--cs-brand-ink', bg: '--cs-color-canvas', min: 4.5 },
  { fg: '--cs-brand-accent', bg: '--cs-brand-paper', min: 3 },
  { fg: '--cs-brand-accent', bg: '--cs-color-canvas', min: 3 },
  { fg: '--cs-brand-paper', bg: '--cs-brand-ink', min: 4.5 },
  { fg: '--cs-brand-accent-on-ink', bg: '--cs-brand-ink', min: 3 },
];
