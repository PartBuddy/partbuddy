import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import type { AgentEvent, AgentStatus, ModelChoice, ModelOption, Phase, Selection } from '../../shared/contract';
import { AcpConnection, failureOf, modelsOfSession, promptTokens, TurnText, type AcpCommand } from './acp';
import { userEvent, type AgentBackend, type PictureKind } from './assistant';
import { roleOf } from './claudeCode';
import { GateProxy, type UpstreamTools } from './gateProxy';
import { tokensLine } from './loop';
import { allowedChoice, choiceStatus, listedPhases, phaseChoices, phaseStatus, withoutChoice, type ChoiceStore, type PhaseStore } from './modelChoice';
import type { TurnReview } from './review';
import { withToolNotes } from './toolNotes';
import { composeMessage } from './viewContext';

/**
 * OpenCode as an assistant route (issue #489): the user's own, unmodified OpenCode 2 over the Agent Client Protocol
 * (`opencode acp`). It brings GitHub Copilot plans, providers with the user's API keys and OpenCode's free Zen models;
 * the user connects them in OpenCode itself (`opencode auth login`), and PartBuddy never reads those credentials.
 * OpenCode runs PartBuddy's own agent from a private folder: PartBuddy's role as its system prompt and every tool
 * denied but PartBuddy's gate proxy (and web research when allowed); its shell ran unasked before (probe of 2026-11-16).
 */

const ROUTE = 'opencode';

/** The program, or a test double given as command plus leading arguments (PARTBUDDY_OPENCODE_COMMAND). */
export function findOpenCode(env: NodeJS.ProcessEnv, home: string, exists: (path: string) => boolean = existsSync, platform: NodeJS.Platform = process.platform): AcpCommand | null {
  if (env.PARTBUDDY_OPENCODE_COMMAND) {
    const [command, ...prefix] = JSON.parse(env.PARTBUDDY_OPENCODE_COMMAND) as string[];
    return command ? { command, prefix } : null;
  }
  const name = platform === 'win32' ? 'opencode.exe' : 'opencode';
  // Its install script puts it in ~/.opencode/bin; npm on Windows puts only a .cmd on the PATH, the program sits in the package.
  const candidates = [join(home, '.opencode', 'bin', name)];
  if (platform === 'win32' && env.APPDATA) candidates.push(join(env.APPDATA, 'npm', 'node_modules', '@opencode', 'cli', 'bin', name));
  if (platform === 'darwin') candidates.push(join('/opt/homebrew/bin', name), join('/usr/local/bin', name));
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) if (dir) candidates.push(join(dir, name));
  const found = candidates.find((path) => exists(path));
  return found ? { command: found, prefix: [] } : null;
}

/** "opencode v2.3.2" → "2.3.2". */
export function readVersion(opencode: AcpCommand, env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(opencode.command, [...opencode.prefix, '--version'], { env, timeout: 20_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error(`--version: ${error.message}`));
      else resolve(/(\d+\.\d+\.\d+[0-9A-Za-z.-]*)/.exec(stdout)?.[1] ?? stdout.trim().slice(0, 40));
    });
  });
}

/** OpenCode 1 reads another configuration (`permission`, `bash`): a denial written for 2 would not hold there. */
export const supportedVersion = (version: string) => Number(/^(\d+)\./.exec(version)?.[1] ?? 0) >= 2;

/**
 * PartBuddy's agent for OpenCode: a Markdown agent whose body replaces OpenCode's own system prompt (OpenCode 2,
 * docs "Agents"), with permissions that deny every tool (the last matching rule wins) and allow PartBuddy's MCP tools,
 * named `partbuddy_<tool>`, and the web for research. A denied tool is not offered at all: asked to run `dir`, the
 * model had no shell and said so (OpenCode 2.3.2 with a local Qwen model, 2026-11-19).
 */
export function agentFile(role: string, research: boolean): string {
  const rule = (action: string, effect: string) => `  - { action: "${action}", resource: "*", effect: ${effect} }`;
  return [
    '---',
    'description: PartBuddy designs printable parts in SolidCraft',
    'mode: primary',
    'permissions:',
    rule('*', 'deny'),
    rule('partbuddy_*', 'allow'),
    ...(research ? [rule('webfetch', 'allow'), rule('websearch', 'allow')] : []),
    '---',
    '',
    role,
    '',
  ].join('\n');
}

