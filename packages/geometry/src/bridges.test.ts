import { describe, expect, it } from 'vitest';

import { BRIDGE_SPAN, LYING_HOLE, Overhang, overhangLimits, overhangOf, smallOverhangReach } from './overhang';
import { checkPrint, type PrintCheckBody, type PrintCheckProfile } from './printCheck';
import { gridBody, lyingTube, prismBody } from './testShapes';

const PLA: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 };

/** The area (mm²) reported as overhang, and the faces. */
const hanging = (body: PrintCheckBody) => {
  const finding = checkPrint([body], PLA).findings.find((f) => f.kind === 'overhang');
  return finding?.kind === 'overhang' ? { area: finding.area, faces: finding.places.flatMap((place) => place.faces) } : { area: 0, faces: [] };
};

/** The area (mm²) that needs support with the body turned by `degrees` about Z on the bed. */
function turned(body: PrintCheckBody, degrees = 0): number {
  const geometry = body.model.geometry;
  const source = geometry.getAttribute('position').array;
  const cos = Math.cos((degrees * Math.PI) / 180);
  const sin = Math.sin((degrees * Math.PI) / 180);
  const positions = new Float32Array(source.length);
  let bed = Infinity;
  for (let i = 0; i < source.length; i += 3) {
    positions[i] = cos * (source[i] ?? 0) - sin * (source[i + 1] ?? 0);
    positions[i + 1] = sin * (source[i] ?? 0) + cos * (source[i + 1] ?? 0);
    positions[i + 2] = source[i + 2] ?? 0;
    bed = Math.min(bed, positions[i + 2] ?? 0);
  }
  const mesh = { positions, normals: new Float32Array(source.length), index: geometry.index?.array as Uint32Array, vertexFaces: body.model.vertexFaces, faceCount: body.model.table.faces.length };
  return overhangOf(mesh, bed, overhangLimits(45), smallOverhangReach(0.4)).area[Overhang.Support];
}

// Two walls 2 mm thick, `span` apart, `length` deep and 8 high, under a roof 2 mm thick.
const portal = (span: number, length = 30) => gridBody('Portal', [0, 2, 2 + span, 4 + span], [0, length], [0, 8, 10], (i, _j, k) => k === 1 || i !== 1);
// The same 8 mm tunnel with its roof meshed as a grid of nine cells.
const meshed = gridBody('Meshed', [0, 2, 4.5, 7.5, 10, 12], [0, 13.5, 16.5, 30], [0, 8, 10], (i, _j, k) => k === 1 || i === 0 || i === 4);
// A pocket closed at both ends.
const pocket = (span: number) => gridBody('Pocket', [0, 2, 2 + span, 4 + span], [0, 2, 32, 34], [0, 8, 10], (i, j, k) => k === 1 || i !== 1 || j !== 1);
const arm = gridBody('Arm', [0, 2, 42], [0, 30], [0, 8, 10], (i, _j, k) => k === 1 || i === 0);
// The roof of a blind T-slot: 9 mm between the walls, a slot 3 mm wide down the middle, joined at the back.
const slotted = (slot: boolean) => gridBody('Slot', [0, 2, 5, 8, 11, 13], [0, 27, 30, 32], [0, 8, 10], (i, j, k) => (k === 1 ? !(slot && i === 2 && j === 0) : i === 0 || i === 4 || j === 2));
// The ring a counterbore leaves under a through hole: 9 mm wide with a hole of 4 mm.
const ring = (hole: boolean) => gridBody('Bore', [0, 2, 4.5, 8.5, 11, 13], [0, 2, 4.5, 8.5, 11, 13], [0, 8, 10], (i, j, k) => (k === 1 ? !(hole && i === 2 && j === 2) : i === 0 || i === 4 || j === 0 || j === 4));
// A bridge of 8 mm with a hole 3 × 3 mm through its middle.
const holed = (length: number) => gridBody('Holed', [0, 2, 4.5, 7.5, 10, 12], [0, length / 2 - 1.5, length / 2 + 1.5, length], [0, 8, 10], (i, j, k) => (k === 1 ? !(i === 2 && j === 1) : i === 0 || i === 4));
// A shelf 8 mm out of a wall, with something hanging from its tip.
const shelf = (lip: [number, number][]) => prismBody('Shelf', [[0, 0], [5, 0], [5, 16], [13, 16], ...lip, [15, 20], [0, 20]], 30);
const lips: Record<string, [number, number][]> = {
  'a drip edge': [[13, 14], [15, 16]],
  'a hook curled back to the wall': [[13, 13], [11, 13], [11, 12.5], [13, 10.5], [15, 12.5]],
  'a lip with a step of 0.5 mm that looks up': [[13, 13], [12.5, 13], [12.5, 12.5], [13.75, 11.25], [15, 12.5]],
  'a bead whose back looks up': [[12, 14], [13.5, 12.5], [15, 14]],
};
// The shelf's 240 mm², and the faces of the lip at 45° that begin in the air under it: the lip
// needs its own support, whatever props the shelf (the layers, review of pull request 363).
const lipFindings: Record<string, { area: number; faces: string[] }> = {
  'a drip edge': { area: 325, faces: ['F1:s2', 'F1:s4'] },
  'a hook curled back to the wall': { area: 410, faces: ['F1:s2', 'F1:s6', 'F1:s7'] },
  'a lip with a step of 0.5 mm that looks up': { area: 346, faces: ['F1:s2', 'F1:s6', 'F1:s7'] },
  'a bead whose back looks up': { area: 367, faces: ['F1:s2', 'F1:s4', 'F1:s5'] },
};
// A tunnel under a round arch of diameter `d` on legs 4 mm high.
const arch = (d: number, segments = 48) =>
  prismBody('Arch', [[0, 0], [4, 0], ...Array.from({ length: segments + 1 }, (_, i): [number, number] => [4 + d / 2 - (d / 2) * Math.cos((i * Math.PI) / segments), 4 + (d / 2) * Math.sin((i * Math.PI) / segments)]), [4 + d, 0], [8 + d, 0], [8 + d, 10 + d / 2], [0, 10 + d / 2]], 30);
