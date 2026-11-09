import { drawingSize, flatten, type Drawing, type Pt } from './svgDrawing';

/**
 * Details of a drawing too fine to print at a width: strokes narrower than the nozzle (lost or
 * broken in the slicer) and gaps narrower than it (they close up). The drawing is rasterised, and
 * a part counts as too fine where no disc of the nozzle's width fits (a morphological opening
 * through exact distance transforms). Rounded-off corners are no detail: only places larger than a
 * few nozzle discs count.
 */

/** Finer rasters give little for a warning and cost time on every change of the width. */
const MAX_EDGE_PX = 1600;
/** A place counts from this many nozzle-radius squares; a square corner loses about 0.2 of one. */
const MIN_PLACE = 3;

export interface DrawingDetail {
  /** How many places are too fine: thin strokes and narrow gaps. */
  places: number;
  /** The thinnest of them, in mm. */
  thinnest: number;
  /** The width from which every place is a little over a nozzle wide, in mm. */
  fineFrom: number;
  /** Where they are, for a marked picture: 1 per too-fine pixel; the drawing's top left at (pad, pad). */
  mask: { width: number; height: number; pad: number; mmPerPx: number; fine: Uint8Array };
}

const INF = 1e20;

/** Squared distance of each pixel to the nearest pixel that is set in `source` (Felzenszwalb & Huttenlocher). */
function distanceTo(source: Uint8Array, width: number, height: number): Float64Array {
  const out = new Float64Array(width * height);
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (length: number) => {
    const meet = (q: number, p: number) => ((f[q] ?? 0) + q * q - ((f[p] ?? 0) + p * p)) / (2 * q - 2 * p);
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < length; q += 1) {
      let s = meet(q, v[k] ?? 0);
      // z[0] is −∞, so k never drops below 0.
      while (s <= (z[k] ?? -Infinity)) {
        k -= 1;
        s = meet(q, v[k] ?? 0);
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q += 1) {
      while ((z[k + 1] ?? Infinity) < q) k += 1;
      const p = v[k] ?? 0;
      d[q] = (q - p) * (q - p) + (f[p] ?? 0);
    }
  };
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = source[y * width + x] ? 0 : INF;
    pass(height);
    for (let y = 0; y < height; y += 1) out[y * width + x] = d[y] ?? INF;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) f[x] = out[y * width + x] ?? INF;
    pass(width);
    for (let x = 0; x < width; x += 1) out[y * width + x] = d[x] ?? INF;
  }
  return out;
}

/** The drawing's fills as one mask, even-odd per shape as PartBuddy builds them, sampled at pixel centres. */
function rasterise(drawing: Drawing, pxPerUnit: number, pad: number) {
  const size = drawingSize(drawing);
  const width = Math.ceil(size.width * pxPerUnit) + 2 * pad;
  const height = Math.ceil(size.height * pxPerUnit) + 2 * pad;
  const mask = new Uint8Array(width * height);
  const px = (p: Pt): Pt => [(p[0] - drawing.bounds.minX) * pxPerUnit + pad, (p[1] - drawing.bounds.minY) * pxPerUnit + pad];
  for (const shape of drawing.shapes) {
    const rows: number[][] = Array.from({ length: height }, () => []);
    for (const loop of shape.loops) {
      const polygon = flatten(loop, 0.25 / pxPerUnit).map(px);
      for (let k = 0; k < polygon.length; k += 1) {
        const a = polygon[k] as Pt;
        const b = polygon[(k + 1) % polygon.length] as Pt;
        const [lo, hi] = a[1] < b[1] ? [a, b] : [b, a];
        // Rows whose centre y + 0.5 lies in [lo, hi).
        for (let y = Math.max(0, Math.ceil(lo[1] - 0.5)); y < height && y + 0.5 < hi[1]; y += 1) {
          rows[y]?.push(lo[0] + ((y + 0.5 - lo[1]) * (hi[0] - lo[0])) / (hi[1] - lo[1]));
        }
      }
    }
    rows.forEach((xs, y) => {
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil((xs[k] ?? 0) - 0.5)); x < width && x + 0.5 < (xs[k + 1] ?? 0); x += 1) mask[y * width + x] = 1;
      }
    });
  }
  return { mask, width, height };
}

/** The too-fine places of `inside`: where no disc of radius `r` px fits; each place with its thinnest width in px. */
function finePlaces(inside: Uint8Array, width: number, height: number, r: number, into: Uint8Array): number[] {
  const n = width * height;
  const outside = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) outside[i] = inside[i] ? 0 : 1;
  const toEdge = distanceTo(outside, width, height);
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) core[i] = (toEdge[i] ?? 0) > r * r ? 1 : 0;
  const toCore = distanceTo(core, width, height);
  const seen = new Uint8Array(n);
  const widths: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < n; start += 1) {
    if (!inside[start] || seen[start] || (toCore[start] ?? 0) <= r * r) continue;
    // One place: its pixels 4-connected; its width is the middle of its centre line (where it meets
    // something wider, the line runs deeper, so the deepest pixel would overstate it).
    const place: number[] = [];
    const ridge: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      place.push(i);
      const x = i % width;
      const e = toEdge[i] ?? 0;
      const at = (j: number) => (j >= 0 && j < n ? (toEdge[j] ?? 0) : 0);
      // A crest across one axis: not lower than either neighbour and higher than one (two middle rows of an even stroke tie).
      const crest = (a: number, b: number) => e >= a && e >= b && (e > a || e > b);
      if ((x > 0 && x < width - 1 && crest(at(i - 1), at(i + 1))) || crest(at(i - width), at(i + width))) ridge.push(e);
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j < 0 || j >= n || seen[j] || !inside[j] || (toCore[j] ?? 0) <= r * r) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (place.length < MIN_PLACE * r * r) continue;
    for (const i of place) into[i] = 1;
    ridge.sort((a, b) => a - b);
    // The centre pixel of a stroke w px wide lies w / 2 + 0.5 from the nearest pixel outside.
    widths.push(Math.max(1, 2 * Math.sqrt(ridge[Math.floor(ridge.length / 2)] ?? 1) - 1));
  }
  return widths;
}

/** The details of a drawing too fine for `nozzle` mm at `width` mm, or null when all print. */
export function drawingDetail(drawing: Drawing, width: number, nozzle: number): DrawingDetail | null {
  const size = drawingSize(drawing);
  if (!(size.width > 0) || !(width > 0) || !(nozzle > 0)) return null;
  const heightMm = (size.height / size.width) * width;
  const mmPerPx = Math.max(nozzle / 10, Math.max(width, heightMm) / MAX_EDGE_PX);
  const r = nozzle / 2 / mmPerPx;
  // Outside the drawing is open ground, wider than any nozzle.
  const pad = Math.ceil(2 * r) + 2;
  const { mask, width: w, height: h } = rasterise(drawing, size.width > 0 ? width / size.width / mmPerPx : 1, pad);
  const fine = new Uint8Array(w * h);
  const gaps = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i += 1) gaps[i] = mask[i] ? 0 : 1;
  const widths = [...finePlaces(mask, w, h, r, fine), ...finePlaces(gaps, w, h, r, fine)];
  if (widths.length === 0) return null;
  const thinnest = Math.min(...widths) * mmPerPx;
  return {
    places: widths.length,
    thinnest: Math.round(thinnest * 100) / 100,
    // 10 % over a nozzle wide: exactly one is a coin toss in the raster and in the slicer.
    fineFrom: Math.ceil((width * nozzle * 1.1) / thinnest),
    mask: { width: w, height: h, pad, mmPerPx, fine },
  };
}
