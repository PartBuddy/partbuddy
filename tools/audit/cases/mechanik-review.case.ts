import { templateSteps } from '../../../apps/desktop/src/shared/templates';
import { bodiesOf, box, scene, summarize, type Audit, type Step } from '../mechanik-helpers';

// The scenes of the review of PR #358.

const guide = async (audit: Audit, steps: Step[], args: Record<string, unknown> = {}) => {
  await audit.batch([box('Base', [0, -20, 0], [60, 40, 6]), ...steps]);
  const tool = await audit.tool('partbuddy_mechanism', { kind: 'slide', fixed: 'Base', moving: 'Stop', from: [0, 0, 6], to: [60, 0, 6], ...args });
  return { tool, ...(await summarize(audit, ['Base', 'Stop'], { profiles: ['pla04'] })) };
};
const features = async (audit: Audit) => ((await audit.batch([{ command: 'document.inspect', params: { timeline: 'summary', bodies: 'names' } }]))[0] as { timeline: unknown[]; undo: number; bodies: unknown });

test('review 1: the roof only where the slider is solid', async () => {
  await scene('r-knob', 0.4, (audit) => guide(audit, [box('Stop', [15, -15, 6.4], [30, 30, 6]), { command: 'solid.cylinder', params: { diameter: 10, height: 10, base: [30, 0, 12.4], axis: [0, 0, 1], operation: 'join', targets: ['Stop'] } }]));
  await scene('r-drawer', 0.4, (audit) => guide(audit, [box('Stop', [15, -15, 6.4], [30, 30, 20]), { command: 'solid.box', params: { length: 26, width: 26, height: 20, corner: [17, -13, 11.4], operation: 'cut', targets: ['Stop'] } }]));
  await scene('r-slanted', 0.4, (audit) => guide(audit, [box('Stop', [15, -15, 6.4], [30, 30, 14]), { command: 'solid.chamfer', params: { edges: [[15, 0, 20.4]], distance: 9, body: 'Stop' } }]));
  await scene('r-block', 0.4, (audit) => guide(audit, [box('Stop', [15, -15, 6.4], [30, 30, 9])]));
  await scene('r-small-rail', 0.4, (audit) => guide(audit, [box('Stop', [15, -15, 6.4], [30, 30, 2.5])], { width: 2, height: 1.5 }));
});

test('review 2: taken back past the ceiling of the undo depth', async () => {
  await scene('r-undo-cap', 0.4, async (audit) => {
    await audit.batch([{ command: 'component.create', params: { name: 'Both' } }, box('Base', [0, 0, 0], [40, 30, 16]), box('Flap', [45, 0, 0], [40, 30, 16]), { command: 'component.activate', params: { component: 0 } }]);
    await audit.batch(Array.from({ length: 185 }, (_, i) => box(`C${String(i)}`, [i * 3, 100, 0], [2, 2, 2])));
    const before = await features(audit);
    const first = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42.5, 0, 16], to: [42.5, 30, 16] });
    const mid = await features(audit);
    const again = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42.5, 0, 16], to: [42.5, 30, 16] });
    const after = await features(audit);
    const [listing] = await audit.batch([{ command: 'component.list', params: {} }]);
    const bodies = (await bodiesOf(audit)).filter((body) => body.name === 'Base' || body.name === 'Flap');
    return { first, again, counts: { before: [before.timeline.length, before.undo], mid: [mid.timeline.length, mid.undo], after: [after.timeline.length, after.undo] }, active: (listing as { active?: unknown }).active, bodies };
  });
});

test('review 3: two hinges on one line share their joint', async () => {
  await scene('r-two-hinges', 0.4, async (audit) => {
    await audit.batch([box('Base', [0, 0, 0], [40, 120, 4]), box('Flap', [44, 0, 0], [40, 120, 4])]);
    const first = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 0, 3], to: [42, 30, 3] });
    const second = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 90, 3], to: [42, 120, 3] });
    const off = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Base', moving: 'Flap', from: [42, 45, 3.5], to: [42, 75, 3.5] });
    const [joints] = await audit.batch([{ command: 'joint.list', params: {} }]);
    return { first, second, off, list: { conflicts: (joints as { conflicts?: unknown }).conflicts, dof: (joints as { dof?: unknown }).dof }, ...(await summarize(audit, ['Base', 'Flap'], { profiles: ['pla04'] })) };
  });
});

test('review 6: the template at a height of 5 mm', async () => {
  await scene('r-template-low', 0.4, async (audit) => {
    await audit.batch(templateSteps('hingedBox'));
    await audit.batch([{ command: 'parameters.change', params: { name: 'height', expression: '5 mm' } }]);
    return summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] });
  });
});
