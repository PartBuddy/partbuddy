import { BLOCK_SIZES } from '../../../apps/desktop/src/shared/screwSizes';
import { box, faceBoxes, openBlockAudit, removed, summary, volumes } from '../bloecke-helpers';
import { PLA_04, type MeasuredBody, type Step, type Vec3 } from '../harness';

// Every block at its smallest and largest size (most of them at every size), measured against the tables.

type Args = Record<string, unknown>;

/** Per feature (F<n>) of a body: its named faces with their boxes, and one box round its numbered faces. */
function features(body: MeasuredBody) {
  const out: Record<string, { faces: { face: string; min: Vec3; max: Vec3; planeNormal?: unknown }[]; numbered?: { count: number; min: Vec3; max: Vec3 } }> = {};
  for (const entry of faceBoxes(body, (name) => !name.startsWith('F1:'))) {
    const feature = entry.face.split(':')[0]!;
    const slot = (out[feature] ??= { faces: [] });
    if (/:face:\d+$/.test(entry.face) && !entry.planeNormal) {
      const n = (slot.numbered ??= { count: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
      n.count += 1;
      for (let a = 0; a < 3; a += 1) {
        n.min[a] = Math.min(n.min[a]!, entry.min[a]!);
        n.max[a] = Math.max(n.max[a]!, entry.max[a]!);
      }
    } else slot.faces.push({ face: entry.face, min: entry.min, max: entry.max, planeNormal: entry.planeNormal });
  }
  return out;
}

function sizes(name: string, scene: Step[], calls: Args[], tool = 'partbuddy_block') {
  test(`sizes: ${name}`, async () => {
    const audit = await openBlockAudit(`sizes-${name}`);
    try {
      await audit.batch(scene);
      const steps = [];
      let before = await volumes(audit);
      for (const args of calls) {
        const sentBefore = audit.sent.length;
        const reply = await audit.tool(tool, args);
        const after = await volumes(audit);
        steps.push({ args, reply, removed_mm3: removed(before, after), sent: audit.sent.slice(sentBefore).filter((batch) => !batch.rollback).flatMap((batch) => batch.commands) });
        before = after;
      }
      const { bodies, check } = await audit.measure();
      await audit.finish({ steps, bodies: bodies.map((body) => ({ ...summary(body), features: features(body) })), printCheck: check(PLA_04) });
      expect(steps.length).toBe(calls.length);
    } finally {
      await audit.close();
    }
  });
}

const row = <T>(items: readonly T[], make: (item: T, i: number) => Args) => items.map(make);
const INSERT_SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6'] as const;
const CS_SIZES = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10'] as const;

sizes('screwhole-none', [box('Cube', [130, 60, 20])], (['close', 'normal', 'loose'] as const).flatMap((fit, j) => row(BLOCK_SIZES, (size, i) => ({ block: 'screwHole', body: 'Cube', point: [10 + 15 * i, 10 + 20 * j, 20], size, head: 'none', fit }))));
sizes('screwhole-cap', [box('Cube', [170, 30, 30])], row(BLOCK_SIZES, (size, i) => ({ block: 'screwHole', body: 'Cube', point: [12 + 20 * i, 15, 30], size })));
sizes('screwhole-countersunk', [box('Cube', [170, 30, 30])], row(CS_SIZES, (size, i) => ({ block: 'screwHole', body: 'Cube', point: [15 + 27 * i, 15, 30], size, head: 'countersunk' })));
sizes('tappedhole', [box('Cube', [80, 30, 20])], [
  { block: 'tappedHole', body: 'Cube', point: [10, 15, 20], size: 'M2' },
  { block: 'tappedHole', body: 'Cube', point: [25, 15, 20], size: 'M5' },
  { block: 'tappedHole', body: 'Cube', point: [45, 15, 20], size: 'M10' },
  { block: 'tappedHole', body: 'Cube', point: [65, 15, 20], size: 'M5', depth: 8 },
]);
sizes('insertseat-boss', [box('Cube', [110, 50, 30])], [
  ...row(INSERT_SIZES, (size, i) => ({ block: 'insertSeat', body: 'Cube', point: [10 + 18 * i, 12, 30], size })),
  ...row(INSERT_SIZES, (size, i) => ({ block: 'boss', body: 'Cube', point: [10 + 18 * i, 36, 30], size })),
]);
sizes('nuttrap', [box('Cube', [190, 30, 30])], row(BLOCK_SIZES, (size, i) => ({ block: 'nutTrap', body: 'Cube', point: [12 + 23 * i, 15, 30], normal: [0, 0, 1], size })));
sizes('slot', [box('Cube', [100, 40, 10])], [
  { block: 'slot', body: 'Cube', point: [15, 20, 10], normal: [0, 0, 1], size: 'M2', depth: 3 },
  { block: 'slot', body: 'Cube', point: [40, 20, 10], normal: [0, 0, 1], size: 'M10', depth: 3 },
  { block: 'slot', body: 'Cube', point: [65, 20, 10], normal: [0, 0, 1] },
  { block: 'slot', body: 'Cube', point: [85, 20, 10], normal: [0, 0, 1], along: 'y', length: 20, width: 4, depth: 2 },
]);
sizes('text', [box('Cube', [60, 40, 10])], [
  { block: 'text', body: 'Cube', point: [15, 20, 10], normal: [0, 0, 1], text: 'H' },
  { block: 'text', body: 'Cube', point: [45, 20, 10], normal: [0, 0, 1], text: 'H', mode: 'emboss', height: 10, depth: 1 },
]);
const dose = (name: string, corner: Vec3): Step[] => [
  box(name, [60, 40, 30], corner),
  { command: 'solid.box', params: { length: 56, width: 36, height: 28, corner: [corner[0] + 2, corner[1] + 2, corner[2] + 2], operation: 'cut', targets: [name], name: `${name} hollow` } },
];
sizes('lip', [...dose('Dose', [0, 0, 0]), ...dose('Lid', [100, 0, 0])], [
  { block: 'lip', body: 'Dose', point: [1, 20, 30] },
  { block: 'lip', body: 'Lid', point: [101, 20, 30], type: 'groove' },
]);
sizes('snapfit', [box('Cube', [60, 40, 10])], [
  { block: 'snapFit', body: 'Cube', point: [15, 20, 10], normal: [0, 0, 1] },
  { block: 'snapFit', body: 'Cube', point: [45, 20, 10], normal: [0, 0, 1], hook: 'x-' },
]);
const WOOD = [3.5, 4, 4.5, 5] as const;
sizes('keyhole', [box('Cube', [100, 40, 12])], row(WOOD, (screw, i) => ({ block: 'keyhole', body: 'Cube', point: [15 + 23 * i, 28, 12], normal: [0, 0, 1], up: [0, 1, 0], screw })));
sizes('woodscrew', [box('Cube', [100, 40, 12])], row(WOOD, (screw, i) => ({ block: 'woodScrew', body: 'Cube', point: [15 + 23 * i, 20, 12], screw })));
sizes('magnet', [box('Cube', [120, 60, 30])], [
  { block: 'magnet', body: 'Cube', point: [10, 10, 30], normal: [0, 0, 1] },
  { block: 'magnet', body: 'Cube', point: [25, 10, 30], normal: [0, 0, 1], hold: 'press' },
  { block: 'magnet', body: 'Cube', point: [40, 10, 30], normal: [0, 0, 1], diameter: 2, height: 1 },
  { block: 'magnet', body: 'Cube', point: [85, 30, 30], normal: [0, 0, 1], diameter: 40, height: 20 },
  { block: 'magnet', body: 'Cube', point: [10, 40, 30], normal: [0, 0, 1], diameter: 1.9, height: 1 },
  { block: 'magnet', body: 'Cube', point: [10, 40, 30], normal: [0, 0, 1], diameter: 40.1, height: 2 },
  { block: 'magnet', body: 'Cube', point: [10, 40, 30], normal: [0, 0, 1], diameter: 6, height: 0.9 },
  { block: 'magnet', body: 'Cube', point: [10, 40, 30], normal: [0, 0, 1], diameter: 6, height: 20.1 },
]);
sizes('knob', [], [
  { block: 'knob', body: 'KnobD', point: [0, 0, 0] },
  { block: 'knob', body: 'KnobKnurl', point: [50, 0, 0], shaft: 'knurl' },
  { block: 'knob', body: 'KnobRound', point: [100, 0, 0], shaft: 'round' },
]);
// T1 / MV-01 through the mechanism too: the insert seat of kind screw, M2.5.
sizes(
  'screw-m2_5',
  [box('Base', [40, 40, 10]), box('Cover', [40, 40, 5], [0, 0, 10]), box('Base2', [40, 40, 10], [60, 0, 0]), box('Cover2', [40, 40, 5], [60, 0, 10])],
  [
    { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [20, 20, 15], to: [20, 20, 10], size: 'M2.5', screws: false },
    // R54: the seat of the insert 2.5 mm from the edge.
    { kind: 'screw', fixed: 'Base2', moving: 'Cover2', from: [62.5, 20, 15], to: [62.5, 20, 10], size: 'M3', screws: false },
  ],
  'partbuddy_mechanism',
);
