/// <reference types="chrome" />

import { getConfig, appendOplog, type Config } from './storage.js';
import {
  type OmniaRequestMessage,
  type ChromeApiCallParams,
  type CdpCallParams,
  type ToolParams,
  formatSummary,
} from './types.js';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getWsUrl(config: Pick<Config, 'wsHost' | 'wsPort'>): string {
  return `ws://${config.wsHost}:${config.wsPort}`;
}

export async function connect(): Promise<void> {
  const config = await getConfig();
  const url = getWsUrl(config);

  if (ws) {
    ws.onclose = null;
    ws.onopen = null;
    ws.onerror = null;
    ws.onmessage = null;
    ws.close();
    ws = null;
  }

  ws = new WebSocket(url);

  ws.onopen = () => {
    broadcastStatus('connected');
    clearReconnectTimer();
  };

  ws.onclose = () => {
    broadcastStatus('disconnected');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    broadcastStatus('disconnected');
  };

  ws.onmessage = async (event) => {
    await handleIncomingMessage(event.data as string);
  };
}

export async function handleIncomingMessage(data: string): Promise<void> {
  try {
    const msg: OmniaRequestMessage = JSON.parse(data);
    if (msg.type !== 'request') return;

    let result: unknown;
    try {
      result = await handleToolCall(msg.tool, msg.params);
      await logOperation(msg.tool, 'completed', msg.params);
      sendResponse(msg.requestId, { result });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await logOperation(msg.tool, 'failed', msg.params, error);
      sendResponse(msg.requestId, { error });
    }
  } catch {
    // JSON parse error — ignore malformed messages
  }
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  broadcastStatus('connecting');
  reconnectTimer = setTimeout(connect, 2000);
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
  if (ws?.readyState === WebSocket.OPEN) return 'connected';
  if (reconnectTimer) return 'connecting';
  return 'disconnected';
}

function broadcastStatus(status: 'connected' | 'disconnected' | 'connecting'): void {
  chrome.runtime.sendMessage({ action: 'connectionStatus', status }).catch(() => {
    // Popup may not be open, ignore
  });
}

async function handleToolCall(tool: 'omnia_chrome_api' | 'omnia_cdp', params: ToolParams): Promise<unknown> {
  if (tool === 'omnia_chrome_api') {
    return handleChromeApi(params as ChromeApiCallParams);
  }
  return handleCdp(params as CdpCallParams);
}

export async function handleChromeApi(params: ChromeApiCallParams): Promise<unknown> {
  const apiObj = (chrome as Record<string, unknown>)[params.api];
  if (!apiObj || typeof apiObj !== 'object') {
    throw new Error(`Unknown chrome API namespace: ${params.api}`);
  }
  const apiObject = apiObj as Record<string, unknown>;
  const methodFn = apiObject[params.method];
  if (typeof methodFn !== 'function') {
    throw new Error(`Unknown method: ${params.api}.${params.method}`);
  }
  try {
    return await (methodFn as (p: Record<string, unknown>) => Promise<unknown>)(params.params || {});
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

export async function handleCdp(params: CdpCallParams): Promise<unknown> {
  try {
    return await chrome.debugger.sendCommand(
      { tabId: params.tabId },
      params.method,
      params.params || {},
    );
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
}

function sendResponse(requestId: string, payload: { result?: unknown; error?: string }): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'response', requestId, ...payload }));
}

function logOperation(
  tool: 'omnia_chrome_api' | 'omnia_cdp',
  status: 'completed' | 'failed',
  params: ToolParams,
  error?: string,
): Promise<void> {
  return appendOplog({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    action: tool === 'omnia_chrome_api'
      ? `chrome_api ${(params as ChromeApiCallParams).api}.${(params as ChromeApiCallParams).method}`
      : `cdp ${(params as CdpCallParams).method}`,
    status,
    summary: formatSummary(tool, params),
    error,
  });
}

// Forward CDP events from chrome.debugger to the MCP server
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      type: 'cdp_event',
      tabId: source.tabId,
      method,
      params,
    }),
  );
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'getStatus') {
    sendResponse({ status: getConnectionStatus() });
    return true;
  }
  if (msg.action === 'reconnect') {
    connect().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

// Initial connection (only in extension context, not test)
if (typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function') {
  connect();
}
