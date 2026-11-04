import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';
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

export type ClaudeEvent =
  | { type: 'started'; model: string | null }
  | { type: 'textDelta'; text: string }
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
      const event = message.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
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
        .join('');
      return text ? [{ type: 'text', text }] : [];
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

const ROLE = [
  'You are the design assistant inside PartBuddy, a desktop app for 3D-printable parts.',
  'SolidCraft runs in the background and the user watches every step live in PartBuddy\'s 3D view.',
  'Use only the partbuddy tools to inspect and change the design. Work in small visible steps:',
  'one sketch or one feature group per call. Units are millimetres.',
  'If PartBuddy refuses a tool, tell the user why and continue without it.',
  'Answer in the language the user writes in.',
  VIEW_GUIDANCE,
].join(' ');

export interface SessionOptions {
  claude: ClaudeCommand;
  env: NodeJS.ProcessEnv;
  /** Working folder of the agent; holds no project files. */
  cwd: string;
  /** MCP configuration file that points Claude Code at the gate proxy only. */
  mcpConfigPath: string;
}

/**
 * One conversation with Claude Code. Built-in tools are switched off, only the gate proxy's
 * tools are available, and the user's own settings, hooks and plugins are not loaded.
 */
export class ClaudeSession {
  private child: ChildProcess | null = null;
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
    const args = [
      ...claude.prefix,
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools', '',
      '--strict-mcp-config',
      '--mcp-config', mcpConfigPath,
      '--allowedTools', 'mcp__partbuddy',
      '--setting-sources', '',
      '--no-session-persistence',
      '--append-system-prompt', ROLE,
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

  send(text: string): void {
    if (!this.child?.stdin) throw new Error('Claude Code is not running');
    const message = { type: 'user', message: { role: 'user', content: text } };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
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
