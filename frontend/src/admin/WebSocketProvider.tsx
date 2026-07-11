import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export type WsServerMessage =
  | { type: "welcome"; data: { version: string } }
  | { type: "match_state"; data: { fixtureId: number; status: string; homeScore: number; awayScore: number; currentPeriod: string; matchClockMs: number } }
  | { type: "round_opened"; data: { fixtureId: number; roundId: number; marketType: string; lockSeconds: number; deadlineSeconds: number; expiresAt: number } }
  | { type: "round_settled"; data: { fixtureId: number; roundId: number; outcome: string; txSig?: string } }
  | { type: "round_confirmed"; data: { fixtureId: number; roundId: number; txSig?: string } }
  | { type: "round_cancelled"; data: { fixtureId: number; roundId: number } }
  | { type: "football_event"; data: { action: string; fixtureId: number; participant?: number; description: string } }
  | { type: "tx_status"; data: { fixtureId: number; roundId: number; status: string; txSig?: string; error?: string } }
  | { type: "system_status"; data: { clientCount: number; uptime: number; activeFixtureCount: number; solBalance: number } }
  | { type: "error"; data: { message: string } }
  | { type: "error_log"; data: { message: string; timestamp: number; fixtureId?: number; roundId?: number } };

interface WsContextValue {
  messages: WsServerMessage[];
  isConnected: boolean;
  subscribeMatch: (fixtureId: number) => void;
  unsubscribeMatch: (fixtureId: number) => void;
  subscribeAll: () => void;
}

const WsContext = createContext<WsContextValue>({
  messages: [],
  isConnected: false,
  subscribeMatch: () => {},
  unsubscribeMatch: () => {},
  subscribeAll: () => {},
});

export function useWs() {
  return useContext(WsContext);
}

const WS_URL = (() => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_RELAYER_HOST) {
    return `ws://${(import.meta as any).env.VITE_RELAYER_HOST}`;
  }
  return 'ws://localhost:8080';
})();

const MAX_MESSAGES = 500;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<WsServerMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: "subscribe_all" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsServerMessage = JSON.parse(event.data);
          setMessages(prev => [...prev.slice(-(MAX_MESSAGES - 1)), msg]);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!cancelled) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribeMatch = useCallback((fixtureId: number) => {
    send({ type: "subscribe_match", data: { fixtureId } });
  }, [send]);

  const unsubscribeMatch = useCallback((fixtureId: number) => {
    send({ type: "unsubscribe_match", data: { fixtureId } });
  }, [send]);

  const subscribeAll = useCallback(() => {
    send({ type: "subscribe_all" });
  }, [send]);

  return (
    <WsContext.Provider value={{ messages, isConnected, subscribeMatch, unsubscribeMatch, subscribeAll }}>
      {children}
    </WsContext.Provider>
  );
}
