import { decide } from '../../../apps/desktop/src/main/agents/policy';
import { snapStrain } from '../../../apps/desktop/src/shared/blocks';
import { checkPrint } from '../../../packages/geometry/src/index';
import { cylinders, openAudit, PLA_04, ray, type Audit, type Step } from '../harness';
import { appState, attempt, finish, text } from '../normteile-policy-helpers';

const cube = (name = 'Cube', size = 20, corner: [number, number, number] = [0, 0, 0]): Step => ({
  command: 'solid.box',
  params: { length: `${String(size)} mm`, width: `${String(size)} mm`, height: `${String(size)} mm`, corner, operation: 'new', body_name: name, name },
});

/**
 * One way to a part that does not print, with raw commands the policy lets through: each call is decided by policy.ts
 * and, when allowed, sent to SolidCraft as `execute`; then the app's own check says what it finds.
 */
async function way(id: string, setup: Step[], calls: [string, Record<string, unknown>][], measure?: (audit: Audit) => Promise<unknown>) {
  const name = `normteile-policy/raw-${id}`;
  const audit = await openAudit(name);
  try {
    await audit.batch(setup);
    const before = await appState(audit, PLA_04);
    const run = [];
    for (const [tool, args] of calls) {
      const decision = decide(tool, args);
      const reply = decision.allow ? await attempt(async () => audit.tool(tool, args)) : null;
      run.push({ tool, args, allow: decision.allow, reason: decision.allow ? null : decision.reason, isError: reply && 'isError' in reply ? reply.isError : null, reply: reply && 'text' in reply ? text(reply) : reply });
    }
    const after = await appState(audit, PLA_04);
    const measured = measure ? await attempt(() => measure(audit)) : undefined;
    const result = { id, before: { printed: before.printed, check: before.check }, run, after, measured };
    await finish(audit, name, result);
    return result;
  } finally {
    await audit.close();
  }
}

const execute = (command: string, params: Record<string, unknown>): [string, Record<string, unknown>] => ['execute', { command, params }];

test('shell 0.2 mm (solid.shell raw)', async () => {
  const result = await way('shell', [cube()], [execute('solid.shell', { faces: [[10, 10, 20]], thickness: '0.2 mm', body: 'Cube' })], async (audit) => {
    const { bodies } = await audit.measure();
    return { wallByRay: ray(bodies, [-1, 10, 10], [1, 0, 0]) };
  });
  expect(result.run[0]!.allow).toBe(true);
});

test('hole 0.1 mm from the edge (solid.hole raw)', async () => {
  // Hole 3.4 mm with its centre 1.8 mm from the wall: 0.1 mm of plastic left.
  const result = await way('hole-edge', [cube()], [execute('solid.hole', { position: [1.8, 10, 20], diameter: '3.4 mm', targets: ['Cube'] })], async (audit) => {
    const { bodies } = await audit.measure();
    return { cylinders: cylinders(bodies[0]!), wallByRay: ray(bodies, [-1, 10, 10], [1, 0, 0]) };
  });
  expect(result.run[0]!.allow).toBe(true);
});

test('hole breaking out of the edge (solid.hole raw)', async () => {
  const result = await way('hole-out', [cube()], [execute('solid.hole', { position: [1, 10, 20], diameter: '3.4 mm', targets: ['Cube'] })], async (audit) => {
    const { bodies } = await audit.measure();
    return { wallByRay: ray(bodies, [-1, 10, 10], [1, 0, 0]) };
  });
  expect(result.run[0]!.allow).toBe(true);
});

for (const size of ['M2', 'M3']) {
  test(`thread ${size} modelled (solid.hole raw)`, async () => {
    const result = await way(`thread-${size.toLowerCase()}`, [cube()], [execute('solid.hole', { position: [10, 10, 20], thread: size, modeled: true, depth: '8 mm', targets: ['Cube'] })], async (audit) => {
      const { bodies } = await audit.measure();
      const [threads] = await audit.batch([{ command: 'model.threads', params: {} }]);
      return { cylinders: cylinders(bodies[0]!), acrossByRay: ray(bodies, [0, 10, 17], [1, 0, 0]).filter((hit) => hit.distance > 5 && hit.distance < 15), threads };
    });
    expect(result.run[0]!.allow).toBe(true);
  });
}

