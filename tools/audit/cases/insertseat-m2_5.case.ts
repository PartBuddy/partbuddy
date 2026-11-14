import { INSERT } from '../../../apps/desktop/src/shared/screwSizes';
import { cylinders, openAudit, PLA_04, ray } from '../harness';

// partbuddy_block insertSeat M2.5 with its defaults on a 20 mm cube: the seat against the insert table (screwSizes.ts).
test('cube 20 mm, insertSeat M2.5', async () => {
  const audit = await openAudit('insertseat-m2_5');
  try {
    await audit.batch([{ command: 'solid.box', params: { length: '20 mm', width: '20 mm', height: '20 mm', operation: 'new', body_name: 'Cube', name: 'Cube' } }]);
    const built = await audit.tool('partbuddy_block', { block: 'insertSeat', body: 'Cube', point: [10, 10, 20], size: 'M2.5' });
    const { bodies, check } = await audit.measure();
    const cube = bodies[0]!;
    const insert = INSERT['M2.5']!;
    // Across the seat 2 mm under the face, and down its axis from above the face to its floor.
    const across = ray(bodies, [-1, 10, 18], [1, 0, 0]);
    const down = ray(bodies, [10, 10, 25], [0, 0, -1]);
    const result = {
      tool: built,
      table: { ...insert, seatDepth: insert.length + 1 },
      solidcraft: { measure: cube.solidcraft, cylinders: cylinders(cube), faces: cube.faces.faces.map((face) => ({ name: face.name, area: face.area, planeNormal: face.planeNormal, point: face.point })) },
      mesh: cube.metrics,
      across,
      down,
      seatDiameterByRay: across[2]!.distance - across[1]!.distance,
      seatDepthByRay: down[0]!.distance - 5,
      printCheck: check(PLA_04),
    };
    await audit.finish(result);
    expect(built.isError).toBe(false);
    expect(cylinders(cube).map((entry) => entry.diameter)).toEqual([insert.diameter]);
  } finally {
    await audit.close();
  }
});
