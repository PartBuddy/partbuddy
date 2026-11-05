/**
 * Screen layout of the dimension labels (UI upgrade step 10): each label sits centred on its
 * anchor unless an earlier one is there; then it moves by its own height or width to the first
 * free place nearby. A label that finds none, or whose anchor is off the view, is hidden instead
 * of covering another; no label covers the bars and panels on the view either. Pure, in CSS
 * pixels; the caller orders the labels by importance.
 */

export interface LabelBox {
  id: string;
  /** Projected anchor, the label's centre when nothing is in the way. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  dx: number;
  dy: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GAP = 3;

/** Shifts tried in order, in label heights (dy) and label widths (dx). */
const SHIFTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [0, -2],
  [0, 2],
];

const overlaps = (a: Rect, b: Rect) => a.left < b.right + GAP && b.left < a.right + GAP && a.top < b.bottom + GAP && b.top < a.bottom + GAP;

/** `blocked`: areas the view's own bars and panels take, which no label may cover. */
export function layoutLabels(labels: readonly LabelBox[], view: { width: number; height: number }, blocked: readonly Rect[] = []): Map<string, Placement | null> {
  const placed: Rect[] = [...blocked];
  const result = new Map<string, Placement | null>();
  for (const label of labels) {
    if (label.x < 0 || label.y < 0 || label.x > view.width || label.y > view.height) {
      result.set(label.id, null);
      continue;
    }
    let found: Placement | null = null;
    for (const [sx, sy] of SHIFTS) {
      const dx = sx * (label.width + GAP);
      const dy = sy * (label.height + GAP);
      const rect = {
        left: label.x + dx - label.width / 2,
        right: label.x + dx + label.width / 2,
        top: label.y + dy - label.height / 2,
        bottom: label.y + dy + label.height / 2,
      };
      if (rect.left < 0 || rect.top < 0 || rect.right > view.width || rect.bottom > view.height) continue;
      if (placed.some((other) => overlaps(rect, other))) continue;
      placed.push(rect);
      found = { dx, dy };
      break;
    }
    result.set(label.id, found);
  }
  return result;
}
