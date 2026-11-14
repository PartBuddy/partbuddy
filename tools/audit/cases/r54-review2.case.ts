import { box, volumes } from '../bloecke-helpers';
import { openAudit } from '../harness';

// Review 2 of PR 357 at the real engine: a seat at a chamfer, holes that take unequal amounts, a narrow tab.
test('r54 review 2: chamfer, stepped plate, tab', async () => {
  const audit = await openAudit('r54-review2');
  const steps: unknown[] = [];
  try {
    await audit.batch([
      // A block with a 3 mm chamfer along its edge x = 0, top at z = 20.
      box('Chamfered', [40, 40, 20]),
      { command: 'sketch.create', params: { plane: { origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 0, 1] }, project_edges: false, name: 'Chamfer' } },
      { command: 'sketch.line', params: { points: [[0, 17], [0, 20], [3, 20]], closed: true } },
      { command: 'solid.extrude', params: { distance: '-40 mm', operation: 'cut', targets: ['Chamfered'], name: 'Chamfer' } },
      // A stepped plate: 8 mm thick up to x = 130, 4 mm from there.
      box('Stepped', [80, 40, 8], [100, 0, 0]),
      { command: 'solid.box', params: { length: 50, width: 40, height: 4, corner: [130, 0, 4], operation: 'cut', targets: ['Stepped'], name: 'Step' } },
      // A tab 15 mm wide and 5 mm thick.
      box('Tab', [40, 15, 5], [0, 60, 0]),
      // A block with a pocket from below under one of two seats.
      box('Pocketed', [60, 40, 10], [100, 60, 0]),
      { command: 'solid.box', params: { length: 12, width: 12, height: 3, corner: [134, 74, 0], operation: 'cut', targets: ['Pocketed'], name: 'Pocket' } },
    ]);
    const call = async (label: string, args: Record<string, unknown>) => {
      const before = await volumes(audit);
      const reply = await audit.tool('partbuddy_block', args);
      const after = await volumes(audit);
      const taken = Object.fromEntries(Object.keys(after).flatMap((name) => (Math.abs((before[name] ?? 0) - (after[name] ?? 0)) > 1e-9 ? [[name, Math.round(((before[name] ?? 0) - (after[name] ?? 0)) * 1e4) / 1e4]] : [])));
      steps.push({ label, built: !reply.isError, text: reply.text, taken });
    };
    await call('seat M3 4 mm from an edge with a 3 mm chamfer: refuse', { block: 'insertSeat', body: 'Chamfered', point: [4, 20, 20] });
    await call('seat M3 6 mm from that edge: refuse (the wall is under 2 mm over the chamfer)', { block: 'insertSeat', body: 'Chamfered', point: [6, 20, 20] });
    await call('seat M3 12 mm from that edge: build', { block: 'insertSeat', body: 'Chamfered', point: [12, 20, 20] });
    await call('two wood screws on the stepped plate, 8 and 4 mm: build', { block: 'woodScrew', body: 'Stepped', point: [115, 20, 8], more: [[155, 20, 4]], screw: 4 });
    await call('wood screw 4 in the middle of a 15 mm tab: build', { block: 'woodScrew', body: 'Tab', point: [20, 67.5, 5], screw: 4 });
    await call('two seats, one over a pocket from below: refuse, nothing stays', { block: 'insertSeat', body: 'Pocketed', point: [115, 80, 10], more: [[140, 80, 10]] });
    await audit.finish({ steps });
  } finally {
    await audit.close();
  }
}, 600_000);
