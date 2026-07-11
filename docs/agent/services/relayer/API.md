---
id: relayer-api
type: reference
title: "WebSocket API"
service: relayer
depends_on:
  - relayer-architecture
related_to:
  - relayer-settlement
tags: [websocket, api, protocol, messages]
---

# WebSocket API

## Overview

WebSocket server in `src/api/ws-server.ts`. Pushes round and match state to connected frontends.

**Default port:** 8080 (configurable via `WS_PORT` env var)

---

## Connection

```
ws://localhost:8080
```

On connect, server sends welcome message:

```json
{ "type": "welcome", "data": { "version": "0.1.0" } }
```

---

## Client → Server Messages

### Subscribe to Match

```json
{ "type": "subscribe_match", "data": { "fixtureId": 542179 } }
```

Subscribe to all events for a specific fixture. Server begins sending match-specific broadcasts to this client.

### Unsubscribe from Match

```json
{ "type": "unsubscribe_match", "data": { "fixtureId": 542179 } }
```

### Ping (Keepalive)

```json
{ "type": "ping" }
```

Server responds with:

```json
{ "type": "pong" }
```

---

## Server → Client Messages

### Match State Update

```json
{
  "type": "match_state",
  "data": {
    "fixtureId": 542179,
    "status": "FirstHalf",
    "homeScore": 1,
    "awayScore": 0,
    "currentPeriod": "H1",
    "matchClockMs": 2700000
  }
}
```

Sent on goal, score adjustment, status change.

### Round Opened

```json
{
  "type": "round_opened",
  "data": {
    "fixtureId": 542179,
    "roundId": 3,
    "marketType": "NextGoalSide",
    "lockSeconds": 30,
    "deadlineSeconds": 90,
    "expiresAt": 1712345678000
  }
}
```

### Round Settled

```json
{
  "type": "round_settled",
  "data": {
    "fixtureId": 542179,
    "roundId": 3,
    "outcome": "Yes",
    "txSig": "5KtPn2..."
  }
}
```

### Round Confirmed

```json
{
  "type": "round_confirmed",
  "data": {
    "fixtureId": 542179,
    "roundId": 3,
    "txSig": "5KtPn2..."
  }
}
```

### Round Cancelled

```json
{
  "type": "round_cancelled",
  "data": {
    "fixtureId": 542179,
    "roundId": 3
  }
}
```

### Football Event

```json
{
  "type": "football_event",
  "data": {
    "action": "goal",
    "fixtureId": 542179,
    "participant": 1,
    "description": "goal"
  }
}
```

Raw event broadcast to subscribers of that fixture.

### Tx Status

```json
{
  "type": "tx_status",
  "data": {
    "fixtureId": 542179,
    "roundId": 3,
    "status": "confirmed",
    "txSig": "5KtPn2...",
    "error": null
  }
}
```

### Error

```json
{
  "type": "error",
  "data": { "message": "Something went wrong" }
}
```

---

## Subscription Model

```
Client A                     WebSocket Server               Client B
  │                              │                              │
  ├── subscribe_match(542179) ──►│                              │
  │                              │◄── subscribe_match(542179) ──┤
  │                              │                              │
  │               match event    │                              │
  │◄── broadcastToMatch(542179) ─┼──► broadcastToMatch(542179)  │
  │                              │                              │
  │                              │                              │
  ├── unsubscribe_match(542179)─►│                              │
```

- Clients subscribed to a match receive only that match's events
- Global broadcasts (`broadcast`) go to ALL connected clients
- Heartbeat: server pings every 30s, terminates unresponsive clients after 10s

---

## Implementation Details

```typescript
class WsServer extends EventEmitter {
  start(): void;                          // listen on configured port
  stop(): void;                           // cleanup + close
  broadcast(msg: WsServerMessage): void;  // all clients
  broadcastToMatch(fixtureId: number, msg: WsServerMessage): void; // per-match

  // Events
  on("connection", (ws: WebSocket) => void);
  on("message", (msg: WsClientMessage) => void);
  on("subscribe", (fixtureId: number) => void);
  on("unsubscribe", (fixtureId: number) => void);
}
```