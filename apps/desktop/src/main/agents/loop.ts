import { jsonSchema, tool, type StopCondition, type ToolSet } from 'ai';

import type { AgentEvent } from '../../shared/contract';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { decide, decideParameterNames, inputProblem, offeredTool, type ToolDecision } from './policy';
import { ANSWER_GUIDANCE, QUESTION_GUIDANCE } from './questions';
import { RESEARCH_GUIDANCE } from './research';
import { withSkillNote, withToolNotes } from './toolNotes';
import { VIEW_GUIDANCE } from './viewContext';
import { ASSEMBLY_GUIDANCE, JOINT_GUIDANCE } from './assemblyTool';
import { BLOCK_GUIDANCE, BLOCK_TOOL } from './blockTool';
import { STANDARD_GUIDANCE } from './standardTool';
import { MECHANISM_GUIDANCE, MECHANISM_TOOL } from './mechanismTool';

/**
 * What PartBuddy's own agent loop shares between its routes (ChatGPT plan, local models): the
 * instructions and SolidCraft's tools behind the same policy as the gate proxy (ADR 0010).
 */

/** Tool rounds per turn before the loop stops. */
export const MAX_STEPS = 25;

/**
 * What to do when PartBuddy refuses a call, on every route (audit R22): a policy refusal is worked around, a block or
 * mechanism that was not built is corrected and called again, never modelled by hand instead.
 */
export const REFUSAL_GUIDANCE =
  'If PartBuddy refuses a tool as not allowed, tell the user why and continue without it. ' +
  `When ${BLOCK_TOOL} or ${MECHANISM_TOOL} answers "Not built", correct what it names and call it again; never model that feature yourself instead. ` +
  'If it still cannot be built, stop and tell the user.';

const INSTRUCTIONS = [
  'You are the design assistant inside PartBuddy, a desktop app for 3D-printable parts.',
  'SolidCraft is open and the user watches every step live, mirrored in PartBuddy.',
  'Use the solidcraft tools to inspect and change the design. Work in small visible steps:',
  'one sketch or one feature group per call. Units are millimetres.',
  REFUSAL_GUIDANCE,
  // The own loop stops after MAX_STEPS rounds (audit R57); Claude Code has no such limit.
  `You have ${String(MAX_STEPS)} tool rounds per turn: plan them, and say when you stop unfinished.`,
  'Answer in the language the user writes in, and name bodies, features and sketches in it too: the structure tree and the timeline show these names.',
  VIEW_GUIDANCE,
  ASSEMBLY_GUIDANCE,
  JOINT_GUIDANCE,
  MECHANISM_GUIDANCE,
  BLOCK_GUIDANCE,
  STANDARD_GUIDANCE,
  QUESTION_GUIDANCE,
  ANSWER_GUIDANCE,
].join(' ');

/** Rounds in a row with the same tool calls after which the loop stops: small models can circle. */
export const REPEAT_LIMIT = 3;

/** Told to the user when {@link repeatsItself} stopped a turn. */
export const LOOP_NOTICE = 'The model repeated the same tool calls three times in a row, so PartBuddy stopped this turn. Rephrase the request or pick a stronger model.';

/** What a round called; rounds of only unknown or unreadable calls count as one kind, whatever the names. */
function roundCalls(step: Parameters<StopCondition<ToolSet>>[0]['steps'][number]): string {
  const calls = step.toolCalls;
  if (calls.length > 0 && calls.every((call) => call.invalid === true)) return 'invalid';
  return JSON.stringify(calls.map((call) => [call.toolName, call.input as unknown]));
}

/** Stop condition: the last {@link REPEAT_LIMIT} rounds made the same tool calls (or only invalid ones). */
export const repeatsItself: StopCondition<ToolSet> = ({ steps }) => {
  if (steps.length < REPEAT_LIMIT) return false;
  const rounds = steps.slice(-REPEAT_LIMIT).map(roundCalls);
  return rounds[0] !== '[]' && rounds.every((round) => round === rounds[0]);
};

/**
 * True when the turn ended because it used all {@link MAX_STEPS} rounds while the model still called tools, not
 * because the model had finished (audit R57): the part may be half built and its check unread.
 */
export function usedAllRounds(steps: readonly { finishReason: string }[]): boolean {
  return steps.length >= MAX_STEPS && steps.at(-1)?.finishReason === 'tool-calls';
}

