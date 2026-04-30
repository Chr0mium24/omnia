import { describe, it, expect } from 'vitest';
import {
  ChromeApiParamsSchema,
  CdpParamsSchema,
  chromeApiNamespaces,
  chromeApiToolSchema,
  cdpToolSchema,
} from '../server/tools.js';

describe('ChromeApiParamsSchema', () => {
  it('parses valid minimal input', () => {
    const result = ChromeApiParamsSchema.parse({ api: 'tabs', method: 'query' });
    expect(result.api).toBe('tabs');
    expect(result.method).toBe('query');
    expect(result.params).toBeUndefined();
  });

  it('parses input with optional params', () => {
    const result = ChromeApiParamsSchema.parse({ api: 'tabs', method: 'create', params: [{ url: 'https://example.com' }] });
    expect(result.api).toBe('tabs');
    expect(result.method).toBe('create');
    expect(result.params).toEqual([{ url: 'https://example.com' }]);
  });

  it('allows all known namespaces', () => {
    for (const ns of chromeApiNamespaces) {
      const result = ChromeApiParamsSchema.parse({ api: ns, method: 'query' });
      expect(result.api).toBe(ns);
    }
  });

  it('rejects unknown namespace', () => {
    expect(() => ChromeApiParamsSchema.parse({ api: 'frobnicate', method: 'wobble' })).toThrow();
  });

  it('requires api', () => {
    expect(() => ChromeApiParamsSchema.parse({ method: 'query' })).toThrow();
  });

  it('requires method', () => {
    expect(() => ChromeApiParamsSchema.parse({ api: 'tabs' })).toThrow();
  });

  it('rejects non-string method', () => {
    expect(() => ChromeApiParamsSchema.parse({ api: 'tabs', method: 123 })).toThrow();
  });
});

describe('CdpParamsSchema', () => {
  it('parses valid input', () => {
    const result = CdpParamsSchema.parse({ method: 'Page.navigate', tabId: 5 });
    expect(result.method).toBe('Page.navigate');
    expect(result.tabId).toBe(5);
  });

  it('parses input with optional params', () => {
    const result = CdpParamsSchema.parse({ method: 'Page.navigate', tabId: 1, params: { url: 'https://example.com' } });
    expect(result.method).toBe('Page.navigate');
    expect(result.tabId).toBe(1);
    expect(result.params).toEqual({ url: 'https://example.com' });
  });

  it('requires method', () => {
    expect(() => CdpParamsSchema.parse({ tabId: 1 })).toThrow();
  });

  it('requires tabId', () => {
    expect(() => CdpParamsSchema.parse({ method: 'Page.navigate' })).toThrow();
  });

  it('rejects non-number tabId', () => {
    expect(() => CdpParamsSchema.parse({ method: 'Page.navigate', tabId: 'abc' })).toThrow();
  });

  it('rejects zero tabId', () => {
    expect(() => CdpParamsSchema.parse({ method: 'Page.navigate', tabId: 0 })).toThrow();
  });

  it('rejects negative tabId', () => {
    expect(() => CdpParamsSchema.parse({ method: 'Page.navigate', tabId: -1 })).toThrow();
  });
});

describe('tool schema definitions', () => {
  it('chromeApiToolSchema has correct name', () => {
    expect(chromeApiToolSchema.name).toBe('chrome_api');
  });

  it('chromeApiToolSchema has description', () => {
    expect(chromeApiToolSchema.description).toBeTruthy();
    expect(chromeApiToolSchema.description).toContain('chrome.*');
  });

  it('cdpToolSchema has correct name', () => {
    expect(cdpToolSchema.name).toBe('cdp');
  });

  it('cdpToolSchema has description', () => {
    expect(cdpToolSchema.description).toBeTruthy();
    expect(cdpToolSchema.description).toContain('CDP');
  });
});
