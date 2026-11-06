import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentEvent, AgentStatus, ModelChoice, ModelOption, Selection } from '../../shared/contract';
import { ClaudeSession, findClaudeCode, listModels, readAuth, readVersion, startSignIn, type ClaudeAuth, type ClaudeCommand } from './claudeCode';
import { userEvent, type AgentBackend, type PictureKind } from './assistant';
import { GateProxy, type UpstreamTools } from './gateProxy';
import { allowedChoice, choiceStatus, withoutChoice, type ChoiceStore } from './modelChoice';
import { composeMessage } from './viewContext';

/**
 * PartBuddy uses Claude Code with a Claude subscription (Pro, Max) by default and runs it with
 * API billing only after the user allowed that (decided 2026-11-04). Claude Code itself is not
 * changed and keeps all its sign-in methods, as Anthropic's terms require.
 */
export function stateFor(auth: ClaudeAuth, apiBillingAllowed: boolean): AgentStatus['state'] {
  if (!auth.loggedIn) return 'signedOut';
  return auth.method === 'claude.ai' || apiBillingAllowed ? 'ready' : 'needsSubscription';
}

export interface AgentServiceOptions {
  env: NodeJS.ProcessEnv;
  home: string;
  /** Private folder for the agent's working directory and its MCP configuration. */
  workDir: string;
  /** Whether the user allowed API billing for Claude Code, and storing that choice. */
  apiBilling: { get(): boolean; set(allow: boolean): void };
  /** SolidCraft's tools for the connected app, or null while SolidCraft is not connected. */
  tools(): Promise<UpstreamTools | null>;
  /** The model and effort kept for new chats (B1). */
  choices: ChoiceStore;
  /** Whether the assistant may research on the web (B7); read when a conversation starts. */
  research?: () => boolean;
  /** Lists the models of the plan; Claude Code's own `initialize` answer by default (tests replace it). */
  listModels?: (claude: ClaudeCommand) => Promise<ModelOption[]>;
  log(message: string): void;
}

export interface AgentListeners {
  status(status: AgentStatus): void;
  event(event: AgentEvent): void;
}

/**
 * Runs the user's Claude Code against SolidCraft through the gate proxy (ADR 0015): finds the
 * program, shows whether the user is signed in, starts one headless session per conversation
 * and reports text and every tool decision to the renderer.
 */
export class AgentService implements AgentBackend {
  private current: AgentStatus = { agent: 'claude-code', state: 'checking' };
  private claude: ClaudeCommand | null = null;
  private session: ClaudeSession | null = null;
  private proxy: GateProxy | null = null;
  private usage: AgentStatus['usage'] | null = null;
  /** The session's size after its last request and its model's window; 0 while unknown. */
  private context = { used: 0, size: 0 };
  private configPath: string | null = null;
  /** The models of the user's plan, once Claude Code listed them. */
  private models: ModelOption[] | null = null;
  /** Model and effort from the next turn on; null: Claude Code's own default. */
  private choice: ModelChoice | null = null;

  constructor(
    private readonly options: AgentServiceOptions,
    private readonly listeners: AgentListeners,
  ) {}

  status(): AgentStatus {
    return this.current;
  }

  async refresh(): Promise<AgentStatus> {
    const claude = findClaudeCode(this.options.env, this.options.home);
    this.claude = claude;
    if (!claude) {
      this.setStatus({ agent: 'claude-code', state: 'notInstalled' });
      return this.current;
    }
    try {
      const [version, auth] = await Promise.all([readVersion(claude, this.options.env), readAuth(claude, this.options.env)]);
      const allowed = this.options.apiBilling.get();
      const status: AgentStatus = { agent: 'claude-code', state: stateFor(auth, allowed), version, apiBillingAllowed: allowed };
      if (auth.method) status.method = auth.method;
      if (auth.plan) status.plan = auth.plan;
      if (this.session?.running && auth.loggedIn) status.state = this.current.state === 'busy' ? 'busy' : 'ready';
      this.setStatus(status);
      if (auth.loggedIn) await this.readModels(claude);
    } catch (error) {
      this.setStatus({ agent: 'claude-code', state: 'unavailable', detail: (error as Error).message.slice(0, 500) });
    }
    return this.current;
  }

  signIn(): void {
    if (!this.claude) return;
    const child = startSignIn(this.claude, this.options.env);
    child.once('exit', () => {
      void this.refresh();
    });
  }

  async send(text: string, selections: Selection[] = [], note: string | null = null, image: Uint8Array | null = null, kind: PictureKind = 'sketch'): Promise<void> {
    if (this.current.state !== 'ready') throw new Error(`assistant is ${this.current.state}`);
    const tools = await this.options.tools();
    if (!tools) {
      this.listeners.event({ type: 'error', message: 'SolidCraft is not connected' });
      return;
    }
    await this.ensureSession(tools);
    const message = composeMessage(text, selections, note);
    this.listeners.event(userEvent(text, message.label, message.summary, image ? kind : undefined));
    this.setStatus({ ...this.current, state: 'busy' });
    this.proxy?.newTurn();
    this.session?.send(message.prompt, image);
  }

  /** Model and effort from the next turn on, in a running session too (B1). */
  async chooseModel(choice: ModelChoice, asDefault: boolean): Promise<void> {
    if (!this.models) throw new Error('Claude Code has not listed its models yet');
    const allowed = allowedChoice(this.models, choice);
    if (!allowed) throw new Error(`model ${choice.model} is not offered by this plan`);
    this.choice = allowed;
    if (asDefault) this.options.choices.set('claude-code', allowed);
    this.session?.choose(allowed);
    this.setStatus(this.current);
    await Promise.resolve();
  }