test('snap hook 4 mm long, 2 mm thick, catch 1 mm (plastic.snap_fit raw, way W3)', async () => {
  const result = await way('snap', [cube()], [execute('plastic.snap_fit', { position: [10, 10, 20], hook: [1, 0, 0], length: '4 mm', thickness: '2 mm', width: '5 mm', catch_depth: '1 mm', catch_length: '1.5 mm', body: 'Cube' })], () =>
    // The strain PartBuddy's own formula gives this hook (shared/blocks.ts snapStrain), in percent.
    Promise.resolve({ strainPercent: snapStrain({ length: 4, thickness: 2, catchDepth: 1, catchLength: 1.5 }) }),
  );
  expect(result.run[0]!.allow).toBe(true);
});

test('boss 3 mm with a 2.6 mm hole: 0.2 mm wall (plastic.boss raw)', async () => {
  const result = await way('boss', [cube()], [execute('plastic.boss', { position: [10, 10, 20], diameter: '3 mm', height: '10 mm', hole_diameter: '2.6 mm', body: 'Cube' })]);
  expect(result.run[0]!.allow).toBe(true);
});

test('a body with a 0.3 mm wall, hidden (browser.visibility)', async () => {
  const thin: Step = { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '0.3 mm', corner: [30, 0, 0], operation: 'new', body_name: 'Thin', name: 'Thin' } };
  const result = await way('hidden', [cube(), thin], [execute('browser.visibility', { visible: false, items: ['Thin'] })]);
  expect(result.run[0]!.allow).toBe(true);
});

test('a feature that fails, suppressed (timeline.suppress, way X3)', async () => {
  // A hole whose place leaves the cube when the cube shrinks: the feature reports an error.
  const result = await way(
    'suppress',
    [
      { command: 'parameters.add', params: { name: 'side', expression: '20 mm' } },
      { command: 'solid.box', params: { length: 'side', width: 'side', height: 'side', operation: 'new', body_name: 'Cube', name: 'Cube' } },
      { command: 'solid.hole', params: { position: [15, 15, 20], diameter: '3 mm', depth: '5 mm', targets: ['Cube'], name: 'Round' } },
      { command: 'parameters.change', params: { name: 'side', expression: '6 mm' } },
    ],
    [execute('timeline.suppress', { feature: 'Round', suppressed: true })],
    // The check's own rule, without SolidCraft: one failed feature, as it is and suppressed.
    () =>
      Promise.resolve({
        failedFeature: checkPrint([], PLA_04, [{ name: 'F', type: 'hole', error: 'failed', warning: null, suppressed: false, rolledBack: false, ms: 0 }] as never).status,
        failedFeatureSuppressed: checkPrint([], PLA_04, [{ name: 'F', type: 'hole', error: 'failed', warning: null, suppressed: true, rolledBack: false, ms: 0 }] as never).status,
      }),
  );
  expect(result.run[0]!.allow).toBe(true);
});

test('a screw hole from the block, then scaled to half (solid.scale)', async () => {
  const name = 'normteile-policy/raw-scale';
  const audit = await openAudit(name);
  try {
    await audit.batch([cube()]);
    const built = await audit.tool('partbuddy_block', { block: 'screwHole', body: 'Cube', point: [10, 10, 20], size: 'M3', head: 'none' });
    const args = { command: 'solid.scale', params: { bodies: ['Cube'], factor: 0.5 } };
    const decision = decide('execute', args);
    const reply = await audit.tool('execute', args);
    const { bodies } = await audit.measure();
    const result = { block: built, decision, reply: text(reply), cylinders: cylinders(bodies[0]!), holeByRay: ray(bodies, [-1, 5, 5], [1, 0, 0]), state: await appState(audit, PLA_04) };
    await finish(audit, name, result);
    expect(decision.allow).toBe(true);
  } finally {
    await audit.close();
  }
});

test('set_parameter with a misspelt name (way W14)', async () => {
  const name = 'normteile-policy/raw-parameter';
  const audit = await openAudit(name);
  try {
    await audit.batch([
      { command: 'parameters.add', params: { name: 'wand', expression: '2 mm' } },
      { command: 'solid.box', params: { length: '20 mm', width: 'wand', height: '20 mm', operation: 'new', body_name: 'Wall', name: 'Wall' } },
    ]);
    const args = { name: 'wnad', value: '6 mm' };
    const reply = await audit.tool('set_parameter', args);
    const [measure] = (await audit.batch([{ command: 'inspect.measure', params: { bodies: ['Wall'] } }])) as [{ bodies: { bbox: unknown }[] }];
    const [parameters] = await audit.batch([{ command: 'parameters.list', params: {} }]);
    const result = { decision: decide('set_parameter', args), reply: { isError: reply.isError, body: text(reply) }, bboxAfter: measure.bodies[0]?.bbox, parameters };
    await finish(audit, name, result);
    expect(result.decision.allow).toBe(true);
  } finally {
    await audit.close();
  }
});
