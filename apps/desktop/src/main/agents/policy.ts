/**
 * Tool policy of the gate proxy (ADR 0010, ADR 0015). Every SolidCraft tool an external agent
 * calls passes here first; the model cannot skip it, because the agent sees SolidCraft only
 * through PartBuddy's proxy.
 */

export type ToolDecision = { allow: true } | { allow: false; reason: string };

/** Tools that read, model or render without touching files or discarding work. */
const ALLOWED = new Set([
  'list_commands',
  'describe_command',
  'execute',
  'batch',
  'inspect_design',
  'measure',
  'body_topology',
  'set_parameter',
  'check_parameters',
  'screenshot',
  'compare_picture',
  'running',
  'pending',
  'undo',
  'redo',
  'skill_reference',
  // Answered by PartBuddy itself from its own view (viewContext.ts), never forwarded.
  'partbuddy_view',
]);

/**
 * Tools that discard the design or read and write files. They need the confirmation and export
 * gates of ADR 0010, which the preview does not have yet, so they are refused with a reason the
 * model can pass on.
 */
const NEEDS_CONFIRMATION: Record<string, string> = {
  new_design: 'starting a new design discards the current one',
  open: 'opening a file replaces the design',
  save: 'PartBuddy saves the design by itself after every change',
  export: 'the user exports with PartBuddy’s Export button (3MF, STL, STEP)',
};

/** File commands that `execute` and `batch` could reach around the tool list. */
const FILE_COMMANDS = /^(file|doc)\./;

function commandsOf(name: string, args: Record<string, unknown>): string[] {
  if (name === 'execute' && typeof args.command === 'string') return [args.command];
  if (name === 'batch' && Array.isArray(args.commands)) {
    return args.commands.map((step: unknown) =>
      typeof step === 'object' && step !== null && typeof (step as { command?: unknown }).command === 'string'
        ? (step as { command: string }).command
        : '',
    );
  }
  return [];
}

export function decide(name: string, args: Record<string, unknown>): ToolDecision {
  const confirmation = NEEDS_CONFIRMATION[name];
  if (confirmation) {
    return { allow: false, reason: `${name} is not available in PartBuddy yet: ${confirmation}. Tell the user how to do it in PartBuddy instead.` };
  }
  if (!ALLOWED.has(name)) return { allow: false, reason: `${name} is not allowed by PartBuddy` };
  const fileCommand = commandsOf(name, args).find((command) => FILE_COMMANDS.test(command));
  if (fileCommand) {
    return { allow: false, reason: `${fileCommand} reads or writes files; PartBuddy does not allow it for the assistant yet` };
  }
  return { allow: true };
}
