/// <reference types="chrome" />

const STORAGE_KEYS = {
  wsHost: 'omnia_ws_host',
  wsPort: 'omnia_ws_port',
  cdpEnabled: 'omnia_cdp_enabled',
  oplog: 'omnia_oplog',
} as const;

export type OplogEntry = {
  id: string;
  timestamp: number;
  action: string;
  status: 'completed' | 'failed';
  summary: string;
  details?: Record<string, unknown>;
  error?: string;
};

export type Config = {
  wsHost: string;
  wsPort: number;
  cdpEnabled: boolean;
};

export async function getConfig(): Promise<Config> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.wsHost,
    STORAGE_KEYS.wsPort,
    STORAGE_KEYS.cdpEnabled,
  ]);
  return {
    wsHost: String(data[STORAGE_KEYS.wsHost] || '127.0.0.1'),
    wsPort: typeof data[STORAGE_KEYS.wsPort] === 'number' ? data[STORAGE_KEYS.wsPort] : 3131,
    cdpEnabled: data[STORAGE_KEYS.cdpEnabled] === true,
  };
}

export async function setConfig(
  config: Partial<{ wsHost: string; wsPort: number; cdpEnabled: boolean }>,
): Promise<void> {
  const items: Record<string, unknown> = {};
  if (config.wsHost !== undefined) items[STORAGE_KEYS.wsHost] = config.wsHost;
  if (config.wsPort !== undefined) items[STORAGE_KEYS.wsPort] = config.wsPort;
  if (config.cdpEnabled !== undefined) items[STORAGE_KEYS.cdpEnabled] = config.cdpEnabled;
  if (Object.keys(items).length > 0) {
    await chrome.storage.local.set(items);
  }
}

export async function getOplog(): Promise<OplogEntry[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.oplog);
  return (data[STORAGE_KEYS.oplog] as OplogEntry[]) || [];
}

export async function appendOplog(entry: OplogEntry): Promise<void> {
  const entries = await getOplog();
  entries.push(entry);
  while (entries.length > 200) entries.shift();
  await chrome.storage.local.set({ [STORAGE_KEYS.oplog]: entries });
}

export async function clearOplog(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.oplog]: [] });
}
