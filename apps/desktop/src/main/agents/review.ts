import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { ASK_TOOL, PLAN_TOOL } from './questions';
import { VIEW_TOOL } from './viewContext';

/**
 * The review before "done" (Manuel, 2026-11-14): a turn that changed the design does not end as done until the model
 * called `partbuddy_review` after its last change. The tool answers the view, the latest ready-to-print check, three
 * pictures where the route shows pictures (Claude Code) and a short checklist. A model that ends without it is sent
 * back once with {@link REVIEW_PROMPT} by its route (agentService.ts for Claude Code, chatgptAgent.ts and localAgent.ts
 * for the own loop); if it ends without it again, the turn ends and the log says so.
 */

export const REVIEW_TOOL = 'partbuddy_review';

/** The checklist, in the order that counts: function, strength, looks, print time. */
export const REVIEW_CHECKLIST = [
  'Review checklist, in this order:',
  '1. Function and fit: does the part do its job; do mating parts fit, with their clearances; can it be put together and used?',
  '2. Strength: does the load run along the layers, not across them; are inner corners rounded; no thin cantilevers or walls?',
  '3. Looks: the same edge treatment throughout; symmetric and aligned where it should be; no stray faces or tiny steps; visible faces clean.',
  '4. Print time and material: a shell instead of a solid block, no needless height or detail.',
  'Fix what you find now. What you leave as it is, tell the user in one line each.',
].join('\n');

/** Sent as the next message when the model ended a changing turn without the review. Free of the test double's scene words. */
export const REVIEW_PROMPT =
  `[PartBuddy: you changed the design in this turn and ended without ${REVIEW_TOOL}. Call ${REVIEW_TOOL} now, go through its checklist, ` +
  'fix what it finds or name it, then answer the user in one or two lines.]';

/** The answer of a second review with nothing changed since the first. */
export const SAME_STATE = `Nothing changed since your last ${REVIEW_TOOL} in this turn; its findings still hold.`;

/** Added to the role prompt of every route. */
export const REVIEW_GUIDANCE =
  `After your last change of a turn, before you call the part done, call ${REVIEW_TOOL} once and go through its checklist; ` +
  'PartBuddy sends you back when you skip it. A single parameter change, undo and redo need none.';

/** The views of the review's pictures: straight on, from above, and at an angle. */
const VIEWS = ['front', 'top', 'iso'] as const;

/** Changes that need no review: they bring back a state or move one value (the check comes with their answer anyway). */
const LIGHT = new Set(['undo', 'redo']);

const reviewTool: UpstreamTool = {
  name: REVIEW_TOOL,
  description:
    'Look at the finished part before you tell the user it is done: answers what the view shows, the latest ' +
    'ready-to-print check, pictures from three views where this route shows pictures, and the review checklist. ' +
    'Call it after your last change of a turn; it changes nothing.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true },
};

/** What a route asks at the end of a turn the model finished. */
export interface TurnReview {
  /** The message to send the model back with, once per turn, or null: the turn may end. */
  due(): string | null;
}

export class Review implements TurnReview {
  /** Changes since the last review that need one. */
  private changes = 0;
  /** `set_parameter` calls since the last review: one alone is the cheap path. */
  private parameters = 0;
  /** A review ran and nothing changed since. */
  private reviewed = false;
  /** This turn already sent the model back once. */
  private sentBack = false;

  constructor(
    private readonly log: (line: string) => void,
    /**
     * Whether to render pictures: the route shows them from a tool answer (Claude Code; the own loops drop them, loop.ts)
     * and SolidCraft runs headless, since `screenshot {view}` turns a connected window's camera (0.41.0 tool schema).
     */
    private readonly pictures: () => boolean = () => false,
    /** The test doubles of the E2E tests never review (PARTBUDDY_FINAL_REVIEW=0, e2e/launch.ts). */
    private readonly enabled: boolean = process.env.PARTBUDDY_FINAL_REVIEW !== '0',
  ) {}

  /** A new message from the user: what earlier turns changed no longer asks for a review. */
  newTurn(): void {
    this.forget();
    this.sentBack = false;
  }

  tools(upstream: UpstreamTools): UpstreamTools {
    return {
      instructions: () => upstream.instructions(),
      listTools: async () => [...(await upstream.listTools()), reviewTool],
      callTool: async (name, args, callId) => {
        if (name === REVIEW_TOOL) return this.answer(upstream);
        const result = await upstream.callTool(name, args, callId);
        // A question or plan ends the turn waiting for the user; the part is not called done.
        if ((name === ASK_TOOL || name === PLAN_TOOL) && result.isError !== true) this.forget();
        return result;
      },
    };
  }

  /**
   * A call that left another design behind, as the work log tells it (workLog.ts `designChanged`): reads through
   * `execute` (view.*, inspect.*), refused calls and trials that were taken back never come here.
   */
  changed(name: string): void {
    this.reviewed = false;
    if (LIGHT.has(name)) return;
    if (name === 'set_parameter') this.parameters += 1;
    else this.changes += 1;
  }

  due(): string | null {
    if (!this.enabled || !this.owed()) return null;
    if (this.sentBack) {
      this.log(`the assistant ended a changing turn without ${REVIEW_TOOL} although it was sent back once; the turn ends without it`);
      this.forget();
      return null;
    }
    this.sentBack = true;
    this.log(`the assistant ended a changing turn without ${REVIEW_TOOL}; it is sent back once`);
    return REVIEW_PROMPT;
  }

  private owed(): boolean {
    return this.changes > 0 || this.parameters > 1;
  }

  private forget(): void {
    this.changes = 0;
    this.parameters = 0;
    this.reviewed = false;
  }

  private async answer(upstream: UpstreamTools): Promise<ToolResult> {
    if (this.reviewed) return { content: [{ type: 'text', text: SAME_STATE }] };
    this.forget();
    this.reviewed = true;
    const content: ToolResult['content'] = [];
    try {
      content.push(...(await upstream.callTool(VIEW_TOOL, {})).content);
    } catch (error) {
      this.log(`${REVIEW_TOOL}: the view could not be read: ${(error as Error).message}`);
      content.push({ type: 'text', text: '[PartBuddy: the view could not be read; inspect the design yourself.]' });
    }
    if (this.pictures()) {
      for (const view of VIEWS) {
        try {
          const shot = await upstream.callTool('screenshot', { view, width: 640, height: 480 });
          const images = shot.isError === true ? [] : shot.content.filter((part) => part.type === 'image');
          if (images.length === 0) throw new Error(shot.content.map((part) => (typeof part.text === 'string' ? part.text : part.type)).join(' ').slice(0, 200));
          content.push({ type: 'text', text: `The part from ${view}:` }, ...images);
        } catch (error) {
          this.log(`${REVIEW_TOOL}: no ${view} picture: ${(error as Error).message}`);
          content.push({ type: 'text', text: `[PartBuddy: the ${view} picture could not be rendered.]` });
        }
      }
    }
    content.push({ type: 'text', text: REVIEW_CHECKLIST });
    return { content };
  }
}
