import { templateSteps } from '../../../apps/desktop/src/shared/templates';
import { bodiesOf, box, scene, summarize, type Audit } from '../mechanik-helpers';

// Scenes for the fixes of the mechanism findings: the template after a change of its sizes, and the scenes of the contract tests.

const hinge = async (audit: Audit, steps: Parameters<Audit['batch']>[0], args: Record<string, unknown>, pair: [string, string] = ['Base', 'Flap']) => {
  await audit.batch(steps);
  const tool = await audit.tool('partbuddy_mechanism', args);
  return { tool, ...(await summarize(audit, pair, { profiles: ['pla04'] })) };
};

test('fix: template hingedBox closes, and follows its sizes', async () => {
  await scene('fix-template', 0.4, async (audit) => {
    await audit.batch(templateSteps('hingedBox'));
    const sweep = async () => (await audit.batch([{ command: 'joint.sweep', params: { joint: 'Hinge', from: 0, to: 180 } }]).catch((cause: unknown) => [{ error: (cause as Error).message }]))[0];
    const first = { sweep: await sweep(), ...(await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] })) };
    const strip = ({ measured: _measured, ...rest }: Record<string, unknown>) => rest;
    await audit.batch([
      { command: 'parameters.change', params: { name: 'height', expression: '24 mm' } },
      { command: 'parameters.change', params: { name: 'length', expression: '80 mm' } },
      { command: 'parameters.change', params: { name: 'wall', expression: '3 mm' } },
    ]);
    const timeline = await audit.tool('inspect_design', {}).then((answer) => (answer.text.match(/"(error|warning)": "[^"]+"/g) ?? []).slice(0, 10));
    const changed = { sweep: await sweep(), timeline, ...(await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] })) };
    return { first: strip(first), changed: strip(changed) };
  });
});

test('fix: the scenes of the contract tests', async () => {
  const plates = (gap: number, high = 4) => [box('Base', [0, 0, 0], [40, 30, high]), box('Flap', [40 + gap, 0, 0], [40, 30, high])];
  await scene('fix-case', 0.4, (audit) => hinge(audit, plates(5, 16), { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42.5, 0, 16], to: [42.5, 30, 16], name: 'Case hinge' }));
  await scene('fix-flap', 0.4, (audit) => hinge(audit, plates(4), { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], name: 'Flap hinge' }));
  await scene('fix-far', 0.4, async (audit) => {
    await audit.batch(plates(10));
    const before = await bodiesOf(audit);
    const tool = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [45, 0, 3], to: [45, 30, 3] });
    return { tool, before, after: await bodiesOf(audit) };
  });
  await scene('fix-components', 0.4, (audit) => hinge(audit, [...plates(4), { command: 'component.from_bodies', params: { bodies: ['Base', 'Flap'] } }], { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3], name: 'Flap hinge' }));
  await scene('fix-carriage', 0.4, (audit) => hinge(audit, [box('Base', [0, 0, 0], [60, 30, 4]), box('Carriage', [20, 0, 4.4], [20, 30, 6])], { kind: 'slide', fixed: 'Base', moving: 'Carriage', from: [0, 15, 4], to: [60, 15, 4], name: 'Carriage guide' }, ['Base', 'Carriage']));
  // Three knuckles on 40 mm: the pin bridges 13.6 mm inside the middle one.
  await scene('fix-long-knuckles', 0.4, (audit) => hinge(audit, [box('Base', [0, 0, 0], [40, 40, 16]), box('Flap', [45, 0, 0], [40, 40, 16])], { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42.5, 0, 16], to: [42.5, 40, 16], knuckles: 3 }));
});
