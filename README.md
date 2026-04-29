# Omnia

MCP server + Chrome extension that exposes **all** Chrome extension APIs and the full Chrome DevTools Protocol (CDP) to AI agents via the Model Context Protocol.

## How it works

```
AI Agent ──stdio──▶ MCP Server ──WebSocket──▶ Chrome Extension ──▶ Browser
                        ▲                              │
                        │      (SSH reverse tunnel)    │
                        └──────────────────────────────┘
```

## Features

- **`omnia_chrome_api(api, method, params)`** — Call any `chrome.*` API directly (tabs, windows, cookies, bookmarks, history, downloads, scripting, debugger, webNavigation, browsingData, runtime, storage)
- **`omnia_cdp(method, params, tabId)`** — Send any Chrome DevTools Protocol command (Page, Network, Runtime, DOM, CSS, Input, Emulation, Performance, Accessibility, Storage, Debugger…)
- **CDP event forwarding** — Network requests, console logs, and other CDP events streamed back

## Architecture

| Component | Tech | Role |
|-----------|------|------|
| MCP Server | Node.js + TypeScript | WebSocket server, MCP stdio transport, tool routing |
| Chrome Extension | Manifest V3 + TypeScript + esbuild | WebSocket client, chrome.* / CDP executor, popup UI |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build server + extension
npm run build

# 3. Load the extension in Chrome
#    Go to chrome://extensions → Load unpacked → Select omnia/extension/

# 4. Configure OpenCode
# In ~/.config/opencode/mcp.json:
{
  "mcp": {
    "omnia": {
      "type": "local",
      "command": ["node", "dist/index.js"]
    }
  }
}
```

## Cross-machine setup

Extension WebSocket client connects to the MCP server's IP:

1. Linux runs `npm run dev` (or `node dist/index.js`)
2. Mac loads extension, sets WS host to Linux IP in popup

Or use SSH reverse tunnel:

```bash
ssh -R 3131:localhost:3131 mac-ip
```

## CLI

```bash
npx omnia        # Run MCP server
```

Environment variables:
- `OMNIA_WS_PORT` (default: `3131`) — WebSocket server port

## Dev

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript check
npm run test       # Vitest
npm run build      # Build server + extension
```
