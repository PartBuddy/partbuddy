import { connect, type Socket } from 'node:net';

/**
 * Client for SolidCraft's control channel: JSON lines on 127.0.0.1, token on the first request,
 * replies by id, events without id (SolidCraft 0.30.1 docs/control-protocol.md). The channel is
 * treated as untrusted input: lines are size-limited and parsed defensively.
 */

/** SolidCraft's own limit for a line; replies with large exports stay far below it. */
const MAX_LINE_BYTES = 16 * 1024 * 1024;

export class ControlError extends Error {
  constructor(
    message: string,
    readonly kind: 'refused' | 'unauthorized' | 'busy' | 'running' | 'timeout' | 'closed' | 'protocol',
  ) {
    super(message);
    this.name = 'ControlError';
  }
}

export interface ControlEvent {
  event: string;
  params: unknown;
}

interface Pending {
  resolve(result: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export interface ConnectOptions {
  port: number;
  token: string;
  host?: string;
  /** Time to open the socket. */
  connectTimeoutMs?: number;
}

export class ControlClient {
  private nextId = 1;
  private buffer = '';
  private authenticated = false;
  private closed = false;
  private readonly pending = new Map<number, Pending>();
  private readonly eventListeners = new Set<(event: ControlEvent) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();

  private constructor(
    private readonly socket: Socket,
    private readonly token: string,
  ) {
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.on('data', (chunk: string) => {
      this.receive(chunk);
    });
    socket.on('error', (error) => {
      this.shutdown(error.message);
    });
    socket.on('close', () => {
      this.shutdown('connection closed');
    });
  }

  static open(options: ConnectOptions): Promise<ControlClient> {
    const { port, token, host = '127.0.0.1', connectTimeoutMs = 3000 } = options;
    return new Promise((resolve, reject) => {
      const socket = connect({ port, host });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new ControlError(`no answer on ${host}:${port}`, 'refused'));
      }, connectTimeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.removeAllListeners('error');
        resolve(new ControlClient(socket, token));
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(new ControlError(error.message, 'refused'));
      });
    });
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** Sends one request and resolves with its `result`; rejects with a ControlError otherwise. */
  request<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 70_000): Promise<T> {
    if (this.closed) return Promise.reject(new ControlError('connection closed', 'closed'));
    const id = this.nextId;
    this.nextId += 1;
    const message: Record<string, unknown> = { id, method, params };
    // The token goes with the first request only; it is never logged.
    if (!this.authenticated) message.token = this.token;
    this.authenticated = true;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ControlError(`${method}: no reply within ${timeoutMs} ms`, 'timeout'));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve, reject, timer });
      this.socket.write(`${JSON.stringify(message)}\n`);
    });
  }

  onEvent(listener: (event: ControlEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onClose(listener: (reason: string) => void): () => void {
    if (this.closed) {
      listener('connection closed');
      return () => undefined;
    }
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    this.socket.end();
    this.shutdown('closed by PartBuddy');
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > MAX_LINE_BYTES) {
      this.socket.destroy();
      this.shutdown('reply line too large');
      return;
    }
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.dispatch(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    const record = message as Record<string, unknown>;
    if (typeof record.event === 'string') {
      for (const listener of this.eventListeners) listener({ event: record.event, params: record.params });
      return;
    }
    const id = record.id;
    const entry = typeof id === 'number' ? this.pending.get(id) : undefined;
    if (!entry || typeof id !== 'number') {
      // SolidCraft answers a refused first line without our id and then closes.
      if (record.ok === false && typeof record.error === 'string') this.failAll(record.error);
      return;
    }
    this.pending.delete(id);
    clearTimeout(entry.timer);
    if (record.ok === true) {
      entry.resolve(record.result);
      return;
    }
    entry.reject(toError(record));
  }

  private failAll(error: string): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(toError({ error }));
      this.pending.delete(id);
    }
  }

  private shutdown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new ControlError(reason, 'closed'));
    }
    this.pending.clear();
    for (const listener of this.closeListeners) listener(reason);
    this.closeListeners.clear();
    this.eventListeners.clear();
  }
}

function toError(record: Record<string, unknown>): ControlError {
  const text = typeof record.error === 'string' ? record.error : 'request failed';
  if (text.startsWith('unauthorized')) return new ControlError(text, 'unauthorized');
  if (record.busy === true) return new ControlError(text, 'busy');
  if (record.running === true) return new ControlError(text, 'running');
  return new ControlError(text, 'refused');
}
