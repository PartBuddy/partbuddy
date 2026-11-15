import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { summarize } from '../mechanik-helpers';
import { openAudit, type Step } from '../harness';

// The hinged box of the token run of 2026-11-15 (#446), then "Make the box 10 mm taller": hinge and closure follow the
// halves' heights, and the box still closes, turns and prints clean, without being taken back and built again.
test('box 446: hinge and closure follow the heights', async () => {
  const scene = JSON.parse(readFileSync(join(__dirname, 'box-446.scene.json'), 'utf8')) as Record<string, { commands: Step[] }>;
  const audit = await openAudit('box-446-follow');
  try {
    const sets = (scene['16']?.commands ?? []).map((step) => ({ command: 'parameters.change', params: { name: step.params.name, expression: step.params.value } }));
    await audit.batch([...(scene['12']?.commands ?? []), ...(scene['13']?.commands ?? [])]);
    await audit.batch(sets);
    const hinge = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Box', moving: 'Lid', name: 'Lid hinge' });
    const closure = await audit.tool('partbuddy_mechanism', { kind: 'closure', fixed: 'Box', moving: 'Lid', from: [1.8, 62.6, 20], to: [78.2, 119, 20], wall: 1.8, radius: 0.4, side: 'y+', name: 'Front snap closure' });
    const before = await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] });
    const changed = await audit.batch([
      { command: 'parameters.change', params: { name: 'box_height', expression: '25 mm' } },
      { command: 'parameters.change', params: { name: 'lid_height', expression: '25 mm' } },
    ]);
    const [clash, joints, measured] = await audit.batch([
      { command: 'inspect.interference', params: { bodies: ['Box', 'Lid'] } },
      { command: 'joint.list', params: {} },
      { command: 'inspect.measure', params: { bodies: ['Box', 'Lid'] } },
    ]);
    const sweep = await audit.batch([{ command: 'joint.sweep', params: { joint: 'Lid hinge', from: 0, to: 180 } }, { command: 'joint.sweep', params: { joint: 'Lid hinge', from: 0, to: -180 } }]).catch((cause: unknown) => [{ error: (cause as Error).message }]);
    const after = await summarize(audit, ['Box', 'Lid'], { profiles: ['pla04'] });
    const frame = (joints as { joints?: { name?: unknown; frame_a?: { origin?: number[] } }[] }).joints?.find((joint) => joint.name === 'Lid hinge')?.frame_a?.origin;
    await audit.finish({ hinge: hinge.text, closure: closure.text, changed, clash, frame, measured, sweep, before: (before as { check?: unknown }).check, after: (after as { check?: unknown }).check ?? after });
    expect(hinge.isError).toBe(false);
    expect(closure.isError).toBe(false);
    expect(hinge.text).toContain('It follows the parameters');
    expect(closure.text).toContain('It follows the parameters');
    expect((clash as { count?: unknown }).count).toBe(0);
    // The joint's axis went up with the rims, from 20 to 25 mm.
    expect(frame?.[2]).toBeCloseTo(25, 3);
    // It still shuts (the bead presses past the rim on the last degrees) and prints clean.
    expect((sweep[0] as { stopped_at?: number }).stopped_at).toBeGreaterThan(170);
    expect((after as { check?: unknown }).check).toEqual({ pla04: { status: 'ready', findings: [] } });
  } finally {
    await audit.close();
  }
});
