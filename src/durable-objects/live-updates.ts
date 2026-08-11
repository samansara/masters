export class LiveUpdates {
  private sessions: Map<string, WebSocket> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const sessionId = crypto.randomUUID();
      server.accept();

      server.addEventListener('message', (event) => {
        // Handle ping/pong for keepalive
        if (event.data === 'ping') {
          server.send('pong');
        }
      });

      server.addEventListener('close', () => {
        this.sessions.delete(sessionId);
      });

      server.addEventListener('error', () => {
        this.sessions.delete(sessionId);
      });

      this.sessions.set(sessionId, server);

      // Send initial connection confirmation
      server.send(JSON.stringify({ type: 'connected', sessionId, clients: this.sessions.size }));

      return new Response(null, { status: 101, webSocket: client });
    }

    // Handle broadcast notification from the payout worker
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const data = await request.json();
      const message = JSON.stringify({ type: 'update', data, timestamp: Date.now() });

      const deadSessions: string[] = [];
      for (const [id, ws] of this.sessions) {
        try {
          ws.send(message);
        } catch {
          deadSessions.push(id);
        }
      }
      for (const id of deadSessions) {
        this.sessions.delete(id);
      }

      return new Response(JSON.stringify({ broadcast: true, clients: this.sessions.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }
}
