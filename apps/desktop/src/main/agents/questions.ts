import { z } from 'zod';

import type { AgentEvent, AgentQuestion, MessageAnswer } from '../../shared/contract';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { CHANGING_TOOLS } from './workLog';

/**
 * Questions and plans as cards in the chat (M2a): the model calls `partbuddy_ask` or
 * `partbuddy_plan`, PartBuddy shows a card with buttons and the call returns at once. The answer
 * comes as the user's next message. Until then every tool that may change the design is refused,
 * so the model cannot build past an open question, whatever it decides. Nothing waits inside a
 * tool call: no time-outs, Stop keeps working, and both assistant routes behave alike.
 */

export const ASK_TOOL = 'partbuddy_ask';
export const PLAN_TOOL = 'partbuddy_plan';

const optionInput = z.object({ label: z.string().trim().min(1).max(60), detail: z.string().trim().max(200).optional(), recommended: z.boolean().optional() }).strict();
const questionInput = z
  .object({
    header: z.string().trim().max(24).optional(),
    question: z.string().trim().min(1).max(500),
    options: z.array(optionInput).min(2).max(5),
    multiSelect: z.boolean().optional(),
  })
  .strict();
const askInput = z.object({ questions: z.array(questionInput).min(1).max(4) }).strict();

const planInput = z
  .object({
    summary: z.string().trim().min(1).max(300),
    name: z.string().trim().min(1).max(60).optional(),
    steps: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  })
  .strict();

const askTool: UpstreamTool = {
  name: ASK_TOOL,
  description:
    'Ask the user a round of 1 to 4 questions at once, shown as one card in PartBuddy\'s chat; each question has 2 to 5 ' +
    'answers to pick from and a field for a different answer. Mark the answer you recommend with recommended (it is ' +
    'preselected) and say why in its detail; every answer must work as it is, without anything typed, so for a value to ' +
    'measure offer typical values and let the user type the exact one. Use multiSelect when several answers can apply. ' +
    'Ask what matters for the part ' +
    'and cannot be settled from the request, the picture or research (what it attaches to and how, sizes of the objects ' +
    'involved, loads, cables and access, print limits); never ask what you can look up. After calling it, end your turn ' +
    'without changing the design: the answers are the next message, one line per question.',
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            header: { type: 'string', maxLength: 24, description: 'A very short title for the question, e.g. "Mounting".' },
            question: { type: 'string', maxLength: 500, description: 'The question, in the language the user writes in.' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', maxLength: 60, description: 'The answer as shown, e.g. "3 mm".' },
                  detail: { type: 'string', maxLength: 200, description: 'What this answer means for the part.' },
                  recommended: { type: 'boolean', description: 'True for the answer you recommend; at most one unless multiSelect.' },
                },
                required: ['label'],
                additionalProperties: false,
              },
            },
            multiSelect: { type: 'boolean', description: 'True when the user may pick several answers.' },
          },
          required: ['question', 'options'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

const planTool: UpstreamTool = {
  name: PLAN_TOOL,
  description:
    'Show the user a short plan before a larger job (a new part, or several features at once), with the buttons Go, ' +
    'Change and Cancel in PartBuddy\'s chat. Small changes need no plan. After calling it, end your turn without changing ' +
    'the design: the user\'s decision is the next message.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', maxLength: 300, description: 'One sentence: what you will build.' },
      name: {
        type: 'string',
        maxLength: 60,
        description: 'For a new part: a short name for it in the language the user writes in, e.g. "Pi 4 case"; PartBuddy names the project after it.',
      },
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        items: { type: 'string', maxLength: 200 },
        description: 'The steps in order, each one line with its key dimensions.',
      },
    },
    required: ['summary', 'steps'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

/**
 * How long answers are (UI upgrade, chat): PartBuddy shows every step, the parameters and the
 * dimensions itself, so the chat needs only what changed and what to decide. Added to the role
 * prompt of every route.
 */
export const ANSWER_GUIDANCE =
  'Keep answers short: two or three sentences on what you built, found or need from the user. PartBuddy already shows ' +
  'every step, the parameters with their values and the dimensions, so do not repeat them as tables, lists or headings; ' +
  'name a parameter when the user may want to change it. Write more only when the user asks for an explanation or a check.';

/** Added to the role prompt of every route. */
// Concept, use and function check first: decided 2026-11-06, after a practice phone holder that would not have held the phone.
export const QUESTION_GUIDANCE = [
  'For a new part, work like a product designer before you build.',
  `1. Concept: think about how proven products and good printed designs solve this task (look them up when you may research).`,
  `Your first ${ASK_TOOL} round offers 2 or 3 such concepts with their trade-offs, your recommendation marked.`,
  '2. Use: ask what decides the design and you cannot know: how it is used (loads, shocks and vibration, how often it is put',
  'on and taken off, buttons, ports, cables, viewing angle), where, and the real sizes of the user\'s own items; look up',
  'product data instead of asking for it. One round per turn, up to four questions, until nothing that matters is open.',
  '3. Function check: before the plan, go through the part in use. Is it held securely under those loads, can it be put in',
  'and taken out, does it flex where it must (PLA is stiff: a snap or a lip needs a thin, long arm; otherwise use a band,',
  'spring, screw or clamp), are levers short and walls strong enough, does it print without supports. If the check fails,',
  'change the concept and tell the user why.',
  `Then call ${PLAN_TOOL}, with the function check as its last step, and build only after the user said Go. For several`,
  `features at once, the plan alone is enough. When a dimension or choice that matters is unclear later, ask with ${ASK_TOOL}`,
  'instead of guessing. Small, clear changes need neither.',
].join(' ');

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] });
const refusal = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }], isError: true });

