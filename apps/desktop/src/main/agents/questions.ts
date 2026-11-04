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

const askInput = z
  .object({
    question: z.string().trim().min(1).max(500),
    options: z
      .array(z.object({ label: z.string().trim().min(1).max(60), detail: z.string().trim().max(200).optional() }).strict())
      .min(2)
      .max(5),
  })
  .strict();

const planInput = z
  .object({
    summary: z.string().trim().min(1).max(300),
    steps: z.array(z.string().trim().min(1).max(200)).min(1).max(12),
  })
  .strict();

const askTool: UpstreamTool = {
  name: ASK_TOOL,
  description:
    'Ask the user one question with 2 to 5 answers to pick from, shown as buttons in PartBuddy\'s chat. Use it when a ' +
    'dimension or choice that matters is unclear (fit, wall thickness, which side) instead of guessing. The user may also ' +
    'type a different answer. After calling it, end your turn without changing the design: the answer is the next message.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', maxLength: 500, description: 'The question, short, in the language the user writes in.' },
      options: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 60, description: 'The answer as the button shows it, e.g. "3 mm".' },
            detail: { type: 'string', maxLength: 200, description: 'Optional: what this answer means for the part.' },
          },
          required: ['label'],
          additionalProperties: false,
        },
      },
    },
    required: ['question', 'options'],
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

/** Added to the role prompt of every route. */
export const QUESTION_GUIDANCE =
  `For a larger job (a new part, or several features at once) first call ${PLAN_TOOL} and end your turn; build only after ` +
  `the user said Go. When a dimension or choice that matters is unclear, ask with ${ASK_TOOL} instead of guessing, and end ` +
  'your turn. Small, clear changes need neither.';

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] });
const refusal = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }], isError: true });

export class Questions {
  private pending: AgentQuestion | null = null;
  private sequence = 0;

  constructor(private readonly emit: (event: AgentEvent) => void) {}

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
    const option = choice !== null ? question.options[Number(choice)] : undefined;
    if (option) return `[PartBuddy: the user answered your question "${question.question}" with the button "${option.label}".]`;
    return `[PartBuddy: this message answers your question "${question.question}".]`;
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
      const parsed = askInput.safeParse(args);
      if (!parsed.success) return refusal(`Invalid ${ASK_TOOL} input: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`.slice(0, 500));
      const options = parsed.data.options.map((option) => (option.detail ? { label: option.label, detail: option.detail } : { label: option.label }));
      this.pending = { id, kind: 'ask', question: parsed.data.question, options };
    } else {
      const parsed = planInput.safeParse(args);
      if (!parsed.success) return refusal(`Invalid ${PLAN_TOOL} input: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`.slice(0, 500));
      this.pending = { id, kind: 'plan', summary: parsed.data.summary, steps: parsed.data.steps };
    }
    this.emit({ type: 'question', question: this.pending });
    return text('PartBuddy shows this to the user with buttons. End your turn now without changing the design; the answer is the next message.');
  }
}
