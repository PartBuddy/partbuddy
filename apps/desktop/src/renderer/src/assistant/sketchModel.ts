/**
 * The elements of a hand sketch (F9) and the geometry behind the tools: snapping to the squares
 * and to the corners already drawn, picking, moving, and the list the assistant gets next to the
 * picture. Pure functions, no canvas.
 */

/** The paper in CSS pixels; the picture for the assistant has this size, at least twice as fine. */
export const SKETCH_SIZE = { width: 640, height: 420 } as const;
/** Squared paper: one square per 20 px, so proportions are easy to keep. */
export const GRID = 20;
/** Points snap to half squares, and to a corner already drawn within this distance. */
const SNAP_STEP = GRID / 2;
const SNAP_RADIUS = 8;
/** A pick or an eraser stroke hits an element this close. */
export const HIT_RADIUS = 6;

export type Point = [number, number];

export type SketchItem =
  | { kind: 'pen'; points: Point[] }
  | { kind: 'line'; from: Point; to: Point }
  | { kind: 'rect'; from: Point; to: Point }
  | { kind: 'circle'; center: Point; radius: number }
  | { kind: 'arc'; from: Point; through: Point; to: Point }
  | { kind: 'dimension'; from: Point; to: Point; value: string }
  | { kind: 'text'; at: Point; text: string };

export type Tool = 'select' | 'pen' | 'line' | 'rect' | 'circle' | 'arc' | 'dimension' | 'text' | 'eraser';

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The corners and centres other points snap to. */
function keyPoints(items: readonly SketchItem[]): Point[] {
  return items.flatMap((item): Point[] => {
    switch (item.kind) {
      case 'line':
      case 'dimension':
        return [item.from, item.to];
      case 'rect':
        return [item.from, item.to, [item.from[0], item.to[1]], [item.to[0], item.from[1]]];
      case 'circle':
        return [item.center];
      case 'arc':
        return [item.from, item.to];
      default:
        return [];
    }
  });
}

/** A point on the paper, snapped to a nearby corner, else to the half squares; `free` keeps it as drawn. */
export function snap(point: Point, items: readonly SketchItem[], free = false): Point {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
  const inside: Point = [clamp(point[0], SKETCH_SIZE.width), clamp(point[1], SKETCH_SIZE.height)];
  if (free) return inside;
  const near = keyPoints(items)
    .map((candidate) => ({ candidate, gap: distance(candidate, inside) }))
    .filter((entry) => entry.gap <= SNAP_RADIUS)
    .sort((a, b) => a.gap - b.gap)[0];
  if (near) return near.candidate;
  return [Math.round(inside[0] / SNAP_STEP) * SNAP_STEP, Math.round(inside[1] / SNAP_STEP) * SNAP_STEP];
}

/** Shift held: the end turns to the nearest multiple of 45° around the start, keeping its length. */
export function constrain(from: Point, to: Point): Point {
  const length = distance(from, to);
  const angle = Math.round(Math.atan2(to[1] - from[1], to[0] - from[0]) / (Math.PI / 4)) * (Math.PI / 4);
  return [Math.round((from[0] + Math.cos(angle) * length) * 10) / 10, Math.round((from[1] + Math.sin(angle) * length) * 10) / 10];
}

/** Shift held on a rectangle: a square with the side of the longer drag. */
export function square(from: Point, to: Point): Point {
  const side = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  return [from[0] + Math.sign(to[0] - from[0] || 1) * side, from[1] + Math.sign(to[1] - from[1] || 1) * side];
}

