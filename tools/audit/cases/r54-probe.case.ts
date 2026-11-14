import { box, volumes } from '../bloecke-helpers';
import { openAudit } from '../harness';

// R54 at the real engine (review of PR 357, point 9): good cases are built and say that they were measured, also on
// a sloping and on a curved face; bad ones are refused and leave nothing; and the ratios the threshold stands on.
test('r54 ratios: blocks on flat, sloping and curved faces', async () => {
  const audit = await openAudit('r54-ratios');
  const steps: unknown[] = [];
  const s = Math.SQRT1_2;
  try {
    await audit.batch([
      box('P8', [60, 60, 8]),
      box('P4', [40, 40, 4], [80, 0, 0]),
      box('P10', [40, 40, 10], [140, 0, 0]),
      box('P3', [40, 40, 3], [200, 0, 0]),
      box('P67', [40, 40, 6.7], [260, 0, 0]),
      // A wedge: a 40 mm cube cut by the plane through (0,·,40) and (40,·,0) leaves a 45° face with normal (s, 0, s).
      box('Wedge', [40, 40, 40], [0, 100, 0]),
      { command: 'sketch.create', params: { plane: { origin: [0, 100, 0], x_dir: [1, 0, 0], y_dir: [0, 0, 1] }, project_edges: false, name: 'Slope' } },
      { command: 'sketch.line', params: { points: [[40, 0], [40, 40], [0, 40]], closed: true } },
      { command: 'solid.extrude', params: { distance: '-40 mm', operation: 'cut', targets: ['Wedge'], name: 'Slope' } },
      // A lying rod of 40 mm diameter along X: its top line is z = 40 at y = 220.
      { command: 'solid.cylinder', params: { diameter: '40 mm', height: '60 mm', base: [0, 220, 20], axis: [1, 0, 0], operation: 'new', body_name: 'Rod' } },
      // A thick block with a 3 mm pilot hole through it.
      box('Pilot', [40, 40, 20], [100, 100, 0]),
      { command: 'solid.cylinder', params: { diameter: '3 mm', height: '20 mm', base: [120, 120, 20], axis: [0, 0, -1], operation: 'cut', targets: ['Pilot'], name: 'Pilot hole' } },
    ]);
    const state = async () => {
      const [rev, ins] = (await audit.batch([{ command: 'document.revision', params: {} }, { command: 'document.inspect', params: {} }])) as [{ revision: number }, { undo: unknown; redo: unknown }];
      const n = (value: unknown) => (Array.isArray(value) ? value.length : value);
      return { revision: rev.revision, undo: n(ins.undo), redo: n(ins.redo) };
    };
    const call = async (label: string, args: Record<string, unknown>) => {
      const [before, was] = [await volumes(audit), await state()];
      const sentBefore = audit.sent.length;
      const reply = await audit.tool('partbuddy_block', args);
      const [after, is] = [await volumes(audit), await state()];
      // The share of each probe cylinder that SolidCraft found in the body.
      const ratios = audit.sent.slice(sentBefore).filter((batch) => batch.rollback).map((batch) => batch.commands.filter((step) => step.command === 'solid.cylinder').map((step) => step.params));
      const taken = Object.fromEntries(Object.keys(after).flatMap((name) => (Math.abs((before[name] ?? 0) - (after[name] ?? 0)) > 1e-9 ? [[name, Math.round(((before[name] ?? 0) - (after[name] ?? 0)) * 1e4) / 1e4]] : [])));
      steps.push({ label, built: !reply.isError, text: reply.text, taken, was, is, probes: ratios });
    };
    const mid = [20, 120, 20];
    // Good: must be built and say that it was measured.
    await call('good keyhole, 8 mm plate', { block: 'keyhole', body: 'P8', point: [30, 40, 0], normal: [0, 0, -1], up: [0, 1, 0], screw: 4 });
    await call('good magnet, 4 mm plate', { block: 'magnet', body: 'P4', point: [100, 20, 4], normal: [0, 0, 1], diameter: 6, height: 2 });
    await call('good insert M3, 10 mm plate', { block: 'insertSeat', body: 'P10', point: [160, 20, 10] });
    await call('good wood screw, 8 mm plate', { block: 'woodScrew', body: 'P8', point: [30, 15, 8], screw: 4 });
    await call('good magnet, sloping face', { block: 'magnet', body: 'Wedge', point: mid, normal: [s, 0, s], diameter: 6, height: 2 });
    await call('good insert M3, sloping face', { block: 'insertSeat', body: 'Wedge', point: [20, 108, 20], more: [[20, 132, 20]] });
    await call('good magnet, curved face', { block: 'magnet', body: 'Rod', point: [15, 220, 40], normal: [0, 0, 1], diameter: 6, height: 2 });
    await call('good insert M3, curved face', { block: 'insertSeat', body: 'Rod', point: [40, 220, 40] });
    // Bad: must be refused and leave nothing.
    await call('bad keyhole, 3 mm plate', { block: 'keyhole', body: 'P3', point: [220, 30, 0], normal: [0, 0, -1], up: [0, 1, 0], screw: 4 });
    await call('bad keyhole, entry over the edge', { block: 'keyhole', body: 'P8', point: [30, 5, 0], normal: [0, 0, -1], up: [0, 1, 0], screw: 4 });
    await call('bad magnet, 2.5 mm under it missing', { block: 'magnet', body: 'P3', point: [220, 20, 3], normal: [0, 0, 1], height: 2.5, diameter: 6 });
    await call('bad magnet, 1 mm from the wall', { block: 'magnet', body: 'P10', point: [144.15, 30, 10], normal: [0, 0, 1], diameter: 6, height: 2 });
    await call('bad insert M3, 3 mm plate', { block: 'insertSeat', body: 'P3', point: [210, 10, 3] });
    await call('bad insert M3, plate as thick as the seat is deep', { block: 'insertSeat', body: 'P67', point: [280, 20, 6.7] });
    await call('bad insert M3, 2.5 mm from the edge', { block: 'insertSeat', body: 'P10', point: [142.5, 10, 10] });
    await call('bad insert M3, on a 3 mm pilot hole through the part', { block: 'insertSeat', body: 'Pilot', point: [120, 120, 20] });
    await call('bad wood screw, 1.5 mm left of a 3 mm plate is too little', { block: 'woodScrew', body: 'P3', point: [230, 10, 3], screw: 5 });
    await call('bad wood screw, 5 mm from the edge', { block: 'woodScrew', body: 'P10', point: [175, 30, 10], screw: 4 });
    await audit.finish({ steps });
  } finally {
    await audit.close();
  }
}, 600_000);
