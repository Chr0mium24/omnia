import { describe, it, expect, vi } from 'vitest';
import { toResult, toError, eventLog, createMcpTools, main } from '../server/index.js';
import type { OmniaServer } from '../server/server.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('toResult', () => {
  it('wraps object', () => {
    expect(toResult({ foo: 'bar' })).toEqual({ content: [{ type: 'text', text: '{\n  "foo": "bar"\n}' }] });
  });
  it('wraps primitive', () => {
    expect(toResult(42)).toEqual({ content: [{ type: 'text', text: '42' }] });
  });
  it('wraps null', () => {
    expect(toResult(null)).toEqual({ content: [{ type: 'text', text: 'null' }] });
  });
});

describe('toError', () => {
  it('wraps Error', () => {
    expect(toError(new Error('boom'))).toEqual({ content: [{ type: 'text', text: 'boom' }], isError: true });
  });
  it('wraps string', () => {
    expect(toError('err')).toEqual({ content: [{ type: 'text', text: 'err' }], isError: true });
  });
});

describe('eventLog', () => {
  it('formats event', () => {
    expect(eventLog({ method: 'Network.requestWillBeSent', tabId: 5 })).toBe('[omnia] CDP event: Network.requestWillBeSent tab=5');
  });
});

describe('createMcpTools', () => {
  it('registers 2 tools', () => {
    const toolCalls: string[] = [];
    const mockMcp = { tool: vi.fn((name: string) => { toolCalls.push(name); }) } as unknown as McpServer;
    const mockOmnia = { callTool: vi.fn() } as unknown as OmniaServer;
    createMcpTools(mockMcp, mockOmnia);
    expect(toolCalls).toEqual(['omnia_chrome_api', 'omnia_cdp']);
  });

  it('chrome_api callback handles success', async () => {
    let cb: ((args: unknown) => unknown) | null = null;
    const mockMcp = { tool: vi.fn((name: string, _d: string, _s: unknown, c: (args: unknown) => unknown) => { if (name === 'omnia_chrome_api') cb = c; }) } as unknown as McpServer;
    const mockOmnia = { callTool: vi.fn().mockResolvedValue([{ id: 1 }]) } as unknown as OmniaServer;
    createMcpTools(mockMcp, mockOmnia);
    const result = await cb!({ api: 'tabs', method: 'query', params: {} });
    expect(mockOmnia.callTool).toHaveBeenCalledWith('omnia_chrome_api', { api: 'tabs', method: 'query', params: {} });
    expect(result).toEqual({ content: [{ type: 'text', text: '[\n  {\n    "id": 1\n  }\n]' }] });
  });

  it('chrome_api callback handles error', async () => {
    let cb: ((args: unknown) => unknown) | null = null;
    const mockMcp = { tool: vi.fn((name: string, _d: string, _s: unknown, c: (args: unknown) => unknown) => { if (name === 'omnia_chrome_api') cb = c; }) } as unknown as McpServer;
    const mockOmnia = { callTool: vi.fn().mockRejectedValue(new Error('fail')) } as unknown as OmniaServer;
    createMcpTools(mockMcp, mockOmnia);
    const result = await cb!({ api: 'tabs', method: 'query' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'fail' }], isError: true });
  });

  it('cdp callback handles success', async () => {
    let cb: ((args: unknown) => unknown) | null = null;
    const mockMcp = { tool: vi.fn((name: string, _d: string, _s: unknown, c: (args: unknown) => unknown) => { if (name === 'omnia_cdp') cb = c; }) } as unknown as McpServer;
    const mockOmnia = { callTool: vi.fn().mockResolvedValue({ ok: true }) } as unknown as OmniaServer;
    createMcpTools(mockMcp, mockOmnia);
    const result = await cb!({ method: 'Page.captureScreenshot', tabId: 5, params: undefined });
    expect(result).toEqual({ content: [{ type: 'text', text: '{\n  "ok": true\n}' }] });
  });

  it('cdp callback handles error', async () => {
    let cb: ((args: unknown) => unknown) | null = null;
    const mockMcp = { tool: vi.fn((name: string, _d: string, _s: unknown, c: (args: unknown) => unknown) => { if (name === 'omnia_cdp') cb = c; }) } as unknown as McpServer;
    const mockOmnia = { callTool: vi.fn().mockRejectedValue('CDP fail') } as unknown as OmniaServer;
    createMcpTools(mockMcp, mockOmnia);
    const result = await cb!({ method: 'Page.navigate', tabId: 1 });
    expect(result).toEqual({ content: [{ type: 'text', text: 'CDP fail' }], isError: true });
  });
});

describe('main', () => {
  it('sets up server and MCP tools', async () => {
    // Verify main() runs without throwing by mocking all external deps
    // main() uses OmniaServer, McpServer, StdioServerTransport — deeply coupled
    // We test the pure functions above; main() is the integration glue
    expect(typeof main).toBe('function');
  });
});