/** Writes PartBuddy's agent and makes it the folder's default; the folder holds nothing else. */
export function prepareFolder(dir: string, agent: string, research: boolean): void {
  mkdirSync(join(dir, '.opencode', 'agents'), { recursive: true });
  writeFileSync(join(dir, '.opencode', 'agents', 'partbuddy.md'), agent, 'utf8');
  // Web search asks for its provider at first use, a question PartBuddy refuses over ACP ("Web search cancelled",
  // 2026-11-19): OpenCode picks an available one itself (TinyFish needs no key); without research the tool is gone.
  writeFileSync(join(dir, 'opencode.json'), JSON.stringify({ $schema: 'https://opencode.ai/config.json', default_agent: 'partbuddy', websearch: research ? { provider: 'random' } : false }), 'utf8');
}

export interface OpenCodeOptions {
  env: NodeJS.ProcessEnv;
  home: string;
  /** Private folder of the agent; OpenCode runs in a folder of its own inside. */
  workDir: string;
  tools(): Promise<UpstreamTools | null>;
  choices: ChoiceStore;
  phases?: PhaseStore;
  research?: () => boolean;
  review?: TurnReview;
  /** Opens OpenCode's own sign-in for providers (a terminal on the user's screen); tests replace it. */
  startSignIn?: (opencode: AcpCommand) => ChildProcess;
  log(message: string): void;
}

export interface OpenCodeListeners {
  status(status: AgentStatus): void;
  event(event: AgentEvent): void;
}

/** `opencode auth login` in a console window of its own: it asks which provider, interactively. */
function openSignIn(opencode: AcpCommand, env: NodeJS.ProcessEnv): ChildProcess {
  // shortcut: a detached console program gets a window of its own on Windows only; macOS and Linux need a terminal started for it.
  return spawn(opencode.command, [...opencode.prefix, 'auth', 'login'], { env, detached: true, stdio: 'ignore', windowsHide: false, shell: false });
}

/** One OpenCode process per app run; one ACP session per conversation, deleted when it ends (OpenCode keeps sessions). */
export class OpenCodeAgent implements AgentBackend {
  private current: AgentStatus = { agent: ROUTE, state: 'checking' };
  private opencode: AcpCommand | null = null;
  private connection: AcpConnection | null = null;
  /** The agent file the running process was started with. */
  private agent = '';
  private proxy: GateProxy | null = null;
  private session: string | null = null;
  private models: ModelOption[] | null = null;
  private choice: ModelChoice | null = null;
  private pinned: ModelChoice | null = null;
  private phase: Phase = 'plan';
  /** The model the session runs with now. */
  private sessionChoice: ModelChoice | null = null;
  private context = { used: 0, size: 0 };
  private text = new TurnText();
  private stopping = false;
  private login: ChildProcess | null = null;
  private looking: Promise<AgentStatus> | null = null;

  constructor(
    private readonly options: OpenCodeOptions,
    private readonly listeners: OpenCodeListeners,
  ) {}

  private get folder(): string {
    return join(this.options.workDir, 'opencode');
  }

  status(): AgentStatus {
    return this.current;
  }

  refresh(): Promise<AgentStatus> {
    this.looking ??= this.look().finally(() => {
      this.looking = null;
    });
    return this.looking;
  }

  private async look(): Promise<AgentStatus> {
    const opencode = findOpenCode(this.options.env, this.options.home);
    this.opencode = opencode;
    if (!opencode) {
      this.setStatus({ agent: ROUTE, state: 'notInstalled' });
      return this.current;
    }
    try {
      const version = await readVersion(opencode, this.options.env);
      if (!supportedVersion(version)) {
        this.setStatus({ agent: ROUTE, state: 'unavailable', version, detail: `PartBuddy needs OpenCode 2 or newer; this is ${version}.` });
        return this.current;
      }
      // The free Zen models need no sign-in: installed is ready; a provider's sign-in shows when a turn needs it.
      this.setStatus({ agent: ROUTE, state: this.current.state === 'busy' ? 'busy' : 'ready', version });
      if (!this.models) await this.readModels();
    } catch (error) {
      this.setStatus({ agent: ROUTE, state: 'unavailable', detail: (error as Error).message.slice(0, 500) });
    }
    return this.current;
  }

