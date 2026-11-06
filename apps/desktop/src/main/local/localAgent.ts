import { stepCountIs, streamText, type ModelMessage } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

import type { AgentEvent, AgentStatus, ModelChoice, ModelOption, Selection } from '../../shared/contract';
import { userEvent, type AgentBackend, type PictureKind } from '../agents/assistant';
import type { UpstreamTools } from '../agents/gateProxy';
import { instructionsFor, MAX_STEPS, policyToolSet } from '../agents/loop';
import { allowedChoice, choiceStatus, type ChoiceStore } from '../agents/modelChoice';
import { composeMessage } from '../agents/viewContext';
import { contextFor, findOllama, OLLAMA_URL, type LocalModel, type OllamaFound } from './ollama';

/**
 * A local model in PartBuddy's own agent loop (plan step F8, ADR 0011): Ollama's own API through
 * the AI SDK, SolidCraft's tools behind the same policy as every route, nothing leaves the machine.
 * Only models that can call tools are offered; the context is set per request (`num_ctx`).
 */

export interface LocalAgentOptions {
  tools(): Promise<UpstreamTools | null>;
  event(event: AgentEvent): void;
  changed(): void;
  log(message: string): void;
  choices: ChoiceStore;
  fetch?: typeof fetch;
  /** Where Ollama listens; tests point it elsewhere. */
  url?: string;
}

/** The models an agent session can use: they call tools and have room for SolidCraft's tools. */
export function usableModels(found: OllamaFound): ModelOption[] {
  return found.models
    .filter((model) => model.tools && contextFor(model) !== null)
    .map((model) => ({ id: model.id, name: model.id, efforts: [], ...(model.vision ? {} : { description: 'Cannot see pictures' }) }));
}

export class LocalAgent implements AgentBackend {
  private found: OllamaFound | null = null;
  private probed = false;
  private choice: ModelChoice | null = null;
  private history: ModelMessage[] = [];
  private abort: AbortController | null = null;
  private busy = false;
  private sequence = 0;

  constructor(private readonly options: LocalAgentOptions) {}

  private models(): ModelOption[] {
    return this.found ? usableModels(this.found) : [];
  }

  status(): AgentStatus {
    const status: AgentStatus = { agent: 'local', state: 'checking' };
    if (this.probed) {
      const models = this.models();
      if (!this.found) {
        status.state = 'unavailable';
        status.detail = 'No local model server answers. Start Ollama (ollama.com) and press Check again.';
      } else if (models.length === 0) {
        status.state = 'unavailable';
        status.detail = `Ollama ${this.found.version} has no model that can call tools. Install one, for example: ollama pull qwen3.5:9b`;
      } else {
        status.state = this.busy ? 'busy' : 'ready';
        status.version = this.found.version;
        status.account = 'Ollama';
      }
    }
    return { ...status, ...choiceStatus(this.models(), this.choice, this.options.choices.get('local')) };
  }

  async refresh(): Promise<AgentStatus> {
    try {
      this.found = await findOllama(this.options.fetch, this.options.url);
    } catch (error) {
      this.options.log(`Ollama could not be read: ${(error as Error).message}`);
      this.found = null;
    }
    this.probed = true;
    const models = this.models();
    this.choice = allowedChoice(models, this.choice ?? this.options.choices.get('local')) ?? (models[0] ? { model: models[0].id, effort: null } : null);
    this.options.changed();
    return this.status();
  }

  signIn(): void {
    void this.refresh();
  }

  async signOut(): Promise<void> {
    await this.newConversation();
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    await Promise.resolve();
  }

  async newConversation(): Promise<void> {
    await this.stop();
    this.history = [];
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  freshConversation(): boolean {
    return this.history.length === 0;
  }

  chooseModel(choice: ModelChoice, asDefault: boolean): Promise<void> {
    const allowed = allowedChoice(this.models(), choice);
    if (!allowed) throw new Error(`model ${choice.model} is not available locally`);
    this.choice = allowed;
    if (asDefault) this.options.choices.set('local', allowed);
    this.options.changed();
    return Promise.resolve();
  }

  async send(text: string, selections: Selection[] = [], note: string | null = null, image: Uint8Array | null = null, kind: PictureKind = 'sketch'): Promise<void> {
    if (this.status().state !== 'ready') throw new Error(`assistant is ${this.status().state}`);
    const model = this.found?.models.find((entry) => entry.id === this.choice?.model);
    if (!model) throw new Error('no local model is chosen');
    const upstream = await this.options.tools();
    if (!upstream) {
      this.options.event({ type: 'error', message: 'SolidCraft is not connected' });
      return;
    }
    const message = composeMessage(text, selections, note);
    this.options.event(userEvent(text, message.label, message.summary, image ? kind : undefined));
    // A model without vision gets the words only, and the user learns why the picture went nowhere.
    const picture = image && model.vision ? image : null;
    if (image && !picture) this.options.event({ type: 'error', message: `${model.id} cannot see pictures; it got your words only.` });
    this.history.push(
      picture
        ? { role: 'user', content: [{ type: 'text', text: message.prompt }, { type: 'image', image: picture, mediaType: 'image/png' }] }
        : { role: 'user', content: message.prompt },
    );
    this.busy = true;
    this.options.changed();
    const abort = new AbortController();
    this.abort = abort;
    void this.run(upstream, model, abort.signal).finally(() => {
      this.busy = false;
      this.abort = null;
      this.options.changed();
    });
  }

  private async run(upstream: UpstreamTools, model: LocalModel, signal: AbortSignal): Promise<void> {
    const started = Date.now();
    try {
      const ollama = createOllama({ baseURL: `${this.options.url ?? OLLAMA_URL}/api`, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
      const result = streamText({
        model: ollama(model.id),
        instructions: instructionsFor(upstream, false),
        messages: this.history,
        tools: await policyToolSet(upstream, {
          nextId: () => `local-${String((this.sequence += 1))}`,
          event: (event) => {
            this.options.event(event);
          },
        }),
        stopWhen: stepCountIs(MAX_STEPS),
        abortSignal: signal,
        // shortcut: thinking stays off for speed on small GPUs; offer it as the effort once models need it.
        providerOptions: { ollama: { think: false, options: { num_ctx: contextFor(model) ?? undefined } } },
      });
      for await (const part of result.stream) {
        if (part.type === 'text-delta') this.options.event({ type: 'textDelta', text: part.text });
        if (part.type === 'error') throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
      this.history.push(...(await result.responseMessages));
      this.options.event({ type: 'done', ok: true, durationMs: Date.now() - started, detail: null });
    } catch (error) {
      const stopped = signal.aborted;
      if (!stopped) this.options.event({ type: 'error', message: (error instanceof Error ? error.message : String(error)).slice(0, 500) });
      this.options.event({ type: 'done', ok: false, durationMs: Date.now() - started, detail: stopped ? 'stopped' : 'failed' });
    }
  }
}
