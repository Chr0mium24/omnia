import { describe, it, expect, vi } from 'vitest';
import { toResult, toError, eventLog, createMcpTools, main } from '../server/index.js';
import type { OmniaServer } from '../server/server.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('toResult', () => {
  it('wraps object', () => expect(toResult({ foo: 'bar' })).toEqual({ content: [{ type: 'text', text: '{\n  "foo": "bar"\n}' }] }));
  it('wraps primitive', () => expect(toResult(42)).toEqual({ content: [{ type: 'text', text: '42' }] }));
  it('wraps null', () => expect(toResult(null)).toEqual({ content: [{ type: 'text', text: 'null' }] }));
  it('wraps string', () => expect(toResult('hello')).toEqual({ content: [{ type: 'text', text: '"hello"' }] }));
  it('wraps array', () => expect(toResult([1, 2]).content[0].text).toBe('[\n  1,\n  2\n]'));
  it('wraps undefined', () => expect(toResult(undefined)).toEqual({ content: [{ type: 'text', text: 'undefined' }] }));
});

describe('toError', () => {
  it('wraps Error', () => expect(toError(new Error('boom'))).toEqual({ content: [{ type: 'text', text: 'boom' }], isError: true }));
  it('wraps string', () => expect(toError('err')).toEqual({ content: [{ type: 'text', text: 'err' }], isError: true }));
  it('wraps number', () => expect(toError(404)).toEqual({ content: [{ type: 'text', text: '404' }], isError: true }));
  it('wraps object', () => expect(toError({ msg: 'x' })).toEqual({ content: [{ type: 'text', text: '[object Object]' }], isError: true }));
});

describe('eventLog', () => {
  it('formats event', () => {
    expect(eventLog({ method: 'Network.requestWillBeSent', tabId: 5 })).toBe('[omnia] CDP event: Network.requestWillBeSent tab=5');
    expect(eventLog({ method: 'Page.loadEventFired', tabId: 42 })).toBe('[omnia] CDP event: Page.loadEventFired tab=42');
  });
});

describe('createMcpTools', () => {
  it('registers both tools', () => {
    const names: string[] = [];
    const mck = { tool: vi.fn((n: string) => names.push(n)) } as unknown as McpServer;
    const omn = { callTool: vi.fn() } as unknown as OmniaServer;
    createMcpTools(mck, omn);
    expect(names).toEqual(['omnia_chrome_api', 'omnia_cdp']);
  });

  it('chrome_api success callback', async () => {
    let cb: ((a: unknown) => unknown) | null = null;
    const mck = { tool: vi.fn((n: string, _d: unknown, _s: unknown, c: unknown) => { if (n === 'omnia_chrome_api') cb = c as (a: unknown) => unknown; }) } as unknown as McpServer;
    const omn = { callTool: vi.fn().mockResolvedValue([{ id: 1 }]) } as unknown as OmniaServer;
    createMcpTools(mck, omn);
    const r = await cb!({ api: 'tabs', method: 'query' });
    expect(r).toEqual({ content: [{ type: 'text', text: '[\n  {\n    "id": 1\n  }\n]' }] });
  });

  it('chrome_api error callback', async () => {
    let cb: ((a: unknown) => unknown) | null = null;
    const mck = { tool: vi.fn((n: string, _d: unknown, _s: unknown, c: unknown) => { if (n === 'omnia_chrome_api') cb = c as (a: unknown) => unknown; }) } as unknown as McpServer;
    const omn = { callTool: vi.fn().mockRejectedValue(new Error('fail')) } as unknown as OmniaServer;
    createMcpTools(mck, omn);
    expect(await cb!({ api: 'tabs', method: 'query' })).toEqual({ content: [{ type: 'text', text: 'fail' }], isError: true });
  });

  it('cdp success callback', async () => {
    let cb: ((a: unknown) => unknown) | null = null;
    const mck = { tool: vi.fn((n: string, _d: unknown, _s: unknown, c: unknown) => { if (n === 'omnia_cdp') cb = c as (a: unknown) => unknown; }) } as unknown as McpServer;
    const omn = { callTool: vi.fn().mockResolvedValue({ ok: true }) } as unknown as OmniaServer;
    createMcpTools(mck, omn);
    expect(await cb!({ method: 'Page.captureScreenshot', tabId: 5 })).toEqual({ content: [{ type: 'text', text: '{\n  "ok": true\n}' }] });
  });

  it('cdp error callback', async () => {
    let cb: ((a: unknown) => unknown) | null = null;
    const mck = { tool: vi.fn((n: string, _d: unknown, _s: unknown, c: unknown) => { if (n === 'omnia_cdp') cb = c as (a: unknown) => unknown; }) } as unknown as McpServer;
    const omn = { callTool: vi.fn().mockRejectedValue('CDP fail') } as unknown as OmniaServer;
    createMcpTools(mck, omn);
    expect(await cb!({ method: 'Page.navigate', tabId: 1 })).toEqual({ content: [{ type: 'text', text: 'CDP fail' }], isError: true });
  });
});

describe('main integration', () => {
  it('completes without throwing', async () => {
    await expect(main()).resolves.toBeUndefined();
  });

  it('reads OMNIA_WS_PORT environment variable', async () => {
    const origPort = process.env.OMNIA_WS_PORT;
    process.env.OMNIA_WS_PORT = '9999';
    try {
      await main();
      // main() writes WS port to stderr — just verify no crash
    } finally {
      process.env.OMNIA_WS_PORT = origPort;
    }
  });
});
