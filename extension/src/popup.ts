/// <reference types="chrome" />

import { getConfig, setConfig, getOplog, clearOplog, type OplogEntry } from './storage.js';

let wsHostInput: HTMLInputElement;
let wsPortInput: HTMLInputElement;
let cdpCheckbox: HTMLInputElement;
let statusDot: HTMLSpanElement;
let statusText: HTMLSpanElement;
let logContainer: HTMLDivElement;
let clearLogBtn: HTMLButtonElement;

const MAX_LOG_ENTRIES = 100;

document.addEventListener('DOMContentLoaded', async () => {
  wsHostInput = document.getElementById('wsHost') as HTMLInputElement;
  wsPortInput = document.getElementById('wsPort') as HTMLInputElement;
  cdpCheckbox = document.getElementById('cdpEnabled') as HTMLInputElement;
  statusDot = document.getElementById('statusDot') as HTMLSpanElement;
  statusText = document.getElementById('statusText') as HTMLSpanElement;
  logContainer = document.getElementById('log') as HTMLDivElement;
  clearLogBtn = document.getElementById('clearLog') as HTMLButtonElement;

  await loadSettings();
  loadStatus();
  await renderLog();

  wsHostInput.addEventListener('change', saveAndReconnect);
  wsPortInput.addEventListener('change', saveAndReconnect);
  cdpCheckbox.addEventListener('change', saveCdp);
  clearLogBtn.addEventListener('click', handleClearLog);

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.omnia_oplog) renderLog();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'connectionStatus') {
      setStatus(msg.status);
    }
  });
});

async function loadSettings(): Promise<void> {
  const config = await getConfig();
  wsHostInput.value = config.wsHost;
  wsPortInput.value = String(config.wsPort);
  cdpCheckbox.checked = config.cdpEnabled;
}

async function saveSettings(): Promise<void> {
  const port = parseInt(wsPortInput.value, 10);
  await setConfig({
    wsHost: wsHostInput.value || '127.0.0.1',
    wsPort: Number.isNaN(port) ? 3131 : port,
  });
}

async function saveAndReconnect(): Promise<void> {
  await saveSettings();
  chrome.runtime.sendMessage({ action: 'reconnect' });
}

async function saveCdp(): Promise<void> {
  await setConfig({ cdpEnabled: cdpCheckbox.checked });
}

function loadStatus(): void {
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus('disconnected');
      return;
    }
    if (response?.status) {
      setStatus(response.status);
    }
  });
}

function setStatus(status: string): void {
  statusDot.className = `status-dot ${status}`;
  statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

async function renderLog(): Promise<void> {
  const entries = await getOplog();
  const recent = entries.slice(-MAX_LOG_ENTRIES).reverse();

  if (recent.length === 0) {
    logContainer.innerHTML = '<div class="empty-log">No operations yet</div>';
    return;
  }

  logContainer.innerHTML = recent
    .map(
      (e: OplogEntry) => `
    <div class="log-entry${e.status === 'failed' ? ' failed' : ''}">
      <span class="log-time">${formatTime(e.timestamp)}</span>
      <span class="log-status">${e.status === 'failed' ? '✗' : '✓'}</span>
      <span class="log-action">${escapeHtml(e.action)}</span>
      <span class="log-summary">${escapeHtml(e.summary)}</span>
    </div>`,
    )
    .join('');
}

async function handleClearLog(): Promise<void> {
  await clearOplog();
  await renderLog();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0') +
    ':' +
    String(d.getSeconds()).padStart(2, '0')
  );
}

function escapeHtml(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}
