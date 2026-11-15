import { jsonSchema, tool, type LanguageModelUsage, type ModelMessage, type StopCondition, type ToolSet } from 'ai';

import type { AgentEvent } from '../../shared/contract';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { decide, decideParameterNames, inputProblem, offeredTool, type ToolDecision } from './policy';
import { ANSWER_GUIDANCE, questionGuidance } from './questions';
import { REVIEW_GUIDANCE } from './review';
import { NO_RESEARCH_GUIDANCE, RESEARCH_GUIDANCE } from './research';
import { compactDescription, compactJson, withSkillNote, withToolNotes } from './toolNotes';
import { SCREENSHOT_GUIDANCE, VIEW_GUIDANCE } from './viewContext';
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

/** How every route starts its role (audit R21): SolidCraft runs headless (ADR 0016), and the tools have no common prefix. */
export const ROLE_INTRO =
  'You are the design assistant inside PartBuddy, a desktop app for 3D-printable parts. ' +
  "SolidCraft runs in the background and the user watches every step live in PartBuddy's 3D view. " +
  'Use the tools you are given to inspect and change the design. Work in small visible steps: ' +
  'one sketch or one feature group per call. Units are millimetres.';

/**
 * Fewer rounds (issue #446): each round sends the whole conversation again, and a model on the own loop called one tool
 * per round (23 rounds for one build, 7 of them single `execute` calls one after another, seen 2026-11-15).
 */
export const ROUNDS_GUIDANCE =
  "Call tools that do not depend on each other's answers together in the same round, put the commands of one feature " +
  'group into one `batch`, and use the command signatures you were given instead of looking them up. Finish the part ' +
  'as planned all the same: when a step is refused, correct it and go on.';

/** What the assistant owes the user about its limits, on every route (audit R27). */
export const LIMITS_GUIDANCE =
  'Say plainly what you did not check, what you estimated and what has not been test-printed; never call a part safe ' +
  "for mains voltage, food, load over a person or heat without the user's own test. Call a part done only when it is " +
  'built, measured and you have read its ready-to-print check.';

/**
 * How far an arm may bend (audit R41): no value reaches the model, so it does not judge it; the snap hook block computes
 * the strain at the arm's root and says it in its answer (blockTool.ts `strainSaid`).
 */
export const FLEX_GUIDANCE =
  `How far an arm may bend depends on the material; never judge it from memory: build a snap hook with ${BLOCK_TOOL} ` +
  '(snapFit), whose answer gives the strain at the arm\'s root, and follow its warning.';

/**
 * The role prompt of a route. `ownLoop`: this loop (ChatGPT, local models), which has a round limit and passes no picture
 * from a tool answer; otherwise Claude Code. `research`: the conversation may search the web.
 */
export function rolePrompt(ownLoop: boolean, research: boolean): string {
  return [
    ROLE_INTRO,
    ROUNDS_GUIDANCE,
    REFUSAL_GUIDANCE,
    // The own loop stops after MAX_STEPS rounds (audit R57); Claude Code has no such limit.
    ...(ownLoop ? [`You have ${String(MAX_STEPS)} tool rounds per turn: plan them, and say when you stop unfinished.`] : []),
    'Answer in the language the user writes in, and name bodies, features and sketches in it too: the structure tree and the timeline show these names.',
    LIMITS_GUIDANCE,
    REVIEW_GUIDANCE,
    VIEW_GUIDANCE,
    ...(ownLoop ? [] : [SCREENSHOT_GUIDANCE]),
    ASSEMBLY_GUIDANCE,
    JOINT_GUIDANCE,
    MECHANISM_GUIDANCE,
    BLOCK_GUIDANCE,
    'Place holes and other features by expressions of the size they depend on ("w/2", "plate_height - 15"), so they follow when it changes.',
    STANDARD_GUIDANCE,
    questionGuidance(research),
    FLEX_GUIDANCE,
    ANSWER_GUIDANCE,
    research ? RESEARCH_GUIDANCE : NO_RESEARCH_GUIDANCE,
  ].join(' ');
}

