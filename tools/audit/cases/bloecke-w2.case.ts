import { box, openBlockAudit, removed, spans, summary, volumes } from '../bloecke-helpers';
import type { Step } from '../harness';

// W2 (= T4): a slot without depth is cut 1000 mm deep without targets. Open box 60 × 40 × 30 with walls of
// 2 mm, the slot in the wall x = 0; bodies behind it at x = 70, 500 and 1100 (beyond the 1000 mm).
const scene: Step[] = [
  box('Dose', [60, 40, 30]),
  { command: 'solid.box', params: { length: 56, width: 36, height: 28, corner: [2, 2, 2], operation: 'cut', targets: ['Dose'], name: 'Hollow' } },
  box('Behind', [10, 40, 30], [70, 0, 0]),
  box('Far', [10, 40, 30], [500, 0, 0]),
  box('Beyond', [10, 40, 30], [1100, 0, 0]),
];

for (const [name, args] of [
  ['w2-slot', { block: 'slot', body: 'Dose', point: [0, 20, 15], normal: [-1, 0, 0] }],
  ['w2-slot-depth2', { block: 'slot', body: 'Dose', point: [0, 20, 15], normal: [-1, 0, 0], depth: 2 }],
  ['w2-nuttrap', { block: 'nutTrap', body: 'Dose', point: [0, 20, 15], normal: [-1, 0, 0] }],
  ['w2-screwhole', { block: 'screwHole', body: 'Dose', point: [0, 20, 15], head: 'none' }],
  ['w2-tappedhole', { block: 'tappedHole', body: 'Dose', point: [0, 20, 15], size: 'M5' }],
] as const) {
  test(`W2: ${name} in a side wall of a hollow box`, async () => {
    const audit = await openBlockAudit(name);
    try {
      await audit.batch(scene);
      const before = await volumes(audit);
      const reply = await audit.tool('partbuddy_block', { ...args });
      const after = await volumes(audit);
      const { bodies, check } = await audit.measure();
      // Along the cut's axis from outside the wall, through the box and every body behind it.
      const along = spans(bodies, [-5, 20, 15], [1, 0, 0]);
      // Beside the cut (z = 25), where every wall is whole: the reference.
      const beside = spans(bodies, [-5, 20, 25], [1, 0, 0]);
      await audit.finish({ args, reply, before, removed_mm3: removed(before, after), along: along.walls, alongHits: along.hits, beside: beside.walls, bodies: bodies.map(summary), printCheck: check({ bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 }) });
      expect(reply.text).not.toBe('');
    } finally {
      await audit.close();
    }
  });
}
