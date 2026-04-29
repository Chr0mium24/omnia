/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const storageGet = vi.fn().mockResolvedValue({});
const storageSet = vi.fn().mockResolvedValue(undefined);
const onChangedListeners: ((changes: Record<string, unknown>) => void)[] = [];
const runtimeMessageListeners: ((msg: Record<string, unknown>) => void)[] = [];

const mockChrome = {
  runtime: {
    id: 'test-ext-id',
    sendMessage: vi.fn().mockImplementation((msg: Record<string, unknown>, cb?: (r: unknown) => undefined) => {
      if (cb) cb({ status: 'connected' });
      return Promise.resolve({ status: 'connected' });
    }),
    onMessage: { addListener: vi.fn().mockImplementation((fn: (msg: Record<string, unknown>) => void) => { runtimeMessageListeners.push(fn); }) },
    lastError: undefined as { message?: string } | undefined,
  },
  storage: {
    local: { get: storageGet, set: storageSet },
    onChanged: { addListener: vi.fn().mockImplementation((fn: (c: Record<string, unknown>) => void) => { onChangedListeners.push(fn); }) },
  },
};

vi.stubGlobal('chrome', mockChrome);

vi.mock('../extension/src/storage.ts', () => ({
  getConfig: vi.fn().mockImplementation(() => Promise.resolve({ wsHost: '127.0.0.1', wsPort: 3131, cdpEnabled: false })),
  setConfig: vi.fn().mockResolvedValue(undefined),
  getOplog: vi.fn().mockResolvedValue([]),
  appendOplog: vi.fn(),
  clearOplog: vi.fn().mockResolvedValue(undefined),
}));

function setupDom() {
  document.body.innerHTML = `<div><div class="section-header">WebSocket Server</div><div class="ws-row"><input type="text" id="wsHost" placeholder="127.0.0.1"/><span>:</span><input type="number" id="wsPort" placeholder="3131"/></div></div><div><div class="section-header">Status</div><div class="status-row"><span class="status-dot disconnected" id="statusDot"></span><span id="statusText">Disconnected</span></div></div><div><label class="toggle"><input type="checkbox" id="cdpEnabled"/><span class="toggle-switch"></span>Enable CDP</label></div><div><div class="log-header"><span class="section-header">Operations</span><button id="clearLog">Clear</button></div><div id="log"><div class="empty-log">No operations yet</div></div></div>`;
}

describe('popup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    onChangedListeners.length = 0;
    runtimeMessageListeners.length = 0;
    storageGet.mockResolvedValue({});
    setupDom();
    await vi.resetModules();
    await import('../extension/src/popup.ts');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  it('loads default settings', () => {
    expect((document.getElementById('wsHost') as HTMLInputElement).value).toBe('127.0.0.1');
    expect((document.getElementById('wsPort') as HTMLInputElement).value).toBe('3131');
    expect((document.getElementById('cdpEnabled') as HTMLInputElement).checked).toBe(false);
  });

  it('updates status display for connected', () => {
    for (const fn of runtimeMessageListeners) fn({ action: 'connectionStatus', status: 'connected' });
    expect((document.getElementById('statusDot') as HTMLSpanElement).className).toBe('status-dot connected');
    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Connected');
  });

  it('updates status display for disconnected', () => {
    for (const fn of runtimeMessageListeners) fn({ action: 'connectionStatus', status: 'disconnected' });
    expect((document.getElementById('statusDot') as HTMLSpanElement).className).toBe('status-dot disconnected');
    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Disconnected');
  });

  it('updates status display for connecting', () => {
    for (const fn of runtimeMessageListeners) fn({ action: 'connectionStatus', status: 'connecting' });
    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Connecting');
  });

  it('calls getStatus on init', async () => {
    await new Promise((r) => setTimeout(r, 50));
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'getStatus' }, expect.any(Function));
  });
});