/** The `done` detail of such a turn; the chat words it (`assistant.failed.reason.rounds`). */
export const ROUNDS_DETAIL = 'rounds';

/** Goes to the model with the next message after a turn that used all its rounds. */
export const ROUNDS_NOTE = `[PartBuddy: your last turn stopped after all ${String(MAX_STEPS)} tool rounds, perhaps unfinished. Look at the design and its ready-to-print check before you go on.]`;

/** The note for the next message: the rounds note when the last turn was cut short, before PartBuddy's other notes. */
export function withRoundsNote(cutShort: boolean, note: string | null): string | null {
  if (!cutShort) return note;
  return note ? `${ROUNDS_NOTE}\n${note}` : ROUNDS_NOTE;
}

/**
 * How full the context is after a turn: the last request's input plus its answer, which the next
 * request carries. Null without a known window or when the server reported no token counts.
 */
export function contextAfter(steps: { usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } }[], size: number | undefined): { used: number; size: number } | null {
  const usage = steps.at(-1)?.usage;
  if (!size || typeof usage?.inputTokens !== 'number') return null;
  return { used: Math.max(0, Math.round(usage.inputTokens + (usage.outputTokens ?? 0))), size };
}

/**
 * PartBuddy's role, then SolidCraft's server instructions with PartBuddy's tool notes: the gate
 * proxy hands those to Claude Code as MCP instructions, this loop has to pass them itself.
 */
export function instructionsFor(upstream: UpstreamTools, research: boolean): string {
  return `${INSTRUCTIONS}${research ? ` ${RESEARCH_GUIDANCE}` : ''}\n\n${withToolNotes(upstream.instructions())}`;
}

/** Text of an MCP tool result for the model; images are summarised, not forwarded. */
function resultText(result: ToolResult): string {
  return result.content
    .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : `[${part.type} omitted]`))
    .join('\n');
}

export interface PolicyToolOptions {
  /** A new id for each call, shown with its tool card. */
  nextId(): string;
  event(event: AgentEvent): void;
  /** Provider options for every tool, such as the OpenAI namespace. */
  providerOptions?: Parameters<typeof tool>[0]['providerOptions'];
}

/** SolidCraft's tools for the AI SDK, without those the policy refuses (audit S-04); every call passes PartBuddy's policy and the tool's schema first. */
export async function policyToolSet(upstream: UpstreamTools, options: PolicyToolOptions): Promise<ToolSet> {
  const tools: ToolSet = {};
  for (const definition of await upstream.listTools()) {
    if (!offeredTool(definition.name)) continue;
    tools[definition.name] = tool({
      description: definition.description ?? definition.name,
      inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
      ...(options.providerOptions ? { providerOptions: options.providerOptions } : {}),
      execute: async (input: unknown) => callTool(upstream, definition, (input ?? {}) as Record<string, unknown>, options),
    });
  }
  return tools;
}

async function callTool(upstream: UpstreamTools, definition: UpstreamTool, args: Record<string, unknown>, options: PolicyToolOptions): Promise<string> {
  const { name } = definition;
  const id = options.nextId();
  const summary = JSON.stringify(args).slice(0, 2000);
  let decision: ToolDecision = decide(name, args);
  // The AI SDK's jsonSchema checks nothing without a validator (audit W28), as in the gate proxy.
  const problem = decision.allow ? inputProblem(definition, args) : null;
  if (problem) decision = { allow: false, reason: problem };
  // A misspelt parameter name would make a new parameter (audit R17), as in the gate proxy.
  if (decision.allow) decision = await decideParameterNames((tool, toolArgs) => upstream.callTool(tool, toolArgs), name, args);
  if (!decision.allow) {
    options.event({ type: 'tool', id, name, summary, decision: 'denied', reason: decision.reason.slice(0, 500) });
    return decision.reason;
  }
  options.event({ type: 'tool', id, name, summary, decision: 'allowed' });
  try {
    const result = await upstream.callTool(name, args, id);
    options.event({ type: 'tool', id, name, summary, decision: 'allowed', ok: result.isError !== true });
    return resultText(withSkillNote(name, result));
  } catch (error) {
    options.event({ type: 'tool', id, name, summary, decision: 'allowed', ok: false });
    return `SolidCraft tool failed: ${(error as Error).message}`;
  }
}
