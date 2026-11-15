import { cylinders, openAudit } from '../harness';

// A screw hole placed by an expression over a parameter (#446): built at "the middle of the plate", it moves when the
// plate's width changes; a nut trap's sketch takes numbers only, and the answer says it stays.
test('a hole placed by an expression follows its parameter', async () => {
  const audit = await openAudit('bloecke-expression');
  try {
    await audit.batch([
      { command: 'parameters.add', params: { name: 'w', expression: '40 mm' } },
      { command: 'solid.box', params: { length: 'w', width: '20 mm', height: '10 mm', operation: 'new', body_name: 'Plate', name: 'Plate' } },
    ]);
    const built = await audit.tool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: ['w/2', 10, 10], more: [['w - 6', 10, 10]], head: 'none' });
    const refused = await audit.tool('partbuddy_block', { block: 'screwHole', body: 'Plate', point: ['nope', 10, 10], head: 'none' });
    const nut = await audit.tool('partbuddy_block', { block: 'nutTrap', body: 'Plate', point: ['6', 6, 10], normal: [0, 0, 1] });
    const xs = async () => cylinders((await audit.measure()).bodies[0]!).filter((entry) => Math.abs(entry.axis[2]) > 0.99).map((entry) => Math.round(entry.origin[0] * 100) / 100);
    const before = await xs();
    await audit.batch([{ command: 'parameters.change', params: { name: 'w', expression: '60 mm' } }]);
    const after = await xs();
    await audit.finish({ built, refused, nut, before, after });
    expect(built.isError).toBe(false);
    expect(built.text).toContain('Its place follows the parameters it was given by.');
    expect(refused.isError).toBe(true);
    expect(nut.text).toContain('stay where they come to now');
    // The two holes at 20 and 34 move to 30 and 54; the nut trap's hole stays at 6.
    expect(before).toEqual(expect.arrayContaining([20, 34, 6]));
    expect(after).toEqual(expect.arrayContaining([30, 54, 6]));
    expect(after).not.toContain(20);
  } finally {
    await audit.close();
  }
});
