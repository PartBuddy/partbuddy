import { createOpenAI } from '@ai-sdk/openai';
import { jsonSchema, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from 'ai';

import type { AgentEvent, AgentStatus, Selection } from '../../shared/contract';
import type { AgentBackend } from '../agents/assistant';
import type { ToolResult, UpstreamTools } from '../agents/gateProxy';
import { decide } from '../agents/policy';
import { QUESTION_GUIDANCE } from '../agents/questions';
import { composeMessage, VIEW_GUIDANCE } from '../agents/viewContext';
import type { ChatGptAccount } from './account';
import { RESOURCE } from './oauth';

/**
 * ChatGPT plan usage in PartBuddy's own agent loop (ADR 0005, ADR 0015): the Vercel AI SDK with
 * the OpenAI Responses provider, the user's OAuth access token per request, SolidCraft's tools in
 * one namespace, and the same tool policy as the gate proxy. Requests follow the preview rules of
 * Sign in with ChatGPT: `store: false`, streaming, instructions instead of system messages, full
 * history in every request, no temperature or output-token limit.
 */

const INSTRUCTIONS = [
  'You are the design assistant inside PartBuddy, a desktop app for 3D-printable parts.',
  'SolidCraft is open and the user watches every step live, mirrored in PartBuddy.',
  'Use the solidcraft tools to inspect and change the design. Work in small visible steps:',
  'one sketch or one feature group per call. Units are millimetres.',
  'If PartBuddy refuses a tool, tell the user why and continue without it.',
  'Answer in the language the user writes in.',
  VIEW_GUIDANCE,
  QUESTION_GUIDANCE,
].join(' ');
const MAX_STEPS = 25;

export interface ChatGptAgentOptions {
  account: ChatGptAccount;
  tools(): Promise<UpstreamTools | null>;
  event(event: AgentEvent): void;
  changed(): void;
  log(message: string): void;
  fetch?: typeof fetch;
}

/** Text of an MCP tool result for the model; images are summarised, not forwarded. */
function resultText(result: ToolResult): string {
  return result.content
    .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : `[${part.type} omitted]`))
    .join('\n');
}

export class ChatGptAgent implements AgentBackend {
  private model: string | null = null;
  private history: ModelMessage[] = [];
  private abort: AbortController | null = null;
  private busy = false;
  private sequence = 0;

  constructor(private readonly options: ChatGptAgentOptions) {}

  status(): AgentStatus {
    const account = this.options.account.status();
    const status: AgentStatus = { agent: 'chatgpt', state: 'signedOut' };
    if (account.state === 'signingIn') status.state = 'checking';
    if (account.state === 'signedIn') status.state = this.busy ? 'busy' : 'ready';
    if (account.state === 'planDisabled') {
      status.state = 'unavailable';
      status.detail = 'ChatGPT plan usage was not allowed for PartBuddy';
    }
    if (account.email) status.account = account.email;
    if (this.model) status.model = this.model;
    if (account.detail && !status.detail) status.detail = account.detail;
    return status;
  }

  async refresh(): Promise<AgentStatus> {
    if (this.options.account.status().state === 'signedIn' && !this.model) {
      try {
        this.model = await this.pickModel();
      } catch (error) {
        this.options.log(`ChatGPT model list failed: ${(error as Error).message}`);
      }
    }
    this.options.changed();
    return this.status();
  }

  signIn(): void {
    void this.options.account.signIn().then(() => this.refresh());
  }

