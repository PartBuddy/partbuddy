import { openAudit, overhang, PLA_04 } from '../harness';

// A name engraved round a cup (practice run 14, 25.11.2026): the check found 1 mm² of overhang on the cup's own wall,
// facets of the vertical cylinder that lean where they are meshed across the letters. The upright wall now counts as wall.
// The second run (wall 2.25 mm) said the wall under the letters was not measured; a point off the wall is now laid onto it.
test('an engraved name on a round wall: which faces the check counts as overhang', async () => {
  const audit = await openAudit('rundtext');
  try {
    await audit.batch([
      { command: 'solid.cylinder', params: { radius: 35, height: 100, operation: 'new', body_name: 'Cup', name: 'Cup' } },
      { command: 'solid.cylinder', params: { radius: 32.75, height: 98.8, base: [0, 0, 1.2], operation: 'cut', targets: ['Cup'] } },
    ]);
    const built = await audit.tool('partbuddy_block', { block: 'text', body: 'Cup', point: [0, -35.3, 50], normal: [0, -1, 0], text: 'Anna', height: 15, depth: 0.6, mode: 'deboss', bold: true });
    const { bodies, check } = await audit.measure();
    const body = bodies[0]!;
    const result = check(PLA_04);
    const flat = overhang(body, PLA_04, 0);
    const reach = overhang(body, PLA_04, 1.8);
    await audit.finish({ built, findings: result.findings, flat, reach });
    expect(built.isError).toBe(false);
    expect(result.findings.filter((finding) => finding.kind === 'overhang')).toEqual([]);
    // Given 0.3 mm off the wall, laid onto it (roundText): the wall under the letters is measured.
    expect(built.text).toContain('as measured on trial');
  } finally {
    await audit.close();
  }
});
