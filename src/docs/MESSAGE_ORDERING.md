# Message Ordering & Race Condition Handling

## Problem
Messages were appearing out of order due to:
- Rapid consecutive sends
- Network delays
- Asynchronous message arrivals

## Solution

### 1. Server Timestamp Sorting
All messages are sorted by `timestamp` field instead of insertion order:

```typescript
const sortMessagesByTimestamp = (messages: ChatMessage[]): ChatMessage[] => {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return aTime - bTime;
  });
};
```

### 2. Redux Actions with Auto-Sorting

**Key reducers that automatically sort:**
- `addMessage()` - Adds single message and re-sorts
- `setMessages()` - Sets multiple messages and sorts
- `updateMessage()` - Updates and re-sorts (timestamp may change)
- `loadChatHistory()` - Loads history and ensures sorted order
- `resolveOptimisticUpdate()` - Resolves pending updates and sorts

### 3. Timestamps in sendMessage Thunk

```typescript
// User message gets server timestamp
const userMessage: ChatMessage = {
  id: `msg_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type: "user",
  content: query,
  timestamp: serverTimestamp, // ← Server time, not client time
};

// Agent message gets slightly later timestamp
const agentTimestamp = new Date(
  new Date(serverTimestamp).getTime() + 1,
).toISOString();
```

### 4. Optimistic Updates

New actions for handling optimistic updates:
- `storeOptimisticUpdate()` - Cache optimistic message
- `removeOptimisticUpdate()` - Remove from cache
- `resolveOptimisticUpdate()` - Replace optimistic with server version

```typescript
resolveOptimisticUpdate({
  clientId: 'msg_optimistic_123',
  serverMessage: {
    id: 'msg_server_456',
    type: 'agent',
    content: '...',
    timestamp: '2024-01-01T12:00:00Z',
  },
})
```

### 5. useMessageOrdering Hook

For components that need guaranteed sorted messages:

```typescript
import { useMessageOrdering } from '@/hooks/useMessageOrdering';

