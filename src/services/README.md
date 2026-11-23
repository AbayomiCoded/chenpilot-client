# Socket.IO Integration & Event Contract

This directory contains the Socket.IO client integration for ChenPilot and serves as the canonical reference for all real-time events, payload shapes, listener cleanup rules, and reconnection/queueing semantics.

## Architecture & Files

- [`src/services/socketManager.ts`](./socketManager.ts) — Core `SocketManager` singleton, connection state machine, `RECONNECT_POLICY`, and `computeReconnectDelay()`.
- [`src/components/providers/SocketProvider.tsx`](../components/providers/SocketProvider.tsx) — React context provider (`SocketProvider`, `useSocket`, `useOptionalSocket`) that initializes `SocketManager` and exposes connection state and event helpers.
- [`src/hooks/useSocket.ts`](../hooks/useSocket.ts) — React hooks (`useSocket`, `useSocketEvent`, `useSocketConnection`, `useSocketResync`).
- [`src/components/status/SocketStatusIndicator.tsx`](../components/status/SocketStatusIndicator.tsx) and [`src/components/chat/OfflineIndicator.tsx`](../components/chat/OfflineIndicator.tsx) — Connection status UI.
- [`src/types/socket.ts`](../types/socket.ts) — Shared `SocketConnectionState` union and status helpers (`docs/SOCKET_CONNECTION_STATE.md`).

---

## Socket Event Reference

Every event emitted or listened to in `src/` is listed below. Event names match the codebase verbatim.

### Application Events

| Event Name | Direction | Payload Shape / Type | Call Site(s) |
| --- | --- | --- | --- |
| `chat:message` (`CHAT_MESSAGE_EVENT`) | Server -> Client | `ChatMessageEventPayload`: `{ cursor: string; message: ChatMessage }` | `src/hooks/useChatResync.ts`, `src/components/providers/Providers.tsx` |
| `thread:reply` | Client -> Server | `{ threadId: string; message: ChatMessage; userId: string }` | `src/components/chat/ThreadPanel.tsx` |
| `transaction:completed` | Server -> Client | `TransactionNotificationEvent`: `{ hash?: string; amount?: string; asset?: string; message?: string }` | `src/components/TransactionToastListener.tsx` |
| `transaction:success` | Server -> Client | `TransactionNotificationEvent`: `{ hash?: string; amount?: string; asset?: string; message?: string }` | `src/components/TransactionToastListener.tsx` |
| `presence:join` | Client -> Server | `{ userId: string; userName: string }` | `src/hooks/usePresenceManagement.ts` |
| `presence:join` | Server -> Client | `UserPresence`: `{ userId: string; userName: string; status: 'online' \| 'away' \| 'offline'; lastSeen: string; conversationId?: string }` | `src/hooks/usePresenceManagement.ts` |
| `presence:status_change` | Server -> Client | `UserPresence` | `src/hooks/usePresenceManagement.ts` |
| `presence:leave` | Client -> Server | `{ userId: string }` | `src/hooks/usePresenceManagement.ts` |
| `presence:leave` | Server -> Client | `userId: string` | `src/hooks/usePresenceManagement.ts` |
| `presence:list` | Server -> Client | `UserPresence[]` | `src/hooks/usePresenceManagement.ts` |
| `presence:activity` | Client -> Server | `{ userId: string }` | `src/hooks/usePresenceManagement.ts` |
| `presence:heartbeat` | Client -> Server | `{ userId: string }` (sent every `30000` ms while active) | `src/hooks/usePresenceManagement.ts` |

### Socket.IO Lifecycle Events (Managed Internally by `SocketManager`)

These events are registered internally in `src/services/socketManager.ts` to drive `SocketConnectionState`. Components should observe state via `useSocketConnection()` or `useSocket().connectionState` rather than binding to these events directly.

