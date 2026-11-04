import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import type { ToolResult, UpstreamTool, UpstreamTools } from './gateProxy';

/**
 * SolidCraft's own MCP server, bridged to the running app (`solidcraft-cli mcp --connect`).
 * It reads the control token itself; PartBuddy never passes it on a command line.
 */
export class SolidCraftTools implements UpstreamTools {
  private client: Client | null = null;
  private tools: UpstreamTool[] | null = null;

  constructor(
    private readonly options: {
      /** Path of solidcraft.exe; the CLI lies next to it. */
      solidcraftExe: string;
      port: number;
      /** Folder SolidCraft may read and write files in (the user's projects). */
      allowPath: string;
      env: NodeJS.ProcessEnv;
    },
  ) {}

  async connect(): Promise<void> {
    if (this.client) return;
    const cli = join(dirname(this.options.solidcraftExe), process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli');
    const transport = new StdioClientTransport({
      command: cli,
      args: ['mcp', '--connect', `127.0.0.1:${this.options.port}`, '--allow-path', this.options.allowPath],
      env: Object.fromEntries(Object.entries(this.options.env).filter((e): e is [string, string] => typeof e[1] === 'string')),
      stderr: 'ignore',
    });
    const client = new Client({ name: 'partbuddy', version: '0.1.0' });
    await client.connect(transport);
    this.client = client;
  }

  instructions(): string | undefined {
    return this.client?.getInstructions();
  }

  async listTools(): Promise<UpstreamTool[]> {
    if (!this.client) throw new Error('SolidCraft tools are not connected');
    this.tools ??= (await this.client.listTools()).tools as UpstreamTool[];
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.client) throw new Error('SolidCraft tools are not connected');
    return (await this.client.callTool({ name, arguments: args }));
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.tools = null;
  }
}
