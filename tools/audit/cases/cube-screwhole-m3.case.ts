import { CLEARANCE_NORMAL } from '../../../apps/desktop/src/shared/screwSizes';
import { cylinders, openAudit, PLA_04, ray } from '../harness';

// A 20 mm cube with partbuddy_block screwHole M3, head none: the hole against ISO 273 medium (screwSizes.ts).
test('cube 20 mm, screwHole M3 plain', async () => {
  const audit = await openAudit('cube-screwhole-m3');
  try {
    await audit.batch([{ command: 'solid.box', params: { length: '20 mm', width: '20 mm', height: '20 mm', operation: 'new', body_name: 'Cube', name: 'Cube' } }]);
    const before = (await audit.measure()).bodies[0]!;
    // A size the table does not have must be refused in words, with nothing built.
    const refused = await audit.tool('partbuddy_block', { block: 'screwHole', body: 'Cube', point: [10, 10, 20], size: 'M1', head: 'none' });
    const built = await audit.tool('partbuddy_block', { block: 'screwHole', body: 'Cube', point: [10, 10, 20], size: 'M3', head: 'none' });
    const { bodies, check } = await audit.measure();
    const cube = bodies[0]!;
    // Across the hole at half height, along X and along Y: wall, hole, wall.
    const acrossX = ray(bodies, [-1, 10, 10], [1, 0, 0]);
    const acrossY = ray(bodies, [10, -1, 10], [0, 1, 0]);
    // Down the axis from above: nothing may be hit when the hole goes through.
    const alongAxis = ray(bodies, [10, 10, 25], [0, 0, -1]);
    const result = {
      refused,
      tool: built,
      table: { clearanceNormalM3: CLEARANCE_NORMAL.M3 },
      solidcraft: { bodies: bodies.length, before: before.solidcraft, after: cube.solidcraft, cylinders: cylinders(cube) },
      mesh: { before: before.metrics, after: cube.metrics },
      holeByRayX: acrossX,
      holeByRayY: acrossY,
      alongAxis,
      holeDiameterByRay: { x: acrossX[2]!.distance - acrossX[1]!.distance, y: acrossY[2]!.distance - acrossY[1]!.distance },
      volumeRemoved: { solidcraft: (before.solidcraft.volume_mm3 as number) - (cube.solidcraft.volume_mm3 as number), mesh: before.metrics.volumeMm3 - cube.metrics.volumeMm3, cylinderOfTable: Math.PI * (CLEARANCE_NORMAL.M3 / 2) ** 2 * 20 },
      printCheck: check(PLA_04),
    };
    await audit.finish(result);
    expect(built.isError).toBe(false);
    expect(cylinders(cube).map((entry) => entry.diameter)).toEqual([CLEARANCE_NORMAL.M3]);
    expect(alongAxis).toEqual([]);
    expect(refused.isError).toBe(true);
    // The ray on the mesh agrees with SolidCraft's exact cylinder within the chord tolerance.
    expect(Math.abs(result.holeDiameterByRay.x - CLEARANCE_NORMAL.M3)).toBeLessThan(0.01);
  } finally {
    await audit.close();
  }
});
