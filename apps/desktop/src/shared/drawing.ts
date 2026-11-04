/**
 * Drawing on the view (M2b-2, ADR 0020): strokes the user draws over the 3D view, turned into a few
 * words for the assistant instead of a picture. The renderer samples each stroke against the
 * model (face name and world point per sample) and summarises it here; the main process turns the
 * summaries into the note before the message. Pure functions, shared by both sides.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/** One sample of a stroke: where the pointer was, and what of the model lay under it. */
export interface StrokeSample {
  screen: Vec2;
  /** World point on the model, or on the plane through the view's target when off the model. */
  world: Vec3;
  /** Body and face under the pointer; null off the model. */
  body: string | null;
  face: string | null;
}

export type StrokeKind = 'dot' | 'line' | 'loop';
export type ScreenDirection = 'left' | 'right' | 'above' | 'below';

/** What PartBuddy sends to the main process for one stroke (contract `drawingStrokeSchema`). */
export interface DrawingStroke {
  kind: StrokeKind;
  /** The body most of the stroke lies on; null when it lies off the model. */
  body: string | null;
  /** Faces the stroke touches, in the order it reached them (at most 12). */
  faces: string[];
  /** Up to 64 world points along the stroke, in mm, in drawing order. */
  points: Vec3[];
  /** Length along the stroke in mm. */
  length: number;
  /** For a loop: its two largest extents in mm. */
  size?: [number, number] | undefined;
  /** For a loop: faces and edges whose visible middle lies inside it. */
  inside?: { faces: string[]; edges: string[] } | undefined;
  /** Off the model: where the stroke lies on screen from the nearest body. */
  direction?: ScreenDirection | undefined;
}

/** A stroke shorter than this many pixels is a dot. */
export const DOT_PIXELS = 6;
/** A stroke whose end comes back this close to its start is a loop. */
export const LOOP_PIXELS = 15;
/** Distance between samples while drawing. */
export const SAMPLE_PIXELS = 8;
const MAX_POINTS = 64;
const MAX_NAMES = 12;

const distance2 = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const distance3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Length of the stroke on screen. */
export function screenLength(samples: readonly StrokeSample[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) total += distance2((samples[i - 1] as StrokeSample).screen, (samples[i] as StrokeSample).screen);
  return total;
}

export function classifyStroke(samples: readonly StrokeSample[]): StrokeKind {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last) return 'dot';
  const length = screenLength(samples);
  if (length < DOT_PIXELS) return 'dot';
  // A loop must go somewhere before it comes back: at least three times the closing gap.
  if (distance2(first.screen, last.screen) <= LOOP_PIXELS && length > LOOP_PIXELS * 3) return 'loop';
  return 'line';
}

/** True when the screen point lies inside the polygon (even-odd rule). */
export function insidePolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i] as Vec2;
    const [xj, yj] = polygon[j] as Vec2;
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const roundVec = (v: Vec3): Vec3 => [round2(v[0]), round2(v[1]), round2(v[2])];

/** Evenly spaced points, at most `max`, keeping the first and the last. */
function thin<T>(values: readonly T[], max: number): T[] {
  if (values.length <= max) return [...values];
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(values[Math.round((i * (values.length - 1)) / (max - 1))] as T);
  return out;
}

/**
 * The summary of one stroke. `inside` (for loops) and `direction` (for strokes off the model)
 * need the camera and the meshes, so the renderer works them out and passes them in.
 */
export function summarizeStroke(
  samples: readonly StrokeSample[],
  context: { inside?: { faces: string[]; edges: string[] } | undefined; direction?: ScreenDirection | undefined } = {},
): DrawingStroke {
  const kind = classifyStroke(samples);
  const onModel = samples.filter((sample) => sample.body !== null);
  const body = onModel.length * 2 >= samples.length ? mostCommon(onModel.map((sample) => sample.body as string)) : null;
  const faces: string[] = [];
  for (const sample of samples) {
    if (sample.face && sample.body === body && !faces.includes(sample.face)) faces.push(sample.face);
  }
  let length = 0;
  for (let i = 1; i < samples.length; i += 1) length += distance3((samples[i - 1] as StrokeSample).world, (samples[i] as StrokeSample).world);
  const points = thin(kind === 'dot' ? samples.slice(0, 1) : samples, MAX_POINTS).map((sample) => roundVec(sample.world));
  const stroke: DrawingStroke = { kind, body, faces: faces.slice(0, MAX_NAMES), points, length: round2(length) };
  if (kind === 'loop') {
    const span = [0, 1, 2]
      .map((axis) => {
        const values = samples.map((sample) => sample.world[axis] ?? 0);
        return Math.max(...values) - Math.min(...values);
      })
      .sort((a, b) => b - a);
    stroke.size = [round2(span[0] ?? 0), round2(span[1] ?? 0)];
    if (context.inside) stroke.inside = { faces: context.inside.faces.slice(0, MAX_NAMES), edges: context.inside.edges.slice(0, MAX_NAMES) };
  }
  if (body === null && context.direction) stroke.direction = context.direction;
  return stroke;
}

