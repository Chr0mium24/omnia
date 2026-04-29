import { WebSocket, WebSocketServer } from 'ws';
import type {
  OmniaRequestMessage,
  OmniaResponseMessage,
  OmniaEventMessage,
  ToolName,
  ToolParams,
} from './types.js';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type EventHandler = (event: Omit<OmniaEventMessage, 'type'>) => void;

const DEFAULT_REQUEST_TIMEOUT = 30_000; // 30 seconds

export class OmniaServer {
  private wss: WebSocketServer;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers: EventHandler[] = [];
  private requestTimeout: number;

  constructor(port: number, opts?: { requestTimeout?: number }) {
    this.requestTimeout = opts?.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  get clientCount(): number {
    return this.wss.clients.size;
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  async callTool(tool: ToolName, params: ToolParams): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();

      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      this.pending.set(requestId, { resolve, reject, timer });

      const message: OmniaRequestMessage & { type: 'request' } = {
        type: 'request',
        requestId,
        tool,
        params,
      };

      const payload = JSON.stringify(message);
      let sent = false;

      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
          sent = true;
        }
      }

      if (!sent) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error('No connected extension'));
      }
    });
  }

  async shutdown(): Promise<void> {
    // Reject all pending
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Server shutting down'));
      this.pending.delete(id);
    }

    this.eventHandlers = [];

    // Close all client connections
    for (const client of this.wss.clients) {
      client.close();
    }

    return new Promise((resolve) => this.wss.close(() => resolve()));
  }

  private onConnection(ws: WebSocket): void {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'response') {
          this.handleResponse(msg as OmniaResponseMessage);
        } else if (msg.type === 'cdp_event') {
          this.handleEvent(msg as OmniaEventMessage);
        }
      } catch {
        // Ignore invalid JSON messages
      }
    });

    ws.on('error', () => {
      // Connection errors are handled by the ws library
    });
  }

  private handleResponse(msg: OmniaResponseMessage): void {
    const entry = this.pending.get(msg.requestId);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(msg.requestId);

    if (msg.error) {
      entry.reject(new Error(msg.error));
    } else {
      entry.resolve(msg.result);
    }
  }

  private handleEvent(msg: OmniaEventMessage): void {
    const event = { tabId: msg.tabId, method: msg.method, params: msg.params };
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Prevent one handler error from affecting others
      }
    }
  }
}