  /** The models of the user's providers, from a session without tools that is deleted at once. */
  private async readModels(): Promise<void> {
    try {
      const connection = this.connection?.running ? this.connection : await this.connect(await this.agentText());
      const created = (await connection.request('session/new', { cwd: this.folder, mcpServers: [] })) as { sessionId?: unknown; configOptions?: unknown };
      if (typeof created.sessionId === 'string') await connection.request('session/delete', { sessionId: created.sessionId }).catch(() => undefined);
      this.takeModels(created.configOptions);
    } catch (error) {
      this.options.log(`OpenCode models could not be listed: ${(error as Error).message}`);
    }
  }

  private takeModels(configOptions: unknown): void {
    const read = modelsOfSession(configOptions);
    if (read.models.length === 0) return;
    this.models = read.models;
    const own = read.current ? { model: read.current, effort: read.effort } : null;
    this.choice = allowedChoice(read.models, this.choice ?? this.options.choices.get(ROUTE)) ?? allowedChoice(read.models, own);
    this.setStatus(this.current);
  }

  /** PartBuddy's agent with SolidCraft's instructions and the research switch as they are now. */
  private async agentText(tools?: UpstreamTools | null): Promise<string> {
    const research = this.options.research?.() ?? false;
    const upstream = tools === undefined ? await this.options.tools() : tools;
    return agentFile(roleOf(research, upstream ? withToolNotes(upstream.instructions()) : ''), research);
  }

  /**
   * The OpenCode process, started with PartBuddy's agent in its folder; started again when the agent changed (SolidCraft's
   * instructions arrived, research was switched), since OpenCode reads its configuration as it starts.
   */
  private async connect(agent: string): Promise<AcpConnection> {
    if (this.connection?.running && agent === this.agent) return this.connection;
    if (!this.opencode) throw new Error('OpenCode is not installed');
    await this.connection?.stop();
    prepareFolder(this.folder, agent, this.options.research?.() ?? false);
    this.agent = agent;
    const connection = new AcpConnection(this.opencode, ['acp'], { cwd: this.folder, env: this.options.env, log: (message) => this.options.log(message) });
    connection.onUpdate((params) => {
      if (params.sessionId === this.session) this.updated(params.update as Record<string, unknown>);
    });
    connection.onExit((code) => {
      this.options.log(`OpenCode ended (${code ?? 'killed'})`);
      if (this.connection === connection) this.connection = null;
      this.session = null;
      if (this.current.state === 'busy') {
        this.listeners.event({ type: 'done', ok: false, durationMs: null, detail: 'stopped' });
        this.setStatus({ ...this.current, state: 'ready' });
      }
    });
    connection.start();
    this.connection = connection;
    await connection.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
    return connection;
  }

  async send(text: string, selections: Selection[] = [], note: string | null = null, images: readonly Uint8Array[] = [], kind: PictureKind = 'sketch', phase: Phase = 'build'): Promise<void> {
    if (this.current.state !== 'ready') throw new Error(`assistant is ${this.current.state}`);
    this.phase = phase;
    const tools = await this.options.tools();
    if (!tools) {
      this.listeners.event({ type: 'error', message: 'SolidCraft is not connected' });
      return;
    }
    const session = await this.ensureSession(tools);
    this.stopping = false;
    const message = composeMessage(text, selections, note);
    this.listeners.event(userEvent(text, message.label, message.summary, images.length > 0 ? kind : undefined));
    this.setStatus({ ...this.current, state: 'busy' });
    this.proxy?.newTurn();
    const prompt = [{ type: 'text', text: message.prompt }, ...images.map((image) => ({ type: 'image', mimeType: 'image/png', data: Buffer.from(image).toString('base64') }))];
    void this.turn(session, prompt);
  }