export class Questions {
  private pending: AgentQuestion | null = null;
  private sequence = 0;

  constructor(
    private readonly emit: (event: AgentEvent) => void,
    /** A plan named the part (a new design takes the name for its project). */
    private readonly named: (name: string) => void = () => undefined,
  ) {}

  /** The open question or plan, if any. */
  get open(): AgentQuestion | null {
    return this.pending;
  }

  tools(upstream: UpstreamTools): UpstreamTools {
    return {
      instructions: () => upstream.instructions(),
      listTools: async () => [...(await upstream.listTools()), askTool, planTool],
      callTool: (name, args, callId) => {
        if (name === ASK_TOOL || name === PLAN_TOOL) return Promise.resolve(this.show(name, args));
        if (this.pending && CHANGING_TOOLS.has(name)) {
          return Promise.resolve(
            refusal(
              `The user has not answered your ${this.pending.kind === 'plan' ? 'plan' : 'question'} yet. End your turn now; ` +
                'the answer comes as the next message. Do not change the design before that.',
            ),
          );
        }
        return upstream.callTool(name, args, callId);
      },
    };
  }

  /**
   * The note for the user's next message, which answers the open question or plan; a button press
   * names the choice, typed text is the answer itself. Closes the question.
   */
  answer(answer?: MessageAnswer): string | null {
    const question = this.pending;
    if (!question) return null;
    this.pending = null;
    const choice = answer?.question === question.id ? answer.choice : null;
    this.emit({ type: 'answered', id: question.id, choice });
    if (question.kind === 'plan') {
      if (choice === 'go') return '[PartBuddy: the user pressed Go on your plan. Build it now, in small visible steps.]';
      if (choice === 'cancel') return '[PartBuddy: the user cancelled your plan. Do not change the design; ask what they want instead.]';
      return '[PartBuddy: the user wants the plan changed, as this message says. Show the changed plan with partbuddy_plan before you build.]';
    }
    const asked = question.questions.map((entry) => `"${entry.question}"`).join(', ');
    if (choice === 'answered') return `[PartBuddy: the user answered your questions ${asked} on the card; the message has one line per question.]`;
    return `[PartBuddy: this message answers your questions ${asked}.]`;
  }

  /** Drops an open question, for example when the conversation starts anew. */
  clear(): void {
    this.pending = null;
  }

  private show(name: string, args: Record<string, unknown>): ToolResult {
    if (this.pending) return refusal('A question or plan is already waiting for the user. End your turn now.');
    this.sequence += 1;
    const id = `question-${this.sequence}`;
    if (name === ASK_TOOL) {
      // A model that still sends one question without the round around it gets a round of one.
      const parsed = askInput.safeParse(typeof args.question === 'string' && !('questions' in args) ? { questions: [args] } : args);
      if (!parsed.success) return refusal(`Invalid ${ASK_TOOL} input: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`.slice(0, 500));
      const questions = parsed.data.questions.map((entry) => ({
        ...(entry.header ? { header: entry.header } : {}),
        question: entry.question,
        options: entry.options.map((option) => ({
          label: option.label,
          ...(option.detail ? { detail: option.detail } : {}),
          ...(option.recommended ? { recommended: true as const } : {}),
        })),
        ...(entry.multiSelect ? { multiSelect: true as const } : {}),
      }));
      this.pending = { id, kind: 'ask', questions };
    } else {
      const parsed = planInput.safeParse(args);
      if (!parsed.success) return refusal(`Invalid ${PLAN_TOOL} input: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`.slice(0, 500));
      this.pending = { id, kind: 'plan', summary: parsed.data.summary, steps: parsed.data.steps };
      if (parsed.data.name) this.named(parsed.data.name);
    }
    this.emit({ type: 'question', question: this.pending });
    return text('PartBuddy shows this to the user with buttons. End your turn now without changing the design; the answer is the next message.');
  }
}
