import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: vi.fn().mockImplementation(() => `mock-uuid-${++uuidCounter}`),
  getRandomValues: vi.fn(),
  subtle: {} as unknown as SubtleCrypto,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = MockWS;

let sendMessageCalls: { action: string; status?: string }[] = [];
const mockSendMessage = vi.fn().mockImplementation((msg: { action: string; status?: string }) => {
  sendMessageCalls.push(msg);
  return Promise.resolve();
});

const mockTabsQuery = vi.fn().mockResolvedValue([{ id: 1 }]);
const mockDebuggerCommand = vi.fn().mockResolvedValue({ result: 'ok' });

const mockChrome = {
  runtime: {
    id: 'test-ext-id',
    getManifest: undefined as unknown,
    sendMessage: mockSendMessage,
    onMessage: { addListener: vi.fn() },
    lastError: undefined as { message?: string } | undefined,
  },
  storage: {
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    onChanged: { addListener: vi.fn() },
  },
  debugger: {
    onEvent: { addListener: vi.fn() },
    sendCommand: mockDebuggerCommand,
  },
  tabs: { query: mockTabsQuery, create: vi.fn().mockResolvedValue({ id: 2 }), remove: vi.fn().mockResolvedValue(undefined) },
  windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
  cookies: { getAll: vi.fn().mockResolvedValue([]) },
  bookmarks: { getTree: vi.fn().mockResolvedValue([]) },
  history: { search: vi.fn().mockResolvedValue([]) },
  downloads: { search: vi.fn().mockResolvedValue([]) },
  browsingData: { remove: vi.fn().mockResolvedValue(undefined) },
  webNavigation: { getFrame: vi.fn().mockResolvedValue(null) },
  scripting: { executeScript: vi.fn().mockResolvedValue([{ result: 'ok' }]) },
} as unknown as typeof chrome;

vi.stubGlobal('chrome', mockChrome);

const { mockAppendOplog, configRef } = vi.hoisted(() => ({
  mockAppendOplog: vi.fn().mockResolvedValue(undefined as never),
  configRef: { wsHost: '127.0.0.1' as string, wsPort: 3131, cdpEnabled: true },
}));

vi.mock('../extension/src/storage.ts', () => ({
  getConfig: vi.fn().mockImplementation(() => Promise.resolve(configRef)),
  appendOplog: mockAppendOplog,
}));

let bg!: typeof import('../extension/src/background.ts');

beforeAll(async () => { bg = await import('../extension/src/background.ts'); });

beforeEach(() => {
  vi.clearAllMocks();
  mockAppendOplog.mockResolvedValue(undefined);
  uuidCounter = 0;
  sendMessageCalls = [];
  configRef.wsHost = '127.0.0.1';
  configRef.wsPort = 3131;
  configRef.cdpEnabled = true;
  mockTabsQuery.mockResolvedValue([{ id: 1 }]);
  mockDebuggerCommand.mockResolvedValue({ result: 'ok' });
});

afterAll(() => { vi.resetModules(); vi.unstubAllGlobals(); });

describe('getWsUrl', () => {
  it('builds URL', () => { expect(bg.getWsUrl({ wsHost: '127.0.0.1', wsPort: 3131 })).toBe('ws://127.0.0.1:3131'); });
  it('custom host', () => { expect(bg.getWsUrl({ wsHost: '10.0.0.1', wsPort: 7225 })).toBe('ws://10.0.0.1:7225'); });
});

describe('handleChromeApi', () => {
  it('query returns result', async () => {
    expect(await bg.handleChromeApi({ api: 'tabs', method: 'query' })).toEqual([{ id: 1 }]);
  });
  it('throws unknown namespace', async () => {
    await expect(bg.handleChromeApi({ api: 'bad', method: 'x' })).rejects.toThrow('Unknown chrome API namespace');
  });
  it('throws unknown method', async () => {
    await expect(bg.handleChromeApi({ api: 'tabs', method: 'bad' })).rejects.toThrow('Unknown method');
  });
  it('wraps thrown Error', async () => {
    mockTabsQuery.mockRejectedValueOnce(new Error('e'));
    await expect(bg.handleChromeApi({ api: 'tabs', method: 'query' })).rejects.toThrow('e');
  });
  it('wraps non-Error', async () => {
    mockTabsQuery.mockRejectedValueOnce('raw');
    await expect(bg.handleChromeApi({ api: 'tabs', method: 'query' })).rejects.toThrow('raw');
  });
});

describe('handleCdp', () => {
  it('sends command', async () => {
    expect(await bg.handleCdp({ method: 'Page.navigate', tabId: 5 })).toEqual({ result: 'ok' });
  });
  it('wraps error', async () => {
    mockDebuggerCommand.mockRejectedValueOnce(new Error('cdp err'));
    await expect(bg.handleCdp({ method: 'Page.navigate', tabId: 5 })).rejects.toThrow('cdp err');
  });
});

describe('getConnectionStatus', () => {
  it('initially disconnected', () => { expect(bg.getConnectionStatus()).toBe('disconnected'); });
});

describe('connect', () => {
  it('connects and reports connected', async () => {
    await bg.connect();
    await vi.waitFor(() => sendMessageCalls.length > 0, { timeout: 200 });
    expect(sendMessageCalls).toContainEqual({ action: 'connectionStatus', status: 'connected' });
    expect(bg.getConnectionStatus()).toBe('connected');
  });
});

describe('handleIncomingMessage', () => {
  async function connectFirst() { await bg.connect(); await vi.waitFor(() => sendMessageCalls.length > 0, { timeout: 200 }); }

  it('handles chrome_api request', async () => {
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'request', requestId: 'r1', tool: 'omnia_chrome_api', params: { api: 'tabs', method: 'query' } }));
    expect(mockAppendOplog).toHaveBeenCalledWith(expect.objectContaining({ action: 'chrome_api tabs.query', status: 'completed' }));
  });

  it('handles CDP request', async () => {
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'request', requestId: 'r2', tool: 'omnia_cdp', params: { method: 'Page.navigate', tabId: 5 } }));
    expect(mockAppendOplog).toHaveBeenCalledWith(expect.objectContaining({ action: 'cdp Page.navigate', status: 'completed' }));
  });

  it('logs failure', async () => {
    mockTabsQuery.mockRejectedValueOnce(new Error('fail'));
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'request', requestId: 'r3', tool: 'omnia_chrome_api', params: { api: 'tabs', method: 'query' } }));
    expect(mockAppendOplog).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', error: 'fail' }));
  });

  it('ignores non-request', async () => {
    await connectFirst();
    await bg.handleIncomingMessage(JSON.stringify({ type: 'garbage' }));
    expect(mockTabsQuery).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON', async () => {
    await connectFirst();
    await bg.handleIncomingMessage('not json');
    expect(mockTabsQuery).not.toHaveBeenCalled();
  });
});
