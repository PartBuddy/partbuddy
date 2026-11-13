import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';

import type { ModelChoice, ModelOption, ResearchSource, AgentStatus } from '../../shared/contract';
import { ANSWER_GUIDANCE, QUESTION_GUIDANCE } from './questions';
import { CLAUDE_RESEARCH_TOOLS, RESEARCH_GUIDANCE, sourceOfSearchResult, sourceOfToolUse } from './research';
import { VIEW_GUIDANCE } from './viewContext';
import { ASSEMBLY_GUIDANCE, JOINT_GUIDANCE } from './assemblyTool';
import { BLOCK_GUIDANCE } from './blockTool';
import { STANDARD_GUIDANCE } from './standardTool';
import { MECHANISM_GUIDANCE } from './mechanismTool';
import { REFUSAL_GUIDANCE } from './loop';

/**
 * Adapter for the user's own, unmodified Claude Code (ADR 0015). PartBuddy starts the official
 * program in headless mode (`claude -p` with stream-json); the user signs in inside Claude Code
 * through Anthropic's own flow, and PartBuddy never reads, stores or forwards those credentials.
 */

export interface ClaudeAuth {
  loggedIn: boolean;
  /** "claude.ai" for a subscription, "console" or similar for API billing. */
  method: string | null;
  /** Subscription type such as "pro" or "max", when signed in with a subscription. */
  plan: string | null;
}

/** The program, or a test double given as command plus leading arguments. */
export interface ClaudeCommand {
  command: string;
  prefix: string[];
}

export function findClaudeCode(
  env: NodeJS.ProcessEnv,
  home: string,
  exists: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
): ClaudeCommand | null {
  if (env.PARTBUDDY_CLAUDE_COMMAND) {
    // Test hook: a JSON array, for example ["node", "test/fakeClaude.mjs"].
    const parts = JSON.parse(env.PARTBUDDY_CLAUDE_COMMAND) as string[];
    const [command, ...prefix] = parts;
    return command ? { command, prefix } : null;
  }
  const name = platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [join(home, '.local', 'bin', name)];
  // An app started from the Finder does not get the shell's PATH; Homebrew and npm install here.
  if (platform === 'darwin') candidates.push(join('/opt/homebrew/bin', name), join('/usr/local/bin', name));
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, name));
  }
  const found = candidates.find((path) => exists(path));
  return found ? { command: found, prefix: [] } : null;
}

/** `answerOnFailure`: a failing exit that still printed an answer counts as that answer. */
function run(claude: ClaudeCommand, args: string[], env: NodeJS.ProcessEnv, answerOnFailure = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(claude.command, [...claude.prefix, ...args], { env, timeout: 20_000, windowsHide: true }, (error, stdout) => {
      if (error && !(answerOnFailure && error.code !== undefined && stdout.trim())) reject(new Error(`${args.join(" ")}: ${error.message}`));
      else resolve(stdout);
    });
  });
}

export async function readVersion(claude: ClaudeCommand, env: NodeJS.ProcessEnv): Promise<string> {
  return (await run(claude, ['--version'], env)).trim().split(/\s+/)[0] ?? '';
}

/** Reads only whether, how and with which plan the user is signed in; never the e-mail address. */
export async function readAuth(claude: ClaudeCommand, env: NodeJS.ProcessEnv): Promise<ClaudeAuth> {
  // Signed out, Claude Code 2.1.302 answers with exit code 1; that is "signed out", not "unavailable" (seen 2026-11-06).
  const raw = JSON.parse(await run(claude, ['auth', 'status', '--json'], env, true)) as Record<string, unknown>;
  return {
    loggedIn: raw.loggedIn === true,
    method: typeof raw.authMethod === 'string' ? raw.authMethod : null,
    plan: typeof raw.subscriptionType === 'string' ? raw.subscriptionType : null,
  };
}

