import { describe, expect, it } from 'vitest';

import { Overhang, overhangLimits, overhangOf, smallOverhangReach } from './overhang';
import { circle, ears, gridBody, lathe, lyingTube, meshOf, prismBody, revolved, ringSurface, soup, type RawMesh } from './testShapes';

/**
 * Every case of the three reviews of the print check (pull request 353), each with what it should
 * give: the area (mm²) that needs support. Each is also checked turned on the bed and mirrored: the
 * answer must not depend on how the part lies or which way round it was drawn.
 */

type Point = [number, number, number];

/** What a case should give: an area (within 3 %), 'free' (under 1 mm², the print check's noise), 'reported' (1 mm² or more), or a range. */
type Want = number | 'free' | 'reported' | [number, number];

const TURNS = [0, 1, 7.5, 15, 30, 45, 60, 75, 90];

function area(mesh: RawMesh, degrees = 0, mirrored = false): number {
  const cos = Math.cos((degrees * Math.PI) / 180);
  const sin = Math.sin((degrees * Math.PI) / 180);
  const source = mesh.positions;
  const positions = new Float32Array(source.length);
  let bed = Infinity;
  for (let i = 0; i < source.length; i += 3) {
    const x = (mirrored ? -1 : 1) * (source[i] ?? 0);
    positions[i] = cos * x - sin * (source[i + 1] ?? 0);
    positions[i + 1] = sin * x + cos * (source[i + 1] ?? 0);
    positions[i + 2] = source[i + 2] ?? 0;
    bed = Math.min(bed, positions[i + 2] ?? 0);
  }
  // Mirrored, the triangles turn the other way round.
  const index = mirrored ? Uint32Array.from(mesh.index, (_, i) => mesh.index[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i] ?? 0) : mesh.index;
  return overhangOf({ ...mesh, positions, index, normals: new Float32Array(source.length) }, bed, overhangLimits(45), smallOverhangReach(0.4)).area[Overhang.Support];
}

const meets = (found: number, want: Want): boolean => {
  if (want === 'free') return found < 1;
  if (want === 'reported') return found >= 1;
  if (Array.isArray(want)) return found >= want[0] && found <= want[1];
  return Math.abs(found - want) <= Math.max(0.5, want * 0.03);
};

const arc = (cx: number, cz: number, r: number, from: number, to: number, n: number): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });

// ---- the shapes -------------------------------------------------------------------------------------------------

// Two walls 2 mm thick, `span` apart, `length` deep and 8 high, under a roof 2 mm thick.
const portal = (span: number, length = 30) => meshOf(gridBody('Portal', [0, 2, 2 + span, 4 + span], [0, length], [0, 8, 10], (i, _j, k) => k === 1 || i !== 1));
const meshed = meshOf(gridBody('Meshed', [0, 2, 4.5, 7.5, 10, 12], [0, 13.5, 16.5, 30], [0, 8, 10], (i, _j, k) => k === 1 || i === 0 || i === 4));
const pocket = (span: number) => meshOf(gridBody('Pocket', [0, 2, 2 + span, 4 + span], [0, 2, 32, 34], [0, 8, 10], (i, j, k) => k === 1 || i !== 1 || j !== 1));
const arm = meshOf(gridBody('Arm', [0, 2, 42], [0, 30], [0, 8, 10], (i, _j, k) => k === 1 || i === 0));
// The roof of a blind T-slot: a slot 3 mm wide down the middle, joined at the back, arms `wide` out.
const slotted = (wide: number, slot = true) => meshOf(gridBody('Slot', [0, 2, 2 + wide, 5 + wide, 5 + 2 * wide, 7 + 2 * wide], [0, 27, 30, 32], [0, 8, 10], (i, j, k) => (k === 1 ? !(slot && i === 2 && j === 0) : i === 0 || i === 4 || j === 2)));
// The ring a counterbore of `outer` leaves under a through hole of `inner` (both square).
const bore = (outer: number, inner: number, hole = true) => {
  const cuts = [0, 2, 2 + (outer - inner) / 2, 2 + (outer + inner) / 2, 2 + outer, 4 + outer];
  return meshOf(gridBody('Bore', cuts, cuts, [0, 3, 10], (i, j, k) => (k === 1 ? !(hole && i === 2 && j === 2) : i === 0 || i === 4 || j === 0 || j === 4)));
};
// A bridge of 8 mm with a hole 3 × 3 mm through its middle.
const holed = (length: number) => meshOf(gridBody('Holed', [0, 2, 4.5, 7.5, 10, 12], [0, length / 2 - 1.5, length / 2 + 1.5, length], [0, 8, 10], (i, j, k) => (k === 1 ? !(i === 2 && j === 1) : i === 0 || i === 4)));
// A shelf 8 mm out of a wall, with something hanging from its tip.
const shelf = (lip: [number, number][]) => meshOf(prismBody('Shelf', [[0, 0], [5, 0], [5, 16], [13, 16], ...lip, [15, 20], [0, 20]], 30));
const sealed = meshOf(gridBody('Sealed', [0, 2, 10, 12], [0, 2, 32, 34], [0, 2, 8, 10], (i, j, k) => k !== 1 || i !== 1 || j !== 1));
const tray = meshOf(gridBody('Tray', [0, 2, 10, 12], [0, 30], [0, 2, 8, 10], (i, _j, k) => k !== 1 || i !== 1));
// A tunnel under a roof given by its outline between the legs (4 mm thick, the roof starting 4 mm up).
const onLegs = (roof: [number, number][], width: number, top: number) => meshOf(prismBody('Hole', [[0, 0], [4, 0], ...roof, [4 + width, 0], [8 + width, 0], [8 + width, top], [0, top]], 30));
const arch = (d: number, segments = 48) => onLegs(arc(4 + d / 2, 4, d / 2, 180, 0, segments), d, 10 + d / 2);
const filleted = (span: number, r: number) => meshOf(prismBody('Fillet', [[0, 0], [4, 0], ...arc(4 + r, 8 - r, r, 180, 90, 12), ...arc(4 + span - r, 8 - r, r, 90, 0, 12), [4 + span, 0], [8 + span, 0], [8 + span, 14], [0, 14]], 30));
// A tunnel whose roof corners are cut `c` mm at 30° from the horizontal.
const cut = (span: number, c: number) => onLegs([[4, 8 - c * Math.tan(Math.PI / 6)], [4 + c, 8], [4 + span - c, 8], [4 + span, 8 - c * Math.tan(Math.PI / 6)]], span, 14);
const chamfered = (span: number, c: number) => onLegs([[4, 8 - c], [4 + c, 8], [4 + span - c, 8], [4 + span, 8 - c]], span, 14);
// A lying hexagon pocket of the width across flats: a corner up (a roof of two flats at 30°), or a flat up.
const hexCornerUp = (flats: number) => onLegs([[4, 4], [4 + flats / 2, 4 + (flats / 2) * Math.tan(Math.PI / 6)], [4 + flats, 4]], flats, 4 + flats);
const hexFlatUp = (flats: number) => {
  const a = flats / Math.sqrt(3);
  return onLegs([[4, 4], [4 + a / 2, 4 + flats / 2], [4 + 1.5 * a, 4 + flats / 2], [4 + 2 * a, 4]], 2 * a, 6 + flats);
};
const frame = (wide: number, post = 10) => {
  const cuts = [0, 2, 2 + wide, 2 + wide + post, 2 + 2 * wide + post, 4 + 2 * wide + post];
  return meshOf(gridBody('Frame', cuts, cuts, [0, 8, 10], (i, j, k) => k === 1 || !(i >= 1 && i <= 3 && j >= 1 && j <= 3 && !(i === 2 && j === 2))));
};
// A wall and an apron 2 mm thick hanging 4 mm from the roof, 8 mm apart, with cheeks at the ends named.
const apron = (length: number, cheeks: ('front' | 'back')[], hangs = true) => {
  const ys = [0, ...(cheeks.includes('front') ? [2] : []), length + (cheeks.includes('front') ? 2 : 0), ...(cheeks.includes('back') ? [length + (cheeks.includes('front') ? 4 : 2)] : [])];
  const cheek = (j: number) => (cheeks.includes('front') && j === 0) || (cheeks.includes('back') && j === ys.length - 2);
  return meshOf(gridBody('Apron', [0, 2, 10, 12], ys, [0, 4, 8, 10], (i, j, k) => k === 2 || i === 0 || cheek(j) || (hangs && i === 2 && k === 1)));
};
/** Steps going out and up: `out` mm out, then `up` mm up along a riser that leans `lean` mm further out. */
const stair = (out: number, up: number, steps: number, lean = 0, base = 4) => {
  const outline: [number, number][] = [[0, 0], [5, 0], [5, base]];
  let [x, z] = [5, base];
  for (let s = 0; s < steps; s += 1) {
    x += out;
    outline.push([x, z]);
    x += lean;
    z += up;
    outline.push([x, z]);
  }
  outline.push([x, z + 2], [0, z + 2]);
  return meshOf(prismBody('Stair', outline, 20));
};
// The shelf with a pointed drip edge, and with a cheek 2 mm thick at one end that the lip runs into.
const DRIP: [number, number][] = [[0, 0], [5, 0], [5, 16], [13, 16], [13, 14], [15, 16], [15, 20], [0, 20]];
const CHEEK: [number, number][] = [[0, 0], [5, 0], [15, 0], [15, 16], [15, 20], [0, 20]];
const sides = (outline: [number, number][], from: number, to: number): Point[][] =>
  outline.flatMap(([x, z], i) => {
    const [x2, z2] = outline[(i + 1) % outline.length] ?? [0, 0];
    return [[[x, from, z], [x2, to, z2], [x2, from, z2]], [[x, from, z], [x, to, z], [x2, to, z2]]] as Point[][];
  });
