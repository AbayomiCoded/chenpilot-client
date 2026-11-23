import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  addOrUpdatePresence,
  clearPresence,
  removePresence,
  removePresences,
  setPresenceBatch,
} from '@/store/slices/presenceSlice';
import {
  DEFAULT_LEASE_TIMEOUT_MS,
  DEFAULT_SWEEP_INTERVAL_MS,
  isUserPresencePayload,
  normalizePresenceListPayload,
  presenceService,
  type PresenceHeartbeatPayload,
} from '@/services/presenceService';
import { useSocket } from '@/components/providers/SocketProvider';
import type { SocketConnectionState } from '@/types/socket';

export interface PresenceManagementOptions {
  /** Fallback lease duration in ms when server payloads omit expiresAt/leaseTtlMs. */
  leaseTimeout?: number;
  /** Interval in ms between periodic stale-lease sweeps. */
  sweepInterval?: number;
}

function extractLeaveUserId(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const userId = (payload as Record<string, unknown>).userId;
    if (typeof userId === 'string' && userId.length > 0) {
      return userId;
    }
  }
  return null;
}

function isHeartbeatPayload(payload: unknown): payload is PresenceHeartbeatPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.userId === 'string' && candidate.userId.length > 0;
}

/**
 * Hook to initialize and manage user presence, including lease expiry sweeping,
 * stale record filtering, abrupt disconnect cleanup, and reconnect recovery.
 * Should be used at app-level in an authenticated context.
 */
export function usePresenceManagement(options: PresenceManagementOptions = {}) {
  const dispatch = useAppDispatch();
  const { emit, on, off, connectionState } = useSocket();
  const { user } = useAppSelector((state) => state.auth);
  const leaseTimeout = options.leaseTimeout ?? DEFAULT_LEASE_TIMEOUT_MS;
  const sweepInterval = options.sweepInterval ?? DEFAULT_SWEEP_INTERVAL_MS;

  const hasAnnouncedRef = useRef(false);
  const prevConnectionStateRef = useRef<SocketConnectionState | undefined>(undefined);

  // Register socket listeners, stale-lease sweep timer, and abrupt unload cleanup
  useEffect(() => {
    if (!user) return;

    const handleUserJoin = (...args: unknown[]) => {
      const [payload] = args;
      if (!isUserPresencePayload(payload)) return;

      const accepted = presenceService.upsertRemotePresence(payload, { leaseTimeout });
      if (accepted) {
        dispatch(addOrUpdatePresence(accepted));
      } else {
        dispatch(removePresence(payload.userId));
      }
    };

    const handleStatusChange = (...args: unknown[]) => {
      const [payload] = args;
      if (!isUserPresencePayload(payload)) return;

      const accepted = presenceService.upsertRemotePresence(payload, { leaseTimeout });
      if (accepted) {
        dispatch(addOrUpdatePresence(accepted));
      } else {
        dispatch(removePresence(payload.userId));
      }
    };

    const handleHeartbeat = (...args: unknown[]) => {
      const [payload] = args;
      if (!isHeartbeatPayload(payload)) return;

      const wasTracked = Boolean(presenceService.getPresence(payload.userId));
      const updated = presenceService.recordHeartbeat(payload, { leaseTimeout });
      if (updated) {
        dispatch(addOrUpdatePresence(updated));
      } else if (wasTracked) {
        dispatch(removePresence(payload.userId));
      } else if (isUserPresencePayload(payload)) {
        const accepted = presenceService.upsertRemotePresence(payload, { leaseTimeout });
        if (accepted) {
          dispatch(addOrUpdatePresence(accepted));
        }
      }
    };

    const handleUserLeave = (...args: unknown[]) => {
      const userId = extractLeaveUserId(args[0]);
      if (!userId) return;
      presenceService.setUserOffline(userId);
      dispatch(removePresence(userId));
    };

    const handlePresenceList = (...args: unknown[]) => {
      const normalized = normalizePresenceListPayload(args[0]);
      if (!normalized) return;

      const activeUsers = presenceService.replaceRemotePresences(normalized, {
        leaseTimeout,
      });
      dispatch(setPresenceBatch(activeUsers));
    };

    const handleReconnect = () => {
      emit('presence:join', {
        userId: user.id,
        userName: user.name,
      });
      hasAnnouncedRef.current = true;
    };

    const handleAbruptUnload = () => {
      emit('presence:leave', { userId: user.id });
    };

    on('presence:join', handleUserJoin);
    on('presence:status_change', handleStatusChange);
    on('presence:heartbeat', handleHeartbeat);
    on('presence:leave', handleUserLeave);
    on('presence:list', handlePresenceList);
    on('reconnect', handleReconnect);

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handleAbruptUnload);
      window.addEventListener('beforeunload', handleAbruptUnload);
    }

    const sweepTimer = setInterval(() => {
      const expiredUserIds = presenceService.pruneExpired();
      if (expiredUserIds.length > 0) {
        dispatch(removePresences(expiredUserIds));
      }
    }, sweepInterval);

    return () => {
      off('presence:join', handleUserJoin);
      off('presence:status_change', handleStatusChange);
      off('presence:heartbeat', handleHeartbeat);
      off('presence:leave', handleUserLeave);
      off('presence:list', handlePresenceList);
      off('reconnect', handleReconnect);

      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', handleAbruptUnload);
        window.removeEventListener('beforeunload', handleAbruptUnload);
      }

      clearInterval(sweepTimer);
      hasAnnouncedRef.current = false;
      emit('presence:leave', { userId: user.id });
      presenceService.clear();
      dispatch(clearPresence());
    };
  }, [user, emit, on, off, dispatch, leaseTimeout, sweepInterval]);

  // Coordinate presence join/re-join and stale-state recovery across socket lifecycle transitions
  useEffect(() => {
    if (!user) {
      hasAnnouncedRef.current = false;
      prevConnectionStateRef.current = connectionState;
      return;
    }

    const effectiveState: SocketConnectionState = connectionState ?? 'connected';
    const prevState = prevConnectionStateRef.current;

    if (effectiveState === 'connected') {
      if (!hasAnnouncedRef.current || prevState !== 'connected') {
        emit('presence:join', {
          userId: user.id,
          userName: user.name,
        });
        hasAnnouncedRef.current = true;
      }
    } else if (effectiveState === 'disconnected' || effectiveState === 'exhausted') {
      hasAnnouncedRef.current = false;
      presenceService.clear();
      dispatch(clearPresence());
    } else if (effectiveState === 'reconnecting' || effectiveState === 'connecting') {
      hasAnnouncedRef.current = false;
    }

    prevConnectionStateRef.current = effectiveState;
  }, [user, connectionState, emit, dispatch]);
}

/**
 * Hook to track user activity and keep presence alive
 */
export function useActivityPresenceTracking(enabled: boolean = true) {
  const { user } = useAppSelector((state) => state.auth);
  const { emit, isConnected } = useSocket();
  const socketReady = isConnected ?? true;

  useEffect(() => {
    if (!enabled || !user || !socketReady) return;

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
  }, [enabled, user, emit, socketReady]);
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
  const online = useAppSelector((state) => state.presence.onlineCount);
  const away = useAppSelector((state) => state.presence.awayCount);
  return { online, away };
}
