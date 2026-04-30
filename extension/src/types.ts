import type { OmniaRequestMessage, OmniaResponseMessage, ChromeApiCallParams, CdpCallParams, ToolParams, ToolName } from '../../server/types.js';

export type { OmniaRequestMessage, OmniaResponseMessage, ChromeApiCallParams, CdpCallParams, ToolParams, ToolName };

export function isChromeApiParams(params: ToolParams): params is ChromeApiCallParams {
  return 'api' in params;
}

export function isCdpParams(params: ToolParams): params is CdpCallParams {
  return 'method' in params && 'tabId' in params;
}

export function formatSummary(tool: ToolName, params: ToolParams): string {
  if (tool === 'chrome_api' && isChromeApiParams(params)) {
    const { api, method, params: p } = params;
    const firstArg = p && Array.isArray(p) && p.length > 0 && typeof p[0] === 'object' && p[0] !== null ? p[0] as Record<string, unknown> : null;
    if (method === 'create' && firstArg && 'url' in firstArg) return `${api}.${method} ${firstArg.url}`;
    if (method === 'remove' && firstArg && 'tabId' in firstArg) return `${api}.${method} tab ${firstArg.tabId}`;
    if (method === 'query') return `${api}.${method}`;
    if (method === 'executeScript') return `${api}.${method}`;
    return `${api}.${method}`;
  }
  if (tool === 'cdp' && isCdpParams(params)) {
    return `${params.method} tab ${params.tabId}`;
  }
  return 'unknown';
}
