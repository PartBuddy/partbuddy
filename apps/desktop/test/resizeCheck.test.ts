import { describe, expect, it } from 'vitest';

import type { ToolResult, UpstreamTools } from '../src/main/agents/gateProxy';
import { withResizeCheck } from '../src/main/agents/resizeCheck';

const text = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
// As SolidCraft 0.45.0 answers: the housing in no component, the screw's component renamed after its size by the resize.
const pair = (volume: number, component: string) => ({ a: 'Housing', b: 'Body2', volume_mm3: volume, a_part: { component: '' }, b_part: { component } });

/** SolidCraft with a screw in a housing: its overlap before and after the resize, by call. */
function upstream(volumes: number[]): UpstreamTools & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name, args) => {
      calls.push(name === 'execute' ? String(args.command) : name);
      const resized = calls.includes('parts.resize');
      if (name === 'batch') return Promise.resolve(text({ results: [{ interferences: [pair(volumes.shift() ?? 0, resized ? 'SHCS M4x10' : 'SHCS M3x8')] }] }));
      return Promise.resolve(text({ component: 3, name: 'SHCS M4x10', size: 'M4' }));
    },
  };
}

describe('the overlap of a resized standard part (audit S-21)', () => {
  it('says when the part grew into the body its hole is in', async () => {
    const solidcraft = upstream([0, 12.34]);
    const result = await withResizeCheck(solidcraft).callTool('execute', { command: 'parts.resize', params: { component: 'SHCS M3x8', size: 'M4' } });
    expect(solidcraft.calls).toEqual(['batch', 'parts.resize', 'batch']);
    expect(result.content.at(-1)?.text).toContain('after the resize, SHCS M4x10 overlaps Housing by 12.3 mm³ (before 0). The hole it sits in was not changed');
  });

  it('says nothing when the overlap stayed, as in a pilot hole, and leaves other calls alone', async () => {
    const solidcraft = upstream([8, 8.2]);
    const result = await withResizeCheck(solidcraft).callTool('execute', { command: 'parts.resize', params: { component: 'SHCS M3x8', length: 16 } });
    expect(result.content).toHaveLength(1);
    const other = upstream([]);
    await withResizeCheck(other).callTool('execute', { command: 'solid.extrude', params: {} });
    expect(other.calls).toEqual(['solid.extrude']);
  });
});
