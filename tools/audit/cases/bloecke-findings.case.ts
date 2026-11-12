import { snapStrain, defaultBlock, stepsOf } from '../../../apps/desktop/src/shared/blocks';
import { featureBlockSchema } from '../../../apps/desktop/src/shared/contract';
import { box, faceBoxes, openBlockAudit, removed, spans, summary, volumes } from '../bloecke-helpers';
import { PLA_04, type Audit, type Step, type Vec3 } from '../harness';

type Args = Record<string, unknown>;

/** Calls the tool once per entry and keeps its words and what each call took from every body. */
async function callAll(audit: Audit, tool: string, calls: Args[]) {
  const steps = [];
  let before = await volumes(audit);
  for (const args of calls) {
    const sentBefore = audit.sent.length;
    const reply = await audit.tool(tool, args);
    const after = await volumes(audit);
    steps.push({ args, reply, removed_mm3: removed(before, after), sent: audit.sent.slice(sentBefore) });
    before = after;
  }
  return steps;
}

const notCube = (name: string) => !name.startsWith('F1:');

// W3: text without `text` builds the form's placeholder word.
test('W3: text without words', async () => {
  const audit = await openBlockAudit('w3');
  try {
    await audit.batch([box('Cube', [80, 40, 20])]);
    const steps = await callAll(audit, 'partbuddy_block', [
      { block: 'text', body: 'Cube', point: [40, 30, 20], normal: [0, 0, 1] },
      { block: 'text', body: 'Cube', point: [40, 10, 20], normal: [0, 0, 1], text: '' },
      { block: 'text', body: 'Cube', point: [40, 10, 20], normal: [0, 0, 1], text: '   ' },
    ]);
    const { bodies, check } = await audit.measure();
    await audit.finish({ steps, bodies: bodies.map(summary), printCheck: check(PLA_04) });
  } finally {
    await audit.close();
  }
});

// S-02 / T8: tappedHole builds a modelled thread below M5; kind screw refuses the same.
test('S-02: tapped holes below M5', async () => {
  const audit = await openBlockAudit('s02');
  try {
    await audit.batch([box('Cube', [80, 40, 20]), box('Base', [40, 40, 10], [100, 0, 0]), box('Cover', [40, 40, 4], [100, 0, 10])]);
    const steps = await callAll(audit, 'partbuddy_block', [
      { block: 'tappedHole', body: 'Cube', point: [10, 20, 20], size: 'M2' },
      { block: 'tappedHole', body: 'Cube', point: [25, 20, 20], size: 'M2.5' },
      { block: 'tappedHole', body: 'Cube', point: [40, 20, 20], size: 'M3' },
      { block: 'tappedHole', body: 'Cube', point: [55, 20, 20], size: 'M4' },
    ]);
    const mechanism = await callAll(audit, 'partbuddy_mechanism', [
      { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [120, 20, 14], to: [120, 20, 10], size: 'M3', thread: 'tapped' },
      { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [120, 20, 14], to: [120, 20, 10], size: 'M4', thread: 'tapped' },
    ]);
    const { bodies, check } = await audit.measure();
    const cube = bodies.find((body) => body.name === 'Cube')!;
    // Across each thread at half height: where the line leaves and enters the plastic again.
    const across = [10, 25, 40, 55].map((x) => spans([cube], [x - 6, 20, 10], [1, 0, 0]).hits.map((hit) => ({ x: Math.round((x - 6 + hit.distance) * 1e4) / 1e4, entering: hit.entering, face: hit.face })));
    await audit.finish({ steps, mechanism, across, features: faceBoxes(cube, notCube), bodies: bodies.map(summary), printCheck: check(PLA_04) });
  } finally {
    await audit.close();
  }
});

