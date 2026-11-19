import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { ModelOption } from '../../shared/contract';
import type { TurnTokens } from './loop';

/**
 * A client of the Agent Client Protocol (agentclientprotocol.com, version 1): newline-delimited JSON-RPC over the
 * agent's stdin and stdout. PartBuddy uses it for OpenCode (`opencode acp`, issue #489); it offers no file system and
 * no terminal to the agent, and refuses every permission the agent asks for: whatever the agent may do is set in its
 * own configuration, the rest goes through PartBuddy's gate proxy.
 */

export interface AcpCommand {
  command: string;
  prefix: string[];
}

/** A JSON-RPC error the agent answered with; `name` is OpenCode's `data.errorName` (e.g. "provider.free-limit"). */
export class AcpError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly kind: string,
  ) {
    super(message);
  }
}

type Pending = { resolve(result: unknown): void; reject(error: Error): void };

export class AcpConnection {
  private child: ChildProcess | null = null;
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(params: Record<string, unknown>) => void>();
  private readonly exits = new Set<(code: number | null) => void>();

  constructor(
    private readonly agent: AcpCommand,
    private readonly args: string[],
    private readonly options: { cwd: string; env: NodeJS.ProcessEnv; log(message: string): void },
  ) {}

  get running(): boolean {
    return this.child !== null;
  }

  start(): void {
    if (this.child) return;
    const child = spawn(this.agent.command, [...this.agent.prefix, ...this.args], { cwd: this.options.cwd, env: this.options.env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => {
      this.receive(line);
    });
    const ended = (code: number | null) => {
      if (this.child !== child) return;
      this.child = null;
      for (const waiting of this.pending.values()) waiting.reject(new Error('the agent ended'));
      this.pending.clear();
      for (const exit of this.exits) exit(code);
    };
    child.once('exit', ended);
    child.once('error', (error) => {
      this.options.log(`Warning: ACP agent could not start: ${error.message}`);
      ended(null);
    });
  }

  /** `session/update` notifications: their params, `{sessionId, update}`. */
  onUpdate(listener: (params: Record<string, unknown>) => void): void {
    this.listeners.add(listener);
  }

  onExit(listener: (code: number | null) => void): void {
    this.exits.add(listener);
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return Promise.reject(new Error('the agent is not running'));
    this.sequence += 1;
    const id = this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    const stdin = this.child?.stdin;
    if (stdin?.writable) stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  /** Closes stdin, so the agent leaves on its own (OpenCode does); killed when it has not after `graceMs`. */
  stop(graceMs = 3000): Promise<void> {
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, graceMs);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin?.end();
    });
  }

  private receive(line: string): void {
    let message: { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: { code?: unknown; message?: unknown; data?: { errorName?: unknown } } };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      return;
    }
    if (typeof message.method === 'string') {
      if (message.id !== undefined) this.answer(message.id, message.method);
      else if (message.method === 'session/update' && typeof message.params === 'object' && message.params !== null) {
        for (const listener of this.listeners) listener(message.params as Record<string, unknown>);
      }
      return;
    }
    const waiting = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
    if (!waiting) return;
    this.pending.delete(message.id as number);
    if (message.error) {
      const name = typeof message.error.data?.errorName === 'string' ? message.error.data.errorName : '';
      waiting.reject(new AcpError(typeof message.error.message === 'string' ? message.error.message.slice(0, 500) : 'failed', typeof message.error.code === 'number' ? message.error.code : 0, name));
    } else waiting.resolve(message.result);
  }

  /** Requests of the agent: every permission is refused, everything else is not offered. */
  private answer(id: unknown, method: string): void {
    const stdin = this.child?.stdin;
    if (!stdin?.writable) return;
    if (method === 'session/request_permission') {
      this.options.log('Warning: OpenCode asked for a permission its configuration should have decided; refused');
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result: { outcome: { outcome: 'cancelled' } } })}\n`);
    } else stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `${method} is not offered` } })}\n`);
  }
}

/** A select option of `session/new`'s `configOptions`, such as `model` or `effort`. */
interface ConfigOption {
  id?: unknown;
  currentValue?: unknown;
  options?: { value?: unknown; name?: unknown }[];
}

const optionOf = (options: unknown, id: string): ConfigOption | undefined => (Array.isArray(options) ? (options as ConfigOption[]).find((option) => option.id === id) : undefined);

/**
 * The models a session offers (`configOptions` id `model`, values `provider/model`) with the current one. Only the
 * current model's efforts are known (option `effort`, its variants), so only it lists them; "default" is the model's
 * own and stays out, as on the other routes.
 */