| Event Name | Direction | Payload Shape / Type | Handled In |
| --- | --- | --- | --- |
| `connect` | Socket.IO -> Client | None | `src/services/socketManager.ts` |
| `disconnect` | Socket.IO -> Client | `reason: string` | `src/services/socketManager.ts` |
| `reconnect_attempt` | Socket.IO -> Client | `attempt: number` | `src/services/socketManager.ts` |
| `reconnect_failed` | Socket.IO -> Client | None | `src/services/socketManager.ts` |
| `connect_error` | Socket.IO -> Client | `error: Error` (transition handled without payload) | `src/services/socketManager.ts` |

---

## Listener Cleanup Rules

Every subscription pattern has explicit cleanup responsibilities to prevent duplicate handlers and memory leaks across re-renders, unmounts, and reconnects:

| Usage Pattern | Who Cleans Up | Required Cleanup Call | Notes |
| --- | --- | --- | --- |
| `useSocketEvent(event, callback)` (`src/hooks/useSocket.ts`) | **Automatic** | Handled by hook (`off(event, stableListener)` on unmount or `socket`/`event` change) | Preferred for React components/hooks. Uses a `ref`-backed stable listener so inline callbacks do not cause resubscriptions. |
| `const { on, off } = useSocket()` | **Caller** | Return `() => { off(event, handler); }` from `useEffect` | **Always pass the handler reference** to `off(event, handler)`. Calling `off(event)` without a callback removes *all* listeners for that event across the app. |
| Direct `socket.on(event, handler)` | **Caller** | Return `() => { socket.off(event, handler); }` (or `socket.removeListener(event, handler)`) from `useEffect` | Also cancel any timers or in-flight async work started by the listener (see `src/components/TransactionToastListener.tsx`). |
| `once(event, handler)` | **Auto on first fire / Caller on early unmount** | Return `() => { off(event, handler); }` from `useEffect` | Prevents the callback from firing after unmount if the event never arrived before teardown. |
| `manager.onStateChange(listener)` / `manager.onResyncStateChange(listener)` | **Caller** | Invoke the returned `unsubscribe()` function on cleanup | `SocketProvider` and `useSocketResync` handle this automatically for their own subscriptions. |

---

## Reconnection & Queueing Semantics

### Reconnection Policy (`SocketManager`)

`SocketManager` (`src/services/socketManager.ts`) tracks a single shared `SocketConnectionState` (`idle` | `connecting` | `connected` | `reconnecting` | `exhausted` | `disconnected`):

- **Backoff defaults (`RECONNECT_POLICY`)**:
  - `baseDelayMs`: `1000` ms
  - `maxDelayMs`: `30000` ms
  - `randomizationFactor`: `0.5` (±50% jitter)
  - `maxAttempts`: `5` (clamped between `1` and `maxAttemptsCap: 20` when supplied in `config.options.reconnectionAttempts`)
- **State transitions**:
  - `connect()` transitions to `connecting`; `connect` event resets `reconnectAttempt` to `0` and transitions to `connected`.
  - `disconnect` with reason `'io server disconnect'` or `'io client disconnect'` transitions to `disconnected` (no automatic retry). Any other disconnect reason transitions to `reconnecting`.
  - `reconnect_attempt` updates `reconnectAttempt` and transitions to `exhausted` once `attempt >= maxReconnectAttempts` (otherwise `reconnecting`).
  - `reconnect_failed` and non-reconnecting `connect_error` transition to `exhausted`.
  - `retry()` resets `reconnectAttempt` to `0`, transitions to `connecting`, and reconnects the existing socket (or calls `connect()` if none exists).
  - `disconnect()` closes the socket, clears the socket reference, and transitions to `disconnected`.

### Outbound Emit & Queueing Semantics

- `SocketManager.emit(event, data)` checks `if (this.socket && this.socket.connected)`.
  - **Connected**: emits immediately and returns `true`.
  - **Disconnected / connecting / reconnecting / exhausted**: **does not buffer or queue the event** in `SocketManager`; returns `false`.
- Callers that require offline durability must persist/queue actions outside `SocketManager` (for example, `chatSlice` queues outgoing chat prompts in Redux/localStorage) or re-emit state announcements (such as `presence:join`) after reconnection.

