# User Presence System

## Overview
Real-time presence indicators show which users are online, away, or offline in the application. Status updates in real-time through WebSocket connections.

## Architecture

### Services

**presenceService.ts** - Core presence tracking
- `setUserOnline()` - Mark user online
- `setUserAway()` - Mark user away (after idle timeout)
- `setUserOffline()` - Remove user from tracking
- `recordActivity()` - Reset idle timer on activity
- `getOnlineUsers()`, `getAwayUsers()` - Query users by status

**Socket Events**
- `presence:join` - User came online
- `presence:status_change` - User status changed
- `presence:leave` - User went offline
- `presence:activity` - User activity detected
- `presence:heartbeat` - Periodic keep-alive
- `presence:list` - Full presence list update

### Redux State

**presenceSlice.ts** - State management

```typescript
interface PresenceState {
  users: { [userId: string]: UserPresence };
  onlineCount: number;
  awayCount: number;
}
```

### Components

**PresenceIndicator** - Status dot
- Online: Green pulsing dot
- Away: Yellow dot
- Offline: Gray dot
- Configurable size (sm, md, lg)
- Optional label text

**UserCard** - User info with status
- Avatar with initials
- Name and status
- Last seen time
- Optional conversation indicator
- Status badge

**ActiveUsersPanel** - List of users
- Groups by status (online/away)
- User counts
- Compact mode for sidebars
- User cards with details

## Configuration

Idle timeout and cleanup settings in `presenceService.ts`:

```typescript
export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  idleTimeout: 5 * 60 * 1000,      // 5 minutes before 'away'
  cleanupTimeout: 30 * 60 * 1000,  // 30 minutes before removal
};
```

## Usage

### Initialize Presence (App-level)
```typescript
import { PresenceProvider } from '@/components/providers/PresenceProvider';

export default function Layout({ children }) {
  return (
    <PresenceProvider>
      {children}
    </PresenceProvider>
  );
}
```

### Display Presence Indicator
```typescript
import { PresenceIndicator } from '@/components/presence/PresenceIndicator';

function UserProfile({ user }) {
  const presence = useUserPresence(user.id);
  
  return (
    <div className="flex items-center gap-2">
      <h3>{user.name}</h3>
      {presence && (
        <PresenceIndicator status={presence.status} showLabel />
      )}
    </div>
  );
}
```

### Show User Card
```typescript
import { UserCard } from '@/components/presence/UserCard';
import { useUserPresence } from '@/hooks/usePresenceManagement';

function UserInfo({ userId }) {
  const presence = useUserPresence(userId);
  
  if (!presence) return null;
  
  return <UserCard presence={presence} showConversation />;
}
```

### Display Active Users Panel
```typescript
import { ActiveUsersPanel } from '@/components/presence/ActiveUsersPanel';

function Sidebar() {
  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-lg">
      <h2 className="font-bold mb-4">Active Users</h2>
      <ActiveUsersPanel compact={false} />
    </div>
  );
}
```

### Query Presence Data
```typescript
import {
  useOnlineUsers,
  useAwayUsers,
  useAllPresenceUsers,
  usePresenceCounts,
  useUserPresence,
} from '@/hooks/usePresenceManagement';

function Dashboard() {
  const onlineUsers = useOnlineUsers();
  const awayUsers = useAwayUsers();
  const allUsers = useAllPresenceUsers();
  const { online, away } = usePresenceCounts();
  
  const specificUser = useUserPresence('user-123');
}
```

## Status Lifecycle

```
User Logs In
    ↓
setUserOnline() 
    ↓ (after 5 min idle)
setUserAway()
    ↓ (after 30 min total)
setUserOffline()
    ↓
Removed from tracking
```

### Activity Reset
Any user activity resets the idle timer:
- Mouse clicks
- Keyboard input
- Page scrolling
- Touch events
- Socket activity

When activity detected:
```typescript
recordActivity(userId) // Resets idle timer to online
```

## Real-time Updates

### Socket Integration
```typescript
// User joins
emit('presence:join', { userId, userName })

// User activity
emit('presence:activity', { userId })

// Periodic heartbeat
emit('presence:heartbeat', { userId })

// User leaves
emit('presence:leave', { userId })
```

### Reconnection Policy (#276)

`SocketManager` uses a bounded, jittered backoff so a backend outage does not trigger a retry storm from every open client. The delays are applied by socket.io-client's built-in Manager backoff; the client only sets its options.

| Setting | Default | socket.io option |
|---------|---------|------------------|
| Base delay | 1000 ms | `reconnectionDelay` |
| Max delay | 30000 ms | `reconnectionDelayMax` |
| Jitter | ±50% | `randomizationFactor: 0.5` |
| Max attempts | 5 (hard cap 20) | `reconnectionAttempts` |

