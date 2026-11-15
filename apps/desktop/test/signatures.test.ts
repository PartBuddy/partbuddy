import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { COMMON_COMMANDS, commonSignatures, withSignatures } from '../src/main/agents/signatures';

describe('signatures of the common commands (issue 446)', () => {
  it("reads each command's params line once and puts them after the engine's instructions", async () => {
    const asked: string[] = [];
    const upstream: UpstreamTools = {
      instructions: () => 'SolidCraft instructions',
      listTools: () => Promise.resolve([]),
      callTool: (_name, args) => {
        asked.push(String(args.id));
        if (args.id === 'solid.box') return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify({ id: 'solid.box', params: 'length, width, height: expr' }) }] });
        if (args.id === 'solid.shell') return Promise.reject(new Error('gone'));
        return Promise.resolve({ isError: true, content: [{ type: 'text', text: 'unknown command' }] });
      },
    };
    const note = await commonSignatures(upstream);
    expect(await commonSignatures(upstream)).toBe(note);
    expect(asked).toEqual([...COMMON_COMMANDS]);
    expect(withSignatures(upstream, note).instructions()).toBe(
      'SolidCraft instructions\n\nSignatures of the common engine commands (for `execute` and `batch` steps; `describe_command` gives the details of these and every other command):\n- solid.box: length, width, height: expr',
    );
    expect(withSignatures(upstream, '').instructions()).toBe('SolidCraft instructions');
  });
});
