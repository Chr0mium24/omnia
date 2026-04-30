import { z } from 'zod';

export const chromeApiNamespaces = [
  'tabs',
  'windows',
  'scripting',
  'cookies',
  'bookmarks',
  'history',
  'downloads',
  'storage',
  'browsingData',
  'runtime',
  'debugger',
  'webNavigation',
] as const;

export const ChromeApiParamsSchema = z.object({
  api: z.enum(chromeApiNamespaces).describe('The chrome.* API namespace'),
  method: z
    .string()
    .describe('Method name (e.g. create, query, get, update, remove, executeScript)'),
  params: z
    .object({})
    .passthrough()
    .optional()
    .describe('Arguments to pass to the chrome API method call'),
});

export const CdpParamsSchema = z.object({
  method: z
    .string()
    .describe(
      'CDP method (e.g. Page.navigate, Network.enable, Runtime.evaluate, Page.captureScreenshot)',
    ),
  params: z.object({}).passthrough().optional().describe('CDP params object'),
  tabId: z.number().int().positive().describe('Chrome tab ID to target'),
});

export const chromeApiToolSchema = {
  name: 'chrome_api' as const,
  description:
    'Call any chrome.* extension API directly. ' +
    'Use "api" for namespace (tabs, windows, scripting, cookies, bookmarks, history, downloads, storage, browsingData, runtime, debugger, webNavigation), ' +
    '"method" for function name, and optional "params" for the method arguments.',
};

export const cdpToolSchema = {
  name: 'cdp' as const,
  description:
    'Send any Chrome DevTools Protocol command via chrome.debugger. ' +
    'All CDP domains are available: Page, Network, Runtime, DOM, CSS, Input, Emulation, Performance, Accessibility, Storage, Debugger, etc. ' +
    'CDP events are forwarded from the extension as cdp_event messages.',
};
