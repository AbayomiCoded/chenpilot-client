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