function ChatComponent() {
  const messages = useAppSelector(state => state.chat.messages);
  const sortedMessages = useMessageOrdering(messages);
  
  return (
    <div>
      {sortedMessages.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### 6. Resync After Socket Reconnect (#277)

A successful reconnect does not mean the client saw everything emitted while it was offline. Chat events therefore carry a server **cursor**, and the client catches up from the last one it received.

**Cursor tracking.** `SocketConfig.resync.events` lists the events to track (`chat:message` in `Providers.tsx`). Every tracked event, live or replayed, goes through `SocketManager.deliverTracked`:
1. If its cursor was already delivered, it is dropped. The last 500 cursors are remembered.
2. Otherwise it is passed to the handlers registered with `socketManager.on(event, ...)` / `useSocketEvent`.
3. Its cursor becomes the acknowledged position (`getLastCursor()`).

Cursors are opaque strings. The client never compares them; the backend must return events after a cursor in emission order. `setLastCursor()` can seed the position, for example from the newest message in loaded history.

**Fetching missed events.** On every `connect` after the first, `resyncMissedEvents()`:
- calls `fetchMissed(lastCursor)` (`apiService.getMissedChatEvents`)
- delivers the returned events oldest first
- follows `hasMore` / `nextCursor` for up to 10 pages

Concurrent triggers share one run. A failed fetch leaves the cursor unchanged and sets `resyncState.error`, so the next reconnect or a manual `resync()` retries from the same point. Nothing resyncs before the first cursor is received.

Live events that arrive while a resync request is in flight are delivered immediately. Their replayed copies are then dropped by the cursor check.

**Dedupe against local/optimistic messages.** `useChatResync()` (mounted in `ChatEngine`) sends every `chat:message` through `mergeSyncedMessages`, which calls `mergeIncomingMessages(existing, incoming)`:

| Incoming server message matches a local one by | Result |
|---|---|
| `id` | Replaced by the server copy (one message) |
| `metadata.optimisticId` / `metadata.tempId` equal to a local `id`, `optimisticId` or `tempId` | Optimistic copy replaced; its `optimisticUpdates`/`pendingMessages` entry cleared |
| `metadata.requestId` **and** same `type` | Replaced (e.g. a timed-out agent reply from #274 receives its late result) |
| nothing | Appended |

The merged list is re-sorted with `sortMessagesChronologically`, so replayed messages land in timestamp order. Local metadata is kept unless the server sends the same field.

**UI hooks.** `useSocketResync()` returns `{ isResyncing, lastCursor, lastResyncCount, lastResyncAt, error, resync, setLastCursor }`. `useChatResync()` returns the same and also wires the chat store.

**Backend contract (proposed, not yet confirmed):**
- Live event: `chat:message` with payload `{ "cursor": "<opaque>", "message": ChatMessage }`. To let the client drop its optimistic copy, the server message should echo `metadata.optimisticId`/`tempId` (or `metadata.requestId`, which matches the `clientRequestId` sent with `POST /query`).
- Catch-up: `GET /chat/events?after=<cursor>&limit=100` returns `{ "events": [{ "event": "chat:message", "cursor": "...", "data": { "cursor": "...", "message": { ... } } }], "hasMore": false, "nextCursor": "..." }`, oldest first, scoped to the authenticated user.
- Until the endpoint exists, resync fails with an error in `resyncState.error` and the app keeps working with live events only.

## Test Coverage

Race condition tests in `src/store/slices/__tests__/chatSlice.ordering.test.ts`:

1. ✅ Messages sorted by server timestamp
2. ✅ Chronological order on rapid consecutive sends
3. ✅ Re-sorting when timestamp updates
4. ✅ Optimistic update resolution
5. ✅ Out-of-order network responses resolved correctly

Resync tests (#277):
- `src/services/__tests__/socketManager.test.ts` ("resync after reconnect"): cursor tracking, live dedupe, fetch after the last cursor on reconnect, live/replay overlap, paging and its cap, shared in-flight run, error handling
- `src/store/slices/__tests__/chatSlice.resync.test.ts`: dedupe by id, optimistic id, request id and type; reducer clears optimistic entries
- `src/hooks/useSocket.test.ts` (`useSocketResync`)

## Usage Guidelines

### For Adding Messages
```typescript
dispatch(addMessage(message)); // Auto-sorted
```

### For Bulk Operations
```typescript
dispatch(setMessages(messagesArray)); // Auto-sorted
```

### For Network Updates
```typescript
dispatch(resolveOptimisticUpdate({
  clientId: optimisticId,
  serverMessage: actualServerMessage,
})); // Auto-sorted, old message removed
```

## Key Properties

- **Timestamp Format**: ISO 8601 (e.g., `2024-01-01T12:00:00Z`)
- **Sorting Logic**: Chronological by timestamp, ID as tiebreaker
- **Persistence**: Chat history maintains sort order in localStorage
- **Performance**: O(n log n) sorting only on relevant operations

## Monitoring

Use `useDetectMessageOrderingIssues` hook to detect problems:

```typescript
const hasIssues = useDetectMessageOrderingIssues(messages);
if (hasIssues) {
  console.warn('Message ordering issue detected');
}
```

## Message Delivery States (#266)

User messages carry `metadata.delivery`, managed by `src/store/messageDelivery.ts`:

| State | Meaning | Shown as |
| --- | --- | --- |
| `queued` | Written while offline; waiting in `messageQueue` | "Queued. Will send when you're back online." |
| `sending` | Request in flight | "Sending..." |
| `sent` | The service acknowledged it (an HTTP response came back), even if the agent's answer was an error | No badge |
| `failed` | Never reached the service (network drop, no response) | "Not sent", plus **Retry** |

**Allowed transitions** (`canTransition`):

| From | To |
| --- | --- |
| (new) | `queued`, `sending` |
| `queued` | `sending`, `failed` |
| `sending` | `sent`, `failed` |
| `failed` | `sending` (retry online), `queued` (retry offline) |
| `sent` | none (final) |

Any other transition is ignored. The legacy `status` field (`pending`/`success`/`failed`) is kept in sync, and older stored messages are mapped from it.

**Rules:**
- **One row per message.** Queued messages, retries and the offline queue all send with the existing row's id as `tempId`, so the same row moves through the states instead of a second bubble being added. Previously the offline queue created a duplicate.
- **Server ids.** When the agent result includes `userMessageId`, the row adopts it (`id` and `metadata.serverId`). If a row with that id already exists, for example from a socket event, the optimistic row is merged into it, so there are no duplicates.
- **Disconnect during send.** `agentService`/`apiService` return `result.delivered: false` when no HTTP response came back. `sendMessage` then rejects, and the row becomes `failed`.
- **Retry** appears only in the `failed` state (`canRetry`). When a send fails because the message never reached the service, the agent error reply that follows is not marked retryable, so the only Retry is on the user's message. The agent-reply retry (#262) is for messages that were delivered but answered with a retryable error.

Backend: `POST /query` may return `result.userMessageId` (proposed, optional).

## Conversation Deletion With Requests In Flight (#269)

Deleting a conversation while an agent reply is pending must not let that reply appear somewhere else later.

- **Confirmation:** deleting from the sidebar (`ConversationManager` → `ChatLayout`) opens `DeleteConversationDialog`. If a response is still in progress (`hasActiveRequests`), the dialog warns that deleting will cancel it.
- **Stop active work:** every `sendMessage` request is registered against its conversation in `src/store/conversationRequests.ts` and receives an `AbortSignal`. The `deleteConversation(id)` thunk calls `cancelConversationRequests(id)`, which aborts the HTTP request and marks the id as deleted (the last 100 ids are remembered), and then removes the conversation.
- **Ignore late responses:** after the agent call returns, `sendMessage` checks `isConversationDeleted`. If the conversation is gone, it rejects with `CONVERSATION_DELETED`. The rejected reducer then only resets the loading flags: no messages, no error bubble, and nothing written back to `chat_history`.
- **State cleanup:** deleting the open conversation clears `messages`, `currentConversation`, the typing/loading flags, pending and optimistic entries, and navigates to `/chat`. Deleting a different conversation leaves the current request untouched.
- Code that later applies server or socket messages to a conversation should check `isConversationDeleted(conversationId)` first.

Tests: `src/store/__tests__/conversationRequests.test.ts`, `src/store/slices/__tests__/chatSlice.deletion.test.ts` and `src/components/chat/DeleteConversationDialog.test.tsx`.