const cap = (triangles: [number, number][][], y: number, flip: boolean): Point[][] => triangles.map(([a, b, c]) => (flip ? [[a?.[0] ?? 0, y, a?.[1] ?? 0], [c?.[0] ?? 0, y, c?.[1] ?? 0], [b?.[0] ?? 0, y, b?.[1] ?? 0]] : [[a?.[0] ?? 0, y, a?.[1] ?? 0], [b?.[0] ?? 0, y, b?.[1] ?? 0], [c?.[0] ?? 0, y, c?.[1] ?? 0]]));
const at = (outline: [number, number][], ...corners: number[]): [number, number][] => corners.map((i): [number, number] => outline[i] ?? [0, 0]);
const DRIP_CAP = [at(DRIP, 0, 1, 2), at(DRIP, 0, 2, 7), at(DRIP, 2, 3, 6), at(DRIP, 2, 6, 7), at(DRIP, 3, 4, 5), at(DRIP, 3, 5, 6)];
const BETWEEN: [number, number][][] = [[[5, 0], [15, 0], [13, 14]], [[15, 0], [15, 16], [13, 14]], [[5, 0], [13, 14], [13, 16]], [[5, 0], [13, 16], [5, 16]]];
const CHEEK_CAP = [at(CHEEK, 5, 0, 1), at(CHEEK, 5, 1, 2), at(CHEEK, 5, 2, 3), at(CHEEK, 5, 3, 4)];
const dripOnly = (length: number) => soup([...cap(DRIP_CAP, 0, false), ...sides(DRIP, 0, length), ...cap(DRIP_CAP, length, true)]);
const dripCheek = (length: number) => soup([...cap(DRIP_CAP, 0, false), ...sides(DRIP, 0, length), ...cap(BETWEEN, length, false), ...sides(CHEEK, length, length + 2), ...cap(CHEEK_CAP, length + 2, true)]);
// A pocket of `n` sides inscribed in the diameter `d`, under a ceiling, in a body 2 mm thick round it.
const pocketN = (d: number, n: number) => {
  const outer = circle(d / 2 + 2, 0, n);
  const inner = circle(d / 2, 0, n);
  const lift = (p: Point | undefined, z: number): Point => [p?.[0] ?? 0, p?.[1] ?? 0, z];
  const triangles: Point[][] = [];
  for (let k = 0; k < n; k += 1) {
    const j = (k + 1) % n;
    triangles.push([lift(outer[k], 0), lift(outer[j], 0), lift(outer[j], 10)], [lift(outer[k], 0), lift(outer[j], 10), lift(outer[k], 10)]);
    triangles.push([lift(inner[k], 0), lift(inner[j], 8), lift(inner[j], 0)], [lift(inner[k], 0), lift(inner[k], 8), lift(inner[j], 8)]);
    triangles.push([lift(outer[k], 0), lift(inner[j], 0), lift(outer[j], 0)], [lift(outer[k], 0), lift(inner[k], 0), lift(inner[j], 0)]);
    triangles.push([[0, 0, 8], lift(inner[j], 8), lift(inner[k], 8)]);
    triangles.push([[0, 0, 10], lift(outer[k], 10), lift(outer[j], 10)]);
  }
  return soup(triangles);
};
/** An outside thread on a solid core that stands on the bed, as a surface with its bottom. */
const thread = (root: number, crest: number, lift: number, turns: number, n: number) => {
  const helix = (radius: number, add: number, z?: number): Point[] => Array.from({ length: turns * n + 1 }, (_, i) => [radius * Math.cos((i * 2 * Math.PI) / n), radius * Math.sin((i * 2 * Math.PI) / n), z ?? i / n + add]);
  return ringSurface([helix(0, 0, -1), helix(root, 0, -1), helix(root, 0), helix(crest, lift), helix(root, 1)], [-1, 0, 0, 0], false);
};
const engraved = (deep: number, wide: number) => meshOf(gridBody('Engraved', [0, deep, 10], [0, 10, 10 + wide, 20 + wide], [0, 5, 8, 12], (i, j, k) => !(i === 0 && j === 1 && k === 1)));
const snap = (nose: number) => meshOf(prismBody('Snap', [[0, 0], [20, 0], [20, 2], [12, 2], [12, 10], [12 + nose, 10], [12 + nose, 11], [12, 11 + nose], [12, 14], [10, 14], [10, 2], [0, 2]], 8));
const tube = (hole: number, segments = 96) => meshOf(lyingTube('Tube', 10, hole / 2, 10, segments));

