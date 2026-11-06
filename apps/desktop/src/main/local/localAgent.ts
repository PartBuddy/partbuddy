import { createOpenAI } from '@ai-sdk/openai';
import { stepCountIs, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

import type { AgentEvent, AgentStatus, ModelChoice, ModelOption, Selection } from '../../shared/contract';
import { userEvent, type AgentBackend, type PictureKind } from '../agents/assistant';
import type { UpstreamTools } from '../agents/gateProxy';
import { instructionsFor, MAX_STEPS, policyToolSet } from '../agents/loop';
import { allowedChoice, choiceStatus, type ChoiceStore } from '../agents/modelChoice';
import { composeMessage } from '../agents/viewContext';
import { contextFor, findOllama, MIN_CONTEXT, OLLAMA_URL, type OllamaFound } from './ollama';
import { findStrata, STRATA_EFFORTS, STRATA_URL, type StrataFound } from './strata';

/**
 * A local model in PartBuddy's own agent loop (plan step F8, ADR 0011): Ollama through its own API
 * (the context is set per request, `num_ctx`) or Strata through its OpenAI API, SolidCraft's tools
 * behind the same policy as every route; nothing leaves the machine. Only models that can call
 * tools and have room for them are offered.
 */

export interface LocalAgentOptions {
  tools(): Promise<UpstreamTools | null>;
  event(event: AgentEvent): void;
  changed(): void;
  log(message: string): void;
  choices: ChoiceStore;
  fetch?: typeof fetch;
  /** Where Ollama and Strata listen; tests point them elsewhere. */
  url?: string;
  strataUrl?: string;
}

type Server = 'Ollama' | 'Strata';

/** A model the route can run, with the server that runs it. */
interface Runnable {
  option: ModelOption;
  server: Server;
  vision: boolean;
  /** Ollama's context to ask for; Strata keeps its own. */
  numCtx: number | null;
}

/** The per-request options streamText takes, by provider. */
type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;

/** Strata's model goes by this prefix, so its name never clashes with an Ollama model. */
const STRATA_PREFIX = 'strata:';

/** The models an agent session can use: they call tools and have room for SolidCraft's tools. */
export function usableModels(ollama: OllamaFound | null, strata: StrataFound | null = null): Runnable[] {
  const runnable: Runnable[] = (ollama?.models ?? [])
    .filter((model) => model.tools && contextFor(model) !== null)
    .map((model) => ({
      option: { id: model.id, name: `${model.id} · Ollama`, efforts: [], ...(model.vision ? {} : { description: 'Cannot see pictures' }) },
      server: 'Ollama' as const,
      vision: model.vision,
      numCtx: contextFor(model),
    }));
  // Strata declares tool calling for every model it serves; a known context below the floor is refused.
  if (strata && !strata.keyNeeded && (strata.context === null || strata.context >= MIN_CONTEXT)) {
    const notes = [strata.loaded ? null : 'Loads on first use', strata.vision ? null : 'Cannot see pictures'].filter(Boolean);
    runnable.push({
      option: { id: `${STRATA_PREFIX}${strata.model}`, name: `${strata.model} · Strata`, efforts: STRATA_EFFORTS, ...(notes.length > 0 ? { description: notes.join(' · ') } : {}) },
      server: 'Strata',
      vision: strata.vision,
      numCtx: null,
    });
  }
  return runnable;
}

export class LocalAgent implements AgentBackend {
  private ollama: OllamaFound | null = null;
  private strata: StrataFound | null = null;
  private probed = false;
  private choice: ModelChoice | null = null;
  private history: ModelMessage[] = [];
  private abort: AbortController | null = null;
  private busy = false;
  private sequence = 0;

  constructor(private readonly options: LocalAgentOptions) {}

  private runnable(): Runnable[] {
    return usableModels(this.ollama, this.strata);
  }

  private models(): ModelOption[] {
    return this.runnable().map((entry) => entry.option);
  }

  status(): AgentStatus {
    const status: AgentStatus = { agent: 'local', state: 'checking' };
    if (this.probed) {
      const chosen = this.runnable().find((entry) => entry.option.id === this.choice?.model);
      if (!this.ollama && !this.strata) {
        status.state = 'unavailable';
        status.detail = 'No local model server answers. Start Ollama (ollama.com) or Strata and press Check again.';
      } else if (!chosen) {
        status.state = 'unavailable';
        status.detail = this.strata?.keyNeeded
          ? 'Strata asks for an API key, which PartBuddy cannot send yet. Serve it without a key on this computer ("api_key": "none").'
          : 'No local model can call tools with enough context. Install one, for example: ollama pull qwen3.5:9b';
      } else {
        status.state = this.busy ? 'busy' : 'ready';
        status.account = chosen.server;
        if (chosen.server === 'Ollama' && this.ollama) status.version = this.ollama.version;
      }
    }
    return { ...status, ...choiceStatus(this.models(), this.choice, this.options.choices.get('local')) };
  }

  async refresh(): Promise<AgentStatus> {
    const [ollama, strata] = await Promise.all([
      findOllama(this.options.fetch, this.options.url).catch((error: unknown) => {
        this.options.log(`Ollama could not be read: ${(error as Error).message}`);
        return null;
      }),
      findStrata(this.options.fetch, this.options.strataUrl),
    ]);
    this.ollama = ollama;
    this.strata = strata;
    this.probed = true;
    const models = this.models();
    this.choice = allowedChoice(models, this.choice ?? this.options.choices.get('local')) ?? allowedChoice(models, models[0] ? { model: models[0].id, effort: null } : null);
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
    const model = this.runnable().find((entry) => entry.option.id === this.choice?.model);
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
    if (image && !picture) this.options.event({ type: 'error', message: `${model.option.name} cannot see pictures; it got your words only.` });
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

  /** The AI SDK model and its request options for the server that runs it. */
  private languageModel(model: Runnable): { model: LanguageModel; providerOptions: ProviderOptions } {
    const fetchOption = this.options.fetch ? { fetch: this.options.fetch } : {};
    if (model.server === 'Strata') {
      // Strata needs no key on this computer; the SDK wants one, so it gets a placeholder.
      const strata = createOpenAI({ baseURL: `${this.options.strataUrl ?? STRATA_URL}/v1`, apiKey: 'none', ...fetchOption });
      return {
        model: strata.chat(model.option.id.slice(STRATA_PREFIX.length)),
        providerOptions: { openai: this.choice?.effort ? { reasoningEffort: this.choice.effort } : {} },
      };
    }
    const ollama = createOllama({ baseURL: `${this.options.url ?? OLLAMA_URL}/api`, ...fetchOption });
    // shortcut: thinking stays off for speed on small GPUs; offer it as the effort once models need it.
    return { model: ollama(model.option.id), providerOptions: { ollama: { think: false, options: { num_ctx: model.numCtx ?? undefined } } } };
  }

  private async run(upstream: UpstreamTools, model: Runnable, signal: AbortSignal): Promise<void> {
    const started = Date.now();
    try {
      const { model: languageModel, providerOptions } = this.languageModel(model);
      const result = streamText({
        model: languageModel,
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
        providerOptions,
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
