import { openAudit, overhang, PLA_04 } from '../harness';

// A name engraved round a cup (practice run 14, 25.11.2026): the check found 1 mm² of overhang on the cup's own wall,
// facets of the vertical cylinder that lean where they are meshed across the letters. The upright wall now counts as wall.
test('an engraved name on a round wall: which faces the check counts as overhang', async () => {
  const audit = await openAudit('rundtext');
  try {
    await audit.batch([
      { command: 'solid.cylinder', params: { radius: 35, height: 100, operation: 'new', body_name: 'Cup', name: 'Cup' } },
      { command: 'solid.cylinder', params: { radius: 33.2, height: 98.4, base: [0, 0, 1.6], operation: 'cut', targets: ['Cup'] } },
    ]);
    const built = await audit.tool('partbuddy_block', { block: 'text', body: 'Cup', point: [0, -35, 50], normal: [0, -1, 0], text: 'Anna', height: 20, depth: 0.6, mode: 'deboss', bold: true });
    const { bodies, check } = await audit.measure();
    const body = bodies[0]!;
    const result = check(PLA_04);
    const flat = overhang(body, PLA_04, 0);
    const reach = overhang(body, PLA_04, 1.8);
    await audit.finish({ built, findings: result.findings, flat, reach });
    expect(built.isError).toBe(false);
    expect(result.findings.filter((finding) => finding.kind === 'overhang')).toEqual([]);
  } finally {
    await audit.close();
  }
});
