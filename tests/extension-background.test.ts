import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock crypto.randomUUID before any imports
vi.stubGlobal('crypto', {
  randomUUID: vi.fn().mockReturnValue('606e8a83-2a46-47cb-9e36-2f60b5d3c965'),
  getRandomValues: vi.fn(),
  subtle: {} as unknown as SubtleCrypto,
});

// Mock chrome APIs before any imports
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
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
  debugger: {
    onEvent: {
      addListener: vi.fn(),
    },
    sendCommand: vi.fn().mockResolvedValue({}),
  },
};

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1 as const;
  static CLOSED = 3 as const;
  readyState: number;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
    // Trigger onopen on next tick to let handlers register
    queueMicrotask(() => this.onopen?.());
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
  }
}

vi.stubGlobal('chrome', mockChrome);
vi.stubGlobal('WebSocket', MockWebSocket);

// Must be set before any module imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).chrome = mockChrome;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = MockWebSocket;

// Mock storage module
vi.mock('../extension/src/storage.js', () => ({
  getConfig: vi.fn().mockResolvedValue({ wsHost: '127.0.0.1', wsPort: 3131, cdpEnabled: true }),
  appendOplog: vi.fn().mockResolvedValue(undefined),
}));

let getWsUrl: (c: { wsHost: string; wsPort: number }) => string;
let getConnectionStatus: () => 'connected' | 'disconnected' | 'connecting';

beforeAll(async () => {
  const mod = await import('../extension/src/background.js');
  getWsUrl = mod.getWsUrl;
  getConnectionStatus = mod.getConnectionStatus;
});

afterAll(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('background', () => {
  describe('getWsUrl', () => {
    it('builds correct WebSocket URL', () => {
      expect(getWsUrl({ wsHost: '127.0.0.1', wsPort: 3131 })).toBe('ws://127.0.0.1:3131');
    });

    it('builds URL with custom host and port', () => {
      expect(getWsUrl({ wsHost: '192.168.1.1', wsPort: 7225 })).toBe('ws://192.168.1.1:7225');
    });
  });

  describe('getConnectionStatus', () => {
    it('returns disconnected initially', () => {
      expect(getConnectionStatus()).toBe('disconnected');
    });
  });
});
