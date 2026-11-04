import type { AgentEvent, MirroredBody, Variant, VariantsState } from '../../shared/contract';
import type { StepPhrase } from '../../shared/stepPhrases';
import { describeUserAction } from '../../shared/stepPhrases';
import { engineSteps, type EngineStep, type ToolCall } from './engineSteps';
import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';
import { ASK_TOOL, PLAN_TOOL } from './questions';
import { CHANGING_TOOLS, type DesignHistory } from './workLog';

/**
 * Variants (M2c, ADR 0021): the assistant builds two to four variants of one request, one turn
 * each, visible live. PartBuddy records each variant's changing tool calls, keeps its bodies and a
 * picture, and undoes back to the starting state; taking a variant replays its calls. SolidCraft's
 * checkpoints cannot do this, because restoring one drops every later one (ADR 0018).
 */

export const VARIANT_DONE_TOOL = 'partbuddy_variant_done';
export const OFFER_VARIANTS_TOOL = 'partbuddy_offer_variants';

export interface Measured {
  volume: number;
  faces: number;
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
}

export interface VariantsOptions {
  history(): Promise<DesignHistory>;
  travel(command: 'edit.undo' | 'edit.redo', count: number): Promise<void>;
  /** The bodies of the mirrored revision once the mirror shows `revision` (or later). */
  mirrored(documentId: string, revision: number): Promise<MirroredBody[] | null>;
  measure(): Promise<Measured | null>;
  /** Runs engine steps for real, all or nothing. */
  replay(steps: EngineStep[]): Promise<void>;
  /** Sends one variant turn to the assistant. */
  send(text: string, note: string, variant: { index: number; count: number }): Promise<void>;
  /** Work-log quiet mode: variant turns add no step cards. */
  quiet(on: boolean): void;
  recordUser(phrase: StepPhrase, work: () => Promise<void>): Promise<void>;
  mention(text: string): void;
  emit(state: VariantsState): void;
  /** How long PartBuddy waits for the picture of a variant. */
  thumbnailTimeoutMs?: number;
}

interface Kept extends Variant {
  calls: ToolCall[];
  done: { name: string; difference: string } | null;
  bodies: MirroredBody[];
  measured: Measured | null;
}

const variantDoneTool: UpstreamTool = {
  name: VARIANT_DONE_TOOL,
  description:
    'Ends the variant PartBuddy asked you to build: give it a short name and one line on how it differs from the others. ' +
    'PartBuddy keeps it, resets the design and asks for the next one. End your turn right after.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 40, description: 'Short name, e.g. "Slim clip".' },
      difference: { type: 'string', maxLength: 200, description: 'How this variant differs, with its key dimensions.' },
    },
    required: ['name', 'difference'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

const offerVariantsTool: UpstreamTool = {
  name: OFFER_VARIANTS_TOOL,
  description:
    'Offers the user to see 2–4 clearly different variants of a change side by side, as a card with a button. Use it when ' +
    'several ways are sensible and comparing them helps more than one question. Builds nothing; end your turn after it.',
  inputSchema: {
    type: 'object',
    properties: {
      request: { type: 'string', maxLength: 300, description: 'What the variants are of, in one sentence.' },
      count: { type: 'integer', minimum: 2, maximum: 4, description: 'How many variants (default 3).' },
    },
    required: ['request'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
};

/** Added to the role prompt of every route. */
export const VARIANT_GUIDANCE =
  `When PartBuddy asks for variant k of n, build only that variant, without questions or plans, in small visible steps, ` +
  `then call ${VARIANT_DONE_TOOL} and end your turn. When the user would profit from comparing two to four clearly ` +
  `different ways, offer them with ${OFFER_VARIANTS_TOOL} instead of picking one yourself.`;

const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] });
const refusal = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }], isError: true });
const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[[\]\n\r]/g, ' ').trim().slice(0, max) : '');

function sameShape(a: Measured, b: Measured): boolean {
  const close = (x: number, y: number, tolerance: number) => Math.abs(x - y) <= tolerance;
  if (!close(a.volume, b.volume, Math.max(0.01, Math.abs(b.volume) * 1e-4)) || a.faces !== b.faces) return false;
  if (!a.bbox || !b.bbox) return a.bbox === b.bbox;
  return [0, 1, 2].every((i) => close(a.bbox?.min[i] ?? 0, b.bbox?.min[i] ?? 0, 0.01) && close(a.bbox?.max[i] ?? 0, b.bbox?.max[i] ?? 0, 0.01));
}

