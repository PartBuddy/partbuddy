import { describe, expect, it } from 'vitest';

import { minimumWall } from '@partbuddy/geometry';

import type { UpstreamTools } from '../src/main/agents/gateProxy';
import { decide } from '../src/main/agents/policy';
import { STANDARD_GUIDANCE, withStandardTool } from '../src/main/agents/standardTool';
import { DEFAULT_PRINTER, defaultBlock, raisedBlock, sizesOf, type FeatureBlock } from '../src/shared/blocks';
import { lineWidth, snapSize } from '../src/shared/designFit';
import { CLEARANCE_NORMAL, NUT, NUT_ALLOWANCE, NUT_DIN_FLATS, PILOT_FACTOR, pilotHole } from '../src/shared/screwSizes';
import { HEX_HEAD_HEIGHT, STANDARDS, STANDARD_TOPICS, standardText } from '../src/shared/standards';

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

  // Audit BC-22: the figures come from the tables and blocks the code uses, and what depends on the profile says so.
  it('says the sizes of the blocks and tables it names, and the profile where a size depends on it', () => {
    // T24, R5: three lines on the 0.4 mm nozzle are a whole number of lines, as 1.2 mm was not.
    const vent = standardText('vent');
    const bars = 3 * lineWidth(DEFAULT_PRINTER);
    expect(vent).toContain(`bars at least 3 lines of the print profile wide between them (the line width your design rules name: ${String(bars)} mm on a 0.4 mm nozzle`);
    expect(snapSize('wall', bars, DEFAULT_PRINTER)).toBe(bars);
    expect(snapSize('wall', 1.2, DEFAULT_PRINTER)).toBe(bars);
    expect(vent).toContain('with bars of 3 lines');
    expect(vent).not.toMatch(/1\.2 mm/);
    // T50, R45: the bed chamfer in layers, on its own and only where chamfers are on; the hook's root radius against the usual half wall.
    const feet = standardText('feet');
    expect(feet).toContain(`Unless chamfers are turned off for the part, chamfer every edge that lies on the print bed at 45°, 2 to 3 layers high (0.4 to 0.6 mm on 0.2 mm layers)`);
    expect(DEFAULT_PRINTER.layer).toBe(0.2);
    expect(feet).not.toContain('0.4 mm at 45°');
    expect(feet).not.toContain('design rules');
    const hookText = standardText('hook');
    expect(hookText).toContain("at least the hook's thickness, more than the half wall that is the usual minimum for inner corners under load");
    expect(hookText).not.toContain('design rules');
    // R46, H-33: hooks over the block with its own sizes; pins only locate. MV-27: standoffs three times the hole. MV-23: plug heights.
    const board = standardText('boardMount');
    const hook = defaultBlock('snapFit', '', [0, 0, 0], 'M3') as Extract<FeatureBlock, { block: 'snapFit' }>;
    expect(board).toContain(`built with partbuddy_block snapFit (by default ${String(hook.thickness)} mm thick at its root on a 0.4 mm nozzle, at least two lines, and ${String(hook.width)} mm wide)`);
    // K3: "at least two lines" is the block's own raise: kept up to 0.6 mm, raised to two lines on 0.8.
    const thickness = (nozzle: number) => (raisedBlock(hook, { nozzle, layer: 0.2 }).block as typeof hook).thickness;
    expect(thickness(0.6)).toBe(hook.thickness);
    expect(thickness(0.8)).toBe(minimumWall(0.8));
    expect(minimumWall(0.8)).toBeGreaterThan(hook.thickness);
    expect(board).not.toContain('1 mm thick at its root');
    expect(board).toContain('which only locate it');
    expect(board).toContain('outer diameter three times the hole');
    expect(board).toContain('USB 16.0, Ethernet 13.5, USB-C 3.2, micro HDMI 3.0, audio jack 6.0 mm), the side view of the Pi 5 drawing 3.2, 3.4, 4.4 and 4.1 mm');
    expect(board).toContain('a printed pin is reliable from 3 mm and weak under 5 mm');
    expect(board).toContain(`draw the pilot hole ${String(PILOT_FACTOR)} times the screw's diameter (2 mm for M2.5, 2.4 mm for M3)`);
    expect(pilotHole(3)).toBe(Math.round((PILOT_FACTOR * 3 + 0.15) * 100) / 100);
    // T50, MV-22, R47: every knob size has its head, nut and ISO 273 hole; nutTrap's range is the block's, both ends.
    const knob = standardText('starKnob');
    const traps = sizesOf('nutTrap');
    expect(knob).toContain(`For ${String(traps[0])} to ${String(traps[traps.length - 1])} partbuddy_block nutTrap makes the pocket.`);
    expect(knob).toContain('For M2 to M10');
    for (const size of ['M5', 'M6', 'M8', 'M10'] as const) {
      expect(knob).toContain(`${size} ${String(CLEARANCE_NORMAL[size])}`);
      expect(knob).toContain(`${size} ${String(NUT[size][0])} and ${String(HEX_HEAD_HEIGHT[size])}`);
      expect(knob).toContain(`${String(NUT[size][1])} (${size})`);
    }
    expect(knob).toContain('M10 50, 22, 32 mm.');
    expect(knob).toContain('M10 16 and 6.4 mm.');
    // K4: the pocket's depth allowance as nutTrap builds it; S2: the wider DIN M10 head and nut.
    expect(knob).toContain(`${String(NUT_ALLOWANCE.depth)} mm deeper than the head, as partbuddy_block nutTrap makes it`);
    expect(knob).toContain(`M10 heads of DIN 933 and nuts of DIN 934 are ${String(NUT_DIN_FLATS.M10)} mm across flats: pocket ${String(Math.round(((NUT_DIN_FLATS.M10 ?? 0) + NUT_ALLOWANCE.flats) * 100) / 100)}.`);
    expect(knob).toContain('pocket 17.3.');
    expect(knob).not.toContain('M12');
    expect(knob).not.toContain('0.4 mm under it');
  });
});
