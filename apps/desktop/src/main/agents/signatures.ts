import type { UpstreamTools } from './gateProxy';

/**
 * The engine commands a model looks up most while it builds (traces of 2026-11-15, issue #446): a quarter of a build's
 * rounds were `list_commands` and `describe_command` for these, each round sending the whole conversation again. Their
 * one-line signatures go along with the instructions instead, where they are cached with the rest of the prefix.
 */
export const COMMON_COMMANDS = [
  'solid.box',
  'solid.cylinder',
  'solid.extrude',
  'solid.revolve',
  'solid.fillet',
  'solid.chamfer',
  'solid.shell',
  'solid.mirror',
  'sketch.create',
  'parameters.add',
  'parameters.change',
  'timeline.edit',
  'timeline.inspect',
] as const;

const read = new WeakMap<UpstreamTools, Promise<string>>();

/**
 * The signatures of {@link COMMON_COMMANDS} as this SolidCraft describes them (its `params` line), read once per engine
 * connection, so they always match the running version. A command it does not describe is left out; a failure gives an
 * empty note and the model looks commands up as before.
 */
export function commonSignatures(upstream: UpstreamTools, log: (line: string) => void = () => undefined): Promise<string> {
  let note = read.get(upstream);
  if (!note) {
    note = (async () => {
      const lines: string[] = [];
      for (const id of COMMON_COMMANDS) {
        try {
          const result = await upstream.callTool('describe_command', { id });
          const text = result.content[0]?.text;
          const params = typeof text === 'string' && result.isError !== true ? (JSON.parse(text) as { params?: unknown }).params : null;
          if (typeof params === 'string') lines.push(`- ${id}: ${params}`);
        } catch (error) {
          log(`signature of ${id} not read: ${(error as Error).message}`);
        }
      }
      if (lines.length === 0) return '';
      return [
        'Signatures of the common engine commands (for `execute` and `batch` steps; `describe_command` gives the details of these and every other command):',
        ...lines,
      ].join('\n');
    })();
    read.set(upstream, note);
  }
  return note;
}

/** The engine's tools with the signatures after its own instructions. */
export function withSignatures(upstream: UpstreamTools, note: string): UpstreamTools {
  return {
    instructions: () => [upstream.instructions(), note].filter((part) => part).join('\n\n') || undefined,
    listTools: () => upstream.listTools(),
    callTool: (name, args, callId) => upstream.callTool(name, args, callId),
  };
}
