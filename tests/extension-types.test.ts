import { describe, it, expect } from 'vitest';
import {
  isChromeApiParams,
  isCdpParams,
  formatSummary,
  type ChromeApiCallParams,
  type CdpCallParams,
} from '../extension/src/types.js';

describe('isChromeApiParams', () => {
  it('returns true for ChromeApiCallParams', () => {
    expect(isChromeApiParams({ api: 'tabs', method: 'query' })).toBe(true);
    expect(isChromeApiParams({ api: 'windows', method: 'create', params: { url: 'x' } })).toBe(true);
  });

  it('returns false for CdpCallParams', () => {
    expect(isChromeApiParams({ method: 'Page.navigate', tabId: 1 })).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isChromeApiParams({} as ChromeApiCallParams)).toBe(false);
  });
});

describe('isCdpParams', () => {
  it('returns true for CdpCallParams', () => {
    expect(isCdpParams({ method: 'Page.navigate', tabId: 1 })).toBe(true);
    expect(isCdpParams({ method: 'Network.enable', tabId: 5, params: {} })).toBe(true);
  });

  it('returns false for ChromeApiCallParams', () => {
    expect(isCdpParams({ api: 'tabs', method: 'query' })).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isCdpParams({} as CdpCallParams)).toBe(false);
  });

  it('returns false when tabId missing', () => {
    expect(isCdpParams({ method: 'Page.navigate' } as CdpCallParams)).toBe(false);
  });

  it('returns false when method missing', () => {
    expect(isCdpParams({ tabId: 1 } as CdpCallParams)).toBe(false);
  });
});

describe('formatSummary', () => {
  describe('omnia_chrome_api', () => {
    it('formats tabs.create with URL', () => {
      const result = formatSummary('omnia_chrome_api', {
        api: 'tabs',
        method: 'create',
        params: { url: 'https://example.com', active: true },
      });
      expect(result).toBe('tabs.create https://example.com');
    });

    it('formats tabs.create without URL param', () => {
      const result = formatSummary('omnia_chrome_api', { api: 'tabs', method: 'create' });
      expect(result).toBe('tabs.create');
    });

    it('formats tabs.remove with tabId', () => {
      const result = formatSummary('omnia_chrome_api', {
        api: 'tabs',
        method: 'remove',
        params: { tabId: 42 },
      });
      expect(result).toBe('tabs.remove tab 42');
    });

    it('formats tabs.remove without tabId param', () => {
      const result = formatSummary('omnia_chrome_api', { api: 'tabs', method: 'remove' });
      expect(result).toBe('tabs.remove');
    });

    it('formats tabs.query', () => {
      const result = formatSummary('omnia_chrome_api', { api: 'tabs', method: 'query' });
      expect(result).toBe('tabs.query');
    });

    it('formats tabs.executeScript', () => {
      const result = formatSummary('omnia_chrome_api', { api: 'tabs', method: 'executeScript' });
      expect(result).toBe('tabs.executeScript');
    });

    it('formats generic chrome API', () => {
      const result = formatSummary('omnia_chrome_api', { api: 'bookmarks', method: 'getTree' });
      expect(result).toBe('bookmarks.getTree');
    });

    it('formats with params containing URL as non-object', () => {
      const result = formatSummary('omnia_chrome_api', {
        api: 'tabs',
        method: 'create',
        params: 'invalid' as unknown as Record<string, unknown>,
      });
      expect(result).toBe('tabs.create');
    });
  });

  describe('omnia_cdp', () => {
    it('formats CDP command with tabId', () => {
      const result = formatSummary('omnia_cdp', { method: 'Page.navigate', tabId: 5 });
      expect(result).toBe('Page.navigate tab 5');
    });

    it('formats Network.enable', () => {
      const result = formatSummary('omnia_cdp', { method: 'Network.enable', tabId: 3 });
      expect(result).toBe('Network.enable tab 3');
    });
  });

  describe('edge cases', () => {
    it('returns "unknown" for chrome_api with non-ChromeApiCallParams', () => {
      const result = formatSummary('omnia_chrome_api', { method: 'x', tabId: 1 } as unknown as ChromeApiCallParams);
      expect(result).toBe('unknown');
    });

    it('returns "unknown" for cdp with non-CdpCallParams', () => {
      const result = formatSummary('omnia_cdp', { api: 'x', method: 'x' } as unknown as CdpCallParams);
      expect(result).toBe('unknown');
    });
  });
});
