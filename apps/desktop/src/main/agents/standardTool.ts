import { STANDARDS, STANDARD_TOPICS, standardText, type StandardTopic } from '../../shared/standards';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * `partbuddy_standard` (decided 2026-11-11): the rules and sizes for a kind of part, read by the
 * assistant before it designs one itself. They stay out of the role prompt, which every request
 * carries, and come from one table (`standards.ts`) instead of the model's memory.
 */

export const STANDARD_TOOL = 'partbuddy_standard';

const standardTool: UpstreamTool = {
  name: STANDARD_TOOL,
  description: `Read PartBuddy's rules and sizes for a kind of part before you design one yourself: ${STANDARD_TOPICS.map((topic) => `${topic} (${STANDARDS[topic].title.toLowerCase()})`).join(', ')}. It builds nothing.`,
  inputSchema: {
    type: 'object',
    properties: { topic: { type: 'string', enum: [...STANDARD_TOPICS] } },
    required: ['topic'],
    additionalProperties: false,
  },
};

/** The upstream tools plus `partbuddy_standard`. */
export function withStandardTool(upstream: UpstreamTools): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: async () => [...(await upstream.listTools()), standardTool],
    callTool: (name, args, callId): Promise<ToolResult> => {
      if (name !== STANDARD_TOOL) return upstream.callTool(name, args, callId);
      const topic = args.topic;
      if (typeof topic !== 'string' || !(STANDARD_TOPICS as readonly string[]).includes(topic)) {
        return Promise.resolve({ content: [{ type: 'text', text: `topic must be one of ${STANDARD_TOPICS.join(', ')}` }], isError: true });
      }
      return Promise.resolve({ content: [{ type: 'text', text: standardText(topic as StandardTopic) }] });
    },
  };
}

/** Added to the role prompt of every route. */
export const STANDARD_GUIDANCE = `Before you design a sliding lid, a clip or clamp, feet, a hook or an eye, a cable entry, vents or a fan opening, a mount for a circuit board or a star knob, call ${STANDARD_TOOL} with that topic and follow what it says: the sizes come from data sheets and standards, not from your memory.`;
