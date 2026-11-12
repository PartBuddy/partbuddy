import type { UpstreamTools } from './gateProxy';

const object = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/**
 * Print faces the assistant sets or clears itself (`body.print_face` through execute or batch) are kept
 * like those of a block or a mechanism, so the plate view and the print check lay the part the same way:
 * SolidCraft answers with the face's name and does not list print faces later.
 */
export function withPrintFaces(upstream: UpstreamTools, keepFace: (body: string, face: string | null) => void): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: () => upstream.listTools(),
    callTool: async (name, args, callId) => {
      const result = await upstream.callTool(name, args, callId);
      const steps = name === 'execute' ? [object(args)] : name === 'batch' && Array.isArray(args.commands) ? (args.commands as unknown[]).map(object) : [];
      if (result.isError || !steps.some((step) => step?.command === 'body.print_face')) return result;
      try {
        const text = result.content.find((part) => part.type === 'text')?.text;
        const reply = object(JSON.parse(typeof text === 'string' ? text : '')) ?? {};
        // A batch that failed was taken back as a whole.
        if (reply.failed) return result;
        const answers = name === 'execute' ? [reply.result ?? reply] : Array.isArray(reply.results) ? (reply.results as unknown[]) : [];
        steps.forEach((step, index) => {
          const params = object(step?.params);
          if (step?.command !== 'body.print_face' || typeof params?.body !== 'string') return;
          const face = object(answers[index])?.face;
          if (params.point === undefined || params.point === null) keepFace(params.body, null);
          else if (typeof face === 'string') keepFace(params.body, face);
        });
      } catch {
        // An answer that cannot be read leaves the kept faces as they were.
      }
      return result;
    },
  };
}
