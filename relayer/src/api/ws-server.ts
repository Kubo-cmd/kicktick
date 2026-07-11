import { EventEmitter } from "events";
import { WebSocket, WebSocketServer } from "ws";

export type WsServerMessage =
  | { type: "match_state"; data: { fixtureId: number; status: string; homeScore: number; awayScore: number; currentPeriod: string; matchClockMs: number } }
  | { type: "round_opened"; data: { fixtureId: number; roundId: number; marketType: string; lockSeconds: number; deadlineSeconds: number; expiresAt: number } }
  | { type: "round_settled"; data: { fixtureId: number; roundId: number; outcome: string; txSig?: string } }
  | { type: "round_confirmed"; data: { fixtureId: number; roundId: number; txSig?: string } }
  | { type: "round_cancelled"; data: { fixtureId: number; roundId: number } }
  | { type: "football_event"; data: { action: string; fixtureId: number; participant?: number; description: string } }
  | { type: "tx_status"; data: { fixtureId: number; roundId: number; status: string; txSig?: string; error?: string } }
  | { type: "system_status"; data: { clientCount: number; uptime: number; activeFixtureCount: number; solBalance: number } }
  | { type: "error_log"; data: { message: string; timestamp: number; fixtureId?: number; roundId?: number } }
  | { type: "error"; data: { message: string } };

export type WsClientMessage =
  | { type: "subscribe_match"; data: { fixtureId: number } }
  | { type: "unsubscribe_match"; data: { fixtureId: number } }
  | { type: "subscribe_all" }
  | { type: "ping" };

interface ClientState {
  isAlive: boolean;
  subscribedFixtures: Set<number>;
}

export class WsServer extends EventEmitter {
  private wss!: WebSocketServer;
  private readonly port: number;
  private readonly subscriptions: Map<number, Set<WebSocket>> = new Map();
  private readonly clients: Map<WebSocket, ClientState> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(port: number) {
    super();
    this.port = port;
  }

  start(): void {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on("connection", (ws: WebSocket) => {
      const state: ClientState = { isAlive: true, subscribedFixtures: new Set() };
      this.clients.set(ws, state);

      ws.send(JSON.stringify({ type: "welcome", data: { version: "0.1.0" } }));
      this.emit("connection", ws);

      ws.on("message", (data) => {
        let msg: WsClientMessage;
        try {
          msg = JSON.parse(data.toString()) as WsClientMessage;
        } catch {
          console.error("WS malformed message:", data.toString().substring(0, 120));
          return;
        }

        this.emit("message", msg);

        switch (msg.type) {
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;

          case "subscribe_match": {
            const { fixtureId } = msg.data;
            if (!this.subscriptions.has(fixtureId)) {
              this.subscriptions.set(fixtureId, new Set());
            }
            this.subscriptions.get(fixtureId)!.add(ws);
            state.subscribedFixtures.add(fixtureId);
            this.emit("subscribe", fixtureId);
            break;
          }

          case "unsubscribe_match": {
            const { fixtureId } = msg.data;
            this.subscriptions.get(fixtureId)?.delete(ws);
            state.subscribedFixtures.delete(fixtureId);
            this.emit("unsubscribe", fixtureId);
            break;
          }

          case "subscribe_all": {
            this.emit("subscribe_all", ws);
            break;
          }
        }
      });

      ws.on("pong", () => {
        state.isAlive = true;
      });

      ws.on("close", () => {
        this.cleanupClient(ws);
      });

      ws.on("error", (err) => {
        console.error("WS client error:", err.message);
        this.cleanupClient(ws);
      });
    });

    this.wss.on("error", (err) => {
      console.error("WS server error:", err.message);
    });

    this.heartbeatTimer = setInterval(() => {
      for (const [ws, state] of this.clients) {
        if (!state.isAlive) {
          ws.terminate();
          this.cleanupClient(ws);
          continue;
        }
        state.isAlive = false;
        ws.ping();

        setTimeout(() => {
          const s = this.clients.get(ws);
          if (s && !s.isAlive) {
            ws.terminate();
            this.cleanupClient(ws);
          }
        }, 10_000);
      }
    }, 30_000);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const ws of this.clients.keys()) {
      ws.terminate();
    }
    this.subscriptions.clear();
    this.clients.clear();
    this.wss.close();
  }

  broadcast(msg: WsServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastToMatch(fixtureId: number, msg: WsServerMessage): void {
    const payload = JSON.stringify(msg);
    const subs = this.subscriptions.get(fixtureId);
    if (!subs) return;
    for (const ws of subs) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  get clientCount(): number {
    return this.wss?.clients?.size ?? 0;
  }

  private cleanupClient(ws: WebSocket): void {
    const state = this.clients.get(ws);
    if (state) {
      for (const fixtureId of state.subscribedFixtures) {
        this.subscriptions.get(fixtureId)?.delete(ws);
      }
    }
    this.clients.delete(ws);
  }
}