  /** One turn, the review's send-back included (review.ts); ends with `done`. */
  private async turn(session: string, prompt: Record<string, unknown>[]): Promise<void> {
    const started = Date.now();
    let next: Record<string, unknown>[] | null = prompt;
    let done: AgentEvent;
    try {
      let stopReason = 'end_turn';
      while (next) {
        await this.use(session, this.steps()?.[this.phase] ?? null);
        // Stop pressed before the prompt went out: a cancel has nothing to end yet, so the prompt is not sent.
        if (this.stopping) {
          stopReason = 'cancelled';
          break;
        }
        const result = (await this.connection?.request('session/prompt', { sessionId: session, prompt: next })) as { stopReason?: unknown } | undefined;
        for (const event of this.text.end()) this.listeners.event(event as AgentEvent);
        const tokens = promptTokens(result);
        if (tokens) this.options.log(tokensLine('OpenCode', tokens));
        stopReason = typeof result?.stopReason === 'string' ? result.stopReason : 'end_turn';
        next = null;
        const back = stopReason === 'end_turn' && !this.stopped() && this.session === session ? (this.options.review?.due() ?? null) : null;
        if (back) {
          this.phase = 'review';
          this.setStatus(this.current);
          next = [{ type: 'text', text: back }];
        }
      }
      const ok = stopReason === 'end_turn';
      done = { type: 'done', ok, durationMs: Date.now() - started, detail: ok ? null : stopReason === 'cancelled' ? 'stopped' : 'failed', ...(ok || stopReason === 'cancelled' ? {} : { reason: `OpenCode stopped: ${stopReason}` }) };
    } catch (error) {
      for (const event of this.text.end()) this.listeners.event(event as AgentEvent);
      const reason = (error as Error).message.slice(0, 500);
      this.options.log(`OpenCode ended the turn with: ${reason}`);
      done = { type: 'done', ok: false, durationMs: Date.now() - started, detail: failureOf(error as Error), reason };
    }
    if (this.current.state !== 'busy') return;
    this.listeners.event(done);
    this.setStatus({ ...this.current, state: 'ready' });
  }

  private updated(update: Record<string, unknown>): void {
    for (const event of this.text.update(update)) {
      if (event.type === 'context') {
        this.context = { used: event.used, size: event.size };
        if (event.cost !== null && event.cost > 0) this.options.log(`OpenCode session cost so far: ${event.cost.toFixed(4)} USD`);
        this.setStatus(this.current);
      } else if (event.type === 'retry') this.options.log(`OpenCode retries a model call: ${event.message}`);
      else this.listeners.event(event);
    }
  }

  private async ensureSession(tools: UpstreamTools): Promise<string> {
    if (this.session && this.connection?.running) return this.session;
    const connection = await this.connect(await this.agentText(tools));
    await this.proxy?.stop();
    const proxy = new GateProxy(tools, (record) => {
      const event: AgentEvent = { type: 'tool', id: record.id, name: record.name, summary: record.summary, decision: record.decision };
      if (record.reason) event.reason = record.reason.slice(0, 500);
      if (record.ok !== undefined) event.ok = record.ok;
      this.listeners.event(event);
    });
    await proxy.start();
    this.proxy = proxy;
    // The bearer token goes over stdin, never on a command line or into a file.
    const created = (await connection.request('session/new', {
      cwd: this.folder,
      mcpServers: [{ type: 'http', name: 'partbuddy', url: proxy.url, headers: [{ name: 'Authorization', value: `Bearer ${proxy.token}` }] }],
    })) as { sessionId?: unknown; configOptions?: unknown };
    if (typeof created.sessionId !== 'string') throw new Error('OpenCode started no session');
    const mode = (Array.isArray(created.configOptions) ? (created.configOptions as { id?: unknown; currentValue?: unknown }[]) : []).find((option) => option.id === 'mode')?.currentValue;
    // Another agent would bring OpenCode's own tools and prompt back: refused rather than run.
    if (mode !== undefined && mode !== 'partbuddy') throw new Error(`OpenCode did not take PartBuddy's agent (it chose ${JSON.stringify(mode)})`);
    this.session = created.sessionId;
    this.sessionChoice = null;
    this.context = { used: 0, size: 0 };
    if (!this.models) this.takeModels(created.configOptions);
    this.options.log('OpenCode session started');
    return created.sessionId;
  }

  /** Switches the session to a step's model and effort (`session/set_config_option`) when it runs with another. */
  private async use(session: string, choice: ModelChoice | null): Promise<void> {
    if (!choice || !this.connection) return;
    if (this.sessionChoice?.model === choice.model && this.sessionChoice.effort === choice.effort) return;
    await this.connection.request('session/set_config_option', { sessionId: session, configId: 'model', value: choice.model });
    if (choice.effort) await this.connection.request('session/set_config_option', { sessionId: session, configId: 'effort', value: choice.effort }).catch(() => undefined);
    this.sessionChoice = choice;
    this.options.log(`OpenCode ${this.phase} with ${choice.model} ${choice.effort ?? ''}`.trimEnd());
  }