export function modelsOfSession(configOptions: unknown): { models: ModelOption[]; current: string | null; effort: string | null } {
  const model = optionOf(configOptions, 'model');
  const effort = optionOf(configOptions, 'effort');
  const current = typeof model?.currentValue === 'string' ? model.currentValue : null;
  const efforts = (effort?.options ?? []).map((option) => option.value).filter((value): value is string => typeof value === 'string' && value !== 'default' && /^[a-z0-9_-]{1,20}$/i.test(value)).slice(0, 12);
  const models = (model?.options ?? []).flatMap((option) => {
    if (typeof option.value !== 'string' || option.value.length === 0 || option.value.length > 80) return [];
    const name = typeof option.name === 'string' && option.name ? option.name.slice(0, 80) : option.value;
    return [{ id: option.value, name, efforts: option.value === current ? efforts : [] }];
  });
  const chosen = typeof effort?.currentValue === 'string' && efforts.includes(effort.currentValue) ? effort.currentValue : null;
  return { models, current, effort: chosen };
}

export type AcpEvent =
  | { type: 'textDelta'; text: string }
  | { type: 'text'; text: string }
  | { type: 'context'; used: number; size: number; cost: number | null }
  | { type: 'retry'; message: string };

/**
 * The text of a turn, from `session/update` notifications: message chunks stream as deltas, and each message, once
 * the next begins or the turn ends, as its whole text (as Claude Code's stream gives it). Thoughts and tool calls show
 * nothing: PartBuddy's gate proxy reports the tool calls itself.
 */
export class TurnText {
  private message: string | null = null;
  private text = '';
  private any = false;

  update(update: Record<string, unknown>): AcpEvent[] {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const content = update.content as { type?: unknown; text?: unknown } | undefined;
        if (content?.type !== 'text' || typeof content.text !== 'string') return [];
        const id = typeof update.messageId === 'string' ? update.messageId : this.message;
        const events: AcpEvent[] = id !== this.message ? this.flush() : [];
        // A further message of the same turn is a paragraph of its own.
        if (id !== this.message && this.any) events.push({ type: 'textDelta', text: '\n\n' });
        this.message = id;
        this.text += content.text;
        this.any = true;
        events.push({ type: 'textDelta', text: content.text });
        return events;
      }
      case 'usage_update': {
        const used = update.used;
        const size = update.size;
        if (typeof used !== 'number' || typeof size !== 'number' || !Number.isInteger(used) || !Number.isInteger(size) || used < 0 || size <= 0) return [];
        const amount = (update.cost as { amount?: unknown } | undefined)?.amount;
        return [{ type: 'context', used, size, cost: typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null }];
      }
      case 'session_info_update': {
        // A failed model call OpenCode tries again (e.g. a provider's rate limit): logged, the turn goes on.
        const retry = (update._meta as Record<string, unknown> | undefined)?.['opencode/retry'] as { error?: { message?: unknown } } | null | undefined;
        return retry && typeof retry.error?.message === 'string' ? [{ type: 'retry', message: retry.error.message.slice(0, 300) }] : [];
      }
      default:
        return [];
    }
  }

  /** The turn ended: the last message as a whole. */
  end(): AcpEvent[] {
    const events = this.flush();
    this.message = null;
    this.any = false;
    return events;
  }

  private flush(): AcpEvent[] {
    const text = this.text;
    this.text = '';
    return text ? [{ type: 'text', text }] : [];
  }
}

/**
 * The tokens of a prompt's answer (`usage` of the end-turn usage RFD). `inputTokens` leaves out what came from the cache
 * (OpenCode 2.3.2: 583 input, 18,218 cached read), so the cache counts are added, as on the other routes.
 */
export function promptTokens(result: unknown): TurnTokens | null {
  const usage = (result as { usage?: Record<string, unknown> } | null)?.usage;
  const count = (key: string) => (typeof usage?.[key] === 'number' && Number.isInteger(usage[key]) && usage[key] >= 0 ? usage[key] : 0);
  if (typeof usage?.inputTokens !== 'number') return null;
  return { requests: 0, input: count('inputTokens') + count('cachedReadTokens') + count('cachedWriteTokens'), cached: count('cachedReadTokens'), output: count('outputTokens'), reasoning: count('thoughtTokens') };
}

/**
 * Why a prompt failed, for the chat (usability U-04, U-05): signed out, a plan's or the free models' limit, or no
 * connection. ACP's `auth_required` is error -32000; OpenCode names the free limit "provider.free-limit".
 */
export function failureOf(error: Error): 'signedOut' | 'limit' | 'offline' | 'failed' {
  const name = error instanceof AcpError ? error.kind : '';
  const code = error instanceof AcpError ? error.code : 0;
  if (code === -32000 || /auth/i.test(name) || /authenticat|api key|unauthori[sz]ed|\b401\b/i.test(error.message)) return 'signedOut';
  if (/limit|quota/i.test(name) || /limit reached|usage limit|rate.?limit|quota|\b429\b/i.test(error.message)) return 'limit';
  if (/connection|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|getaddrinfo|network/i.test(error.message)) return 'offline';
  return 'failed';
}
