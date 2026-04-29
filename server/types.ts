export type OmniaRequestMessage = {
  type: 'response';
  requestId: string;
  result?: unknown;
  error?: string;
} | {
  type: 'request';
  requestId: string;
  tool: 'omnia_chrome_api' | 'omnia_cdp';
  params: ChromeApiCallParams | CdpCallParams;
};

export type OmniaResponseMessage = {
  type: 'response';
  requestId: string;
  result?: unknown;
  error?: string;
};

export type OmniaEventMessage = {
  type: 'cdp_event';
  tabId: number;
  method: string;
  params: unknown;
};

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

export type ToolName = 'omnia_chrome_api' | 'omnia_cdp';

export type ToolParams = ChromeApiCallParams | CdpCallParams;
