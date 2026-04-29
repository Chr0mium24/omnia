import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome.storage API before imports
const storageData: Record<string, unknown> = {};

function storageGet(keys: string[] | string): Promise<Record<string, unknown>> {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const result: Record<string, unknown> = {};
  for (const k of keyList) {
    if (k in storageData) result[k] = storageData[k];
  }
  return Promise.resolve(result);
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  for (const [k, v] of Object.entries(items)) {
    storageData[k] = v;
  }
  return Promise.resolve();
}

function storageClear(): void {
  for (const key of Object.keys(storageData)) {
    Reflect.deleteProperty(storageData, key);
  }
}

const mockChrome = {
  runtime: {
    id: 'test-ext-id',
    getManifest: undefined as unknown,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: undefined as { message?: string } | undefined,
  },
  storage: {
    local: {
      get: vi.fn(storageGet),
      set: vi.fn(storageSet),
    },
  },
  debugger: {
    onEvent: {
      addListener: vi.fn(),
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = mockChrome;

// Now import the module under test
import { getConfig, setConfig, getOplog, appendOplog, clearOplog, type OplogEntry } from '../extension/src/storage.js';

describe('storage', () => {
  beforeEach(() => {
    storageClear();
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('returns defaults when nothing stored', async () => {
      const config = await getConfig();
      expect(config.wsHost).toBe('127.0.0.1');
      expect(config.wsPort).toBe(3131);
      expect(config.cdpEnabled).toBe(false);
    });

    it('returns stored values', async () => {
      storageData['omnia_ws_host'] = '192.168.1.100';
      storageData['omnia_ws_port'] = 7225;
      storageData['omnia_cdp_enabled'] = true;

      const config = await getConfig();
      expect(config.wsHost).toBe('192.168.1.100');
      expect(config.wsPort).toBe(7225);
      expect(config.cdpEnabled).toBe(true);
    });

    it('handles non-number port storage value', async () => {
      storageData['omnia_ws_port'] = 'not-a-number';

      const config = await getConfig();
      expect(config.wsPort).toBe(3131); // fallback default
    });

    it('handles non-boolean cdpEnabled', async () => {
      storageData['omnia_cdp_enabled'] = 'yes';

      const config = await getConfig();
      expect(config.cdpEnabled).toBe(false); // not === true
    });
  });

  describe('setConfig', () => {
    it('stores wsHost', async () => {
      await setConfig({ wsHost: '10.0.0.1' });
      const config = await getConfig();
      expect(config.wsHost).toBe('10.0.0.1');
    });

    it('stores wsPort', async () => {
      await setConfig({ wsPort: 8080 });
      const config = await getConfig();
      expect(config.wsPort).toBe(8080);
    });

    it('stores cdpEnabled', async () => {
      await setConfig({ cdpEnabled: true });
      const config = await getConfig();
      expect(config.cdpEnabled).toBe(true);
    });

    it('stores multiple fields at once', async () => {
      await setConfig({ wsHost: 'a', wsPort: 1, cdpEnabled: true });
      const config = await getConfig();
      expect(config.wsHost).toBe('a');
      expect(config.wsPort).toBe(1);
      expect(config.cdpEnabled).toBe(true);
    });

    it('does nothing with empty config', async () => {
      await setConfig({});
      // Should not throw
    });
  });

  describe('getOplog', () => {
    it('returns empty array when nothing stored', async () => {
      const entries = await getOplog();
      expect(entries).toEqual([]);
    });

    it('returns stored entries', async () => {
      const entries: OplogEntry[] = [
        { id: '1', timestamp: 1000, action: 'tabs.query', status: 'completed', summary: 'tabs.query' },
      ];
      storageData['omnia_oplog'] = entries;

      const result = await getOplog();
      expect(result).toEqual(entries);
    });
  });

  describe('appendOplog', () => {
    it('adds an entry', async () => {
      const entry: OplogEntry = {
        id: 'a',
        timestamp: 100,
        action: 'tabs.create',
        status: 'completed',
        summary: 'tabs.create https://x.com',
      };

      await appendOplog(entry);
      const entries = await getOplog();

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('a');
    });

    it('appends multiple entries in order', async () => {
      await appendOplog(makeEntry('1', 100));
      await appendOplog(makeEntry('2', 200));
      await appendOplog(makeEntry('3', 300));

      const entries = await getOplog();
      expect(entries).toHaveLength(3);
      expect(entries[0].id).toBe('1');
      expect(entries[1].id).toBe('2');
      expect(entries[2].id).toBe('3');
    });

    it('trims to 200 entries', async () => {
      // Add 250 entries
      for (let i = 0; i < 250; i++) {
        await appendOplog(makeEntry(String(i), i));
      }

      const entries = await getOplog();
      expect(entries).toHaveLength(200);
      // Oldest should be trimmed — first entry should be #50
      expect(entries[0].id).toBe('50');
      // Last entry should be #249
      expect(entries[199].id).toBe('249');
    });
  });

  describe('clearOplog', () => {
    it('clears all entries', async () => {
      await appendOplog(makeEntry('1', 100));
      await appendOplog(makeEntry('2', 200));

      await clearOplog();

      const entries = await getOplog();
      expect(entries).toEqual([]);
    });

    it('is safe to call on empty log', async () => {
      await clearOplog();
      const entries = await getOplog();
      expect(entries).toEqual([]);
    });
  });
});

function makeEntry(id: string, timestamp: number): OplogEntry {
  return {
    id,
    timestamp,
    action: 'tabs.query',
    status: 'completed',
    summary: 'tabs.query',
  };
}
