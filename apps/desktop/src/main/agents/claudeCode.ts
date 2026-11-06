import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';

import type { ModelChoice, ModelOption, ResearchSource } from '../../shared/contract';
import { ANSWER_GUIDANCE, QUESTION_GUIDANCE } from './questions';
import { CLAUDE_RESEARCH_TOOLS, RESEARCH_GUIDANCE, sourceOfSearchResult, sourceOfToolUse } from './research';
import { VIEW_GUIDANCE } from './viewContext';

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

export function findClaudeCode(env: NodeJS.ProcessEnv, home: string, exists: (path: string) => boolean = existsSync): ClaudeCommand | null {
  if (env.PARTBUDDY_CLAUDE_COMMAND) {
    // Test hook: a JSON array, for example ["node", "test/fakeClaude.mjs"].
    const parts = JSON.parse(env.PARTBUDDY_CLAUDE_COMMAND) as string[];
    const [command, ...prefix] = parts;
    return command ? { command, prefix } : null;
  }
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [join(home, '.local', 'bin', name)];
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, name));
  }
  const found = candidates.find((path) => exists(path));
  return found ? { command: found, prefix: [] } : null;
}

function run(claude: ClaudeCommand, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(claude.command, [...claude.prefix, ...args], { env, timeout: 20_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error(`${args.join(" ")}: ${error.message}`));
      else resolve(stdout);
    });
  });
}

export async function readVersion(claude: ClaudeCommand, env: NodeJS.ProcessEnv): Promise<string> {
  return (await run(claude, ['--version'], env)).trim().split(/\s+/)[0] ?? '';
}

/** Reads only whether, how and with which plan the user is signed in; never the e-mail address. */
export async function readAuth(claude: ClaudeCommand, env: NodeJS.ProcessEnv): Promise<ClaudeAuth> {
  const raw = JSON.parse(await run(claude, ['auth', 'status', '--json'], env)) as Record<string, unknown>;
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
 * aliases (default, opus, fable, sonnet, haiku) with their effort levels. Pinned older versions
 * are left out to keep the choice short; nothing else of the answer (account, e-mail) is kept.
 */
export function modelsFromInitialize(response: unknown): ModelOption[] {
  const models = (response as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  const options: ModelOption[] = [];
  for (const raw of models as Record<string, unknown>[]) {
    const id = raw.value;
    if (typeof id !== 'string' || !/^[a-z]{1,20}$/.test(id)) continue;
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
      if (!exited) child.kill();
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
  | { type: 'done'; ok: boolean; durationMs: number | null; detail: string | null }
  | { type: 'exited'; code: number | null };

/** Maps one stream-json line of Claude Code to the events PartBuddy shows. */
export function parseStreamLine(line: string): ClaudeEvent[] {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  switch (message.type) {
    case 'system':
      return message.subtype === 'init' ? [{ type: 'started', model: typeof message.model === 'string' ? message.model : null }] : [];
    case 'stream_event': {
      const event = message.event as { type?: string; index?: number; content_block?: { type?: string }; delta?: { type?: string; text?: string } } | undefined;
      // A further text block of the same message starts a new paragraph, as the final text has it.
      if (event?.type === 'content_block_start' && event.content_block?.type === 'text' && (event.index ?? 0) > 0) return [{ type: 'textDelta', text: '\n\n' }];
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
        return [{ type: 'textDelta', text: event.delta.text }];
      }
      return [];
    }
    case 'assistant': {
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
      return [...sources, ...(text ? [{ type: 'text' as const, text }] : [])];
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
    case 'result':
      return [
        {
          type: 'done',
          ok: message.subtype === 'success' && message.is_error !== true,
          durationMs: typeof message.duration_ms === 'number' ? message.duration_ms : null,
          detail: message.subtype === 'success' ? null : typeof message.subtype === 'string' ? message.subtype : 'failed',
        },
      ];
    default:
      return [];
  }
}

function roleOf(research: boolean): string {
  return [
    'You are the design assistant inside PartBuddy, a desktop app for 3D-printable parts.',
    'SolidCraft runs in the background and the user watches every step live in PartBuddy\'s 3D view.',
    'Use only the partbuddy tools to inspect and change the design. Work in small visible steps:',
    'one sketch or one feature group per call. Units are millimetres.',
    'If PartBuddy refuses a tool, tell the user why and continue without it.',
    'Answer in the language the user writes in.',
    VIEW_GUIDANCE,
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
    lines.on('line', (line) => {
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

  /** One user message; a PNG of the view goes along as an image block (stream-json input). */
  send(text: string, image: Uint8Array | null = null): void {
    if (!this.child?.stdin) throw new Error('Claude Code is not running');
    const content = image
      ? [
          { type: 'text', text },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(image).toString('base64') } },
        ]
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
      child.kill();
    });
  }

  private emit(event: ClaudeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
