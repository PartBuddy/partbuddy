/**
 * Moving a placed logo exactly. A logo is the sketch (or, in colours, the sketches) named
 * `SVG-Logo <name>`, whose origin is the drawing's middle. `sketch.redefine` gives every sketch of it a
 * new plane, and SolidCraft rebuilds the pocket, the cut and the colour bodies there in one go
 * (probed with SolidCraft 0.40, 2026-11-08). PartBuddy keeps nothing of its own: SolidCraft's
 * `document.inspect` lists the sketches with their planes.
 */

export type Vec3 = [number, number, number];
export interface SketchPlane {
  origin: Vec3;
  x_dir: Vec3;
  y_dir: Vec3;
}

/**
 * The name prefix of a logo PartBuddy placed. Reserved: the assistant may not give its own sketches
 * this name (drawingTool.ts), so a sketch it drew and named "Logo …" is no logo to move (09.11.2026).
 */
export const LOGO_PREFIX = 'SVG-Logo ';

/** The sketch name of a text block, "Text <words>": found again on a pick and changed like a logo (decided 2026-11-09). */
export const TEXT_PREFIX = 'Text ';

/** A sketch PartBuddy placed as a whole, a logo or a text, which a pick finds and the dock moves. */
export const isPlacedName = (name: string) => name.startsWith(LOGO_PREFIX) || name.startsWith(TEXT_PREFIX);

/** The readable name of a logo or text sketch, without the prefix. */
export const logoTitle = (sketch: string) => (sketch.startsWith(LOGO_PREFIX) ? sketch.slice(LOGO_PREFIX.length) : sketch.startsWith(TEXT_PREFIX) ? sketch.slice(TEXT_PREFIX.length) : sketch);

/** A file name as the readable part of body and sketch names. */
export function logoBase(name: string): string {
  return (name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Logo').slice(0, 60);
}

/** The sketch name of a new logo: SolidCraft allows a name twice, so a second "Badge" becomes "SVG-Logo Badge 2". */
export function uniqueLogoName(name: string, taken: readonly string[], prefix = LOGO_PREFIX): string {
  const first = `${prefix}${logoBase(name)}`;
  if (!taken.includes(first)) return first;
  let n = 2;
  while (taken.includes(`${first} ${String(n)}`)) n++;
  return `${first} ${String(n)}`;
}

/** How deep, high or thick a logo may be, in mm (`partbuddy_place_drawing`, the logo dock). */
export const LOGO_DEPTH_MAX = 50;
/** How wide a logo may be, in mm. */
export const LOGO_WIDTH_MAX = 1000;

/**
 * A colour piece of a logo built in colours ("<file name> <fill> <n>", a split piece "… (2)"), of a logo the design has:
 * `sketches` are its sketch names. By the name pattern alone "Front facade 1" counted as one and fell out of the print
 * check's measures (audit H-27); a logo's colour bodies are named after its sketch (blocks.ts, colourLayers).
 * shortcut: a body named "<logo> <6 hex letters> <n>" beside a logo of that name still counts as a colour piece; check its
 * colour against the fill too if such names turn up.
 */
export function isLogoColourBody(name: string, sketches: readonly string[]): boolean {
  const match = /^(.+) [0-9a-f]{6} \d+( \(\d+\))?$/.exec(name);
  if (!match) return false;
  const base = match[1] as string;
  // A second logo of a file is "SVG-Logo Badge 2" and names its bodies "Badge …" as the first does.
  return sketches.some((sketch) => sketch.startsWith(LOGO_PREFIX) && [sketch.slice(LOGO_PREFIX.length), sketch.slice(LOGO_PREFIX.length).replace(/ \d+$/, '')].includes(base));
}

/**
 * A logo built as a body of its own (`partbuddy_place_drawing` as a part: the body named `logoBase` of its file, its sketch
 * "SVG-Logo <that name>" or, a second one, "… 2"): raised letters or a badge, which the design hints leave alone as they
 * leave a logo's colour pieces.
 */
export function isLogoPartBody(name: string, sketches: readonly string[]): boolean {
  return sketches.some((sketch) => sketch.startsWith(LOGO_PREFIX) && [sketch.slice(LOGO_PREFIX.length), sketch.slice(LOGO_PREFIX.length).replace(/ \d+$/, '')].includes(name));
}

export interface PlacedSketch {
  id: number;
  name: string;
  plane: SketchPlane;
}

const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));