/**
 * SolidCraft's tools whose whole answer is a picture: this loop hands the model only the text parts (`[image omitted]`),
 * so it does not offer them (audit R24). `compare_picture` stays: it answers its overlap and edges as text, only its
 * overlay is a picture (`tools/list` of solidcraft-cli 0.40.1). shortcut: other image parts of tool answers are still
 * dropped; forward them as image parts once the routes' servers are shown to take pictures in tool results.
 */
export const PICTURE_TOOLS: ReadonlySet<string> = new Set(['screenshot']);

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

/** The newest tool results that stay whole when a new turn starts (issue #446; Anthropic's context editing keeps 3). */
export const KEPT_RESULTS = 3;

/** Shorter tool results stay as they are: replacing them would save little. */
const SHORT_RESULT_CHARS = 400;

/** What stands in for a removed result. */
export const CLEARED_RESULT = '[PartBuddy: result of an earlier turn, removed to save tokens. Call the tool again if you need it.]';

/**
 * The history with the long tool results of earlier turns replaced, all but the newest {@link KEPT_RESULTS} (issue #446):
 * every request of this loop carries the whole history, and old answers (the print check after each change, design
 * views) are stale once the design moved on. Called once when a turn starts, so the prefix stays the same, and cached,
 * through the turn's rounds.
 */
export function withEarlierResultsCleared(history: readonly ModelMessage[]): ModelMessage[] {
  let kept = 0;
  return history
    .slice()
    .reverse()
    .map((message) => {
      if (message.role !== 'tool') return message;
      return {
        ...message,
        content: message.content.map((part) => {
          if (part.type !== 'tool-result') return part;
          kept += 1;
          const output = part.output;
          const text = output.type === 'text' || output.type === 'error-text' ? output.value : output.type === 'json' || output.type === 'error-json' ? JSON.stringify(output.value) : null;
          if (kept <= KEPT_RESULTS || text === null || text.length <= SHORT_RESULT_CHARS || text === CLEARED_RESULT) return part;
          return { ...part, output: { type: 'text' as const, value: CLEARED_RESULT } };
        }),
      };
    })
    .reverse();
}

/** What a turn cost in tokens (issue #446), summed over its requests; missing counts are 0. */
export interface TurnTokens {
  requests: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

/** The tokens of a turn of this loop, from the AI SDK's usage of each step (each step is one request). */
export function turnTokens(steps: readonly { usage: LanguageModelUsage }[]): TurnTokens {
  const sum = { requests: steps.length, input: 0, cached: 0, output: 0, reasoning: 0 };
  for (const { usage } of steps) {
    sum.input += usage.inputTokens ?? 0;
    sum.cached += usage.inputTokenDetails.cacheReadTokens ?? 0;
    sum.output += usage.outputTokens ?? 0;
    sum.reasoning += usage.outputTokenDetails.reasoningTokens ?? 0;
  }
  return sum;
}

/** What each round of a turn called, for the log (issue #446): `measure | batch+execute | text`. */
export function roundsLine(route: string, steps: readonly { toolCalls: readonly { toolName: string }[] }[]): string {
  return `${route} turn rounds: ${steps.map((step) => step.toolCalls.map((call) => call.toolName).join('+') || 'text').join(' | ')}`;
}

/** The log line of a turn's tokens, the same on every route so runs can be compared. */
export function tokensLine(route: string, tokens: TurnTokens): string {
  return `${route} turn tokens: ${String(tokens.requests)} requests, input ${String(tokens.input)} (cached ${String(tokens.cached)}), output ${String(tokens.output)} (reasoning ${String(tokens.reasoning)})`;
}

/**
 * PartBuddy's role, then SolidCraft's server instructions with PartBuddy's tool notes: the gate
 * proxy hands those to Claude Code as MCP instructions, this loop has to pass them itself.
 */
export function instructionsFor(upstream: UpstreamTools, research: boolean): string {
  return `${rolePrompt(true, research)}\n\n${withToolNotes(upstream.instructions())}`;
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
    // Refused by the policy (BC-13), or a picture this route cannot see (BC-21).
    if (!offeredTool(definition.name) || PICTURE_TOOLS.has(definition.name)) continue;
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
    return resultText(compactJson(withSkillNote(name, compactDescription(name, result))));
  } catch (error) {
    options.event({ type: 'tool', id, name, summary, decision: 'allowed', ok: false });
    return `SolidCraft tool failed: ${(error as Error).message}`;
  }
}