  async signOut(): Promise<void> {
    await this.stop();
    this.history = [];
    this.model = null;
    await this.options.account.signOut();
    this.options.changed();
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    await Promise.resolve();
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  async send(text: string, selections: Selection[] = [], note: string | null = null): Promise<void> {
    if (this.status().state !== 'ready') throw new Error(`assistant is ${this.status().state}`);
    const upstream = await this.options.tools();
    if (!upstream) {
      this.options.event({ type: 'error', message: 'SolidCraft is not connected' });
      return;
    }
    this.model ??= await this.pickModel();
    const message = composeMessage(text, selections, note);
    this.options.event(message.label ? { type: 'user', text, selection: message.label } : { type: 'user', text });
    this.history.push({ role: 'user', content: message.prompt });
    this.busy = true;
    this.options.changed();
    const abort = new AbortController();
    this.abort = abort;
    void this.run(upstream, abort.signal).finally(() => {
      this.busy = false;
      this.abort = null;
      this.options.changed();
    });
  }

  private async run(upstream: UpstreamTools, signal: AbortSignal): Promise<void> {
    const started = Date.now();
    try {
      const provider = createOpenAI({ apiKey: 'replaced-per-request', baseURL: RESOURCE, fetch: this.authorizedFetch() });
      const result = streamText({
        model: provider.responses(this.model ?? ''),
        messages: this.history,
        tools: await this.toolSet(upstream),
        stopWhen: stepCountIs(MAX_STEPS),
        abortSignal: signal,
        providerOptions: { openai: { store: false, instructions: INSTRUCTIONS, systemMessageMode: 'remove' } },
      });
      for await (const part of result.stream) {
        if (part.type === 'text-delta') this.options.event({ type: 'textDelta', text: part.text });
        if (part.type === 'error') throw part.error instanceof Error ? part.error : new Error(String(part.error));
      }
      this.history.push(...(await result.responseMessages));
      this.options.event({ type: 'done', ok: true, durationMs: Date.now() - started, detail: null });
    } catch (error) {
      const stopped = signal.aborted;
      if (!stopped) this.options.event({ type: 'error', message: describeError(error) });
      this.options.event({ type: 'done', ok: false, durationMs: Date.now() - started, detail: stopped ? 'stopped' : 'failed' });
    }
  }

  /** Sends the current access token, renewed when it is about to expire. */
  private authorizedFetch(): typeof fetch {
    const base = this.options.fetch ?? fetch;
    return async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${await this.options.account.accessToken()}`);
      return base(input, { ...init, headers });
    };
  }

  private async toolSet(upstream: UpstreamTools): Promise<ToolSet> {
    const namespace = { name: 'solidcraft', description: 'SolidCraft CAD: inspect and change the open design.' };
    const tools: ToolSet = {};
    for (const definition of await upstream.listTools()) {
      tools[definition.name] = tool({
        description: definition.description ?? definition.name,
        inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
        providerOptions: { openai: { namespace } },
        execute: async (input: unknown) => this.callTool(upstream, definition.name, (input ?? {}) as Record<string, unknown>),
      });
    }
    return tools;
  }

  private async callTool(upstream: UpstreamTools, name: string, args: Record<string, unknown>): Promise<string> {
    this.sequence += 1;
    const id = `chatgpt-${this.sequence}`;
    const summary = JSON.stringify(args).slice(0, 2000);
    const decision = decide(name, args);
    if (!decision.allow) {
      this.options.event({ type: 'tool', id, name, summary, decision: 'denied', reason: decision.reason.slice(0, 500) });
      return decision.reason;
    }
    this.options.event({ type: 'tool', id, name, summary, decision: 'allowed' });
    try {
      const result = await upstream.callTool(name, args, id);
      this.options.event({ type: 'tool', id, name, summary, decision: 'allowed', ok: result.isError !== true });
      return resultText(result);
    } catch (error) {
      this.options.event({ type: 'tool', id, name, summary, decision: 'allowed', ok: false });
      return `SolidCraft tool failed: ${(error as Error).message}`;
    }
  }

  /** The first model OpenAI lists for this ChatGPT account. */
  private async pickModel(): Promise<string> {
    const response = await (this.options.fetch ?? fetch)(`${RESOURCE}/models`, {
      headers: { Authorization: `Bearer ${await this.options.account.accessToken()}` },
    });
    if (!response.ok) throw new Error(`model list: HTTP ${response.status}`);
    const body = (await response.json()) as { models?: { slug?: unknown; visibility?: unknown }[] };
    const slug = body.models?.find((model) => model.visibility === 'list' && typeof model.slug === 'string')?.slug;
    if (typeof slug !== 'string') throw new Error('no model is available for this ChatGPT account');
    return slug;
  }
}

/** Maps Sign in with ChatGPT errors to a sentence the user can act on. */
function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('subscription_sharing_usage_limit_exceeded')) {
    return 'The ChatGPT usage limit is reached. See chatgpt.com/settings/usage; PartBuddy does not switch to another billing.';
  }
  if (text.includes('subscription_sharing_user_not_eligible')) return 'ChatGPT plan usage is not available for this account or workspace.';
  if (text.includes('subscription_sharing_unsupported_capability')) return `OpenAI rejected a request feature: ${text.slice(0, 300)}`;
  return text.slice(0, 500);
}