/** Starts Anthropic's own sign-in flow of Claude Code; it opens the browser itself. */
export function startSignIn(claude: ClaudeCommand, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(claude.command, [...claude.prefix, 'auth', 'login', '--claudeai'], {
    env,
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
}

/**
 * The models of the user's plan as Claude Code lists them in its answer to `initialize`: the
 * aliases (opus, fable, sonnet, haiku) with their effort levels. Pinned older versions are left out
 * to keep the choice short; nothing else of the answer (account, e-mail) is kept. Claude Code's own
 * "Default (recommended)" is left out too (Manuel, 2026-11-12): it is whatever the plan's frontier
 * model is, shown as if PartBuddy recommended it.
 */
export function modelsFromInitialize(response: unknown): ModelOption[] {
  const models = (response as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  const options: ModelOption[] = [];
  for (const raw of models as Record<string, unknown>[]) {
    const id = raw.value;
    if (typeof id !== 'string' || !/^[a-z]{1,20}$/.test(id) || id === 'default') continue;
    const name = typeof raw.displayName === 'string' ? raw.displayName.slice(0, 80) : id;
    const efforts = Array.isArray(raw.supportedEffortLevels)
      ? raw.supportedEffortLevels.filter((level): level is string => typeof level === 'string' && /^[a-z]{1,20}$/.test(level)).slice(0, 12)
      : [];
    const option: ModelOption = { id, name, efforts };
    if (typeof raw.description === 'string') option.description = raw.description.slice(0, 200);
    options.push(option);
  }
  return options.slice(0, 30);
}

/** The arguments for the model and effort a session starts with; nothing for Claude Code's own default. */
export function choiceArgs(choice: ModelChoice | null): string[] {
  if (!choice) return [];
  return [...(choice.model !== 'default' ? ['--model', choice.model] : []), ...(choice.effort ? ['--effort', choice.effort] : [])];
}

/**
 * Ends a Claude Code process by closing its input, so it leaves on its own, and kills it only when it
 * has not left after `graceMs`. A process killed at once can die while it renews the sign-in: the service
 * has then already replaced the token that Claude Code never got to save, and the next start finds the
 * sign-in expired ("OAuth session expired and could not be refreshed" at the first request after a
 * night, seen on 2026-11-09 and 2026-11-10).
 */
export function endGently(child: ChildProcess, graceMs: number): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const timer = setTimeout(() => child.kill(), graceMs);
  child.once('exit', () => {
    clearTimeout(timer);
  });
  child.stdin?.end();
}

/**
 * Asks Claude Code for the models of the user's plan (B1): a short session that only sends the
 * `initialize` control request of the stream-json protocol, so no prompt reaches a model.
 */
export function listModels(claude: ClaudeCommand, env: NodeJS.ProcessEnv, cwd: string, timeoutMs = 20_000): Promise<ModelOption[]> {
  return new Promise((resolve, reject) => {
    const args = [...claude.prefix, '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--setting-sources', '', '--no-session-persistence'];
    const child = spawn(claude.command, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false });
    // The answer is passed on once the process has exited: Windows keeps its folder locked until then.
    let outcome: { error: Error | null; models: ModelOption[] } | null = null;
    let exited = false;
    const settle = () => {
      if (!outcome || !exited) return;
      clearTimeout(timer);
      if (outcome.error) reject(outcome.error);
      else resolve(outcome.models);
    };
    const finish = (error: Error | null, models: ModelOption[] = []) => {
      if (outcome) return;
      outcome = { error, models };
      if (!exited) endGently(child, 5000);
      settle();
    };
    const timer = setTimeout(() => {
      finish(new Error('Claude Code did not list its models in time'));
    }, timeoutMs);
    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: { type?: unknown; response?: { request_id?: unknown; subtype?: unknown; response?: unknown; error?: unknown } };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        return;
      }
      if (message.type !== 'control_response' || message.response?.request_id !== 'partbuddy-models') return;
      if (message.response.subtype !== 'success') finish(new Error(`initialize: ${typeof message.response.error === 'string' ? message.response.error.slice(0, 200) : 'failed'}`));
      else finish(null, modelsFromInitialize(message.response.response));
    });
    child.once('error', (error) => {
      exited = true;
      finish(error);
      settle();
    });
    child.once('exit', () => {
      exited = true;
      finish(new Error('Claude Code ended before it listed its models'));
      settle();
    });
    child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: 'partbuddy-models', request: { subtype: 'initialize' } })}\n`);
  });
}

export type ClaudeEvent =
  | { type: 'started'; model: string | null }
  | { type: 'textDelta'; text: string }
  | { type: 'source'; source: ResearchSource }
  | { type: 'text'; text: string }
  | { type: 'done'; ok: boolean; durationMs: number | null; detail: string | null; reason?: string }
  | { type: 'exited'; code: number | null }
  | { type: 'usage'; windows: NonNullable<AgentStatus['usage']> }
  | { type: 'context'; used?: number; size?: number }
  /** Claude Code compacted its context: what earlier messages carried, such as the print profile, may be gone. */
  | { type: 'compacted'; tokens: number | null };

/** Maps one stream-json line of Claude Code to the events PartBuddy shows. */
export function parseStreamLine(line: string): ClaudeEvent[] {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  switch (message.type) {
    case 'system': {
      if (message.subtype === 'init') return [{ type: 'started', model: typeof message.model === 'string' ? message.model : null }];
      // After compacting, Claude Code reports {"type":"system","subtype":"compact_boundary","compact_metadata":{"trigger":"auto","pre_tokens":…}}
      // (named in the 2.1.x binary, not seen in a real run here; audit H-11).
      if (message.subtype !== 'compact_boundary') return [];
      const before = (message.compact_metadata as { pre_tokens?: unknown } | undefined)?.pre_tokens;
      return [{ type: 'compacted', tokens: typeof before === 'number' && Number.isInteger(before) && before >= 0 ? before : null }];
    }
    case 'stream_event': {
      const event = message.event as { type?: string; index?: number; content_block?: { type?: string }; delta?: { type?: string; text?: string } } | undefined;
      // A further text block of the same message starts a new paragraph, as the final text has it.
      if (event?.type === 'content_block_start' && event.content_block?.type === 'text' && (event.index ?? 0) > 0) return [{ type: 'textDelta', text: '\n\n' }];
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
        return [{ type: 'textDelta', text: event.delta.text }];
      }
      return [];
    }
    // After each request, Claude Code 2.1.302 reports the plan's limits, e.g.
    // {"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"seven_day":{"utilization":0.69,"resetsAt":1794117600}}}}.
    case 'rate_limit_event': {
      const windows = (message.rate_limit_info as { unifiedWindows?: unknown } | undefined)?.unifiedWindows;
      if (typeof windows !== 'object' || windows === null) return [];
      const usage = Object.entries(windows as Record<string, { utilization?: unknown; resetsAt?: unknown } | null>)
        .filter(([, entry]) => typeof entry?.utilization === 'number' && Number.isFinite(entry.utilization))
        .slice(0, 4)
        .map(([window, entry]) => ({
          window: window.slice(0, 40),
          used: Math.min(1, Math.max(0, entry?.utilization as number)),
          resetsAt: typeof entry?.resetsAt === 'number' && Number.isInteger(entry.resetsAt) && entry.resetsAt >= 0 ? entry.resetsAt : null,
        }));
      return usage.length > 0 ? [{ type: 'usage', windows: usage }] : [];
    }
    case 'assistant': {
      // An API error comes as a made-up answer, e.g. "Failed to authenticate: OAuth session expired…"
      // with "error":"authentication_failed","isApiErrorMessage":true (transcripts of 2.1.247 to 2.1.302);
      // the result after it carries the same text into the log and the chat's own card.
      if (message.isApiErrorMessage === true) return [];
      const content = (message.message as { content?: unknown } | undefined)?.content;
      if (!Array.isArray(content)) return [];
      const text = content
        .filter((block): block is { type: 'text'; text: string } => (block as { type?: unknown }).type === 'text')
        .map((block) => block.text)
        // Text blocks around a tool call are paragraphs of their own (practice run 2026-11-06: "Schelle.Wenn").
        .join('\n\n');
      // Research (B7): a search or a page read becomes a card; the text of the page never does.
      const sources = content
        .filter((block): block is { type: 'tool_use'; name?: unknown; input?: unknown } => (block as { type?: unknown }).type === 'tool_use')
        .map((block) => sourceOfToolUse(block.name, block.input))
        .filter((source): source is ResearchSource => source !== null)
        .map((source) => ({ type: 'source' as const, source }));
      // Each request's tokens (2.1.299: input, cache read and cache creation add up to the prompt).
      const usage = (message.message as { usage?: Record<string, unknown> } | undefined)?.usage;
      const tokens = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'].map((key) => usage?.[key]);
      const counted = typeof tokens[0] === 'number' && tokens.every((count) => count === undefined || (Number.isInteger(count) && (count as number) >= 0));
      const context = counted ? [{ type: 'context' as const, used: tokens.reduce<number>((sum, count) => sum + ((count as number | undefined) ?? 0), 0) }] : [];
      return [...sources, ...(text ? [{ type: 'text' as const, text }] : []), ...context];
    }
    case 'user': {
      const content = (message.message as { content?: unknown } | undefined)?.content;
      if (!Array.isArray(content)) return [];
      return content
        .filter((block): block is { type: 'tool_result'; content?: unknown } => (block as { type?: unknown }).type === 'tool_result')
        .map((block) => sourceOfSearchResult(block.content))
        .filter((source): source is ResearchSource => source !== null)
        .map((source) => ({ type: 'source' as const, source }));
    }
    case 'result': {
      // The window of the turn's model, e.g. "modelUsage":{"claude-haiku-5-5":{"contextWindow":1000000,…}}; the largest if several answered.
      const sizes = Object.values((message.modelUsage as Record<string, { contextWindow?: unknown } | null> | undefined) ?? {})
        .map((entry) => entry?.contextWindow)
        .filter((size): size is number => typeof size === 'number' && Number.isInteger(size) && size > 0);
      const reason = message.is_error === true && typeof message.result === 'string' ? message.result.slice(0, 300) : null;
      // An expired sign-in ends the turn as "success" with is_error and "Failed to authenticate: OAuth session expired…" (2.1.302).
      // Another Claude Code process renewing the shared token at the same moment is no sign-out, though it names OAuth:
      // "Failed to refresh OAuth token: another Claude Code process is refreshing it or exited mid-refresh" (2026-11-08).
      const busyRefreshing = reason !== null && /another Claude Code process is refreshing|mid-refresh/i.test(reason);
      const signedOut = reason !== null && !busyRefreshing && /authenticat|oauth|\/login|not logged in/i.test(reason);
      return [
        ...(sizes.length > 0 ? [{ type: 'context' as const, size: Math.max(...sizes) }] : []),
        {
          type: 'done',
          ok: message.subtype === 'success' && message.is_error !== true,
          durationMs: typeof message.duration_ms === 'number' ? message.duration_ms : null,
          detail: signedOut ? 'signedOut' : message.subtype === 'success' ? (message.is_error === true ? 'failed' : null) : typeof message.subtype === 'string' ? message.subtype : 'failed',
          ...(reason ? { reason } : {}),
        },
      ];
    }
    default:
      return [];
  }
}

/** The role Claude Code gets as `--append-system-prompt`. */
export function roleOf(research: boolean): string {
  return [
    'You are the design assistant inside PartBuddy, a desktop app for 3D-printable parts.',
    'SolidCraft runs in the background and the user watches every step live in PartBuddy\'s 3D view.',
    'Use only the partbuddy tools to inspect and change the design. Work in small visible steps:',
    'one sketch or one feature group per call. Units are millimetres.',
    REFUSAL_GUIDANCE,
    'Answer in the language the user writes in, and name bodies, features and sketches in it too: the structure tree and the timeline show these names.',
    VIEW_GUIDANCE,
    ASSEMBLY_GUIDANCE,
    JOINT_GUIDANCE,
    MECHANISM_GUIDANCE,
    BLOCK_GUIDANCE,
    STANDARD_GUIDANCE,
    QUESTION_GUIDANCE,
    ANSWER_GUIDANCE,
    ...(research ? [RESEARCH_GUIDANCE] : []),
  ].join(' ');
}

export interface SessionOptions {
  claude: ClaudeCommand;
  env: NodeJS.ProcessEnv;
  /** Working folder of the agent; holds no project files. */
  cwd: string;
  /** MCP configuration file that points Claude Code at the gate proxy only. */
  mcpConfigPath: string;
  /** Model and effort to start with (B1); null: Claude Code's own default. */
  choice?: ModelChoice | null;
  /** Claude Code's WebSearch and WebFetch for research (B7). */
  research?: boolean;
}

/**
 * One conversation with Claude Code. Built-in tools are switched off, only the gate proxy's
 * tools are available, and the user's own settings, hooks and plugins are not loaded.
 */
export class ClaudeSession {
  private child: ChildProcess | null = null;
  private control = 0;
  private readonly listeners = new Set<(event: ClaudeEvent) => void>();

  constructor(private readonly options: SessionOptions) {}

  onEvent(listener: (event: ClaudeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get running(): boolean {
    return this.child !== null;
  }

  start(): void {
    if (this.child) return;
    const { claude, env, cwd, mcpConfigPath } = this.options;
    const research = this.options.research === true;
    const args = [
      ...claude.prefix,
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools', research ? CLAUDE_RESEARCH_TOOLS.join(',') : '',
      '--strict-mcp-config',
      '--mcp-config', mcpConfigPath,
      '--allowedTools', ['mcp__partbuddy', ...(research ? CLAUDE_RESEARCH_TOOLS : [])].join(','),
      '--setting-sources', '',
      '--no-session-persistence',
      '--append-system-prompt', roleOf(research),
      ...choiceArgs(this.options.choice ?? null),
    ];
    // Argument array without a shell; the MCP token is in the config file, not on the command line.
    const child = spawn(claude.command, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    // PARTBUDDY_CLAUDE_TRACE=<file>: Claude Code's raw stream for diagnosis (which events a real run sends);
    // read from PartBuddy's own environment, never set in a build.
    const trace = process.env.PARTBUDDY_CLAUDE_TRACE;
    lines.on('line', (line) => {
      if (trace) appendFileSync(trace, `${line}\n`);
      for (const event of parseStreamLine(line)) this.emit(event);
    });
    child.once('exit', (code) => {
      this.child = null;
      this.emit({ type: 'exited', code });
    });
    child.once('error', () => {
      this.child = null;
      this.emit({ type: 'exited', code: null });
    });
  }

  /** One user message; PNGs that go along become image blocks after the text (stream-json input). */
  send(text: string, images: readonly Uint8Array[] = []): void {
    if (!this.child?.stdin) throw new Error('Claude Code is not running');
    const content =
      images.length > 0
        ? [{ type: 'text', text }, ...images.map((image) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(image).toString('base64') } }))]
        : text;
    const message = { type: 'user', message: { role: 'user', content } };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /**
   * Changes model and effort of the running session from the next turn on (B1), through the
   * stream-json control requests `set_model` and `apply_flag_settings`; `null` effort returns to
   * the model's own default.
   */
  choose(choice: ModelChoice): void {
    if (!this.child?.stdin) return;
    this.control += 1;
    const id = `partbuddy-choice-${String(this.control)}`;
    this.child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: `${id}-model`, request: { subtype: 'set_model', model: choice.model } })}\n`);
    this.child.stdin.write(
      `${JSON.stringify({ type: 'control_request', request_id: `${id}-effort`, request: { subtype: 'apply_flag_settings', settings: { effortLevel: choice.effort } } })}\n`,
    );
  }

  /** Ends the session and resolves once the process has exited (Windows keeps its folder locked until then). */
  stop(): Promise<void> {
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      // A running turn is interrupted first, so nothing more is built while the process leaves.
      if (child.stdin?.writable) child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: 'partbuddy-stop', request: { subtype: 'interrupt' } })}\n`);
      endGently(child, 1500);
    });
  }

  private emit(event: ClaudeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
