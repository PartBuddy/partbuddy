import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { summarize } from '../mechanik-helpers';
import { openAudit, type Step } from '../harness';

// The hinged box of the token run of 2026-11-15 (#446): the model's own batches (box-446.scene.json), then hinge and closure.
test('box 446: hinge then closure', async () => {
  const scene = JSON.parse(readFileSync(join(__dirname, 'box-446.scene.json'), 'utf8')) as Record<string, { commands: Step[] }>;
  const audit = await openAudit('box-446');
  try {
    const sets = (scene['16']?.commands ?? []).map((step) => ({ command: 'parameters.change', params: { name: step.params.name, expression: step.params.value } }));
    await audit.batch([...(scene['12']?.commands ?? []), ...(scene['13']?.commands ?? [])]);
    await audit.batch(sets);
    // As the model would call them now: the hinge without its line, the closure without the hinge's.
    const hinge = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', name: 'Lid hinge' });
    const afterHinge = ((await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] })) as { check?: unknown }).check;
    const closure = await audit.tool('partbuddy_mechanism', { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [1.8, 62.6, 20], to: [78.2, 119, 20], wall: 1.8, radius: 0.4, side: 'y+', name: 'Front snap closure' });
    const [clash] = await audit.batch([{ command: 'inspect.interference', params: { bodies: ['Box', 'Lid'] } }]);
    const sweep = await audit.batch([{ command: 'joint.sweep', params: { joint: 'Lid hinge', from: 0, to: 180 } }]).catch((cause: unknown) => [{ error: (cause as Error).message }]);
    const summary = await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] });
    await audit.finish({ hinge: hinge.text, closure: closure.text, clash: (clash as { count?: unknown }).count, sweep, afterHinge, check: (summary as { check?: unknown }).check ?? summary });
  } finally {
    await audit.close();
  }
});
