import { METADATA_PREFIX } from '../notes/noteRecord';
import type { ToolResult, UpstreamTools } from './gateProxy';

/**
 * Keeps the user's notes away from the model's own hands (ADR 0020). SolidCraft returns the
 * design's metadata, and with it every note, from `inspect_design`, `document.inspect`,
 * `component.metadata` and `timeline.export_script` (checked with SolidCraft 0.30.1); notes from
 * foreign files could carry instructions. So every result loses PartBuddy's keys before the model
 * sees it, and an undo that would take away a note is refused: the model reads notes only
 * through PartBuddy (selection notes and `partbuddy_view`), and only the user's own.
 */

export interface EngineStep {
  command: string;
  params: Record<string, unknown>;
}

/**
 * Runs steps on trial and puts the design back exactly, undo history included (ADR 0017); the
 * results of every step, or null when a step failed.
 */
export type TrialRun = (steps: EngineStep[]) => Promise<unknown[] | null>;

const lower = METADATA_PREFIX.toLowerCase();

/** Removes every property whose name starts with PartBuddy's metadata key, at any depth. */
export function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key.toLowerCase().startsWith(lower)) continue;
      out[key] = scrubValue(entry);
    }
    return out;
  }
  return value;
}

const REDACTED =
  "PartBuddy removed this result because it contains PartBuddy's notes. The user's notes reach you through partbuddy_view " +
  'and the notes before a message; continue without this result.';

/** The result as the model may see it: PartBuddy's keys removed, or the whole text withheld. */
export function scrubResult(result: ToolResult): ToolResult {
  const touched = (part: ToolResult['content'][number]) => part.type === 'text' && typeof part.text === 'string' && part.text.toLowerCase().includes(lower);
  if (!result.content.some(touched)) return result;
  const content = result.content.map((part) => {
    if (!touched(part) || typeof part.text !== 'string') return part;
    let text: string;
    try {
      text = JSON.stringify(scrubValue(JSON.parse(part.text) as unknown));
    } catch {
      text = REDACTED;
    }
    if (text.toLowerCase().includes(lower)) text = REDACTED;
    return { ...part, text };
  });
  return { ...result, content };
}

/** Engine steps of a tool call that may undo something; null when it undoes nothing. */
export function undoSteps(name: string, args: Record<string, unknown>): EngineStep[] | null {
  const steps: EngineStep[] = [];
  const found = { undo: false };
  const add = (tool: string, params: Record<string, unknown>) => {
    if (tool === 'undo' || tool === 'edit.undo') {
      found.undo = true;
      steps.push({ command: 'edit.undo', params: {} });
    } else if (tool === 'redo' || tool === 'edit.redo') {
      steps.push({ command: 'edit.redo', params: {} });
    } else if (tool === 'execute') {
      if (typeof params.command === 'string') add(params.command, (params.params as Record<string, unknown> | undefined) ?? {});
    } else if (tool === 'set_parameter') {
      const value = params.value ?? params.expression;
      steps.push({ command: 'parameters.change', params: { name: params.name, expression: value } });
    } else if (/^[a-z]+(\.[a-z_]+)+$/.test(tool)) {
      steps.push({ command: tool, params });
    }
    // Other tools in a batch (measure, inspect_design, list_commands …) only read.
  };
  if (name === 'batch' && Array.isArray(args.commands)) {
    for (const step of args.commands as unknown[]) {
      const entry = (step ?? {}) as { command?: unknown; params?: unknown };
      if (typeof entry.command === 'string') add(entry.command, (entry.params as Record<string, unknown> | undefined) ?? {});
    }
  } else {
    add(name, args);
  }
  return found.undo ? steps : null;
}

function noteKeys(metadata: unknown): Map<string, string> {
  const keys = new Map<string, string>();
  const object = (metadata as { metadata?: unknown } | null)?.metadata;
  if (typeof object !== 'object' || object === null) return keys;
  for (const [key, value] of Object.entries(object as Record<string, unknown>)) {
    if (key.toLowerCase().startsWith(lower)) keys.set(key, JSON.stringify(value));
  }
  return keys;
}

const refusal = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

export function guardNotes(upstream: UpstreamTools, trial: TrialRun): UpstreamTools {
  return {
    instructions: () => upstream.instructions(),
    listTools: () => upstream.listTools(),
    callTool: async (name, args, callId) => {
      const steps = undoSteps(name, args);
      if (steps) {
        const read = { command: 'document.metadata', params: {} };
        const attempt = (inner: EngineStep[]) => trial([read, ...inner, read]).catch(() => null);
        // When another step fails on trial, the undo and redo steps alone still tell.
        const results = (await attempt(steps)) ?? (await attempt(steps.filter((step) => step.command.startsWith('edit.'))));
        if (results) {
          const before = noteKeys(results[0]);
          const after = noteKeys(results.at(-1));
          const touched = [...before].some(([key, value]) => after.get(key) !== value);
          if (touched) {
            return refusal(
              "This undo would remove or change one of the user's notes, because the user's last change was a note. Do not undo; " +
                'change the feature directly instead (timeline.edit, parameters.change or a new step).',
            );
          }
        }
      }
      return scrubResult(await upstream.callTool(name, args, callId));
    },
  };
}
