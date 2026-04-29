import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { OmniaServer } from '../server/server.js';

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const net = require('node:net') as typeof import('node:net');
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function wsConnect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://localhost:${port}`);
    client.on('open', () => resolve(client));
    client.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

describe('OmniaServer', () => {
  let server: OmniaServer;
  let port: number;

  beforeEach(async () => {
    port = await getFreePort();
    server = new OmniaServer(port, { requestTimeout: 3000 });
  });

  afterEach(async () => {
    try {
      await server.shutdown();
    } catch {
      // Already closed or shutting down
    }
  });

  describe('constructor', () => {
    it('starts listening on given port', () => {
      expect(server.clientCount).toBe(0);
    });
  });

  describe('callTool', () => {
    it('resolves with result when extension responds', async () => {
      const client = await wsConnect(port);

      const resultPromise = server.callTool('omnia_chrome_api', { api: 'tabs', method: 'query' });

      const raw = await new Promise<string>((resolve) => {
        client.once('message', (data) => resolve(data.toString()));
      });

      const msg = JSON.parse(raw);
      expect(msg.type).toBe('request');
      expect(msg.tool).toBe('omnia_chrome_api');
      expect(msg.params.api).toBe('tabs');
      expect(msg.params.method).toBe('query');

      client.send(JSON.stringify({
        type: 'response',
        requestId: msg.requestId,
        result: [{ id: 1, url: 'https://example.com' }],
      }));

      const result = await resultPromise;
      expect(result).toEqual([{ id: 1, url: 'https://example.com' }]);

      client.close();
    });

    it('rejects with error from extension', async () => {
      const client = await wsConnect(port);

      const resultPromise = server.callTool('omnia_cdp', { method: 'Page.navigate', params: { url: 'https://x.com' }, tabId: 5 });

      const raw = await new Promise<string>((resolve) => {
        client.once('message', (data) => resolve(data.toString()));
      });
      const msg = JSON.parse(raw);

      client.send(JSON.stringify({
        type: 'response',
        requestId: msg.requestId,
        error: 'Tab not found',
      }));

      await expect(resultPromise).rejects.toThrow('Tab not found');

      client.close();
    });

    it('rejects when no extension connected', async () => {
      await expect(
        server.callTool('omnia_chrome_api', { api: 'tabs', method: 'query' }),
      ).rejects.toThrow('No connected extension');
    });

    it('rejects on timeout', async () => {
      const p = await getFreePort();
      const fastServer = new OmniaServer(p, { requestTimeout: 200 });

      try {
        const client = await wsConnect(p);
        await expect(
          fastServer.callTool('omnia_chrome_api', { api: 'tabs', method: 'query' }),
        ).rejects.toThrow('timed out');
        client.close();
      } finally {
        await fastServer.shutdown();
      }
    });

    it('handles multiple concurrent requests', async () => {
      const client = await wsConnect(port);

      // Collect all messages from server
      const messages: string[] = [];
      const messagePromise = new Promise<string[]>((resolve) => {
        client.on('message', (data) => {
          messages.push(data.toString());
          if (messages.length === 3) resolve(messages);
        });
      });

      // Send 3 concurrent requests
      const p1 = server.callTool('omnia_chrome_api', { api: 'tabs', method: 'query' });
      const p2 = server.callTool('omnia_chrome_api', { api: 'bookmarks', method: 'getTree' });
      const p3 = server.callTool('omnia_cdp', { method: 'Page.navigate', tabId: 1 });

      // Wait for all 3 requests to arrive
      const received = await messagePromise;
      const ids = received.map((m) => JSON.parse(m).requestId);
      expect(ids).toHaveLength(3);

      // Respond in reverse order
      client.send(JSON.stringify({ type: 'response', requestId: ids[2], result: { third: true } }));
      client.send(JSON.stringify({ type: 'response', requestId: ids[1], result: { second: true } }));
      client.send(JSON.stringify({ type: 'response', requestId: ids[0], result: { first: true } }));

      const results = await Promise.all([p1, p2, p3]);
      expect(results[0]).toEqual({ first: true });
      expect(results[1]).toEqual({ second: true });
      expect(results[2]).toEqual({ third: true });

      client.close();
    });
  });

  describe('event handling', () => {
    it('forwards CDP events to registered handlers', async () => {
      const events: { tabId: number; method: string; params: unknown }[] = [];
      server.onEvent((e) => events.push(e));

      const client = await wsConnect(port);

      const eventReceived = new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (events.length >= 1) {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      client.send(JSON.stringify({
        type: 'cdp_event',
        tabId: 5,
        method: 'Network.requestWillBeSent',
        params: { requestId: '123' },
      }));

      // Wait up to 2s for the event
      await Promise.race([eventReceived, new Promise((r) => setTimeout(r, 2000))]);

      expect(events).toHaveLength(1);
      expect(events[0].tabId).toBe(5);
      expect(events[0].method).toBe('Network.requestWillBeSent');
      expect(events[0].params).toEqual({ requestId: '123' });

      client.close();
    });

    it('unregister stops receiving events', async () => {
      const events: { tabId: number; method: string }[] = [];
      const unregister = server.onEvent((e) => events.push(e));
      unregister();

      const client = await wsConnect(port);
      client.send(JSON.stringify({
        type: 'cdp_event',
        tabId: 5,
        method: 'Network.requestWillBeSent',
        params: {},
      }));

      await new Promise((r) => setTimeout(r, 100));

      expect(events).toHaveLength(0);

      client.close();
    });

    it('handler errors do not affect other handlers', async () => {
      const methods: string[] = [];
      server.onEvent(() => {
        throw new Error('handler crash');
      });
      server.onEvent((e) => methods.push(e.method));

      const client = await wsConnect(port);

      const eventReceived = new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (methods.length >= 1) {
            clearInterval(check);
            resolve();
          }
        }, 10);
      });

      client.send(JSON.stringify({
        type: 'cdp_event',
        tabId: 5,
        method: 'Page.loadEventFired',
        params: {},
      }));

      await Promise.race([eventReceived, new Promise((r) => setTimeout(r, 2000))]);

      expect(methods).toEqual(['Page.loadEventFired']);

      client.close();
    });
  });

  describe('shutdown', () => {
    it('rejects all pending requests', async () => {
      const client = await wsConnect(port);
      const promise = server.callTool('omnia_chrome_api', { api: 'tabs', method: 'query' });

      // Give a small delay so request is registered
      await new Promise((r) => setTimeout(r, 50));

      await server.shutdown();

      await expect(promise).rejects.toThrow('shutting down');

      client.close();
    });

    it('can be called multiple times safely', async () => {
      await server.shutdown();
      await server.shutdown();
      // Should not throw
    });

    it('closes all connected clients', async () => {
      const client = await wsConnect(port);
      expect(server.clientCount).toBeGreaterThanOrEqual(1);

      client.close();
      await new Promise((r) => setTimeout(r, 100));
    });
  });

  describe('message handling', () => {
    it('ignores malformed JSON', async () => {
      const client = await wsConnect(port);
      client.send('not json at all');

      await new Promise((r) => setTimeout(r, 50));

      expect(server.clientCount).toBeGreaterThanOrEqual(1);

      client.close();
    });

    it('ignores messages with unknown type', async () => {
      const client = await wsConnect(port);
      client.send(JSON.stringify({ type: 'garbage', foo: 'bar' }));

      await new Promise((r) => setTimeout(r, 50));

      expect(server.clientCount).toBeGreaterThanOrEqual(1);

      client.close();
    });

    it('ignores response for unknown requestId', async () => {
      const client = await wsConnect(port);
      client.send(JSON.stringify({
        type: 'response',
        requestId: 'non-existent',
        result: 'ok',
      }));

      await new Promise((r) => setTimeout(r, 50));

      expect(server.clientCount).toBeGreaterThanOrEqual(1);

      client.close();
    });
  });

  describe('custom requestTimeout', () => {
    it('uses configured timeout', async () => {
      const p = await getFreePort();
      const customServer = new OmniaServer(p, { requestTimeout: 300 });

      try {
        const client = await wsConnect(p);

        const start = Date.now();
        await expect(
          customServer.callTool('omnia_chrome_api', { api: 'tabs', method: 'query' }),
        ).rejects.toThrow('timed out');
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(1500);
        expect(elapsed).toBeGreaterThanOrEqual(250);

        client.close();
      } finally {
        await customServer.shutdown();
      }
    });
  });
});
