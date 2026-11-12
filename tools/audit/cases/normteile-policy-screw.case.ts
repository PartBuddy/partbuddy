import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { openAudit, PLA_04, type Audit } from '../harness';
import { appState, attempt, finish } from '../normteile-policy-helpers';

/** Triangles of a binary STL SolidCraft wrote for these bodies (the export of the app names its bodies the same way). */
async function stlTriangles(audit: Audit, file: string, bodies: string[]): Promise<number | { failed: string }> {
  return attempt(async () => {
    const path = join(audit.dir, file);
    await audit.batch([{ command: 'file.export', params: { path, format: 'stl', bodies } }]);
    return readFileSync(path).readUInt32LE(80);
  });
}

async function screwJoint(head: 'cap' | 'countersunk') {
  const name = `normteile-policy/screw-${head}`;
  const audit = await openAudit(name);
  try {
    await audit.batch([
      { command: 'solid.box', params: { length: '60 mm', width: '40 mm', height: '20 mm', operation: 'new', body_name: 'Block', name: 'Block' } },
      { command: 'solid.box', params: { length: '60 mm', width: '40 mm', height: '6 mm', corner: [0, 0, 20], operation: 'new', body_name: 'Plate', name: 'Plate' } },
    ]);
    const built = await audit.tool('partbuddy_mechanism', { kind: 'screw', fixed: 'Block', moving: 'Plate', from: [10, 10, 26], to: [10, 10, 20], more: [[50, 30, 26]], head, size: 'M3', name: 'Plate screws' });
    const state = await appState(audit, PLA_04);
    const screws = state.mirrored.filter((body) => body !== 'Block' && body !== 'Plate');
    const [listing] = (await audit.batch([{ command: 'component.list', params: {} }])) as [{ components?: { id: number; name: string; parent: unknown; bodies?: string[] }[] }];
    const parts = (listing.components ?? []).filter((entry) => entry.parent !== null && (entry.bodies ?? []).some((body) => screws.includes(body)));
    const metadata = (await audit.batch(parts.map((part) => ({ command: 'component.metadata', params: { component: part.id } })))) as { name?: string; description?: string }[];
    const result = {
      tool: built,
      partsInserted: audit.sent.flatMap((batch) => batch.commands).filter((step) => step.command === 'parts.insert'),
      descriptions: metadata.map((entry) => ({ component: entry.name, description: entry.description })),
      screws,
      state,
      screwsPrinted: screws.filter((body) => state.printed.includes(body)),
      // What the export writes: the printed bodies; against the two plates alone.
      exportTriangles: { printedBodies: await stlTriangles(audit, 'printed.stl', state.printed), platesOnly: await stlTriangles(audit, 'plates.stl', ['Block', 'Plate']) },
      screwsMeasure: screws.length === 0 ? null : await attempt(() => audit.batch([{ command: 'inspect.measure', params: { bodies: screws } }])),
      clearanceScrewPlate: screws.length === 0 ? null : await attempt(() => audit.batch([{ command: 'inspect.clearance', params: { bodies: ['Plate', 'Block', ...screws], clearance: 0.2 } }])),
    };
    await finish(audit, name, result);
    return result;
  } finally {
    await audit.close();
  }
}

// S-01 / G2 through PartBuddy's own tool: partbuddy_mechanism screw puts its screws in as standard parts; which of them the mirror keeps out of printing.
test('partbuddy_mechanism screw, head cap: the screws are standard parts', async () => {
  const result = await screwJoint('cap');
  expect(result.tool.isError).toBe(false);
});

test('partbuddy_mechanism screw, head countersunk: the screws are standard parts', async () => {
  const result = await screwJoint('countersunk');
  expect(result.tool.isError).toBe(false);
});