/**
 * A deck `wide` and 2 thick on a foot at each end (or at one), with a keel `deep` under it, its edge `edge` over the
 * bed, `length` between the feet: each flank two triangles. A V trough or fin when it is deep.
 */
const keelOf = (length: number, deep: number, wide: number, edge: number, feet: 1 | 2 = 2) => {
  const top = edge + deep;
  const foot: [number, number][] = [[0, 0], [wide, 0], [wide, top], [wide, top + 2], [0, top + 2], [0, top]];
  const keel: [number, number][] = [[wide / 2, edge], [wide, top], [wide, top + 2], [0, top + 2], [0, top]];
  const footCap = [at(foot, 0, 1, 2), at(foot, 0, 2, 3), at(foot, 0, 3, 4), at(foot, 0, 4, 5)];
  const beside: [number, number][][] = [[[0, 0], [wide, 0], [wide / 2, edge]], [[0, 0], [wide / 2, edge], [0, top]], [[wide, 0], [wide, top], [wide / 2, edge]]];
  const end = 2 + length;
  const far = feet === 2 ? [...cap(beside, end, false), ...sides(foot, end, end + 2), ...cap(footCap, end + 2, true)] : cap([at(keel, 0, 1, 2), at(keel, 0, 2, 3), at(keel, 0, 3, 4)], end, true);
  return soup([...cap(footCap, 0, false), ...sides(foot, 0, 2), ...cap(beside, 2, true), ...sides(keel, 2, end), ...far]);
};
/**
 * What of a keel's flanks hangs (mm²): each foot carries a wedge of them that widens at the angle (45° and the 1° of
 * tolerance), and the rest begins in the air. The drawn keel 4 × 5 between feet 30 apart: 5/6 of its flanks.
 */