// A box whose floor is reached from nowhere but through its material: a cavity closed all round, 8 mm wide.
const sealed = gridBody('Sealed', [0, 2, 10, 12], [0, 2, 32, 34], [0, 2, 8, 10], (i, j, k) => k !== 1 || i !== 1 || j !== 1);
const tray = gridBody('Tray', [0, 2, 10, 12], [0, 30], [0, 2, 8, 10], (i, _j, k) => k !== 1 || i !== 1);

describe('bridges, arms and what they hang from, on closed bodies', () => {
  it('leaves a bridge of up to 10 mm between two walls out, and keeps a wider one, a ceiling and an arm', () => {
    expect(BRIDGE_SPAN).toBe(10);
    expect([3, 5.97, 10].map((span) => hanging(portal(span)).area)).toEqual([0, 0, 0]);
    expect(hanging(portal(10.001)).area).toBe(300);
    // Audit MG-01, N-mechanik-1: every corner of these lies on a wall, so they counted as small
    // (the ceilings of a guide's groove 13.9, 27.9 and 101.9 mm wide).
    expect([13.9, 27.9, 101.9].map((span) => hanging(portal(span)).area)).toEqual([417, 837, 3057]);
    // An arm held on one side only is no bridge.
    expect(hanging(arm).area).toBe(1200);
  });

  it('takes no bridge across a slot or a hole in the ceiling, and reports the arms, not the bridge beside them', () => {
    // Two arms 3 mm out and 27 long; a line across them met a wall on both sides and read as a 9 mm
    // bridge. The 9 × 3 mm behind the slot is one, and stays out.
    expect(hanging(slotted(true))).toEqual({ area: 162, faces: ['F1:-z@8'] });
    expect(hanging(slotted(false)).area).toBe(0);
    // Laid across in one direction, two sides of the ring are bridges beside the hole and two are stubs 2.5 mm out.
    expect(hanging(ring(true)).area).toBe(20);
    expect(hanging(ring(false)).area).toBe(0);
    // A hole in a bridge leaves the two stubs beside it (2.5 × 3 mm each), however long the bridge:
    // the whole ceiling was reported, 231 mm² of 30 mm and 791 mm² of 100 mm.
    expect(hanging(holed(30)).area).toBe(15);
    expect(hanging(holed(100)).area).toBe(15);
  });

  it('hangs nothing from material that itself ends in the air', () => {
    // The lip going down from the far edge counted as a second wall, and the shelf as bridged; with a
    // face that looks up on the lip, the lip counted as standing.
    for (const [name, lip] of Object.entries(lips)) expect(hanging(shelf(lip)), name).toEqual(lipFindings[name]);
    expect(hanging(prismBody('Shelf', [[0, 0], [5, 0], [5, 16], [15, 16], [15, 20], [0, 20]], 30)).area).toBe(300);
    // A wall that stands on the floor of a box holds a bridge as one on the bed does, also where the
    // floor is reached only through the material under it.
    expect(hanging(tray).area).toBe(0);
    expect(hanging(sealed).area).toBe(0);
    // A second wall down to the bed makes the shelf a bridge.
    expect(hanging(prismBody('Portal', [[0, 0], [5, 0], [5, 16], [13, 16], [13, 0], [15, 0], [15, 20], [0, 20]], 30)).area).toBe(0);
  });

  it('lets a hole lying across the layers print round up to 8 mm, as the assistant is told', () => {
    expect(LYING_HOLE).toBe(8);
    expect(hanging(lyingTube('Tube', 10, 4, 10, 96)).faces).not.toContain('F1:hole');
    expect(hanging(lyingTube('Tube', 10, 4.5, 10, 96)).faces).toContain('F1:hole');
    expect(hanging(lyingTube('Tube', 10, 1.5, 10, 96)).faces).not.toContain('F1:hole');
    expect(turned(arch(8))).toBe(0);
    expect(turned(arch(9))).toBeGreaterThan(200);
  });

  it('reads a hole the same however coarsely it is meshed', () => {
    // With 20 segments a hole of 9 mm stayed out: its rim lay a facet short of where the wall passes the limit.
    for (const segments of [16, 20, 24, 36, 48, 96]) {
      const outside = turned(lyingTube('Tube', 10, 1.5, 10, segments));
      expect(turned(lyingTube('Tube', 10, 4, 10, segments)), `Ø 8, ${String(segments)} segments`).toBeCloseTo(outside, 3);
      expect(turned(lyingTube('Tube', 10, 4.5, 10, segments)), `Ø 9, ${String(segments)} segments`).toBeGreaterThan(outside + 40);
    }
    for (const segments of [12, 16, 20, 24, 36]) {
      expect(turned(arch(8, segments)), `arch 8, ${String(segments)} segments`).toBe(0);
      // Coarsely meshed, the flat facets at the top of the arch pass as a ceiling; the rest is reported.
      expect(turned(arch(9, segments)), `arch 9, ${String(segments)} segments`).toBeGreaterThan(100);
    }
  });

  it('gives the same answer however the part is turned on the bed', () => {
    // With twelve fixed directions an 8 mm tunnel turned by 1° was reported whole (240 mm²), a lying
    // hole of 8 mm was free at 0° and 90° only, and a roof meshed as a grid was reported at 15°.
    const cases: [string, PrintCheckBody, number][] = [
      ['bridge 3', portal(3), 0],
      ['bridge 5', portal(5), 0],
      ['bridge 8', portal(8), 0],
      ['bridge 10', portal(10), 0],
      ['bridge 10.001', portal(10.001), 300.03],
      ['bridge 13.9', portal(13.9), 417],
      ['bridge 8, roof meshed', meshed, 0],
      ['pocket 8', pocket(8), 0],
      ['pocket 9.95', pocket(9.95), 0],
      ['arm 40', arm, 1200],
      ['T-slot', slotted(true), 162],
      ['counterbore', ring(true), 20],
      ['bridge with a hole', holed(30), 15],
      ['shelf with a drip edge', shelf(lips['a drip edge'] ?? []), 240 + 30 * 2 * Math.SQRT2],
      ['shelf with a hook', shelf(lips['a hook curled back to the wall'] ?? []), 240 + 2 * 30 * 2 * Math.SQRT2],
      ['sealed box', sealed, 0],
      ['hole Ø 7', lyingTube('Tube', 10, 3.5, 10, 96), turned(lyingTube('Tube', 10, 1.5, 10, 96))],
      ['hole Ø 8', lyingTube('Tube', 10, 4, 10, 96), turned(lyingTube('Tube', 10, 1.5, 10, 96))],
      ['hole Ø 9', lyingTube('Tube', 10, 4.5, 10, 96), turned(lyingTube('Tube', 10, 4.5, 10, 96))],
      ['arch 8', arch(8), 0],
      ['arch 9', arch(9), turned(arch(9))],
    ];
    for (const [name, body, area] of cases) {
      for (const degrees of [0, 1, 7.5, 15, 30, 45, 60, 75, 90]) {
        const found = turned(body, degrees);
        expect(Math.abs(found - area), `${name} turned ${String(degrees)}°: ${String(found)} for ${String(area)}`).toBeLessThanOrEqual(Math.max(0.01, area * 0.01));
      }
    }
  });
});