### Inbound Missed-Event Resync

`SocketConfig.resync` supports cursor-based catch-up after reconnect (configured in `src/components/providers/Providers.tsx` for `chat:message` via `apiService.getMissedChatEvents(cursor)`). Components can read resync progress and trigger manual resync via `useSocketResync()` or `useChatResync()`.

---

## Usage Examples

### Subscribing with Automatic Cleanup (`useSocketEvent`)

```tsx
import { useSocketEvent } from '@/hooks/useSocket';
import { CHAT_MESSAGE_EVENT, type ChatMessageEventPayload } from '@/hooks/useChatResync';

function ChatListener() {
  useSocketEvent(CHAT_MESSAGE_EVENT, (payload) => {
    const { message } = payload as ChatMessageEventPayload;
    // Handle incoming message; cleanup is automatic on unmount
  });

  return null;
}
```

### Emitting an Event (`useSocket`)

```tsx
import { useSocket } from '@/hooks/useSocket';

function ReplyAction({ threadId, message, userId }) {
  const { emit, isConnected } = useSocket();

  const sendReply = () => {
    const sent = emit('thread:reply', { threadId, message, userId });
    if (!sent) {
      // Socket is not connected; handle fallback/retry if needed
    }
  };

  return (
    <button type="button" onClick={sendReply} disabled={!isConnected}>
      Send Reply
    </button>
  );
}
```

### Manual Subscription & Cleanup (`on` / `off`)

```tsx
import { useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import type { TransactionNotificationEvent } from '@/utils/transactionToast';

function TransactionWatcher() {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleTransaction = (event: TransactionNotificationEvent) => {
      // Handle submission notification
    };

    socket.on('transaction:completed', handleTransaction);
    return () => {
      socket.off('transaction:completed', handleTransaction);
    };
  }, [socket]);

  return null;
}
```

### Connection Status & Manual Retry (`useSocketConnection`)

```tsx
import { useSocketConnection } from '@/hooks/useSocket';

function ConnectionBanner() {
  const { isReconnecting, isExhausted, reconnectAttempt, maxReconnectAttempts, retry } =
    useSocketConnection();

  if (isReconnecting) {
    return <span>Reconnecting ({reconnectAttempt}/{maxReconnectAttempts})…</span>;
  }
  if (isExhausted) {
    return <button type="button" onClick={retry}>Retry Connection</button>;
  }
  return null;
}
```

---

## Configuration

`SocketProvider` is mounted in `src/components/providers/Providers.tsx`:

```tsx
<SocketProvider
  configKey="default"
  config={{
    url: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
    options: {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    },
    resync: {
      events: [CHAT_MESSAGE_EVENT],
      fetchMissed: (cursor) => apiService.getMissedChatEvents(cursor),
    },
  }}
  autoConnect={true}
>
```

Set `NEXT_PUBLIC_SOCKET_URL` in `.env.local` (defaults to `http://localhost:3001` in development).

---

## Adding a New Socket Event

Follow these steps when introducing a new event:

1. **Define the event constant and payload interface** next to its domain hook or utility (e.g., `export const MY_EVENT = 'domain:action'` and `export interface MyEventPayload { ... }`).
2. **Subscribe using `useSocketEvent(MY_EVENT, handler)`** for automatic cleanup, or pair `on(MY_EVENT, handler)` with `off(MY_EVENT, handler)` in `useEffect` cleanup (never call `off(MY_EVENT)` without the handler reference).
3. **Check `emit()` return value** when sending client-to-server events if the action needs offline queueing or user feedback when `emit()` returns `false`.
4. **Consider reconnect recovery**: if the event represents session state (like presence) or ordered streams (like chat), re-announce on connect or configure cursor resync.
5. **Add focused tests** covering subscription, payload handling, and unmount cleanup (see `src/hooks/useSocket.test.ts` and `src/services/__tests__/socketManager.test.ts`).
6. **Update the Socket Event Reference table** in this file (`src/services/README.md`) with the exact event name, direction, payload type, and call site.