/** The circle through an arc's three points, and its angles; null when they lie on a line. */
export function arcCircle(from: Point, through: Point, to: Point): { center: Point; radius: number; start: number; end: number; anticlockwise: boolean } | null {
  const [ax, ay] = from;
  const [bx, by] = through;
  const [cx, cy] = to;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const center: Point = [ux, uy];
  const angle = (p: Point) => Math.atan2(p[1] - uy, p[0] - ux);
  const start = angle(from);
  const end = angle(to);
  const mid = angle(through);
  // Clockwise on screen (y down) is increasing angle; the arc runs the way that passes `through`.
  const sweep = (a: number, b: number) => (((b - a) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const anticlockwise = sweep(start, mid) > sweep(start, end);
  return { center, radius: distance(center, from), start, end, anticlockwise };
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const length = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (length === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / length));
  return distance(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

/** Points along an arc, for picking. */
function arcPoints(item: Extract<SketchItem, { kind: 'arc' }>): Point[] {
  const circle = arcCircle(item.from, item.through, item.to);
  if (!circle) return [item.from, item.to];
  const span = circle.anticlockwise ? -((((circle.start - circle.end) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) : (((circle.end - circle.start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Array.from({ length: 33 }, (_, i): Point => {
    const angle = circle.start + (span * i) / 32;
    return [circle.center[0] + Math.cos(angle) * circle.radius, circle.center[1] + Math.sin(angle) * circle.radius];
  });
}

const polyline = (p: Point, points: readonly Point[]) =>
  points.length === 1 && points[0] ? distance(p, points[0]) : Math.min(...points.slice(1).map((point, i) => segmentDistance(p, points[i] as Point, point)));

/** How far a point is from an element's line, in paper pixels. */
export function distanceTo(item: SketchItem, p: Point): number {
  switch (item.kind) {
    case 'pen':
      return polyline(p, item.points);
    case 'line':
    case 'dimension':
      return segmentDistance(p, item.from, item.to);
    case 'rect': {
      const [a, b] = [item.from, item.to];
      return polyline(p, [a, [b[0], a[1]], b, [a[0], b[1]], a]);
    }
    case 'circle':
      return Math.abs(distance(p, item.center) - item.radius);
    case 'arc':
      return polyline(p, arcPoints(item));
    case 'text': {
      // About the box the label takes at 14 px.
      const width = Math.max(1, item.text.length) * 7.5;
      const dx = Math.max(item.at[0] - p[0], 0, p[0] - (item.at[0] + width));
      const dy = Math.max(item.at[1] - 14 - p[1], 0, p[1] - (item.at[1] + 4));
      return Math.hypot(dx, dy);
    }
  }
}

/** The topmost element under a point, or null. */
export function pick(items: readonly SketchItem[], p: Point): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && distanceTo(item, p) <= HIT_RADIUS) return index;
  }
  return null;
}

/** An element moved by an offset. */
export function moved(item: SketchItem, dx: number, dy: number): SketchItem {
  const shift = (p: Point): Point => [p[0] + dx, p[1] + dy];
  switch (item.kind) {
    case 'pen':
      return { ...item, points: item.points.map(shift) };
    case 'circle':
      return { ...item, center: shift(item.center) };
    case 'arc':
      return { ...item, from: shift(item.from), through: shift(item.through), to: shift(item.to) };
    case 'text':
      return { ...item, at: shift(item.at) };
    default:
      return { ...item, from: shift(item.from), to: shift(item.to) };
  }
}

/** An element is worth keeping once it has a size (a tap with a shape tool draws nothing). */
export function hasSize(item: SketchItem): boolean {
  switch (item.kind) {
    case 'pen':
      return item.points.length > 0;
    case 'circle':
      return item.radius >= 2;
    case 'text':
      return item.text.trim() !== '';
    case 'dimension':
      return distance(item.from, item.to) >= 2 && item.value.trim() !== '';
    case 'arc':
      return distance(item.from, item.to) >= 2;
    default:
      return distance(item.from, item.to) >= 2;
  }
}

/** A position in squares from the top left, to half a square. */
const squares = (p: Point) => `(${String(Math.round((p[0] / GRID) * 2) / 2)}, ${String(Math.round((p[1] / GRID) * 2) / 2)})`;
const length = (value: number) => String(Math.round((value / GRID) * 2) / 2);
const quoted = (text: string) => `"${text.replace(/\s+/g, ' ').replace(/"/g, "'").trim().slice(0, 80)}"`;

/**
 * The elements as text for the assistant, next to the picture: positions in squares from the top
 * left (x to the right, y down), so it can tie each dimension and label to a shape. Freehand
 * strokes are only counted; the picture shows them.
 */
export function describeSketch(items: readonly SketchItem[]): string {
  const lines: string[] = [];
  let freehand = 0;
  for (const item of items) {
    switch (item.kind) {
      case 'pen':
        freehand += 1;
        break;
      case 'line':
        lines.push(`line ${squares(item.from)} to ${squares(item.to)}, ${length(distance(item.from, item.to))} squares long`);
        break;
      case 'rect':
        lines.push(`rectangle ${squares(item.from)} to ${squares(item.to)}, ${length(Math.abs(item.to[0] - item.from[0]))} × ${length(Math.abs(item.to[1] - item.from[1]))} squares`);
        break;
      case 'circle':
        lines.push(`circle centred ${squares(item.center)}, ${length(item.radius * 2)} squares across`);
        break;
      case 'arc':
        lines.push(`arc ${squares(item.from)} through ${squares(item.through)} to ${squares(item.to)}`);
        break;
      case 'dimension':
        lines.push(`dimension ${quoted(item.value)} between ${squares(item.from)} and ${squares(item.to)} (${length(distance(item.from, item.to))} squares)`);
        break;
      case 'text':
        lines.push(`label ${quoted(item.text)} at ${squares(item.at)}`);
        break;
    }
  }
  if (freehand > 0) lines.push(`${String(freehand)} freehand stroke${freehand === 1 ? '' : 's'} (see the picture)`);
  return lines.slice(0, 80).map((line) => `- ${line}`).join('\n');
}
