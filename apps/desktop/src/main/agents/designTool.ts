import { DESIGN_RULES, type DesignRule, type DesignRules } from '../../shared/contract';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * `partbuddy_design_rules` (decided 2026-11-07): when the user turns a group of design rules off or
 * back on in the chat ("no fillets"), the assistant records it for the project. PartBuddy keeps it
 * next to the design with the part's material, so it holds after a restart and goes before the
 * setting; the next print note says which groups are in force.
 */

export const DESIGN_TOOL = 'partbuddy_design_rules';

const choice = (what: string) => ({ type: ['boolean', 'null'], description: `${what}: false off, true on, null back to the user's setting.` });

const designTool: UpstreamTool = {
  name: DESIGN_TOOL,
  description:
    'Record that the user turned a group of the design rules off or back on for this project, e.g. "no fillets" → ' +
    'rounding false, "screw the hinge instead" → printInPlace false. Only for what the user said; leave out the groups ' +
    'they did not mention.',
  inputSchema: {
    type: 'object',
    properties: {
      rounding: choice('Rounded and chamfered edges'),
      printInPlace: choice('Print-in-place hinges, joints and clips'),
      details: choice('Refined details (hole chamfers, sunk screw heads, lead-ins, even walls)'),
      snap: choice('Sizes snapped to nozzle and layer height'),
    },
    additionalProperties: false,
  },
};

const error = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

/** The model's input as a change, or what is wrong with it. */
export function checkDesignChange(args: Record<string, unknown>): Partial<Record<DesignRule, boolean | null>> | string {
  const change: Partial<Record<DesignRule, boolean | null>> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!(DESIGN_RULES as readonly string[]).includes(key)) return `unknown rule group ${key}; known: ${DESIGN_RULES.join(', ')}`;
    if (value !== null && typeof value !== 'boolean') return `${key} must be true, false or null`;
    change[key as DesignRule] = value;
  }
  return Object.keys(change).length > 0 ? change : 'name at least one rule group';
}

/** The upstream tools plus `partbuddy_design_rules`; `save` keeps the change and answers the groups now in force. */
export function withDesignTool(upstream: UpstreamTools, save: (change: Partial<Record<DesignRule, boolean | null>>) => DesignRules): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), designTool],
    callTool: async (name, args, callId): Promise<ToolResult> => {
      if (name !== DESIGN_TOOL) return upstream.callTool(name, args, callId);
      const change = checkDesignChange(args);
      if (typeof change === 'string') return error(`Not kept: ${change}`);
      let rules: DesignRules;
      try {
        rules = save(change);
      } catch (cause) {
        return error(`Not kept: ${(cause as Error).message}`);
      }
      const list = (on: boolean) => DESIGN_RULES.filter((rule) => rules[rule] === on).join(', ') || 'none';
      return { content: [{ type: 'text', text: `Kept for this project. On: ${list(true)}. Off: ${list(false)}.` }] };
    },
  };
}
