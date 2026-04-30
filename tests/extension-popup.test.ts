/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const onChangedListeners: ((changes: Record<string, unknown>) => void)[] = [];
const runtimeMessageListeners: ((msg: Record<string, unknown>) => void)[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _chrome = (globalThis as any).chrome as typeof chrome;

vi.mocked(_chrome.storage.local.get).mockResolvedValue({} as never);
vi.mocked(_chrome.storage.local.set).mockResolvedValue(undefined as never);
vi.mocked(_chrome.storage.onChanged.addListener).mockImplementation((fn) => {
  onChangedListeners.push(fn as (changes: Record<string, unknown>) => void);
});
vi.mocked(_chrome.runtime.onMessage.addListener).mockImplementation((fn) => {
  runtimeMessageListeners.push(fn as (msg: Record<string, unknown>) => void);
});
vi.mocked(_chrome.runtime.sendMessage).mockImplementation((msg, cb) => {
  if (typeof cb === 'function') (cb as (r: unknown) => void)({ status: 'connected' });
  return Promise.resolve({ status: 'connected' });
});

const getConfigFn = vi.fn().mockResolvedValue({ wsHost: '127.0.0.1', wsPort: 3131, cdpEnabled: false });
const setConfigFn = vi.fn().mockResolvedValue(undefined);
const getOplogFn = vi.fn().mockResolvedValue([]);
const clearOplogFn = vi.fn().mockResolvedValue(undefined);

vi.mock('../extension/src/storage.ts', () => ({
  getConfig: getConfigFn,
  setConfig: setConfigFn,
  getOplog: getOplogFn,
  appendOplog: vi.fn(),
  clearOplog: clearOplogFn,
}));

function setupDom() {
  document.body.innerHTML = `<div><div class="section-header">WebSocket Server</div><div class="ws-row"><input type="text" id="wsHost" placeholder="127.0.0.1"/><span>:</span><input type="number" id="wsPort" placeholder="3131"/></div></div><div><div class="section-header">Status</div><div class="status-row"><span class="status-dot disconnected" id="statusDot"></span><span id="statusText">Disconnected</span></div></div><div><label class="toggle"><input type="checkbox" id="cdpEnabled"/><span class="toggle-switch"></span>Enable CDP</label></div><div><div class="log-header"><span class="section-header">Operations</span><button id="clearLog">Clear</button></div><div id="log"><div class="empty-log">No operations yet</div></div></div>`;
}

describe('popup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    onChangedListeners.length = 0;
    runtimeMessageListeners.length = 0;
    getConfigFn.mockResolvedValue({ wsHost: '127.0.0.1', wsPort: 3131, cdpEnabled: false });
    getOplogFn.mockResolvedValue([]);
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

  it('updates status for connected', () => {
    for (const fn of runtimeMessageListeners) fn({ action: 'connectionStatus', status: 'connected' });
    expect((document.getElementById('statusDot') as HTMLSpanElement).className).toBe('status-dot connected');
    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Connected');
  });

  it('updates status for disconnected', () => {
    for (const fn of runtimeMessageListeners) fn({ action: 'connectionStatus', status: 'disconnected' });
    expect((document.getElementById('statusDot') as HTMLSpanElement).className).toBe('status-dot disconnected');
    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Disconnected');
  });

  it('updates status for connecting', () => {
    for (const fn of runtimeMessageListeners) fn({ action: 'connectionStatus', status: 'connecting' });
    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Connecting');
  });

  it('calls getStatus on init', async () => {
    await new Promise((r) => setTimeout(r, 50));
    expect(_chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'getStatus' }, expect.any(Function));
  });

  it('saves and reconnects on wsHost change', async () => {
    const wsHost = document.getElementById('wsHost') as HTMLInputElement;
    wsHost.value = '10.0.0.1';
    wsHost.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 50));
    expect(setConfigFn).toHaveBeenCalledWith(expect.objectContaining({ wsHost: '10.0.0.1' }));
  });

  it('saves CDP on checkbox change', async () => {
    const cdpCheck = document.getElementById('cdpEnabled') as HTMLInputElement;
    cdpCheck.checked = true;
    cdpCheck.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 50));
    expect(setConfigFn).toHaveBeenCalledWith({ cdpEnabled: true });
  });

  it('clears log on button click', async () => {
    const clearLogBtn = document.getElementById('clearLog') as HTMLButtonElement;
    clearLogBtn.dispatchEvent(new Event('click'));
    await new Promise((r) => setTimeout(r, 50));
    expect(clearOplogFn).toHaveBeenCalled();
  });

  it('renders log entries', async () => {
    getOplogFn.mockResolvedValue([{
      id: '1', timestamp: Date.now(), action: 'tabs.query',
      status: 'completed', summary: 'tabs.query',
    }]);
    for (const fn of onChangedListeners) fn({ omnia_oplog: { newValue: 'x', oldValue: 'y' } });
    await new Promise((r) => setTimeout(r, 100));
    const log = document.getElementById('log') as HTMLDivElement;
    expect(log.innerHTML).toContain('tabs.query');
  });

  it('handles loadStatus with runtime.lastError', async () => {
    _chrome.runtime.lastError = { message: 'context invalid' };
    vi.mocked(_chrome.runtime.sendMessage).mockImplementation((_msg, cb) => {
      if (typeof cb === 'function') (cb as (r: unknown) => void)(undefined);
      return Promise.resolve(undefined);
    });

    setupDom();
    await vi.resetModules();
    await import('../extension/src/popup.ts');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await new Promise((r) => setTimeout(r, 50));

    expect((document.getElementById('statusText') as HTMLSpanElement).textContent).toBe('Disconnected');
    _chrome.runtime.lastError = undefined;
  });
});
