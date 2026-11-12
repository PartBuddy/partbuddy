import { describe, expect, it } from 'vitest';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { STANDARD_GUIDANCE, withStandardTool } from '../src/main/agents/standardTool';
import { STANDARDS, STANDARD_TOPICS, standardText } from '../src/shared/standards';

describe('the standards the assistant looks up', () => {
  const upstream: UpstreamTools = {
    instructions: () => undefined,
    listTools: () => Promise.resolve([]),
    callTool: (name) => Promise.resolve({ content: [{ type: 'text', text: `upstream ${name}` }] }),
  };

  it('answers a topic itself with its rules, builds nothing and passes other tools on', async () => {
    const tools = withStandardTool(upstream);
    const [tool] = await tools.listTools();
    expect(tool?.name).toBe('partbuddy_standard');
    expect(tool?.description).toContain('slidingLid (a lid that slides into grooves of a box)');
    const feet = String((await tools.callTool('partbuddy_standard', { topic: 'feet' })).content[0]?.text);
    expect(feet).toContain('Feet and what a part stands on. Design it yourself by these rules');
    expect(feet).toContain('SJ5003 11.1 × 5.0');
    expect(feet).toContain('None of this has been printed by PartBuddy yet, and the print check does not test these rules');
    expect(await tools.callTool('partbuddy_standard', { topic: 'gear' })).toMatchObject({ isError: true, content: [{ text: `topic must be one of ${STANDARD_TOPICS.join(', ')}` }] });
    expect(await tools.callTool('inspect_design', {})).toMatchObject({ content: [{ text: 'upstream inspect_design' }] });
    expect(decide('partbuddy_standard', { topic: 'feet' })).toEqual({ allow: true });
  });

  it('has rules for every topic, names each in the guidance and points to the blocks that exist', () => {
    for (const topic of STANDARD_TOPICS) {
      expect(STANDARDS[topic].rules.length).toBeGreaterThanOrEqual(5);
      expect(standardText(topic).split('\n- ')).toHaveLength(STANDARDS[topic].rules.length + 1);
    }
    expect(STANDARD_GUIDANCE).toContain('call partbuddy_standard with that topic');
    // Where a block builds the thing, the standard sends the assistant there instead of repeating its sizes.
    expect(standardText('starKnob')).toContain('partbuddy_block knob');
    expect(standardText('hook')).toContain('partbuddy_block keyhole');
    expect(standardText('slidingLid')).toContain('kind plug and shape dovetail');
    // Figures from the sheets: fan hole spacing and the Raspberry Pi's hole pattern.
    expect(standardText('vent')).toContain('80 fan 71.5');
    expect(standardText('boardMount')).toContain('58 × 49 mm');
  });
});
