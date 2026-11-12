import { decide } from '../../../apps/desktop/src/main/agents/policy';
import { STANDARD_PARTS_KEY } from '../../../apps/desktop/src/main/solidcraft/standardParts';
import { openAudit, PLA_04 } from '../harness';
import { appState, attempt, finish, text } from '../normteile-policy-helpers';

const NAME = 'normteile-policy/metadata';

// H-01 / X1: a printed body with a wall far too thin, then the description of its component set to a
// library part's by `execute component.metadata.set`, as the policy decides it and as SolidCraft takes it.
test('component.metadata.set description turns a printed body into a standard part', async () => {
  const audit = await openAudit(NAME);
  try {
    // A lid 40 × 30 mm and 0.3 mm thick: under the nozzle width, so the check must block.
    await audit.batch([
      { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '20 mm', operation: 'new', body_name: 'Box', name: 'Box' } },
      { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '0.3 mm', corner: [0, 0, 30], operation: 'new', body_name: 'Deckel', name: 'Deckel' } },
    ]);
    const before = await appState(audit, PLA_04);
    const calls: [string, Record<string, unknown>][] = [
      ['execute', { command: 'component.from_bodies', params: { bodies: ['Deckel'] } }],
      ['execute', { command: 'component.metadata.set', params: { component: 'Deckel', description: 'Hex nut M3' } }],
    ];
    const run = [];
    for (const [tool, args] of calls) {
      const decision = decide(tool, args);
      run.push({ tool, args, decision, reply: decision.allow ? text(await audit.tool(tool, args)) : null });
    }
    const after = await appState(audit, PLA_04);
    // Other ways to the same mark, decided only.
    const decided = [
      ['execute', { command: 'component.metadata.set', params: { component: 'Deckel', values: { description: 'Hex nut M3' } } }],
      ['batch', { commands: [{ command: 'component.metadata.set', params: { component: 'Deckel', description: 'Plain washer M3' } }] }],
      ['execute', { command: 'component.metadata.set', params: { component: 'Deckel', part_number: 'x', bom_type: 'purchased' } }],
      ['execute', { command: 'document.metadata.set', params: { key: STANDARD_PARTS_KEY, value: { bodies: ['Box'] } } }],
      ['execute', { command: 'document.metadata.set', params: { values: { [STANDARD_PARTS_KEY]: { bodies: ['Box'] } } } }],
      ['execute', { command: 'document.metadata.set', params: { properties: { [STANDARD_PARTS_KEY]: 'x' } } }],
    ].map(([tool, args]) => ({ tool, args, decision: decide(tool as string, args as Record<string, unknown>) }));
    // Undone, the body is printed again?
    const undone = await attempt(async () => {
      await audit.tool('undo', {});
      return appState(audit, PLA_04);
    });
    const result = { before, run, after, decided, afterUndo: undone };
    await finish(audit, NAME, result);
    expect(before.printed).toContain('Deckel');
  } finally {
    await audit.close();
  }
});