  async allowApiBilling(allow: boolean): Promise<void> {
    this.options.apiBilling.set(allow);
    if (!allow) await this.stop();
    await this.refresh();
  }

  /** Claude Code keeps its own sign-in; signing out happens there. */
  async signOut(): Promise<void> {
    await Promise.resolve();
  }

  async stop(): Promise<void> {
    await this.session?.stop();
  }

  /** Ends the session; Claude Code keeps nothing of it (`--no-session-persistence`). */
  async newConversation(): Promise<void> {
    await this.session?.stop();
    this.session = null;
    this.context = { used: 0, size: 0 };
    this.setStatus(this.current);
  }

  /** A stopped or ended Claude Code session is not resumed (`--no-session-persistence`). */
  freshConversation(): boolean {
    return !this.session?.running;
  }

  async dispose(): Promise<void> {
    await this.session?.stop();
    this.session = null;
    await this.proxy?.stop();
    this.proxy = null;
    if (this.configPath) rmSync(this.configPath, { force: true });
    this.configPath = null;
  }

  private async ensureSession(tools: UpstreamTools): Promise<void> {
    if (this.session?.running) return;
    if (!this.claude) throw new Error('Claude Code is not installed');
    // The sign-in may have changed since the last check (an API key set in the meantime).
    const auth = await readAuth(this.claude, this.options.env);
    const state = stateFor(auth, this.options.apiBilling.get());
    if (state !== 'ready') {
      this.setStatus({ ...this.current, state });
      throw new Error('Claude Code is not signed in with a Claude subscription');
    }
    await this.proxy?.stop();
    const proxy = new GateProxy(tools, (record) => {
      const event: AgentEvent = { type: 'tool', id: record.id, name: record.name, summary: record.summary, decision: record.decision };
      if (record.reason) event.reason = record.reason.slice(0, 500);
      if (record.ok !== undefined) event.ok = record.ok;
      this.listeners.event(event);
    });
    await proxy.start();
    this.proxy = proxy;

    // The bearer token lives in a file only this user can read, never on a command line.
    mkdirSync(this.options.workDir, { recursive: true });
    const configPath = join(this.options.workDir, `mcp-${randomBytes(6).toString('hex')}.json`);
    const config = { mcpServers: { partbuddy: { type: 'http', url: proxy.url, headers: { Authorization: `Bearer ${proxy.token}` } } } };
    writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
    if (this.configPath) rmSync(this.configPath, { force: true });
    this.configPath = configPath;

    let announced = false;
    this.context = { used: 0, size: 0 };
    const session = new ClaudeSession({ claude: this.claude, env: this.options.env, cwd: this.options.workDir, mcpConfigPath: configPath, choice: this.choice, research: this.options.research?.() ?? false });
    session.onEvent((event) => {
      switch (event.type) {
        case 'textDelta':
        case 'text':
        case 'source':
          this.listeners.event(event);
          break;
        case 'done':
          this.listeners.event(event);
          this.setStatus({ ...this.current, state: 'ready' });
          break;
        case 'exited':
          if (this.current.state === 'busy') {
            this.listeners.event({ type: 'done', ok: false, durationMs: null, detail: 'stopped' });
            this.setStatus({ ...this.current, state: 'ready' });
          }
          this.options.log(`Claude Code session ended (${event.code ?? 'killed'})`);
          break;
        case 'usage':
          this.usage = event.windows;
          this.setStatus(this.current);
          break;
        case 'context':
          // Tokens come with each request, the window with the turn's result.
          this.context = { used: event.used ?? this.context.used, size: event.size ?? this.context.size };
          if (event.size) this.setStatus(this.current);
          break;
        case 'started':
          // Claude Code reports `init` at the start of every turn of the same session (checked
          // with 2.1.302: same session id, earlier messages remembered), so only the first counts.
          if (!announced) this.options.log(`Claude Code session started (${event.model ?? 'default model'})`);
          announced = true;
          break;
      }
    });
    session.start();
    this.session = session;
  }

  /** Reads the plan's models once per refresh; the kept choice applies once it proves offered. */
  private async readModels(claude: ClaudeCommand): Promise<void> {
    try {
      mkdirSync(this.options.workDir, { recursive: true });
      const models = await (this.options.listModels ?? ((command) => listModels(command, this.options.env, this.options.workDir)))(claude);
      this.models = models;
      // Like the other routes: without a kept choice the plan's first model (Claude Code's default) with its fallback effort.
      this.choice = allowedChoice(models, this.choice ?? this.options.choices.get('claude-code')) ?? allowedChoice(models, models[0] ? { model: models[0].id, effort: null } : null);
      this.setStatus(this.current);
    } catch (error) {
      this.options.log(`Claude Code models could not be listed: ${(error as Error).message}`);
    }
  }

  private setStatus(status: AgentStatus): void {
    this.current = {
      ...withoutChoice(status),
      ...choiceStatus(this.models, this.choice, this.options.choices.get('claude-code')),
      // The last limits Claude Code reported stay through refreshes until the next answer brings new ones.
      ...(this.usage && status.state !== 'signedOut' && status.state !== 'notInstalled' ? { usage: this.usage } : {}),
    };
    delete this.current.context;
    if (this.session?.running && this.context.size > 0 && this.context.used > 0) this.current.context = { ...this.context };
    this.listeners.status(this.current);
  }
}