export class Variants {
  private state: 'idle' | 'building' | 'ready' = 'idle';
  private request: string | null = null;
  private count = 0;
  private start: DesignHistory | null = null;
  private variants: Kept[] = [];
  private current: Kept | null = null;
  private stopped = false;
  private mismatch: string | null = null;
  private thumbnailWaiter: { index: number; resolve: (image: string | null) => void } | null = null;
  private finishing: Promise<void> = Promise.resolve();

  constructor(private readonly options: VariantsOptions) {}

  get building(): boolean {
    return this.state === 'building';
  }

  snapshot(): VariantsState {
    return {
      state: this.state,
      request: this.request,
      count: this.count,
      documentId: this.start?.documentId ?? null,
      variants: this.variants.map(({ index, status, name, difference, thumbnail, revision }) => ({ index, status, name, difference, thumbnail, revision })),
      mismatch: this.mismatch,
    };
  }

  /** SolidCraft's tools plus `partbuddy_variant_done` and `partbuddy_offer_variants`; records changes during a variant turn. */
  tools(upstream: UpstreamTools, offer: (args: Record<string, unknown>) => ToolResult): UpstreamTools {
    return {
      instructions: () => upstream.instructions(),
      listTools: async () => [...(await upstream.listTools()), variantDoneTool, offerVariantsTool],
      callTool: async (name, args, callId) => {
        const variant = this.state === 'building' ? this.current : null;
        if (name === VARIANT_DONE_TOOL) {
          if (!variant) return refusal('No variant is being built. Continue normally.');
          variant.done = { name: clip(args.name, 40) || `Variant ${String(variant.index)}`, difference: clip(args.difference, 200) };
          return text(`Variant ${String(variant.index)} is noted. End your turn now; PartBuddy keeps it and resets the design.`);
        }
        if (name === OFFER_VARIANTS_TOOL) {
          if (variant) return refusal('You are building a variant; finish it with partbuddy_variant_done.');
          return offer(args);
        }
        if (variant && (name === ASK_TOOL || name === PLAN_TOOL)) {
          return refusal('While building a variant, decide yourself: no questions or plans. Build it and call partbuddy_variant_done.');
        }
        if (variant?.done && CHANGING_TOOLS.has(name)) {
          return refusal('This variant is done. End your turn; PartBuddy resets the design for the next one.');
        }
        const result = await upstream.callTool(name, args, callId);
        if (variant && CHANGING_TOOLS.has(name) && result.isError !== true) variant.calls.push({ name, args });
        return result;
      },
    };
  }

  /** Starts building `count` variants of `request` (the user pressed Variants, or took the assistant's offer). */
  async begin(request: string, count: number, note: string | null = null): Promise<void> {
    if (this.state === 'building') throw new Error('variants are being built already');
    this.start = await this.options.history();
    this.state = 'building';
    this.request = request;
    this.count = Math.min(4, Math.max(2, Math.round(count)));
    this.variants = [];
    this.stopped = false;
    this.mismatch = null;
    this.options.quiet(true);
    await this.next(note);
  }

  /** Every assistant event passes here; the end of a variant turn keeps the variant and starts the next. */
  observe(event: AgentEvent): void {
    if (event.type !== 'done' || this.state !== 'building' || !this.current) return;
    if (event.detail === 'stopped') this.stopped = true;
    this.finishing = this.finishing.then(() => this.finish()).catch(() => undefined);
  }

  /** The renderer took the picture of the variant being kept. */
  thumbnail(index: number, image: string): void {
    const variant = this.variants.find((entry) => entry.index === index);
    if (variant) variant.thumbnail = image;
    if (this.thumbnailWaiter?.index === index) this.thumbnailWaiter.resolve(image);
  }

  shape(index: number): MirroredBody[] {
    const variant = this.variants.find((entry) => entry.index === index && entry.status === 'kept');
    if (!variant) throw new Error('this variant is not kept');
    return variant.bodies;
  }

