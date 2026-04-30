import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Access globally-mocked chrome from setup.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _chrome = (globalThis as any).chrome as typeof chrome;

// Override addListener at module level to capture callbacks
let cdpListenerFn: ((...args: unknown[]) => void) | null = null;
let msgListenerFn: ((...args: unknown[]) => void) | null = null;

vi.mocked(_chrome.debugger.onEvent.addListener).mockImplementation((fn) => {
  cdpListenerFn = fn as (...args: unknown[]) => void;
});
vi.mocked(_chrome.runtime.onMessage.addListener).mockImplementation((fn) => {
  msgListenerFn = fn as (...args: unknown[]) => void;
});

let sendCalls: { action: string; status?: string }[] = [];
vi.mocked(_chrome.runtime.sendMessage).mockImplementation((msg, cb) => {
  sendCalls.push(msg as unknown as { action: string; status?: string });
  if (typeof cb === 'function') (cb as (r: unknown) => void)({ status: 'connected' });
  return Promise.resolve({ status: 'connected' });
});

vi.mocked(_chrome.tabs.query).mockResolvedValue([{ id: 1 }] as never);
vi.mocked(_chrome.debugger.sendCommand).mockResolvedValue({ result: 'ok' } as never);

const { mockAppendOplog, configRef } = vi.hoisted(() => ({
  mockAppendOplog: vi.fn().mockResolvedValue(undefined as never),
  configRef: { wsHost: '127.0.0.1' as string, wsPort: 3131, cdpEnabled: true },
}));

vi.mock('../extension/src/storage.ts', () => ({
  getConfig: vi.fn().mockImplementation(() => Promise.resolve(configRef)),
  appendOplog: mockAppendOplog,
}));

let bg!: typeof import('../extension/src/background.ts');

beforeAll(async () => {
  bg = await import('../extension/src/background.ts');
});

beforeEach(() => {
  sendCalls = [];
  configRef.wsHost = '127.0.0.1';
  configRef.wsPort = 3131;
  configRef.cdpEnabled = true;
  mockAppendOplog.mockReset();
  mockAppendOplog.mockResolvedValue(undefined);
  vi.mocked(_chrome.tabs.query).mockResolvedValue([{ id: 1 }] as never);
  vi.mocked(_chrome.debugger.sendCommand).mockResolvedValue({ result: 'ok' } as never);
});

afterAll(() => { vi.resetModules(); vi.unstubAllGlobals(); });

describe('getWsUrl', () => {
  it('builds URL', () => { expect(bg.getWsUrl({ wsHost: '127.0.0.1', wsPort: 3131 })).toBe('ws://127.0.0.1:3131'); });
  it('custom host', () => { expect(bg.getWsUrl({ wsHost: '10.0.0.1', wsPort: 7225 })).toBe('ws://10.0.0.1:7225'); });
});

describe('handleChromeApi', () => {
  it('query', async () => { expect(await bg.handleChromeApi({ api: 'tabs', method: 'query' })).toEqual([{ id: 1 }]); });
  it('throws unknown namespace', async () => { await expect(bg.handleChromeApi({ api: 'bad', method: 'x' })).rejects.toThrow('Unknown chrome API namespace'); });
  it('throws unknown method', async () => { await expect(bg.handleChromeApi({ api: 'tabs', method: 'bad' })).rejects.toThrow('Unknown method'); });
  it('wraps Error', async () => {
    vi.mocked(_chrome.tabs.query).mockRejectedValueOnce(new Error('e'));
    await expect(bg.handleChromeApi({ api: 'tabs', method: 'query' })).rejects.toThrow('e');
  });
  it('wraps non-Error', async () => {
    vi.mocked(_chrome.tabs.query).mockRejectedValueOnce('raw');
    await expect(bg.handleChromeApi({ api: 'tabs', method: 'query' })).rejects.toThrow('raw');
  });
});

describe('handleCdp', () => {
  it('sends command', async () => { expect(await bg.handleCdp({ method: 'Page.navigate', tabId: 5 })).toEqual({ result: 'ok' }); });
  it('wraps error', async () => {
    vi.mocked(_chrome.debugger.sendCommand).mockRejectedValueOnce(new Error('cdp err'));
    await expect(bg.handleCdp({ method: 'Page.navigate', tabId: 5 })).rejects.toThrow('cdp err');
  });
});

describe('getConnectionStatus', () => {
  it('initially disconnected', () => { expect(bg.getConnectionStatus()).toBe('disconnected'); });
});

describe('connect', () => {
  it('connects and reports connected', async () => {
    await bg.connect();
    await vi.waitFor(() => sendCalls.length > 0, { timeout: 200 });
    expect(sendCalls).toContainEqual({ action: 'connectionStatus', status: 'connected' });
    expect(bg.getConnectionStatus()).toBe('connected');
  });
});

describe('handleIncomingMessage', () => {
  async function connectFirst() { await bg.connect(); await vi.waitFor(() => sendCalls.length > 0, { timeout: 200 }); }

  it('chrome_api request', async () => {
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'request', requestId: 'r1', tool: 'omnia_chrome_api', params: { api: 'tabs', method: 'query' } }));
    expect(mockAppendOplog).toHaveBeenCalledWith(expect.objectContaining({ action: 'chrome_api tabs.query', status: 'completed' }));
  });

  it('CDP request', async () => {
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'request', requestId: 'r2', tool: 'omnia_cdp', params: { method: 'Page.navigate', tabId: 5 } }));
    expect(mockAppendOplog).toHaveBeenCalledWith(expect.objectContaining({ action: 'cdp Page.navigate', status: 'completed' }));
  });

  it('failure log', async () => {
    vi.mocked(_chrome.tabs.query).mockRejectedValueOnce(new Error('fail'));
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'request', requestId: 'r3', tool: 'omnia_chrome_api', params: { api: 'tabs', method: 'query' } }));
    expect(mockAppendOplog).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'fail' }));
  });

  it('ignores non-request', async () => {
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'garbage' }));
    expect(mockAppendOplog).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON', async () => {
    await connectFirst();
    await bg.handleIncomingMessage('not json');
    expect(mockAppendOplog).not.toHaveBeenCalled();
  });
});

describe('CDP event forwarding', () => {
  it('call CDP event listener', async () => {
    await bg.connect();
    await vi.waitFor(() => sendCalls.length > 0, { timeout: 200 });

    expect(cdpListenerFn).not.toBeNull();
    // Call the captured listener — should forward event to ws
    cdpListenerFn!({ tabId: 5 }, 'Network.requestWillBeSent', { requestId: 'r1' });
  });
});

describe('popup message handling', () => {
  it('getStatus responds', async () => {
    expect(msgListenerFn).not.toBeNull();
    const result = await new Promise((r) => msgListenerFn!({ action: 'getStatus' }, {}, r));
    expect(result).toEqual({ status: 'connected' });
  });

  it('reconnect responds', async () => {
    const result = await new Promise((r) => msgListenerFn!({ action: 'reconnect' }, {}, r));
    expect(result).toEqual({ ok: true });
  });

  it('unknown action returns false', () => {
    expect(msgListenerFn!({ action: 'unknown' }, {}, vi.fn())).toBe(false);
  });
});
