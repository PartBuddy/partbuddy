import { describe, expect, it } from 'vitest';

import { BRIDGE_SPAN, LYING_HOLE } from './overhang';
import { checkPrint, type PrintCheckBody, type PrintCheckProfile } from './printCheck';
import { gridBody, lyingTube, prismBody } from './testShapes';

const PLA: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 };

describe('bridges, arms and what they hang from, on closed bodies', () => {
  /** The area (mm²) reported as overhang, and the faces. */
  const hanging = (body: PrintCheckBody) => {
    const finding = checkPrint([body], PLA).findings.find((f) => f.kind === 'overhang');
    return finding?.kind === 'overhang' ? { area: finding.area, faces: finding.places.flatMap((place) => place.faces) } : { area: 0, faces: [] };
  };

  it('leaves a bridge of up to 10 mm between two walls out, and keeps a wider one, a ceiling and an arm', () => {
    // Two walls 2 mm thick, `span` apart, 30 deep and 8 high, under a roof 2 mm thick.
    const portal = (span: number) => gridBody('Portal', [0, 2, 2 + span, 4 + span], [0, 30], [0, 8, 10], (i, _j, k) => k === 1 || i !== 1);
    expect(BRIDGE_SPAN).toBe(10);
    expect([3, 5.97, 10].map((span) => hanging(portal(span)).area)).toEqual([0, 0, 0]);
    // Audit MG-01, N-mechanik-1: every corner of these lies on a wall, so they counted as small
    // (the ceilings of a guide's groove 13.9, 27.9 and 101.9 mm wide).
    expect([13.9, 27.9, 101.9].map((span) => hanging(portal(span)).area)).toEqual([417, 837, 3057]);
    // An arm held on one side only is no bridge.
    expect(hanging(gridBody('Arm', [0, 2, 42], [0, 30], [0, 8, 10], (i, _j, k) => k === 1 || i === 0)).area).toBe(1200);
  });

  it('takes no bridge across a slot or a hole in the ceiling: what ends at a free edge is an arm', () => {
    // The roof of a blind T-slot: 9 mm between the walls, a slot 3 mm wide down the middle, joined at the back.
    // Two arms 3 mm out; a line across them met a wall on both sides and read as a 9 mm bridge.
    const slotted = (slot: boolean) => gridBody('Slot', [0, 2, 5, 8, 11, 13], [0, 27, 30, 32], [0, 8, 10], (i, j, k) => (k === 1 ? !(slot && i === 2 && j === 0) : i === 0 || i === 4 || j === 2));
    expect(hanging(slotted(true))).toEqual({ area: 189, faces: ['F1:-z@8'] });
    expect(hanging(slotted(false)).area).toBe(0);
    // The ring a counterbore leaves under a through hole: 9 mm wide with a hole of 4 mm.
    const ring = (hole: boolean) => gridBody('Bore', [0, 2, 4.5, 8.5, 11, 13], [0, 2, 4.5, 8.5, 11, 13], [0, 8, 10], (i, j, k) => (k === 1 ? !(hole && i === 2 && j === 2) : i === 0 || i === 4 || j === 0 || j === 4));
    expect(hanging(ring(true)).area).toBe(65);
    expect(hanging(ring(false)).area).toBe(0);
  });

  it('hangs nothing from material that itself ends in the air', () => {
    // A shelf 8 mm out of a wall with a drip edge at its tip: the lip going down from the far edge
    // counted as a second wall, and the shelf as bridged.
    expect(hanging(prismBody('Shelf', [[0, 0], [5, 0], [5, 16], [13, 16], [13, 14], [15, 16], [15, 20], [0, 20]], 30))).toEqual({ area: 240, faces: ['F1:s2'] });
    expect(hanging(prismBody('Shelf', [[0, 0], [5, 0], [5, 16], [15, 16], [15, 20], [0, 20]], 30)).area).toBe(300);
    // A wall that stands on the floor of a box holds a bridge as one on the bed does.
    const tray = gridBody('Tray', [0, 2, 10, 12], [0, 30], [0, 2, 8, 10], (i, _j, k) => k !== 1 || i !== 1);
    expect(hanging(tray).area).toBe(0);
  });

  it('lets a hole lying across the layers print round up to 8 mm, as the assistant is told', () => {
    expect(LYING_HOLE).toBe(8);
    expect(hanging(lyingTube('Tube', 10, 4, 10, 96)).faces).not.toContain('F1:hole');
    expect(hanging(lyingTube('Tube', 10, 4.5, 10, 96)).faces).toContain('F1:hole');
    expect(hanging(lyingTube('Tube', 10, 1.5, 10, 96)).faces).not.toContain('F1:hole');
  });
});