Delay for attempt `n` (1-based): `min(30000, 1000 * 2^(n-1)) ± 50%`, i.e. roughly 1s, 2s, 4s, 8s, 16s. Worst case that adds up to about 47s of backoff delay (plus each attempt's connect `timeout`) before the client gives up. Caller-supplied `reconnectionAttempts` above 20 is clamped to 20; `Infinity` or invalid values fall back to 5. `computeReconnectDelay()` in `src/services/socketManager.ts` mirrors the formula for tests.

**Connection states** (`SocketManager.getConnectionState()`, `onStateChange()`, and `useSocketConnection()`):

| State | Meaning |
|-------|---------|
| `idle` | Never connected |
| `connecting` | Initial connect or manual `retry()` in flight |
| `connected` | Socket open; reconnect attempt counter reset to 0 |
| `reconnecting` | Connection lost, automatic retries in progress (`reconnectAttempt` / `maxReconnectAttempts`) |
| `exhausted` | All automatic attempts failed; no more retries until `retry()` |
| `disconnected` | Closed on purpose (client `disconnect()` or server `io server disconnect`); not retried |

```tsx
const { isReconnecting, isExhausted, reconnectAttempt, maxReconnectAttempts, retry } = useSocketConnection();

if (isExhausted) return <button onClick={retry}>Reconnect</button>;
if (isReconnecting) return <span>Reconnecting ({reconnectAttempt}/{maxReconnectAttempts})</span>;
```

`retry()` resets the attempt counter and reconnects the existing socket, so the full backoff schedule applies again. Events emitted while offline are queued (when `queueEnabled`) and flushed on `connect`/`reconnect`. Presence should re-send `presence:join` after reconnecting, because the server may have expired the session while the client was offline.

**Backend contract:** this needs no new server endpoints. It uses the standard socket.io handshake and reconnect events (`reconnect_attempt`, `reconnect`, `reconnect_failed` on the Manager). Server-side, `io server disconnect` is treated as final and not retried. Backend rate limits on handshakes should allow at least 5 attempts per client within about 60s.

### Redux Synchronization
```typescript
// Listen for remote events
on('presence:join', (presence) => {
  dispatch(addOrUpdatePresence(presence))
})

on('presence:status_change', (presence) => {
  dispatch(addOrUpdatePresence(presence))
})

on('presence:leave', (userId) => {
  dispatch(removePresence(userId))
})
```

## Display Examples

### In User List
```typescript
<div className="space-y-2">
  {users.map(user => (
    <div key={user.id} className="flex items-center gap-2">
      <Avatar name={user.name} />
      <PresenceIndicator status={presence.status} />
      <span>{user.name}</span>
    </div>
  ))}
</div>
```

### In Chat Header
```typescript
function ChatHeader({ conversation }) {
  const participants = useOnlineUsers()
    .filter(p => p.conversationId === conversation.id);
    
  return (
    <div className="flex items-center gap-3">
      <h2>{conversation.title}</h2>
      <ActiveUsersPanel compact showConversationInfo />
    </div>
  );
}
```

### Minimal Status Indicator
```typescript
function MessageHeader({ senderId }) {
  const presence = useUserPresence(senderId);
  
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{user.name}</span>
      {presence && (
        <PresenceIndicator 
          status={presence.status} 
          size="sm"
        />
      )}
    </div>
  );
}
```

## Customization

### Custom Idle Timeout
```typescript
const config = {
  sessionTimeout: 15 * 60 * 1000,  // 15 min
  warningTime: 3 * 60 * 1000,      // 3 min warning
};

sessionService.startSession(config);
```

### Custom Status Colors
Edit `PresenceIndicator.tsx`:
```typescript
const statusClasses = {
  online: 'bg-blue-500',      // Change to blue
  away: 'bg-orange-500',      // Change to orange
  offline: 'bg-red-500',      // Change to red
};
```

### Custom Last Seen Format
In `UserCard.tsx`, modify `formatLastSeen()`:
```typescript
// Use absolute timestamps instead
return date.toLocaleTimeString();
```

## Performance Considerations

- **Batch Updates**: Presence list updates batched via `presence:list`
- **Debounced Activity**: Activity events throttled to avoid spam
- **Heartbeat Interval**: 30 seconds prevents connection timeout
- **Memory**: Offline users automatically cleaned up after 30 min

## Testing

Mock presence in development:
```typescript
// Browser console
import { presenceService } from '@/services/presenceService';

presenceService.setUserOnline('user-1', 'John Doe');
presenceService.setUserOnline('user-2', 'Jane Smith');
presenceService.setUserAway('user-1');
presenceService.getOnlineUsers(); // Check state
```

## Troubleshooting

**Presence not updating:**
- Check SocketProvider is initialized
- Verify socket events being emitted
- Check Redux presence slice is in store

**Users showing as offline unexpectedly:**
- Idle timeout may be too short
- Check browser activity monitoring
- Verify heartbeat socket events firing

**Memory issues with many users:**
- Implement pagination in ActiveUsersPanel
- Increase cleanup timeout
- Add filtering by conversation