/** The logos in a `document.inspect` / `inspect_design` result: each name with its sketches. */
export function placedLogos(inspect: unknown): Map<string, PlacedSketch[]> {
  const logos = new Map<string, PlacedSketch[]>();
  const sketches = (inspect as { sketches?: unknown } | null)?.sketches;
  for (const entry of Array.isArray(sketches) ? (sketches as Record<string, unknown>[]) : []) {
    const plane = entry.plane as Record<string, unknown> | undefined;
    if (typeof entry.name !== 'string' || !isPlacedName(entry.name) || !Number.isInteger(entry.id)) continue;
    if (!plane || !isVec3(plane.origin) || !isVec3(plane.x_dir) || !isVec3(plane.y_dir)) continue;
    const list = logos.get(entry.name) ?? [];
    list.push({ id: entry.id as number, name: entry.name, plane: { origin: plane.origin, x_dir: plane.x_dir, y_dir: plane.y_dir } });
    logos.set(entry.name, list);
  }
  return logos;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tidy = (value: number) => Math.round(value * 1e6) / 1e6;

/** A world point in the plane's own coordinates (along x_dir, y_dir). */
export function inPlane(plane: SketchPlane, point: Vec3): [number, number] {
  const d = sub(point, plane.origin);
  return [dot(d, plane.x_dir), dot(d, plane.y_dir)];
}

/** The plane moved by du along its x and dv along its y. */
export function movedPlane(plane: SketchPlane, du: number, dv: number): SketchPlane {
  const origin = plane.origin.map((value, i) => tidy(value + du * (plane.x_dir[i] ?? 0) + dv * (plane.y_dir[i] ?? 0))) as Vec3;
  return { ...plane, origin };
}

/** The plane turned by `degrees` counter-clockwise (looking at the face) about its origin, the logo's middle. */
export function rotatedPlane(plane: SketchPlane, degrees: number): SketchPlane {
  const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  const { x_dir: x, y_dir: y } = plane;
  return { ...plane, x_dir: x.map((value, i) => tidy(c * value + s * (y[i] ?? 0))) as Vec3, y_dir: y.map((value, i) => tidy(c * value - s * (x[i] ?? 0))) as Vec3 };
}

/** How far the plane is turned from the level frame a logo is placed in (planeAt in blocks.ts), in degrees, −180 to 180. */
export function planeAngle(plane: SketchPlane): number {
  const n = cross(plane.x_dir, plane.y_dir);
  const level = cross([0, 0, 1], n);
  const size = Math.hypot(...level);
  const x0: Vec3 = size < 1e-6 ? [1, 0, 0] : (level.map((value) => value / size) as Vec3);
  const degrees = (Math.atan2(dot(plane.x_dir, cross(n, x0)), dot(plane.x_dir, x0)) * 180) / Math.PI;
  return Math.round(degrees * 1000) / 1000 || 0;
}

export interface Extent {
  min: [number, number];
  max: [number, number];
}

interface EdgeEntry {
  name: string;
  start: Vec3;
  end: Vec3;
  mid: Vec3;
  length: number;
}

/**
 * An edge's extent in the plane. SolidCraft gives start, middle and end; a straight edge is its
 * ends, a curved one is taken as the circular arc through the three points, with the arc's extreme
 * points where it passes them.
 * shortcut: a spline edge counts as an arc through its three points, which can be off by a little; exact once SolidCraft reports face bounds.
 */
function edgeExtent(plane: SketchPlane, edge: EdgeEntry): [number, number][] {
  const [a, m, b] = [edge.start, edge.mid, edge.end].map((point) => inPlane(plane, point)) as [[number, number], [number, number], [number, number]];
  const points: [number, number][] = [a, m, b];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (Math.abs(edge.length - chord) < 1e-6) return points;
  // Circle through a, m, b.
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-12) return points;
  const sq = (p: [number, number]) => p[0] ** 2 + p[1] ** 2;
  const c: [number, number] = [(sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d, (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d];
  const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const angle = (p: [number, number]) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const turn = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const [t0, tm, t1] = [angle(a), angle(m), angle(b)];
  // The arc runs counter-clockwise from a to b when m lies on that way, else clockwise.
  const ccw = turn(t0, tm) <= turn(t0, t1) || chord < 1e-9;
  const span = chord < 1e-9 ? 2 * Math.PI : ccw ? turn(t0, t1) : turn(t1, t0);
  const from = ccw ? t0 : t1;
  for (const extreme of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (turn(from, extreme) <= span) points.push([c[0] + r * Math.cos(extreme), c[1] + r * Math.sin(extreme)]);
  }
  return points;
}

/**
 * The two face names of an edge name "<face>|<face>". A face changed by a cut or emboss carries its
 * history in brackets, which hold "|" of their own ("F1:-y#[F10:blend:F1:+x|F1:-z,…]"), so it is split
 * only outside brackets; a text or logo cut into a face otherwise found no face under it.
 */
export function faceNames(edge: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < edge.length; i++) {
    const c = edge[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === '|' && depth === 0) {
      names.push(edge.slice(start, i));
      start = i + 1;
    }
  }
  names.push(edge.slice(start));
  return names.map((part) => part.replace(/~\d+$/, ''));
}

/** The extent of a face in the plane, from its edges (`model.edges`). */
export function faceExtent(plane: SketchPlane, edges: readonly EdgeEntry[], face: string): Extent | null {
  const points = edges.filter((edge) => faceNames(edge.name).includes(face)).flatMap((edge) => edgeExtent(plane, edge));
  if (points.length === 0) return null;
  return {
    min: [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
    max: [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
  };
}

export interface BodyFaces {
  body: string;
  /** `model.faces` result. */
  faces: unknown;
  /** `model.edges` result. */
  edges: unknown;
}

/**
 * The flat face the logo sits on: in the sketch's plane, facing the same way, around the logo's
 * middle. A colour piece's top face lies there as well; the part's face is the largest.
 */
export function hostFace(plane: SketchPlane, bodies: readonly BodyFaces[]): { body: string; face: string; extent: Extent } | null {
  const normal = cross(plane.x_dir, plane.y_dir);
  let best: { body: string; face: string; extent: Extent; area: number } | null = null;
  for (const entry of bodies) {
    const faces = (entry.faces as { faces?: unknown } | null)?.faces;
    const edgeList = (entry.edges as { edges?: unknown } | null)?.edges;
    const edges = (Array.isArray(edgeList) ? (edgeList as Partial<Record<keyof EdgeEntry, unknown>>[]) : []).filter(
      (edge): edge is EdgeEntry => typeof edge.name === 'string' && isVec3(edge.start) && isVec3(edge.end) && isVec3(edge.mid) && typeof edge.length === 'number',
    );
    for (const face of Array.isArray(faces) ? (faces as Record<string, unknown>[]) : []) {
      if (typeof face.name !== 'string' || !isVec3(face.plane_normal) || !isVec3(face.point)) continue;
      if (dot(face.plane_normal, normal) < 0.999 || Math.abs(dot(sub(face.point, plane.origin), normal)) > 1e-3) continue;
      const extent = faceExtent(plane, edges, face.name);
      if (!extent || extent.min[0] > 1e-3 || extent.min[1] > 1e-3 || extent.max[0] < -1e-3 || extent.max[1] < -1e-3) continue;
      const area = (extent.max[0] - extent.min[0]) * (extent.max[1] - extent.min[1]);
      if (!best || area > best.area) best = { body: entry.body, face: face.name, extent, area };
    }
  }
  return best && { body: best.body, face: best.face, extent: best.extent };
}

export type CentreAxis = 'x' | 'y' | 'both';

/** How far to move so the logo's middle comes onto the face's middle along the axis. */
export function centring(extent: Extent, axis: CentreAxis): [number, number] {
  const middle = [(extent.min[0] + extent.max[0]) / 2, (extent.min[1] + extent.max[1]) / 2];
  return [axis === 'y' ? 0 : tidy(middle[0] ?? 0), axis === 'x' ? 0 : tidy(middle[1] ?? 0)];
}