  /** Replays a kept variant on the starting state, as one work-log step, and checks its shape. */
  async take(index: number): Promise<void> {
    if (this.state !== 'ready' || !this.start) throw new Error('no variants to take');
    const variant = this.variants.find((entry) => entry.index === index && entry.status === 'kept');
    if (!variant) throw new Error('this variant is not kept');
    const now = await this.options.history();
    if (now.documentId !== this.start.documentId || now.undo !== this.start.undo) {
      throw new Error('the design changed since the variants were built; build them again');
    }
    const name = variant.name ?? `Variant ${String(index)}`;
    await this.options.recordUser(describeUserAction({ kind: 'variant', name }), () => this.options.replay(engineSteps(variant.calls)));
    const measured = await this.options.measure();
    this.mismatch = variant.measured && measured && !sameShape(measured, variant.measured) ? `volume ${String(measured.volume)} mm³ instead of ${String(variant.measured.volume)} mm³` : null;
    this.options.mention(`took the variant "${name}" (${variant.done?.difference ?? ''}) from the ${String(this.count)} you built; the design now shows it`);
    if (this.mismatch) {
      this.emit();
      return;
    }
    this.clear();
  }

  discard(): void {
    if (this.state === 'building') throw new Error('variants are still being built');
    this.clear();
  }

  private clear(): void {
    this.state = 'idle';
    this.request = null;
    this.count = 0;
    this.start = null;
    this.variants = [];
    this.current = null;
    this.mismatch = null;
    this.emit();
  }

  private async next(note: string | null): Promise<void> {
    const index = this.variants.length + 1;
    const variant: Kept = { index, status: 'building', name: null, difference: null, thumbnail: null, revision: null, calls: [], done: null, bodies: [], measured: null };
    this.variants.push(variant);
    this.current = variant;
    this.emit();
    const before = this.variants
      .filter((entry) => entry.status === 'kept' && entry.done)
      .map((entry) => `${String(entry.index)}. ${entry.done?.name ?? ''}: ${entry.done?.difference ?? ''}`);
    const ask =
      `[PartBuddy: build variant ${String(index)} of ${String(this.count)} of the user's request below, starting from the design as it is now. ` +
      (before.length > 0 ? `It must differ clearly from the variants so far: ${before.join('; ')}. ` : '') +
      `Do not ask questions or show a plan. When it is built, call ${VARIANT_DONE_TOOL} with a short name and the difference, and end your turn.]`;
    await this.options.send(this.request ?? '', [note, ask].filter((line): line is string => line !== null).join('\n'), { index, count: this.count });
  }

  private async finish(): Promise<void> {
    const variant = this.current;
    const start = this.start;
    if (!variant || !start) return;
    this.current = null;
    if (variant.done && variant.calls.length > 0) {
      variant.name = variant.done.name;
      variant.difference = variant.done.difference;
      try {
        const now = await this.options.history();
        variant.bodies = (await this.options.mirrored(now.documentId, now.revision)) ?? [];
        variant.measured = await this.options.measure();
        variant.revision = now.revision;
        variant.status = 'capturing';
        this.emit();
        await this.waitForThumbnail(variant.index);
        variant.status = variant.bodies.length > 0 ? 'kept' : 'failed';
      } catch {
        variant.status = 'failed';
      }
    } else {
      variant.status = 'failed';
    }
    variant.revision = null;
    // Back to the starting state: undo what this variant added.
    try {
      const now = await this.options.history();
      if (now.documentId === start.documentId && now.undo > start.undo) await this.options.travel('edit.undo', now.undo - start.undo);
    } catch {
      variant.status = 'failed';
    }
    if (!this.stopped && this.variants.length < this.count) {
      this.emit();
      await this.next(null);
      return;
    }
    this.state = this.variants.some((entry) => entry.status === 'kept') ? 'ready' : 'idle';
    this.options.quiet(false);
    const kept = this.variants.filter((entry) => entry.status === 'kept').length;
    this.options.mention(
      kept > 0
        ? `had you build ${String(kept)} variant(s) of "${clip(this.request, 200)}"; the design is back at the state before them and the user may take one`
        : `asked for variants of "${clip(this.request, 200)}", but none was kept; the design is back at the state before them`,
    );
    if (this.state === 'idle') this.clear();
    else this.emit();
  }

  private waitForThumbnail(index: number): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.thumbnailWaiter = null;
        resolve(null);
      }, this.options.thumbnailTimeoutMs ?? 6000);
      this.thumbnailWaiter = {
        index,
        resolve: (image) => {
          clearTimeout(timer);
          this.thumbnailWaiter = null;
          resolve(image);
        },
      };
    });
  }

  private emit(): void {
    this.options.emit(this.snapshot());
  }
}
