import { box } from '../bloecke-helpers';
import { openAudit, PLA_04, type Audit } from '../harness';

/** Median of five timings in ms. */
async function timed(work: () => Promise<unknown>, runs = 5): Promise<number> {
  const all: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await work();
    all.push(performance.now() - start);
  }
  return Math.round(all.sort((a, b) => a - b)[Math.floor(runs / 2)] ?? 0);
}

async function stages(audit: Audit, names: string[]) {
  const mirrorAndMesh = await timed(async () => {
    const { check } = await audit.measure();
    check(PLA_04);
  });
  const clearance = await timed(() => audit.batch([{ command: 'inspect.clearance', params: { bodies: names, clearance: 0.15 } }]));
  const [listed] = (await audit.batch([{ command: 'joint.list', params: {} }])) as [{ joints?: { id: number; values?: { value: number; limits?: (number | null)[] }[] }[] }];
  const sweeps = (listed.joints ?? []).flatMap((joint) => (joint.values?.[0]?.limits ?? []).flatMap((limit) => (typeof limit === 'number' && Math.abs(limit - (joint.values?.[0]?.value ?? 0)) > 1e-6 ? [{ joint: joint.id, index: 0, from: joint.values?.[0]?.value ?? 0, to: limit }] : [])));
  const sweep = sweeps.length > 0 ? await timed(() => audit.batch(sweeps.map((params) => ({ command: 'joint.sweep', params })))) : null;
  return { mirrorAndMesh, clearance, sweeps: sweeps.length, sweep };
}

// How long the two stages of the print check take (review of PR 357, point 1).
test('check timing: box with lid, and a hinge', async () => {
  const out: Record<string, unknown> = {};
  let audit = await openAudit('check-timing-box');
  try {
    // A box 80 × 60 × 40 with 2 mm walls, and a lid with a rim that goes into it with 0.2 mm of room.
    await audit.batch([
      box('Box', [80, 60, 40]),
      { command: 'solid.box', params: { length: 76, width: 56, height: 38, corner: [2, 2, 2], operation: 'cut', targets: ['Box'], name: 'Hollow' } },
      box('Lid', [80, 60, 2], [0, 0, 40.2]),
      { command: 'solid.box', params: { length: 75.6, width: 55.6, height: 4, corner: [2.2, 2.2, 36.2], operation: 'join', targets: ['Lid'], name: 'Rim' } },
    ]);
    out.box = await stages(audit, ['Box', 'Lid']);
    await audit.finish(out);
  } finally {
    await audit.close();
  }
  audit = await openAudit('check-timing-hinge');
  try {
    await audit.batch([box('Base', [40, 30, 4]), box('Flap', [40, 30, 4], [44, 0, 0])]);
    out.hingeBuilt = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    out.hinge = await stages(audit, ['Base', 'Flap']);
    await audit.finish(out);
  } finally {
    await audit.close();
  }
}, 600_000);
