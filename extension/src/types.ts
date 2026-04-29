import type { OmniaRequestMessage, OmniaResponseMessage } from '../../server/types.js';

export type { OmniaRequestMessage, OmniaResponseMessage };

export type ToolName = 'omnia_chrome_api' | 'omnia_cdp';

export type ChromeApiCallParams = {
  api: string;
  method: string;
  params?: Record<string, unknown>;
};

export type CdpCallParams = {
  method: string;
  params?: Record<string, unknown>;
  tabId: number;
};

export type ToolParams = ChromeApiCallParams | CdpCallParams;

export function isChromeApiParams(params: ToolParams): params is ChromeApiCallParams {
  return 'api' in params;
}

export function isCdpParams(params: ToolParams): params is CdpCallParams {
  return 'method' in params && 'tabId' in params;
}

export function formatSummary(tool: ToolName, params: ToolParams): string {
  if (tool === 'omnia_chrome_api' && isChromeApiParams(params)) {
    const { api, method, params: p } = params;
    if (method === 'create' && p && typeof p === 'object' && 'url' in p) return `${api}.${method} ${p.url}`;
    if (method === 'remove' && p && typeof p === 'object' && 'tabId' in p) return `${api}.${method} tab ${p.tabId}`;
    if (method === 'query') return `${api}.${method}`;
    if (method === 'executeScript') return `${api}.${method}`;
    return `${api}.${method}`;
  }
  if (tool === 'omnia_cdp' && isCdpParams(params)) {
    return `${params.method} tab ${params.tabId}`;
  }
  return 'unknown';
}