/** Names come from the design; keep them to one short line without PartBuddy's note brackets. */
const name = (value: string) => `"${value.replace(/["[\]\n\r]/g, '').slice(0, 120)}"`;
const at = (point: Vec3 | undefined) => (point ? `(${point.map(round2).join(', ')}) mm` : '(?)');
const names = (values: readonly string[]) => values.map(name).join(', ');
const mm = (value: number) => `${round2(value)} mm`;

/** One stroke in words, for the note before the message. */
export function describeStroke(stroke: DrawingStroke): string {
  const where = stroke.body === null ? `in empty space${stroke.direction ? ` ${stroke.direction === 'above' || stroke.direction === 'below' ? stroke.direction : `${stroke.direction} of`} the part` : ''}` : null;
  const on = (face: string | undefined) => (face ? ` on ${name(face)}` : '');
  const body = stroke.body !== null ? ` of body ${name(stroke.body)}` : '';
  switch (stroke.kind) {
    case 'dot':
      return where ? `dot ${where} at ${at(stroke.points[0])}` : `dot${on(stroke.faces[0])}${body} at ${at(stroke.points[0])}`;
    case 'line': {
      const crossing = stroke.faces.length > 2 ? `, crossing ${names(stroke.faces.slice(1, -1))}` : '';
      if (where) return `line ${where} from ${at(stroke.points[0])} to ${at(stroke.points.at(-1))}, ${mm(stroke.length)} long`;
      return (
        `line${body} from ${at(stroke.points[0])}${on(stroke.faces[0])} to ${at(stroke.points.at(-1))}${on(stroke.faces.at(-1))}, ` +
        `${mm(stroke.length)} long${crossing}`
      );
    }
    case 'loop': {
      // The middle of the loop's bounds: unlike the mean, it does not lean towards where the pen lingered.
      const middle =
        stroke.points.length > 0
          ? ([0, 1, 2].map((axis) => {
              const values = stroke.points.map((point) => point[axis] ?? 0);
              return (Math.min(...values) + Math.max(...values)) / 2;
            }) as Vec3)
          : undefined;
      const size = stroke.size ? `, about ${round2(stroke.size[0])} × ${round2(stroke.size[1])} mm` : '';
      const insideFaces = stroke.inside?.faces.length ? `faces ${names(stroke.inside.faces)}` : '';
      const insideEdges = stroke.inside?.edges.length ? `edges ${names(stroke.inside.edges)}` : '';
      const enclosing = [insideFaces, insideEdges].filter(Boolean).join(' and ');
      if (where) return `loop ${where} around ${at(middle)}${size}`;
      return `loop${on(stroke.faces[0])}${body} around ${at(middle)}${size}${enclosing ? `, enclosing ${enclosing}` : ''}`;
    }
  }
}

/** The note before the message: every stroke in drawing order, about 50 tokens for a short drawing. */
export function describeDrawing(strokes: readonly DrawingStroke[], image: boolean): string {
  const lines = strokes.map((stroke, i) => `${i + 1}. ${describeStroke(stroke)}`);
  const picture = image ? ' A picture of the view with the strokes is attached.' : '';
  return (
    `[PartBuddy: the user drew ${strokes.length === 1 ? 'one stroke' : `${strokes.length} strokes`} on PartBuddy's view ` +
    `(Z up, front is -Y): ${lines.join('; ')}. "Here", "this" or "the marked place" means these marks.${picture}]`
  );
}
