// Geometry of the PartBuddy mark ("Pair"): a graphite part with a notch in its top right corner
// and a small blue companion part that sits in the notch with an even clearance gap. Together the
// two parts read as a capital P. All brand SVGs are generated from these numbers (docs/brand.md).

const round = (value) => Number(value.toFixed(3)).toString();

/**
 * Master construction on a 32 × 40 unit grid (the 256 px app icon uses 4 px per unit).
 * stem: width of the vertical stroke; wall: right edge of the part's top block (left wall of
 * the notch); gap: clearance between part and companion; notch: height of the companion;
 * bowl: height of the bowl (bottom of the P's round part); R: outer silhouette radius; bowlR:
 * radius of the bowl's lower right corner, larger so the silhouette reads as a P; r: radius of
 * minor corners.
 */
export const master = {
  width: 32,
  height: 40,
  stem: 14,
  wall: 18,
  gap: 2,
  notch: 12,
  bowl: 26,
  R: 4,
  bowlR: 7,
  r: 1.5,
};

/**
 * Pixel-snapped variants for small icon sizes: every edge lies on a whole pixel so the
 * clearance gap stays visible as a full pixel. Keys are the icon size in pixels; x and y place
 * the mark inside the square icon; radius is the tile corner radius.
 */
export const hinted = {
  16: { x: 3, y: 2, width: 10, height: 12, stem: 4, wall: 5, gap: 1, notch: 4, bowl: 8, R: 1, bowlR: 2, r: 0, radius: 3 },
  20: { x: 4, y: 3, width: 12, height: 14, stem: 5, wall: 6, gap: 1, notch: 5, bowl: 9, R: 1, bowlR: 2, r: 0, radius: 4 },
  24: { x: 5, y: 3, width: 14, height: 18, stem: 6, wall: 8, gap: 1, notch: 5, bowl: 12, R: 1.5, bowlR: 3, r: 0.5, radius: 4.5 },
  32: { x: 8, y: 6, width: 16, height: 20, stem: 7, wall: 9, gap: 1, notch: 6, bowl: 13, R: 2, bowlR: 3.5, r: 0.75, radius: 6 },
  48: { x: 12, y: 9, width: 24, height: 30, stem: 10, wall: 13, gap: 2, notch: 9, bowl: 19, R: 3, bowlR: 5, r: 1, radius: 9 },
};

/** Scale the master grid; with whole-number scale steps every edge stays on the pixel grid. */
export function scaled(unit, x = 0, y = 0) {
  const g = {};
  for (const [key, value] of Object.entries(master)) g[key] = value * unit;
  return { ...g, x, y };
}

/** Icon geometry for a given size: hinted below 64 px, master grid scaled above. */
export function iconGeometry(size) {
  if (hinted[size]) return hinted[size];
  const unit = (size * 4) / 256;
  const g = scaled(unit, (size - master.width * unit) / 2, (size - master.height * unit) / 2);
  return { ...g, radius: size * 0.1875 };
}

// Corner helper: from the current point, line to the start of the arc and arc to its end.
function corner(cx, cy, fromDir, toDir, radius, sweep) {
  const [fx, fy] = fromDir;
  const [tx, ty] = toDir;
  const start = [cx - fx * radius, cy - fy * radius];
  const end = [cx + tx * radius, cy + ty * radius];
  if (radius === 0) return `L${round(cx)} ${round(cy)}`;
  return `L${round(start[0])} ${round(start[1])}A${round(radius)} ${round(radius)} 0 0 ${sweep} ${round(end[0])} ${round(end[1])}`;
}

/** Path data of the graphite part. Convex corners sweep 1, concave corners sweep 0. */
export function partPath(g) {
  const { x, y, width: w, height: h, stem, wall, gap, notch, bowl, R, bowlR, r } = g;
  const under = notch + gap; // top of the part below the notch
  const right = [1, 0];
  const down = [0, 1];
  const left = [-1, 0];
  const up = [0, -1];
  return [
    `M${round(x + R)} ${round(y)}`,
    corner(x + wall, y, right, down, r, 1),
    corner(x + wall, y + under, down, right, r, 0),
    corner(x + w, y + under, right, down, r, 1),
    corner(x + w, y + bowl, down, left, bowlR, 1),
    corner(x + stem, y + bowl, left, down, r, 0),
    corner(x + stem, y + h, down, left, r, 1),
    corner(x, y + h, left, up, r, 1),
    corner(x, y, up, right, R, 1),
    'Z',
  ].join('');
}

/** Path data of the companion part (top right corner carries the outer radius). */
export function buddyPath(g) {
  const { x, y, width: w, wall, gap, notch, R, r } = g;
  const left = x + wall + gap;
  const right = x + w;
  const top = y;
  const bottom = y + notch;
  const outer = Math.min(R, (right - left) / 2);
  return [
    `M${round(left + r)} ${round(top)}`,
    corner(right, top, [1, 0], [0, 1], outer, 1),
    corner(right, bottom, [0, 1], [-1, 0], r, 1),
    corner(left, bottom, [-1, 0], [0, -1], r, 1),
    corner(left, top, [0, -1], [1, 0], r, 1),
    'Z',
  ].join('');
}

/** Rounded square for the app icon tile. */
export function tilePath(size, radius) {
  const s = size;
  const q = radius;
  return `M${round(q)} 0H${round(s - q)}A${round(q)} ${round(q)} 0 0 1 ${round(s)} ${round(q)}V${round(s - q)}A${round(q)} ${round(q)} 0 0 1 ${round(s - q)} ${round(s)}H${round(q)}A${round(q)} ${round(q)} 0 0 1 0 ${round(s - q)}V${round(q)}A${round(q)} ${round(q)} 0 0 1 ${round(q)} 0Z`;
}

export { round };