  async chooseModel(choice: ModelChoice, asDefault: boolean): Promise<void> {
    if (!this.models) throw new Error('OpenCode has not listed its models yet');
    const allowed = allowedChoice(this.models, choice);
    if (!allowed) throw new Error(`model ${choice.model} is not offered by OpenCode`);
    this.choice = allowed;
    this.pinned = allowed;
    if (asDefault) this.options.choices.set(ROUTE, allowed);
    this.setStatus(this.current);
    await Promise.resolve();
  }

  async phaseModel(phase: Phase, choice: ModelChoice | null): Promise<void> {
    if (!this.models) throw new Error('OpenCode has not listed its models yet');
    const allowed = choice ? allowedChoice(this.models, choice) : null;
    if (choice && !allowed) throw new Error(`model ${choice.model} is not offered by OpenCode`);
    this.options.phases?.setPhase(ROUTE, phase, allowed);
    this.setStatus(this.current);
    await Promise.resolve();
  }

  async automatic(): Promise<void> {
    this.pinned = null;
    this.setStatus(this.current);
    await Promise.resolve();
  }

  private steps() {
    const models = this.models ?? [];
    return phaseChoices(models, this.choice, this.pinned, this.options.phases?.phases(ROUTE) ?? {}, listedPhases(models, this.choice));
  }

  /** Read through a method: a Stop can come while a prompt is awaited. */
  private stopped(): boolean {
    return this.stopping;
  }

  freshConversation(): boolean {
    return this.session === null;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.session) this.connection?.notify('session/cancel', { sessionId: this.session });
    await Promise.resolve();
  }

  async newConversation(): Promise<void> {
    await this.endSession();
    this.pinned = null;
    this.phase = 'plan';
    this.setStatus(this.current);
  }

  /** Cancels and deletes the session: OpenCode would keep the chat in its own history otherwise. */
  private async endSession(): Promise<void> {
    this.stopping = true;
    const session = this.session;
    this.session = null;
    this.context = { used: 0, size: 0 };
    if (session && this.connection?.running) await this.connection.request('session/delete', { sessionId: session }).catch((error: unknown) => this.options.log(`Warning: OpenCode session not deleted: ${(error as Error).message}`));
    if (this.current.state === 'busy') {
      this.listeners.event({ type: 'done', ok: false, durationMs: null, detail: 'stopped' });
      this.setStatus({ ...this.current, state: 'ready' });
    }
  }

  /** OpenCode's own sign-in, for a provider such as GitHub Copilot or an API key; the models are read again after it. */
  signIn(): void {
    if (!this.opencode) return;
    if (this.login?.exitCode === null) this.login.kill();
    this.options.log('OpenCode sign-in started');
    const child = (this.options.startSignIn ?? ((opencode) => openSignIn(opencode, this.options.env)))(this.opencode);
    this.login = child;
    child.once('error', (error) => this.options.log(`Warning: OpenCode sign-in could not start: ${error.message}`));
    child.once('exit', (code) => {
      if (this.login === child) this.login = null;
      this.options.log(`OpenCode sign-in ended (${code === null ? 'stopped' : `exit ${String(code)}`})`);
      // A new provider brings its models; the process reads credentials as it starts.
      this.models = null;
      void this.restart();
    });
  }

  private async restart(): Promise<void> {
    if (this.current.state !== 'busy') {
      await this.endSession();
      await this.connection?.stop();
      this.connection = null;
    }
    await this.refresh();
  }

  /** OpenCode keeps its providers' sign-ins; signing out happens there. */
  async signOut(): Promise<void> {
    await Promise.resolve();
  }

  async dispose(): Promise<void> {
    await this.endSession();
    await this.connection?.stop();
    this.connection = null;
    await this.proxy?.stop();
    this.proxy = null;
  }

  private setStatus(status: AgentStatus): void {
    const steps = this.models ? this.steps() : null;
    this.current = {
      ...withoutChoice(status),
      ...choiceStatus(this.models, steps?.[this.phase] ?? this.choice, this.options.choices.get(ROUTE)),
      ...(this.models ? phaseStatus(steps, this.phase, this.pinned !== null, this.options.phases?.phases(ROUTE) ?? {}) : {}),
    };
    delete this.current.context;
    if (this.session && this.context.size > 0 && this.context.used > 0) this.current.context = { ...this.context };
    this.listeners.status(this.current);
  }
}
