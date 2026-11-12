import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { withPrintFaces } from '../src/main/agents/printFaceWatch';

function watched(reply: unknown, isError = false) {
  const kept: string[] = [];
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: () => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(reply) }], isError }),
  };
  return { kept, tools: withPrintFaces(upstream, (body, face) => kept.push(`${body}:${String(face)}`)) };
}

describe('print faces the assistant sets itself', () => {
  it('keeps the face SolidCraft names, from a batch and from a single command', async () => {
    const batch = watched({ results: [{}, { body: 'Lid', face: 'face-3' }] });
    await batch.tools.callTool('batch', { commands: [{ command: 'solid.box', params: {} }, { command: 'body.print_face', params: { body: 'Lid', point: [0, 0, 5] } }] });
    expect(batch.kept).toEqual(['Lid:face-3']);
    const single = watched({ body: 'Lid', face: 'face-4' });
    await single.tools.callTool('execute', { command: 'body.print_face', params: { body: 'Lid', point: [0, 0, 5] } });
    expect(single.kept).toEqual(['Lid:face-4']);
  });

  it('clears a face set without a point, and keeps nothing of a call that failed', async () => {
    const cleared = watched({ body: 'Lid' });
    await cleared.tools.callTool('execute', { command: 'body.print_face', params: { body: 'Lid' } });
    expect(cleared.kept).toEqual(['Lid:null']);
    const failed = watched({ results: [], failed: { command: 'body.print_face', error: 'no flat face' } });
    await failed.tools.callTool('batch', { commands: [{ command: 'body.print_face', params: { body: 'Lid', point: [0, 0, 5] } }] });
    const refused = watched('no', true);
    await refused.tools.callTool('execute', { command: 'body.print_face', params: { body: 'Lid', point: [0, 0, 5] } });
    expect([...failed.kept, ...refused.kept]).toEqual([]);
  });
});
