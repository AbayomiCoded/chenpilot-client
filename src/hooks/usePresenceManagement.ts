import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  addOrUpdatePresence,
  removePresence,
  updateUserStatus,
} from '@/store/slices/presenceSlice';
import { presenceService, DEFAULT_PRESENCE_CONFIG } from '@/services/presenceService';
import { useSocket } from '@/components/providers/SocketProvider';

/**
 * Hook to initialize and manage user presence
 * Should be used at app-level in an authenticated context
 */
export function usePresenceManagement() {
  const dispatch = useAppDispatch();
  const { emit, on, off } = useSocket();
  const { user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!user) return;

    // Announce own presence when user logs in
    emit('presence:join', {
      userId: user.id,
      userName: user.name,
    });

    // Listen for other users joining
    const handleUserJoin = (presence: any) => {
      dispatch(addOrUpdatePresence(presence));
    };

    // Listen for status changes
    const handleStatusChange = (presence: any) => {
      dispatch(addOrUpdatePresence(presence));
    };

    // Listen for user leaving
    const handleUserLeave = (...args: unknown[]) => {
      const [userId] = args;
      if (typeof userId === 'string') dispatch(removePresence(userId));
    };

    // Listen for bulk presence updates
    const handlePresenceList = (...args: unknown[]) => {
      const [presences] = args;
      if (!Array.isArray(presences)) return;
      presences.forEach((presence) => {
        dispatch(addOrUpdatePresence(presence));
      });
    };

    on('presence:join', handleUserJoin);
    on('presence:status_change', handleStatusChange);
    on('presence:leave', handleUserLeave);
    on('presence:list', handlePresenceList);

    // Cleanup on unmount
    return () => {
      off('presence:join');
      off('presence:status_change');
      off('presence:leave');
      off('presence:list');
      // Announce departure
      emit('presence:leave', { userId: user.id });
    };
  }, [user, emit, on, off, dispatch]);
}

/**
 * Hook to track user activity and keep presence alive
 */
export function useActivityPresenceTracking(enabled: boolean = true) {
  const { user } = useAppSelector((state) => state.auth);
  const { emit } = useSocket();

  useEffect(() => {
    if (!enabled || !user) return;

    const recordActivity = () => {
      emit('presence:activity', { userId: user.id });
    };

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => {
      document.addEventListener(event, recordActivity, true);
    });

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
      emit('presence:heartbeat', { userId: user.id });
    }, 30000); // Every 30 seconds

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, recordActivity, true);
      });
      clearInterval(heartbeat);
    };
  }, [enabled, user, emit]);
}

/**
 * Hook to get current user presence
 */
export function useUserPresence(userId: string) {
  const presence = useAppSelector((state) => state.presence.users[userId]);
  return presence;
}

/**
 * Hook to get all online users
 */
export function useOnlineUsers() {
  const users = useAppSelector((state) => state.presence.users);
  return Object.values(users).filter((u) => u.status === 'online');
}

/**
 * Hook to get all away users
 */
export function useAwayUsers() {
  const users = useAppSelector((state) => state.presence.users);
  return Object.values(users).filter((u) => u.status === 'away');
}

/**
 * Hook to get all users
 */
export function useAllPresenceUsers() {
  const users = useAppSelector((state) => state.presence.users);
  return Object.values(users);
}

/**
 * Hook to get online/away counts
 */
export function usePresenceCounts() {
  return useAppSelector((state) => ({
    online: state.presence.onlineCount,
    away: state.presence.awayCount,
  }));
}

/** Debounce window for nonessential presence transitions (#288). */
export const PRESENCE_TRANSITION_DEBOUNCE_MS = 2000;

type BrowserPresenceStatus = 'online' | 'away' | 'offline';

/**
 * Collapses rapid presence transitions into one update (#288).
 * `offline` is sent immediately (and cancels any pending update); `online`/`away` wait for
 * `delayMs` so a tab that backgrounds and wakes, or a connection that flaps, emits only the
 * final state. Repeating the last sent status is skipped.
 */
export function createPresenceTransitionScheduler(
  send: (status: BrowserPresenceStatus) => void,
  delayMs: number = PRESENCE_TRANSITION_DEBOUNCE_MS
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSent: BrowserPresenceStatus | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const flush = (status: BrowserPresenceStatus) => {
    if (status === lastSent) return;
    lastSent = status;
    send(status);
  };

  return {
    schedule(status: BrowserPresenceStatus) {
      cancel();
      if (status === 'offline') {
        flush(status);
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        flush(status);
      }, delayMs);
    },
    dispose: cancel,
  };
}

/**
 * Updates own presence from browser events (#288):
 * - `visibilitychange` → hidden: `away`, visible: `online` (debounced)
 * - `online` → `online` (debounced); `offline` → `offline` (immediate)
 * Listeners and pending timers are removed on unmount.
 */
export function useBrowserPresenceTransitions(enabled: boolean = true) {
  const { user } = useAppSelector((state) => state.auth);
  const { emit } = useSocket();

  useEffect(() => {
    if (!enabled || !user || typeof window === 'undefined') return;

    const scheduler = createPresenceTransitionScheduler((status) => {
      emit('presence:status_change', { userId: user.id, status });
    });

    const onVisibility = () => scheduler.schedule(document.visibilityState === 'hidden' ? 'away' : 'online');
    const onOnline = () => scheduler.schedule('online');
    const onOffline = () => scheduler.schedule('offline');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      scheduler.dispose();
    };
  }, [enabled, user, emit]);
}