// T7: the check "1.2 mm under the countersink" reckons 0.6 · d, the cone that is cut is deeper.
for (const [size, thickness] of [['M3', 3], ['M4', 3.6], ['M5', 4.2], ['M6', 4.8], ['M3', 2.9]] as const) {
  test(`T7: countersunk ${size} through ${String(thickness)} mm`, async () => {
    const audit = await openBlockAudit(`t7-${size}-${String(thickness).replace('.', '_')}`);
    try {
      await audit.batch([box('Base', [40, 40, 20]), box('Cover', [40, 40, thickness], [0, 0, 20])]);
      const steps = await callAll(audit, 'partbuddy_mechanism', [{ kind: 'screw', fixed: 'Base', moving: 'Cover', from: [20, 20, 20 + thickness], to: [20, 20, 20], size, head: 'countersunk', screws: false }]);
      const { bodies, check } = await audit.measure();
      const cover = bodies.find((body) => body.name === 'Cover')!;
      await audit.finish({ thickness, steps, allFaces: faceBoxes(cover), bodies: bodies.map(summary), printCheck: check(PLA_04) });
    } finally {
      await audit.close();
    }
  });
}

// T9: the schema lets sizes through that the block has no table row for; the tool's blockOf refuses them.
test('T9: sizes without a table row', async () => {
  const audit = await openBlockAudit('t9');
  try {
    await audit.batch([box('Cube', [100, 40, 30])]);
    const viaTool = await callAll(audit, 'partbuddy_block', [
      { block: 'boss', body: 'Cube', point: [10, 20, 30], size: 'M10' },
      { block: 'insertSeat', body: 'Cube', point: [10, 20, 30], size: 'M8' },
      { block: 'screwHole', body: 'Cube', point: [10, 20, 30], size: 'M2', head: 'countersunk' },
    ]);
    // What the interface's path would send (schema, then stepsOf), without blockOf's size check.
    const raw = [
      defaultBlock('boss', 'Cube', [15, 20, 30], 'M10'),
      defaultBlock('insertSeat', 'Cube', [40, 20, 30], 'M8'),
      { ...defaultBlock('screwHole', 'Cube', [60, 20, 30], 'M2'), head: 'countersunk' },
      { ...defaultBlock('screwHole', 'Cube', [80, 20, 30], 'M2.5'), head: 'countersunk' },
    ];
    const viaSchema = [];
    let before = await volumes(audit);
    for (const block of raw) {
      const parsed = featureBlockSchema.safeParse(block);
      const steps: Step[] = parsed.success ? stepsOf(parsed.data) : [];
      let error: string | null = null;
      try {
        await audit.batch(steps);
      } catch (cause) {
        error = (cause as Error).message;
      }
      const after = await volumes(audit);
      viaSchema.push({ block, schemaAccepts: parsed.success, steps, error, removed_mm3: removed(before, after) });
      before = after;
    }
    const { bodies } = await audit.measure();
    await audit.finish({ viaTool, viaSchema, features: faceBoxes(bodies[0]!, notCube), bodies: bodies.map(summary) });
  } finally {
    await audit.close();
  }
});

// W31: block sizes are only bounded to 0 < x <= 500 mm.
test('W31: sizes without an FDM limit', async () => {
  const audit = await openBlockAudit('w31');
  try {
    await audit.batch([box('Cube', [120, 60, 20])]);
    const calls: Args[] = [
      { block: 'snapFit', body: 'Cube', point: [10, 15, 20], normal: [0, 0, 1], length: 3 },
      { block: 'snapFit', body: 'Cube', point: [25, 15, 20], normal: [0, 0, 1], length: 4 },
      { block: 'snapFit', body: 'Cube', point: [40, 15, 20], normal: [0, 0, 1] },
      { block: 'text', body: 'Cube', point: [60, 15, 20], normal: [0, 0, 1], text: 'Hi', height: 0.5 },
      { block: 'insertSeat', body: 'Cube', point: [80, 15, 20], diameter: 0.01, depth: 0.01 },
      { block: 'boss', body: 'Cube', point: [95, 15, 20], diameter: 1, height: 0.5 },
      { block: 'slot', body: 'Cube', point: [10, 45, 20], normal: [0, 0, 1], width: 0.05, length: 0.05, depth: 1 },
      { block: 'text', body: 'Cube', point: [40, 45, 20], normal: [0, 0, 1], text: 'Hi', depth: 500 },
      { block: 'nutTrap', body: 'Cube', point: [70, 45, 20], normal: [0, 0, 1], flats: 0.1, depth: 0.1 },
      { block: 'insertSeat', body: 'Cube', point: [90, 45, 20], diameter: 500, depth: 500 },
      { block: 'snapFit', body: 'Cube', point: [105, 45, 20], normal: [0, 0, 1], length: 501 },
    ];
    const steps = [];
    for (const step of await callAll(audit, 'partbuddy_block', calls)) {
      const a = step.args;
      const strain = a.block === 'snapFit' ? snapStrain({ length: (a.length as number | undefined) ?? 12, thickness: 1.5, catchDepth: 0.8, catchLength: 1.5 }) : undefined;
      steps.push({ ...step, snapStrain_percent: strain });
    }
    const { bodies, check } = await audit.measure();
    await audit.finish({ steps, features: bodies.map((body) => ({ body: body.name, faces: faceBoxes(body, notCube) })), bodies: bodies.map(summary), printCheck: check(PLA_04) });
  } finally {
    await audit.close();
  }
});

