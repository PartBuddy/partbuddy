/**
 * SolidCraft tool calls as engine steps, for running them on trial (ADR 0020) and for replaying
 * a recorded variant (ADR 0021). `execute` is its command; a `batch` is its steps, where tool-name
 * steps become the engine command they stand for; read-only tools are left out.
 */

export interface EngineStep {
  command: string;
  params: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

const ENGINE_COMMAND = /^[a-z]+(\.[a-z_]+)+$/;

function params(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stepsOfTool(tool: string, args: Record<string, unknown>, out: EngineStep[]): void {
  if (tool === 'undo' || tool === 'edit.undo') out.push({ command: 'edit.undo', params: {} });
  else if (tool === 'redo' || tool === 'edit.redo') out.push({ command: 'edit.redo', params: {} });
  else if (tool === 'execute') {
    if (typeof args.command === 'string') stepsOfTool(args.command, params(args.params), out);
  } else if (tool === 'set_parameter') {
    out.push({ command: 'parameters.change', params: { name: args.name, expression: args.value ?? args.expression } });
  } else if (tool === 'batch') {
    for (const step of Array.isArray(args.commands) ? (args.commands as unknown[]) : []) {
      const entry = params(step);
      if (typeof entry.command === 'string') stepsOfTool(entry.command, params(entry.params), out);
    }
  } else if (ENGINE_COMMAND.test(tool)) {
    out.push({ command: tool, params: args });
  }
  // Other tools (measure, inspect_design, list_commands …) only read.
}

export function engineSteps(calls: readonly ToolCall[]): EngineStep[] {
  const out: EngineStep[] = [];
  for (const call of calls) stepsOfTool(call.name, call.args, out);
  return out;
}