const keelHanging = (length: number, deep: number, wide: number, feet: 1 | 2 = 2) => {
  const grow = Math.tan((46 * Math.PI) / 180);
  // Of the flank's height, the part the wedges have not met yet, times the length they leave.
  const met = Math.min(deep, length / (feet * grow));
  return 2 * (length * met - (feet * grow * met * met) / 2) * (Math.hypot(deep, wide / 2) / deep);
};
const keel = keelOf(30, 5, 4, 1);
// A box in profile, 30 long: walls 1 mm thick that step 1.8 mm outwards 10 mm up on a floor 0.4 mm thick, under a roof or with a lip 1.5 mm out.
const steppedBox = meshOf(gridBody('Stepped', [0, 1, 1.8, 2.8, 8.8, 9.8, 10.6, 11.6], [0, 30], [0, 10, 10.4, 14, 15], (i, _j, k) => (k === 0 ? i === 2 || i === 4 : k === 1 ? i <= 2 || i >= 4 : k === 2 ? i === 0 || i === 6 : true)));
const steppedWall = meshOf(gridBody('Stepped', [-1.5, 0, 1, 1.8, 2.8], [0, 30], [0, 10, 10.4, 14, 15], (i, _j, k) => (k === 0 ? i === 3 : k === 1 ? i >= 1 : k === 2 ? i === 1 : i <= 1)));
// A portal of 8 mm with a V rib along under its roof (4.4 wide, 4 deep), and what else hangs on the same body.
const ribbed = (more: [number, number][] = [], strip: [number, number][] = []) => meshOf(prismBody('Rib', [[0, 0], [2, 0], [2, 8], ...strip, [3.8, 8], [6, 4], [8.2, 8], [10, 8], [10, 0], [12, 0], ...more, [0, 10]], 30));
const RIB_FLANKS = 2 * 30 * Math.hypot(2.2, 4);
// A blade hanging along under a bridge of 8 mm, 20 long: `wide` at its root, `deep`, its edge 4 mm over the bed.
const blade = (wide: number, deep: number) => meshOf(prismBody('Blade', [[0, 0], [2, 0], [2, 4 + deep], [6 - wide / 2, 4 + deep], [6, 4], [6 + wide / 2, 4 + deep], [10, 4 + deep], [10, 0], [12, 0], [12, 6 + deep], [0, 6 + deep]], 20));
// A plate 4.4 wide on an end wall, with a V rib under it whose edge rises 5° from the wall, beginning `low` mm over the bed.
const RISE = 30 * Math.tan((5 * Math.PI) / 180);
const risingRib = (low: number) => {
  const wall: [number, number][] = [[0, 0], [4.4, 0], [4.4, 10], [4.4, 12], [0, 12], [0, 10]];
  const rib = (tip: number): [number, number][] => [[2.2, tip], [4.4, 10], [4.4, 12], [0, 12], [0, 10]];
  const [near, far] = [rib(low), rib(low + RISE)];
  const loft: Point[][] = near.flatMap(([x, z], i) => {
    const j = (i + 1) % near.length;
    const [a, b, c, d]: Point[] = [[x, 2, z], [near[j]?.[0] ?? 0, 2, near[j]?.[1] ?? 0], [far[j]?.[0] ?? 0, 32, far[j]?.[1] ?? 0], [far[i]?.[0] ?? 0, 32, far[i]?.[1] ?? 0]];
    return [[a ?? [0, 0, 0], c ?? [0, 0, 0], b ?? [0, 0, 0]], [a ?? [0, 0, 0], d ?? [0, 0, 0], c ?? [0, 0, 0]]];
  });
  const beside: [number, number][][] = [[[0, 0], [4.4, 0], [2.2, low]], [[0, 0], [2.2, low], [0, 10]], [[4.4, 0], [4.4, 10], [2.2, low]]];
  return soup([...cap([at(wall, 0, 1, 2), at(wall, 0, 2, 3), at(wall, 0, 3, 4), at(wall, 0, 4, 5)], 0, false), ...sides(wall, 0, 2), ...cap(beside, 2, true), ...loft, ...cap([at(far, 0, 1, 2), at(far, 0, 2, 3), at(far, 0, 3, 4)], 32, true)]);
};
/** The two flanks of that rib (mm²). */
const risingFlanks = (low: number) => {
  const size = (a: Point, b: Point, c: Point) => Math.hypot((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  return 2 * (size([2.2, 2, low], [0, 2, 10], [0, 32, 10]) + size([2.2, 2, low], [0, 32, 10], [2.2, 32, low + RISE]));
};
// A wall with a ledge `out` mm wide 5 mm up, and from the tip of the ledge a slope at 45° over 5 mm.
const slopeOnLedge = (out: number) => meshOf(prismBody('Slope', [[0, 0], [5, 0], [5, 5], [5 + out, 5], [10 + out, 10], [10 + out, 12], [0, 12]], 30));

// A column on the bed with a corner of 32° in plan, and a wedge floating in the air, its edge 0.6 mm from that corner.
const WEDGE: [number, number][] = [[10.6, 3], [13, 6], [10.6, 6]];
const besideCorner = (() => {
  const plan: [number, number][] = [[10, 0], [-5, 4.3], [-5, -4.3]];
  const lift = (i: number, z: number): Point => [plan[i % 3]?.[0] ?? 0, plan[i % 3]?.[1] ?? 0, z];
  const column: Point[][] = [[lift(0, 0), lift(2, 0), lift(1, 0)], [lift(0, 12), lift(1, 12), lift(2, 12)], ...[0, 1, 2].flatMap((i) => [[lift(i, 0), lift(i + 1, 0), lift(i + 1, 12)], [lift(i, 0), lift(i + 1, 12), lift(i, 12)]])];
  return soup([...column, ...cap([WEDGE], -5, false), ...sides(WEDGE, -5, 5), ...cap([WEDGE], 5, true)]);
})();
/** A funnel whose outline is a star of five points, each layer 9 % wider than the one a millimetre below. */
const starFunnel = (() => {
  const star = (scale: number, z: number): Point[] => Array.from({ length: 10 }, (_, i) => [(i % 2 === 0 ? 10 : 4) * scale * Math.cos((i * Math.PI) / 5), (i % 2 === 0 ? 10 : 4) * scale * Math.sin((i * Math.PI) / 5), z]);
  return ringSurface([star(0, 0), star(1, 0), star(1.45, 5), star(0, 5)], [-1, 0, 1]);
})();

/** A funnel of `n` flat sides at 45° that opens upwards over 5 mm, with a ledge 1.5 mm out round its top. */
const funnel = (n: number) => {
  const top = 5 + 5 / Math.cos(Math.PI / n);
  return revolved([[0, 0], [5, 0], [top, 5], [top + 1.5, 5], [top + 1.5, 7], [0, 7]], [-1, 0, -1, 0, 1], n);
};

/** A stalactite or cone `deep` hanging from the ceiling of a round pocket of radius `pocket`, its tip `tip` over the bed. */
const hangingCone = (radius: number, deep: number, tip: number, pocket: number, n = 48) => lathe([[0, tip], [radius, tip + deep], [pocket, tip + deep], [pocket, 0], [pocket + 2, 0], [pocket + 2, tip + deep + 2], [0, tip + deep + 2]], n);
/** A block 20 wide, 10 high and 30 long, its bottom edges rounded R `r` in `n` facets each, on a foot `foot` high as wide as its flat. */
const rounded = (r: number, n: number, foot = 0) =>
  meshOf(prismBody('Rounded', [...(foot > 0 ? [[r, 0], [20 - r, 0]] as [number, number][] : []), ...arc(20 - r, foot + r, r, -90, 0, n), [20, foot + 10], [0, foot + 10], ...arc(r, foot + r, r, 180, 270, n)], 30));
/**
 * The knuckle of a lying hinge as mechanisms.ts builds it (web()), in (x, z) counter-clockwise: a barrel of radius `r`
 * on the line `line` over the bed, its own wall `distance` from the line, and the web at 45° from where the barrel
 * leans 45° on the far side down to that wall.
 */
const knuckleOutline = (r: number, distance: number, line: number): [number, number][] => {
  const barrel = arc(0, line, r, -45, 180, 48);
  return [[-distance - 10, 0], [-distance, 0], [-distance, line - r * Math.SQRT2 - distance], ...barrel, [-distance - 10, line]];
};
/**
 * The fixed body of that hinge: knuckles 6.48 long, each on its web and a piece of wall, and between them the pin of
 * radius r/2, cut flat underneath where it leans 45° (pinFlat()), a bridge 6.48 from knuckle to knuckle.
 */
const hingeRow = (r: number, distance: number, line: number, knuckles = 3, long = 6.48) => {
  const knuckle = knuckleOutline(r, distance, line);
  // 35 facets, so that none lies level with the top of the wall.
  const pin = arc(0, line, r / 2, -45, 225, 35);
  const face = (polygon: [number, number][], y: number, facing: 1 | -1): Point[][] =>
    ears(polygon).map(([a, b, c]) => {
      const corner = (i: number): Point => [polygon[i]?.[0] ?? 0, y, polygon[i]?.[1] ?? 0];
      return facing < 0 ? [corner(a), corner(b), corner(c)] : [corner(a), corner(c), corner(b)];
    });
  // The end of a knuckle round the pin, in two pieces split from the flat of the pin to the web.
  const corner = (ring: [number, number][], i: number): [number, number] => ring[i] ?? [0, 0];
  const [p0, pe, k2, k3] = [corner(pin, 0), corner(pin, pin.length - 1), corner(knuckle, 2), corner(knuckle, 3)];
  const around: [number, number][][] = [[k2, k3, p0, pe], [...knuckle.slice(3), ...knuckle.slice(0, 3), ...[...pin].reverse()]];
  const triangles: Point[][] = face(knuckle, 0, -1);
  let y = 0;
  for (let k = 0; k < knuckles; k += 1) {
    triangles.push(...sides(knuckle, y, y + long));
    y += long;
    if (k + 1 === knuckles) break;
    triangles.push(...around.flatMap((piece) => face(piece, y, 1)), ...sides(pin, y, y + long));
    y += long;
    triangles.push(...around.flatMap((piece) => face(piece, y, -1)));
  }
  return soup([...triangles, ...face(knuckle, y, 1)]);
};

// ---- the cases --------------------------------------------------------------------------------------------------

const cases: [string, () => RawMesh, Want][] = [
  // Bridges between two walls (audit MG-01, N-mechanik-1; first and second review).
  ['bridge 3', () => portal(3), 'free'],
  ['bridge 5', () => portal(5), 'free'],
  ['bridge 5.97, the narrowest groove of a guide', () => portal(5.97), 'free'],
  ['bridge 8', () => portal(8), 'free'],
  ['bridge 10', () => portal(10), 'free'],
  ['bridge 10.001', () => portal(10.001), 300.03],
  ['bridge 13.9', () => portal(13.9), 417],
  ['bridge 27.9', () => portal(27.9), 837],
  ['bridge 101.9', () => portal(101.9), 3057],
  ['bridge 8, roof meshed as a grid', () => meshed, 'free'],
  ['bridge 0.3 long and 9.9 wide', () => meshOf(gridBody('Narrow', [0, 2, 11.9, 13.9], [0, 0.3], [0, 8, 10], (i, _j, k) => k === 1 || i !== 1)), 'free'],
  ['pocket 8, closed at both ends', () => pocket(8), 'free'],
  ['pocket 9.95', () => pocket(9.95), 'free'],
  ['arm 40', () => arm, 1200],
  // What ends at a free edge or a hole is no bridge (second review).
  ['T-slot roof, arms 1.5', () => slotted(1.5), 'free'],
  ['T-slot roof, arms 1.8', () => slotted(1.8), 'free'],
  ['T-slot roof, arms 1.9', () => slotted(1.9), [95, 125]],
  ['T-slot roof, arms 2', () => slotted(2), [100, 130]],
  ['T-slot roof, arms 3', () => slotted(3), [155, 190]],
  ['T-slot roof, arms 5', () => slotted(5), [265, 330]],
  ['T-slot roof without the slot', () => slotted(3, false), 'free'],
  ['counterbore 6 with hole 3.4: ledge 1.3', () => bore(6, 3.4), 'free'],
  ['counterbore 7 with hole 3.4: ledge 1.8', () => bore(7, 3.4), 'free'],
  ['counterbore 7 with hole 4.4: ledge 1.3', () => bore(7, 4.4), 'free'],
  ['counterbore 9 with hole 4: ledge 2.5', () => bore(9, 4), 'reported'],
  ['counterbore 10 with hole 5.5: ledge 2.25', () => bore(10, 5.5), 'reported'],
  ['counterbore 9 without the hole', () => bore(9, 4, false), 'free'],
  ['bridge 8 with a hole 3 × 3, 30 long', () => holed(30), [10, 60]],
  ['bridge 8 with a hole 3 × 3, 100 long', () => holed(100), [10, 60]],
  // Nothing hangs from material that ends in the air (first, second and third review).
  ['shelf 10', () => meshOf(prismBody('Shelf', [[0, 0], [5, 0], [5, 16], [15, 16], [15, 20], [0, 20]], 30)), 300],
  // The lips begin in the air: besides the shelf's 240 mm² their faces at 45° are reported, 30 mm long each
  // (review of pull request 363; before the layers only faces over the limit could be).
  ['shelf 8 with a drip edge', () => shelf([[13, 14], [15, 16]]), 240 + 30 * 2 * Math.SQRT2],
  ['shelf 8 with a hook curled back to the wall', () => shelf([[13, 13], [11, 13], [11, 12.5], [13, 10.5], [15, 12.5]]), 240 + 2 * 30 * 2 * Math.SQRT2],
  ['shelf 8 with a lip with a step of 0.5 that looks up', () => shelf([[13, 13], [12.5, 13], [12.5, 12.5], [13.75, 11.25], [15, 12.5]]), 240 + 2 * 30 * 1.25 * Math.SQRT2],
  ['shelf 8 with a bead whose back looks up', () => shelf([[12, 14], [13.5, 12.5], [15, 14]]), 240 + 2 * 30 * 1.5 * Math.SQRT2],
  ['shelf 8 with an apron 6 down, 2 wide', () => shelf([[13, 10], [15, 10]]), 300],
  ['shelf 8 onto a second wall down to the bed', () => meshOf(prismBody('Portal', [[0, 0], [5, 0], [5, 16], [13, 16], [13, 0], [15, 0], [15, 20], [0, 20]], 30)), 'free'],
  ['shelf 8 with a pointed drip edge, as triangles', () => dripOnly(30), 240 + 30 * 2 * Math.SQRT2],
  // The ranges of the review, plus the lip's face (2.83 mm² per mm of length).
  ['the same with a cheek at one end, 30 long: the lip stands only at the cheek', () => dripCheek(30), [280, 330]],
  ['the same, 100 long', () => dripCheek(100), [1030, 1090]],
  ['bridge 8 onto an apron hanging from the roof', () => apron(30, []), 300],
  ['the same with a cheek at the back', () => apron(30, ['back']), [270, 305]],
  ['the same with a cheek at the front', () => apron(30, ['front']), [270, 305]],
  ['a cheek only, no apron: a plate 8 × 30 held on two sides', () => apron(30, ['back'], false), [230, 305]],
  ['an apron 60 long between two cheeks', () => apron(60, ['front', 'back']), [540, 605]],
  ['ceiling 8 that ends on a step 2 down of a ceiling 22 wide', () => meshOf(prismBody('Step', [[0, 0], [2, 0], [2, 16], [10, 16], [10, 14], [32, 14], [32, 0], [34, 0], [34, 20], [0, 20]], 30)), 900],
  ['a rib along under a 9 mm bridge, hanging free', () => meshOf(gridBody('Rib', [0, 2, 5.5, 7.5, 11, 13], [0, 30], [0, 6, 8, 10], (i, _j, k) => k === 2 || i === 0 || i === 4 || (k === 1 && i === 2))), 270],
  ['a rib across under a 9 mm bridge', () => meshOf(gridBody('Rib', [0, 2, 11, 13], [0, 14, 16, 30], [0, 6, 8, 10], (i, j, k) => k === 2 || i !== 1 || (k === 1 && j === 1))), 'free'],
  ['box on the floor of a tray', () => tray, 'free'],
  ['a cavity closed all round, 8 wide', () => sealed, 'free'],
  // Steps going out (third review): each step small, the stair as a whole an overhang.
  ['stair 1 out per 1 up (45°)', () => stair(1, 1, 20), 'free'],
  ['stair 1.7 per 1 (60°)', () => stair(1.7, 1, 20), 'reported'],
  ['stair 1.8 per 1 (61°)', () => stair(1.8, 1, 20), 'reported'],
  ['stair 2 per 1 (63°)', () => stair(2, 1, 20), 800],
  ['stair 1.7 per 0.2 (83°)', () => stair(1.7, 0.2, 20), 'reported'],
  ['stair 1.7 per 0.05 (88°), 40 steps', () => stair(1.7, 0.05, 40), 'reported'],
  ['stair 1 per 0.2 (79°), 40 steps', () => stair(1, 0.2, 40), 'reported'],
  ['stair 1.7 out, then a riser leaning 44°', () => stair(1.7, 1, 15, 0.96), 'reported'],
  ['a T beam: stem 4, 6 out each side', () => meshOf(prismBody('T', [[6, 0], [10, 0], [10, 10], [16, 10], [16, 12], [0, 12], [0, 10], [6, 10]], 30)), 360],
  ['the same T beam as a grid', () => meshOf(gridBody('T', [0, 6, 10, 16], [0, 30], [0, 10, 12], (i, _j, k) => k === 1 || i === 1)), 360],
  // Ceilings held on some sides (third review).
  ['L ceiling 30 × 30, legs 8, walls on the two outer sides only', () => meshOf(gridBody('L', [0, 2, 10, 32], [0, 2, 10, 32], [0, 8, 10], (i, j, k) => !(i === 2 && j === 2) && (k === 1 || i === 0 || j === 0))), 416],
  ['ceiling 9 × 60 resting on its short ends', () => meshOf(gridBody('Long', [0, 9], [0, 2, 62, 64], [0, 8, 10], (_i, j, k) => k === 1 || j !== 1)), 540],
  ['ceiling 9 × 12 resting on its short ends', () => meshOf(gridBody('Long', [0, 9], [0, 2, 14, 16], [0, 8, 10], (_i, j, k) => k === 1 || j !== 1)), 108],
  ['corner plate 10 × 30 held on two adjacent sides', () => meshOf(gridBody('Corner', [0, 2, 12], [0, 2, 32], [0, 8, 10], (i, j, k) => k === 1 || i === 0 || j === 0)), 300],
  ['corner plate 8 × 8', () => meshOf(gridBody('Corner', [0, 2, 10], [0, 2, 10], [0, 8, 10], (i, j, k) => k === 1 || i === 0 || j === 0)), 64],
  ['pocket 8 wide and 30 deep, open at the front', () => meshOf(gridBody('U', [0, 2, 10, 12], [0, 2, 32], [0, 8, 10], (i, j, k) => k === 1 || i !== 1 || j === 0)), 'free'],
  ['niche 30 wide and 8 deep with a free front edge', () => meshOf(gridBody('U', [0, 2, 32, 34], [0, 2, 10], [0, 8, 10], (i, j, k) => k === 1 || i !== 1 || j === 0)), 240],
  ['niche 30 wide and 12 deep', () => meshOf(gridBody('U', [0, 2, 32, 34], [0, 2, 14], [0, 8, 10], (i, j, k) => k === 1 || i !== 1 || j === 0)), 360],
  ['flange 10 out on a tube', () => revolved([[5, 0], [5, 10], [15, 10], [15, 12]], [0, -1, 0]), 628],
  ['flange 1.5 out', () => revolved([[5, 0], [5, 10], [6.5, 10], [6.5, 12]], [0, -1, 0]), 'free'],
  ['flange 2 out', () => revolved([[5, 0], [5, 10], [7, 10], [7, 12]], [0, -1, 0]), 75.3],
  ['the lip of a box 1.5 out', () => revolved([[20, 0], [20, 18], [21.5, 18], [21.5, 20]], [0, -1, 0]), 'free'],
  ['the lip of a box 2 out', () => revolved([[20, 0], [20, 18], [22, 18], [22, 20]], [0, -1, 0]), 263.7],
  // Channels that change direction, walled all round (third review).
  ['L channel 8 wide', () => meshOf(gridBody('L', [0, 2, 10, 32, 34], [0, 2, 10, 32, 34], [0, 8, 10], (i, j, k) => k === 1 || !((i === 1 && (j === 1 || j === 2)) || (j === 1 && (i === 1 || i === 2))))), 'free'],
  ['cross of two channels 8 wide', () => meshOf(gridBody('X', [0, 2, 13, 21, 32, 34], [0, 2, 13, 21, 32, 34], [0, 8, 10], (i, j, k) => k === 1 || !((i === 2 && j >= 1 && j <= 3) || (j === 2 && i >= 1 && i <= 3)))), 'free'],
  ['T of two channels 8 wide', () => meshOf(gridBody('T', [0, 2, 13, 21, 32, 34], [0, 2, 10, 32, 34], [0, 8, 10], (i, j, k) => k === 1 || !((j === 1 && i >= 1 && i <= 3) || (i === 2 && j === 2)))), 'free'],
  ...([[1.5, 10], [3, 10], [3.5, 10], [3.6, 10], [3.7, 10], [5, 10], [8, 10], [3.5, 4], [3, 2]] as const).map(([wide, post]): [string, () => RawMesh, Want] => [`channel ${String(wide)} wide round a post of ${String(post)}`, () => frame(wide, post), 'free']),
  ['ring channel 6 wide', () => revolved([[17, 0], [17, 8], [23, 8], [23, 0]], [0, -1, 0]), 'free'],
  // The roof of a tunnel: its width between the walls counts, not the shape of its sides (third review).
  ...[6, 8, 9, 10].flatMap((span) => [0.5, 1, 2, 3, 4].filter((r) => 2 * r < span).map((r): [string, () => RawMesh, Want] => [`tunnel ${String(span)} with corners rounded R ${String(r)}`, () => filleted(span, r), 'free'])),
  ['tunnel 10 with corners cut 2 mm at 30° from the horizontal', () => cut(10, 2), 'free'],
  ['tunnel 8 with corners cut 2 mm at 30°', () => cut(8, 2), 'free'],
  ['tunnel 14 with corners chamfered 2 mm at 45°: flat 10', () => chamfered(14, 2), 'free'],
  ['tunnel 10 with corners chamfered 2 mm', () => chamfered(10, 2), 'free'],
  ['lying slot 20 wide and 5 high', () => onLegs([...arc(6.5, 4, 2.5, 180, 90, 12), ...arc(21.5, 4, 2.5, 90, 0, 12)], 20, 12), 'reported'],
  ['slot 5 wide and 20 high under a round end', () => onLegs(arc(6.5, 16, 2.5, 180, 0, 24), 5, 24), 'free'],
  ['teardrop hole 12, pointed', () => onLegs([...arc(10, 4, 6, 180, 135, 8), [10, 4 + 6 * Math.SQRT2], ...arc(10, 4, 6, 45, 0, 8)], 12, 18), 'free'],
  ['teardrop hole 12 with a flat top 3 wide', () => onLegs([...arc(10, 4, 6, 180, 135, 8), [8.5, 4 + 6 * Math.SQRT2 - 1.5], [11.5, 4 + 6 * Math.SQRT2 - 1.5], ...arc(10, 4, 6, 45, 0, 8)], 12, 18), 'free'],
  ...([['M3', 5.5], ['M4', 7], ['M5', 8], ['M6', 10]] as const).flatMap(([size, flats]): [string, () => RawMesh, Want][] => [
    [`lying nut pocket ${size}, a corner up`, () => hexCornerUp(flats), 'free'],
    [`lying nut pocket ${size}, a flat up`, () => hexFlatUp(flats), 'free'],
  ]),
  // With the 0.3 mm of room a printed nut gets (screwSizes.ts) the M6 pocket is 10.3 mm wide: over a bridge span.
  ['lying nut pocket M6 with its allowance (10.3), a corner up', () => hexCornerUp(10.3), 'reported'],
  // Holes lying across the layers (first and second review): round up to 8 mm.
  ...[6, 8].map((d): [string, () => RawMesh, Want] => [`arch ${String(d)}`, () => arch(d), 'free']),
  ...[8.5, 9, 10, 12].map((d): [string, () => RawMesh, Want] => [`arch ${String(d)}`, () => arch(d), 'reported']),
  ...[12, 16, 20, 24, 36].flatMap((segments): [string, () => RawMesh, Want][] => [
    [`arch 8 with ${String(segments)} segments`, () => arch(8, segments), 'free'],
    [`arch 9 with ${String(segments)} segments`, () => arch(9, segments), 'reported'],
  ]),
  // Round and many-sided pockets under a ceiling (third review).
  ['round pocket 8', () => pocketN(8, 48), 'free'],
  ['round pocket 10', () => pocketN(10, 48), 'free'],
  ['round pocket 10.3', () => pocketN(10.3, 48), 'reported'],
  ['round pocket 11', () => pocketN(11, 48), 'reported'],
  ['round pocket 12', () => pocketN(12, 48), 'reported'],
  ['pocket of 7 sides in 12', () => pocketN(12, 7), 'reported'],
  ['round pocket 20', () => pocketN(20, 96), 'reported'],
  ['pocket of 3 sides in 11 (8.25 high)', () => pocketN(11, 3), 'free'],
  ['pocket of 5 sides in 9', () => pocketN(9, 5), 'free'],
  ['pocket of 5 sides in 11 (9.95 high)', () => pocketN(11, 5), 'free'],
  ['pocket of 6 sides in 14 (12.1 across flats)', () => pocketN(14, 6), 'reported'],
  // Everyday details (third review).
  ['engraving on a side wall, 3 wide and 1 deep', () => engraved(1, 3), 'free'],
  ['engraving 3 wide and 3 deep', () => engraved(3, 3), 'free'],
  ['niche in a side wall, 12 wide and 3 deep', () => engraved(3, 12), 36],
  ['niche 12 wide and 1.5 deep', () => engraved(1.5, 12), 'free'],
  ['bottom chamfer 2 mm at 45°', () => meshOf(prismBody('Chamfer', [[2, 0], [18, 0], [20, 2], [20, 10], [0, 10], [0, 2]], 30)), 'free'],
  ['thread M6 standing', () => thread(2.46, 3, 0.31, 12, 48), 'free'],
  ['thread with a flank 1.9 deep', () => thread(4, 5.9, 0.2, 6, 48), 'reported'],
  ['snap hook, nose 1.5', () => snap(1.5), 'free'],
  ['snap hook, nose 2', () => snap(2), 16],
  ['snap hook, nose 2.5', () => snap(2.5), 20],
  // Material that begins in the air on faces that only lean (review of pull request 363): no face hangs over, yet nothing is below.
  ['a V rib along under a bridge of 8: 4.4 wide, 4 deep, its edge free', () => ribbed([[12, 10]]), RIB_FLANKS],
  // What else is reported on the body takes nothing from the rib (second review of pull request 363).
  ['the same with a ridge 0.8 wide and 1 deep hanging beside the rib', () => ribbed([[12, 10]], [[2.5, 8], [2.5, 7], [3.3, 7], [3.3, 8]]), RIB_FLANKS + 0.8 * 30 + 0.5 * 30],
  ['the same rib on a body with a shelf 8 out', () => ribbed([[12, 6], [20, 6], [20, 10]]), RIB_FLANKS + 240],
  // A blade with flanks nearly upright begins in the air all the same, and holds no ceiling beside it.
  ['a blade 1 wide and 20 deep hanging along under a bridge of 8', () => blade(1, 20), 7 * 20 + 2 * 20 * Math.hypot(0.5, 20)],
  ['a blade 0.6 wide and 10 deep', () => blade(0.6, 10), 7.4 * 20 + 2 * 20 * Math.hypot(0.3, 10)],
  // The ceiling beside it and its bottom; its sides rest on the support the bottom gets.
  ['a rib 1 wide with a flat bottom and sides drafted 2°, hanging along under a bridge of 8', () => meshOf(prismBody('Peg', [[0, 0], [2, 0], [2, 8], [5.36, 8], [5.5, 4], [6.5, 4], [6.64, 8], [10, 8], [10, 0], [12, 0], [12, 10], [0, 10]], 30)), 2 * 3.36 * 30 + 30],
  // The edge of a rib that rises 5° from a wall: reported wherever it begins against the layers, from the bed too.
  // The wall carries a wedge of each flank that widens at the angle, 9 mm at the root: about a seventh of it.
  ...[0, 1, 1.08, 1.12, 1.2, 1.28].map((low): [string, () => RawMesh, Want] => [`a V rib whose edge rises 5° from an end wall, beginning ${String(low)} over the bed`, () => risingRib(low), [0.75 * risingFlanks(low), 0.92 * risingFlanks(low)]]),
  // The corner of carried material runs ahead of its sides, as a slope of flat sides does, but jumps no gap.
  ['a wedge floating 0.6 mm from the sharp corner of a column', () => besideCorner, 10 * Math.hypot(2.4, 3)],
  ['a funnel in the outline of a star, its points running out at 42°', () => starFunnel, 'free'],
  // A small ledge carries the slope that goes on from its tip.
  ...[0.3, 0.5, 1, 1.5].map((out): [string, () => RawMesh, Want] => [`a slope at 45° from the tip of a ledge ${String(out)} out`, () => slopeOnLedge(out), 'free']),
  ['a countersunk head: shank R 3, shoulder 0.5, cone at 45° to R 8.5', () => revolved([[0, 0], [3, 0], [3, 10], [3.5, 10], [8.5, 15], [8.5, 16], [0, 16]], [-1, 0, -1, 0, 0, 1]), 'free'],
  ['the same rib with a flat bottom', () => meshOf(prismBody('Rib', [[0, 0], [2, 0], [2, 8], [3.8, 8], [3.8, 4], [8.2, 4], [8.2, 8], [10, 8], [10, 0], [12, 0], [12, 10], [0, 10]], 30)), 132],
  ['a V rib under a bridge of 10: 6.4 wide, 6 deep', () => meshOf(prismBody('Rib', [[0, 0], [2, 0], [2, 8], [3.8, 8], [7, 2], [10.2, 8], [12, 8], [12, 0], [14, 0], [14, 10], [0, 10]], 30)), 2 * 30 * Math.hypot(3.2, 6)],
  ['a keel 4 wide and 5 deep between two feet, its edge 1 mm over the bed', () => keel, keelHanging(30, 5, 4)],
  ['a blade 1.5 wide hanging 10 deep, 0.3 beside a wall, pointed at 45°', () => meshOf(prismBody('Blade', [[0, 0], [2, 0], [2, 18], [2.3, 18], [2.3, 8.75], [3.05, 8], [3.8, 8.75], [3.8, 20], [0, 20]], 30)), 2 * 30 * 0.75 * Math.SQRT2],
  ['a wedge standing on its edge on the bed', () => meshOf(prismBody('Wedge', [[2, 0], [4, 4], [0, 4]], 30)), 'free'],
  // A small overhang carries what stands on it (the same review).
  ['walls 1 mm thick that step 1.8 out on a floor of 0.4, under a roof of 9.6', () => steppedBox, 'free'],
  ['a wall that steps 1.8 out on a floor of 0.4, with a lip 1.5 out at its top', () => steppedWall, 'free'],
  // A slope of flat sides: its corners run out faster than its faces (the same review).
  ...[6, 8, 96].map((n): [string, () => RawMesh, Want] => [`ledge 1.5 over a funnel of ${String(n)} sides at 45°`, () => funnel(n), 'free']),
  // A V trough under a plate between two cheeks, its edge 4 over the bed: the flanks hang but for the wedges the
  // cheeks carry, however large their two triangles each (fourth review of pull request 363: points on the
  // triangles missed a strip along the edge, and all of it from 30 × 70 on).
  ...([[30, 30, 40], [30, 50, 40], [30, 70, 40], [14, 26, 20], [14, 28, 20], [12, 24, 20], [20, 45, 30]] as const).map(([length, deep, wide]): [string, () => RawMesh, Want] => [`a V trough ${String(length)} long, ${String(deep)} deep and ${String(wide)} wide between two cheeks`, () => keelOf(length, deep, wide, 4), keelHanging(length, deep, wide)]),
  ...([[8, 60], [15, 100], [8, 30]] as const).map(([length, deep]): [string, () => RawMesh, Want] => [`a V fin ${String(length)} long and ${String(deep)} deep on one cheek`, () => keelOf(length, deep, 4, 4, 1), keelHanging(length, deep, 4, 1)]),
  // Bottom edges rounded on the bed: the part of the round past the angle is a small overhang, and the round on it stands.
  ...([[1, 8], [1, 16], [1.5, 8], [1.5, 16], [2, 8], [2, 16], [2, 32], [2.5, 16]] as const).map(([r, n]): [string, () => RawMesh, Want] => [`a block with its bottom edges rounded R ${String(r)} in ${String(n)} facets`, () => rounded(r, n), 'free']),
  // The fixed body of the hinge of a case (contract test G3): knuckles over the bed on webs at 45°, the pin flat underneath.
  ...([3, 4] as const).map((r): [string, () => RawMesh, Want] => [`the knuckles of a hinge R ${String(r)} on webs at 45°, with the pin between them`, () => hingeRow(r, 2.5, 16), 'free']),
];

/** A hole lying in a tube: what the tube reports beyond its outside alone. */
const holes: [number, number, 'free' | 'reported'][] = [
  ...[16, 20, 24, 36, 48, 96].flatMap((segments): [number, number, 'free' | 'reported'][] => [[8, segments, 'free'], [9, segments, 'reported'], [10, segments, 'reported']]),
  [5, 96, 'free'],
  [6, 96, 'free'],
  [7, 96, 'free'],
];

/**
 * The cases the check still gets wrong (third review, measured on the check as committed): they
 * run as expected failures, so that the one that comes right says so. All are printable shapes that
 * are reported; the overhangs that passed as printable (a lip or an apron held by a cheek only, the
 * stairs) come right since what stands is cut in layers (layers.ts).
 */
const OPEN = new Set([
  'L channel 8 wide',
  'cross of two channels 8 wide',
  'T of two channels 8 wide',
  ...[3.5, 3.6, 3.7, 5, 8].map((wide) => `channel ${String(wide)} wide round a post of 10`),
  'channel 3.5 wide round a post of 4',
  'ring channel 6 wide',
  'tunnel 9 with corners rounded R 4',
  'tunnel 10 with corners rounded R 4',
  'tunnel 10 with corners cut 2 mm at 30° from the horizontal',
  'tunnel 8 with corners cut 2 mm at 30°',
  'lying nut pocket M4, a corner up',
  'lying nut pocket M5, a corner up',
  'lying nut pocket M6, a corner up',
]);

describe('overhangs that hold and overhangs that do not: the cases of the reviews', () => {
  it('names only cases there are as open', () => {
    expect([...OPEN].filter((name) => !cases.some(([known]) => known === name))).toEqual([]);
  });

  describe.each(cases)('%s', (name, build, want) => {
    (OPEN.has(name) ? it.fails : it)('gives what it should, however the part lies', () => {
      const mesh = build();
      const found = area(mesh);
      expect(meets(found, want), `as drawn: ${found.toFixed(1)} mm², should be ${JSON.stringify(want)}`).toBe(true);
      // Turned and mirrored the answer is the same, within 1 %.
      const others = [...TURNS.slice(1).map((degrees): [string, number] => [`turned ${String(degrees)}°`, area(mesh, degrees)]), ...[0, 30].map((degrees): [string, number] => [`mirrored, turned ${String(degrees)}°`, area(mesh, degrees, true)])];
      for (const [how, other] of others) expect(Math.abs(other - found), `${how}: ${other.toFixed(1)} mm² for ${found.toFixed(1)} mm² as drawn`).toBeLessThanOrEqual(Math.max(0.5, found * 0.01));
    });
  });

  // Where a part lies against the layers must not change the answer (fourth review of pull request 363): each of these
  // is moved up in steps of 0.01 mm over a whole layer.
  const lanes = Array.from({ length: 21 }, (_, i) => i / 100);
  const sameIn = (build: (lift: number) => RawMesh, want: Want, lift = lanes) => {
    const found = lift.map((step) => area(build(step)));
    lift.forEach((step, i) => {
      expect(meets(found[i] ?? 0, want), `${step.toFixed(3)} higher: ${(found[i] ?? 0).toFixed(1)} mm², should be ${JSON.stringify(want)}`).toBe(true);
    });
    return found;
  };
  // A point that begins in the air is a piece of its own in its first layer, however small: it does not stand on the
  // tolerance of an area. Each hangs from the ceiling of a round pocket; with it the ceiling beside it is reported.
  it.each([
    ['a stalactite R 1, 8 long, in a pocket of 8', 1, 8, 4, 48],
    ['a cone R 2, 4 long', 2, 4, 4, 48],
    ['a cone R 2, 2 long (45°)', 2, 2, 4, 48],
    ['a cone R 1, 4 long, of 24 sides', 1, 4, 4, 24],
    ['a stalactite R 0.5, 8 long, in a pocket of 4', 0.5, 8, 2, 48],
  ] as const)('%s is reported wherever its tip lies against the layers', (_name, radius, deep, pocket, n) => {
    const found = sameIn((lift) => hangingCone(radius, deep, 2 + lift, pocket, n), 'reported', [...lanes, ...lanes.map((lane) => lane + 0.005)]);
    expect(Math.max(...found) - Math.min(...found)).toBeLessThanOrEqual(Math.max(0.5, Math.min(...found) * 0.03));
  });
  // A stair whose steps go out a little faster than the angle: the same answer however high its base.
  it.each([
    [0.3, 0.25, 40, 'reported'],
    [0.3, 0.25, 12, 'free'],
    [1, 0.9, 8, 'free'],
    [1, 0.9, 20, 'reported'],
  ] as const)('a stair %s out per %s up, %s steps, gives the same however high it starts', (out, up, steps, want) => {
    const found = sameIn((lift) => stair(out, up, steps, 0, 4 + lift), want);
    expect(Math.max(...found) - Math.min(...found)).toBeLessThanOrEqual(Math.max(0.5, Math.min(...found) * 0.03));
  });
  it('a block rounded R 2 at its bottom edges, on a foot of any height, needs no support', () => {
    sameIn((lift) => rounded(2, 16, 0.5 + lift * 3), 'free');
  });
  it.each([3, 4])('the knuckles of a hinge R %s on webs at 45° need no support, whatever the height of the line', (r) => {
    sameIn((lift) => hingeRow(r, 2.5, 16 + lift), 'free');
    sameIn((lift) => meshOf(prismBody('Knuckle', knuckleOutline(r, 2.5, 16 + lift), 30)), 'free');
  });
  it('a very finely faceted cone on the bed and a column with a collar 1.5 out need no support', () => {
    expect(area(revolved([[0, 0], [10, 0], [0, 10]], [-1, 0], 6000))).toBeLessThan(1);
    expect(area(revolved([[0, 0], [5, 0], [5, 10], [6.5, 10], [6.5, 12], [0, 12]], [-1, 0, -1, 0, 1], 6000))).toBeLessThan(1);
  });

  it.each(holes)('hole of %s mm lying in a tube, %s segments: %s', (diameter, segments, want) => {
    const outside = area(tube(3, segments));
    for (const degrees of TURNS) {
      const found = area(tube(diameter, segments), degrees) - outside;
      expect(want === 'free' ? Math.abs(found) < 1 : found >= 1, `turned ${String(degrees)}°: ${found.toFixed(1)} mm² more than the outside alone`).toBe(true);
    }
  });

  it('takes a mesh without triangles, and one without a reach', () => {
    const empty = { positions: new Float32Array(0), normals: new Float32Array(0), index: new Uint32Array(0), vertexFaces: new Uint32Array(0), faceCount: 0 };
    expect(Array.from(overhangOf(empty, 0, overhangLimits(45), 1.8).area)).toEqual([0, 0, 0, 0]);
    const bridge = portal(8);
    // Without a number for the reach nothing counts as small.
    expect(overhangOf({ ...bridge, normals: new Float32Array(bridge.positions.length) }, 0, overhangLimits(45), Number.NaN).area[Overhang.Support]).toBeCloseTo(240, 3);
  });
});
