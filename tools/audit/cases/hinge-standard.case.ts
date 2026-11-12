import { pinDiameter } from '../../../apps/desktop/src/shared/mechanisms';
import { smallOverhangReach } from '../../../packages/geometry/src/overhang';
import { openAudit, overhang, PLA_04, ray } from '../harness';

// partbuddy_mechanism hinge with every default (barrel 6 mm, gap = nozzle 0.4 mm, 3 knuckles on 30 mm)
// between two plates 40 × 30 × 4 mm that lie 4 mm apart: the scene of the app's own tests (test/fakeClaude.mjs).
test('standard hinge between two plates', async () => {
  const audit = await openAudit('hinge-standard');
  try {
    await audit.batch([
      { command: 'solid.box', params: { length: 40, width: 30, height: 4, operation: 'new', body_name: 'Base' } },
      { command: 'solid.box', params: { length: 40, width: 30, height: 4, corner: [44, 0, 0], operation: 'new', body_name: 'Flap' } },
    ]);
    const built = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    const { bodies, check } = await audit.measure();
    const [clearance, interference, joints] = await audit.batch([
      { command: 'inspect.clearance', params: { bodies: ['Base'], against: ['Flap'], clearance: 2 } },
      { command: 'inspect.interference', params: { bodies: ['Base', 'Flap'] } },
      { command: 'joint.list', params: {} },
    ]);
    const result = {
      tool: built,
      expected: { barrel: 6, pin: pinDiameter(6), gap: 0.4, knuckles: 3, knuckleLength: (30 - 2 * 0.4) / 3 },
      solidcraft: { bodies: bodies.map((body) => body.solidcraft), clearance, interference, joints },
      mesh: Object.fromEntries(bodies.map((body) => [body.name, body.metrics])),
      // Along the line, 2.45 mm above it (between bore and barrel skin): the knuckles and the gaps between them.
      alongLine: ray(bodies, [42, -1, 5.45], [0, 1, 0]),
      // From the middle of the pin in the middle knuckle: up (the roof of the bore), down and to both sides.
      fromPinUp: ray(bodies, [42, 15, 3], [0, 0, 1]),
      fromPinDown: ray(bodies, [42, 15, 3], [0, 0, -1]),
      fromPinToBase: ray(bodies, [42, 15, 3], [-1, 0, 0]),
      fromPinToFlap: ray(bodies, [42, 15, 3], [1, 0, 0]),
      // By angle alone, and as the print check counts it: small overhangs that hang from the material below left out.
      overhang: Object.fromEntries(bodies.map((body) => [body.name, overhang(body, PLA_04)])),
      overhangWithoutSmall: Object.fromEntries(bodies.map((body) => [body.name, overhang(body, PLA_04, smallOverhangReach(PLA_04.nozzle))])),
      printCheck: check(PLA_04),
    };
    await audit.finish(result);
    expect(built.isError).toBe(false);
    expect(bodies.map((body) => body.name).sort()).toEqual(['Base', 'Flap']);
  } finally {
    await audit.close();
  }
});