// R54: conditions on the plastic round a block are only told in the reply.
const r54: [string, Step[], string, Args, [Vec3, Vec3][]][] = [
  ['r54-keyhole-3mm', [box('Plate', [60, 60, 3])], 'partbuddy_block', { block: 'keyhole', body: 'Plate', point: [30, 40, 0], normal: [0, 0, -1], up: [0, 1, 0] }, [[[30, 40, -1], [0, 0, 1]], [[30, 32, -1], [0, 0, 1]], [[33.5, 36, -1], [0, 0, 1]]]],
  ['r54-magnet-2mm', [box('Plate', [60, 60, 2])], 'partbuddy_block', { block: 'magnet', body: 'Plate', point: [30, 30, 2], normal: [0, 0, 1] }, [[[30, 30, 5], [0, 0, -1]]]],
  ['r54-magnet-2_5mm', [box('Plate', [60, 60, 2.5])], 'partbuddy_block', { block: 'magnet', body: 'Plate', point: [30, 30, 2.5], normal: [0, 0, 1] }, [[[30, 30, 5], [0, 0, -1]]]],
  ['r54-magnet-edge', [box('Plate', [60, 60, 5])], 'partbuddy_block', { block: 'magnet', body: 'Plate', point: [3.5, 30, 5], normal: [0, 0, 1] }, [[[-1, 30, 4], [1, 0, 0]]]],
  ['r54-insert-edge', [box('Cube', [20, 20, 20])], 'partbuddy_block', { block: 'insertSeat', body: 'Cube', point: [2.5, 10, 20] }, [[[-1, 10, 18], [1, 0, 0]]]],
  ['r54-insert-thin', [box('Plate', [20, 20, 7])], 'partbuddy_block', { block: 'insertSeat', body: 'Plate', point: [10, 10, 7] }, [[[10, 10, 9], [0, 0, -1]]]],
  ['r54-woodscrew-1_5mm', [box('Plate', [60, 60, 1.5])], 'partbuddy_block', { block: 'woodScrew', body: 'Plate', point: [30, 30, 1.5] }, [[[32.5, 30, 3], [0, 0, -1]], [[25, 30, 0.01], [1, 0, 0]]]],
  ['r54-woodscrew-edge', [box('Plate', [60, 60, 5])], 'partbuddy_block', { block: 'woodScrew', body: 'Plate', point: [5, 30, 5] }, [[[-1, 30, 4.9], [1, 0, 0]]]],
  ['r54-screw-insert-edge', [box('Base', [40, 40, 10]), box('Cover', [40, 40, 5], [0, 0, 10])], 'partbuddy_mechanism', { kind: 'screw', fixed: 'Base', moving: 'Cover', from: [2.5, 20, 15], to: [2.5, 20, 10], screws: false }, [[[-1, 20, 8], [1, 0, 0]], [[-1, 20, 13], [1, 0, 0]]]],
];
for (const [name, scene, tool, args, rays] of r54) {
  test(`R54: ${name}`, async () => {
    const audit = await openBlockAudit(name);
    try {
      await audit.batch(scene);
      const steps = await callAll(audit, tool, [args]);
      const { bodies, check } = await audit.measure();
      await audit.finish({
        steps,
        rays: rays.map(([origin, direction]) => ({ origin, direction, ...spans(bodies, origin, direction) })),
        features: bodies.map((body) => ({ body: body.name, faces: faceBoxes(body, notCube) })),
        bodies: bodies.map(summary),
        printCheck: check(PLA_04),
      });
    } finally {
      await audit.close();
    }
  });
}
