import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import type { ToolResult, UpstreamTool, UpstreamTools } from '../agents/gateProxy';
import type { ControlRequester } from './mirror';

/**
 * SolidCraft without a window (ADR 0016): `solidcraft-cli mcp --headless` runs the engine as an
 * MCP server on stdio, and PartBuddy's own view is the only viewport. PartBuddy is the only client,
 * so every change passes through `tools.callTool`; after each call the engine's revision is read
 * and a change is reported, which takes the place of the window's `design.changed` event.
 */

/** Rebuilds of large parts take minutes; the SDK's default request timeout is one minute. */
const LONG_TIMEOUT_MS = 10 * 60 * 1000;
const SHORT_TIMEOUT_MS = 30_000;
const CLOSE_WAIT_MS = 3000;

export interface Revision {
  documentId: string;
  revision: number;
}

export interface HeadlessOptions {
  /** Path of solidcraft-cli.exe. */
  cli: string;
  /** Folders SolidCraft may read and write: the user's projects, the mirror cache, the designs folder. */
  allowPaths: string[];
  /** Design file to open, or none for a new design. */
  design?: string | undefined;
  env: NodeJS.ProcessEnv;
}

interface BatchBody {
  completed?: unknown;
  ok?: unknown;
  results?: unknown;
  failed?: { index: number; command: string; error: string };
}

function textOf(result: ToolResult): string {
  const part = result.content.find((entry) => entry.type === 'text');
  return typeof part?.text === 'string' ? part.text : '';
}

/** The JSON body of a tool answer; SolidCraft answers every tool with one JSON text part. */
function bodyOf(result: ToolResult): unknown {
  const text = textOf(result);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (result.isError) throw new Error(text.slice(0, 500) || 'SolidCraft refused the request');
    throw new Error('SolidCraft answered with no JSON');
  }
}

export class HeadlessEngine {
  private readonly changeListeners = new Set<(revision: Revision) => void>();
  private readonly closeListeners = new Set<(reason: string) => void>();
  private last: Revision | null = null;
  private closed = false;

  private constructor(private readonly client: Client) {}

  /** Starts the engine and waits for the MCP handshake; rejects when the process exits first. */
  static async start(options: HeadlessOptions): Promise<HeadlessEngine> {
    const args = ['mcp', '--headless'];
    // SolidCraft leaves out allowed folders that do not exist yet, so they are made first.
    for (const path of options.allowPaths) {
      mkdirSync(path, { recursive: true });
      args.push('--allow-path', path);
    }
    if (options.design) args.push('--in', options.design);
    const transport = new StdioClientTransport({
      command: options.cli,
      args,
      env: Object.fromEntries(Object.entries(options.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      stderr: 'ignore',
    });
    const client = new Client({ name: 'partbuddy', version: '0.1.0' });
    await client.connect(transport);
    const engine = new HeadlessEngine(client);
    client.onclose = () => {
      engine.shutdown('SolidCraft (headless) ended');
    };
    engine.last = await engine.revision();
    return engine;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  onChange(listener: (revision: Revision) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onClose(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /** The revision PartBuddy knows; no request. */
  current(): Revision | null {
    return this.last;
  }

  async revision(): Promise<Revision> {
    const body = await this.batch([{ command: 'document.revision', params: {} }], SHORT_TIMEOUT_MS);
    const head = (Array.isArray(body.results) ? body.results[0] : null) as { document_id?: unknown; revision?: unknown } | null;
    if (typeof head?.document_id !== 'string' || typeof head.revision !== 'number') throw new Error('document.revision returned no revision');
    return { documentId: head.document_id, revision: head.revision };
  }

  /**
   * Reads the revision after a call that may have changed the design, and tells the listeners
   * when it moved. `quiet` records it without telling (PartBuddy's own autosave).
   */
  async checkForChange(quiet = false): Promise<void> {
    if (this.closed) return;
    const next = await this.revision();
    const moved = this.last?.documentId !== next.documentId || this.last.revision !== next.revision;
    this.last = next;
    if (moved && !quiet) for (const listener of this.changeListeners) listener(next);
  }

  /** The mirror's view of the engine: the same two requests the control channel answers. */
  readonly requester: ControlRequester = {
    request: async <T>(method: string, params: Record<string, unknown> = {}, timeoutMs = LONG_TIMEOUT_MS): Promise<T> => {
      if (method === 'document.inspect') {
        const body = await this.batch([{ command: 'document.inspect', params }], timeoutMs);
        if (body.failed) throw new Error(`document.inspect failed: ${body.failed.error}`);
        return (Array.isArray(body.results) ? body.results[0] : {}) as T;
      }
      if (method === 'engine.batch') {
        // Paths are limited by --allow-path when the engine starts, not per request.
        const commands = (params.commands ?? []) as { command: string; params: Record<string, unknown> }[];
        return (await this.batch(commands, timeoutMs, params.rollback === true)) as T;
      }
      throw new Error(`${method} is not available without the SolidCraft window`);
    },
  };

  /** SolidCraft's tools for the assistant; after every call PartBuddy looks for a new revision. */
  readonly tools: UpstreamTools = {
    instructions: () => this.client.getInstructions(),
    listTools: async (): Promise<UpstreamTool[]> => (await this.client.listTools()).tools,
    callTool: async (name, args) => {
      try {
        return await this.client.callTool({ name, arguments: args }, { timeout: LONG_TIMEOUT_MS });
      } finally {
        await this.checkForChange().catch(() => undefined);
      }
    },
  };

  /** Saves the design to `path` (PartBuddy's autosave; not offered to the assistant). */
  async save(path: string): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    const result = (await this.client.callTool({ name: 'save', arguments: { path } }, { timeout: LONG_TIMEOUT_MS })) as ToolResult;
    if (result.isError) throw new Error(textOf(result).slice(0, 500) || 'save failed');
    // Saving moves the revision; nothing in the design changed, so nobody needs to mirror.
    await this.checkForChange(true);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    // A slicer started from SolidCraft (B8) inherits its pipes and keeps them open after the engine
    // ends, so closing does not wait for them longer than a moment.
    await Promise.race([this.client.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, CLOSE_WAIT_MS))]);
    this.shutdown('closed');
  }

  private shutdown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.closeListeners) listener(reason);
  }

  private async batch(
    commands: { command: string; params: Record<string, unknown> }[],
    timeoutMs: number,
    rollback = false,
  ): Promise<BatchBody> {
    const result = (await this.client.callTool({ name: 'batch', arguments: { commands, rollback } }, { timeout: timeoutMs })) as ToolResult;
    const body = bodyOf(result);
    if (typeof body !== 'object' || body === null) throw new Error('batch returned no result');
    return body;
  }
}

const UNTITLED = 'Untitled';

/** A design name reduced to a safe file name: letters, digits, spaces, `_` and `-` (no separators, no traversal). */
export function safeDesignFileName(designName: string): string {
  const safe = designName
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 80);
  return safe || UNTITLED;
}

/** True when `file` lies inside `folder` (after resolving `..` and separators). */
export function isInside(folder: string, file: string): boolean {
  const rel = relative(resolve(folder), resolve(file));
  // `....name.sc` is a file inside; only a `..` segment leaves the folder.
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
