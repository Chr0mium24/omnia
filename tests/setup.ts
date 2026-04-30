import { vi } from 'vitest';

// Mock crypto
vi.stubGlobal('crypto', {
  randomUUID: vi.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
  getRandomValues: vi.fn(),
  subtle: {} as unknown as SubtleCrypto,
});

// Mock WebSocket
class MockWS {
  static OPEN = 1 as const;
  static CLOSED = 3 as const;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    queueMicrotask(() => this.onopen?.());
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; queueMicrotask(() => this.onclose?.()); }
}
vi.stubGlobal('WebSocket', MockWS);

// Mock chrome globals — individual test files extend these
const defaultChrome = {
  runtime: {
    id: 'test-ext-id',
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: { addListener: vi.fn() },
    getManifest: undefined as unknown,
    lastError: undefined as { message?: string } | undefined,
  },
  storage: {
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    onChanged: { addListener: vi.fn() },
  },
  debugger: {
    onEvent: { addListener: vi.fn() },
    sendCommand: vi.fn().mockResolvedValue({}),
  },
  tabs: { query: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn() },
  windows: { getCurrent: vi.fn() },
  cookies: { getAll: vi.fn() },
  bookmarks: { getTree: vi.fn() },
  history: { search: vi.fn() },
  downloads: { search: vi.fn() },
  browsingData: { remove: vi.fn() },
  webNavigation: { getFrame: vi.fn() },
  scripting: { executeScript: vi.fn() },
};

vi.stubGlobal('chrome', defaultChrome);
