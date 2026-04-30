#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OmniaServer } from './server.js';
import {
  chromeApiToolSchema,
  cdpToolSchema,
  ChromeApiParamsSchema,
  CdpParamsSchema,
} from './tools.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function toResult(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) ?? 'undefined' }],
  };
}

export function toError(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

export function eventLog(event: { method: string; tabId: number }): string {
  return `[omnia] CDP event: ${event.method} tab=${event.tabId}`;
}

export function createMcpTools(mcp: McpServer, omnia: OmniaServer): void {
  mcp.tool(
    chromeApiToolSchema.name,
    chromeApiToolSchema.description,
    ChromeApiParamsSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const result = await omnia.callTool('chrome_api', {
          api: args.api,
          method: args.method,
          params: args.params as Record<string, unknown> | undefined,
        });
        return toResult(result);
      } catch (err) {
        return toError(err);
      }
    },
  );

  mcp.tool(
    cdpToolSchema.name,
    cdpToolSchema.description,
    CdpParamsSchema.shape,
    async (args): Promise<CallToolResult> => {
      try {
        const result = await omnia.callTool('cdp', {
          method: args.method,
          params: args.params as Record<string, unknown> | undefined,
          tabId: args.tabId,
        });
        return toResult(result);
      } catch (err) {
        return toError(err);
      }
    },
  );
}

export async function main(): Promise<void> {
  const WS_PORT = parseInt(process.env.OMNIA_WS_PORT || '3131', 10);
  const omnia = new OmniaServer(WS_PORT);
  const mcp = new McpServer({ name: 'omnia', version: '0.1.0' });

  createMcpTools(mcp, omnia);

  omnia.onEvent((event) => {
    process.stderr.write(eventLog(event) + '\n');
  });

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  process.stderr.write(`[omnia] WebSocket server listening on port ${WS_PORT}\n`);

  process.on('SIGINT', async () => {
    await omnia.shutdown();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await omnia.shutdown();
    process.exit(0);
  });
}

// Run server when executed directly
const isMainModule = process.argv[1]?.endsWith('/dist/index.js') || process.argv[1]?.endsWith('/index.ts');
if (isMainModule) {
  main();
}
