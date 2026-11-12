import { box, openBlockAudit, removed, volumes } from '../bloecke-helpers';

// W1: partbuddy_block names a body, but the point decides which body is cut. Two bodies that share the
// face x = 20: A (20 × 40 × 20) and B (60 × 40 × 20). Every call names A or a body that does not exist
// and gives a point on B.
test('W1: the named body against the body that was cut', async () => {
  const audit = await openBlockAudit('w1');
  try {
    await audit.batch([box('A', [20, 40, 20]), box('B', [60, 40, 20], [20, 0, 0])]);
    const calls: Record<string, unknown>[] = [
      { block: 'screwHole', body: 'A', point: [30, 10, 20], head: 'none' },
      { block: 'screwHole', body: 'Ghost', point: [40, 10, 20], head: 'none' },
      { block: 'tappedHole', body: 'A', point: [50, 10, 20], size: 'M5' },
      { block: 'insertSeat', body: 'Ghost', point: [60, 10, 20] },
      { block: 'boss', body: 'A', point: [70, 10, 20] },
      { block: 'nutTrap', body: 'A', point: [30, 30, 20], normal: [0, 0, 1] },
      { block: 'slot', body: 'Ghost', point: [45, 30, 20], normal: [0, 0, 1], depth: 2 },
      { block: 'text', body: 'A', point: [62, 30, 20], normal: [0, 0, 1], text: 'H' },
      { block: 'snapFit', body: 'Ghost', point: [74, 30, 20], normal: [0, 0, 1] },
      // On the shared edge of both bodies.
      { block: 'screwHole', body: 'A', point: [20, 20, 20], head: 'none' },
      // The blocks that do pass the body on (targets): the same wrong body.
      { block: 'magnet', body: 'A', point: [30, 20, 20], normal: [0, 0, 1] },
      { block: 'magnet', body: 'Ghost', point: [40, 20, 20], normal: [0, 0, 1] },
      { block: 'woodScrew', body: 'A', point: [50, 20, 20] },
      { block: 'woodScrew', body: 'Ghost', point: [60, 20, 20] },
    ];
    const steps = [];
    let before = await volumes(audit);
    for (const args of calls) {
      const reply = await audit.tool('partbuddy_block', args);
      const after = await volumes(audit);
      steps.push({ args, reply, removed_mm3: removed(before, after) });
      before = after;
    }
    await audit.finish({ steps });
    expect(steps.length).toBe(calls.length);
  } finally {
    await audit.close();
  }
});
