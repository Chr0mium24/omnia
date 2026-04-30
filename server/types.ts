export type OmniaRequestMessage = {
  type: 'response';
  requestId: string;
  result?: unknown;
  error?: string;
} | {
  type: 'request';
  requestId: string;
  tool: 'chrome_api' | 'cdp';
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
  params?: unknown[];
};

export type CdpCallParams = {
  method: string;
  params?: Record<string, unknown>;
  tabId: number;
};

export type ToolName = 'chrome_api' | 'cdp';

export type ToolParams = ChromeApiCallParams | CdpCallParams;
