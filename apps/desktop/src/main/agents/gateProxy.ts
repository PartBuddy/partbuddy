import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';

import { Server, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

import { decide } from './policy';

/** A tool as the upstream MCP server lists it, passed through unchanged. */
export interface UpstreamTool {
  name: string;
  description?: string | undefined;
  inputSchema: { type: 'object'; [key: string]: unknown };
  annotations?: Record<string, unknown> | undefined;
}

export interface ToolResult {
  content: { type: string; [key: string]: unknown }[];
  isError?: boolean | undefined;
  [key: string]: unknown;
}

/** SolidCraft's MCP tools (or a test double). */
export interface UpstreamTools {
  instructions(): string | undefined;
  listTools(): Promise<UpstreamTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  /** Arguments, shortened for display; never contains PartBuddy secrets. */
  summary: string;
  decision: 'allowed' | 'denied';
  reason?: string;
  ok?: boolean;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * MCP server on 127.0.0.1 that an external agent (Claude Code) uses instead of SolidCraft's own
 * MCP server (ADR 0015). It lists SolidCraft's tools unchanged and runs every call through the
 * tool policy before forwarding it, so gates hold whatever the model decides. Each start gets a
 * random bearer token; requests without it, or for another host, are refused.
 */
export class GateProxy {
  private http: HttpServer | null = null;
  readonly token = randomBytes(32).toString('hex');
  port = 0;
  private sequence = 0;

  constructor(
    private readonly upstream: UpstreamTools,
    private readonly onCall: (record: ToolCallRecord) => void,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  async start(): Promise<void> {
    const http = createServer((request, response) => {
      void this.serve(request, response);
    });
    this.http = http;
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
    this.port = (http.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    const http = this.http;
    this.http = null;
    if (!http) return;
    http.closeAllConnections();
    await new Promise<void>((done) => http.close(() => done()));
  }

  private authorized(request: IncomingMessage): boolean {
    if (request.headers.host !== `127.0.0.1:${this.port}`) return false;
    const header = request.headers.authorization ?? '';
    const expected = Buffer.from(`Bearer ${this.token}`);
    const given = Buffer.from(header);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.authorized(request) || request.url?.split('?')[0] !== '/mcp') {
      response.writeHead(401).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    const method = request.method ?? 'GET';
    const webRequest = new Request(`http://127.0.0.1:${this.port}${request.url ?? '/mcp'}`, {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
    });

    // Stateless: one MCP server and transport per HTTP request.
    const server = this.createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    const webResponse = await transport.handleRequest(webRequest);
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
    if (webResponse.body) {
      Readable.fromWeb(webResponse.body).pipe(response);
    } else {
      response.end();
    }
  }

  // The low-level Server is the SDK's tool for advanced cases such as this proxy: it passes
  // SolidCraft's JSON schemas through unchanged, which the high-level McpServer cannot.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private createServer(): Server {
    const instructions = this.upstream.instructions();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const server = new Server(
      { name: 'partbuddy', version: '0.1.0' },
      { capabilities: { tools: {} }, ...(instructions ? { instructions } : {}) },
    );
    server.setRequestHandler('tools/list', async () => ({ tools: await this.upstream.listTools() }));
    server.setRequestHandler('tools/call', async (request) => {
      const name = request.params.name;
      const args = request.params.arguments ?? {};
      this.sequence += 1;
      const id = `call-${this.sequence}`;
      const summary = JSON.stringify(args).slice(0, 2000);
      const decision = decide(name, args);
      if (!decision.allow) {
        this.onCall({ id, name, summary, decision: 'denied', reason: decision.reason });
        return { content: [{ type: 'text' as const, text: decision.reason }], isError: true };
      }
      this.onCall({ id, name, summary, decision: 'allowed' });
      try {
        const result = await this.upstream.callTool(name, args);
        this.onCall({ id, name, summary, decision: 'allowed', ok: result.isError !== true });
        return result as never;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.onCall({ id, name, summary, decision: 'allowed', ok: false });
        return { content: [{ type: 'text' as const, text: `SolidCraft tool failed: ${message}` }], isError: true };
      }
    });
    return server;
  }
}
