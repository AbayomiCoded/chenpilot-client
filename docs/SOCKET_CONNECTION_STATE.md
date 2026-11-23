# Socket connection state

Real-time socket status is modelled once, in `src/types/socket.ts`, and every
consumer reads that single `SocketConnectionState` union (#279).

| State          | Meaning                                                                 | User-visible                         |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `idle`         | Unknown initial state: no connection has been attempted yet             | nothing                              |
| `connecting`   | Initial connect or a manual retry is in flight                          | "Connecting to live updates…"        |
| `connected`    | The socket is open                                                      | nothing                              |
| `reconnecting` | The connection was lost and automatic retries are running               | "Reconnecting … (attempt n of m)"    |
| `exhausted`    | Failed: every automatic retry was used; only a manual `retry()` helps   | "Live updates unavailable" + Retry   |
| `disconnected` | Closed on purpose (client call or server kick); no retries are queued   | "Live updates disconnected" + Retry  |

- `SocketManager` owns the transitions and starts in `idle`.
- `SocketProvider` subscribes with `onStateChange` and exposes `connectionState`.
  `isConnected` is derived from it (`isSocketConnected`) and is not tracked separately.
- `OfflineIndicator` renders the status line for the visible states
  (`isSocketStatusVisible`). It reads the provider through `useOptionalSocket`, so it
  still renders where no `SocketProvider` is mounted. A browser that is offline always
  shows the offline message first.

Tests: `src/types/socket.test.ts` (model and initial state),
`src/components/providers/SocketProvider.test.tsx` (transitions), and
`src/components/chat/OfflineIndicator.socket.test.tsx` (status UI).
