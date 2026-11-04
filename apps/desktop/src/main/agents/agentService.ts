import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AgentEvent, AgentStatus, FaceSelection } from '../../shared/contract';
import { ClaudeSession, findClaudeCode, readAuth, readVersion, startSignIn, type ClaudeAuth, type ClaudeCommand } from './claudeCode';
import type { AgentBackend } from './assistant';
import { GateProxy, type UpstreamTools } from './gateProxy';
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
  private configPath: string | null = null;

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

  async send(text: string, selection?: FaceSelection): Promise<void> {
    if (this.current.state !== 'ready') throw new Error(`assistant is ${this.current.state}`);
    const tools = await this.options.tools();
    if (!tools) {
      this.listeners.event({ type: 'error', message: 'SolidCraft is not connected' });
      return;
    }
    await this.ensureSession(tools);
    const message = composeMessage(text, selection);
    this.listeners.event(message.label ? { type: 'user', text, selection: message.label } : { type: 'user', text });
    this.setStatus({ ...this.current, state: 'busy' });
    this.session?.send(message.prompt);
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

    const session = new ClaudeSession({ claude: this.claude, env: this.options.env, cwd: this.options.workDir, mcpConfigPath: configPath });
    session.onEvent((event) => {
      switch (event.type) {
        case 'textDelta':
        case 'text':
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
        case 'started':
          this.options.log(`Claude Code session started (${event.model ?? 'default model'})`);
          break;
      }
    });
    session.start();
    this.session = session;
  }

  private setStatus(status: AgentStatus): void {
    this.current = status;
    this.listeners.status(status);
  }
}
